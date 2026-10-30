// Match the settlement engine's integer-sen rounding for fractional quantities.
export function orderValue(asset, quantity, price) {
  const scale = asset?.category === "crypto" ? 100 : 1;
  return Math.round((Math.round(quantity * scale) * price) / scale);
}
export function maximumQuantity(
  asset,
  price,
  cash,
  leverage = 1,
  feeRate = 0.002,
  maximumAmount = 1e12,
) {
  if (
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(cash) ||
    cash < 2
  )
    return 0;
  const scale = asset.category === "crypto" ? 100 : 1;
  let lo = 0,
    hi = 100000000 * scale;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2),
      value = orderValue(asset, mid / scale, price),
      cost =
        Math.max(1, Math.round(value / leverage)) +
        Math.max(1, Math.round(value * feeRate));
    if (value <= maximumAmount && cost <= cash) lo = mid;
    else hi = mid - 1;
  }
  return orderValue(asset, lo / scale, price) > 0 ? lo / scale : 0;
}
