// Match the settlement engine's integer-sen rounding for fractional quantities.
export function orderValue(asset, quantity, price) {
  const scale = asset?.category === "crypto" ? 100 : 1;
  return Math.round((Math.round(quantity * scale) * price) / scale);
}
