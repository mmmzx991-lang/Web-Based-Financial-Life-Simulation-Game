import {
  MODES,
  DIFFICULTIES,
  RULESETS,
  ASSETS,
  PROPERTY_TYPES,
  BUSINESS_TYPES,
  SETTINGS,
} from "./config.js";
import { hash } from "./market.js";
import {
  holdingValue,
  quantityFromUnits,
  quantityScale,
  quantityUnits,
} from "./quantities.js";
import {
  demand,
  emptyLedger,
  fee,
  money,
  nextId,
  positionEquity,
  snapshot,
  usable,
} from "./finance.js";
import {
  extendBill,
  finishPending,
  payBill,
  recordExpense,
  runRemaining,
} from "./monthly.js";
export { report } from "./finance.js";

const own = (map, key) => typeof key === "string" && Object.hasOwn(map, key);
function clone(state) {
  usable(state);
  return structuredClone(state);
}
function cashCost(game, amount) {
  demand(game.cash >= amount, "Insufficient cash");
  game.cash -= amount;
}
function find(items, id, label) {
  const found = items.find((x) => x.id === id);
  demand(found, `Unknown ${label}`);
  return found;
}

export function createGame({
  mode = "full-life",
  difficulty = "normal",
  ruleset = "standard",
  seed,
} = {}) {
  demand(own(MODES, mode), "Invalid life mode");
  demand(own(DIFFICULTIES, difficulty), "Invalid difficulty");
  demand(RULESETS.includes(ruleset), "Invalid ruleset");
  const [start, end] = MODES[mode],
    opening = DIFFICULTIES[difficulty];
  if (seed !== undefined)
    demand(
      Number.isSafeInteger(seed) && seed >= 0 && seed <= 4294967295,
      "Invalid seed",
    );
  const game = {
    version: 2,
    marketVersion: 3,
    mode,
    difficulty,
    ruleset,
    ageMonths: start * 12,
    startAgeMonths: start * 12,
    endAgeMonths: end * 12,
    elapsedMonths: 0,
    status: "active",
    cash: opening[`cash${start}`],
    savings: 0,
    retirementBalance: 0,
    monthlySalary:
      start >= 60 ? 0 : Math.round(opening.salary22 * 1.025 ** (start - 22)),
    prices: Object.fromEntries(ASSETS.map((a) => [a.id, a.initialPrice])),
    previousPrices: Object.fromEntries(
      ASSETS.map((a) => [a.id, a.initialPrice]),
    ),
    holdings: {},
    positions: [],
    properties: [],
    businesses: [],
    loans: [],
    history: [],
    priceIndex: 1,
    inflationRate: 0,
    economy: "expansion",
    news: [],
    unpaidBill: null,
    pendingEvent: null,
    pendingSettlement: null,
    remainingAdvance: 0,
    marketMonth: 0,
    nextId: 0,
    scenarioSeed: hash(
      `${mode}|${difficulty}|${ruleset === "standard" ? "standard-v3" : (seed ?? Date.now())}`,
    ),
    actionLedger: emptyLedger(),
    stats: {
      forcedLiquidations: 0,
      unpaidMonths: 0,
      latePayments: 0,
      defaults: 0,
    },
    milestone: false,
  };
  for (const type of opening[`properties${start}`] || []) {
    game.properties.push({
      id: nextId(game, "property"),
      type,
      value: PROPERTY_TYPES[type].value,
      occupied: true,
      loanId: null,
      salePending: false,
      vacantSince: null,
      leaseStartsMonth: 0,
    });
  }
  if (start === 60 && opening.mortgage60) {
    const loan = {
      id: nextId(game, "loan"),
      principal: opening.mortgage60,
      annualRate: 0.045,
      remainingMonths: 240,
      kind: "mortgage",
      propertyId: game.properties[0].id,
    };
    game.properties[0].loanId = loan.id;
    game.loans.push(loan);
  }
  game.baseline = {
    cash: game.cash,
    monthlySalary: game.monthlySalary,
    properties: structuredClone(game.properties),
    loans: structuredClone(game.loans),
  };
  game.history.push(snapshot(game));
  return game;
}

