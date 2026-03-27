export type MealId = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type BeverageType = 'water' | 'milk' | 'juice' | 'soda' | 'coffee' | 'tea' | 'smoothie' | 'other';

export type FoodEntry = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  // Extended macros — populated from scanned food labels when available
  fiber_g?: number;
  sugars_g?: number;
  saturated_fat_g?: number;
  salt_g?: number;
  sodium_mg?: number;
  // Beverage tracking
  drinkMl?: number;
  beverageType?: BeverageType;
  hydrationFactor?: number;
};

export type DayLog = {
  meals: Record<MealId, FoodEntry[]>;
  trainingKcal: number;
  waterMl: number;
};

export type DailyDisciplineMetric = {
  key: 'calorie' | 'protein' | 'water' | 'activity' | 'logging';
  label: string;
  percent: number;
  targetLabel: string;
  progressLabel: string;
  missingLabel: string;
};

export type DailyDisciplineScore = {
  score: number;
  grade: 'Utmerket' | 'Bra' | 'OK' | 'Jobber med det';
  metrics: DailyDisciplineMetric[];
  accomplished: string[];
  missing: string[];
};

export type WeeklyPerformanceReport = {
  weekStartKey: string;
  weekEndKey: string;
  generatedAtIso: string;
  avgDisciplineScore: number;
  bestDay: { dateKey: string; score: number };
  worstDay: { dateKey: string; score: number };
  streakStatus: string;
  trendDirection: 'up' | 'down' | 'flat';
  days: Array<{ dateKey: string; score: number }>;
};

export const CALORIE_GOAL = 2000;
export const PROTEIN_GOAL_G = 150;
export const WATER_GOAL_ML = 2500;
export const ACTIVITY_GOAL_KCAL = 200;

const DAILY_WEIGHTS = {
  calorie: 0.3,
  protein: 0.25,
  water: 0.15,
  activity: 0.15,
  logging: 0.15,
} as const;

export function createEmptyDayLog(): DayLog {
  return {
    meals: {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    },
    trainingKcal: 0,
    waterMl: 0,
  };
}

export function getHydrationFactor(type: BeverageType): number {
  switch (type) {
    case 'water':
      return 1;
    case 'milk':
      return 0.9;
    case 'tea':
      return 0.95;
    case 'coffee':
      return 0.9;
    case 'juice':
      return 0.8;
    case 'smoothie':
      return 0.7;
    case 'soda':
      return 0.65;
    default:
      return 0.75;
  }
}

export function classifyBeverageType(name: string): BeverageType | null {
  const text = name.trim().toLowerCase();
  if (!text) return null;
  if (/(^|\s)(water|vann|mineral water)(\s|$)/.test(text)) return 'water';
  if (/(milk|melk|kefir|yoghurt drink|yoghurtdrikk|drinkyoghurt|sjokolademelk|chocolate milk|kakao)/.test(text)) return 'milk';
  if (/(juice|jus|nektar|nectar|apple juice|orange juice|eplejuice)/.test(text)) return 'juice';
  if (/(cola|coca cola|coke|pepsi|sprite|fanta|soda|brus|soft drink|energy drink)/.test(text)) return 'soda';
  if (/(smoothie|shake|protein shake|milkshake)/.test(text)) return 'smoothie';
  if (/(coffee|kaffe|espresso|latte|cappuccino|mocha)/.test(text)) return 'coffee';
  if (/(tea|te|iced tea|iste)/.test(text)) return 'tea';
  if (/(drink|drikk|beverage)/.test(text)) return 'other';
  return null;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return startOfDay(copy);
}

export function startOfWeekMonday(date: Date): Date {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}

function getDailyTotals(log: DayLog) {
  const entries = Object.values(log.meals).flat();
  const consumedKcal = entries.reduce((sum, item) => sum + item.kcal, 0);
  const proteinG = entries.reduce((sum, item) => sum + item.protein, 0);
  const loggedMealSlots = (Object.keys(log.meals) as MealId[]).filter((mealId) => log.meals[mealId].length > 0).length;
  const totalMealsLogged = entries.length;
  return { consumedKcal, proteinG, loggedMealSlots, totalMealsLogged };
}

export function getFoodEntryHydrationMl(entry: FoodEntry): number {
  const drinkMl = Number(entry.drinkMl ?? 0);
  if (!Number.isFinite(drinkMl) || drinkMl <= 0) return 0;
  const factor = typeof entry.hydrationFactor === 'number' ? entry.hydrationFactor : getHydrationFactor(entry.beverageType ?? 'other');
  return Math.round(drinkMl * factor);
}

