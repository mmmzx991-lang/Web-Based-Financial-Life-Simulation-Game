import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../server/core/simulation.js";
import { settleMarket } from "../server/core/market.js";
test("v4 stock buy-and-hold has material five-year losses and gains across fixed scenarios", () => {
  let losses = 0,
    wins = 0,
    deepDrawdowns = 0;
  for (let seed = 0; seed < 120; seed++) {
    const g = createGame({ ruleset: "free", seed });
    g.marketVersion = 4;
    let peak = g.prices["meridian-tech"],
      drawdown = 0;
    const opening = peak;
    for (let m = 0; m < 60; m++) {
      settleMarket(g);
      peak = Math.max(peak, g.prices["meridian-tech"]);
      drawdown = Math.max(drawdown, 1 - g.prices["meridian-tech"] / peak);
    }
    if (g.prices["meridian-tech"] < opening) losses++;
    else wins++;
    if (drawdown > 0.3) deepDrawdowns++;
  }
  assert.ok(losses >= 20 && wins >= 20, `losses=${losses},wins=${wins}`);
  assert.ok(deepDrawdowns >= 15, `drawdowns=${deepDrawdowns}`);
});
test("v4 public paths ignore positions and replay after serialized saves", () => {
  let g = createGame({ ruleset: "free", seed: 91 });
  g.marketVersion = 4;
  let other = structuredClone(g);
  other.holdings.bitcoin = { quantity: 12, lockedQuantity: 0, averageCost: 1 };
  for (let m = 0; m < 120; m++) {
    settleMarket(g);
    other = JSON.parse(JSON.stringify(other));
    settleMarket(other);
    assert.deepEqual(g.prices, other.prices);
    assert.deepEqual(g.assetMetrics, other.assetMetrics);
  }
});