export function advance(state, months) {
  demand(months === 1 || months === 3, "Advance must be 1 or 3 months");
  const game = clone(state);
  demand(
    game.status === "active" &&
      !game.pendingSettlement &&
      !game.pendingEvent &&
      !game.unpaidBill &&
      !game.remainingAdvance,
    "Game paused; resolve bill or event and resume",
  );
  game.remainingAdvance = Math.min(months, game.endAgeMonths - game.ageMonths);
  return runRemaining(game);
}

export function trade(state, { assetId, side, quantity, leverage = 1 } = {}) {
  const game = clone(state),
    asset = ASSETS.find((a) => a.id === assetId);
  demand(asset, "Unknown asset");
  demand(side === "buy" || side === "sell", "Invalid order side");
  const scale = quantityScale(assetId),
    scaledQuantity = quantity * scale,
    units = quantityUnits(assetId, quantity);
  demand(
    Number.isFinite(quantity) &&
      quantity > 0 &&
      quantity <= 100000000 &&
      Number.isSafeInteger(units) &&
      units > 0 &&
      (scale === 1
        ? Number.isSafeInteger(quantity)
        : Math.abs(scaledQuantity - units) <=
          Number.EPSILON * Math.max(1, Math.abs(scaledQuantity)) * 4),
    scale === 100
      ? "Quantity must be positive in steps of 0.01"
      : "Quantity must be a positive integer",
  );
  quantity = quantityFromUnits(assetId, units);
  demand(
    Number.isInteger(leverage) &&
      leverage >= 1 &&
      leverage <= asset.maxLeverage,
    "Invalid leverage",
  );
  demand(
    side === "buy" || leverage === 1,
    "Use close-position for leveraged sales",
  );
  const exposure = holdingValue(assetId, quantity, game.prices[assetId]);
  demand(
    Number.isSafeInteger(exposure) && exposure <= SETTINGS.maximumAmount,
    "Order too large",
  );
  demand(exposure > 0, "Order too small; value must be at least one sen");
  const cost = fee(exposure);
  if (side === "buy") {
    // A paused run permits raising funds; it cannot add new investment risk.
    demand(
      !game.unpaidBill && !game.pendingSettlement && !game.pendingEvent,
      "Resolve paused event or bill before buying",
    );
    const margin = Math.max(1, Math.round(exposure / leverage));
    cashCost(game, margin + cost);
    recordExpense(game, cost);
    if (leverage > 1)
      game.positions.push({
        id: nextId(game, "position"),
        assetId,
        quantity,
        leverage,
        margin,
        entryPrice: game.prices[assetId],
        openedMonth: game.marketMonth,
        lockedUntilMonth: game.marketMonth + 1,
      });
    else {
      const h = game.holdings[assetId] || {
        quantity: 0,
        lockedQuantity: 0,
        averageCost: 0,
      };
      const totalUnits = quantityUnits(assetId, h.quantity) + units,
        lockedUnits = quantityUnits(assetId, h.lockedQuantity) + units;
      demand(
        Number.isSafeInteger(totalUnits) && Number.isSafeInteger(lockedUnits),
        "Quantity too large",
      );
      const totalQuantity = quantityFromUnits(assetId, totalUnits);
      h.averageCost = Math.round(
        (h.quantity * h.averageCost + exposure) / totalQuantity,
      );
      h.quantity = totalQuantity;
      h.lockedQuantity = quantityFromUnits(assetId, lockedUnits);
      game.holdings[assetId] = h;
    }
  } else {
    const h = game.holdings[assetId];
    demand(
      h &&
        quantityUnits(assetId, h.quantity) -
          quantityUnits(assetId, h.lockedQuantity) >=
          units,
      "Insufficient eligible holdings; new holdings are locked",
    );
    game.cash += exposure - cost;
    recordExpense(game, cost);
    h.quantity = quantityFromUnits(
      assetId,
      quantityUnits(assetId, h.quantity) - units,
    );
    if (!h.quantity) delete game.holdings[assetId];
  }
  return game;
}

