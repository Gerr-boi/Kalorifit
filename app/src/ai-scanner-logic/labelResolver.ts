import type { MacroNutrients, NutritionResult } from "./types";

type ResolveOptions = {
  brand?: string | null;
  hints?: string[];
};

type OffSearchProduct = {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, any>;
  image_url?: string;
  code?: string;
};

type OffSearchResponse = {
  products?: OffSearchProduct[];
  count?: number;
};

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9æøå\s]/gi, " ").replace(/\s+/g, " ").trim();
}

function numOrUndef(v: any): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function extractPer100g(nutr: Record<string, any> | undefined): MacroNutrients | null {
  if (!nutr) return null;

  // OFF keys
  const kcal = numOrUndef(nutr["energy-kcal_100g"]);
  const protein = numOrUndef(nutr["proteins_100g"]);
  const carbs = numOrUndef(nutr["carbohydrates_100g"]);
  const fat = numOrUndef(nutr["fat_100g"]);

  // Fallback if only kJ exists
  const kj = numOrUndef(nutr["energy_100g"]);
  const kcalFromKj = kj ? kj / 4.184 : undefined;

  const kcalFinal = kcal ?? (kcalFromKj ? Math.round(kcalFromKj) : undefined);

  // Require at least kcal to be usable
  if (!kcalFinal) return null;

  return {
    kcal: Math.round(kcalFinal),
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  };
}

function scoreProduct(p: OffSearchProduct, qLabel: string, qBrand?: string | null) {
  const name = norm(p.product_name ?? "");
  const brands = norm(p.brands ?? "");
  const label = norm(qLabel);
  const brand = qBrand ? norm(qBrand) : "";

  let score = 0;

  // nutrition present = huge boost
  const per100g = extractPer100g(p.nutriments);
  if (per100g) score += 50;

  // label match
  if (name.includes(label)) score += 25;
  if (label.includes(name) && name.length > 0) score += 10;

  // brand match
  if (brand && (brands.includes(brand) || name.includes(brand))) score += 15;

  // slight preference if product_name exists
  if (p.product_name) score += 3;

  return score;
}

/**
 * Resolve a generic label (e.g. "milk", "burger") to nutrition using Open Food Facts search.
 * Returns best match (or null).
 */
export async function resolveLabelOFF(label: string, opts: ResolveOptions = {}): Promise<NutritionResult | null> {
  const q = norm(label);
  if (!q) return null;

  const url =
    "https://world.openfoodfacts.org/cgi/search.pl" +
    `?search_terms=${encodeURIComponent(q)}` +
    "&search_simple=1&action=process&json=1&page_size=20";

  const res = await fetch(url, {
    headers: { "User-Agent": "KaloriFit/1.0 (mobile app)" },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as OffSearchResponse;
  const products = data.products ?? [];
  if (!products.length) return null;

  // score + pick best
  const ranked = products
    .map((p) => ({
      p,
      score: scoreProduct(p, label, opts.brand),
      per100g: extractPer100g(p.nutriments),
    }))
    .filter((x) => x.per100g) // require nutrition for MVP
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  const best = ranked[0].p;
  const per100g = ranked[0].per100g!;
  const score = ranked[0].score;

  // simple confidence heuristic (0..1)
  // nutrition present + decent text match -> higher
  const confidence = Math.max(0.55, Math.min(0.95, score / 80));

  return {
    source: "openfoodfacts",
    name: best.product_name ?? label,
    brand: best.brands ?? undefined,
    per100g,
    confidence,
    raw: { query: label, best, score },
  };
}

export type OffCandidate = {
  name: string;
  brand?: string;
  per100g: MacroNutrients;
  confidence: number;
  raw: any;
};

export async function resolveLabelOFFWithCandidates(
  label: string,
  opts: ResolveOptions = {},
  limit = 3
): Promise<{ best: NutritionResult | null; candidates: NutritionResult[] }> {
  const q = norm(label);
  if (!q) return { best: null, candidates: [] };

  const url =
    "https://world.openfoodfacts.org/cgi/search.pl" +
    `?search_terms=${encodeURIComponent(q)}` +
    "&search_simple=1&action=process&json=1&page_size=50";

  const res = await fetch(url, {
    headers: { "User-Agent": "KaloriFit/1.0 (mobile app)" },
  });

  if (!res.ok) return { best: null, candidates: [] };

  const data = (await res.json()) as OffSearchResponse;
  const products = data.products ?? [];
  if (!products.length) return { best: null, candidates: [] };

  const ranked = products
    .map((p) => ({
      p,
      score: scoreProduct(p, label, opts.brand),
      per100g: extractPer100g(p.nutriments),
    }))
    .filter((x) => x.per100g)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { best: null, candidates: [] };

  // build NutritionResult list
  const candidates = ranked.slice(0, limit).map((r) => {
    const score = r.score;
    const confidence = Math.max(0.55, Math.min(0.95, score / 80));
    return {
      source: "openfoodfacts" as const,
      name: r.p.product_name ?? label,
      brand: r.p.brands ?? undefined,
      per100g: r.per100g!,
      confidence,
      raw: { query: label, product: r.p, score },
    } as NutritionResult;
  });

  return { best: candidates[0] ?? null, candidates };
}
