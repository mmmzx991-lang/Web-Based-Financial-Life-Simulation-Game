import { ASSETS } from "./config.js";

const scales = new Map(
  ASSETS.map((asset) => [asset.id, asset.category === "crypto" ? 100 : 1]),
);

export const quantityScale = (assetId) => scales.get(assetId) || 1;
export const quantityUnits = (assetId, quantity) =>
  Math.round(quantity * quantityScale(assetId));
export const quantityFromUnits = (assetId, units) =>
  units / quantityScale(assetId);

// Multiply integer quantity steps before rounding money, preserving half-sen ties.
export const holdingValue = (assetId, quantity, price) =>
  Math.round(
    (quantityUnits(assetId, quantity) * price) / quantityScale(assetId),
  );
