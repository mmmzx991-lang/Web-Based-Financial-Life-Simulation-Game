import {
  ASSETS,
  BUSINESS_TYPES,
  PROPERTY_TYPES,
  SETTINGS,
  livingCost,
} from "./config.js";
import { settleMarket, random } from "./market.js";
import {
  demand,
  emptyLedger,
  fee,
  loanDue,
  positionEquity,
  settleBaseline,
  snapshot,
  values,
} from "./finance.js";

export function recordExpense(game, amount) {
  const ledger = game.pendingSettlement?.ledger || game.actionLedger;
  ledger.expenses += amount;
  ledger.fees += amount;
}

function dueSales(game, ledger, target) {
  for (const p of game.properties.filter(
    (p) => p.salePending && p.saleMonth <= target,
  )) {
    const loan = game.loans.find((l) => l.id === p.loanId),
      cost = fee(p.value, SETTINGS.propertySaleFee);
    game.cash += p.value - cost - (loan?.principal || 0);
    ledger.expenses += cost;
    ledger.fees += cost;
    game.loans = game.loans.filter((l) => l.id !== p.loanId);
    game.properties = game.properties.filter((x) => x.id !== p.id);
    ledger.events.push({
      id: `sale-${p.id}-${target}`,
      type: "property-sale",
      amount: p.value - cost,
    });
  }
  for (const b of game.businesses.filter(
    (b) => b.salePending && b.saleMonth <= target,
  )) {
    const cost = fee(b.value, SETTINGS.businessSaleFee);
    game.cash += b.value - cost;
    ledger.expenses += cost;
    ledger.fees += cost;
    game.businesses = game.businesses.filter((x) => x.id !== b.id);
    ledger.events.push({
      id: `sale-${b.id}-${target}`,
      type: "business-sale",
      amount: b.value - cost,
    });
  }
}

function rentalIncome(game, ledger, target) {
  for (const property of game.properties) {
    const config = PROPERTY_TYPES[property.type];
    if (
      property.occupied &&
      target % 43 === 29 &&
      random(game.scenarioSeed, target, `vacancy-${property.id}`) < 0.45
    ) {
      property.occupied = false;
      property.vacantSince = target;
      property.leaseStartsMonth = null;
      ledger.events.push({
        id: `vacancy-${property.id}-${target}`,
        type: "vacancy",
        propertyId: property.id,
      });
    }
    if (
      property.occupied &&
      (!property.leaseStartsMonth || target >= property.leaseStartsMonth)
    )
      ledger.rent += config.rent;
    if (!property.occupied && target > (property.vacantSince ?? target)) {
      const chance =
        property.tenantSearchProbability ?? SETTINGS.tenantSearchProbability;
      if (random(game.scenarioSeed, target, `tenant-${property.id}`) < chance) {
        property.occupied = true;
        property.leaseStartsMonth = target + 1;
        ledger.events.push({
          id: `tenant-${property.id}-${target}`,
          type: "tenant-found",
          propertyId: property.id,
        });
      }
    }
    ledger.maintenance += config.maintenance;
  }
}

function businessIncome(game, ledger, target) {
  for (const b of game.businesses) {
    const config = BUSINESS_TYPES[b.type];
    if (b.upgradeMonth && target >= b.upgradeMonth) {
      b.activeLevel = b.level;
      b.upgradeMonth = null;
    }
    const growth = 1 + ((b.activeLevel || 1) - 1) * 0.22;
    const conditions = {
      expansion: 1.04,
      boom: 1.12,
      recession: 0.86,
      recovery: 1.02,
    }[game.economy];
    const advertising = b.advertisingUntil >= target ? 1.16 : 1;
    const revenue = Math.round(
      config.revenue *
        growth *
        conditions *
        advertising *
        (0.88 + random(game.scenarioSeed, target, `business-${b.id}`) * 0.24),
    );
    const costs = Math.round(
      config.operatingCost * (1 + ((b.activeLevel || 1) - 1) * 0.12),
    );
    b.lastRevenue = revenue;
    b.lastOperatingCost = costs;
    b.lastProfit = revenue - costs;
    b.cash += revenue - costs;
    // An operating deficit becomes an owner bill rather than invisible negative business cash.
    const ownerCost = Math.max(0, -b.cash);
    b.cash = Math.max(0, b.cash);
    ledger.businessRevenue += revenue;
    ledger.businessCosts += costs;
    ledger.ownerBusinessCost = (ledger.ownerBusinessCost || 0) + ownerCost;
    b.value = b.baseValue + b.cash;
  }
}

