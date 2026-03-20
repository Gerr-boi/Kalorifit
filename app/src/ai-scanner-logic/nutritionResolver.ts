import type { Barcode, EvidenceSignal, NutritionResult } from "./types";
import { getCached, setCached } from "./cache";
import { lookupFoodRepoByBarcode } from "./foodRepo";
import { lookupOpenFoodFacts } from "./openFoodFacts";
import { lookupKassalapp } from "./kassalapp";
import { classifyNova } from "./novaClassifier";
import { annotateResult } from "./evidenceMerger";

/**
 * Resolve a barcode to a NutritionResult.
 *
 * OFF and Kassalapp are fetched in parallel for speed.
 * Best result is picked by data completeness (macros > no macros) with OFF
 * preferred when both have equal completeness (larger global DB, more fields).
 * FoodRepo is tried as a serial fallback only when both fail.
 *
 * After a hit is found, NOVA classification is enriched/computed from
 * ingredients + additives if not already supplied by the source.
 */
export async function resolveBarcode(barcode: Barcode): Promise<NutritionResult | null> {
  const cached = getCached(barcode);
  if (cached) return cached;

  const signal: EvidenceSignal = {
    type: "barcode",
    source: "",
    confidence: 1.0,
  };

  // Fetch OFF and Kassalapp in parallel for speed
  const [off, kas] = await Promise.all([
    lookupOpenFoodFacts(barcode),
    lookupKassalapp(barcode),
  ]);

  const best = pickBestBarcodeResult(off, kas);
  if (best) {
    const enriched = enrichWithNova(annotateResult(best.result, [{ ...signal, source: best.source }]));
    setCached(barcode, enriched);
    return enriched;
  }

  // FoodRepo — optional, less common, not worth parallelizing with the main pair
  const repo = await lookupFoodRepoByBarcode(barcode);
  if (repo) {
    const enriched = enrichWithNova(annotateResult(repo, [{ ...signal, source: "FoodRepo" }]));
    setCached(barcode, enriched);
    return enriched;
  }

  return null;
}

/**
 * Pick the best result from two candidates.
 * Prefers the one with macro data; when both have macros, OFF wins (richer fields).
 */
function pickBestBarcodeResult(
  off: NutritionResult | null,
  kas: NutritionResult | null,
): { result: NutritionResult; source: string } | null {
  if (!off && !kas) return null;
  if (!off) return { result: kas!, source: "Kassalapp" };
  if (!kas) return { result: off, source: "OpenFoodFacts" };

  const offHasMacros = (off.per100g?.kcal ?? 0) > 0;
  const kasHasMacros = (kas.per100g?.kcal ?? 0) > 0;

  // If only Kassalapp has macro data, prefer it
  if (!offHasMacros && kasHasMacros) return { result: kas, source: "Kassalapp" };

  // Otherwise prefer OFF (larger DB, more fields like NOVA, allergens, additives)
  return { result: off, source: "OpenFoodFacts" };
}

/**
 * Enriches a result with NOVA/processing classification.
 * If the result already has processingInfo from the source API,
 * we still run our classifier and blend the results when more
 * ingredient data is available.
 */
export function enrichWithNova(result: NutritionResult): NutritionResult {
  const apiNovaGroup = result.processingInfo?.novaGroup;

  const processing = classifyNova({
    ingredients: result.ingredients,
    productName: result.name,
    apiAdditives: result.additives,
    apiNovaGroup,
  });

  // If we already had API NOVA and our classifier agrees, boost confidence
  if (apiNovaGroup && processing.novaGroup === apiNovaGroup) {
    processing.confidence = Math.min(0.95, processing.confidence + 0.10);
  }

  // If API had higher confidence and a meaningful explanation already, keep it
  const existingConf = result.processingInfo?.confidence ?? 0;
  if (apiNovaGroup && existingConf >= processing.confidence && result.processingInfo?.detectedMarkers.length) {
    // Merge: keep API confidence, use our richer explanation when we found markers
    const merged = processing.detectedMarkers.length > 1 ? processing : result.processingInfo!;
    return { ...result, processingInfo: { ...merged, confidence: Math.max(existingConf, processing.confidence) } };
  }

  return { ...result, processingInfo: processing };
}
