import { ASSETS, SETTINGS } from "./config.js";
import { NEWS_TEMPLATES } from "./news.js";

export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Stateless independent streams: a trade, vacancy or business cannot consume the market RNG.
export const random = (seed, month, key) =>
  hash(`${seed}|${month}|${key}`) / 4294967296;
function settleLegacyMarket(game) {
  const month = game.marketMonth + 1;
  const conditions = ["expansion", "boom", "recession", "recovery"];
  game.economy = conditions[Math.floor((month - 1) / 18) % 4];
  const template = NEWS_TEMPLATES[(month - 1 + (game.scenarioSeed % 60)) % 60];
  game.news = [
    {
      ...structuredClone(template),
      id: `news-${month}-${template.id}`,
      month,
      ageMonths: game.ageMonths + 1,
    },
  ];
  const bias = {
    expansion: 0.003,
    boom: 0.008,
    recession: -0.012,
    recovery: 0.005,
  }[game.economy];
  game.previousPrices = { ...game.prices };
  for (const asset of ASSETS) {
    const shock =
      ((random(game.scenarioSeed, month, asset.id) * 2 - 1) *
        asset.volatility) /
      Math.sqrt(12);
    const effect =
      template.effects[asset.id] ??
      template.effects[asset.category] ??
      template.effects.all ??
      0;
    const cycle = asset.category === "gold" ? -bias / 3 : bias;
    game.prices[asset.id] = Math.max(
      1,
      Math.min(
        1000000000,
        Math.round(
          game.prices[asset.id] *
            (1 + asset.annualReturn / 12 + cycle + shock + effect),
        ),
      ),
    );
  }
  game.inflationRate = Math.max(
    -0.001,
    0.002 +
      ({ boom: 0.001, recession: -0.001 }[game.economy] || 0) +
      (random(game.scenarioSeed, month, "inflation") - 0.5) * 0.001,
  );
  game.priceIndex *= 1 + game.inflationRate;
  game.marketMonth = month;
  for (const property of game.properties)
    property.value = Math.round(
      property.value * (1 + SETTINGS.propertyAnnualGrowth / 12),
    );
}

