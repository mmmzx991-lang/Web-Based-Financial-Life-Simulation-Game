import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  trade,
  act,
  report,
} from "../server/core/simulation.js";
import { ASSETS } from "../server/core/config.js";
import { NEWS_TEMPLATES } from "../server/core/news.js";

test("60 unique bilingual prepared news templates", () => {
  assert.equal(NEWS_TEMPLATES.length, 60);
  assert.equal(new Set(NEWS_TEMPLATES.map((n) => n.id)).size, 60);
  assert.ok(
    NEWS_TEMPLATES.every(
      (n) => n.title.en && n.title.zh && n.body.en && n.body.zh,
    ),
  );
});
test("bank transfers conserve wealth and do not create income", () => {
  let game = createGame({ difficulty: "easy" });
  const worth = report(game).netWorth;
  for (const [type, amount] of [
    ["savings-deposit", 100000],
    ["savings-withdraw", 50000],
    ["retirement-deposit", 200000],
  ])
    game = act(game, { type, amount });
  assert.equal(report(game).netWorth, worth);
  assert.equal(report(game).totalIncome, 0);
  assert.throws(
    () => act(game, { type: "retirement-withdraw", amount: 10000 }),
    /60|retire/i,
  );
  game.ageMonths = 720;
  game = act(game, { type: "retirement-withdraw", amount: 10000 });
  assert.equal(report(game).netWorth, worth);
  assert.equal(report(game).totalIncome, 0);
});
test("fixed loans neutral at issue; principal is transfer, interest expense", () => {
  let game = createGame({ difficulty: "easy" });
  const worth = report(game).netWorth;
  game = act(game, { type: "take-loan", amount: 1200000, term: 12 });
  assert.equal(report(game).netWorth, worth);
  const principal = game.loans[0].principal;
  game = advance(game, 1);
  assert.ok(game.loans[0].principal < principal);
  assert.equal(game.loans[0].remainingMonths, 11);
  const row = game.history.at(-1);
  assert.ok(row.loanPrincipal > 0);
  assert.ok(row.loanInterest > 0);
  assert.equal(row.expenses, row.livingCost + row.loanInterest);
  const before = report(game).netWorth;
  game = act(game, { type: "repay-loan", loanId: game.loans[0].id });
  assert.equal(report(game).netWorth, before);
  assert.equal(game.loans.length, 0);
});
test("leveraged positions count margin equity once and enforce cap/lock", () => {
  const original = createGame({ difficulty: "easy" }),
    asset = ASSETS[0];
  let game = trade(original, {
    assetId: asset.id,
    side: "buy",
    quantity: 10,
    leverage: 2,
  });
  const pos = game.positions[0];
  assert.equal(pos.margin, Math.round((asset.initialPrice * 10) / 2));
  assert.equal(report(game).portfolioValue, pos.margin);
  assert.equal(report(game).liabilities, 0);
  assert.throws(
    () => act(game, { type: "close-position", positionId: pos.id }),
    /locked/i,
  );
  assert.throws(() =>
    trade(original, {
      assetId: asset.id,
      side: "buy",
      quantity: 1,
      leverage: 3,
    }),
  );
  game = advance(game, 1);
  game = act(game, { type: "close-position", positionId: pos.id });
  assert.equal(game.positions.length, 0);
});
test("liquidation caps loss at margin without debt", () => {
  let game = trade(createGame({ difficulty: "easy" }), {
    assetId: ASSETS[0].id,
    side: "buy",
    quantity: 10,
    leverage: 2,
  });
  const cash = game.cash;
  game.positions[0].entryPrice *= 100;
  game = advance(game, 1);
  assert.equal(game.positions.length, 0);
  assert.equal(report(game).forcedLiquidations, 1);
  assert.equal(report(game).liabilities, 0);
  assert.ok(game.cash >= cash);
});
test("property financing counted once and sale settles next month without rent", () => {
  let game = createGame({ difficulty: "easy" });
  game.cash = 100000000;
  const worth = report(game).netWorth;
  game = act(game, {
    type: "buy-property",
    propertyType: "apartment",
    financing: true,
  });
  const property = game.properties[0];
  assert.equal(property.value, 25000000);
  assert.equal(game.loans[0].principal, 20000000);
  assert.equal(report(game).netWorth, worth);
  game = act(game, { type: "sell-property", propertyId: property.id });
  const cash = game.cash;
  assert.equal(game.properties.length, 1);
  game = advance(game, 1);
  assert.equal(game.properties.length, 0);
  assert.equal(game.loans.length, 0);
  assert.equal(game.history.at(-1).rent, 0);
  assert.ok(game.cash > cash);
});
test("tenant search and rent have distinct following-month timing", () => {
  let game = createGame({ mode: "wealth-building", difficulty: "normal" });
  game.properties[0].occupied = false;
  game.properties[0].vacantSince = 0;
  game.properties[0].tenantSearchProbability = 1;
  game.properties[0].vacancyProbability = 0;
  game = advance(game, 1);
  assert.equal(game.history.at(-1).rent, 0);
  assert.equal(game.properties[0].occupied, true);
  assert.equal(game.properties[0].leaseStartsMonth, 2);
  game = advance(game, 1);
  assert.equal(game.history.at(-1).rent, game.properties[0].monthlyRent);
  assert.ok(game.history.at(-1).rent > 0);
});
test("business retained cash/dividends/upgrades/sale use separate balances", () => {
  let game = createGame({ difficulty: "easy" });
  const worth = report(game).netWorth;
  game = act(game, { type: "start-business", businessType: "coffee-shop" });
  assert.equal(report(game).netWorth, worth);
  game = advance(game, 1);
  const business = game.businesses[0];
  assert.ok(business.cash > 0);
  const before = report(game).netWorth,
    totalIncome = report(game).totalIncome;
  game = act(game, {
    type: "business-dividend",
    businessId: business.id,
    amount: business.cash,
  });
  assert.equal(report(game).netWorth, before);
  assert.equal(report(game).totalIncome, totalIncome);
  game = act(game, { type: "business-upgrade", businessId: business.id });
  assert.equal(game.businesses[0].level, 2);
  game = act(game, { type: "sell-business", businessId: business.id });
  const cash = game.cash;
  game = advance(game, 1);
  assert.equal(game.businesses.length, 0);
  assert.ok(game.cash > cash);
});
test("unpaid amount liability and retry-safe original month payment", () => {
  let game = createGame();
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 3);
  assert.equal(game.status, "paused");
  assert.equal(game.ageMonths, 264);
  assert.equal(game.unpaidBill.amount, 200000);
  assert.equal(report(game).liabilities, 200000);
  const prices = structuredClone(game.prices);
  assert.equal(game.history.length, 1);
  assert.throws(() => advance(game, 1), /pause|bill|resume/i);
  game = act(game, { type: "take-loan", amount: 1000000, term: 12 });
  game = act(game, { type: "pay-bill" });
  assert.equal(game.elapsedMonths, 1);
  assert.equal(game.history.length, 2);
  assert.deepEqual(game.prices, prices);
  assert.equal(game.remainingAdvance, 2);
  game = act(game, { type: "resume" });
  assert.equal(game.elapsedMonths, 3);
  assert.equal(
    new Set(game.history.map((h) => h.elapsedMonths)).size,
    game.history.length,
  );
});
test("single extension retains bill and failure ends with bankruptcy report", () => {
  let game = createGame();
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 1);
  const id = game.unpaidBill.id;
  game = act(game, { type: "extend-bill" });
  assert.equal(game.elapsedMonths, 1);
  assert.equal(game.unpaidBill.id, id);
  assert.equal(game.unpaidBill.extended, true);
  assert.throws(() => act(game, { type: "extend-bill" }));
  game = act(game, { type: "resume" });
  assert.equal(game.status, "bankrupt");
  assert.equal(game.elapsedMonths, 2);
  assert.equal(report(game).completed, false);
  assert.equal(report(game).bankrupt, true);
  assert.equal(game.history.length, 3);
  assert.ok(report(game).defaults >= 1);
});
test("sale listed while paused pays only next month after extension", () => {
  let game = createGame({ mode: "wealth-building", difficulty: "normal" });
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 1);
  assert.equal(game.status, "paused");
  game = act(game, {
    type: "sell-property",
    propertyId: game.properties[0].id,
  });
  assert.equal(game.cash, 0);
  game = act(game, { type: "extend-bill" });
  game = act(game, { type: "resume" });
  assert.equal(game.properties.length, 0);
  assert.equal(game.unpaidBill, null);
  assert.notEqual(game.status, "bankrupt");
});
test("career acknowledgement pauses and resumes remaining months once", () => {
  let game = createGame({ difficulty: "easy" });
  for (let i = 0; i < 5; i++) game = advance(game, 1);
  game = advance(game, 3);
  assert.equal(game.elapsedMonths, 6);
  assert.equal(game.status, "paused");
  assert.ok(game.pendingEvent.title.en && game.pendingEvent.title.zh);
  assert.equal(game.remainingAdvance, 2);
  game = act(game, { type: "acknowledge-event" });
  assert.equal(game.elapsedMonths, 8);
  assert.equal(game.pendingEvent, null);
  assert.throws(() => act(game, { type: "acknowledge-event" }));
  assert.equal(
    advance(createGame({ mode: "retirement", difficulty: "easy" }), 3)
      .pendingEvent,
    null,
  );
});
test("real wealth, conservative benchmark and exact score formulas", () => {
  const game = advance(createGame({ difficulty: "easy" }), 3),
    r = report(game);
  assert.equal(r.realNetWorth, Math.round(r.netWorth / game.priceIndex));
  assert.equal(r.realBenchmark, Math.round(r.benchmark / game.priceIndex));
  assert.ok(r.benchmark > r.netWorth);
  assert.equal(
    r.score.wealth,
    50 +
      25 *
        Math.log(
          (Math.max(r.realNetWorth, 0) + 1000000) /
            (Math.max(r.realBenchmark, 0) + 1000000),
        ),
  );
  assert.equal(r.score.total, r.score.wealth * 0.6 + 40);
  assert.equal(r.score.risk, 100);
  assert.equal(r.score.cashFlow, 100);
  assert.equal(r.score.debt, 100);
  assert.equal(
    r.totalIncome,
    game.history.reduce((s, h) => s + h.income, 0),
  );
  assert.equal(
    r.totalExpenses,
    game.history.reduce((s, h) => s + h.expenses, 0),
  );
});
