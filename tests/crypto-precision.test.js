import test from "node:test";
import assert from "node:assert/strict";
import { ASSETS, SETTINGS } from "../server/core/config.js";
import {
  createGame,
  advance,
  trade,
  act,
  report,
} from "../server/core/simulation.js";
import { fee, settleBaseline, values } from "../server/core/finance.js";
import { hash } from "../server/core/market.js";

const crypto = ASSETS.filter((asset) => asset.category === "crypto");
const order = (
  game,
  quantity,
  side = "buy",
  assetId = crypto[0].id,
  leverage = 1,
) => trade(game, { assetId, quantity, side, leverage });

test("new games isolate the standard v3 market without changing save format", () => {
  const game = createGame();
  assert.equal(game.version, 2);
  assert.equal(game.marketVersion, 3);
  assert.equal(game.scenarioSeed, hash("full-life|normal|standard-v3"));
  delete game.marketVersion;
  assert.doesNotThrow(() => order(game, 1));
});

test("crypto accepts exact hundredths including decimal floating point edges", () => {
  for (const asset of crypto) {
    for (const quantity of [0.01, 0.1, 0.29, 1.01, 2]) {
      const game = order(
        createGame({ difficulty: "easy" }),
        quantity,
        "buy",
        asset.id,
      );
      assert.equal(game.holdings[asset.id].quantity, quantity);
      assert.equal(game.holdings[asset.id].lockedQuantity, quantity);
    }
  }
});

test("invalid crypto steps and nonnumeric quantities cannot enter accounting", () => {
  const original = createGame({ difficulty: "easy" });
  for (const quantity of [
    0,
    -0.01,
    1e-18,
    0.001,
    0.015,
    0.299,
    NaN,
    Infinity,
    -Infinity,
    "0.01",
    null,
    100000000.01,
  ]) {
    assert.throws(() => order(original, quantity), /quantity/i);
  }
  for (const asset of ASSETS.filter((asset) => asset.category !== "crypto")) {
    assert.throws(
      () => order(original, 0.01, "buy", asset.id),
      /integer|quantity/i,
    );
    assert.throws(
      () => order(original, 1.0000000000000002, "buy", asset.id),
      /integer|quantity/i,
    );
    assert.doesNotThrow(() => order(original, 1, "buy", asset.id));
  }
  assert.deepEqual(original.holdings, {});
});

test("fractional quantity totals and sell eligibility use exact hundredths", () => {
  let game = order(createGame({ difficulty: "easy" }), 0.1);
  game = order(game, 0.2);
  assert.equal(game.holdings[crypto[0].id].quantity, 0.3);
  assert.equal(game.holdings[crypto[0].id].lockedQuantity, 0.3);
  assert.throws(() => order(game, 0.01, "sell"), /locked|eligible/i);
  game = advance(game, 1);
  game = order(game, 0.29);
  game = order(game, 0.3, "sell");
  assert.equal(game.holdings[crypto[0].id].quantity, 0.29);
  assert.equal(game.holdings[crypto[0].id].lockedQuantity, 0.29);
  assert.throws(() => order(game, 0.01, "sell"), /locked|eligible/i);
  game = advance(game, 1);
  game = order(game, 0.29, "sell");
  assert.equal(game.holdings[crypto[0].id], undefined);
});

test("partial eligible sales have no floating point residue or phantom eligibility", () => {
  let game = order(createGame({ difficulty: "easy" }), 1.01);
  game = advance(game, 1);
  for (let i = 0; i < 100; i++) game = order(game, 0.01, "sell");
  assert.equal(game.holdings[crypto[0].id].quantity, 0.01);
  game = order(game, 0.01, "sell");
  assert.equal(game.holdings[crypto[0].id], undefined);
  assert.throws(() => order(game, 0.01, "sell"), /eligible/i);
});

test("fractional trades round exposure once and charge each fee once across history", () => {
  let game = createGame({ difficulty: "easy" });
  const id = crypto[0].id;
  game.prices[id] = 12345;
  const originalCash = game.cash;
  game = order(game, 0.29);
  const exposure = Math.round(12345 * 0.29),
    buyFee = fee(exposure);
  assert.equal(game.cash, originalCash - exposure - buyFee);
  assert.equal(game.actionLedger.fees, buyFee);
  assert.equal(report(game).portfolioValue, exposure);
  assert.equal(report(game).netWorth, originalCash - buyFee);
  game = advance(game, 1);
  assert.equal(game.history.at(-1).fees, buyFee);
  const beforeSale = game.cash,
    sellExposure = Math.round(game.prices[id] * 0.29),
    sellFee = fee(sellExposure);
  game = order(game, 0.29, "sell");
  assert.equal(game.cash, beforeSale + sellExposure - sellFee);
  const closed = structuredClone(game.history);
  assert.equal(game.actionLedger.fees, sellFee);
  game = advance(game, 1);
  assert.equal(game.history.at(-1).fees, sellFee);
  assert.deepEqual(game.history.slice(0, -1), closed);
  game = advance(game, 1);
  assert.equal(game.history.at(-1).fees, 0);
  for (const row of game.history)
    for (const field of [
      "cash",
      "portfolioValue",
      "assets",
      "liabilities",
      "netWorth",
      "fees",
      "expenses",
    ])
      assert.ok(Number.isSafeInteger(row[field]), `${field}: ${row[field]}`);
});

