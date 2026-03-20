/**
 * NOVA food processing classification (1–4).
 *
 * Based on Monteiro et al. criteria:
 *   1 = Unprocessed / minimally processed
 *   2 = Processed culinary ingredients
 *   3 = Processed foods
 *   4 = Ultra-processed food & drink products
 *
 * Supports Norwegian and English ingredient text.
 */

import type { NovaGroup, ProcessingInfo } from "./types";

// ─── E-number ranges and specific codes that signal ultra-processing ──────────

/** Colorants — strong NOVA 4 signal when not from natural sources */
const E_COLORANTS = /\bE1[0-9]{2}\b/gi;

/** Preservatives — moderate signal */
const E_PRESERVATIVES = /\bE2[0-9]{2}\b/gi;

/** Emulsifiers, stabilizers, thickeners — strong NOVA 4 signal */
const E_EMULSIFIERS = /\bE4[0-9]{2}\b/gi;

/** Flavor enhancers (E620–E640) — strong NOVA 4 signal */
const E_FLAVOR_ENHANCERS = /\bE6[2-4][0-9]\b/gi;

/** Artificial sweeteners (E950–E969) — strong NOVA 4 signal */
const E_SWEETENERS = /\bE9[5-6][0-9]\b/gi;

/** Modified starches (E1400–E1499) — strong NOVA 4 signal */
const E_MODIFIED_STARCHES = /\bE1[4][0-9]{2}\b/gi;

/** Phosphates (E339–E343, E450–E452) — moderate NOVA 4 signal */
const E_PHOSPHATES = /\bE(33[9]|34[0-3]|45[0-2])\b/gi;

// ─── Ingredient keyword patterns ──────────────────────────────────────────────

interface MarkerRule {
  pattern: RegExp;
  label: string;
  weight: number; // how strongly this pushes toward NOVA 4 (0–1)
}

