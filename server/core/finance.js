import { PROPERTY_TYPES, SETTINGS, livingCost } from "./config.js";

export const demand = (ok, message) => {
  if (!ok) throw new Error(message);
};
export function money(amount) {
  demand(
    Number.isSafeInteger(amount) &&
      amount > 0 &&
      amount <= SETTINGS.maximumAmount,
    "Amount must be a positive integer in sen",
  );
  return amount;
}
export function nextId(game, prefix) {
  game.nextId++;
  return `${prefix}-${game.nextId}`;
}
export function usable(game) {
  demand(game.version === 2, "Unsupported game version");
  demand(
    game.status !== "completed" &&
      game.status !== "bankrupt" &&
      game.ageMonths < game.endAgeMonths,
    "Game is complete",
  );
}
export const fee = (amount, rate = SETTINGS.tradeFee) =>
  Math.max(1, Math.round(amount * rate));
export const positionEquity = (game, p) =>
  Math.max(
    0,
    Math.round(p.margin + p.quantity * (game.prices[p.assetId] - p.entryPrice)),
  );
export function values(game) {
  const portfolioValue =
    Object.entries(game.holdings).reduce(
      (s, [id, h]) => s + h.quantity * game.prices[id],
      0,
    ) + game.positions.reduce((s, p) => s + positionEquity(game, p), 0);
  const propertyValue = game.properties.reduce((s, p) => s + p.value, 0);
  const businessValue = game.businesses.reduce((s, b) => s + b.value, 0);
  const assets =
    game.cash +
    game.savings +
    game.retirementBalance +
    portfolioValue +
    propertyValue +
    businessValue;
  const liabilities =
    game.loans.reduce((s, l) => s + l.principal, 0) +
    (game.unpaidBill?.amount || 0);
  return {
    portfolioValue,
    propertyValue,
    businessValue,
    assets,
    liabilities,
    netWorth: assets - liabilities,
  };
}
export function payment(loan) {
  if (loan.remainingMonths <= 1)
    return loan.principal + Math.round((loan.principal * loan.annualRate) / 12);
  const r = loan.annualRate / 12;
  return Math.round(
    r
      ? (loan.principal * r) / (1 - (1 + r) ** -loan.remainingMonths)
      : loan.principal / loan.remainingMonths,
  );
}
export function loanDue(loan) {
  const interest = Math.round((loan.principal * loan.annualRate) / 12);
  const principal = Math.min(
    loan.principal,
    Math.max(0, payment(loan) - interest),
  );
  loan.principal -= principal;
  loan.remainingMonths = Math.max(0, loan.remainingMonths - 1);
  return { principal, interest, total: principal + interest };
}
export function baselineValue(game) {
  const b = game.baseline;
  return (
    b.cash +
    b.properties.reduce((s, p) => s + p.value, 0) -
    b.loans.reduce((s, l) => s + l.principal, 0)
  );
}
export function settleBaseline(game, salaryBonus = 0, salaryMultiplier = 1) {
  const b = game.baseline;
  const salary = game.ageMonths < 720 ? b.monthlySalary : 0;
  const interest = Math.round(
    (Math.max(b.cash, 0) * SETTINGS.savingsRate) / 12,
  );
  let rent = 0,
    maintenance = 0,
    loans = 0;
  for (const p of b.properties) {
    const c = PROPERTY_TYPES[p.type];
    p.value = Math.round(p.value * (1 + SETTINGS.propertyAnnualGrowth / 12));
    rent += c.rent;
    maintenance += c.maintenance;
  }
  for (const l of b.loans) loans += loanDue(l).total;
  b.loans = b.loans.filter((l) => l.principal > 0);
  b.cash +=
    salary +
    salaryBonus +
    interest +
    rent -
    maintenance -
    loans -
    livingCost(Math.floor(game.ageMonths / 12));
  b.monthlySalary = Math.round(b.monthlySalary * salaryMultiplier);
  if ((game.ageMonths + 1) % 12 === 0 && game.ageMonths + 1 < 720)
    b.monthlySalary = Math.round(b.monthlySalary * 1.025);
  if (game.ageMonths + 1 >= 720) b.monthlySalary = 0;
}
export const emptyLedger = () => ({
  income: 0,
  expenses: 0,
  salary: 0,
  bonus: 0,
  livingCost: 0,
  rent: 0,
  maintenance: 0,
  dividends: 0,
  savingsInterest: 0,
  retirementInterest: 0,
  businessRevenue: 0,
  businessCosts: 0,
  loanPrincipal: 0,
  loanInterest: 0,
  fees: 0,
  events: [],
});
export function snapshot(game, ledger = emptyLedger()) {
  const v = values(game);
  return {
    elapsedMonths: game.elapsedMonths,
    ageMonths: game.ageMonths,
    cash: game.cash,
    savings: game.savings,
    retirementBalance: game.retirementBalance,
    ...v,
    realNetWorth: Math.round(v.netWorth / game.priceIndex),
    priceIndex: game.priceIndex,
    benchmark: baselineValue(game),
    ...structuredClone(ledger),
  };
}
const cap = (x) => Math.max(0, Math.min(100, x));
export function report(game) {
  const v = values(game),
    realNetWorth = Math.round(v.netWorth / game.priceIndex),
    benchmark = baselineValue(game),
    realBenchmark = Math.round(benchmark / game.priceIndex);
  let peak = game.history[0]?.netWorth || 0,
    drawdown = 0;
  for (const h of game.history) {
    peak = Math.max(peak, h.netWorth);
    if (peak > 0) drawdown = Math.max(drawdown, (peak - h.netWorth) / peak);
  }
  const wealth = cap(
    50 +
      25 *
        Math.log(
          (Math.max(realNetWorth, 0) + 1000000) /
            (Math.max(realBenchmark, 0) + 1000000),
        ),
  );
  const risk = cap(100 - drawdown * 100 - 10 * game.stats.forcedLiquidations),
    cashFlow = cap(100 - 2 * game.stats.unpaidMonths),
    debt = cap(100 - 15 * game.stats.latePayments - 30 * game.stats.defaults);
  const score = {
    wealth,
    risk,
    cashFlow,
    debt,
    total: wealth * 0.6 + risk * 0.15 + cashFlow * 0.15 + debt * 0.1,
  };
  return {
    age: Math.floor(game.ageMonths / 12),
    month: (game.ageMonths % 12) + 1,
    retired: game.ageMonths >= 720,
    completed: game.status === "completed",
    bankrupt: game.status === "bankrupt",
    cash: game.cash,
    savings: game.savings,
    retirementBalance: game.retirementBalance,
    ...v,
    realNetWorth,
    priceIndex: game.priceIndex,
    totalIncome: game.history.reduce((s, h) => s + h.income, 0),
    totalExpenses: game.history.reduce((s, h) => s + h.expenses, 0),
    monthsPlayed: game.elapsedMonths,
    benchmark,
    realBenchmark,
    drawdown,
    ...game.stats,
    milestone: game.milestone,
    score,
    history: game.history,
  };
}