function career(game, ledger, target) {
  let multiplier = 1;
  if (game.ageMonths < 720) {
    if (target % 24 === 18) {
      ledger.bonus = Math.round(game.monthlySalary * 0.5);
      ledger.events.push({
        id: `bonus-${target}`,
        type: "career-bonus",
        amount: ledger.bonus,
      });
    }
    if (target % 60 === 6) {
      multiplier = 1.03;
      game.pendingEvent = {
        id: `career-${target}`,
        type: "career",
        title: { en: "Career development", zh: "职业发展" },
        body: {
          en: "Your training earned a 3% salary increase from next month. Review the change before continuing.",
          zh: "培训使你从下个月起加薪3%。请确认此变化后继续。",
        },
        effectApplied: true,
        salaryMultiplier: multiplier,
      };
      ledger.events.push(structuredClone(game.pendingEvent));
    }
  }
  return multiplier;
}

export function finishPending(game) {
  const pending = game.pendingSettlement;
  demand(pending, "No pending month");
  game.ageMonths++;
  game.elapsedMonths++;
  game.remainingAdvance = Math.max(0, game.remainingAdvance - 1);
  if (game.ageMonths >= 720) game.monthlySalary = 0;
  else if (game.ageMonths % 12 === 0)
    game.monthlySalary = Math.round(game.monthlySalary * 1.025);
  if (
    game.ageMonths === 540 &&
    Math.round(values(game).netWorth / game.priceIndex) >= 100000000
  )
    game.milestone = true;
  game.history.push(snapshot(game, pending.ledger));
  game.pendingSettlement = null;
  if (game.status === "bankrupt") {
    game.remainingAdvance = 0;
    game.pendingEvent = null;
  } else if (game.ageMonths >= game.endAgeMonths) {
    game.status = "completed";
    game.remainingAdvance = 0;
    game.pendingEvent = null;
  } else game.status = game.pendingEvent ? "paused" : "active";
}