const NOVA4_MARKERS: MarkerRule[] = [
  // Colorants / dyes
  { pattern: /\b(fargestoff|farge\b|colour|coloring|coloring agent|dye)\b/gi, label: "fargestoff", weight: 0.7 },

  // Artificial / nature-identical flavourings
  { pattern: /\b(aroma|aromer|flavouring|flavorings?|artificial flavor)\b/gi, label: "aroma/smakstilsetning", weight: 0.65 },

  // Emulsifiers
  { pattern: /\b(emulgator|emulsifier|lecithin|lecitin)\b/gi, label: "emulgator", weight: 0.75 },

  // Stabilizers
  { pattern: /\b(stabilisator|stabilizer|stabiliser)\b/gi, label: "stabilisator", weight: 0.65 },

  // Thickeners / gelling agents
  { pattern: /\b(fortykningsmiddel|thickener|gelling agent|gelingsmiddel|xanthan|carrageenan|karrageenan|guar gum|guargummi|cellulose)\b/gi, label: "fortykningsmiddel", weight: 0.65 },

  // Modified starch (keyword form)
  { pattern: /\b(modifisert stivelse|modified starch|modifisert maisstivelse)\b/gi, label: "modifisert stivelse", weight: 0.8 },

  // Hydrogenated / partially hydrogenated fats
  { pattern: /\b(hydrogenert|hydrogenated|herdet fett|partially hydrogenated)\b/gi, label: "hydrogenert fett", weight: 0.85 },

  // Hydrolysed proteins
  { pattern: /\b(hydrolysert|hydrolyzed|hydrolysed)\b/gi, label: "hydrolysert protein", weight: 0.75 },

  // Glucose/fructose syrups
  { pattern: /\b(glukosesirup|fruktosesirup|glucose.?fructose syrup|high.?fructose|maissirup|corn syrup)\b/gi, label: "glukose-/fruktosesirup", weight: 0.85 },

  // Maltodextrin
  { pattern: /\bmaltodextrin\b/gi, label: "maltodextrin", weight: 0.75 },

  // Protein isolates / concentrates (processed protein)
  { pattern: /\b(protein ?isolat|whey isolate|soya ?isolat|pea protein isolate)\b/gi, label: "proteinisolat", weight: 0.6 },

  // Textured / reconstituted proteins
  { pattern: /\b(textured|texturized|texturert|TVP|TSP|rekonstituert)\b/gi, label: "texturert protein", weight: 0.7 },

  // Preservatives (keyword form)
  { pattern: /\b(konserveringsmiddel|preservative|natriumbenzoat|kaliumsorbat|sodium benzoate|potassium sorbate|natriumpropionat)\b/gi, label: "konserveringsmiddel", weight: 0.55 },

  // Artificial sweeteners (keyword form)
  { pattern: /\b(aspartam|aspartame|sukralose|sucralose|sakarin|saccharin|acesulfam|acesulfame|steviolglykosid|steviol glycoside|sorbitol|xylitol|maltitol|erythritol)\b/gi, label: "søtningsmiddel", weight: 0.6 },

  // Phosphates
  { pattern: /\b(fosfat|phosphate|difosfat|trifosfat|pyrofosfat)\b/gi, label: "fosfat", weight: 0.6 },

  // Anti-caking agents / humectants
  { pattern: /\b(antiklumpemiddel|anti-caking|fuktighetsmiddel|humectant)\b/gi, label: "antiklumpemiddel", weight: 0.5 },

  // Caffeine — strong NOVA 4 signal in beverages (energy/sports drinks)
  { pattern: /\b(koffein|caffeine)\b/gi, label: "koffein", weight: 0.8 },

  // Taurine — common energy drink additive
  { pattern: /\btaurin(e)?\b/gi, label: "taurin", weight: 0.7 },

  // Inositol — energy drink additive
  { pattern: /\binositol\b/gi, label: "inositol", weight: 0.6 },

  // Niacin (B3) / B-vitamins at high dose — marker for functional/energy drinks
  { pattern: /\b(niacinamid|niacin|pantotensyre|pantothenic|pyridoxin|pyridoxine|kobalamin|cobalamin)\b/gi, label: "B-vitamintilsetning", weight: 0.45 },

  // Citric acid used as preservative in drinks
  { pattern: /\b(sitronsyre|citric acid)\b/gi, label: "sitronsyre", weight: 0.3 },

  // Carbonic acid / carbonation markers
  { pattern: /\b(kullsyre|karbondioksid|carbonated|sparkling water)\b/gi, label: "kullsyre", weight: 0.1 },
];

// ─── Category-based heuristics ────────────────────────────────────────────────

/** Categories that almost always indicate NOVA 4 */
const NOVA4_CATEGORIES = [
  /\b(brus|sodavann|cola|energidrikk|energy drink|sports? drink|sportsdrikk|iste|funksjonell drikke|functional drink)\b/gi,
  // Well-known ultra-processed beverage brands
  /\b(nocco|monster|redbull|red bull|celsius|rockstar|relentless|burn|nos|bang energy|ghost energy|reign|g fuel|prime hydration)\b/gi,
  /\b(chips|crisps|snacks|popcorn)\b/gi,
  /\b(godteri|candy|chewing gum|tyggegummi|sjokolade bar|chocolate bar)\b/gi,
  /\b(instant nudle|ramen|instant noodle|hurtigsuppe)\b/gi,
  /\b(frokostblanding|corn flakes|muesli bar|breakfast cereal)\b/gi,
  /\b(nuggets|kyllingnuggets|fishstick|fiskepinner)\b/gi,
  /\b(margarin|margarine)\b/gi,
  /\b(saus i pose|knorr|tørrsuppe|powder soup)\b/gi,
];

/** Categories that almost always indicate NOVA 1 or 2 */
const NOVA1_CATEGORIES = [
  /\b(fersk|fresh)\b.*\b(frukt|fruit|grønnsak|vegetable|kjøtt|meat|fisk|fish)\b/gi,
  /\b(ren|pure)\b.*\b(hvete|mel|olje|oil|smør|butter)\b/gi,
  /\b(tørket|dried|fryst|frozen)\b.*\b(frukt|fruit|grønnsak|vegetable)\b/gi,
];

