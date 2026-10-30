import { orderValue } from "./order-math.js";
export function positionMetrics(asset, p, price, ratio = 0.15) {
  const pnl =
    orderValue(asset, p.quantity, price - p.entryPrice) +
    (p.roundingAdjustment || 0);
  const equity = Math.max(0, p.margin + pnl),
    exposure = orderValue(asset, p.quantity, price);
  // Binary search the exact monthly threshold, including integer-sen ties.
  let low = 0,
    high = Math.max(p.entryPrice, price);
  const equityAt = (x) =>
    Math.max(
      0,
      p.margin +
        orderValue(asset, p.quantity, x - p.entryPrice) +
        (p.roundingAdjustment || 0),
    );
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (equityAt(mid) <= p.margin * ratio) low = mid;
    else high = mid - 1;
  }
  const liquidationPrice = equityAt(0) <= p.margin * ratio ? low : null;
  return {
    pnl: equity - p.margin,
    equity,
    exposure,
    roi: (equity - p.margin) / p.margin,
    liquidationPrice,
    marginRatio: equity / p.margin,
    risk:
      equity <= p.margin * ratio
        ? "liquidating"
        : equity <= p.margin * 0.4
          ? "danger"
          : equity <= p.margin * 0.7
            ? "watch"
            : "healthy",
  };
}
export function closeQuote(
  asset,
  p,
  price,
  quantity = p.quantity,
  feeRate = 0.002,
) {
  const scale = asset.category === "crypto" ? 100 : 1,
    total = Math.round(p.quantity * scale),
    units = Math.round(quantity * scale);
  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    units <= 0 ||
    units > total ||
    Math.abs(quantity * scale - units) >
      Number.EPSILON * Math.max(1, Math.abs(quantity * scale)) * 4
  )
    throw Error("Invalid close quantity");
  const metrics = positionMetrics(asset, p, price),
    remainingUnits = total - units;
  const margin = remainingUnits
    ? Math.round((p.margin * units) / total)
    : p.margin;
  const equity = remainingUnits
    ? Math.round((metrics.equity * units) / total)
    : metrics.equity;
  const remainingMargin = p.margin - margin,
    remainingEquity = metrics.equity - equity,
    remainingQuantity = remainingUnits / scale;
  if (remainingUnits && remainingMargin < 1)
    throw Error("Close the entire position; remaining margin is too small");
  const remaining = remainingUnits
    ? {
        ...p,
        quantity: remainingQuantity,
        margin: remainingMargin,
        roundingAdjustment:
          remainingEquity -
          remainingMargin -
          orderValue(asset, remainingQuantity, price - p.entryPrice),
      }
    : null;
  const exposure = orderValue(asset, units / scale, price),
    fee = Math.min(equity, Math.max(1, Math.round(exposure * feeRate)));
  return {
    quantity: units / scale,
    margin,
    equity,
    fee,
    proceeds: equity - fee,
    pnl: equity - margin,
    remaining,
  };
}
