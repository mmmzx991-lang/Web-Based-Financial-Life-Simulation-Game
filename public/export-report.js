import { t, modeLabel } from "./i18n.js";
const csv = (rows) =>
  "\ufeff" +
  rows
    .map((row) =>
      row
        .map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\r\n");
export function exportReport(game, summary) {
  const rm = (value) => (Number(value || 0) / 100).toFixed(2);
  return csv([
    [t("brand"), t("report")],
    [t("mode"), modeLabel(game.mode)],
    [t("difficulty"), t(game.difficulty)],
    [t("ruleset"), t(game.ruleset)],
    [t("month"), summary.monthsPlayed],
    [t("netWorth") + " (RM)", rm(summary.netWorth)],
    [t("realWealth") + " (RM)", rm(summary.realNetWorth)],
    [t("benchmark") + " (RM)", rm(summary.benchmark)],
    [t("liabilities") + " (RM)", rm(summary.liabilities)],
    [t("finalScore"), Number(summary.score.total).toFixed(2)],
    [t("wealthScore"), summary.score.wealth.toFixed(2)],
    [t("riskScore"), summary.score.risk.toFixed(2)],
    [t("cashFlowScore"), summary.score.cashFlow.toFixed(2)],
    [t("debtScore"), summary.score.debt.toFixed(2)],
    [],
    [t("monthlyHistory")],
    [
      t("month"),
      t("age"),
      t("cash") + " (RM)",
      t("assetsTotal") + " (RM)",
      t("liabilities") + " (RM)",
      t("income") + " (RM)",
      t("expenses") + " (RM)",
      t("netWorth") + " (RM)",
      t("realWealth") + " (RM)",
      t("benchmark") + " (RM)",
      t("priceIndex"),
    ],
    ...game.history.map((r) => [
      r.elapsedMonths,
      (r.ageMonths / 12).toFixed(2),
      rm(r.cash),
      rm(r.assets),
      rm(r.liabilities),
      rm(r.income),
      rm(r.expenses),
      rm(r.netWorth),
      rm(r.realNetWorth),
      rm(r.benchmark),
      r.priceIndex,
    ]),
  ]);
}
