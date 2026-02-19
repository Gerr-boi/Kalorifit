export type Barcode = string;

export type MacroNutrients = {
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type NutritionResult = {
  source: "openfoodfacts" | "kassalapp" | "manual" | "matvaretabellen";
  barcode?: Barcode;
  name: string;
  brand?: string;
  servingSize_g?: number;       // if known
  per100g?: MacroNutrients;      // best case
  perServing?: MacroNutrients;   // optional
  confidence: number;           // 0..1
  raw?: unknown;                // keep original API payload for debugging
};

export type LookupError = {
  source: "openfoodfacts" | "kassalapp" | "matvaretabellen";
  message: string;
  status?: number;
};