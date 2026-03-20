/**
 * Kassalapp (kassal.app) — Norwegian grocery product database.
 *
 * Requires VITE_KASSALAPP_API_KEY in your .env file.
 * Register at https://kassal.app/api for a free API key.
 *
 * Endpoints used:
 *   GET /api/v1/products/ean/{ean}          — barcode lookup
 *   GET /api/v1/products?search={query}     — text search
 */

import type { Barcode, NutritionResult, MacroNutrients } from "./types";
import { tryAcquire } from "../lib/rateLimiter";

const BASE_URL = "https://kassal.app/api/v1";

// Rate limit constants — Kassalapp requires an API key; be a good citizen.
// Max 30 barcode lookups / 60 s, min 100 ms between consecutive calls.
const RL_BARCODE = { maxPerWindow: 30, windowMs: 60_000, minIntervalMs: 100 };
// Max 20 text searches / 60 s, min 300 ms between searches (search is heavier).
const RL_SEARCH  = { maxPerWindow: 20, windowMs: 60_000, minIntervalMs: 300 };

function getApiKey(): string | null {
  const key = import.meta.env.VITE_KASSALAPP_API_KEY as string | undefined;
  return key && key.trim().length > 0 ? key.trim() : null;
}

// ─── Raw API shapes ───────────────────────────────────────────────────────────

interface KassalapNutritionEntry {
  code: string;           // e.g. "energy_kcal", "fat", "protein", "carbohydrate", "sugars", "fiber", "salt", "saturated_fat"
  display_name: string;
  amount: number | null;
  unit: string;
}

interface KassalappProduct {
  id: number;
  name: string;
  vendor: string | null;
  brand: string | null;
  ean: string | null;
  url: string | null;
  image: string | null;
  category_id: number | null;
  description: string | null;
  ingredients: string | null;
  allergens: { code: string; display_name: string; contains: string }[] | null;
  nutrition: KassalapNutritionEntry[] | null;
}

interface KassalappResponse {
  data: {
    products?: KassalappProduct[];
    // Single-product endpoint returns differently:
    id?: number;
    name?: string;
    ean?: string;
    vendor?: string | null;
    brand?: string | null;
    image?: string | null;
    ingredients?: string | null;
    allergens?: { code: string; display_name: string; contains: string }[] | null;
    nutrition?: KassalapNutritionEntry[] | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNutrient(list: KassalapNutritionEntry[], code: string): number | undefined {
  const entry = list.find((n) => n.code === code);
  if (!entry || entry.amount == null) return undefined;
  return typeof entry.amount === "number" ? entry.amount : undefined;
}

function buildMacros(nutrition: KassalapNutritionEntry[] | null): MacroNutrients | undefined {
  if (!nutrition || nutrition.length === 0) return undefined;
  const kcal = findNutrient(nutrition, "energy_kcal") ?? findNutrient(nutrition, "energy");
  if (!kcal) return undefined;

  return {
    kcal: Math.round(kcal),
    protein_g: findNutrient(nutrition, "protein"),
    carbs_g: findNutrient(nutrition, "carbohydrate"),
    fat_g: findNutrient(nutrition, "fat"),
    fiber_g: findNutrient(nutrition, "fiber"),
    sugars_g: findNutrient(nutrition, "sugars"),
    saturated_fat_g: findNutrient(nutrition, "saturated_fat"),
    salt_g: findNutrient(nutrition, "salt"),
    sodium_mg: (() => {
      const sodium = findNutrient(nutrition, "sodium");
      return sodium != null ? Math.round(sodium * 1000) : undefined;
    })(),
  };
}

function parseAllergens(allergens: KassalappProduct["allergens"]): string[] {
  if (!allergens) return [];
  return allergens
    .filter((a) => a.contains === "YES" || a.contains === "CONTAINS")
    .map((a) => a.code.toLowerCase().replace("en:", ""));
}

function productToResult(
  product: Pick<KassalappProduct, "name" | "brand" | "vendor" | "ean" | "image" | "ingredients" | "allergens" | "nutrition">,
  barcode?: string
): NutritionResult | null {
  const macros = buildMacros(product.nutrition ?? null);
  const allergens = parseAllergens(product.allergens ?? null);

  const name = product.name?.trim();
  if (!name) return null;

  const brand = product.brand ?? product.vendor ?? undefined;

  return {
    source: "kassalapp",
    barcode: barcode ?? product.ean ?? undefined,
    name,
    brand: brand ?? undefined,
    per100g: macros,
    ingredients: product.ingredients ?? undefined,
    allergens: allergens.length > 0 ? allergens : undefined,
    imageFrontUrl: product.image ?? undefined,
    confidence: macros ? 0.88 : 0.60,
    raw: product,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isKassalappEnabled(): boolean {
  return getApiKey() !== null;
}

export async function lookupKassalapp(barcode: Barcode): Promise<NutritionResult | null> {
  const key = getApiKey();
  if (!key) return null;

  if (!tryAcquire("kassalapp:barcode", RL_BARCODE)) return null;

  const url = `${BASE_URL}/products/ean/${encodeURIComponent(barcode)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": "KaloriFit/1.0",
        Accept: "application/json",
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`Kassalapp barcode lookup HTTP ${res.status}`);
      return null;
    }

    const json = (await res.json()) as KassalappResponse;
    const data = json?.data;
    if (!data) return null;

    // Single product shape
    if (data.name) {
      return productToResult(
        {
          name: data.name,
          brand: (data as any).brand ?? null,
          vendor: (data as any).vendor ?? null,
          ean: barcode,
          image: (data as any).image ?? null,
          ingredients: (data as any).ingredients ?? null,
          allergens: (data as any).allergens ?? null,
          nutrition: (data as any).nutrition ?? null,
        },
        barcode
      );
    }

    // Products array shape (some endpoints return this)
    const products = (data as any).products as KassalappProduct[] | undefined;
    const first = products?.find((p) => p.ean === barcode) ?? products?.[0];
    if (!first) return null;

    return productToResult(first, barcode);
  } catch (err: unknown) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn("Kassalapp lookup failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Text-based product search — useful as a fallback when barcode is unavailable */
export async function searchKassalapp(query: string, limit = 3): Promise<NutritionResult[]> {
  const key = getApiKey();
  if (!key || !query.trim()) return [];

  if (!tryAcquire("kassalapp:search", RL_SEARCH)) return [];

  const url = `${BASE_URL}/products?search=${encodeURIComponent(query.trim())}&size=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": "KaloriFit/1.0",
        Accept: "application/json",
      },
    });

    if (!res.ok) return [];

    const json = (await res.json()) as KassalappResponse;
    const products = (json?.data as any)?.products as KassalappProduct[] | undefined;
    if (!products || products.length === 0) return [];

    return products
      .map((p) => productToResult(p))
      .filter((r): r is NutritionResult => r !== null)
      .map((r, i) => ({
        ...r,
        // Penalize rank: first result gets 0.85, subsequent ones decrease
        confidence: Math.max(0.4, (r.confidence ?? 0.7) - i * 0.1),
      }));
  } catch (err: unknown) {
    if ((err as Error)?.name !== "AbortError") {
      console.warn("Kassalapp search failed:", err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
