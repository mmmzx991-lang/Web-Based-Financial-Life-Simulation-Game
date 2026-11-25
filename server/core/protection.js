import { depositStageEnd } from "../../public/chapters.js";
import { emergencyCover } from "../../public/protection.js";
import { demand } from "./finance.js";
import { random } from "./market.js";

export function setEmergencyCover(game, enabled) {
  demand(
    game.journey && game.elapsedMonths < depositStageEnd,
    "Protection is available in the first stage",
  );
  demand(
    game.status === "active" &&
      !game.pendingSettlement &&
      !game.remainingAdvance,
    "Resolve the current month first",
  );
  game.journey.emergencyCover = enabled;
}

export function settleEmergencyCover(game, ledger, month) {
  if (!game.journey || game.elapsedMonths >= depositStageEnd) return 0;

  const covered = game.journey.emergencyCover === true;
  const premium = covered ? emergencyCover.monthlyPremium : 0;
  // A separate stream keeps emergencies identical whether or not the player buys cover.
  const emergency =
    random(game.scenarioSeed, month, "personal-emergency") < 0.08;
  const cost = emergency
    ? 100000 +
      Math.floor(random(game.scenarioSeed, month, "emergency-cost") * 200001)
    : 0;
  const payout =
    covered && emergency
      ? Math.min(
          emergencyCover.payoutLimit,
          Math.round(
            (cost - emergencyCover.deductible) *
              emergencyCover.reimbursementRate,
          ),
        )
      : 0;

  ledger.protectionPremium = premium;
  ledger.emergencyCost = cost;
  ledger.protectionPayout = payout;
  ledger.expenses += premium + cost;
  ledger.income += payout;
  game.cash += payout;
  if (game.elapsedMonths + 1 === depositStageEnd)
    game.journey.emergencyCover = false;
  return premium + cost;
}
