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
  fiberG: number;
  sugarsMaxG: number;       // recommended upper limit
  saturatedFatMaxG: number; // recommended upper limit (<10% of kcal)
  sodiumMaxMg: number;      // WHO limit: 2000 mg/day
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

const FAT_LOSS_STRATEGIES = new Set<GoalStrategy>(['slow_cut', 'standard_cut', 'aggressive_cut', 'event_prep', 'fat_reduction_no_scale']);
const MUSCLE_GAIN_STRATEGIES = new Set<GoalStrategy>(['lean_bulk', 'standard_bulk', 'aggressive_bulk', 'strength_focus']);
const MAINTENANCE_STRATEGIES = new Set<GoalStrategy>(['high_protein_maintenance', 'blood_markers', 'stable_energy', 'hormonal_balance', 'gut_health', 'endurance_focus', 'hybrid_athlete']);

function goalStrategyMatchesMode(strategy: GoalStrategy, mode: GoalMode): boolean {
  if (mode === 'fat_loss') return FAT_LOSS_STRATEGIES.has(strategy);
  if (mode === 'muscle_gain') return MUSCLE_GAIN_STRATEGIES.has(strategy);
  if (mode === 'recomp') return true;
  return MAINTENANCE_STRATEGIES.has(strategy);
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

  // If the stored goalStrategy doesn't match goalMode, reset it to the mode's default strategy
  const DEFAULT_STRATEGY_FOR_MODE: Record<GoalMode, GoalStrategy> = {
    fat_loss: 'standard_cut',
    muscle_gain: 'lean_bulk',
    recomp: 'fat_reduction_no_scale',
    maintenance: 'high_protein_maintenance',
  };
  const resolvedGoalStrategy: GoalStrategy = goalStrategyMatchesMode(goalStrategy, goalMode)
    ? goalStrategy
    : DEFAULT_STRATEGY_FOR_MODE[goalMode];

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
    goalStrategy: resolvedGoalStrategy,
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

/** Goal-mode fallback offsets when goalStrategy is mismatched */
const GOAL_MODE_FALLBACK_OFFSETS: Record<GoalMode, number> = {
  fat_loss: -400,
  muscle_gain: 300,
  recomp: -150,
  maintenance: 0,
};

function getGoalOffset(profile: NutritionProfile): number {
  const strategyMatches = goalStrategyMatchesMode(profile.goalStrategy, profile.goalMode);
  const baseOffset = strategyMatches
    ? (GOAL_OFFSETS[profile.goalStrategy] ?? 0)
    : GOAL_MODE_FALLBACK_OFFSETS[profile.goalMode];

  let offset = baseOffset;
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

  // Protein: higher for fat loss (muscle sparing) and muscle gain
  let proteinPerKg = 1.8;
  if (profile.goalMode === 'fat_loss') proteinPerKg = 2.0;
  if (profile.goalMode === 'muscle_gain') proteinPerKg = 2.2;
  if (profile.goalMode === 'recomp') proteinPerKg = 2.1;
  if (profile.dietStyle === 'high_protein') proteinPerKg += 0.2;
  if (profile.trainingType === 'strength' || profile.trainingType === 'crossfit') proteinPerKg += 0.1;
  if (trainingDay) proteinPerKg += 0.1;

  // Fat: minimum 0.6 g/kg for hormonal health, higher for keto/low-carb
  let fatPerKg = 0.8;
  if (profile.dietStyle === 'low_carb') fatPerKg = 1.1;
  if (profile.dietStyle === 'keto') fatPerKg = 1.4;
  if (profile.dietStyle === 'mediterranean') fatPerKg = 1.0;
  if (profile.goalMode === 'fat_loss') fatPerKg = Math.min(fatPerKg, 0.9);

  const proteinG = round(weight * proteinPerKg);
  const fatG = round(Math.max(weight * 0.6, weight * fatPerKg)); // floor at 0.6g/kg

  // Carbs fill remaining calories after protein + fat are accounted for
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  let remainingKcal = targetKcal - proteinKcal - fatKcal;

  // Keto: cap carbs at 30g (120 kcal)
  if (profile.dietStyle === 'keto') remainingKcal = Math.min(remainingKcal, 120);

  // Carb cycling: add on training days, reduce on rest days
  if (profile.dietStyle === 'carb_cycling') remainingKcal += trainingDay ? 200 : -100;
  if (profile.dietStyle === 'high_carb_performance') remainingKcal += trainingDay ? 160 : 0;

  const carbsG = Math.max(0, round(remainingKcal / 4));

  // Redistribute rounding errors into carbs so total kcal matches targetKcal exactly
  const totalKcal = proteinG * 4 + fatG * 9 + carbsG * 4;
  const roundingError = targetKcal - totalKcal;
  const adjustedCarbsG = Math.max(0, carbsG + round(roundingError / 4));

  // Fiber: DRI recommendation — 14g per 1000 kcal, with sex-based floor/ceiling
  const fiberBase = round((targetKcal / 1000) * 14);
  const fiberG = profile.sex === 'male'
    ? clamp(fiberBase, 30, 45)
    : clamp(fiberBase, 21, 35);

  // Sugars: WHO recommends <10% of total energy (<5% for extra benefit)
  const sugarsMaxG = round((targetKcal * 0.10) / 4);

  // Saturated fat: <10% of total energy
  const saturatedFatMaxG = round((targetKcal * 0.10) / 9);

  // Sodium: WHO limit 2000 mg/day regardless of calorie intake
  const sodiumMaxMg = 2000;

  return { proteinG, fatG, carbsG: adjustedCarbsG, fiberG, sugarsMaxG, saturatedFatMaxG, sodiumMaxMg };
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
    if (weightDeltaKg > -0.1) return { kcal: -step, reason: `Vekten synker ikke. Justerer ned ${step} kcal.` };
    if (weightDeltaKg < -1.0) return { kcal: step, reason: `Vekttap er for raskt. Legger til +${step} kcal.` };
    return { kcal: 0, reason: 'Vekttrend er innenfor sunt fettapstempo.' };
  }

  if (profile.goalMode === 'muscle_gain') {
    if (weightDeltaKg < 0.05) return { kcal: step, reason: `Vektøkning er for langsom. Legger til +${step} kcal.` };
    if (weightDeltaKg > 0.7) return { kcal: -step, reason: `Vektøkning er for rask. Justerer ned ${step} kcal.` };
    return { kcal: 0, reason: 'Vekttrend er innenfor sunt muskelopbygningstempo.' };
  }

  if (Math.abs(weightDeltaKg) > 0.4) {
    return { kcal: weightDeltaKg > 0 ? -step : step, reason: `Vektdrift oppdaget. Justerer med ${step} kcal.` };
  }
  return { kcal: 0, reason: 'Vekttrend er stabil.' };
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

  if (weekendAvg > weekdayAvg + 250) insights.push('Helger: du spiser i gjennomsnitt mer enn på hverdager. Planlegg litt bedre i helgen.');
  if (sundayProteinAvg > 0 && sundayProteinAvg < proteinTargetG * 0.75) insights.push('Søndager: proteininntak er lavere enn anbefalt. Legg til en proteinrik lunsj.');
  if (totalEventKcal > 0 && lateKcal / totalEventKcal > 0.35) insights.push('Mange kalorier spises etter kl. 20. Planlegg et proteinrikt kveldsmåltid.');

  const recentWeek = keys.slice(0, 7);
  const consistency = recentWeek.reduce((sum, key) => {
    const log = logsByDate[key];
    if (!log) return sum;
    return sum + (calculateDailyDisciplineScore(log).score >= 70 ? 1 : 0);
  }, 0);
  if (consistency <= 2) insights.push('Konsistensen falt denne uken. Prøv å logge minst ett måltid per dag.');
  else if (consistency >= 5) insights.push('Imponerende konsistens denne uken! Fortsett i samme spor.');

  // Protein under-achievement check
  const proteinDays = recentWeek.filter((key) => {
    const log = logsByDate[key];
    if (!log) return false;
    const dayProtein = Object.values(log.meals).flat().reduce((s, e) => s + (e.protein ?? 0), 0);
    return dayProtein > 0 && dayProtein < proteinTargetG * 0.8;
  }).length;
  if (proteinDays >= 4) insights.push('Du treffer sjelden proteinmålet ditt. Legg til en ekstra proteinkilde per dag.');

  return insights.slice(0, 3);
}

