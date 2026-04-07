export type Barcode = string;

export type MacroNutrients = {
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugars_g?: number;
  saturated_fat_g?: number;
  salt_g?: number;
  sodium_mg?: number;
};

/** NOVA food processing classification (1 = unprocessed, 4 = ultra-processed) */
export type NovaGroup = 1 | 2 | 3 | 4;

export type ProcessingInfo = {
  novaGroup: NovaGroup;
  isUltraProcessed: boolean;
  detectedAdditives: string[];   // e.g. ["E471", "E621", "modified starch"]
  detectedMarkers: string[];     // human-readable reasons
  confidence: number;            // 0..1 — how certain we are of the NOVA group
  explanation: string;           // short Norwegian-language explanation
};

/** Source signal used to arrive at a NutritionResult */
export type EvidenceSignal = {
  type: "barcode" | "ocr_text" | "image_similarity" | "text_search" | "category";
  source: string;
  confidence: number;
};

export type NutritionResult = {
  source: "openfoodfacts" | "kassalapp" | "manual" | "matvaretabellen" | "foodrepo" | "food101";
  barcode?: Barcode;
  name: string;
  brand?: string;
  servingSize_g?: number;
  per100g?: MacroNutrients;
  perServing?: MacroNutrients;
  confidence: number;            // 0..1
  /** Free-text ingredients list (raw string from label/API) */
  ingredients?: string;
  /** Detected E-numbers and additive names */
  additives?: string[];
  /** Allergen tags e.g. ["gluten", "milk"] */
  allergens?: string[];
  /** Front-of-pack image URL */
  imageFrontUrl?: string;
  /** NOVA processing classification (if resolved) */
  processingInfo?: ProcessingInfo;
  /** Signals that contributed to this result */
  evidenceSignals?: EvidenceSignal[];
  /** Human-readable explanation of why this result was chosen */
  matchExplanation?: string;
  raw?: unknown;
};

export type LookupError = {
  source: "openfoodfacts" | "kassalapp" | "matvaretabellen" | "foodrepo";
  message: string;
  status?: number;
};
