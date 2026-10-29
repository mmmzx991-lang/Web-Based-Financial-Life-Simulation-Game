import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  trade,
  act,
  report,
} from "../server/core/simulation.js";
import { MODES, ASSETS, livingCost } from "../server/core/config.js";

test("exact proposal openings and initial ledger", () => {
  const expected = {
    easy: [10000000, 500000, 22000000, 40000000, 2, 3],
    normal: [6000000, 450000, 14000000, 28000000, 1, 2],
    hard: [3500000, 380000, 7000000, 17000000, 0, 1],
    expert: [2000000, 320000, 4000000, 9000000, 0, 1],
  };
  for (const [
    difficulty,
    [cash, salary, cash45, cash60, p45, p60],
  ] of Object.entries(expected)) {
    const young = createGame({ difficulty });
    assert.equal(young.version, 2);
    assert.equal(young.cash, cash);
    assert.equal(young.monthlySalary, salary);
    assert.equal(young.history.length, 1);
    assert.equal(young.history[0].elapsedMonths, 0);
    assert.deepEqual(young.holdings, {});
    const middle = createGame({ mode: "wealth-building", difficulty });
    assert.equal(middle.cash, cash45);
    assert.equal(middle.properties.length, p45);
    assert.equal(middle.monthlySalary, Math.round(salary * 1.025 ** 23));
    const retired = createGame({ mode: "retirement", difficulty });
    assert.equal(retired.cash, cash60);
    assert.equal(retired.properties.length, p60);
    assert.equal(retired.monthlySalary, 0);
    assert.equal(
      report(retired).liabilities,
      difficulty === "expert" ? 12000000 : 0,
    );
  }
});
test("catalog has exact categories, bilingual names and leverage limits", () => {
  assert.equal(ASSETS.length, 15);
  assert.equal(ASSETS.filter((a) => a.category === "stock").length, 6);
  assert.deepEqual(
    ASSETS.filter((a) => a.category === "commodity").map((a) => a.id),
    ["crude-oil", "natural-gas", "silver", "copper", "wheat", "corn"],
  );
  assert.ok(
    ASSETS.every(
      (a) =>
        a.name.en &&
        a.name.zh &&
        a.maxLeverage === (a.category === "crypto" ? 3 : 2),
    ),
  );
});
test("expense, salary growth and retirement boundaries", () => {
  assert.deepEqual(
    [44, 45, 59, 60].map(livingCost),
    [200000, 300000, 300000, 250000],
  );
  let game = createGame({ difficulty: "easy" });
  game.ageMonths = 275;
  game = advance(game, 1);
  assert.equal(game.monthlySalary, 512500);
  game = createGame({ difficulty: "easy" });
  game.ageMonths = 719;
  game = advance(game, 3);
  assert.deepEqual(
    game.history.slice(1).map((m) => m.salary),
    [500000, 0, 0],
  );
  assert.deepEqual(
    game.history.slice(1).map((m) => m.livingCost),
    [300000, 250000, 250000],
  );
  assert.equal(game.monthlySalary, 0);
});
test("three months equals three singles immutably", () => {
  const game = createGame(),
    before = structuredClone(game);
  assert.deepEqual(advance(game, 3), advance(advance(advance(game, 1), 1), 1));
  assert.deepEqual(game, before);
});
test("public market path is action independent", () => {
  let idle = createGame({ difficulty: "easy" }),
    active = trade(createGame({ difficulty: "easy" }), {
      assetId: ASSETS[0].id,
      side: "buy",
      quantity: 10,
    });
  active = act(active, { type: "start-business", businessType: "coffee-shop" });
  for (let i = 0; i < 5; i++) {
    idle = advance(idle, 1);
    active = advance(active, 1);
  }
  assert.deepEqual(active.prices, idle.prices);
  assert.deepEqual(active.news, idle.news);
  assert.equal(active.priceIndex, idle.priceIndex);
});
test("new holdings locked; fee once; invalid quantities rejected", () => {
  const original = createGame();
  let game = trade(original, {
    assetId: ASSETS[0].id,
    side: "buy",
    quantity: 2,
  });
  assert.equal(game.holdings[ASSETS[0].id].lockedQuantity, 2);
  assert.ok(report(game).netWorth < report(original).netWorth);
  assert.throws(
    () => trade(game, { assetId: ASSETS[0].id, side: "sell", quantity: 1 }),
    /locked|eligible/i,
  );
  game = advance(game, 1);
  assert.equal(game.holdings[ASSETS[0].id].lockedQuantity, 0);
  game = trade(game, { assetId: ASSETS[0].id, side: "sell", quantity: 2 });
  assert.equal(game.holdings[ASSETS[0].id]?.quantity || 0, 0);
  for (const quantity of [-1, 0, 1.5, Infinity])
    assert.throws(() =>
      trade(original, { assetId: ASSETS[0].id, side: "buy", quantity }),
    );
});
test("all modes stop at exclusive endpoint", () => {
  for (const [mode, [start, end]] of Object.entries(MODES)) {
    let game = createGame({ mode, difficulty: "easy" });
    assert.equal(game.ageMonths, start * 12);
    game.ageMonths = end * 12 - 1;
    game = advance(game, 3);
    assert.equal(game.ageMonths, end * 12);
    assert.equal(game.status, "completed");
    assert.equal(report(game).completed, true);
    assert.equal(report(game).bankrupt, false);
    assert.throws(() => advance(game, 1));
    assert.throws(() =>
      trade(game, { assetId: ASSETS[0].id, side: "buy", quantity: 1 }),
    );
  }
});
test("invalid setup/actions rejected", () => {
  for (const options of [{ mode: "x" }, { difficulty: "x" }, { ruleset: "x" }])
    assert.throws(() => createGame(options));
  const game = createGame();
  assert.throws(() => advance(game, 2));
  assert.throws(() => act(game, { type: "unknown" }));
  for (const amount of [-1, 0, 1.5, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => act(game, { type: "savings-deposit", amount }));
});
