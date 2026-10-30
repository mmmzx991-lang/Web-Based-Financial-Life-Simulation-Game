import { settleMarket } from "../server/core/market.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createGame, trade, act, report } from "../server/core/simulation.js";
const opened = () =>
  trade(createGame({ difficulty: "easy" }), {
    assetId: "bitcoin",
    side: "buy",
    quantity: 0.29,
    leverage: 3,
  });
const ready = () => {
  const g = opened();
  g.marketMonth = 1;
  g.prices.bitcoin += 137;
  return g;
};
test("partial crypto close conserves equity and margin, with exact quantity and immutable input", () => {
  const g = ready(),
    p = g.positions[0],
    before = structuredClone(g),
    equity = report(g).portfolioValue;
  const n = act(g, { type: "close-position", positionId: p.id, quantity: 0.1 });
  assert.deepEqual(g, before);
  assert.equal(n.positions[0].quantity, 0.19);
  assert.equal(n.positions[0].margin + n.positionHistory[0].margin, p.margin);
  assert.equal(
    n.cash - g.cash + report(n).portfolioValue + n.positionHistory[0].fee,
    equity,
  );
  assert.equal(n.positionHistory[0].quantity, 0.1);
  const end = act(n, { type: "close-position", positionId: p.id });
  assert.equal(end.positions.length, 0);
  assert.equal(end.positionHistory.length, 2);
  assert.equal(
    end.cash - g.cash + end.positionHistory.reduce((s, h) => s + h.fee, 0),
    equity,
  );
});
test("partial close validates precision, size, numeric type and lock before mutating", () => {
  const g = ready(),
    p = g.positions[0];
  for (const quantity of [0, -1, 0.001, 0.3, NaN, Infinity, "0.01", null])
    assert.throws(() =>
      act(g, { type: "close-position", positionId: p.id, quantity }),
    );
  assert.throws(
    () =>
      act(opened(), {
        type: "close-position",
        positionId: p.id,
        quantity: 0.01,
      }),
    /locked/i,
  );
});
test("partial closes do not create or lose sen across price directions and quantities", () => {
  for (const delta of [-7777, -1, 0, 1, 937]) {
    let g = ready();
    g.prices.bitcoin = g.positions[0].entryPrice + delta;
    const cash = g.cash,
      equity = report(g).portfolioValue,
      id = g.positions[0].id;
    for (let i = 0; i < 28; i++)
      g = act(g, { type: "close-position", positionId: id, quantity: 0.01 });
    g = act(g, { type: "close-position", positionId: id });
    assert.equal(
      g.cash - cash + g.positionHistory.reduce((s, h) => s + h.fee, 0),
      equity,
    );
    assert.ok(Number.isSafeInteger(g.cash));
    assert.equal(g.positions.length, 0);
  }
});
import { positionMetrics, closeQuote } from "../public/leverage-math.js";
import { positionEquity } from "../server/core/finance.js";
import { advance } from "../server/core/simulation.js";
import { fee } from "../server/core/finance.js";
const coin = { category: "crypto" };
test("liquidation estimate matches exact monthly equity threshold on both sides", () => {
  for (const quantity of [0.01, 0.29, 1.17])
    for (const leverage of [2, 3]) {
      const g = trade(createGame(), {
          assetId: "bitcoin",
          side: "buy",
          quantity,
          leverage,
        }),
        p = g.positions[0];
      const m = positionMetrics(coin, p, g.prices.bitcoin);
      g.prices.bitcoin = m.liquidationPrice;
      assert.ok(positionEquity(g, p) <= p.margin * 0.15);
      g.prices.bitcoin++;
      assert.ok(positionEquity(g, p) > p.margin * 0.15);
    }
});
test("split rounding survives save, next price, and shared quote agrees with engine", () => {
  let g = ready(),
    p = g.positions[0];
  g = act(g, { type: "close-position", positionId: p.id, quantity: 0.1 });
  g = JSON.parse(JSON.stringify(g));
  g.prices.bitcoin -= 199;
  p = g.positions[0];
  const m = positionMetrics(coin, p, g.prices.bitcoin),
    q = closeQuote(coin, p, g.prices.bitcoin);
  assert.equal(m.equity, positionEquity(g, p));
  const n = act(g, { type: "close-position", positionId: p.id });
  assert.equal(n.cash - g.cash, q.proceeds);
  assert.equal(n.positionHistory.at(-1).pnl, q.pnl);
});
test("tiny partial closure cannot leave an uncollateralized position", () => {
  const g = createGame();
  g.prices.bitcoin = 100;
  const n = trade(g, {
    assetId: "bitcoin",
    side: "buy",
    quantity: 0.02,
    leverage: 3,
  });
  n.marketMonth = 1;
  assert.throws(
    () =>
      act(n, {
        type: "close-position",
        positionId: n.positions[0].id,
        quantity: 0.01,
      }),
    /entire|margin/i,
  );
  assert.equal(
    act(n, { type: "close-position", positionId: n.positions[0].id }).positions
      .length,
    0,
  );
});
test("forced closing uses exposure fee for new positions, caps loss and records proceeds once", () => {
  const g = opened(),
    p = g.positions[0];
  const preview = structuredClone(g);
  settleMarket(preview);
  p.entryPrice =
    preview.prices.bitcoin + Math.round((p.margin * 0.9) / p.quantity);
  const n = advance(g, 1),
    h = n.positionHistory?.find((h) => h.positionId === p.id);
  assert.ok(h);
  assert.equal(h.kind, "forced");
  assert.ok(h.equity > 0 && h.equity <= p.margin * 0.15);
  assert.equal(n.stats.forcedLiquidations, 1);
  assert.equal(
    h.fee,
    Math.min(h.equity, fee(Math.round(h.quantity * n.prices.bitcoin))),
  );
  assert.equal(h.proceeds, h.equity - h.fee);
  assert.ok(h.proceeds >= 0);
  assert.equal(n.positions.length, 0);
  assert.equal(report(n).liabilities, 0);
});

test("legacy forced closures retain the prior equity-based fee", () => {
  const g = opened(),
    p = g.positions[0],
    preview = structuredClone(g);
  settleMarket(preview);
  delete p.positionVersion;
  p.entryPrice =
    preview.prices.bitcoin + Math.round((p.margin * 0.9) / p.quantity);
  const n = advance(g, 1),
    h = n.positionHistory[0];
  assert.ok(h.equity > 0);
  assert.equal(h.fee, Math.min(h.equity, fee(h.equity)));
});
