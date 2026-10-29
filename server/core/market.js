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
export function settleMarket(game) {
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