/** Categories pointing to NOVA 3 (processed but not ultra) */
const NOVA3_CATEGORIES = [
  /\b(hermetikk|canned|syltet|pickled|speket|røkt|smoked)\b/gi,
  /\b(ost|cheese|yoghurt|yogurt|kefir)\b/gi,
  /\b(bacon|pølse|sausage|salami|spekepølse)\b/gi,
  /\b(brød|bread|knekkebrød|crispbread)\b/gi,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findENumbers(text: string): string[] {
  const found = new Set<string>();
  const allPatterns = [
    E_COLORANTS, E_PRESERVATIVES, E_EMULSIFIERS,
    E_FLAVOR_ENHANCERS, E_SWEETENERS, E_MODIFIED_STARCHES, E_PHOSPHATES,
  ];
  for (const pat of allPatterns) {
    const matches = text.matchAll(new RegExp(pat.source, "gi"));
    for (const m of matches) found.add(m[0].toUpperCase());
  }
  return [...found];
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, "gi")) ?? []).length;
}

function hasCategory(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => new RegExp(p.source, "gi").test(text));
}

// ─── Main classifier ──────────────────────────────────────────────────────────

export interface ClassifyInput {
  ingredients?: string;
  productName?: string;
  category?: string;
  /** Pre-parsed additives from an API (e.g. OFF additives_tags) */
  apiAdditives?: string[];
  /** NOVA group from an API (use as strong prior) */
  apiNovaGroup?: number;
}

