import type { Barcode, NutritionResult } from "./types";

const cache = new Map<Barcode, { value: NutritionResult; expiresAt: number }>();
const TTL_MS = 1000 * 60 * 60 * 24; // 24h

export function getCached(barcode: Barcode) {
  const hit = cache.get(barcode);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(barcode);
    return null;
  }
  return hit.value;
}

export function setCached(barcode: Barcode, value: NutritionResult) {
  cache.set(barcode, { value, expiresAt: Date.now() + TTL_MS });
}
