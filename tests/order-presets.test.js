import test from "node:test";
import assert from "node:assert/strict";
import * as math from "../public/order-math.js";
const coin = { category: "crypto" },
  stock = { category: "stock" };
test("maximum order includes margin and fee and respects the next quantity step", () => {
  for (const asset of [coin, stock])
    for (const leverage of [1, 2, 3])
      for (const cash of [0, 1, 2, 100, 101, 10001, 234567]) {
        const price = 12345,
          q = math.maximumQuantity(asset, price, cash, leverage),
          scale = asset.category === "crypto" ? 100 : 1;
        const cost = (q) => {
          const v = math.orderValue(asset, q, price);
          return (
            Math.max(1, Math.round(v / leverage)) +
            Math.max(100, Math.round(v * 0.0025))
          );
        };
        assert.ok(q === 0 || cost(q) <= cash);
        assert.ok(cost((Math.round(q * scale) + 1) / scale) > cash);
      }
});
test("maximum quantity never recommends a zero-sen crypto order", () => {
  assert.equal(math.maximumQuantity(coin, 1, 100, 3), 0);
  const q = math.maximumQuantity(coin, 1, 101, 3);
  assert.ok(math.orderValue(coin, q, 1) > 0);
});

test("trade fees use integer sen and the RM1 minimum", () => {
  for (const [value, expected] of [
    [20000, 100],
    [40000, 100],
    [41500, 104],
    [100000, 250],
  ]) {
    assert.equal(math.tradeFee(value), expected);
  }
});
