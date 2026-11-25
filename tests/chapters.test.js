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

test("emergency cover charges premiums, reimburses the same underlying incident, and ends at month 36", () => {
  let uninsured = start();
  let insured = act(uninsured, { type: "enable-emergency-cover" });
  let claims = 0;
  for (let month = 1; month <= 36; month++) {
    while (insured.pendingEvent) insured = step(insured);
    while (uninsured.pendingEvent) uninsured = step(uninsured);
    insured = step(insured);
    uninsured = step(uninsured);
    const a = insured.history.at(-1);
    const b = uninsured.history.at(-1);
    assert.equal(a.emergencyCost, b.emergencyCost);
    assert.equal(a.benchmark, b.benchmark);
    assert.equal(a.protectionPremium, 9000);
    assert.equal(b.protectionPremium, 0);
    assert.equal(b.protectionPayout, 0);
    assert.equal(a.billTotal - b.billTotal, a.protectionPremium);
    const payout = a.emergencyCost
      ? Math.min(200000, Math.round((a.emergencyCost - 20000) * 0.8))
      : 0;
    assert.equal(a.protectionPayout, payout);
    claims += payout;
    assert.equal(insured.cash - uninsured.cash, claims - 9000 * month);
  }
  assert.ok(claims > 0);
  assert.equal(insured.journey.emergencyCover, false);
  insured.journey.notice = null;
  assert.throws(
    () => act(insured, { type: "enable-emergency-cover" }),
    /first stage/,
  );
  insured = step(insured);
  assert.equal(insured.history.at(-1).protectionPremium, undefined);
});

test("extending an unpaid bill at month 36 preserves the rest of the batch", () => {
  let game = start();
  while (game.elapsedMonths < 35 || game.pendingEvent) game = step(game);
  game.cash = 0;
  game.monthlySalary = 0;
  game = step(game, 3);
  assert.ok(game.pendingSettlement);
  game = act(game, { type: "extend-bill" });
  assert.equal(game.elapsedMonths, 36);
  assert.equal(game.journey.notice, "stage-36");
  assert.equal(game.journey.carry, 2);
  assert.equal(game.remainingAdvance, 0);

  game.journey.notice = null;
  game.cash = 10000000;
  const restored = act(game, { type: "resume" });
  assert.equal(restored.elapsedMonths, 38);
  assert.equal(restored.journey.carry, 0);

  game.remainingAdvance = 1; // A save created before this fix.
  game = act(game, { type: "continue-months" });
  assert.equal(game.remainingAdvance, 2);
  game = act(game, { type: "resume" });
  assert.equal(game.elapsedMonths, 38);
  assert.equal(game.journey.results.length, 1);
});
