import type { Barcode, NutritionResult } from "./types";

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";

export async function lookupOpenFoodFacts(barcode: Barcode): Promise<NutritionResult | null> {
  const fields = [
    "product_name",
    "brands",
    "image_url",
    "nutriments",
    "code",
  ].join(",");

  const url = `${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`;

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

    const p = data.product;
    const nutr = p.nutriments ?? {};

    const kcal = nutr["energy-kcal_100g"];
    const protein = nutr["proteins_100g"];
    const carbs = nutr["carbohydrates_100g"];
    const fat = nutr["fat_100g"];

    const kcalNum =
      typeof kcal === "number"
        ? kcal
        : typeof nutr["energy_100g"] === "number"
          ? nutr["energy_100g"] / 4.184
          : NaN;

    if (!Number.isFinite(kcalNum)) {
      return {
        source: "openfoodfacts",
        barcode,
        name: p.product_name ?? "Unknown product",
        brand: p.brands ?? undefined,
        confidence: 0.55,
        raw: data,
      };
    }

    return {
      source: "openfoodfacts",
      barcode,
      name: p.product_name ?? "Unknown product",
      brand: p.brands ?? undefined,
      per100g: {
        kcal: Math.round(kcalNum),
        protein_g: typeof protein === "number" ? protein : undefined,
        carbs_g: typeof carbs === "number" ? carbs : undefined,
        fat_g: typeof fat === "number" ? fat : undefined,
      },
      confidence: 0.85,
      raw: data,
    };
  } catch (err) {
    // Timeout or network error => just treat as "not found" for now
    console.warn("OFF lookup failed:", err);
    return null;
  } finally {
    clearTimeout(t);
  }
}
