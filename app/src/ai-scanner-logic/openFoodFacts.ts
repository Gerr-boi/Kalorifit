import type { Barcode, NutritionResult } from "./types";
import { tryAcquire } from "../lib/rateLimiter";

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";

// Max 60 lookups / 60 s — OFF is a public API; respect their servers.
const RL_OFF = { maxPerWindow: 60, windowMs: 60_000, minIntervalMs: 50 };

// Fetch richer fields including ingredients, additives, NOVA, allergens
const FIELDS = [
  "product_name",
  "product_name_nb",       // Norwegian product name when available
  "brands",
  "image_front_url",
  "nutriments",
  "serving_size",          // e.g. "30 g" or "1 slice (28g)"
  "product_quantity",      // total package size e.g. "500 g"
  "ingredients_text",
  "ingredients_text_nb",   // Norwegian ingredients
  "additives_tags",
  "allergens_tags",
  "nova_group",
  "nova_groups",
  "categories_tags",
  "code",
].join(",");

export async function lookupOpenFoodFacts(barcode: Barcode): Promise<NutritionResult | null> {
  if (!tryAcquire("openfoodfacts:barcode", RL_OFF)) return null;

  const url = `${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(FIELDS)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "KaloriFit/1.0 (mobile app)" },
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.status !== 1 || !data.product) return null;

    return parseOFFProduct(data.product, barcode, data);
  } catch (err) {
    console.warn("OFF lookup failed:", err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Parse an OFF product object into our NutritionResult */
export function parseOFFProduct(
  p: Record<string, unknown>,
  barcode?: string,
  rawData?: unknown
): NutritionResult | null {
  const nutr = (p.nutriments as Record<string, unknown>) ?? {};

  // Prefer Norwegian name if present
  const name =
    (p.product_name_nb as string | undefined) ||
    (p.product_name as string | undefined) ||
    "Ukjent produkt";

  const kcal = nutr["energy-kcal_100g"];
  const protein = nutr["proteins_100g"];
  const carbs = nutr["carbohydrates_100g"];
  const fat = nutr["fat_100g"];
  const fiber = nutr["fiber_100g"];
  const sugars = nutr["sugars_100g"];
  const saturatedFat = nutr["saturated-fat_100g"];
  const salt = nutr["salt_100g"];
  const sodium = nutr["sodium_100g"];

  const kcalNum =
    typeof kcal === "number"
      ? kcal
      : typeof nutr["energy_100g"] === "number"
        ? (nutr["energy_100g"] as number) / 4.184
        : NaN;

  // Ingredients text — prefer Norwegian
  const ingredientsText =
    (p.ingredients_text_nb as string | undefined) ||
    (p.ingredients_text as string | undefined) ||
    undefined;

  // Additives — OFF returns tags like ["en:e471", "en:e322"] → ["E471", "E322"]
  const additiveTags = Array.isArray(p.additives_tags) ? (p.additives_tags as string[]) : [];
  const additives = additiveTags
    .map((t) => t.replace(/^[a-z]{2}:/, "").toUpperCase())
    .filter((t) => /^E\d/.test(t));

  // Allergens — OFF returns tags like ["en:gluten", "en:milk"]
  const allergenTags = Array.isArray(p.allergens_tags) ? (p.allergens_tags as string[]) : [];
  const allergens = allergenTags
    .map((t) => t.replace(/^[a-z]{2}:/, "").toLowerCase())
    .filter(Boolean);

  // NOVA group from OFF
  const novaRaw = p.nova_group ?? p.nova_groups;
  const novaGroup =
    typeof novaRaw === "number" && novaRaw >= 1 && novaRaw <= 4
      ? (novaRaw as 1 | 2 | 3 | 4)
      : undefined;

  const imageFrontUrl = (p.image_front_url as string | undefined) || undefined;

  // Serving size — OFF returns strings like "30 g", "1 portion (200ml)", "2 biscuits (28 g)"
  // Extract the first numeric gram/ml value found.
  const servingSizeRaw = p.serving_size as string | undefined;
  const servingSize_g = parseServingSize(servingSizeRaw);

  if (!Number.isFinite(kcalNum)) {
    return {
      source: "openfoodfacts",
      barcode,
      name,
      brand: (p.brands as string | undefined) ?? undefined,
      servingSize_g: servingSize_g ?? undefined,
      ingredients: ingredientsText,
      additives: additives.length > 0 ? additives : undefined,
      allergens: allergens.length > 0 ? allergens : undefined,
      imageFrontUrl,
      confidence: 0.55,
      raw: rawData ?? p,
    };
  }

  const result: NutritionResult = {
    source: "openfoodfacts",
    barcode,
    name,
    brand: (p.brands as string | undefined) ?? undefined,
    servingSize_g: servingSize_g ?? undefined,
    per100g: {
      kcal: Math.round(kcalNum),
      protein_g: typeof protein === "number" ? protein : undefined,
      carbs_g: typeof carbs === "number" ? carbs : undefined,
      fat_g: typeof fat === "number" ? fat : undefined,
      fiber_g: typeof fiber === "number" ? fiber : undefined,
      sugars_g: typeof sugars === "number" ? sugars : undefined,
      saturated_fat_g: typeof saturatedFat === "number" ? saturatedFat : undefined,
      salt_g: typeof salt === "number" ? salt : undefined,
      sodium_mg: typeof sodium === "number" ? Math.round((sodium as number) * 1000) : undefined,
    },
    ingredients: ingredientsText,
    additives: additives.length > 0 ? additives : undefined,
    allergens: allergens.length > 0 ? allergens : undefined,
    imageFrontUrl,
    confidence: 0.85,
    raw: rawData ?? p,
  };

  // Attach NOVA from API — the resolver will fill in full ProcessingInfo
  if (novaGroup) {
    result.processingInfo = {
      novaGroup,
      isUltraProcessed: novaGroup === 4,
      detectedAdditives: additives,
      detectedMarkers: [`OpenFoodFacts NOVA ${novaGroup}`],
      confidence: 0.80,
      explanation: novaGroupLabel(novaGroup),
    };
  }

  return result;
}

/**
 * Extract a gram/ml serving size from strings like:
 *   "30 g", "30g", "1 slice (28 g)", "200 ml", "2 biscuits (28g)"
 * Returns the parenthesised value first (more specific), then the first bare number.
 * Returns null when nothing parseable is found.
 */
function parseServingSize(raw: string | undefined): number | null {
  if (!raw) return null;
  // Prefer value inside parentheses: "(28 g)" or "(200ml)"
  const parenMatch = raw.match(/\((\d+(?:[.,]\d+)?)\s*(?:g|ml|gr)\)/i);
  if (parenMatch) {
    const v = parseFloat(parenMatch[1].replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  // Fall back to first bare "NNN g" or "NNN ml"
  const bareMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:g|ml|gr)\b/i);
  if (bareMatch) {
    const v = parseFloat(bareMatch[1].replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return null;
}

function novaGroupLabel(n: 1 | 2 | 3 | 4): string {
  switch (n) {
    case 1: return "Minimalt prosessert (NOVA 1).";
    case 2: return "Kulinarisk ingrediens (NOVA 2).";
    case 3: return "Prosessert matvare (NOVA 3).";
    case 4: return "Ultra-prosessert (NOVA 4).";
  }
}
