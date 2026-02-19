import type { MacroNutrients, NutritionResult } from "./types";


type Constituent = {
  nutrientId: string;
  quantity?: number;
  unit?: string;
};

type MatvareFood = {
  id?: string | number;
  foodName?: string;
  name?: string;
  navn?: string;
  calories?: { quantity?: number; unit?: string };
  constituents?: Constituent[];
  nutrients?: Record<string, any>;
  naeringsstoffer?: Record<string, any>;
};

let foodsCache: MatvareFood[] | null = null;

export async function loadMatvaretabellenFoods(fetchImpl = fetch): Promise<MatvareFood[]> {
  if (foodsCache) return foodsCache;

  const res = await fetchImpl("https://www.matvaretabellen.no/api/nb/foods.json", {
    headers: { "User-Agent": "KaloriFit/1.0 (mobile app)" },
  });

  if (!res.ok) {
    console.error(`Matvaretabellen fetch failed: HTTP ${res.status}`);
    foodsCache = [];
    return foodsCache;
  }

  try {
    const data = await res.json();
    const foods: MatvareFood[] = Array.isArray(data) ? data : (data.foods ?? []);
    foodsCache = foods;
    return foods;
  } catch (err) {
    console.error('Failed parsing Matvaretabellen response', err);
    foodsCache = [];
    return foodsCache;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9æøå\s]/gi, " ").replace(/\s+/g, " ").trim();
}

// Very simple scoring: contains match + startswith match
function score(name: string, q: string) {
  const n = norm(name);
  const qq = norm(q);
  let s = 0;
  if (n === qq) s += 100;
  if (n.startsWith(qq)) s += 60;
  if (n.includes(qq)) s += 40;
  // prefer shorter names slightly (often more “generic”)
  s += Math.max(0, 20 - Math.min(20, n.length / 10));
  return s;
}

// Precise extractor using Matvaretabellen shape
function findNutrientG(food: MatvareFood, nutrientId: string): number | undefined {
  const hit = (food.constituents ?? []).find((c) => c.nutrientId === nutrientId);
  if (!hit) return undefined;
  if (typeof hit.quantity !== 'number') return undefined;
  if (hit.unit && hit.unit !== 'g') return undefined;
  return hit.quantity;
}

export function extractMacros(food: MatvareFood): MacroNutrients | null {
  const kcal = food.calories?.unit === 'kcal' ? food.calories?.quantity : undefined;
  if (typeof kcal !== 'number') return null;

  const protein = findNutrientG(food, 'Protein');
  const carbs = findNutrientG(food, 'Karbo');
  const fat = findNutrientG(food, 'Fett');

  return {
    kcal: Math.round(kcal),
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
  };
}

export async function resolveLabelMatvaretabellen(label: string): Promise<{ best: NutritionResult | null; candidates: NutritionResult[] }> {
  const foods = await loadMatvaretabellenFoods();

  const ranked = foods
    .map((f) => {
      const name = (f as any).name ?? (f as any).navn ?? "";
      const per100g = extractMacros(f);
      return { f, name, per100g, s: score(name, label) };
    })
    .filter((x) => x.name && x.per100g)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const candidates: NutritionResult[] = ranked.map((x, i) => ({
    source: "matvaretabellen",
    name: x.name,
    per100g: x.per100g!,
    confidence: Math.max(0.55, Math.min(0.95, x.s / 100)),
    raw: { matvareId: (x.f as any).id, rank: i + 1, score: x.s },
  }));

  return { best: candidates[0] ?? null, candidates };
}
