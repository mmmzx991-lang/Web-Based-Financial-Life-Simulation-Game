// Names and age ranges for medals already earned in older saves.
const definitions = [
  [22, 25, "First paycheque", "第一份工资"],
  [25, 30, "First investments", "第一次投资"],
  [30, 45, "Choose your path", "选择发展方向"],
  [45, 48, "Household cash flow", "家庭现金流"],
  [48, 53, "Grow or repay", "扩张还是还债"],
  [53, 60, "Retirement readiness", "退休准备"],
  [60, 63, "Life after salary", "没有工资的生活"],
  [63, 68, "Weathering volatility", "应对波动"],
  [68, 80, "Long-term income", "长期提款"],
];
export const legacyChapters = definitions.map(([start, end, en, zh]) => ({
  id: "age-" + start,
  start,
  end,
  name: { en, zh },
}));
export const depositRates = { 3: 0.032, 12: 0.04 };

export const milestones = [
  {
    id: "stage-36",
    month: 36,
    name: { en: "First three years", zh: "前三年 · 储蓄起步" },
  },
  {
    id: "stage-96",
    month: 96,
    name: { en: "Five years of investing", zh: "接下来五年 · 股票投资" },
  },
];
export const profitMedals = [
  {
    id: "million-profit",
    field: "net",
    target: 100000000,
    name: { en: "RM 1 million trading profit", zh: "累计交易净赚 100 万令吉" },
  },
  {
    id: "btc-profit",
    field: "btc",
    target: 10000000,
    name: { en: "RM 100,000 Bitcoin profit", zh: "比特币净赚 10 万令吉" },
  },
];
export const [depositStageEnd, stockStageEnd] = milestones.map(
  ({ month }) => month,
);

export function stage(g) {
  return g.elapsedMonths < depositStageEnd
    ? 1
    : g.elapsedMonths < stockStageEnd
      ? 2
      : 3;
}
export function unlockMonth(action, category, leverage = 1) {
  if (action === "trade")
    return category === "stock" && leverage === 1
      ? depositStageEnd
      : stockStageEnd;
  if (["buy-property", "start-business"].includes(action)) return stockStageEnd;
  if (["savings-deposit", "retirement-deposit"].includes(action))
    return depositStageEnd;
  return 0;
}