export function getTotalHydrationMl(log: DayLog): number {
  const mealHydrationMl = Object.values(log.meals)
    .flat()
    .reduce((sum, entry) => sum + getFoodEntryHydrationMl(entry), 0);
  return Number(log.waterMl ?? 0) + mealHydrationMl;
}

function getGrade(score: number): DailyDisciplineScore['grade'] {
  if (score >= 85) return 'Utmerket';
  if (score >= 70) return 'Bra';
  if (score >= 55) return 'OK';
  return 'Jobber med det';
}

export type DisciplineTargets = {
  calorieGoal?: number;
  proteinGoalG?: number;
  waterGoalMl?: number;
  activityGoalKcal?: number;
};

export function calculateDailyDisciplineScore(log: DayLog, targets?: DisciplineTargets): DailyDisciplineScore {
  const { consumedKcal, proteinG, loggedMealSlots, totalMealsLogged } = getDailyTotals(log);
  const hydrationMl = getTotalHydrationMl(log);

  // Use personalized targets when provided, fall back to default constants
  const calorieGoal = (targets?.calorieGoal && targets.calorieGoal > 0) ? targets.calorieGoal : CALORIE_GOAL;
  const proteinGoal = (targets?.proteinGoalG && targets.proteinGoalG > 0) ? targets.proteinGoalG : PROTEIN_GOAL_G;
  const waterGoal = (targets?.waterGoalMl && targets.waterGoalMl > 0) ? targets.waterGoalMl : WATER_GOAL_ML;
  const activityGoal = (targets?.activityGoalKcal && targets.activityGoalKcal > 0) ? targets.activityGoalKcal : ACTIVITY_GOAL_KCAL;

  // Calorie score: proximity to goal (within ±10% = perfect, >50% off = 0)
  const calorieDeviation = Math.abs(consumedKcal - calorieGoal) / calorieGoal;
  const caloriePct = clamp(round(100 - calorieDeviation * 100), 0, 100);

  const proteinPct = clamp(round((proteinG / proteinGoal) * 100), 0, 100);
  const waterPct = clamp(round((hydrationMl / waterGoal) * 100), 0, 100);
  const activityPct = clamp(round((log.trainingKcal / activityGoal) * 100), 0, 100);

  // Logging score: proportional across all three dimensions (not binary)
  const mealCoveragePct = clamp(round((loggedMealSlots / 3) * 100), 0, 100);
  const hydrationLoggedPct = clamp(round((hydrationMl / waterGoal) * 100), 0, 100); // proportional, not binary
  const activityLoggedPct = log.trainingKcal > 0 ? 100 : 0;
  const loggingPct = round(mealCoveragePct * 0.6 + hydrationLoggedPct * 0.2 + activityLoggedPct * 0.2);

  const score = round(
    caloriePct * DAILY_WEIGHTS.calorie +
      proteinPct * DAILY_WEIGHTS.protein +
      waterPct * DAILY_WEIGHTS.water +
      activityPct * DAILY_WEIGHTS.activity +
      loggingPct * DAILY_WEIGHTS.logging,
  );

  const metrics: DailyDisciplineMetric[] = [
    {
      key: 'calorie',
      label: 'Kaloriinntak',
      percent: caloriePct,
      targetLabel: `Mål: ${calorieGoal} kcal`,
      progressLabel: `${round(consumedKcal)} kcal logget`,
      missingLabel:
        consumedKcal >= calorieGoal
          ? `${round(consumedKcal - calorieGoal)} kcal over mål`
          : `${round(calorieGoal - consumedKcal)} kcal igjen`,
    },
    {
      key: 'protein',
      label: 'Protein',
      percent: proteinPct,
      targetLabel: `Mål: ${proteinGoal} g`,
      progressLabel: `${round(proteinG)} g logget`,
      missingLabel:
        proteinG >= proteinGoal ? 'Proteinmål nådd ✓' : `${round(proteinGoal - proteinG)} g protein mangler`,
    },
    {
      key: 'water',
      label: 'Hydrering',
      percent: waterPct,
      targetLabel: `Mål: ${(waterGoal / 1000).toFixed(1)} L`,
      progressLabel: `${(hydrationMl / 1000).toFixed(1)} L logget`,
      missingLabel:
        hydrationMl >= waterGoal
          ? 'Hydreringsmål nådd ✓'
          : `${((waterGoal - hydrationMl) / 1000).toFixed(1)} L mangler`,
    },
    {
      key: 'activity',
      label: 'Aktivitet',
      percent: activityPct,
      targetLabel: `Mål: ${activityGoal} kcal`,
      progressLabel: `${round(log.trainingKcal)} kcal logget`,
      missingLabel:
        log.trainingKcal >= activityGoal
          ? 'Aktivitetsmål nådd ✓'
          : `${round(activityGoal - log.trainingKcal)} kcal aktivitet mangler`,
    },
    {
      key: 'logging',
      label: 'Logging',
      percent: loggingPct,
      targetLabel: '3 måltider + vann + aktivitet',
      progressLabel: `${totalMealsLogged} matvarer, ${hydrationMl > 0 ? `${(hydrationMl / 1000).toFixed(1)} L vann` : 'ingen vann'}, ${log.trainingKcal > 0 ? 'aktivitet logget' : 'ingen aktivitet'}`,
      missingLabel:
        loggingPct >= 100
          ? 'Logging fullført ✓'
          : `${Math.max(0, 3 - loggedMealSlots)} måltid(er) mangler${hydrationMl === 0 ? ', vann mangler' : ''}${log.trainingKcal === 0 ? ', aktivitet mangler' : ''}`,
    },
  ];

  const accomplished = metrics
    .filter((metric) => metric.percent >= 85)
    .map((metric) => `${metric.label} ${metric.percent}%`);

  const missing = metrics
    .filter((metric) => metric.percent < 85)
    .map((metric) => metric.missingLabel);

  return {
    score,
    grade: getGrade(score),
    metrics,
    accomplished,
    missing,
  };
}

