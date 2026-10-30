import { createGame } from "../server/core/simulation.js";
import { settleMarket } from "../server/core/market.js";
const quantile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
const results = [];
for (const version of [3, 4]) {
  let deepValueSignals = 0,
    deepValueWins = 0,
    deepValueReturn = 0,
    leverageLiquidations = 0;
  const stock = [],
    bitcoin = [],
    drawdowns = [];
  for (let seed = 0; seed < 120; seed++) {
    const g = createGame({ ruleset: "free", seed });
    g.marketVersion = version;
    const first = { ...g.prices };
    let peak = first["meridian-tech"],
      drawdown = 0,
      liquidated = false;
    for (let m = 0; m < 60; m++) {
      const before = g.prices.bitcoin,
        signal = g.assetMetrics?.bitcoin?.valuation < 0.8;
      settleMarket(g);
      if (signal) {
        deepValueSignals++;
        const r = g.prices.bitcoin / before - 1;
        deepValueReturn += r;
        if (r > 0) deepValueWins++;
      }
      peak = Math.max(peak, g.prices["meridian-tech"]);
      drawdown = Math.max(drawdown, 1 - g.prices["meridian-tech"] / peak);
      const leveragedEquity = 1 + 3 * (g.prices.bitcoin / first.bitcoin - 1);
      if (leveragedEquity <= 0.15) liquidated = true;
    }
    stock.push(g.prices["meridian-tech"] / first["meridian-tech"] - 1);
    bitcoin.push(g.prices.bitcoin / first.bitcoin - 1);
    drawdowns.push(drawdown);
    if (liquidated) leverageLiquidations++;
  }
  const distribution = (a) => ({
    profitableScenarios: a.filter((x) => x > 0).length,
    p10: quantile(a, 0.1),
    median: quantile(a, 0.5),
    p90: quantile(a, 0.9),
  });
  results.push({
    marketVersion: version,
    stock: distribution(stock),
    bitcoin: distribution(bitcoin),
    stockDrawdownOver30Percent: drawdowns.filter((x) => x > 0.3).length,
    bitcoin3xForcedClosures: leverageLiquidations,
    deepValueSignal: {
      observations: deepValueSignals,
      winRate: deepValueWins / deepValueSignals,
      averageReturn: deepValueReturn / deepValueSignals,
    },
  });
}
console.log(
  JSON.stringify(
    {
      scenarios: 120,
      horizonMonths: 60,
      scope:
        "Fixed-seed market-only price-return inspection. Excludes dividends, fees, salaries and portfolio strategy; 3x uses opening entry with the monthly 15%-margin liquidation rule. Not a forecast or optimized-strategy claim.",
      results,
    },
    null,
    2,
  ),
);