test("portfolio rounds each holding boundary rather than summing fractional sen", () => {
  const game = createGame();
  for (const asset of crypto) {
    game.holdings[asset.id] = {
      quantity: 0.01,
      lockedQuantity: 0,
      averageCost: 1050,
    };
    game.prices[asset.id] = 1050;
  }
  assert.equal(values(game).portfolioValue, crypto.length * 11);
});

test("notional half-sen ties use exact hundredths and zero-sen orders are rejected", () => {
  let game = createGame();
  const id = crypto[0].id;
  game.prices[id] = 50;
  const cash = game.cash;
  game = order(game, 0.29);
  assert.equal(cash - game.cash, 15 + fee(15));
  assert.equal(report(game).portfolioValue, 15);
  game.prices[id] = 1;
  assert.throws(() => order(game, 0.01), /small|sen/i);
});

test("fractional purchase averages retain weighted cost and exact quantities", () => {
  let game = createGame({ difficulty: "easy" });
  const id = crypto[0].id;
  game.prices[id] = 12345;
  game = order(game, 0.1);
  const first = game.holdings[id];
  game.prices[id] = 18765;
  game = order(game, 0.2);
  assert.equal(
    game.holdings[id].averageCost,
    Math.round((0.1 * first.averageCost + Math.round(0.2 * 18765)) / 0.3),
  );
  assert.equal(game.holdings[id].quantity, 0.3);
});

test("fractional leveraged positions preserve lock, margin cap, close rounding and fees", () => {
  for (const leverage of [2, 3]) {
    let game = createGame({ difficulty: "easy" });
    const id = crypto[0].id;
    game.prices[id] = 12345;
    const originalCash = game.cash,
      exposure = Math.round(12345 * 0.29);
    game = order(game, 0.29, "buy", id, leverage);
    const position = game.positions[0];
    assert.equal(position.quantity, 0.29);
    assert.equal(position.margin, Math.round(exposure / leverage));
    assert.equal(game.cash, originalCash - position.margin - fee(exposure));
    assert.equal(report(game).portfolioValue, position.margin);
    assert.throws(
      () => act(game, { type: "close-position", positionId: position.id }),
      /locked/i,
    );
    game = advance(game, 1);
    game.prices[id] = 14567;
    const before = game.cash,
      equity = Math.max(
        0,
        Math.round(position.margin + 0.29 * (14567 - 12345)),
      );
    const closeFee = Math.min(equity, fee(Math.round(14567 * 0.29)));
    game = act(game, { type: "close-position", positionId: position.id });
    assert.equal(game.cash, before + equity - closeFee);
    assert.equal(game.actionLedger.fees, closeFee);
    assert.equal(game.positions.length, 0);
    assert.equal(report(game).liabilities, 0);
    assert.throws(() => order(game, 0.01, "buy", id, 4), /leverage/i);
  }
});

test("fractional leverage liquidation never creates debt or fractional cash", () => {
  let game = order(
    createGame({ difficulty: "easy" }),
    0.29,
    "buy",
    crypto[0].id,
    3,
  );
  game.positions[0].entryPrice *= 100;
  game = advance(game, 1);
  assert.equal(game.positions.length, 0);
  assert.equal(game.stats.forcedLiquidations, 1);
  assert.equal(report(game).liabilities, 0);
  assert.ok(Number.isSafeInteger(game.cash));
});

test("tiny leveraged notionals still require at least one sen of margin", () => {
  const game = createGame();
  game.prices[crypto[0].id] = 100;
  const bought = order(game, 0.01, "buy", crypto[0].id, 3);
  assert.equal(bought.positions[0].margin, 1);
  assert.equal(report(bought).portfolioValue, 1);
  assert.equal(game.cash - bought.cash, 1 + fee(1));
});

test("baseline properties follow the same macro valuation with legacy fallback", () => {
  for (const propertyReturn of [-0.02, 0, 0.01, undefined]) {
    const game = createGame({ mode: "wealth-building" });
    game.macro = { propertyReturn };
    const opening = game.baseline.properties[0].value;
    settleBaseline(game);
    assert.equal(
      game.baseline.properties[0].value,
      Math.round(
        opening * (1 + (propertyReturn ?? SETTINGS.propertyAnnualGrowth / 12)),
      ),
    );
  }
});
