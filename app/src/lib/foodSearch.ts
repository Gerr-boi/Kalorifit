import { resolveLabelMatvaretabellen } from '../ai-scanner-logic/matvaretabellen';
import type { Micros } from './disciplineEngine';

export type { Micros };

export type FoodSearchResult = {
  id: string;
  name: string;
  brand?: string;
  source: 'openfoodfacts' | 'matvaretabellen' | 'composite';
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  micros?: Micros;
  confidence: number;
  isComposite?: boolean;
  compositeIngredients?: string[];
};

type OffProduct = {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number>;
  code?: string;
};

function numOr(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function round1(x: number | undefined): number | undefined {
  return x !== undefined ? Math.round(x * 10) / 10 : undefined;
}

function toMg(x: number | undefined): number | undefined {
  return x !== undefined ? Math.round(x * 1000 * 10) / 10 : undefined;
}

function toUg(x: number | undefined): number | undefined {
  return x !== undefined ? Math.round(x * 1_000_000 * 10) / 10 : undefined;
}

function extractMicros(n: Record<string, number> | undefined): Micros | undefined {
  if (!n) return undefined;
  const m: Micros = {};
  const f = (key: string) => numOr(n[key]);

  const fiber = round1(f('fiber_100g'));
  const sugar = round1(f('sugars_100g'));
  const satFat = round1(f('saturated-fat_100g'));
  const salt = round1(f('salt_100g'));
  const ca = toMg(f('calcium_100g'));
  const fe = toMg(f('iron_100g'));
  const k = toMg(f('potassium_100g'));
  const vitC = toMg(f('vitamin-c_100g'));
  const vitD = toUg(f('vitamin-d_100g'));

  if (fiber !== undefined) m.fiber_g = fiber;
  if (sugar !== undefined) m.sugar_g = sugar;
  if (satFat !== undefined) m.saturatedFat_g = satFat;
  if (salt !== undefined) m.salt_g = salt;
  if (ca !== undefined) m.calcium_mg = ca;
  if (fe !== undefined) m.iron_mg = fe;
  if (k !== undefined) m.potassium_mg = k;
  if (vitC !== undefined) m.vitaminC_mg = vitC;
  if (vitD !== undefined) m.vitaminD_ug = vitD;

  return Object.keys(m).length > 0 ? m : undefined;
}

async function searchOFF(query: string, limit = 8): Promise<FoodSearchResult[]> {
  try {
    const url =
      'https://world.openfoodfacts.org/cgi/search.pl' +
      `?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=${limit}` +
      '&fields=product_name,brands,nutriments,code';

    const res = await fetch(url, { headers: { 'User-Agent': 'KaloriFit/1.0 (mobile app)' } });
    if (!res.ok) return [];

    const data = (await res.json()) as { products?: OffProduct[] };

    return (data.products ?? [])
      .filter((p) => p.product_name && p.nutriments)
      .map((p): FoodSearchResult | null => {
        const n = p.nutriments!;
        const kcalRaw =
          numOr(n['energy-kcal_100g']) ??
          (numOr(n['energy_100g']) ? Math.round(n['energy_100g']! / 4.184) : undefined);
        if (!kcalRaw) return null;

        return {
          id: p.code ? `off-${p.code}` : `off-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: p.product_name!.trim(),
          brand: p.brands ? p.brands.split(',')[0].trim() : undefined,
          source: 'openfoodfacts',
          per100g: {
            kcal: Math.round(kcalRaw),
            protein: round1(numOr(n['proteins_100g'])) ?? 0,
            carbs: round1(numOr(n['carbohydrates_100g'])) ?? 0,
            fat: round1(numOr(n['fat_100g'])) ?? 0,
          },
          micros: extractMicros(n),
          confidence: 0.75,
        };
      })
      .filter((x): x is FoodSearchResult => x !== null);
  } catch {
    return [];
  }
}

async function searchMatvare(query: string): Promise<FoodSearchResult[]> {
  try {
    const { candidates } = await resolveLabelMatvaretabellen(query);
    return candidates
      .filter((c) => c.per100g)
      .map((c) => ({
        id: `matv-${c.name.slice(0, 20)}-${Math.random().toString(36).slice(2)}`,
        name: c.name,
        source: 'matvaretabellen' as const,
        per100g: {
          kcal: c.per100g!.kcal,
          protein: round1(c.per100g!.protein_g) ?? 0,
          carbs: round1(c.per100g!.carbs_g) ?? 0,
          fat: round1(c.per100g!.fat_g) ?? 0,
        },
        confidence: c.confidence,
      }));
  } catch {
    return [];
  }
}

// Split "bakt potet med ost og søtmais" → ["bakt potet", "ost", "søtmais"]
function splitCompositeQuery(query: string): string[] {
  const parts = query
    .split(/\b(?:med|og|with|and|samt|inkludert)\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  return parts.length >= 2 ? parts : [];
}

async function buildCompositeEstimate(parts: string[]): Promise<FoodSearchResult | null> {
  const resultSets = await Promise.all(parts.map((p) => searchOFF(p, 3)));
  const tops = resultSets
    .map((res, i) => ({ result: res[0] ?? null, ingredient: parts[i] }))
    .filter((x): x is { result: FoodSearchResult; ingredient: string } => x.result !== null);

  if (tops.length < 2) return null;

  // Average per100g across ingredients (equal-weight assumption).
  // Default serving = 100g × n so the total reflects each ingredient at 100g.
  const n = tops.length;
  const summed = tops.reduce(
    (acc, { result: r }) => ({
      kcal: acc.kcal + r.per100g.kcal,
      protein: acc.protein + r.per100g.protein,
      carbs: acc.carbs + r.per100g.carbs,
      fat: acc.fat + r.per100g.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    id: `composite-${Date.now()}`,
    name: tops.map((x) => x.ingredient).join(' + '),
    source: 'composite',
    per100g: {
      kcal: Math.round(summed.kcal / n),
      protein: round1(summed.protein / n) ?? 0,
      carbs: round1(summed.carbs / n) ?? 0,
      fat: round1(summed.fat / n) ?? 0,
    },
    confidence: 0.6,
    isComposite: true,
    compositeIngredients: tops.map((x) => x.ingredient),
  };
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const parts = splitCompositeQuery(trimmed);
  const isComposite = parts.length >= 2;

  const [offResults, matResults, compositeResult] = await Promise.all([
    searchOFF(trimmed, 8),
    searchMatvare(trimmed),
    isComposite ? buildCompositeEstimate(parts) : Promise.resolve(null),
  ]);

  const seen = new Set<string>();
  const dedup = (results: FoodSearchResult[]) =>
    results.filter((r) => {
      const key = r.name.toLowerCase().slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const all: FoodSearchResult[] = [];
  if (compositeResult) all.push(compositeResult);
  all.push(...dedup(offResults));
  all.push(...dedup(matResults));

  return all.slice(0, 12);
}
