import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  act,
  report,
  trade,
} from "../server/core/simulation.js";
import { ASSETS, MODES } from "../server/core/config.js";

test("bankruptcy after an extension requires the next settlement so later expenses enter final history", () => {
  let game = createGame({ mode: "retirement", difficulty: "normal" });
  game = act(game, { type: "start-business", businessType: "tech-startup" });
  game = act(game, { type: "savings-deposit", amount: game.cash });
  game = advance(game, 1);
  assert.ok(game.unpaidBill.amount > 0);
  assert.equal(
    game.unpaidBill.amount,
    game.pendingSettlement.ledger.billTotal -
      game.pendingSettlement.ledger.billPaid,
  );
  game = act(game, { type: "extend-bill" });
  const closed = structuredClone(game.history);
  game = act(game, { type: "savings-withdraw", amount: 70000 });
  game = act(game, {
    type: "business-advertise",
    businessId: game.businesses[0].id,
  });
  assert.throws(
    () => act(game, { type: "declare-bankruptcy" }),
    /resume|pending settlement/i,
  );
  assert.deepEqual(game.history, closed);
  game = act(game, { type: "resume" });
  assert.equal(game.status, "bankrupt");
  assert.equal(game.elapsedMonths, 2);
  assert.equal(report(game).netWorth, game.history.at(-1).netWorth);
  assert.equal(game.history.at(-1).fees, 70000);
  assert.equal(
    game.history.at(-1).expenses,
    game.history.at(-1).livingCost +
      game.history.at(-1).maintenance +
      game.history.at(-1).businessCosts +
      70000,
  );
  assert.equal(
    report(game).totalExpenses,
    game.history.reduce((s, h) => s + h.expenses, 0),
  );
  assert.deepEqual(game.history.slice(0, -1), closed);
});
test("manual bankruptcy still finalizes an actually pending failure month", () => {
  let game = createGame({ mode: "retirement", difficulty: "normal" });
  game = act(game, { type: "savings-deposit", amount: game.cash });
  game = advance(game, 1);
  assert.ok(game.pendingSettlement);
  game = act(game, { type: "declare-bankruptcy" });
  assert.equal(game.status, "bankrupt");
  assert.equal(game.elapsedMonths, 1);
  assert.equal(game.history.at(-1).netWorth, report(game).netWorth);
});
test("business actual monthly figures match the single-business settlement ledger", () => {
  let game = act(createGame({ difficulty: "easy" }), {
    type: "start-business",
    businessType: "coffee-shop",
  });
  assert.equal(game.businesses[0].lastRevenue, 0);
  assert.equal(game.businesses[0].lastOperatingCost, 0);
  assert.equal(game.businesses[0].lastProfit, 0);
  game = advance(game, 1);
  const b = game.businesses[0],
    ledger = game.history.at(-1);
  assert.equal(b.lastRevenue, ledger.businessRevenue);
  assert.equal(b.lastOperatingCost, ledger.businessCosts);
  assert.equal(b.lastProfit, b.lastRevenue - b.lastOperatingCost);
  assert.equal(b.cash, b.lastProfit);
  game = advance(game, 1);
  assert.equal(
    game.businesses[0].lastRevenue,
    game.history.at(-1).businessRevenue,
  );
});