function calculateScoreForDate(logsByDate: Record<string, DayLog>, date: Date): number {
  const key = toDateKey(date);
  const dayLog = logsByDate[key] ?? createEmptyDayLog();
  return calculateDailyDisciplineScore(dayLog).score;
}

function calculateStreakDays(logsByDate: Record<string, DayLog>, endDate: Date, minScore = 70): number {
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const date = addDays(endDate, -offset);
    const score = calculateScoreForDate(logsByDate, date);
    if (score < minScore) break;
    streak += 1;
  }
  return streak;
}

export function generateWeeklyPerformanceReport(logsByDate: Record<string, DayLog>, weekStartDate: Date): WeeklyPerformanceReport {
  const weekStart = startOfWeekMonday(weekStartDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const today = startOfDay(new Date());
  const days = weekDays.map((date) => ({
    dateKey: toDateKey(date),
    score: calculateScoreForDate(logsByDate, date),
  }));

  // Ignore future dates for the active week so "best/worst day" never points to tomorrow.
  const reportDays = days.filter((_, index) => weekDays[index].getTime() <= today.getTime());
  const scoredDays = reportDays.length > 0 ? reportDays : [days[0]];

  const avgDisciplineScore = round(scoredDays.reduce((sum, day) => sum + day.score, 0) / scoredDays.length);
  const sorted = [...scoredDays].sort((a, b) => b.score - a.score);
  const bestDay = sorted[0];
  const worstDay = sorted[sorted.length - 1];
  const weekEndDate =
    reportDays.length > 0
      ? weekDays[reportDays.length - 1]
      : weekDays[0];

  const previousWeekStart = addDays(weekStart, -7);
  const previousWeekDays = Array.from({ length: 7 }, (_, index) => addDays(previousWeekStart, index));
  const previousAvg =
    previousWeekDays.reduce((sum, date) => sum + calculateScoreForDate(logsByDate, date), 0) / previousWeekDays.length;

  let trendDirection: WeeklyPerformanceReport['trendDirection'] = 'flat';
  if (avgDisciplineScore >= previousAvg + 3) trendDirection = 'up';
  if (avgDisciplineScore <= previousAvg - 3) trendDirection = 'down';

  const streakDays = calculateStreakDays(logsByDate, weekEndDate);
  const streakStatus = streakDays > 0 ? `${streakDays} dagers streak` : 'Ingen aktiv streak';

  return {
    weekStartKey: toDateKey(weekStart),
    weekEndKey: toDateKey(weekEndDate),
    generatedAtIso: new Date().toISOString(),
    avgDisciplineScore,
    bestDay,
    worstDay,
    streakStatus,
    trendDirection,
    days,
  };
}

export function ensureWeeklyReportForSunday(
  today: Date,
  logsByDate: Record<string, DayLog>,
  reportsByWeek: Record<string, WeeklyPerformanceReport>,
): Record<string, WeeklyPerformanceReport> {
  const day = startOfDay(today);
  if (day.getDay() !== 0) return reportsByWeek;

  const weekStart = startOfWeekMonday(day);
  const weekStartKey = toDateKey(weekStart);
  if (reportsByWeek[weekStartKey]) return reportsByWeek;

  return {
    ...reportsByWeek,
    [weekStartKey]: generateWeeklyPerformanceReport(logsByDate, weekStart),
  };
}
