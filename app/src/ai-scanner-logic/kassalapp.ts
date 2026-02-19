import type { Barcode, NutritionResult } from "./types";

/**
 * Placeholder. Wire this up later if you get Kassalapp access.
 * Return null if not available.
 */
export async function lookupKassalapp(_barcode: Barcode): Promise<NutritionResult | null> {
  return null;
}