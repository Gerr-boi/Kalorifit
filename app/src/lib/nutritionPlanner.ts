import { calculateDailyDisciplineScore, startOfDay, toDateKey, type DayLog } from './disciplineEngine';

export type BiologicalSex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very';
export type GoalMode = 'fat_loss' | 'muscle_gain' | 'recomp' | 'maintenance';
export type DietMode = 'standard' | 'performance' | 'athlete' | 'minimal';

export type SettingsTier = 'basic' | 'advanced';
export type GoalCategory = 'fat_loss' | 'muscle_gain' | 'recomp' | 'performance' | 'health';
export type GoalStrategy =
  | 'slow_cut'
  | 'standard_cut'
  | 'aggressive_cut'
  | 'event_prep'
  | 'lean_bulk'
  | 'standard_bulk'
  | 'aggressive_bulk'
  | 'high_protein_maintenance'
  | 'fat_reduction_no_scale'
  | 'strength_focus'
  | 'endurance_focus'
  | 'hybrid_athlete'
  | 'blood_markers'
  | 'stable_energy'
  | 'hormonal_balance'
  | 'gut_health';

export type DietStyle =
  | 'standard_balanced'
  | 'high_protein'
  | 'low_carb'
  | 'high_carb_performance'
  | 'carb_cycling'
  | 'keto'
  | 'mediterranean'
  | 'vegetarian'
  | 'vegan'
  | 'flexible_iifym'
  | 'structured_meal_plan';

export type TrainingType = 'strength' | 'running' | 'crossfit' | 'cycling' | 'mixed' | 'sedentary';
export type MetabolicSensitivity = 'gain_easy' | 'lose_easy' | 'normal';
export type PlateauSensitivity = 'conservative' | 'standard' | 'aggressive';
export type LifestylePattern = '3_meals' | '4_meals' | '5_small_meals' | 'if_16_8' | 'omad';
export type BehaviorPreference = 'strict' | 'flexible' | 'coaching' | 'minimal';
export type TimelineType = '8_week_cut' | '12_week_bulk' | 'maintenance_open' | 'event_based';
export type PsychologyType = 'data_driven' | 'visual' | 'competitive' | 'community' | 'private';
export type SpecialPhase = 'normal' | 'reverse_diet' | 'recovery' | 'smart_auto';

export type NutritionProfile = {
  age: number;
  weightKg: number;
  heightCm: number;
  sex: BiologicalSex;
  activityLevel: ActivityLevel;
  goalMode: GoalMode;
  dietMode: DietMode;

  settingsTier: SettingsTier;
  goalCategory: GoalCategory;
  goalStrategy: GoalStrategy;
  dietStyle: DietStyle;
  trainingType: TrainingType;
  trainingDayCalorieBoost: number;
  metabolicSensitivity: MetabolicSensitivity;
  plateauSensitivity: PlateauSensitivity;
  cycleBasedAdjustments: boolean;
  cycleStartDate?: string | null;
  cycleLengthDays: number;
  lifestylePattern: LifestylePattern;
  behaviorPreference: BehaviorPreference;
  timelineType: TimelineType;
  timelineWeeks: number;
  eventDate?: string | null;
  psychologyType: PsychologyType;
  specialPhase: SpecialPhase;
};

export type PlannerLogEvent = {
  type: string;
  kcal?: number;
  timestampIso: string;
};

export type PlannerWeightEntry = {
  date: string;
  weightKg: number;
};

export type MacroTargets = {
  proteinG: number;
  fatG: number;
  carbsG: number;
};

export type SmartDietPlan = {
  bmr: number;
  tdee: number;
  baseTargetKcal: number;
  optimizedTargetKcal: number;
  weeklyAdjustmentKcal: number;
  adjustmentReason: string;
  macros: MacroTargets | null;
  behaviorInsights: string[];
  projectedProgressText: string;
};

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  age: 30,
  weightKg: 70,
  heightCm: 170,
  sex: 'female',
  activityLevel: 'moderate',
  goalMode: 'maintenance',
  dietMode: 'standard',

  settingsTier: 'basic',
  goalCategory: 'fat_loss',
  goalStrategy: 'standard_cut',
  dietStyle: 'standard_balanced',
  trainingType: 'mixed',
  trainingDayCalorieBoost: 200,
  metabolicSensitivity: 'normal',
  plateauSensitivity: 'standard',
  cycleBasedAdjustments: false,
  cycleStartDate: null,
  cycleLengthDays: 28,
  lifestylePattern: '3_meals',
  behaviorPreference: 'flexible',
  timelineType: 'maintenance_open',
  timelineWeeks: 12,
  eventDate: null,
  psychologyType: 'data_driven',
  specialPhase: 'normal',
};

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

