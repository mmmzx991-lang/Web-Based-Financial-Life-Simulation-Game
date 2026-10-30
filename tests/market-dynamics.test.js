import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advance, act } from "../server/core/simulation.js";
import { settleMarket, normal } from "../server/core/market.js";
import { ASSETS } from "../server/core/config.js";

const fresh = (seed = 42) => ({
  ...createGame({ difficulty: "easy", ruleset: "free", seed }),
  marketVersion: 3,
});
const step = (game, count) => {
  for (let i = 0; i < count; i++) settleMarket(game);
  return game;
};

test("v3 regimes persist for variable durations instead of a fixed 18-month cycle", () => {
  const g = fresh(),
    durations = [];
  let duration = 0,
    prior;
  for (let m = 0; m < 300; m++) {
    settleMarket(g);
    if (prior && prior !== g.economy) {
      durations.push(duration);
      duration = 0;
    }
    prior = g.economy;
    duration++;
  }
  assert.ok(durations.length > 5);
  assert.ok(new Set(durations).size > 3);
  assert.ok(durations.some((d) => d !== 18));
});

test("v3 publishes persistent macro factors, fundamentals and bounded price histories", () => {
  const g = step(fresh(), 696);
  assert.ok(g.macro && Number.isFinite(g.macro.policyRate));
  assert.ok(g.macro.inflation > -0.02 && g.macro.inflation < 0.1);
  assert.ok(g.macro.creditStress >= 0 && g.macro.creditStress <= 1);
  for (const a of ASSETS) {
    assert.ok(g.prices[a.id] > 1 && g.prices[a.id] < 1e9, a.id);
    assert.ok(g.assetMetrics[a.id].fundamental > 0);
    assert.ok(g.assetMetrics[a.id].volatility > 0);
    assert.equal(g.priceHistory[a.id].length, 241);
    assert.deepEqual(g.priceHistory[a.id].at(-1), {
      month: 696,
      price: g.prices[a.id],
    });
  }
});

test("v3 seeded streams reproduce after serialization and ignore ownership decisions", () => {
  const idle = step(fresh(), 5),
    active = structuredClone(idle);
  active.properties.push({ id: "extra", type: "shoplot", value: 8e7 });
  active.businesses.push({ id: "extra", type: "coffee-shop" });
  step(idle, 50);
  step(active, 50);
  assert.deepEqual(active.prices, idle.prices);
  assert.deepEqual(active.macro, idle.macro);
  assert.deepEqual(active.news, idle.news);
  const restored = JSON.parse(JSON.stringify(idle));
  step(idle, 5);
  step(restored, 5);
  assert.deepEqual(restored, idle);
});

test("v3 tighter credit and higher rates hurt property returns and consumer demand", () => {
  const healthy = step(fresh(), 1),
    stressed = structuredClone(healthy);
  Object.assign(healthy.macro, {
    policyRate: 0.02,
    growth: 0.05,
    creditStress: 0.1,
    confidence: 0.8,
  });
  Object.assign(stressed.macro, {
    policyRate: 0.1,
    growth: -0.03,
    creditStress: 0.9,
    confidence: 0.2,
  });
  step(healthy, 1);
  step(stressed, 1);
  assert.ok(healthy.macro.propertyReturn > stressed.macro.propertyReturn);
  assert.ok(healthy.macro.rentDemand > stressed.macro.rentDemand);
  assert.ok(healthy.macro.businessDemand > stressed.macro.businessDemand);
  assert.ok(healthy.prices["meridian-tech"] > stressed.prices["meridian-tech"]);
});

test("v3 news is seeded, avoids recent duplicates and distributes each effect once", () => {
  const g = fresh(),
    recent = [];
  for (let month = 1; month <= 35; month++) {
    settleMarket(g);
    const id = g.news[0].templateId;
    assert.ok(id);
    assert.ok(!recent.slice(-12).includes(id));
    recent.push(id);
    assert.ok(g.marketState.activeNews.length <= 3);
    for (const n of g.marketState.activeNews)
      assert.equal(n.lastAppliedMonth, month);
  }
});

