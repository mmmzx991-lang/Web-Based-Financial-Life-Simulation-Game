import test from "node:test";
import assert from "node:assert/strict";
import { act, createGame, report } from "../server/core/simulation.js";
import { milestones, stage } from "../public/chapters.js";
import { MODES } from "../server/core/config.js";

const start = (extra = {}) =>
  createGame({ chaptersEnabled: true, difficulty: "easy", ...extra });
const buy = {
  type: "trade",
  assetId: "meridian-tech",
  side: "buy",
  quantity: 1,
};
function step(g, months = 1) {
  if (g.pendingEvent) return act(g, { type: "acknowledge-event" });
  if (g.unpaidBill) throw Error("unexpected unpaid bill");
  return act(g, { type: "advance", months });
}
test("fixed deposits preserve wealth, pay once at maturity, and forfeit interest on early exit", () => {
  const g = start(),
    initial = report(g).netWorth;
  let a = act(g, { type: "open-deposit", term: 3, amount: 120000 });
  assert.equal(report(a).netWorth, initial);
  assert.equal(a.cash, g.cash - 120000);
  const d = a.journey.deposits[0],
    redeemed = act(a, { type: "redeem-deposit", depositId: d.id });
  assert.equal(redeemed.cash, g.cash);
  assert.throws(() =>
    act(redeemed, { type: "redeem-deposit", depositId: d.id }),
  );
  let control = g;
  for (let i = 0; i < 3; i++) {
    a = step(a);
    control = step(control);
  }
  assert.equal(a.journey.deposits.length, 0);
  assert.equal(a.cash - control.cash, d.interest);
  assert.equal(
    a.history.at(-1).income - control.history.at(-1).income,
    d.interest,
  );
});
for (const mode of Object.keys(MODES)) {
  test(`${mode}: multi-month advances stop and resume at both stage boundaries`, () => {
    let g = start({ mode });
    g.cash = 2000000000;
    assert.equal(stage(g), 1);
    assert.throws(() => act(g, buy), /Chapter locked/);
    for (const { month, id } of milestones) {
      while (g.elapsedMonths < month - 1 || g.pendingEvent) g = step(g);
      g = step(g, 3);
      while (g.pendingEvent && !g.journey.notice) g = step(g);
      assert.equal(g.elapsedMonths, month);
      assert.equal(g.journey.carry, 2);
      assert.equal(g.journey.notice, id);
      assert.throws(() => act(g, { type: "continue-months" }), /Acknowledge/);
      const award = structuredClone(g.journey.results.at(-1));
      assert.equal(award.total, award.paid + award.reserve + award.goal);
      assert.ok(award.total >= 0 && award.total <= 100);
      g.journey.notice = null;
      assert.doesNotThrow(() => act(g, buy));
      if (month === 36)
        assert.throws(() => act(g, { ...buy, leverage: 2 }), /Chapter locked/);
      g = act(g, { type: "continue-months" });
      while (g.pendingEvent) g = step(g);
      assert.equal(g.elapsedMonths, month + 2);
      assert.deepEqual(g.journey.results.at(-1), award);
      assert.equal(g.journey.carry, 0);
    }
    assert.equal(stage(g), 3);
    assert.doesNotThrow(() => act(g, { ...buy, assetId: "bitcoin" }));
    assert.deepEqual(
      g.journey.results.map((r) => r.id),
      milestones.map((m) => m.id),
    );
  });
}

test("BTC and overall profit medals are earned on net realized gains and only once", () => {
  let g = start();
  g.elapsedMonths = 96;
  g.cash = 1000000000;
  g.prices.bitcoin = 1000000;
  const order = { ...buy, assetId: "bitcoin", quantity: 20 };
  g = act(g, order);
  assert.equal(g.journey.profit, undefined);
  g.holdings.bitcoin.lockedQuantity = 0;
  g.prices.bitcoin = 8000000;
  g = act(g, { ...order, side: "sell", quantity: 2 });
  assert.deepEqual(g.journey.achievements, ["btc-profit"]);
  assert.ok(g.journey.profit.btc < 14000000);
  g.journey.notice = null;
  g.journey.pendingMedals = [];
  g = act(g, { ...order, side: "sell", quantity: 18 });
  assert.deepEqual(g.journey.pendingMedals, ["million-profit"]);
  assert.equal(g.journey.profit.btc, g.journey.profit.net);
  assert.deepEqual(g.journey.achievements, ["btc-profit", "million-profit"]);
});
