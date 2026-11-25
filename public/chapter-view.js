import {
  legacyChapters,
  milestones,
  depositStageEnd,
  stockStageEnd,
  profitMedals,
  stage,
  depositRates,
} from "./chapters.js";
import { getLanguage, text, money } from "./i18n.js";
export const label = (en, zh) => (getLanguage() === "zh" ? zh : en);
export function goalLabel(c) {
  if (c.start >= 60)
    return label(
      "Living costs covered by investment income",
      "投资收入覆盖生活费",
    );
  if (c.start >= 45)
    return label("Cash growth plus debt repaid", "现金增长与减债");
  return label("Inflation-adjusted wealth growth", "实际财富增长");
}
function breakdown(c, r) {
  return `<p>${label("On-time bills", "按时付账")} ${r.paid}/40 · ${label("Cash reserve", "应急储备")} ${r.reserve}/35 · ${goalLabel(c)} ${r.goal}/25</p>`;
}
export function chapterPanel(g) {
  if (!g.journey) return "";
  const n = stage(g);
  const start = [0, depositStageEnd, stockStageEnd][n - 1];
  const end = [
    depositStageEnd,
    stockStageEnd,
    g.endAgeMonths - g.startAgeMonths,
  ][n - 1];
  const heading = [
    label("Fixed deposits", "定期存款"),
    label("Stock investing", "股票投资"),
    label("Open market", "综合交易"),
  ][n - 1];
  return `<section class="panel"><h2>${n} · ${heading}</h2><p>${label("Elapsed months", "累计月数")} ${g.elapsedMonths} / ${end}</p><progress value="${g.elapsedMonths - start}" max="${end - start}"></progress><p>${n < 3 ? label("Score and medal at month ", "阶段结算与奖章：第 ") + end + label("", " 个月") : label("Save and exit at any time.", "可随时保存并退出。")}</p></section>`;
}
export function resultCard(g) {
  const j = g.journey;
  const r = j.results.find((r) => r.id === j.notice);
  const m = [...milestones, ...legacyChapters].find((m) => m.id === r?.id);
  const awardNames = profitMedals
    .filter((m) => j.pendingMedals?.includes(m.id))
    .map((m) => `<p>🏅 ${text(m.name)}</p>`)
    .join("");
  return `${r && m ? `<h2>${label("Stage results", "阶段结算")} · ${r.total}/100</h2><p>🏅 ${text(m.name)} · ${label("Month", "第")} ${r.month}${label("", " 个月")}</p>${breakdown({ start: r.startAge ?? m.start }, r)}` : `<h2>${label("Medal earned", "获得新奖章")}</h2>`}${awardNames}<div class="action-row"><button class="button primary" data-chapter-continue>${label("Continue game", "继续游戏")}</button><button class="button secondary" data-save-exit>${label("Save and exit", "保存并退出")}</button></div>`;
}
export function medals(games, onlyEarned = false) {
  const results = games.flatMap((g) => g.results || []);
  const ids = new Set(games.flatMap((g) => g.achievements || []));
  const rows = [
    ...milestones,
    ...profitMedals,
    ...legacyChapters.filter((m) => results.some((r) => r.id === m.id)),
  ].map((m) => {
    const r = results.find((r) => r.id === m.id);
    const earned = r || ids.has(m.id);
    if (onlyEarned && !earned) return "";
    return `<details><summary>${earned ? "🏅" : "○"} ${text(m.name)}${r ? " · " + r.total + "/100" : ""}</summary>${r ? breakdown({ start: r.startAge ?? m.start }, r) : earned ? label("Earned", "已获得") : label("Locked", "未获得")}</details>`;
  });
  return `<section class="panel"><h2>${label("Chapter medals", "我的奖章")}</h2>${rows.join("")}</section>`;
}
export function depositPanel(g) {
  if (!g.journey) return "";
  return `<section class="panel"><h2>${label("Fixed deposits", "定期存款")}</h2><p>${label("At maturity, principal and interest return to cash before bills. Early withdrawal returns principal only.", "到期本息会在扣账单前转入现金。提前支取仅退还本金。")}</p><form class="inline-form" data-form="open-deposit"><label>RM <input name="amount" type="number" min="0.01" step="0.01" required></label><label>${label("Term", "期限")} <select name="term">${Object.entries(
    depositRates,
  )
    .map(
      ([term, rate]) =>
        `<option value="${term}">${term} ${label("months", "个月")} · ${(rate * 100).toFixed(1)}% ${label("annual", "年利率")}</option>`,
    )
    .join(
      "",
    )}</select></label><button type="submit" class="button primary">${label("Deposit", "办理定存")}</button></form>${g.journey.deposits.map((d) => `<p>${money(d.amount)} · ${label("Matures in month", "到期月份")} ${d.due} · ${label("Interest", "利息")} ${money(d.interest)} <button class="button secondary" data-action="redeem-deposit" data-deposit-id="${d.id}">${label("Withdraw early", "提前支取")}</button></p>`).join("")}</section>`;
}