test("v3 monthly settlement is identical for one quarter and three single months", () => {
  const g = fresh();
  assert.deepEqual(advance(g, 3), advance(advance(advance(g, 1), 1), 1));
});

test("v3 business revenues and costs retain distinct persistent shocks; next-month improvements work", () => {
  let g = act(fresh(), { type: "start-business", businessType: "coffee-shop" });
  const control = advance(g, 1);
  g = act(g, { type: "business-advertise", businessId: g.businesses[0].id });
  g = advance(g, 1);
  assert.ok(g.businesses[0].lastRevenue > control.businesses[0].lastRevenue);
  assert.ok(Number.isFinite(g.businesses[0].operatingState.revenueShock));
  assert.ok(Number.isFinite(g.businesses[0].operatingState.costShock));
  assert.equal(g.businesses[0].lastRevenue, g.history.at(-1).businessRevenue);
});

test("v3 rental receipts and business sales respond to persistent demand and credit stress", () => {
  let healthy = fresh();
  healthy = act(healthy, {
    type: "start-business",
    businessType: "online-store",
  });
  healthy.properties.push({
    id: "rental",
    type: "apartment",
    value: 25000000,
    occupied: true,
    vacancyProbability: 0,
  });
  settleMarket(healthy);
  const stressed = structuredClone(healthy);
  Object.assign(healthy.macro, {
    confidence: 0.9,
    growth: 0.06,
    creditStress: 0.05,
    policyRate: 0.02,
  });
  Object.assign(stressed.macro, {
    confidence: 0.1,
    growth: -0.04,
    creditStress: 0.9,
    policyRate: 0.1,
  });
  healthy = advance(healthy, 1);
  const down = advance(stressed, 1);
  assert.ok(healthy.history.at(-1).rent > down.history.at(-1).rent);
  assert.ok(healthy.businesses[0].lastRevenue > down.businesses[0].lastRevenue);
  assert.ok(healthy.properties[0].value > down.properties[0].value);
});

test("v3 dividend distributions track fundamentals rather than temporary valuation premiums", () => {
  const g = fresh(),
    asset = ASSETS[0];
  g.holdings[asset.id] = {
    quantity: 100,
    lockedQuantity: 0,
    averageCost: asset.initialPrice,
  };
  g.prices[asset.id] *= 3;
  const result = advance(g, 1);
  assert.equal(
    result.history.at(-1).dividends,
    Math.round(
      (100 * result.assetMetrics[asset.id].fundamental * asset.dividendYield) /
        12,
    ),
  );
});

test("v3 lower rental demand reduces successful tenant matches on the same seeded draws", () => {
  let healthyMatches = 0,
    stressedMatches = 0;
  for (let seed = 0; seed < 60; seed++) {
    const healthy = step(fresh(seed), 1),
      stressed = structuredClone(healthy);
    for (const g of [healthy, stressed])
      g.properties = [
        {
          id: "tenant-test",
          type: "apartment",
          value: 25000000,
          occupied: false,
          vacantSince: 0,
        },
      ];
    Object.assign(healthy.macro, {
      confidence: 0.95,
      growth: 0.08,
      creditStress: 0.03,
    });
    Object.assign(stressed.macro, {
      confidence: 0.08,
      growth: -0.055,
      creditStress: 0.95,
    });
    const good = advance(healthy, 1).properties[0].occupied;
    const bad = advance(stressed, 1).properties[0].occupied;
    assert.ok(
      good || !bad,
      "a lower match probability cannot beat the same random draw",
    );
    healthyMatches += Number(good);
    stressedMatches += Number(bad);
  }
  assert.ok(healthyMatches > stressedMatches + 5);
});