const GOAL_OFFSETS: Record<GoalStrategy, number> = {
  slow_cut: -250,
  standard_cut: -400,
  aggressive_cut: -600,
  event_prep: -550,
  lean_bulk: 200,
  standard_bulk: 350,
  aggressive_bulk: 500,
  high_protein_maintenance: 0,
  fat_reduction_no_scale: -150,
  strength_focus: 100,
  endurance_focus: 150,
  hybrid_athlete: 120,
  blood_markers: 0,
  stable_energy: 0,
  hormonal_balance: 0,
  gut_health: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function mapGoalModeFromCategory(category: GoalCategory): GoalMode {
  if (category === 'fat_loss') return 'fat_loss';
  if (category === 'muscle_gain') return 'muscle_gain';
  if (category === 'recomp') return 'recomp';
  return 'maintenance';
}

function mapDietModeFromStyle(style: DietStyle): DietMode {
  if (style === 'high_carb_performance' || style === 'carb_cycling') return 'athlete';
  if (style === 'structured_meal_plan') return 'performance';
  return 'standard';
}

export function normalizeNutritionProfile(raw: Partial<NutritionProfile> | null | undefined): NutritionProfile {
  const merged = { ...DEFAULT_NUTRITION_PROFILE, ...(raw ?? {}) };

  const goalCategory = ['fat_loss', 'muscle_gain', 'recomp', 'performance', 'health'].includes(String(merged.goalCategory))
    ? (merged.goalCategory as GoalCategory)
    : DEFAULT_NUTRITION_PROFILE.goalCategory;

  const goalStrategy = [
    'slow_cut', 'standard_cut', 'aggressive_cut', 'event_prep',
    'lean_bulk', 'standard_bulk', 'aggressive_bulk',
    'high_protein_maintenance', 'fat_reduction_no_scale',
    'strength_focus', 'endurance_focus', 'hybrid_athlete',
    'blood_markers', 'stable_energy', 'hormonal_balance', 'gut_health',
  ].includes(String(merged.goalStrategy))
    ? (merged.goalStrategy as GoalStrategy)
    : DEFAULT_NUTRITION_PROFILE.goalStrategy;

  const dietStyle = [
    'standard_balanced', 'high_protein', 'low_carb', 'high_carb_performance',
    'carb_cycling', 'keto', 'mediterranean', 'vegetarian', 'vegan',
    'flexible_iifym', 'structured_meal_plan',
  ].includes(String(merged.dietStyle))
    ? (merged.dietStyle as DietStyle)
    : DEFAULT_NUTRITION_PROFILE.dietStyle;

  const goalMode = ['fat_loss', 'muscle_gain', 'recomp', 'maintenance'].includes(String(merged.goalMode))
    ? (merged.goalMode as GoalMode)
    : mapGoalModeFromCategory(goalCategory);

  const dietMode = ['standard', 'performance', 'athlete', 'minimal'].includes(String(merged.dietMode))
    ? (merged.dietMode as DietMode)
    : mapDietModeFromStyle(dietStyle);

  return {
    age: clamp(Number(merged.age) || DEFAULT_NUTRITION_PROFILE.age, 14, 90),
    weightKg: clamp(Number(merged.weightKg) || DEFAULT_NUTRITION_PROFILE.weightKg, 35, 250),
    heightCm: clamp(Number(merged.heightCm) || DEFAULT_NUTRITION_PROFILE.heightCm, 130, 230),
    sex: merged.sex === 'male' ? 'male' : 'female',
    activityLevel: ['sedentary', 'light', 'moderate', 'very'].includes(String(merged.activityLevel))
      ? (merged.activityLevel as ActivityLevel)
      : DEFAULT_NUTRITION_PROFILE.activityLevel,
    goalMode,
    dietMode,

    settingsTier: merged.settingsTier === 'advanced' ? 'advanced' : 'basic',
    goalCategory,
    goalStrategy,
    dietStyle,
    trainingType: ['strength', 'running', 'crossfit', 'cycling', 'mixed', 'sedentary'].includes(String(merged.trainingType))
      ? (merged.trainingType as TrainingType)
      : DEFAULT_NUTRITION_PROFILE.trainingType,
    trainingDayCalorieBoost: clamp(Number(merged.trainingDayCalorieBoost) || DEFAULT_NUTRITION_PROFILE.trainingDayCalorieBoost, 0, 500),
    metabolicSensitivity: ['gain_easy', 'lose_easy', 'normal'].includes(String(merged.metabolicSensitivity))
      ? (merged.metabolicSensitivity as MetabolicSensitivity)
      : DEFAULT_NUTRITION_PROFILE.metabolicSensitivity,
    plateauSensitivity: ['conservative', 'standard', 'aggressive'].includes(String(merged.plateauSensitivity))
      ? (merged.plateauSensitivity as PlateauSensitivity)
      : DEFAULT_NUTRITION_PROFILE.plateauSensitivity,
    cycleBasedAdjustments: Boolean(merged.cycleBasedAdjustments),
    cycleStartDate: merged.cycleStartDate ?? null,
    cycleLengthDays: clamp(Number(merged.cycleLengthDays) || DEFAULT_NUTRITION_PROFILE.cycleLengthDays, 21, 40),
    lifestylePattern: ['3_meals', '4_meals', '5_small_meals', 'if_16_8', 'omad'].includes(String(merged.lifestylePattern))
      ? (merged.lifestylePattern as LifestylePattern)
      : DEFAULT_NUTRITION_PROFILE.lifestylePattern,
    behaviorPreference: ['strict', 'flexible', 'coaching', 'minimal'].includes(String(merged.behaviorPreference))
      ? (merged.behaviorPreference as BehaviorPreference)
      : DEFAULT_NUTRITION_PROFILE.behaviorPreference,
    timelineType: ['8_week_cut', '12_week_bulk', 'maintenance_open', 'event_based'].includes(String(merged.timelineType))
      ? (merged.timelineType as TimelineType)
      : DEFAULT_NUTRITION_PROFILE.timelineType,
    timelineWeeks: clamp(Number(merged.timelineWeeks) || DEFAULT_NUTRITION_PROFILE.timelineWeeks, 4, 52),
    eventDate: merged.eventDate ?? null,
    psychologyType: ['data_driven', 'visual', 'competitive', 'community', 'private'].includes(String(merged.psychologyType))
      ? (merged.psychologyType as PsychologyType)
      : DEFAULT_NUTRITION_PROFILE.psychologyType,
    specialPhase: ['normal', 'reverse_diet', 'recovery', 'smart_auto'].includes(String(merged.specialPhase))
      ? (merged.specialPhase as SpecialPhase)
      : DEFAULT_NUTRITION_PROFILE.specialPhase,
  };
}

export function calculateBmr(profile: NutritionProfile): number {
  const { weightKg, heightCm, age, sex } = profile;
  if (sex === 'male') return round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  return round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
}

export function calculateTdee(profile: NutritionProfile): number {
  const bmr = calculateBmr(profile);
  return round(bmr * ACTIVITY_FACTORS[profile.activityLevel]);
}

function getGoalOffset(profile: NutritionProfile): number {
  let offset = GOAL_OFFSETS[profile.goalStrategy] ?? 0;
  if (profile.specialPhase === 'reverse_diet') offset += 150;
  if (profile.specialPhase === 'recovery') offset += 200;
  return offset;
}

export function calculateBaseTargetKcal(profile: NutritionProfile): number {
  return round(calculateTdee(profile) + getGoalOffset(profile));
}

function cycleAdjustmentKcal(profile: NutritionProfile, date: Date): number {
  if (!profile.cycleBasedAdjustments || profile.sex !== 'female' || !profile.cycleStartDate) return 0;
  const start = new Date(`${profile.cycleStartDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const diffDays = Math.floor((startOfDay(date).getTime() - startOfDay(start).getTime()) / (1000 * 60 * 60 * 24));
  const cycleDay = ((diffDays % profile.cycleLengthDays) + profile.cycleLengthDays) % profile.cycleLengthDays;
  return cycleDay >= profile.cycleLengthDays - 5 ? 80 : 0;
}

function calculateMacroTargets(profile: NutritionProfile, targetKcal: number, trainingDay: boolean): MacroTargets {
  const weight = profile.weightKg;

  let proteinPerKg = 1.8;
  if (profile.goalMode === 'fat_loss') proteinPerKg = 1.9;
  if (profile.goalMode === 'muscle_gain') proteinPerKg = 2.1;
  if (profile.dietStyle === 'high_protein') proteinPerKg += 0.2;

  let fatPerKg = 0.8;
  if (profile.dietStyle === 'low_carb' || profile.dietStyle === 'keto') fatPerKg = 1.0;
  if (profile.goalMode === 'fat_loss') fatPerKg = Math.min(fatPerKg, 0.8);

  const proteinG = round(weight * proteinPerKg);
  const fatG = round(weight * fatPerKg);

  let carbsKcal = targetKcal - proteinG * 4 - fatG * 9;
  if (profile.dietStyle === 'high_carb_performance') carbsKcal += trainingDay ? 140 : 0;
  if (profile.dietStyle === 'carb_cycling') carbsKcal += trainingDay ? 180 : -120;
  if (profile.dietStyle === 'keto') carbsKcal = Math.min(carbsKcal, 120);

  const carbsG = Math.max(0, round(carbsKcal / 4));
  return { proteinG, fatG, carbsG };
}

function avgForDateKeys(logsByDate: Record<string, DayLog>, keys: string[]): number {
  if (keys.length === 0) return 0;
  const total = keys.reduce((sum, key) => {
    const log = logsByDate[key];
    if (!log) return sum;
    const kcal = Object.values(log.meals).flat().reduce((acc, item) => acc + item.kcal, 0);
    return sum + kcal;
  }, 0);
  return total / keys.length;
}

function getRecentDateKeys(endDate: Date, days: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    result.push(toDateKey(startOfDay(d)));
  }
  return result;
}

function weeklyWeightTrendKg(weights: PlannerWeightEntry[], endDate: Date): number {
  const endKey = toDateKey(startOfDay(endDate));
  const sorted = [...weights]
    .filter((entry) => entry.date <= endKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (sorted.length < 2) return 0;
  const recent = sorted.slice(-3);
  const baseline = sorted.slice(-6, -3);
  if (baseline.length === 0) return 0;

  const recentAvg = recent.reduce((sum, entry) => sum + entry.weightKg, 0) / recent.length;
  const baselineAvg = baseline.reduce((sum, entry) => sum + entry.weightKg, 0) / baseline.length;
  return recentAvg - baselineAvg;
}

function deriveWeeklyAdjustment(profile: NutritionProfile, weightDeltaKg: number): { kcal: number; reason: string } {
  const step = profile.plateauSensitivity === 'conservative' ? 60 : profile.plateauSensitivity === 'aggressive' ? 140 : 100;

  if (profile.goalMode === 'fat_loss') {
    if (weightDeltaKg > -0.1) return { kcal: -step, reason: `Weight is not dropping. Applying -${step} kcal.` };
    if (weightDeltaKg < -1.0) return { kcal: step, reason: `Weight is dropping too fast. Adding +${step} kcal.` };
    return { kcal: 0, reason: 'Weight trend is in healthy fat-loss range.' };
  }

  if (profile.goalMode === 'muscle_gain') {
    if (weightDeltaKg < 0.05) return { kcal: step, reason: `Weight gain is too slow. Applying +${step} kcal.` };
    if (weightDeltaKg > 0.7) return { kcal: -step, reason: `Weight gain is too fast. Applying -${step} kcal.` };
    return { kcal: 0, reason: 'Weight trend is in healthy muscle-gain range.' };
  }

  if (Math.abs(weightDeltaKg) > 0.4) {
    return { kcal: weightDeltaKg > 0 ? -step : step, reason: `Drift detected. Adjusting by ${step} kcal.` };
  }
  return { kcal: 0, reason: 'Trend is stable.' };
}

function generateBehaviorInsights(
  logsByDate: Record<string, DayLog>,
  logEvents: PlannerLogEvent[],
  endDate: Date,
  proteinTargetG: number,
): string[] {
  const end = startOfDay(endDate);
  const keys = getRecentDateKeys(end, 28);

  const weekendKeys = keys.filter((key) => {
    const d = new Date(`${key}T00:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  });
  const weekdayKeys = keys.filter((key) => !weekendKeys.includes(key));

  const weekendAvg = avgForDateKeys(logsByDate, weekendKeys);
  const weekdayAvg = avgForDateKeys(logsByDate, weekdayKeys);

  const sundayProtein = keys
    .filter((key) => new Date(`${key}T00:00:00`).getDay() === 0)
    .map((key) => {
      const log = logsByDate[key];
      if (!log) return 0;
      return Object.values(log.meals).flat().reduce((sum, item) => sum + item.protein, 0);
    });
  const sundayProteinAvg = sundayProtein.length > 0 ? sundayProtein.reduce((a, b) => a + b, 0) / sundayProtein.length : 0;

  const lateMealEvents = logEvents.filter((event) => {
    if (event.type !== 'meal') return false;
    const d = new Date(event.timestampIso);
    return d.getHours() >= 20;
  });
  const lateKcal = lateMealEvents.reduce((sum, event) => sum + (event.kcal ?? 0), 0);
  const totalEventKcal = logEvents.reduce((sum, event) => sum + (event.kcal ?? 0), 0);

  const insights: string[] = [];

  if (weekendAvg > weekdayAvg + 250) insights.push('Weekend calorie intake is higher than weekdays. Consider a weekend buffer.');
  if (sundayProteinAvg > 0 && sundayProteinAvg < proteinTargetG * 0.75) insights.push('You under-eat protein on Sundays compared with your target.');
  if (totalEventKcal > 0 && lateKcal / totalEventKcal > 0.35) insights.push('Calories often spike after 8 PM. Plan a protein-forward evening meal.');

  const recentWeek = keys.slice(0, 7);
  const consistency = recentWeek.reduce((sum, key) => {
    const log = logsByDate[key];
    if (!log) return sum;
    return sum + (calculateDailyDisciplineScore(log).score >= 70 ? 1 : 0);
  }, 0);
  if (consistency <= 3) insights.push('Consistency dropped this week. Use a simpler logging mode temporarily.');

  return insights.slice(0, 3);
}