function settleMonth(game) {
  const target = game.marketMonth + 1,
    ledger = game.actionLedger;
  game.actionLedger = emptyLedger();
  dueSales(game, ledger, target);
  settleMarket(game);
  for (const holding of Object.values(game.holdings))
    holding.lockedQuantity = 0;
  for (const position of [...game.positions]) {
    const equity = positionEquity(game, position);
    if (equity <= position.margin * SETTINGS.liquidationEquityRatio) {
      const cost = Math.min(equity, fee(equity));
      game.cash += equity - cost;
      ledger.fees += cost;
      ledger.expenses += cost;
      game.positions = game.positions.filter((p) => p.id !== position.id);
      game.stats.forcedLiquidations++;
      ledger.events.push({
        id: `liquidation-${position.id}-${target}`,
        type: "forced-liquidation",
        positionId: position.id,
        equity,
      });
    }
  }
  ledger.salary = game.ageMonths < 720 ? game.monthlySalary : 0;
  const multiplier = career(game, ledger, target);
  game.monthlySalary = Math.round(game.monthlySalary * multiplier);
  ledger.savingsInterest = Math.round(
    (game.savings * SETTINGS.savingsRate) / 12,
  );
  game.savings += ledger.savingsInterest;
  ledger.retirementInterest = Math.round(
    (game.retirementBalance * SETTINGS.retirementRate) / 12,
  );
  game.retirementBalance += ledger.retirementInterest;
  for (const asset of ASSETS)
    ledger.dividends += Math.round(
      ((game.holdings[asset.id]?.quantity || 0) *
        game.prices[asset.id] *
        asset.dividendYield) /
        12,
    );
  rentalIncome(game, ledger, target);
  businessIncome(game, ledger, target);
  game.cash += ledger.salary + ledger.bonus + ledger.rent + ledger.dividends;
  ledger.livingCost = livingCost(Math.floor(game.ageMonths / 12));
  let loanPayments = 0,
    dueLoanCount = 0;
  for (const loan of game.loans) {
    const due = loanDue(loan);
    loanPayments += due.total;
    ledger.loanInterest += due.interest;
    ledger.loanPrincipal += due.principal;
    dueLoanCount++;
  }
  game.loans = game.loans.filter((l) => l.principal > 0);
  ledger.income +=
    ledger.salary +
    ledger.bonus +
    ledger.rent +
    ledger.dividends +
    ledger.savingsInterest +
    ledger.retirementInterest +
    ledger.businessRevenue;
  ledger.expenses +=
    ledger.livingCost +
    ledger.maintenance +
    ledger.loanInterest +
    ledger.businessCosts;
  const due =
    ledger.livingCost +
    ledger.maintenance +
    loanPayments +
    (ledger.ownerBusinessCost || 0);
  const old = game.unpaidBill;
  const carried = old?.amount || 0;
  ledger.billId = `bill-${target}`;
  ledger.billTotal = due;
  ledger.carriedUnpaid = carried;
  const bill = old || {
    id: `bill-${target}`,
    amount: 0,
    createdMonth: target,
    extended: false,
    dueMonth: target,
  };
  bill.amount += due;
  const paid = Math.min(Math.max(0, game.cash), bill.amount);
  game.cash -= paid;
  bill.amount -= paid;
  ledger.billPaid = Math.min(due, Math.max(0, paid - carried));
  game.unpaidBill = bill.amount > 0 ? bill : null;
  game.pendingSettlement = { month: target, ledger };
  settleBaseline(game, ledger.bonus, multiplier);
  if (game.unpaidBill) {
    game.stats.unpaidMonths++;
    game.stats.latePayments += dueLoanCount;
    if (bill.extended && target >= bill.dueMonth) {
      game.status = "bankrupt";
      game.stats.defaults++;
      finishPending(game);
    } else game.status = "paused";
  } else finishPending(game);
}

export function runRemaining(game) {
  while (
    game.remainingAdvance > 0 &&
    game.status === "active" &&
    !game.pendingSettlement &&
    !game.pendingEvent
  )
    settleMonth(game);
  return game;
}
export function payBill(game) {
  demand(game.unpaidBill, "No unpaid bill");
  demand(game.cash >= game.unpaidBill.amount, "Insufficient cash to pay bill");
  if (game.pendingSettlement)
    game.pendingSettlement.ledger.billPaid += game.unpaidBill.amount;
  game.cash -= game.unpaidBill.amount;
  game.unpaidBill = null;
  if (game.pendingSettlement) finishPending(game);
  if (game.status !== "completed" && game.status !== "bankrupt")
    game.status =
      game.pendingEvent || game.remainingAdvance > 0 ? "paused" : "active";
}
export function extendBill(game) {
  demand(game.unpaidBill && game.pendingSettlement, "No unpaid bill to extend");
  demand(!game.unpaidBill.extended, "Bill extension already used");
  demand(
    game.ageMonths + 1 < game.endAgeMonths,
    "No extension beyond ending birthday",
  );
  game.unpaidBill.extended = true;
  game.unpaidBill.dueMonth = game.marketMonth + 1;
  game.unpaidBill.amount += SETTINGS.extensionFee;
  game.pendingSettlement.ledger.expenses += SETTINGS.extensionFee;
  game.pendingSettlement.ledger.fees += SETTINGS.extensionFee;
  finishPending(game);
  game.status = "paused";
  game.remainingAdvance = Math.max(1, game.remainingAdvance);
}