function projectedProgressText(profile: NutritionProfile, optimizedTargetKcal: number, tdee: number): string {
  const delta = optimizedTargetKcal - tdee;
  // 7700 kcal ≈ 1 kg body mass (fat + muscle combined estimate)
  const weeklyKg = round(((delta * 7) / 7700) * 100) / 100;
  const sign = weeklyKg >= 0 ? '+' : '';

  if (profile.timelineType === 'event_based' && profile.eventDate) {
    return `Estimert endring frem til arrangement: ~${sign}${weeklyKg} kg/uke`;
  }
  if (profile.timelineType === '8_week_cut') {
    const total = round(weeklyKg * 8 * 10) / 10;
    return `8-ukers prognose: ~${total < 0 ? '' : '+'}${total} kg`;
  }
  if (profile.timelineType === '12_week_bulk') {
    const total = round(weeklyKg * 12 * 10) / 10;
    return `12-ukers prognose: ~${sign}${total} kg`;
  }
  return `Estimert tempo: ~${sign}${weeklyKg} kg/uke`;
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

  // Adaptive nudge: if recent intake consistently exceeds/misses target, soft-correct
  if (recentAvgCalories > 0) {
    const gap = recentAvgCalories - baseTargetKcal;
    // Only nudge if consistently off-target for >3 days with data
    const daysWithData = recentKeys.filter((k) => {
      const log = params.logsByDate[k];
      return log && Object.values(log.meals).flat().length > 0;
    }).length;
    if (daysWithData >= 3) {
      if (profile.goalMode === 'fat_loss' && gap > 250) optimizedTargetKcal -= 50;
      else if (profile.goalMode === 'fat_loss' && gap < -400) optimizedTargetKcal += 30; // avoid too steep a deficit
      if (profile.goalMode === 'muscle_gain' && gap < -250) optimizedTargetKcal += 50;
    }
  }

  // NOTE: trainingDayCalorieBoost is NOT added here.
  // In the UI, the daily training calories (dayLog.trainingKcal) are added to the
  // net goal directly so the user sees the actual calories burned reflected in their budget.
  // trainingDayCalorieBoost is only used for the base target estimate when no workout is logged yet.
  const trainingDay = (params.logsByDate[toDateKey(endDate)]?.trainingKcal ?? 0) > 0;
  // If no workout logged yet today, add the estimated training day boost for planning purposes
  if (!trainingDay && profile.trainingDayCalorieBoost > 0) {
    // Don't add it — the UI adds trainingKcal to netGoal. This avoids double counting.
  }

  optimizedTargetKcal += cycleAdjustmentKcal(profile, endDate);

  // Metabolic sensitivity fine-tuning
  if (profile.metabolicSensitivity === 'gain_easy') optimizedTargetKcal -= 60;
  if (profile.metabolicSensitivity === 'lose_easy') optimizedTargetKcal += 60;

  // Enforce safe minimums: 1400 kcal for women, 1600 for men, 5500 ceiling
  const minKcal = profile.sex === 'female' ? 1400 : 1600;
  optimizedTargetKcal = round(clamp(optimizedTargetKcal, minKcal, 5500));

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