export function classifyNova(input: ClassifyInput): ProcessingInfo {
  const { ingredients = "", productName = "", category = "", apiAdditives = [], apiNovaGroup } = input;

  const combined = [ingredients, productName, category].join(" ").toLowerCase();
  const detected: string[] = [];
  const markers: string[] = [];
  let scoreToward4 = 0;

  // ── 1. Trust API NOVA group as a prior ────────────────────────────────────
  if (apiNovaGroup && apiNovaGroup >= 1 && apiNovaGroup <= 4) {
    const n = apiNovaGroup as NovaGroup;
    // Still run full analysis but return early if API confidence is high enough
    // (We'll blend below)
    if (n === 4) scoreToward4 += 1.5;
    else if (n === 3) scoreToward4 += 0.5;
    else if (n <= 2) scoreToward4 -= 0.5;
    markers.push(`API NOVA ${n}`);
  }

  // ── 2. Detect API-provided additives ──────────────────────────────────────
  for (const additive of apiAdditives) {
    const norm = additive.replace(/^en:/, "").toUpperCase();
    detected.push(norm);
    // E4xx, E6xx, E9xx, E1xxx → strong signal
    if (/^E[46][0-9]{2}$/.test(norm) || /^E9[5-6][0-9]$/.test(norm) || /^E1[4][0-9]{2}$/.test(norm)) {
      scoreToward4 += 0.4;
    } else if (/^E[12][0-9]{2}$/.test(norm)) {
      scoreToward4 += 0.2;
    }
  }

  // ── 3. Scan ingredient text for E-numbers ─────────────────────────────────
  if (ingredients) {
    const eNums = findENumbers(ingredients);
    for (const e of eNums) {
      if (!detected.includes(e)) detected.push(e);
    }
    const strongECount = eNums.filter((e) =>
      /^E[46][0-9]{2}$/.test(e) || /^E9[5-6][0-9]$/.test(e) || /^E1[4][0-9]{2}$/.test(e)
    ).length;
    const weakECount = eNums.length - strongECount;
    scoreToward4 += strongECount * 0.35;
    scoreToward4 += weakECount * 0.15;
    if (eNums.length > 0) markers.push(`${eNums.length} E-nummer(e): ${eNums.slice(0, 5).join(", ")}`);
  }

  // ── 4. Scan for ingredient keyword markers ────────────────────────────────
  for (const rule of NOVA4_MARKERS) {
    const n = countMatches(combined, rule.pattern);
    if (n > 0) {
      markers.push(rule.label);
      scoreToward4 += rule.weight * Math.min(n, 2);
    }
  }

  // ── 5. Category heuristics ────────────────────────────────────────────────
  const categoryCombined = [productName, category].join(" ");
  if (hasCategory(categoryCombined, NOVA4_CATEGORIES)) {
    scoreToward4 += 1.2;
    markers.push("ultra-prosessert kategori");
  }
  const matchesNova1Category = hasCategory(categoryCombined, NOVA1_CATEGORIES);
  if (matchesNova1Category) {
    scoreToward4 -= 1.2;
    markers.push("minimal-prosessert kategori");
  }
  if (hasCategory(categoryCombined, NOVA3_CATEGORIES)) {
    scoreToward4 += 0.3;
    markers.push("prosessert kategori");
  }

  // ── 6. Assign NOVA group ──────────────────────────────────────────────────
  let novaGroup: NovaGroup;
  let classifierConfidence: number;

  if (apiNovaGroup && apiNovaGroup >= 1 && apiNovaGroup <= 4 && markers.length <= 1) {
    // Rely on API when we have little additional evidence
    novaGroup = apiNovaGroup as NovaGroup;
    classifierConfidence = 0.82;
  } else if (scoreToward4 >= 1.5) {
    novaGroup = 4;
    classifierConfidence = Math.min(0.95, 0.6 + scoreToward4 * 0.08);
  } else if (scoreToward4 >= 0.7) {
    novaGroup = 3;
    classifierConfidence = 0.65;
  } else if (scoreToward4 <= -0.8 && matchesNova1Category) {
    // Strongly negative score + explicit NOVA 1 category match → group 1
    novaGroup = 1;
    classifierConfidence = 0.75;
  } else if (scoreToward4 <= -0.5 && matchesNova1Category) {
    // Moderately negative with NOVA 1 category → likely group 1
    novaGroup = 1;
    classifierConfidence = 0.55;
  } else if (scoreToward4 >= 0.3 || !ingredients) {
    novaGroup = 3;
    classifierConfidence = 0.45; // low confidence when no ingredient data
  } else {
    novaGroup = 2;
    classifierConfidence = 0.5;
  }

  // If we have no data at all, return low-confidence NOVA 3 (safe default)
  if (!ingredients && !category && !productName && apiAdditives.length === 0) {
    novaGroup = 3;
    classifierConfidence = 0.25;
  }

  // ── 7. Build explanation ──────────────────────────────────────────────────
  const isUltraProcessed = novaGroup === 4;
  let explanation: string;

  if (novaGroup === 1) {
    explanation = "Minimalt prosessert matvare.";
  } else if (novaGroup === 2) {
    explanation = "Kulinarisk ingrediens (olje, mel, smør e.l.).";
  } else if (novaGroup === 3) {
    explanation = markers.length > 0
      ? `Prosessert matvare. Inneholder: ${markers.slice(0, 3).join(", ")}.`
      : "Prosessert matvare (begrenset data).";
  } else {
    const isBeverage = /\b(nocco|monster|redbull|red bull|celsius|energidrikk|energy drink|brus|sodavann|sportsdrikk|functional drink)\b/i.test(combined);
    explanation = markers.length > 0
      ? `Ultra-prosessert (NOVA 4). Inneholder: ${markers.slice(0, 4).join(", ")}.${isBeverage ? ' Tilsatt søtningsstoffer og/eller koffein.' : ''}`
      : isBeverage
        ? "Ultra-prosessert drikkevare. Typisk tilsatt søtningsstoffer, koffein og vitaminer."
        : "Ultra-prosessert produkt basert på kategorisering.";
  }

  return {
    novaGroup,
    isUltraProcessed,
    detectedAdditives: detected,
    detectedMarkers: markers,
    confidence: classifierConfidence,
    explanation,
  };
}