test("resume can finish the final pending single month directly after raising cash", () => {
  let game = createGame();
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 1);
  game = act(game, { type: "take-loan", amount: 1000000, term: 12 });
  game = act(game, { type: "resume" });
  assert.equal(game.elapsedMonths, 1);
  assert.equal(game.remainingAdvance, 0);
  assert.equal(game.unpaidBill, null);
  assert.equal(game.status, "active");
});
test("each monthly bill has a unique recorded id even when an extension carries the previous bill", () => {
  let game = createGame();
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 1);
  game = act(game, { type: "extend-bill" });
  game = act(game, { type: "resume" });
  assert.equal(new Set(game.history.slice(1).map((h) => h.billId)).size, 2);
  assert.equal(game.history[1].billTotal, 200000);
  assert.equal(game.history[2].billTotal, 200000);
});
test("loan principal moves into unpaid liability without being counted twice", () => {
  let game = createGame();
  game = act(game, { type: "take-loan", amount: 1200000, term: 12 });
  game.cash = 0;
  game.monthlySalary = 0;
  const before = report(game).netWorth;
  game = advance(game, 1);
  const r = report(game),
    ledger = game.pendingSettlement.ledger;
  assert.equal(r.netWorth, before - ledger.livingCost - ledger.loanInterest);
  assert.equal(
    r.liabilities,
    1200000 + ledger.livingCost + ledger.loanInterest,
  );
});
test("birthday finalization charges exactly one month and preserves pending sale assets", () => {
  let game = createGame({ mode: "wealth-building", difficulty: "easy" });
  game.ageMonths = 719;
  const property = game.properties[0];
  game = act(game, { type: "sell-property", propertyId: property.id });
  game.properties[0].saleMonth = 2;
  const cash = game.cash;
  game = advance(game, 3);
  assert.equal(game.properties.length, 2);
  assert.equal(game.status, "completed");
  assert.equal(game.history.length, 2);
  assert.equal(game.history.at(-1).salary, Math.round(500000 * 1.025 ** 23));
  assert.ok(game.cash > cash);
});
test("partial settlement save roundtrip preserves market, loan invoice and income exactly once", () => {
  let game = createGame();
  game = act(game, { type: "take-loan", amount: 1200000, term: 12 });
  game.cash = 0;
  game.monthlySalary = 0;
  game = advance(game, 3);
  const paused = JSON.parse(JSON.stringify(game)),
    loanPrincipal = paused.loans[0].principal,
    market = paused.marketMonth;
  game = act(paused, { type: "take-loan", amount: 3000000, term: 12 });
  game = act(game, { type: "pay-bill" });
  assert.equal(game.loans[0].principal, loanPrincipal);
  assert.equal(game.marketMonth, market);
  assert.equal(game.elapsedMonths, 1);
  assert.deepEqual(paused, JSON.parse(JSON.stringify(paused)));
});
test("older holdings can be sold while current-month purchases stay locked", () => {
  const asset = ASSETS[0].id;
  let game = trade(createGame(), { assetId: asset, side: "buy", quantity: 2 });
  game = advance(game, 1);
  game = trade(game, { assetId: asset, side: "buy", quantity: 3 });
  game = trade(game, { assetId: asset, side: "sell", quantity: 2 });
  assert.equal(game.holdings[asset].quantity, 3);
  assert.equal(game.holdings[asset].lockedQuantity, 3);
  assert.throws(() =>
    trade(game, { assetId: asset, side: "sell", quantity: 1 }),
  );
});
test("all easy life modes reach their full endpoint with an append-only monthly ledger", () => {
  for (const [mode, [start, end]] of Object.entries(MODES)) {
    let game = createGame({ mode, difficulty: "easy" }),
      iterations = 0;
    while (
      game.status !== "completed" &&
      game.status !== "bankrupt" &&
      iterations++ < 1000
    ) {
      if (game.pendingEvent) game = act(game, { type: "acknowledge-event" });
      else if (game.unpaidBill) {
        if (game.savings >= game.unpaidBill.amount)
          game = act(game, {
            type: "savings-withdraw",
            amount: game.unpaidBill.amount,
          });
        else throw new Error(`Unexpected easy-mode unpaid bill: ${mode}`);
        game = act(game, { type: "pay-bill" });
      } else if (game.remainingAdvance) game = act(game, { type: "resume" });
      else game = advance(game, 3);
    }
    assert.equal(game.status, "completed");
    assert.equal(game.elapsedMonths, (end - start) * 12);
    assert.equal(game.history.length, game.elapsedMonths + 1);
    assert.equal(
      new Set(game.history.map((h) => h.elapsedMonths)).size,
      game.history.length,
    );
    assert.ok(
      game.history.every(
        (h) =>
          h.netWorth === h.assets - h.liabilities &&
          Number.isSafeInteger(h.netWorth),
      ),
    );
  }
});