function projectedProgressText(profile: NutritionProfile, optimizedTargetKcal: number, tdee: number): string {
  const delta = optimizedTargetKcal - tdee;
  const weeklyKg = round(((delta * 7) / 7700) * 100) / 100;

  if (profile.timelineType === 'event_based' && profile.eventDate) {
    return `Projected change to event: ~${weeklyKg >= 0 ? '+' : ''}${weeklyKg} kg/week`;
  }
  if (profile.timelineType === '8_week_cut') {
    return `8-week projection: ~${round(weeklyKg * 8 * 10) / 10} kg`;
  }
  if (profile.timelineType === '12_week_bulk') {
    return `12-week projection: ~${round(weeklyKg * 12 * 10) / 10} kg`;
  }
  return `Open projection: ~${weeklyKg >= 0 ? '+' : ''}${weeklyKg} kg/week`;
}

export function buildSmartDietPlan(params: {
  profile: NutritionProfile;
  logsByDate: Record<string, DayLog>;
  logEvents: PlannerLogEvent[];
  weightHistory: PlannerWeightEntry[];
  date: Date;
}): SmartDietPlan {
  const profile = normalizeNutritionProfile(params.profile);
  const endDate = startOfDay(params.date);

  const bmr = calculateBmr(profile);
  const tdee = calculateTdee(profile);
  const baseTargetKcal = calculateBaseTargetKcal(profile);

  const recentKeys = getRecentDateKeys(endDate, 7);
  const recentAvgCalories = avgForDateKeys(params.logsByDate, recentKeys);
  const weightDeltaKg = weeklyWeightTrendKg(params.weightHistory, endDate);

  const adaptiveEnabled = profile.dietMode === 'performance' || profile.dietMode === 'athlete' || profile.specialPhase === 'smart_auto';
  const adjustment = adaptiveEnabled
    ? deriveWeeklyAdjustment(profile, weightDeltaKg)
    : { kcal: 0, reason: 'Standard mode uses static target.' };

  let optimizedTargetKcal = baseTargetKcal + adjustment.kcal;

  if (recentAvgCalories > 0) {
    const gap = recentAvgCalories - baseTargetKcal;
    if (profile.goalMode === 'fat_loss' && gap > 250) optimizedTargetKcal -= 40;
    if (profile.goalMode === 'muscle_gain' && gap < -250) optimizedTargetKcal += 40;
  }

  const trainingDay = (params.logsByDate[toDateKey(endDate)]?.trainingKcal ?? 0) > 0;
  if (trainingDay) optimizedTargetKcal += profile.trainingDayCalorieBoost;
  optimizedTargetKcal += cycleAdjustmentKcal(profile, endDate);

  if (profile.metabolicSensitivity === 'gain_easy') optimizedTargetKcal -= 40;
  if (profile.metabolicSensitivity === 'lose_easy') optimizedTargetKcal += 40;

  optimizedTargetKcal = round(clamp(optimizedTargetKcal, 1200, 5200));

  const macros = profile.dietMode === 'minimal' ? null : calculateMacroTargets(profile, optimizedTargetKcal, trainingDay);

  const behaviorInsights = generateBehaviorInsights(
    params.logsByDate,
    params.logEvents,
    endDate,
    macros?.proteinG ?? Math.round(profile.weightKg * 1.8),
  );

  return {
    bmr,
    tdee,
    baseTargetKcal,
    optimizedTargetKcal,
    weeklyAdjustmentKcal: optimizedTargetKcal - baseTargetKcal,
    adjustmentReason: adjustment.reason,
    macros,
    behaviorInsights,
    projectedProgressText: projectedProgressText(profile, optimizedTargetKcal, tdee),
  };
}
