import type { Barcode, MacroNutrients, NutritionResult } from './types';

type ResolveOptions = {
  brand?: string | null;
};

type FoodRepoProduct = {
  id?: string;
  barcode?: string;
  ean?: string;
  ean13?: string;
  name?: string;
  product_name?: string;
  display_name?: string;
  brand?: string;
  brands?: string;
  nutriments?: Record<string, unknown>;
  nutrients?: Record<string, unknown>;
};

type FoodRepoSearchResponse = {
  products?: FoodRepoProduct[];
  items?: FoodRepoProduct[];
  data?: FoodRepoProduct[];
};

const SEARCH_ENDPOINT = String(import.meta.env.VITE_FOODREPO_SEARCH_ENDPOINT ?? '').trim();
const BARCODE_ENDPOINT_TEMPLATE = String(import.meta.env.VITE_FOODREPO_BARCODE_ENDPOINT ?? '').trim();
const API_KEY = String(import.meta.env.VITE_FOODREPO_API_KEY ?? '').trim();
const ENABLED = String(import.meta.env.VITE_ENABLE_FOODREPO ?? '').trim().toLowerCase() === 'true';

function norm(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pickProductName(product: FoodRepoProduct) {
  return String(product.product_name ?? product.name ?? product.display_name ?? '').trim();
}

function pickBrand(product: FoodRepoProduct) {
  return String(product.brand ?? product.brands ?? '').trim();
}

function pickBarcode(product: FoodRepoProduct) {
  return String(product.ean13 ?? product.ean ?? product.barcode ?? '').trim() || undefined;
}

function extractPer100g(product: FoodRepoProduct): MacroNutrients | null {
  const nutr = (product.nutriments ?? product.nutrients ?? {}) as Record<string, unknown>;
  const kcal = numOrUndefined(nutr['energy-kcal_100g']) ?? numOrUndefined(nutr.kcal_100g) ?? numOrUndefined(nutr.kcal);
  const protein = numOrUndefined(nutr['proteins_100g']) ?? numOrUndefined(nutr.protein_100g);
  const carbs = numOrUndefined(nutr['carbohydrates_100g']) ?? numOrUndefined(nutr.carbs_100g);
  const fat = numOrUndefined(nutr['fat_100g']) ?? numOrUndefined(nutr.fat_100g);
  const fiber = numOrUndefined(nutr['fiber_100g']) ?? numOrUndefined(nutr.fiber_g_100g);
  const sugars = numOrUndefined(nutr['sugars_100g']) ?? numOrUndefined(nutr.sugar_100g);
  const saturatedFat = numOrUndefined(nutr['saturated-fat_100g']) ?? numOrUndefined(nutr.saturated_fat_100g);
  const salt = numOrUndefined(nutr['salt_100g']);
  const sodium = numOrUndefined(nutr['sodium_100g']) ?? numOrUndefined(nutr.sodium_mg_100g);

  const kj = numOrUndefined(nutr['energy_100g']) ?? numOrUndefined(nutr.kj_100g);
  const kcalFromKj = typeof kj === 'number' ? kj / 4.184 : undefined;
  const kcalFinal = kcal ?? kcalFromKj;
  if (typeof kcalFinal !== 'number' || !Number.isFinite(kcalFinal)) return null;

  return {
    kcal: Math.round(kcalFinal),
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    sugars_g: sugars,
    saturated_fat_g: saturatedFat,
    salt_g: salt,
    sodium_mg: typeof sodium === 'number' && sodium <= 100 ? Math.round(sodium * 1000) : sodium,
  };
}

function scoreProduct(product: FoodRepoProduct, query: string, brand?: string | null) {
  const name = norm(pickProductName(product));
  const productBrand = norm(pickBrand(product));
  const q = norm(query);
  const b = norm(brand ?? '');
  if (!name || !q) return 0;

  let score = 0;
  if (name === q) score += 30;
  if (name.includes(q)) score += 24;
  if (q.includes(name)) score += 8;
  if (b && (productBrand.includes(b) || name.includes(b))) score += 12;
  if (extractPer100g(product)) score += 35;
  return score;
}

function toCandidates(products: FoodRepoProduct[], query: string, brand: string | null | undefined, limit: number) {
  const ranked = products
    .map((product) => ({
      product,
      per100g: extractPer100g(product),
      score: scoreProduct(product, query, brand),
    }))
    .filter((entry) => entry.per100g && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const candidates: NutritionResult[] = ranked.map((entry) => {
    const confidence = Math.max(0.5, Math.min(0.92, entry.score / 80));
    const pickedBarcode = pickBarcode(entry.product);
    return {
      source: 'foodrepo',
      barcode: pickedBarcode,
      name: pickProductName(entry.product) || query,
      brand: pickBrand(entry.product) || undefined,
      per100g: entry.per100g ?? undefined,
      confidence,
      raw: {
        query,
        score: entry.score,
        product: entry.product,
      },
    };
  });
  return candidates;
}

function parseProductList(payload: unknown): FoodRepoProduct[] {
  if (Array.isArray(payload)) return payload as FoodRepoProduct[];
  const root = payload as FoodRepoSearchResponse;
  if (Array.isArray(root.products)) return root.products;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.data)) return root.data;
  return [];
}

function buildHeaders() {
  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (API_KEY) {
    headers.authorization = `Bearer ${API_KEY}`;
    headers['x-api-key'] = API_KEY;
  }
  return headers;
}

export function isFoodRepoEnabled() {
  if (!ENABLED) return false;
  return Boolean(API_KEY && (SEARCH_ENDPOINT || BARCODE_ENDPOINT_TEMPLATE));
}

export async function resolveLabelFoodRepoWithCandidates(
  label: string,
  opts: ResolveOptions = {},
  limit = 3
): Promise<{ best: NutritionResult | null; candidates: NutritionResult[] }> {
  const q = norm(label);
  if (!q || !isFoodRepoEnabled() || !SEARCH_ENDPOINT) return { best: null, candidates: [] };

  const separator = SEARCH_ENDPOINT.includes('?') ? '&' : '?';
  const url = `${SEARCH_ENDPOINT}${separator}q=${encodeURIComponent(label)}&limit=${Math.max(limit * 5, 10)}`;
  try {
    const response = await fetch(url, { headers: buildHeaders() });
    if (!response.ok) return { best: null, candidates: [] };
    const payload = await response.json();
    const products = parseProductList(payload);
    if (!products.length) return { best: null, candidates: [] };

    const candidates = toCandidates(products, label, opts.brand, limit);
    return {
      best: candidates[0] ?? null,
      candidates,
    };
  } catch {
    return { best: null, candidates: [] };
  }
}

export async function lookupFoodRepoByBarcode(barcode: Barcode): Promise<NutritionResult | null> {
  if (!isFoodRepoEnabled() || !BARCODE_ENDPOINT_TEMPLATE) return null;

  const endpoint = BARCODE_ENDPOINT_TEMPLATE.replace('%BARCODE%', encodeURIComponent(barcode));
  try {
    const response = await fetch(endpoint, { headers: buildHeaders() });
    if (!response.ok) return null;
    const payload = await response.json();
    const products = parseProductList(payload);
    const product = products[0] ?? (payload as FoodRepoProduct);
    if (!product || typeof product !== 'object') return null;

    const per100g = extractPer100g(product);
    if (!per100g) return null;
    return {
      source: 'foodrepo',
      barcode,
      name: pickProductName(product) || 'Unknown product',
      brand: pickBrand(product) || undefined,
      per100g,
      confidence: 0.8,
      raw: payload,
    };
  } catch {
    return null;
  }
}
