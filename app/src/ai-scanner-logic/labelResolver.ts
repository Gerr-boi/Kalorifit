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

const MIN_SCORE = 0;

const STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with",
  "a",
  "an",
  "of",
  "person",
  "persons",
  "food",
  "meal",
  "dish",
]);

const GENERIC_CONTAINER_TOKENS = new Set([
  "bottle",
  "carton",
  "pack",
  "package",
  "drink",
  "beverage",
]);

const FOOD_QUERY_HINTS = new Set([
  'milk', 'melk', 'choco', 'chocolate', 'sjoko', 'kakao', 'cacao',
  'juice', 'drikk', 'drink', 'soda', 'brus', 'cola', 'fanta', 'sprite',
  'mango', 'grape', 'grapes', 'druer', 'apple', 'orange', 'banana',
  'yoghurt', 'yogurt', 'yog', 'smoothie', 'nektar', 'nectar', 'ice',
  'cream', 'pizza', 'burger', 'salad', 'bread', 'cheese', 'egg', 'rice',
  'pasta', 'fish', 'chicken', 'beef', 'cookie', 'candy', 'snack',
]);

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return norm(input)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function countOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  return a.reduce((acc, token) => (bSet.has(token) ? acc + 1 : acc), 0);
}

function hasAny(text: string, patterns: string[]) {
  return patterns.some((p) => text.includes(p));
}

function looksLikeFoodQuery(query: string): boolean {
  const qTokens = tokens(query);
  if (!qTokens.length) return false;
  if (qTokens.some((token) => FOOD_QUERY_HINTS.has(token))) return true;
  const joined = qTokens.join(' ');
  if (hasAny(joined, ['sjokolade', 'sjokolademelk', 'drue', 'mangodrikk'])) return true;
  return false;
}

function numOrUndef(v: any): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function extractPer100g(nutr: Record<string, any> | undefined): MacroNutrients | null {
  if (!nutr) return null;

  const kcal = numOrUndef(nutr["energy-kcal_100g"]);
  const protein = numOrUndef(nutr["proteins_100g"]);
  const carbs = numOrUndef(nutr["carbohydrates_100g"]);
  const fat = numOrUndef(nutr["fat_100g"]);

  const kj = numOrUndef(nutr["energy_100g"]);
  const kcalFromKj = kj ? kj / 4.184 : undefined;

  const kcalFinal = kcal ?? (kcalFromKj ? Math.round(kcalFromKj) : undefined);
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
  const qTokens = tokens(qLabel);
  const nameTokens = tokens(p.product_name ?? "");
  const overlap = countOverlap(qTokens, nameTokens);
  const hasSpecificQueryToken = qTokens.some((token) => !GENERIC_CONTAINER_TOKENS.has(token));

  let score = 0;

  const per100g = extractPer100g(p.nutriments);
  if (per100g) score += 50;

  if (name.includes(label)) score += 25;
  if (label.includes(name) && name.length > 0) score += 10;

  score += overlap * 14;
  if (hasSpecificQueryToken && overlap === 0) score -= 10;

  if (brand && (brands.includes(brand) || name.includes(brand))) score += 15;

  if (p.product_name) score += 3;

  const wantsMilkDrink = hasAny(label, ["milk", "melk", "choco", "sjoko", "kakao", "cacao"]);
  if (wantsMilkDrink) {
    const isMilkDrink = hasAny(name, ["milk", "melk", "choco", "sjoko", "kakao", "cacao", "latte"]);
    score += isMilkDrink ? 22 : -12;
  }

  return score;
}

export async function resolveLabelOFF(label: string, opts: ResolveOptions = {}): Promise<NutritionResult | null> {
  const q = norm(label);
  if (!q) return null;
  if (!looksLikeFoodQuery(q)) return null;

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

  const ranked = products
    .map((p) => ({
      p,
      score: scoreProduct(p, label, opts.brand),
      per100g: extractPer100g(p.nutriments),
    }))
    .filter((x) => x.per100g && x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  const best = ranked[0].p;
  const per100g = ranked[0].per100g!;
  const score = ranked[0].score;
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
  if (!looksLikeFoodQuery(q)) return { best: null, candidates: [] };

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
    .filter((x) => x.per100g && x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { best: null, candidates: [] };

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