export function act(state, action = {}) {
  demand(
    action && typeof action === "object" && !Array.isArray(action),
    "Invalid action",
  );
  if (action.type === "advance") return advance(state, action.months);
  if (action.type === "trade") return trade(state, action);
  const game = clone(state);
  switch (action.type) {
    case "resume": {
      demand(!game.pendingEvent, "Acknowledge event first");
      if (game.pendingSettlement) {
        demand(
          game.unpaidBill && game.cash >= game.unpaidBill.amount,
          "Pay or extend unpaid bill before resuming",
        );
        payBill(game);
        if (!game.remainingAdvance || game.status === "completed") return game;
      }
      demand(
        !game.unpaidBill || game.unpaidBill.extended,
        "Pay or extend unpaid bill before resuming",
      );
      demand(
        game.remainingAdvance > 0 || game.unpaidBill?.extended,
        "No pending advance",
      );
      game.remainingAdvance = Math.max(
        game.remainingAdvance,
        game.unpaidBill ? 1 : 0,
      );
      game.status = "active";
      return runRemaining(game);
    }
    case "acknowledge-event":
      demand(game.pendingEvent, "No event to acknowledge");
      game.pendingEvent = null;
      if (!game.pendingSettlement && !game.unpaidBill) {
        game.status = "active";
        return runRemaining(game);
      }
      return game;
    case "pay-bill":
      payBill(game);
      return game;
    case "extend-bill":
      extendBill(game);
      return game;
    case "declare-bankruptcy":
      demand(game.unpaidBill, "Bankruptcy requires an unpaid bill");
      demand(
        game.pendingSettlement,
        "Resume the next pending settlement before declaring bankruptcy",
      );
      game.status = "bankrupt";
      game.stats.defaults++;
      finishPending(game);
      return game;
    case "savings-deposit": {
      const amount = money(action.amount);
      cashCost(game, amount);
      game.savings += amount;
      return game;
    }
    case "savings-withdraw": {
      const amount = money(action.amount);
      demand(game.savings >= amount, "Insufficient savings");
      game.savings -= amount;
      game.cash += amount;
      return game;
    }
    case "retirement-deposit": {
      const amount = money(action.amount);
      cashCost(game, amount);
      game.retirementBalance += amount;
      return game;
    }
    case "retirement-withdraw": {
      const amount = money(action.amount);
      demand(game.ageMonths >= 720, "Retirement withdrawals begin at age 60");
      demand(
        game.retirementBalance >= amount,
        "Insufficient retirement balance",
      );
      game.retirementBalance -= amount;
      game.cash += amount;
      return game;
    }
    case "take-loan": {
      const amount = money(action.amount);
      demand(SETTINGS.loanTerms.includes(action.term), "Invalid loan term");
      demand(
        game.loans
          .filter((l) => l.kind === "personal")
          .reduce((s, l) => s + l.principal, 0) +
          amount <=
          SETTINGS.personalLoanLimit,
        "Personal loan limit exceeded",
      );
      game.loans.push({
        id: nextId(game, "loan"),
        principal: amount,
        annualRate: SETTINGS.personalLoanRate,
        remainingMonths: action.term,
        kind: "personal",
      });
      game.cash += amount;
      return game;
    }
    case "repay-loan": {
      const loan = find(game.loans, action.loanId, "loan");
      cashCost(game, loan.principal);
      game.loans = game.loans.filter((l) => l.id !== loan.id);
      for (const p of game.properties)
        if (p.loanId === loan.id) p.loanId = null;
      return game;
    }
    case "close-position": {
      const p = find(game.positions, action.positionId, "position");
      demand(
        game.marketMonth >= p.lockedUntilMonth,
        "Position is locked until next month",
      );
      const equity = positionEquity(game, p),
        cost = Math.min(
          equity,
          fee(holdingValue(p.assetId, p.quantity, game.prices[p.assetId])),
        );
      game.cash += equity - cost;
      recordExpense(game, cost);
      game.positions = game.positions.filter((x) => x.id !== p.id);
      return game;
    }
    case "buy-property": {
      demand(
        !game.pendingEvent && !game.unpaidBill,
        "Resolve paused event or bill before buying",
      );
      demand(own(PROPERTY_TYPES, action.propertyType), "Unknown property type");
      demand(
        typeof action.financing === "boolean",
        "Financing must be true or false",
      );
      const config = PROPERTY_TYPES[action.propertyType],
        principal = action.financing
          ? Math.round(config.value * (1 - config.downPayment))
          : 0;
      cashCost(game, config.value - principal);
      const property = {
        id: nextId(game, "property"),
        type: action.propertyType,
        value: config.value,
        occupied: false,
        vacantSince: game.marketMonth,
        leaseStartsMonth: null,
        loanId: null,
        salePending: false,
      };
      if (principal) {
        const loan = {
          id: nextId(game, "loan"),
          principal,
          annualRate: config.annualRate,
          remainingMonths: config.term,
          kind: "mortgage",
          propertyId: property.id,
        };
        property.loanId = loan.id;
        game.loans.push(loan);
      }
      game.properties.push(property);
      return game;
    }
    case "sell-property": {
      const p = find(game.properties, action.propertyId, "property");
      demand(!p.salePending, "Property sale already pending");
      p.salePending = true;
      p.saleMonth = game.marketMonth + 1;
      return game;
    }
    case "start-business": {
      demand(
        !game.pendingEvent && !game.unpaidBill,
        "Resolve paused event or bill before buying",
      );
      demand(own(BUSINESS_TYPES, action.businessType), "Unknown business type");
      const config = BUSINESS_TYPES[action.businessType];
      cashCost(game, config.cost);
      game.businesses.push({
        id: nextId(game, "business"),
        type: action.businessType,
        cash: 0,
        value: config.baseValue,
        baseValue: config.baseValue,
        level: 1,
        activeLevel: 1,
        advertisingUntil: 0,
        salePending: false,
        lastRevenue: 0,
        lastOperatingCost: 0,
        lastProfit: 0,
      });
      return game;
    }
    case "business-dividend": {
      const b = find(game.businesses, action.businessId, "business"),
        amount = money(action.amount);
      demand(!b.salePending, "Business sale pending");
      demand(b.cash >= amount, "Insufficient business cash");
      b.cash -= amount;
      b.value = b.baseValue + b.cash;
      game.cash += amount;
      return game;
    }
    case "business-advertise": {
      const b = find(game.businesses, action.businessId, "business");
      demand(!b.salePending, "Business sale pending");
      demand(
        b.advertisingUntil <= game.marketMonth,
        "Advertising already active",
      );
      const cost = BUSINESS_TYPES[b.type].advertisingCost;
      cashCost(game, cost);
      recordExpense(game, cost);
      b.advertisingUntil = game.marketMonth + 3;
      return game;
    }
    case "business-upgrade": {
      const b = find(game.businesses, action.businessId, "business");
      demand(!b.salePending, "Business sale pending");
      demand(b.level < 5 && !b.upgradeMonth, "Upgrade unavailable");
      const cost = BUSINESS_TYPES[b.type].upgradeCost * b.level;
      cashCost(game, cost);
      b.baseValue += cost;
      b.value += cost;
      b.level++;
      b.upgradeMonth = game.marketMonth + 1;
      return game;
    }
    case "sell-business": {
      const b = find(game.businesses, action.businessId, "business");
      demand(!b.salePending, "Business sale already pending");
      b.salePending = true;
      b.saleMonth = game.marketMonth + 1;
      return game;
    }
    default:
      throw new Error("Unknown action");
  }
}
