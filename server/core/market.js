import { ASSETS, DIFFICULTIES } from './config.js';
export function settleMarket(game) {
  for (const asset of ASSETS) {
    game.seed = (Math.imul(1664525,game.seed)+1013904223)>>>0;
    const shock = (game.seed/4294967296*2-1)*asset.volatility/Math.sqrt(12)*DIFFICULTIES[game.difficulty];
    game.prices[asset.id] = Math.max(1,Math.round(game.prices[asset.id]*(1+asset.annualReturn/12+shock)));
  }
}
