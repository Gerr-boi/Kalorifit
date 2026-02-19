import type { Barcode, NutritionResult } from "./types";
import { getCached, setCached } from "./cache";
import { lookupOpenFoodFacts } from "./openFoodFacts";
import { lookupKassalapp } from "./kassalapp";

export async function resolveBarcode(barcode: Barcode): Promise<NutritionResult | null> {
  const cached = getCached(barcode);
  if (cached) return cached;

  // 1) Open Food Facts
  const off = await lookupOpenFoodFacts(barcode);
  if (off) {
    setCached(barcode, off);
    return off;
  }

  // 2) Kassalapp (optional)
  const kas = await lookupKassalapp(barcode);
  if (kas) {
    setCached(barcode, kas);
    return kas;
  }

  return null;
}