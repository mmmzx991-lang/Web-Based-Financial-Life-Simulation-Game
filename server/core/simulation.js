import { MODES, DIFFICULTIES, RULESETS, ASSETS, livingCost } from './config.js';
import { settleMarket } from './market.js';
const demand = (ok,message) => { if(!ok) throw new Error(message); };
export function createGame({mode='full-life',difficulty='normal',ruleset='standard'}={}) {
  demand(Object.hasOwn(MODES,mode),'Invalid life mode');
  demand(Object.hasOwn(DIFFICULTIES,difficulty),'Invalid difficulty');
  demand(RULESETS.includes(ruleset),'Invalid ruleset');
  const [start,end] = MODES[mode];
  return {version:1,mode,difficulty,ruleset,ageMonths:start*12,startAgeMonths:start*12,endAgeMonths:end*12,
    cash:5000000,monthlySalary:start>=60?0:500000,elapsedMonths:0,seed:404126,
    prices:Object.fromEntries(ASSETS.map(a=>[a.id,a.initialPrice])),holdings:{},history:[]};
}
export function report(game) {
  const portfolioValue = ASSETS.reduce((sum,a)=>sum+(game.holdings[a.id]||0)*game.prices[a.id],0);
  return {age:Math.floor(game.ageMonths/12),month:game.ageMonths%12+1,retired:game.ageMonths>=720,
    completed:game.ageMonths>=game.endAgeMonths,cash:game.cash,portfolioValue,netWorth:game.cash+portfolioValue,
    totalIncome:game.history.reduce((s,m)=>s+m.salary,0),totalExpenses:game.history.reduce((s,m)=>s+m.expenses,0),
    monthsPlayed:game.elapsedMonths,negativeCash:game.cash<0};
}
export function advance(state,months) {
  demand(months===1||months===3,'Advance must be 1 or 3 months');
  demand(!report(state).completed,'Game is complete');
  const game=structuredClone(state);
  const count=Math.min(months,game.endAgeMonths-game.ageMonths);
  for(let i=0;i<count;i++) {
    const salary=game.ageMonths<720?game.monthlySalary:0;
    const expenses=livingCost(Math.floor(game.ageMonths/12));
    settleMarket(game);
    game.cash+=salary-expenses;
    game.ageMonths++; game.elapsedMonths++;
    game.history.push({ageMonths:game.ageMonths,salary,expenses,cash:game.cash,netWorth:report(game).netWorth});
    if(game.elapsedMonths%12===0) game.monthlySalary=Math.round(game.monthlySalary*1.025);
    if(game.ageMonths>=720) game.monthlySalary=0;
  }
  return game;
}
export function trade(state,{assetId,side,quantity}={}) {
  demand(!report(state).completed,'Game is complete');
  demand(ASSETS.some(a=>a.id===assetId),'Unknown asset');
  demand(side==='buy'||side==='sell','Invalid order side');
  demand(Number.isSafeInteger(quantity)&&quantity>0,'Quantity must be a positive integer');
  const value=state.prices[assetId]*quantity;
  demand(Number.isSafeInteger(value),'Order too large');
  demand(side==='buy'?state.cash>=value:(state.holdings[assetId]||0)>=quantity,'Insufficient cash or holdings');
  const game=structuredClone(state);
  game.cash+=side==='buy'?-value:value;
  game.holdings[assetId]=(game.holdings[assetId]||0)+(side==='buy'?quantity:-quantity);
  return game;
}