test("v3 upgrade and repeated advertising gains diminish while remaining positive", () => {
  const base = act(fresh(), {
    type: "start-business",
    businessType: "coffee-shop",
  });
  const revenues = [1, 2, 4, 5].map((level) => {
    const g = structuredClone(base);
    Object.assign(g.businesses[0], { level, activeLevel: level });
    return advance(g, 1).businesses[0].lastRevenue;
  });
  assert.ok(revenues[1] > revenues[0]);
  assert.ok(revenues[3] > revenues[2]);
  assert.ok(revenues[1] - revenues[0] > revenues[3] - revenues[2]);
  const ad = (g) =>
    act(g, { type: "business-advertise", businessId: g.businesses[0].id });
  let first = advance(ad(base), 1);
  const initialLift =
    first.businesses[0].lastRevenue /
    advance(base, 1).businesses[0].lastRevenue;
  first = advance(advance(first, 1), 1);
  const withoutRepeat = advance(first, 1);
  const repeated = advance(ad(first), 1);
  const repeatLift =
    repeated.businesses[0].lastRevenue /
    withoutRepeat.businesses[0].lastRevenue;
  assert.ok(repeatLift > 1 && repeatLift < initialLift);
});

test("v3 businesses opened after inflation inherit prevailing input costs", () => {
  const base = fresh(),
    later = structuredClone(base);
  later.priceIndex = 4;
  const open = (g) =>
    advance(act(g, { type: "start-business", businessType: "coffee-shop" }), 1);
  const early = open(base),
    late = open(later);
  assert.ok(
    late.businesses[0].lastOperatingCost >
      early.businesses[0].lastOperatingCost * 3,
  );
  assert.ok(
    late.businesses[0].lastRevenue > early.businesses[0].lastRevenue * 3,
  );
});

test("v3 independent seeded normal addresses have unit variance and reproducible tails", () => {
  const samples = Array.from({ length: 20000 }, (_, m) =>
    normal(87, m, "test"),
  );
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  assert.ok(Math.abs(mean) < 0.035);
  assert.ok(Math.abs(variance - 1) < 0.05);
  assert.ok(samples.some((n) => n > 3) && samples.some((n) => n < -3));
  assert.equal(normal(87, 44, "test"), normal(87, 44, "test"));
});

test("v3 shares category shocks while retaining distinct stock return paths and volatility clusters", () => {
  const g = fresh(),
    rows = [],
    vol = [];
  for (let m = 0; m < 696; m++) {
    const before = { ...g.prices };
    settleMarket(g);
    rows.push(
      ["meridian-tech", "harbor-bank"].map((id) =>
        Math.log(g.prices[id] / before[id]),
      ),
    );
    vol.push(g.assetMetrics["meridian-tech"].volatility);
  }
  const means = [0, 1].map(
    (i) => rows.reduce((sum, row) => sum + row[i], 0) / rows.length,
  );
  const cross = rows.reduce(
    (sum, row) => sum + (row[0] - means[0]) * (row[1] - means[1]),
    0,
  );
  const variances = [0, 1].map((i) =>
    rows.reduce((sum, row) => sum + (row[i] - means[i]) ** 2, 0),
  );
  const correlation = cross / Math.sqrt(variances[0] * variances[1]);
  assert.ok(
    correlation > 0.25 && correlation < 0.9,
    `correlation ${correlation}`,
  );
  assert.ok(Math.max(...vol) / Math.min(...vol) > 1.3);
  assert.ok(rows.some(([a, b]) => a > 0 && b < 0));
});

test("unversioned saves retain exact v2 prices and fixed property appreciation", () => {
  const g = fresh();
  delete g.marketVersion;
  g.properties.push({ id: "old", type: "apartment", value: 25000000 });
  step(g, 1);
  assert.equal(g.economy, "expansion");
  assert.equal(g.properties[0].value, Math.round(25000000 * (1 + 0.02 / 12)));
  assert.equal(g.macro, undefined);
  const explicit = fresh();
  explicit.marketVersion = 2;
  explicit.properties = [{ id: "old", type: "apartment", value: 25000000 }];
  step(explicit, 1);
  assert.deepEqual(explicit.prices, g.prices);
  assert.equal(g.prices["meridian-tech"], 11125);
  assert.equal(g.prices.bitcoin, 2530538);
  assert.equal(g.inflationRate, 0.0016337611731141806);
  const oldBusiness = fresh();
  delete oldBusiness.marketVersion;
  const oldResult = advance(
    act(oldBusiness, { type: "start-business", businessType: "coffee-shop" }),
    1,
  );
  assert.equal(oldResult.businesses[0].lastRevenue, 744889);
  assert.equal(oldResult.businesses[0].lastOperatingCost, 480000);
});
