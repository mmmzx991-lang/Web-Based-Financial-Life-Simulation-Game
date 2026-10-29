export const MODES = { 'full-life':[22,80], 'early-career':[22,45], 'wealth-building':[45,60], retirement:[60,80] };
export const DIFFICULTIES = { easy:0.5, normal:1, hard:1.5, expert:2 };
export const RULESETS = ['standard','free'];
export const livingCost = age => age < 45 ? 200000 : age < 60 ? 300000 : 250000;
// Provisional catalog: replace names and parameters after checking the full proposal.
export const ASSETS = [
  ['savings','Savings deposit',0.02,0],['fixed-deposit','Fixed deposit',0.03,0],
  ['government-bond','Government bond',0.035,0.01],['corporate-bond','Corporate bond',0.045,0.025],
  ['money-market','Money market fund',0.028,0.005],['bond-fund','Bond fund',0.04,0.025],
  ['local-equity','Local equity fund',0.06,0.14],['global-equity','Global equity fund',0.065,0.16],
  ['index-fund','Index fund',0.06,0.12],['dividend-equity','Dividend equity fund',0.055,0.1],
  ['reit','REIT',0.05,0.1],['gold','Gold',0.035,0.12],
  ['commodity','Commodity fund',0.04,0.18],['emerging-market','Emerging market fund',0.07,0.22],
  ['digital-asset','Digital asset',0.06,0.4]
].map(([id,name,annualReturn,volatility])=>({id,name,annualReturn,volatility,initialPrice:10000}));