// Avalanche the complete stream address before sampling. Adjacent months and similar
// asset names must not produce the neighboring uniforms of the legacy FNV stream.
export function marketRandom(seed, month, key) {
  let x = hash(`v3|${seed}|${month}|${key}`);
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
export function normal(seed, month, key) {
  const u =
    (marketRandom(seed, month, `${key}:u`) * 4294967296 + 0.5) / 4294967296;
  return (
    Math.sqrt(-2 * Math.log(u)) *
    Math.cos(2 * Math.PI * marketRandom(seed, month, `${key}:v`))
  );
}
const bound = (x, low, high) => Math.max(low, Math.min(high, x));
const REGIMES = {
  expansion: {
    growth: 0.035,
    inflation: 0.025,
    confidence: 0.66,
    credit: 0.2,
    liquidity: 0.63,
  },
  boom: {
    growth: 0.055,
    inflation: 0.043,
    confidence: 0.8,
    credit: 0.26,
    liquidity: 0.72,
  },
  recession: {
    growth: -0.022,
    inflation: 0.016,
    confidence: 0.32,
    credit: 0.65,
    liquidity: 0.32,
  },
  recovery: {
    growth: 0.025,
    inflation: 0.022,
    confidence: 0.54,
    credit: 0.36,
    liquidity: 0.58,
  },
};
const TRANSITIONS = {
  expansion: [
    ["boom", 0.38],
    ["recession", 0.72],
    ["recovery", 1],
  ],
  boom: [
    ["expansion", 0.3],
    ["recession", 0.85],
    ["recovery", 1],
  ],
  recession: [
    ["recovery", 0.82],
    ["expansion", 1],
  ],
  recovery: [
    ["expansion", 0.72],
    ["boom", 0.9],
    ["recession", 1],
  ],
};

function updateMacro(game, month) {
  const n = (key) => normal(game.scenarioSeed, month, key);
  const state = (game.marketState ??= {
    regimeMonths: 0,
    regimeDuration:
      10 + Math.floor(marketRandom(game.scenarioSeed, 0, "duration") * 25),
    commonVariance: 1,
    categoryVariance: {},
    activeNews: [],
    recentNews: [],
  });
  if (state.regimeMonths >= state.regimeDuration) {
    const draw = marketRandom(game.scenarioSeed, month, "regime");
    game.economy = TRANSITIONS[game.economy].find(
      ([, limit]) => draw < limit,
    )[0];
    state.regimeMonths = 0;
    const minimum = game.economy === "recession" ? 7 : 10;
    state.regimeDuration =
      minimum +
      Math.floor(marketRandom(game.scenarioSeed, month, "duration") * 27);
  }
  state.regimeMonths++;
  const target = REGIMES[game.economy];
  const macro = (game.macro ??= {
    growth: 0.03,
    inflation: 0.024,
    policyRate: 0.035,
    confidence: 0.6,
    creditStress: 0.25,
    liquidity: 0.6,
  });
  const demandShock = n("macro:demand"),
    supplyShock = n("macro:supply");
  macro.growth = bound(
    macro.growth +
      0.16 * (target.growth - macro.growth) -
      0.035 * (macro.policyRate - 0.035) +
      0.004 * demandShock,
    -0.055,
    0.085,
  );
  macro.inflation = bound(
    macro.inflation +
      0.1 *
        (target.inflation + 0.18 * (macro.growth - 0.03) - macro.inflation) +
      0.0017 * supplyShock,
    -0.008,
    0.09,
  );
  const desiredRate =
    0.03 + 0.75 * (macro.inflation - 0.024) + 0.24 * (macro.growth - 0.03);
  macro.policyRate = bound(
    macro.policyRate +
      0.14 * (desiredRate - macro.policyRate) +
      0.0006 * n("macro:policy"),
    0.0025,
    0.12,
  );
  macro.confidence = bound(
    macro.confidence +
      0.14 * (target.confidence - macro.confidence) +
      0.018 * demandShock,
    0.08,
    0.95,
  );
  macro.creditStress = bound(
    macro.creditStress +
      0.1 *
        (target.credit +
          1.3 * (macro.policyRate - 0.035) -
          macro.creditStress) -
      0.012 * demandShock,
    0.03,
    0.95,
  );
  macro.liquidity = bound(
    macro.liquidity +
      0.15 * (target.liquidity - macro.liquidity) -
      0.015 * n("macro:credit"),
    0.08,
    0.95,
  );
  macro.propertyReturn = bound(
    (0.022 +
      0.45 * (macro.growth - 0.03) -
      0.32 * (macro.policyRate - 0.035) -
      0.025 * (macro.creditStress - 0.25)) /
      12 +
      0.0015 * n("property"),
    -0.018,
    0.016,
  );
  macro.rentDemand = bound(
    1 +
      0.28 * (macro.confidence - 0.6) +
      1.3 * (macro.growth - 0.03) -
      0.13 * (macro.creditStress - 0.25),
    0.7,
    1.2,
  );
  macro.businessDemand = bound(
    1 +
      0.35 * (macro.confidence - 0.6) +
      1.7 * (macro.growth - 0.03) -
      0.14 * (macro.creditStress - 0.25),
    0.65,
    1.3,
  );
  macro.inputCostGrowth =
    Math.expm1(macro.inflation / 12) + 0.0008 * supplyShock;
}

function updateNews(game, month) {
  const state = game.marketState;
  const choices = NEWS_TEMPLATES.filter(
    (n) => !state.recentNews.includes(n.id),
  );
  const template =
    choices[
      Math.floor(
        marketRandom(game.scenarioSeed, month, "news:selection") *
          choices.length,
      )
    ];
  state.recentNews = [...state.recentNews, template.id].slice(-12);
  state.activeNews = state.activeNews.filter((n) => month - n.startMonth < 3);
  state.activeNews.push({
    templateId: template.id,
    startMonth: month,
    effects: { ...template.effects },
  });
  game.news = [
    {
      ...structuredClone(template),
      templateId: template.id,
      id: `news-${month}-${template.id}`,
      month,
      ageMonths: game.ageMonths + 1,
    },
  ];
  // Each impulse is spread over three months; its original amount is not reapplied.
  for (const item of state.activeNews) item.lastAppliedMonth = month;
}

function assetResponse(asset, macro) {
  const growth = macro.growth - 0.03,
    rate = macro.policyRate - 0.035;
  const credit = macro.creditStress - 0.25,
    inflation = macro.inflation - 0.024;
  const liquidity = macro.liquidity - 0.6;
  if (asset.category === "gold")
    return -0.08 * growth - 0.6 * rate + 0.35 * inflation + 0.025 * credit;
  if (asset.category === "crypto")
    return 0.3 * growth - 0.7 * rate - 0.04 * credit + 0.09 * liquidity;
  if (asset.category === "commodity") {
    const cyclical = asset.sector.en === "Agriculture" ? 0.25 : 0.8;
    return cyclical * growth + 0.4 * inflation - 0.15 * rate;
  }
  const sensitivity = {
    "meridian-tech": [1.1, 1.4, 0.8],
    "harbor-bank": [0.8, -0.15, 1.6],
    "sunrise-health": [0.3, 0.4, 0.4],
    "cedar-retail": [1.2, 0.6, 0.9],
    "nova-energy": [0.9, 0.4, 0.6],
    "orchid-industry": [1.1, 0.65, 0.9],
  }[asset.id];
  return (
    sensitivity[0] * growth -
    sensitivity[1] * rate -
    0.04 * sensitivity[2] * credit +
    0.025 * liquidity
  );
}

function settleModernMarket(game) {
  const month = game.marketMonth + 1;
  updateMacro(game, month);
  updateNews(game, month);
  const state = game.marketState,
    macro = game.macro;
  const common = normal(game.scenarioSeed, month, "market:common");
  const commonScale = Math.sqrt(state.commonVariance);
  state.commonVariance = bound(
    0.92 * state.commonVariance + 0.08 * common ** 2,
    0.4,
    3.5,
  );
  const categories = {};
  for (const category of ["stock", "gold", "commodity", "crypto"]) {
    const shock = normal(game.scenarioSeed, month, `category:${category}`);
    const variance = state.categoryVariance[category] ?? 1;
    categories[category] = shock * Math.sqrt(variance);
    state.categoryVariance[category] = bound(
      0.9 * variance + 0.1 * shock ** 2,
      0.4,
      3.5,
    );
  }
  game.assetMetrics ??= {};
  game.priceHistory ??= {};
  game.previousPrices = { ...game.prices };
  for (const asset of ASSETS) {
    const old = game.prices[asset.id];
    const metrics = (game.assetMetrics[asset.id] ??= {
      fundamental: asset.initialPrice,
      variance: 1,
      earningsIndex: 1,
      trend: 0,
    });
    const response = assetResponse(asset, macro);
    const own = normal(game.scenarioSeed, month, `asset:${asset.id}`);
    const commonLoading =
      asset.category === "gold"
        ? -0.22
        : asset.category === "commodity"
          ? 0.28
          : 0.58;
    const categoryLoading = asset.category === "gold" ? 0.45 : 0.5;
    const ownLoading = Math.sqrt(1 - commonLoading ** 2 - categoryLoading ** 2);
    const shock =
      commonLoading * common * commonScale +
      categoryLoading * categories[asset.category] +
      ownLoading * own * Math.sqrt(metrics.variance);
    metrics.variance = bound(0.9 * metrics.variance + 0.1 * own ** 2, 0.4, 3.5);
    const fundamentalGrowth =
      (asset.annualReturn - asset.dividendYield + response * 0.6) / 12;
    metrics.fundamental *= Math.exp(
      fundamentalGrowth +
        0.003 * normal(game.scenarioSeed, month, `earnings:${asset.id}`),
    );
    metrics.earningsIndex = metrics.fundamental / asset.initialPrice;
    const valuationGap = Math.log(metrics.fundamental / old);
    const reversion =
      asset.category === "crypto"
        ? 0.045
        : asset.category === "commodity"
          ? 0.09
          : 0.055;
    let newsEffect = 0;
    for (const item of state.activeNews) {
      const effect =
        item.effects[asset.id] ??
        item.effects[asset.category] ??
        item.effects.all ??
        0;
      newsEffect += effect * [0.6, 0.28, 0.12][month - item.startMonth];
    }
    // Log returns keep prices positive. Fundamental attraction prevents a pure
    // random walk from pinning long educational runs against an arbitrary cap.
    const sigma = asset.volatility / Math.sqrt(12);
    const returnRate =
      fundamentalGrowth +
      response / 12 +
      reversion * valuationGap +
      sigma * shock -
      sigma ** 2 / 2 +
      newsEffect;
    game.prices[asset.id] = Math.max(1, Math.round(old * Math.exp(returnRate)));
    metrics.valuation = game.prices[asset.id] / metrics.fundamental;
    metrics.volatility =
      asset.volatility *
      Math.sqrt(
        commonLoading ** 2 * state.commonVariance +
          categoryLoading ** 2 * state.categoryVariance[asset.category] +
          ownLoading ** 2 * metrics.variance,
      );
    metrics.trend = 0.8 * metrics.trend + 0.2 * Math.expm1(returnRate);
    const history = (game.priceHistory[asset.id] ??= [
      { month: month - 1, price: old },
    ]);
    history.push({ month, price: game.prices[asset.id] });
    if (history.length > 241) history.splice(0, history.length - 241);
  }
  game.inflationRate = Math.expm1(macro.inflation / 12);
  game.priceIndex *= 1 + game.inflationRate;
  game.marketMonth = month;
  for (const property of game.properties)
    property.value = Math.round(property.value * (1 + macro.propertyReturn));
}

export function settleMarket(game) {
  if (game.marketVersion === 3) settleModernMarket(game);
  else settleLegacyMarket(game);
}
