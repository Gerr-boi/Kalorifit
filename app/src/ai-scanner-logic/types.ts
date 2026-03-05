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

export type NutritionResult = {
  source: "openfoodfacts" | "kassalapp" | "manual" | "matvaretabellen" | "foodrepo" | "food101";
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
  source: "openfoodfacts" | "kassalapp" | "matvaretabellen" | "foodrepo";
  message: string;
  status?: number;
};
