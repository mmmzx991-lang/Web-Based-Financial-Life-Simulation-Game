import {
  milestones,
  profitMedals,
  depositRates,
} from "../../public/chapters.js";
import { livingCost } from "./config.js";
import { demand, money, nextId } from "./finance.js";

export function openDeposit(game, action) {
  const amount = money(action.amount);
  demand(game.journey && [3, 12].includes(action.term), "Invalid deposit term");
  demand(amount <= game.cash, "Insufficient cash");
  game.cash -= amount;
  game.journey.deposits.push({
    id: nextId(game, "term"),
    amount,
    due: game.marketMonth + action.term,
    interest: Math.round(
      (amount * depositRates[action.term] * action.term) / 12,
    ),
  });
}
export function redeemDeposit(game, id) {
  const deposits = game.journey?.deposits;
  const index = deposits?.findIndex((d) => d.id === id) ?? -1;
  demand(index >= 0, "Unknown deposit");
  game.cash += deposits.splice(index, 1)[0].amount;
}
export function matureDeposits(game, month) {
  if (!game.journey) return 0;
  let interest = 0;
  game.journey.deposits = game.journey.deposits.filter((d) => {
    if (d.due > month) return true;
    game.cash += d.amount + d.interest;
    interest += d.interest;
    return false;
  });
  return interest;
}
export function finishChapter(game) {
  const journey = game.journey;
  if (!journey || game.status === "bankrupt") return;
  const c = milestones.find((m) => m.month === game.elapsedMonths);
  if (!c || journey.results.some((r) => r.id === c.id)) return;
  const prior = milestones.findLast((m) => m.month < c.month);
  const count = c.month - (prior?.month ?? 0);
  const startAge = (game.ageMonths - count) / 12;
  const months = game.history.slice(-count);
  const opening = game.history[game.history.length - count - 1];
  const end = months.at(-1);
  const cost = livingCost(Math.floor((game.ageMonths - 1) / 12));
  const points = (max, fraction) =>
    Math.round(max * Math.min(1, Math.max(0, fraction)));
  const paid = points(
    40,
    1 - (game.stats.unpaidMonths - journey.openingUnpaid) / count,
  );
  const reserve = points(35, (game.cash + game.savings) / (3 * cost));
  // Working chapters compare real growth against three months of living costs.
  // Retirement chapters reward coverage of living costs by non-salary income.
  const goal =
    startAge >= 60
      ? points(
          25,
          months.reduce(
            (s, m) =>
              s +
              Math.min(
                1,
                (m.rent +
                  m.dividends +
                  m.savingsInterest +
                  m.retirementInterest +
                  Math.max(0, m.businessRevenue - m.businessCosts)) /
                  Math.max(1, m.livingCost),
              ),
            0,
          ) / count,
        )
      : startAge >= 45
        ? points(
            25,
            (opening.liabilities - end.liabilities + end.cash - opening.cash) /
              (3 * cost),
          )
        : points(25, (end.realNetWorth - opening.realNetWorth) / (3 * cost));
  journey.results.push({
    id: c.id,
    startAge,
    month: game.elapsedMonths,
    paid,
    reserve,
    goal,
    total: paid + reserve + goal,
  });
  journey.openingUnpaid = game.stats.unpaidMonths;
  journey.notice = c.id;
  journey.carry = game.status === "completed" ? 0 : game.remainingAdvance;
  game.remainingAdvance = 0;
}

export function recordTradingProfit(game, assetId, amount) {
  const j = game.journey;
  if (!j) return;
  const totals = (j.profit ??= { net: 0, btc: 0 });
  totals.net += amount;
  if (assetId === "bitcoin") totals.btc += amount;
  const awards = (j.achievements ??= []);
  for (const medal of profitMedals) {
    if (totals[medal.field] < medal.target || awards.includes(medal.id))
      continue;
    awards.push(medal.id);
    (j.pendingMedals ??= []).push(medal.id);
    j.notice ??= medal.id;
  }
}
