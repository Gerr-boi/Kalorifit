import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyXP } from '../../lib/xpNotifier';
import type { LucideIcon } from 'lucide-react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
  ScanLine,
  Apple,
  Egg,
  Sandwich,
  UtensilsCrossed,
  Droplets,
  Dumbbell,
} from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import {
  CALORIE_GOAL,
  WATER_GOAL_ML,
  calculateDailyDisciplineScore,
  createEmptyDayLog,
  addDays,
  startOfDay,
  startOfWeekMonday,
  toDateKey,
  type DayLog,
  type FoodEntry,
  type MealId,
} from '../../lib/disciplineEngine';
import {
  type BehaviorPreference,
  buildSmartDietPlan,
  type DietStyle,
  type GoalCategory,
  type GoalStrategy,
  type LifestylePattern,
  type MetabolicSensitivity,
  normalizeNutritionProfile,
  type PlateauSensitivity,
  type PlannerLogEvent,
  type PlannerWeightEntry,
  type PsychologyType,
  type SettingsTier,
  type SpecialPhase,
  type TimelineType,
  type TrainingType,
} from '../../lib/nutritionPlanner';

type MealTemplate = {
  id: MealId;
  name: string;
  icon: LucideIcon;
  color: string;
  recommended: number;
};

type LogEvent = {
  id: string;
  type: 'meal' | 'water' | 'workout' | 'macro' | 'repeat' | 'streak-protect';
  actionId: string;
  mealId?: MealId;
  kcal?: number;
  timestampIso: string;
};

type SavedMealTemplate = {
  id: string;
  mealId: MealId;
  name: string;
  items: FoodEntry[];
  usageCount: number;
};

type UndoAction = {
  label: string;
  undo: () => void;
};

type PendingTemplate = {
  mealId: MealId;
  signature: string;
  suggestedName: string;
  items: FoodEntry[];
};

type WorkoutSession = {
  id: string;
  dateKey: string;
  startedAt: string;
  durationMin: number;
  caloriesBurned: number;
  workoutType: 'Run' | 'Ride' | 'Walk' | 'Strength' | 'HIIT' | 'Other';
  exerciseName: string;
  notes: string;
};

type HomeProfile = {
  heightCm?: number;
  weightKg?: number;
  age?: number;
  sex?: 'male' | 'female';
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'very';
  goalMode?: 'fat_loss' | 'muscle_gain' | 'recomp' | 'maintenance';
  dietMode?: 'standard' | 'performance' | 'athlete' | 'minimal';
  settingsTier?: SettingsTier;
  goalCategory?: GoalCategory;
  goalStrategy?: GoalStrategy;
  dietStyle?: DietStyle;
  trainingType?: TrainingType;
  trainingDayCalorieBoost?: number;
  metabolicSensitivity?: MetabolicSensitivity;
  plateauSensitivity?: PlateauSensitivity;
  cycleBasedAdjustments?: boolean;
  cycleStartDate?: string | null;
  cycleLengthDays?: number;
  lifestylePattern?: LifestylePattern;
  behaviorPreference?: BehaviorPreference;
  timelineType?: TimelineType;
  timelineWeeks?: number;
  eventDate?: string | null;
  psychologyType?: PsychologyType;
  specialPhase?: SpecialPhase;
  bmiHistory?: Array<{ date: string; weightKg: number }>;
};

const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SWIPE_THRESHOLD = 45;

const mealTemplates: MealTemplate[] = [
  {
    id: 'breakfast',
    name: 'Frokost',
    icon: Egg,
    color: '#fef3c7',
    recommended: 500,
  },
  {
    id: 'lunch',
    name: 'Lunsj',
    icon: Sandwich,
    color: '#dcfce7',
    recommended: 600,
  },
  {
    id: 'dinner',
    name: 'Middag',
    icon: UtensilsCrossed,
    color: '#dbeafe',
    recommended: 700,
  },
  {
    id: 'snacks',
    name: 'Snacks',
    icon: Apple,
    color: '#fce7f3',
    recommended: 200,
  },
];

const collapsedMeals: Record<MealId, boolean> = {
  breakfast: false,
  lunch: false,
  dinner: false,
  snacks: false,
};

const weekdayShort = new Intl.DateTimeFormat('nb-NO', { weekday: 'short' });
const fullDateFormat = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function createFoodId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `food-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function sumMealTotals(items: FoodEntry[]) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function getRingColor(caloriesRemaining: number) {
  if (caloriesRemaining < 0) return '#ef4444';
  if (caloriesRemaining <= 250) return '#f97316';
  return '#22c55e';
}

function getWeeklyBarColor(fillRatio: number) {
  const clamped = Math.max(0, Math.min(fillRatio, 1));
  const hue = Math.round(clamped * 120);
  return `hsl(${hue}, 78%, 46%)`;
}

function isWithinCalorieRange(log: DayLog) {
  const consumed = Object.values(log.meals)
    .flat()
    .reduce((sum, item) => sum + item.kcal, 0);
  const remaining = CALORIE_GOAL + log.trainingKcal - consumed;
  return consumed > 0 && remaining >= -250 && remaining <= 300;
}

function roundToNearest(value: number, nearest: number) {
  return Math.max(nearest, Math.round(value / nearest) * nearest);
}

function getMealSignature(items: FoodEntry[]) {
  return items
    .map((item) => item.name.trim().toLowerCase())
    .sort()
    .join('|');
}

function cloneDayLog(log: DayLog): DayLog {
  return {
    meals: {
      breakfast: [...log.meals.breakfast],
      lunch: [...log.meals.lunch],
      dinner: [...log.meals.dinner],
      snacks: [...log.meals.snacks],
    },
    trainingKcal: log.trainingKcal,
    waterMl: log.waterMl,
  };
}

function groupFoodsByName(items: FoodEntry[]) {
  const grouped = new Map<string, { name: string; count: number; kcal: number; protein: number; carbs: number; fat: number }>();
  items.forEach((item) => {
    const key = item.name.trim().toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.kcal += item.kcal;
      existing.protein += item.protein;
      existing.carbs += item.carbs;
      existing.fat += item.fat;
      return;
    }
    grouped.set(key, {
      name: item.name,
      count: 1,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
  });
  return Array.from(grouped.values());
}

export default function HomeScreen() {
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', {});
  const [profilePrefs] = useLocalStorageState<HomeProfile>('profile', {});
  const [lastLoggedFood, setLastLoggedFood] = useLocalStorageState<FoodEntry | null>('home.lastLoggedFood.v1', null);
  const [logEvents, setLogEvents] = useLocalStorageState<LogEvent[]>('home.logEvents.v1', []);
  const [savedMealTemplates, setSavedMealTemplates] = useLocalStorageState<SavedMealTemplate[]>('home.savedMealTemplates.v1', []);
  const [workoutSessions, setWorkoutSessions] = useLocalStorageState<WorkoutSession[]>('home.workoutSessions.v1', []);
  const [lazyMode, setLazyMode] = useLocalStorageState<boolean>('home.lazyMode.v1', false);
  const [goalPopupDismissedByDate, setGoalPopupDismissedByDate] = useLocalStorageState<Record<string, true>>(
    'home.goalPopupDismissedByDate.v1',
    {},
  );
  const [goalPopupShownByDate, setGoalPopupShownByDate] = useLocalStorageState<Record<string, true>>(
    'home.goalPopupShownByDate.v1',
    {},
  );
  const [today, setToday] = useState<Date>(() => startOfDay(new Date()));
  const [dayOffset, setDayOffset] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [ringExpanded, setRingExpanded] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Record<MealId, boolean>>(collapsedMeals);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null);
  const [smartPrompt, setSmartPrompt] = useState<string | null>(null);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [workoutStartedAt, setWorkoutStartedAt] = useState('');
  const [workoutDurationMin, setWorkoutDurationMin] = useState('30');
  const [workoutCalories, setWorkoutCalories] = useState('220');
  const [workoutType, setWorkoutType] = useState<WorkoutSession['workoutType']>('Run');
  const [workoutExerciseName, setWorkoutExerciseName] = useState('');
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [waterMeterMl, setWaterMeterMl] = useState(250);
  const [ringPumping, setRingPumping] = useState(false);
  const [headerWave, setHeaderWave] = useState(false);
  const swipeStartXRef = useRef<number | null>(null);
  const prevTrainingRef = useRef<number | null>(null);
  const prevWaterRef = useRef<number | null>(null);
  const ringLastTapAtRef = useRef(0);
  const mealSwipeStartXRef = useRef<Record<MealId, number | null>>({
    breakfast: null,
    lunch: null,
    dinner: null,
    snacks: null,
  });

  const selectedDate = useMemo(() => addDays(today, dayOffset), [today, dayOffset]);
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const dayLog = logsByDate[selectedDateKey] ?? createEmptyDayLog();
  const isTodaySelected = selectedDateKey === todayKey;
  const isPastSelectedDay = selectedDateKey < todayKey;

  const mealTotals = useMemo(() => {
    const entries = Object.entries(dayLog.meals) as Array<[MealId, FoodEntry[]]>;
    return entries.reduce<Record<MealId, ReturnType<typeof sumMealTotals>>>(
      (acc, [mealId, items]) => {
        acc[mealId] = sumMealTotals(items);
        return acc;
      },
      {
        breakfast: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        lunch: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        dinner: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        snacks: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      },
    );
  }, [dayLog.meals]);

  const consumed = useMemo(
    () => Object.values(mealTotals).reduce((sum, totals) => sum + totals.kcal, 0),
    [mealTotals],
  );
  const protein = useMemo(
    () => Object.values(mealTotals).reduce((sum, totals) => sum + totals.protein, 0),
    [mealTotals],
  );
  const carbs = useMemo(
    () => Object.values(mealTotals).reduce((sum, totals) => sum + totals.carbs, 0),
    [mealTotals],
  );
  const fat = useMemo(
    () => Object.values(mealTotals).reduce((sum, totals) => sum + totals.fat, 0),
    [mealTotals],
  );

  const smartDietPlan = useMemo(() => {
    const normalizedProfile = normalizeNutritionProfile({
      age: profilePrefs.age,
      weightKg: profilePrefs.weightKg,
      heightCm: profilePrefs.heightCm,
      sex: profilePrefs.sex,
      activityLevel: profilePrefs.activityLevel,
      goalMode: profilePrefs.goalMode,
      dietMode: profilePrefs.dietMode,
      settingsTier: profilePrefs.settingsTier,
      goalCategory: profilePrefs.goalCategory,
      goalStrategy: profilePrefs.goalStrategy,
      dietStyle: profilePrefs.dietStyle,
      trainingType: profilePrefs.trainingType,
      trainingDayCalorieBoost: profilePrefs.trainingDayCalorieBoost,
      metabolicSensitivity: profilePrefs.metabolicSensitivity,
      plateauSensitivity: profilePrefs.plateauSensitivity,
      cycleBasedAdjustments: profilePrefs.cycleBasedAdjustments,
      cycleStartDate: profilePrefs.cycleStartDate,
      cycleLengthDays: profilePrefs.cycleLengthDays,
      lifestylePattern: profilePrefs.lifestylePattern,
      behaviorPreference: profilePrefs.behaviorPreference,
      timelineType: profilePrefs.timelineType,
      timelineWeeks: profilePrefs.timelineWeeks,
      eventDate: profilePrefs.eventDate,
      psychologyType: profilePrefs.psychologyType,
      specialPhase: profilePrefs.specialPhase,
    });

    const weightHistory: PlannerWeightEntry[] = [
      ...(profilePrefs.bmiHistory ?? [])
        .filter((entry) => Number.isFinite(entry.weightKg))
        .map((entry) => ({ date: entry.date, weightKg: Number(entry.weightKg) })),
      { date: todayKey, weightKg: normalizedProfile.weightKg },
    ];

    return buildSmartDietPlan({
      profile: normalizedProfile,
      logsByDate,
      logEvents: logEvents as PlannerLogEvent[],
      weightHistory,
      date: selectedDate,
    });
  }, [logEvents, logsByDate, profilePrefs.activityLevel, profilePrefs.age, profilePrefs.bmiHistory, profilePrefs.dietMode, profilePrefs.goalMode, profilePrefs.heightCm, profilePrefs.sex, profilePrefs.weightKg, selectedDate, todayKey]);

  const optimizedTargetKcal = smartDietPlan.optimizedTargetKcal;
  const netGoal = optimizedTargetKcal + dayLog.trainingKcal;
  const caloriesRemaining = netGoal - consumed;
  const waterProgress = Math.min(dayLog.waterMl / WATER_GOAL_ML, 1);
  const progressRatio = netGoal <= 0 ? 0 : Math.min(consumed / netGoal, 1);
  const strokeDashoffset = RING_CIRCUMFERENCE - progressRatio * RING_CIRCUMFERENCE;
  const ringColor = getRingColor(caloriesRemaining);
  const discipline = useMemo(() => calculateDailyDisciplineScore(dayLog), [dayLog]);

  // ── Daily challenges (mirrors identityEngine challenge logic) ──────────
  const proteinMetricPct = discipline.metrics.find((m) => m.key === 'protein')?.percent ?? 0;
  const waterMetricPct   = discipline.metrics.find((m) => m.key === 'water')?.percent ?? 0;
  const challenge1Done   = discipline.score >= 80;
  const challenge2Done   = proteinMetricPct >= 85;
  const challenge3Done   = waterMetricPct >= 85;
  const challengesCompletedToday = [challenge1Done, challenge2Done, challenge3Done].filter(Boolean).length;

  // ── Fitness tips pool (static + dynamic from smartDietPlan) ───────────
  const FITNESS_TIPS = [
    '💡 Spis sakte — kroppen bruker 20 min på å registrere metthet.',
    '💡 Protein metter mer per kcal enn karbohydrater. Øk proteinet, senk kaloriinntaket naturlig.',
    '💡 To glass vann før hvert måltid kan redusere inntaket med opp til 13 %.',
    '💡 Søvn under 7 timer øker sulthormonet ghrelin merkbart.',
    '💡 Grønnsaker fyller halve tallerkenen? Du spiser automatisk færre kalorier.',
    '💡 Styrketrening holder forbrenningen forhøyet i opptil 48 timer etter trening.',
    '💡 Fullkornsproduktert gir lengre metthet enn hvitt brød og hvit ris.',
    '💡 En proteinshake rett etter trening bremser muskelnedbrytning raskt.',
    '💡 Kaffe 30 min før trening kan øke ytelsen med 10–15 %.',
    '💡 Salt holder vann — ikke fett. Daglige vektsvingninger på 1–2 kg er normalt.',
    '💡 Å logge mat — selv ufullstendig — gir bedre resultater enn å ikke logge.',
    '💡 Muskel veier mer enn fett. Vekten lyver noen ganger — stoler på måleband.',
    '💡 Planlegg neste dags mat kvelden før — det halverer impulsive valg.',
    '💡 70–80 % av vektendring skjer gjennom kosthold, 20–30 % gjennom trening.',
    '💡 Stress øker kortisol, som igjen øker appetitt og fettlagring.',
    '💡 Du forbrenner ca. 1 kcal per kg kroppsvekt per km rask gange.',
    '💡 Fett er ikke fienden — sunt fett fra nøtter, avokado og fisk hjelper fettforbrenningen.',
    '💡 Intervallfasting hjelper noen, men konsistens over tid slår alle dietter.',
    '💡 Drikk vann mellom alkoholenheter — du drikker halvparten og kjenner deg like bra.',
    '💡 Fiber fra belgfrukter og havremel senker blodsukkerspikes kraftig.',
    '💡 Tygge maten skikkelig (20+ tyggebevegelser) reduserer kaloriinntaket.',
    '💡 Ikke hopp over frokost før styrketrening — glykogenlagre trengs til løft.',
    '💡 Eggehvite er en av de mest mettende proteinkildene per kcal.',
    '💡 Bruk mindre tallerkener — hjernen tolker en full liten tallerken som et fullt måltid.',
    '💡 Gå en 10-minutters tur etter middag — det forbedrer insulinsensitivitet med 30 %.',
  ];

  const allTips = useMemo(() => {
    const dynamic = smartDietPlan.behaviorInsights.filter(Boolean);
    return dynamic.length > 0 ? [...dynamic, ...FITNESS_TIPS] : FITNESS_TIPS;
  }, [smartDietPlan.behaviorInsights]);

  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  useEffect(() => {
    if (allTips.length <= 1) return;
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % allTips.length);
        setTipVisible(true);
      }, 350);
    }, 2500);
    return () => clearInterval(interval);
  }, [allTips.length]);

  const weeklyData = useMemo(() => {
    const weekStart = startOfWeekMonday(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const key = toDateKey(date);
      const log = logsByDate[key] ?? createEmptyDayLog();
      const dayConsumed = Object.values(log.meals)
        .flat()
        .reduce((sum, item) => sum + item.kcal, 0);
      const remaining = optimizedTargetKcal + log.trainingKcal - dayConsumed;
      return {
        key,
        label: weekdayShort.format(date).slice(0, 3),
        isToday: key === todayKey,
        isSelected: key === selectedDateKey,
        consumed: dayConsumed,
        remaining,
      };
    });
  }, [logsByDate, optimizedTargetKcal, selectedDate, selectedDateKey, todayKey]);

  const weeklyAverage = Math.round(
    weeklyData.reduce((sum, day) => sum + day.consumed, 0) / Math.max(weeklyData.length, 1),
  );

  const streak = useMemo(() => {
    let days = 0;
    for (let i = 0; i < 365; i += 1) {
      const key = toDateKey(addDays(today, -i));
      const log = logsByDate[key];
      if (!log || !isWithinCalorieRange(log)) break;
      days += 1;
    }
    return days;
  }, [logsByDate, today]);

  const weeklyConsistencyScore = useMemo(() => {
    const passes = weeklyData.filter((day) => {
      const log = logsByDate[day.key];
      return log ? isWithinCalorieRange(log) : false;
    }).length;
    return Math.round((passes / weeklyData.length) * 100);
  }, [logsByDate, weeklyData]);

  const dayHasAnyLog = consumed > 0 || dayLog.waterMl > 0 || dayLog.trainingKcal > 0;

  const historicalMealStats = useMemo(() => {
    const mealIds: MealId[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
    return mealIds.reduce<Record<MealId, { avgKcal: number; lastThree: number[] }>>((acc, mealId) => {
      const entries = Object.entries(logsByDate)
        .filter(([key]) => key < selectedDateKey)
        .sort(([a], [b]) => (a > b ? -1 : 1))
        .map(([_, log]) => log.meals[mealId].reduce((sum, item) => sum + item.kcal, 0))
        .filter((kcal) => kcal > 0);

      const avgKcal = entries.length > 0 ? Math.round(entries.reduce((sum, kcal) => sum + kcal, 0) / entries.length) : 0;
      acc[mealId] = { avgKcal, lastThree: entries.slice(0, 3) };
      return acc;
    }, {
      breakfast: { avgKcal: 0, lastThree: [] },
      lunch: { avgKcal: 0, lastThree: [] },
      dinner: { avgKcal: 0, lastThree: [] },
      snacks: { avgKcal: 0, lastThree: [] },
    });
  }, [logsByDate, selectedDateKey]);

  const quickSuggestionsByMeal = useMemo(() => {
    const mealIds: MealId[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
    return mealIds.reduce<Record<MealId, FoodEntry[]>>(
      (acc, mealId) => {
        const grouped = new Map<string, { name: string; count: number; kcal: number; protein: number; carbs: number; fat: number }>();
        Object.values(logsByDate).forEach((log) => {
          log.meals[mealId].forEach((item) => {
            const key = item.name.trim().toLowerCase();
            const existing = grouped.get(key);
            if (existing) {
              existing.count += 1;
              existing.kcal += item.kcal;
              existing.protein += item.protein;
              existing.carbs += item.carbs;
              existing.fat += item.fat;
              return;
            }
            grouped.set(key, {
              name: item.name,
              count: 1,
              kcal: item.kcal,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
            });
          });
        });

        acc[mealId] = Array.from(grouped.values())
          .sort((a, b) => b.count - a.count || b.kcal - a.kcal)
          .slice(0, 3)
          .map((item, index) => ({
            id: `history-${mealId}-${index}-${item.name.toLowerCase().replace(/\s+/g, '-')}`,
            name: item.name,
            kcal: Math.round(item.kcal / item.count),
            protein: Math.round(item.protein / item.count),
            carbs: Math.round(item.carbs / item.count),
            fat: Math.round(item.fat / item.count),
          }));
        return acc;
      },
      {
        breakfast: [],
        lunch: [],
        dinner: [],
        snacks: [],
      },
    );
  }, [logsByDate]);

  const globalMacroRatios = useMemo(() => {
    const totals = Object.values(logsByDate)
      .flatMap((log) => Object.values(log.meals).flat())
      .reduce(
        (acc, item) => ({
          kcal: acc.kcal + item.kcal,
          protein: acc.protein + item.protein,
          carbs: acc.carbs + item.carbs,
          fat: acc.fat + item.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );

    if (totals.kcal <= 0) return { protein: 0.08, carbs: 0.1, fat: 0.04 };
    return {
      protein: totals.protein / totals.kcal,
      carbs: totals.carbs / totals.kcal,
      fat: totals.fat / totals.kcal,
    };
  }, [logsByDate]);

  const frequentProteinShake = useMemo(() => {
    const proteinLike = Object.values(logsByDate)
      .flatMap((log) => Object.values(log.meals).flat())
      .filter((item) => item.name.toLowerCase().includes('protein'));
    return proteinLike.length >= 4;
  }, [logsByDate]);

  const actionUsage = useMemo(() => {
    return logEvents.reduce<Record<string, number>>((acc, event) => {
      acc[event.actionId] = (acc[event.actionId] ?? 0) + 1;
      return acc;
    }, {});
  }, [logEvents]);

  const adaptiveLunchKcal = useMemo(() => {
    const avgLunch = historicalMealStats.lunch.avgKcal;
    return avgLunch > 0 ? roundToNearest(avgLunch, 50) : 400;
  }, [historicalMealStats.lunch.avgKcal]);

  const mostFrequentDayKey = useMemo(() => {
    const signatureCounts: Record<string, { count: number; key: string }> = {};
    Object.entries(logsByDate).forEach(([key, log]) => {
      const signature = (['breakfast', 'lunch', 'dinner', 'snacks'] as MealId[])
        .map((mealId) => `${mealId}:${getMealSignature(log.meals[mealId])}`)
        .join('::');
      if (!signature.includes(':')) return;
      const existing = signatureCounts[signature];
      if (!existing) signatureCounts[signature] = { count: 1, key };
      else signatureCounts[signature] = { count: existing.count + 1, key: existing.key };
    });
    const winner = Object.values(signatureCounts).sort((a, b) => b.count - a.count)[0];
    return winner?.count >= 2 ? winner.key : null;
  }, [logsByDate]);

  const selectedDayWorkouts = useMemo(
    () =>
      workoutSessions
        .filter((session) => session.dateKey === selectedDateKey)
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
    [selectedDateKey, workoutSessions],
  );

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutMs = nextMidnight.getTime() - now.getTime();

    const timer = window.setTimeout(() => {
      setToday(startOfDay(new Date()));
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [today]);

  // Track which goals have already fired XP this day to avoid repeat notifications
  const goalsXpFiredRef = useRef<Record<string, Set<string>>>({});
  useEffect(() => {
    if (!isTodaySelected) return;
    const fired = goalsXpFiredRef.current[selectedDateKey] ?? new Set<string>();
    discipline.metrics.forEach((metric) => {
      if (metric.percent >= 85 && !fired.has(metric.key)) {
        fired.add(metric.key);
        const labels: Record<string, string> = {
          calorie: '🎯 +12 XP kalorimål!',
          protein: '💪 +12 XP proteinmål!',
          water: '💧 +12 XP vannmål!',
          activity: '🏃 +12 XP treningsmål!',
          logging: '📓 +12 XP loggmål!',
        };
        notifyXP(12, labels[metric.key] ?? '+12 XP');
      }
    });
    if (discipline.score >= 80 && !fired.has('__challenge__')) {
      fired.add('__challenge__');
      notifyXP(20, '⚡ +20 XP dagsutfordring!');
    }
    goalsXpFiredRef.current[selectedDateKey] = fired;
  }, [discipline, isTodaySelected, selectedDateKey]);

  useEffect(() => {
    const dismissedForSelectedDay = Boolean(goalPopupDismissedByDate[selectedDateKey]);
    const alreadyShownForSelectedDay = Boolean(goalPopupShownByDate[selectedDateKey]);
    if (
      consumed > 0 &&
      caloriesRemaining >= 0 &&
      caloriesRemaining <= 80 &&
      !showPopup &&
      !dismissedForSelectedDay &&
      !alreadyShownForSelectedDay
    ) {
      setShowPopup(true);
      setGoalPopupShownByDate((prev) => (prev[selectedDateKey] ? prev : { ...prev, [selectedDateKey]: true }));
    }
  }, [
    caloriesRemaining,
    consumed,
    goalPopupDismissedByDate,
    goalPopupShownByDate,
    selectedDateKey,
    setGoalPopupShownByDate,
    showPopup,
  ]);

  useEffect(() => {
    if (!showPopup) return;
    const timer = window.setTimeout(() => setShowPopup(false), 3200);
    return () => window.clearTimeout(timer);
  }, [showPopup]);

  const dismissGoalPopupForDay = () => {
    setShowPopup(false);
    setGoalPopupDismissedByDate((prev) => (prev[selectedDateKey] ? prev : { ...prev, [selectedDateKey]: true }));
  };

  useEffect(() => {
    const selectedLog = logsByDate[selectedDateKey] ?? createEmptyDayLog();
    const firstLoggedMeal = mealTemplates.find((meal) => selectedLog.meals[meal.id].length > 0)?.id;
    if (!firstLoggedMeal) {
      setExpandedMeals(collapsedMeals);
      return;
    }
    setExpandedMeals({ ...collapsedMeals, [firstLoggedMeal]: true });
  }, [selectedDateKey]);

  useEffect(() => {
    if (!scanHint) return;
    const timer = window.setTimeout(() => setScanHint(null), 2200);
    return () => window.clearTimeout(timer);
  }, [scanHint]);

  useEffect(() => {
    if (!undoAction) return;
    const timer = window.setTimeout(() => setUndoAction(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoAction]);

  useEffect(() => {
    if (!showWorkoutModal) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setWorkoutStartedAt(`${y}-${m}-${d}T${hh}:${mm}`);
    setWorkoutDurationMin('30');
    setWorkoutCalories('220');
    setWorkoutType('Run');
    setWorkoutExerciseName('');
    setWorkoutNotes('');
  }, [showWorkoutModal]);

  useEffect(() => {
    if (!isTodaySelected || isPastSelectedDay) {
      setSmartPrompt(null);
      return;
    }

    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    const hasLunch = dayLog.meals.lunch.length > 0;
    const hasDinner = dayLog.meals.dinner.length > 0;
    const hasBreakfast = dayLog.meals.breakfast.length > 0;

    const mealPrompt = (mealId: MealId, fallback: number) => {
      const mealEvents = logEvents.filter((event) => event.type === 'meal' && event.mealId === mealId);
      if (mealEvents.length === 0) return fallback;
      const avgMinute = Math.round(
        mealEvents.reduce((sum, event) => {
          const date = new Date(event.timestampIso);
          return sum + date.getHours() * 60 + date.getMinutes();
        }, 0) / mealEvents.length,
      );
      return avgMinute - 5;
    };

    const breakfastPrompt = mealPrompt('breakfast', 8 * 60 + 30);
    const lunchPrompt = mealPrompt('lunch', 12 * 60 + 30);
    const dinnerPrompt = mealPrompt('dinner', 18 * 60);

    const near = (target: number) => Math.abs(totalMinutes - target) <= 15;
    if (!hasBreakfast && near(breakfastPrompt)) setSmartPrompt('Log frokost? Ett trykk holder.');
    else if (!hasLunch && near(lunchPrompt)) setSmartPrompt('Log lunsj? Du logger vanligvis rundt denne tiden.');
    else if (!hasDinner && near(dinnerPrompt)) setSmartPrompt('Middag snart. Vil du forhåndsfylle?');
    else setSmartPrompt(null);
  }, [dayLog.meals.breakfast.length, dayLog.meals.dinner.length, dayLog.meals.lunch.length, isPastSelectedDay, isTodaySelected, logEvents]);

  useEffect(() => {
    if (isPastSelectedDay) setShowQuickAddMenu(false);
  }, [isPastSelectedDay]);

  // Ring pump on workout log
  useEffect(() => {
    const prev = prevTrainingRef.current;
    prevTrainingRef.current = dayLog.trainingKcal;
    if (prev !== null && dayLog.trainingKcal > prev && isTodaySelected) {
      setRingPumping(true);
      const t = window.setTimeout(() => setRingPumping(false), 950);
      return () => clearTimeout(t);
    }
  }, [dayLog.trainingKcal, isTodaySelected]);

  // Water wave on water log
  useEffect(() => {
    const prev = prevWaterRef.current;
    prevWaterRef.current = dayLog.waterMl;
    if (prev !== null && dayLog.waterMl > prev && isTodaySelected) {
      setHeaderWave(true);
      const t = window.setTimeout(() => setHeaderWave(false), 2000);
      return () => clearTimeout(t);
    }
  }, [dayLog.waterMl, isTodaySelected]);

  const updateDayLog = (key: string, updater: (current: DayLog) => DayLog) => {
    setLogsByDate((prev) => {
      if (key < todayKey) {
        setScanHint('Dagen er last etter midnatt. Score kan ikke endres.');
        return prev;
      }
      const current = prev[key] ?? createEmptyDayLog();
      return {
        ...prev,
        [key]: updater(current),
      };
    });
  };

  const reward = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  };

  const recordEvent = (event: Omit<LogEvent, 'id' | 'timestampIso'>) => {
    setLogEvents((prev) =>
      [
        ...prev,
        {
          ...event,
          id: createFoodId(),
          timestampIso: new Date().toISOString(),
        },
      ].slice(-1200),
    );
  };

  const setDayLog = (key: string, next: DayLog) => {
    updateDayLog(key, () => cloneDayLog(next));
  };

  const maybeSuggestTemplate = (mealId: MealId, nextMealItems: FoodEntry[]) => {
    const signature = getMealSignature(nextMealItems);
    if (!signature || nextMealItems.length < 2) return;
    const matches = Object.values(logsByDate).filter((log) => getMealSignature(log.meals[mealId]) === signature).length;
    const exists = savedMealTemplates.some((template) => template.mealId === mealId && getMealSignature(template.items) === signature);
    if (matches >= 2 && !exists) {
      setPendingTemplate({
        mealId,
        signature,
        suggestedName: `Standard ${mealId === 'breakfast' ? 'Frokost' : mealId === 'lunch' ? 'Lunsj' : mealId === 'dinner' ? 'Middag' : 'Snacks'}`,
        items: nextMealItems.map((item) => ({ ...item })),
      });
    }
  };

  const addFoodToMeal = (mealId: MealId, food: FoodEntry, actionId = `food:${mealId}`) => {
    const addedId = createFoodId();
    const previousDay = cloneDayLog(dayLog);
    const nextMealItems = [...dayLog.meals[mealId], { ...food, id: addedId }];
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      meals: {
        ...current.meals,
        [mealId]: [...current.meals[mealId], { ...food, id: addedId }],
      },
    }));
    setLastLoggedFood(food);
    setExpandedMeals({ ...collapsedMeals, [mealId]: true });
    setUndoAction({
      label: `${food.name} lagt til`,
      undo: () => setDayLog(selectedDateKey, previousDay),
    });
    recordEvent({ type: 'meal', actionId, mealId, kcal: food.kcal });
    maybeSuggestTemplate(mealId, nextMealItems);
    reward();
    notifyXP(5, '+5 XP');
    // Early bird: breakfast before 08:00
    if (mealId === 'breakfast' && new Date().getHours() < 8) {
      notifyXP(0, '🌅 Tidligfugl!');
    }
    // Night owl: any meal after 22:00
    if (new Date().getHours() >= 22) {
      notifyXP(0, '🦉 Nattugle!');
    }
  };

  const addTraining = (kcal: number, actionId = 'workout:quick') => {
    const previousDay = cloneDayLog(dayLog);
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      trainingKcal: current.trainingKcal + kcal,
    }));
    setUndoAction({
      label: `Trening +${kcal} kcal`,
      undo: () => setDayLog(selectedDateKey, previousDay),
    });
    recordEvent({ type: 'workout', actionId, kcal });
    reward();
    notifyXP(5, '+5 XP 🏋️');
  };

  const addWater = (ml: number, actionId = 'water:250') => {
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      waterMl: current.waterMl + ml,
    }));
    recordEvent({ type: 'water', actionId });
    reward();
    notifyXP(2, '+2 XP 💧');
  };

  const repeatMealFromDate = (mealId: MealId, sourceKey: string | null, actionId: string) => {
    if (!sourceKey) return;
    const source = logsByDate[sourceKey];
    if (!source || source.meals[mealId].length === 0) return;
    const previousDay = cloneDayLog(dayLog);
    const copied = source.meals[mealId].map((item) => ({ ...item, id: createFoodId() }));
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      meals: {
        ...current.meals,
        [mealId]: copied,
      },
    }));
    setUndoAction({ label: `${mealId} repetert`, undo: () => setDayLog(selectedDateKey, previousDay) });
    recordEvent({ type: 'repeat', actionId, mealId });
    reward();
  };

  const repeatWholeDayFromDate = (sourceKey: string | null, actionId: string) => {
    if (!sourceKey) return;
    const source = logsByDate[sourceKey];
    if (!source) return;
    const previousDay = cloneDayLog(dayLog);
    const copied: DayLog = {
      trainingKcal: source.trainingKcal,
      waterMl: source.waterMl,
      meals: {
        breakfast: source.meals.breakfast.map((item) => ({ ...item, id: createFoodId() })),
        lunch: source.meals.lunch.map((item) => ({ ...item, id: createFoodId() })),
        dinner: source.meals.dinner.map((item) => ({ ...item, id: createFoodId() })),
        snacks: source.meals.snacks.map((item) => ({ ...item, id: createFoodId() })),
      },
    };
    setDayLog(selectedDateKey, copied);
    setUndoAction({ label: 'Hele dagen repetert', undo: () => setDayLog(selectedDateKey, previousDay) });
    recordEvent({ type: 'repeat', actionId });
    reward();
  };

  const getPreviousDateWithMeal = (mealId: MealId) =>
    Object.keys(logsByDate)
      .filter((key) => key < selectedDateKey && logsByDate[key].meals[mealId].length > 0)
      .sort()
      .at(-1) ?? null;

  const getLastMondayKey = () =>
    Object.keys(logsByDate)
      .filter((key) => {
        if (key >= selectedDateKey) return false;
        const date = new Date(`${key}T00:00:00`);
        return date.getDay() === 1;
      })
      .sort()
      .at(-1) ?? null;

  const addMacroQuick = (kind: 'protein' | 'carbs' | 'fat', amountG: number) => {
    const kcal = kind === 'fat' ? amountG * 9 : amountG * 4;
    addFoodToMeal(
      'snacks',
      {
        id: `macro-${kind}-${amountG}`,
        name: `Macro quick: +${amountG}g ${kind}`,
        kcal,
        protein: kind === 'protein' ? amountG : 0,
        carbs: kind === 'carbs' ? amountG : 0,
        fat: kind === 'fat' ? amountG : 0,
      },
      `macro:${kind}:${amountG}`,
    );
    recordEvent({ type: 'macro', actionId: `macro:${kind}:${amountG}`, kcal });
  };

  const openWorkoutModal = () => {
    if (isPastSelectedDay) {
      setScanHint('Dagen er last etter midnatt. Score kan ikke endres.');
      return;
    }
    setShowWorkoutModal(true);
  };

  const removeWorkoutSession = (sessionId: string) => {
    const session = workoutSessions.find((s) => s.id === sessionId);
    if (!session) return;
    const previousDay = cloneDayLog(dayLog);
    setWorkoutSessions((prev) => prev.filter((s) => s.id !== sessionId));
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      trainingKcal: Math.max(0, current.trainingKcal - session.caloriesBurned),
    }));
    setUndoAction({
      label: `${session.exerciseName} fjernet`,
      undo: () => {
        setWorkoutSessions((prev) => [...prev, session]);
        setDayLog(selectedDateKey, previousDay);
      },
    });
  };

  const saveWorkoutSession = () => {
    const duration = Number(workoutDurationMin);
    const calories = Number(workoutCalories);
    if (!Number.isFinite(duration) || duration <= 0) {
      setScanHint('Legg inn gyldig varighet i minutter.');
      return;
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      setScanHint('Legg inn gyldige kalorier for treningsokten.');
      return;
    }

    const exerciseName =
      workoutExerciseName.trim() ||
      (workoutType === 'Other' ? 'Custom workout' : workoutType);

    setWorkoutSessions((prev) => [
      ...prev,
      {
        id: createFoodId(),
        dateKey: selectedDateKey,
        startedAt: workoutStartedAt,
        durationMin: Math.round(duration),
        caloriesBurned: Math.round(calories),
        workoutType,
        exerciseName,
        notes: workoutNotes.trim(),
      },
    ]);

    addTraining(Math.round(calories), 'workout:manual-modal');
    setShowWorkoutModal(false);
    setScanHint(`Trening logget: ${exerciseName}, ${Math.round(duration)} min, ${Math.round(calories)} kcal.`);
  };

  const handleQuickAdd = (action: string) => {
    if (isPastSelectedDay) {
      setScanHint('Dagen er last etter midnatt. Score kan ikke endres.');
      setShowQuickAddMenu(false);
      return;
    }
    if (action === 'kcal-100') {
      addFoodToMeal('snacks', {
        id: 'quick-100',
        name: 'Rask logging +100 kcal',
        kcal: 100,
        protein: 0,
        carbs: 15,
        fat: 3,
      }, 'quick:kcal:100');
    }
    if (action === 'kcal-250') {
      addFoodToMeal('snacks', {
        id: 'quick-250',
        name: 'Rask logging +250 kcal',
        kcal: 250,
        protein: 8,
        carbs: 24,
        fat: 12,
      }, 'quick:kcal:250');
    }
    if (action === 'kcal-500') {
      addFoodToMeal('snacks', {
        id: 'quick-500',
        name: 'Rask logging +500 kcal',
        kcal: 500,
        protein: 22,
        carbs: 48,
        fat: 22,
      }, 'quick:kcal:500');
    }
    if (action === 'kcal-adaptive') {
      addFoodToMeal('lunch', {
        id: `quick-${adaptiveLunchKcal}`,
        name: `Vanlig lunsj +${adaptiveLunchKcal} kcal`,
        kcal: adaptiveLunchKcal,
        protein: Math.round(adaptiveLunchKcal * 0.08),
        carbs: Math.round(adaptiveLunchKcal * 0.11),
        fat: Math.round(adaptiveLunchKcal * 0.04),
      }, 'quick:kcal:adaptive');
    }
    if (action === 'repeat-last' && lastLoggedFood) {
      addFoodToMeal('snacks', lastLoggedFood, 'quick:repeat:last');
    }
    if (action === 'protein-shake') {
      addFoodToMeal('snacks', {
        id: 'quick-protein',
        name: 'Proteinshot',
        kcal: 120,
        protein: 24,
        carbs: 2,
        fat: 1,
      }, 'quick:protein-shake');
    }
    if (action === 'water') addWater(250, 'quick:water:250');
    if (action === 'workout') addTraining(220, 'quick:workout:30min');
    if (action === 'macro-protein') addMacroQuick('protein', 30);
    if (action === 'macro-carbs') addMacroQuick('carbs', 50);
    if (action === 'macro-fat') addMacroQuick('fat', 20);
    if (action === 'repeat-breakfast') repeatMealFromDate('breakfast', getPreviousDateWithMeal('breakfast'), 'repeat:breakfast');
    if (action === 'repeat-lunch') repeatMealFromDate('lunch', getPreviousDateWithMeal('lunch'), 'repeat:lunch');
    if (action === 'repeat-day-yesterday') repeatWholeDayFromDate(toDateKey(addDays(selectedDate, -1)), 'repeat:yesterday');
    if (action === 'repeat-last-monday') repeatWholeDayFromDate(getLastMondayKey(), 'repeat:last-monday');
    if (action === 'repeat-frequent') repeatWholeDayFromDate(mostFrequentDayKey, 'repeat:frequent-day');
    if (action === 'streak-protect') {
      const previousDay = cloneDayLog(dayLog);
      addFoodToMeal('snacks', { id: 'streak-0', name: 'Streak protect check-in', kcal: 0, protein: 0, carbs: 0, fat: 0 }, 'quick:streak-protect');
      setUndoAction({ label: 'Streak protect', undo: () => setDayLog(selectedDateKey, previousDay) });
      recordEvent({ type: 'streak-protect', actionId: 'quick:streak-protect' });
    }
    setShowQuickAddMenu(false);
  };

  const goNextDay = () => setDayOffset((prev) => prev + 1);
  const goPreviousDay = () => setDayOffset((prev) => prev - 1);

  const onDateTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    swipeStartXRef.current = event.touches[0]?.clientX ?? null;
  };

  const onDateTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const start = swipeStartXRef.current;
    const end = event.changedTouches[0]?.clientX ?? null;
    swipeStartXRef.current = null;
    if (start === null || end === null) return;
    const delta = end - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0) goNextDay();
    if (delta > 0) goPreviousDay();
  };

  const onRingTap = () => {
    const now = Date.now();
    if (now - ringLastTapAtRef.current < 280 && !isPastSelectedDay) {
      handleQuickAdd('kcal-100');
      setScanHint('Dobbelttap: +100 kcal');
    } else {
      setRingExpanded((prev) => !prev);
    }
    ringLastTapAtRef.current = now;
  };

  const onMealTouchStart = (mealId: MealId, x: number) => {
    mealSwipeStartXRef.current[mealId] = x;
  };

  const createQuickPhotoEntry = (mealId: MealId, fallbackKcal: number): FoodEntry => {
    const estimatedKcal = Math.max(60, roundToNearest(fallbackKcal, 10));
    return {
      id: `quick-photo-${mealId}-${estimatedKcal}`,
      name: 'Hurtigfoto-logging',
      kcal: estimatedKcal,
      protein: Math.max(0, Math.round(estimatedKcal * globalMacroRatios.protein)),
      carbs: Math.max(0, Math.round(estimatedKcal * globalMacroRatios.carbs)),
      fat: Math.max(0, Math.round(estimatedKcal * globalMacroRatios.fat)),
    };
  };

  const toggleMealExpanded = (mealId: MealId) => {
    setExpandedMeals((prev) => (prev[mealId] ? collapsedMeals : { ...collapsedMeals, [mealId]: true }));
  };

  const onMealTouchEnd = (mealId: MealId, x: number) => {
    const start = mealSwipeStartXRef.current[mealId];
    mealSwipeStartXRef.current[mealId] = null;
    if (start === null || isPastSelectedDay || !lastLoggedFood) return;
    if (x - start > SWIPE_THRESHOLD) {
      addFoodToMeal(mealId, lastLoggedFood, `gesture:meal-swipe:${mealId}`);
      setScanHint('Swipe: la til sist loggede meal');
    }
  };

  const progressText = caloriesRemaining < 0 ? 'OVER MAL' : 'KALORIER GJENSTAR';
  const progressValue = caloriesRemaining < 0 ? Math.abs(caloriesRemaining) : caloriesRemaining;
  const dateLabel = isTodaySelected ? `I dag, ${fullDateFormat.format(selectedDate)}` : fullDateFormat.format(selectedDate);
  const coachMessage =
    consumed === 0
      ? 'Start dagen med et maltid for a bygge streak.'
      : caloriesRemaining > 0
      ? `Du er ${caloriesRemaining} kcal under malet i dag.`
      : `Du har overstiget malet med ${Math.abs(caloriesRemaining)} kcal.`;

  // Dynamic header background reacts to actions
  const headerBgStyle = useMemo<React.CSSProperties>(() => {
    if (ringPumping) return { background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 20%, #ea580c 60%, #f97316 100%)', transition: 'background 0.3s ease' };
    if (headerWave) return { background: 'linear-gradient(135deg, #0284c7 0%, #0891b2 30%, #0e7490 55%, #f97316 100%)', transition: 'background 0.4s ease' };
    if (caloriesRemaining >= 0 && caloriesRemaining <= 80 && consumed > 0) return { background: 'linear-gradient(135deg, #166534 0%, #16a34a 55%, #22c55e 100%)', transition: 'background 0.8s ease' };
    if (caloriesRemaining < -150) return { background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)', transition: 'background 0.6s ease' };
    if (dayLog.trainingKcal > 0) return { background: 'linear-gradient(135deg, #c2410c 0%, #ea580c 55%, #f97316 100%)', transition: 'background 1.2s ease' };
    return { background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', transition: 'background 0.6s ease' };
  }, [ringPumping, headerWave, caloriesRemaining, consumed, dayLog.trainingKcal]);

  // Contextual label shown in header
  const headerStatusChip = useMemo(() => {
    if (ringPumping) return { text: `🏋️ Trening logget!`, cls: 'bg-red-500/30 border-red-200/30' };
    if (headerWave) return { text: `💧 Vann logg!`, cls: 'bg-cyan-400/30 border-cyan-200/30' };
    if (challengesCompletedToday === 3) return { text: '⚡ Alle utfordringer fullført!', cls: 'bg-amber-300/25 border-amber-200/30' };
    if (caloriesRemaining >= 0 && caloriesRemaining <= 80 && consumed > 0) return { text: '🎯 Mål nådd i dag!', cls: 'bg-green-400/30 border-green-200/30' };
    if (caloriesRemaining < -150) return { text: '⚠️ Over kalorimål', cls: 'bg-red-400/25 border-red-200/30' };
    if (dayLog.trainingKcal > 0) return { text: `🔥 ${dayLog.trainingKcal} kcal trening`, cls: 'bg-orange-300/20 border-orange-200/25' };
    return null;
  }, [ringPumping, headerWave, challengesCompletedToday, caloriesRemaining, consumed, dayLog.trainingKcal]);

  // Ring center emoji when actions fire
  const ringCenterEmoji = ringPumping ? '🏋️' : headerWave ? '💧' : null;
  const ringSubLabel = ringPumping ? 'TRENING' : headerWave ? 'VANN' : progressText;

  const smartQuickActions = useMemo(() => {
    const base = [
      { id: 'kcal-adaptive', label: `+${adaptiveLunchKcal} kcal (vanlig)`, rankKey: 'quick:kcal:adaptive' },
      { id: 'kcal-100', label: '+100 kcal', rankKey: 'quick:kcal:100' },
      { id: 'kcal-250', label: '+250 kcal', rankKey: 'quick:kcal:250' },
      { id: 'kcal-500', label: '+500 kcal', rankKey: 'quick:kcal:500' },
      { id: 'water', label: '+1 glass vann', rankKey: 'quick:water:250' },
      { id: 'workout', label: '+30 min workout', rankKey: 'quick:workout:30min' },
    ];
    if (frequentProteinShake) base.splice(1, 0, { id: 'protein-shake', label: '+Protein Shake', rankKey: 'quick:protein-shake' });

    return base
      .map((action) => ({ ...action, score: actionUsage[action.rankKey] ?? 0 }))
      .sort((a, b) => b.score - a.score || (a.id === 'kcal-adaptive' ? -1 : 1));
  }, [actionUsage, adaptiveLunchKcal, frequentProteinShake]);

  return (
    <div className="screen relative pb-32">
      <div className="screen-header pb-5" style={headerBgStyle}>

        {/* Water wave overlay — always present, opacity driven by waterProgress */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 64, overflow: 'hidden' }}>
          <div
            className="absolute bottom-0 left-0 header-wave-1"
            style={{ width: '200%', height: '100%', opacity: Math.max(0.08, waterProgress * 0.45 + (headerWave ? 0.3 : 0)) }}
          >
            <svg viewBox="0 0 860 64" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path fill="rgba(6,182,212,0.4)" d="M0,32 C80,8 160,56 240,32 C320,8 400,56 480,32 C560,8 640,56 720,32 C800,8 860,44 860,32 L860,64 L0,64 Z" />
            </svg>
          </div>
          <div
            className="absolute bottom-0 left-0 header-wave-2"
            style={{ width: '200%', height: '75%', opacity: Math.max(0.05, waterProgress * 0.3 + (headerWave ? 0.2 : 0)) }}
          >
            <svg viewBox="0 0 860 48" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path fill="rgba(14,116,144,0.45)" d="M0,24 C60,4 140,44 220,24 C300,4 380,44 430,24 C510,4 590,44 650,24 C720,4 800,40 860,24 L860,48 L0,48 Z" />
            </svg>
          </div>
        </div>

        {/* Workout energy sparks */}
        {ringPumping && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[14, 28, 42, 58, 72, 86].map((left, i) => (
              <div
                key={i}
                className="workout-spark"
                style={{ left: `${left}%`, animationDelay: `${i * 75}ms` }}
              />
            ))}
          </div>
        )}

        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 bg-white/20 rounded-full flex items-center justify-center ${streak > 0 && !dayHasAnyLog && isTodaySelected ? 'streak-at-risk' : ''}`}>
              <Flame className={`w-5 h-5 text-white ${streak > 0 ? 'streak-flame' : ''}`} />
            </div>
            <div>
              <span className={`text-white/90 text-sm font-medium ${[3,7,14,30,60,90,365].includes(streak) ? 'streak-milestone inline-block' : ''}`}>{streak} dagers streak</span>
              {streak > 0 && !dayHasAnyLog && isTodaySelected && (
                <p className="text-yellow-200 text-xs font-semibold animate-pulse">⚠️ Streak i fare!</p>
              )}
              <p className="text-white/70 text-xs">Konsistensscore: {weeklyConsistencyScore}%</p>
              <p className="text-white/70 text-xs">Daglig disiplin: {discipline.score}/100</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLazyMode((prev) => !prev)}
              className="h-10 px-3 bg-white/20 rounded-full text-xs font-semibold text-white"
              title="Lazy mode"
            >
              {lazyMode ? 'Lazy ON' : 'Lazy'}
            </button>
            <button
              type="button"
              onClick={() => setShowQuickAddMenu((prev) => !prev)}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
              title="Quick add"
              disabled={isPastSelectedDay}
            >
              <Plus className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Context status chip — shows what just happened */}
        {headerStatusChip && (
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 mb-2 text-xs font-semibold text-white header-chip-enter ${headerStatusChip.cls}`}>
            {headerStatusChip.text}
          </div>
        )}

        {smartPrompt && !headerStatusChip && (
          <div className="rounded-xl bg-white/15 px-3 py-2 mb-3">
            <p className="text-xs text-white">{smartPrompt}</p>
          </div>
        )}

        <div className="mt-3 flex flex-col items-center justify-center gap-3 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={onRingTap}
            className={`progress-circle shrink-0 ${caloriesRemaining >= 0 && caloriesRemaining <= 80 && consumed > 0 ? 'ring-complete' : ''} ${ringPumping ? 'ring-pumping' : ''}`}
            title="Vis kaloridetaljer"
          >
            <svg width="190" height="190" viewBox="0 0 200 200">
              <circle className="progress-circle-bg" cx="100" cy="100" r={RING_RADIUS} />
              <circle
                cx="100"
                cy="100"
                r={RING_RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                style={{ transition: 'stroke-dashoffset 500ms ease, stroke 300ms ease' }}
              />
            </svg>
            <div className="progress-text">
              {ringCenterEmoji ? (
                <p key={ringCenterEmoji} className="text-5xl count-bounce">{ringCenterEmoji}</p>
              ) : (
                <p className="text-5xl font-bold text-white"><span key={progressValue} className="count-bounce">{progressValue}</span></p>
              )}
              <p className="text-white/70 text-sm mt-1">{ringSubLabel}</p>
              <span className="mt-2 inline-flex text-white/80 text-xs items-center gap-1">
                Trykk for detaljer <ChevronRight className={`w-3 h-3 ${ringExpanded ? 'rotate-90' : ''} transition-transform`} />
              </span>
            </div>
          </button>

          <div className="w-full flex-1 rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-[11px] uppercase text-white/75 mb-2">Ukesoversikt</p>
            <div className="flex items-end justify-between gap-1 h-28">
              {weeklyData.map((day) => {
                const ratio = Math.min(day.consumed / Math.max(optimizedTargetKcal, 1), 1.15);
                const fillHeight = Math.max(10, Math.round(ratio * 64));
                const barColor = getWeeklyBarColor(ratio);
                return (
                  <div key={day.key} className="flex flex-1 justify-center">
                    <div
                      className={`w-4 h-24 rounded-full bg-white/20 p-[2px] flex flex-col ${day.isSelected ? 'ring-2 ring-white' : day.isToday ? 'ring-1 ring-white/60' : ''}`}
                    >
                      <div
                        className="w-full rounded-full mt-auto transition-all"
                        style={{ height: `${Math.min(fillHeight, 70)}px`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <p className="text-white/90 text-sm font-medium">{coachMessage}</p>
          <div className="flex items-end gap-2 rounded-xl bg-white/10 px-3 py-2">
            <div className="relative w-5 h-8 rounded-b-md rounded-t-sm border border-white/70 overflow-hidden bg-white/10">
              <div
                className="absolute bottom-0 left-0 right-0 bg-cyan-300/90 transition-all"
                style={{ height: `${Math.round(waterProgress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-white/85 whitespace-nowrap">
              {dayLog.waterMl} / {WATER_GOAL_ML} ml
            </p>
          </div>
        </div>

        {ringExpanded && (
          <div className="mt-4 bg-white/10 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-white/70">Protein</p>
              <p className="text-white font-semibold">{Math.round(protein)} g</p>
            </div>
            <div>
              <p className="text-white/70">Karbo</p>
              <p className="text-white font-semibold">{Math.round(carbs)} g</p>
            </div>
            <div>
              <p className="text-white/70">Fett</p>
              <p className="text-white font-semibold">{Math.round(fat)} g</p>
            </div>
            <div>
              <p className="text-white/70">7-dagers snitt</p>
              <p className="text-white font-semibold">{weeklyAverage} kcal</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 mt-4 text-center gap-2 items-end">
          <div>
            <p className="text-2xl font-bold text-white">{optimizedTargetKcal}</p>
            <p className="text-white/60 text-xs">TARGET KCAL</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white"><span key={consumed} className="count-bounce">{consumed}</span></p>
            <p className="text-white/60 text-xs">INNTAK</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">+<span key={dayLog.trainingKcal} className="count-bounce">{dayLog.trainingKcal}</span></p>
            <p className="text-white/60 text-xs">TRENING</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-white/10 p-3">
          <p className="text-[11px] text-white/70">Optimized target: {smartDietPlan.optimizedTargetKcal} kcal ({smartDietPlan.weeklyAdjustmentKcal >= 0 ? '+' : ''}{smartDietPlan.weeklyAdjustmentKcal} fra basis)</p>
          <p className="text-[11px] text-white/70 mt-1">BMR {smartDietPlan.bmr} | TDEE {smartDietPlan.tdee} | Basis {smartDietPlan.baseTargetKcal}</p>
          <p className="text-[11px] text-white/70 mt-1">{smartDietPlan.adjustmentReason}</p>
          <p className="text-[11px] text-white/70 mt-1">{smartDietPlan.projectedProgressText}</p>
          {smartDietPlan.macros && (
            <p className="text-[11px] text-white/70 mt-1">
              Makro-mal: P {smartDietPlan.macros.proteinG}g | F {smartDietPlan.macros.fatG}g | K {smartDietPlan.macros.carbsG}g
            </p>
          )}
        </div>

        {allTips.length > 0 && (
          <div className="mt-2 rounded-xl bg-white/10 px-3 py-2 flex items-center gap-2 min-h-[32px]">
            <span className="text-white/50 text-[10px] shrink-0 font-bold uppercase tracking-wide">Tips</span>
            <p
              key={tipIndex}
              className="text-[11px] text-white/85 leading-snug"
              style={{
                opacity: tipVisible ? 1 : 0,
                transform: tipVisible ? 'translateY(0)' : 'translateY(4px)',
                transition: 'opacity 0.35s ease, transform 0.35s ease',
              }}
            >
              {allTips[tipIndex]}
            </p>
            <span className="ml-auto text-white/30 text-[10px] shrink-0">{tipIndex + 1}/{allTips.length}</span>
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-center gap-4 py-4 select-none"
        onTouchStart={onDateTouchStart}
        onTouchEnd={onDateTouchEnd}
      >
        <button type="button" className="text-gray-500 dark:text-gray-400 p-2" onClick={goPreviousDay} title="Forrige dag">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="text-gray-600 dark:text-gray-300 font-medium text-center min-w-[220px]">{dateLabel}</p>
        <button type="button" className="text-gray-500 dark:text-gray-400 p-2" onClick={goNextDay} title="Neste dag">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3 pb-24">
        {mealTemplates.map((meal) => {
          const items = dayLog.meals[meal.id];
          const totals = mealTotals[meal.id];
          const isExpanded = expandedMeals[meal.id];
          const MealIcon = meal.icon;
          const mealHistory = historicalMealStats[meal.id];
          const mealTemplatesForSlot = savedMealTemplates.filter((template) => template.mealId === meal.id).slice(0, 2);
          const suggestedKcal = mealHistory.avgKcal > 0 ? mealHistory.avgKcal : meal.recommended;
          const groupedItems = groupFoodsByName(items);
          const previewItems = groupedItems.slice(0, 2);
          const extraPreviewCount = Math.max(groupedItems.length - previewItems.length, 0);
          const visibleItems = groupedItems.slice(0, 3);
          const hiddenItemCount = Math.max(groupedItems.length - visibleItems.length, 0);
          const quickSuggestions = quickSuggestionsByMeal[meal.id];

          return (
            <div
              key={meal.id}
              className="meal-item flex-col items-stretch"
              onTouchStart={(event) => onMealTouchStart(meal.id, event.touches[0]?.clientX ?? 0)}
              onTouchEnd={(event) => onMealTouchEnd(meal.id, event.changedTouches[0]?.clientX ?? 0)}
            >
              <button
                type="button"
                className="flex items-center justify-between tap-scale w-full"
                onClick={() => toggleMealExpanded(meal.id)}
              >
                <div className="meal-info">
                  <div className="meal-icon" style={{ background: meal.color }}>
                    <MealIcon className="w-6 h-6 text-gray-700" />
                  </div>
                  <div className="text-left min-w-0">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{meal.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{items.length ? <span key={totals.kcal} className="meal-kcal-tick">{totals.kcal} kcal</span> : `Anbefalt: ${meal.recommended} kcal`}</p>
                    {mealHistory.avgKcal > 0 && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">Vanlig: ~{mealHistory.avgKcal} kcal</p>
                    )}
                    {items.length > 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {previewItems.map((item) => `${item.name}${item.count > 1 ? ` x${item.count}` : ''}`).join(' + ')}
                        {extraPreviewCount > 0 ? ` + ${extraPreviewCount} til` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Trykk for å legge til mat</p>
                    )}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 slide-fade-in">
                  {mealHistory.lastThree.length > 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                      Last 3: {mealHistory.lastThree.join(' / ')} kcal
                    </p>
                  )}

                  {!items.length && (
                    <button
                      type="button"
                      onClick={() =>
                        addFoodToMeal(
                          meal.id,
                          {
                            id: `predictive-${meal.id}-${suggestedKcal}`,
                            name: `Predikert ${meal.name}`,
                            kcal: suggestedKcal,
                            protein: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.protein)),
                            carbs: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.carbs)),
                            fat: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.fat)),
                          },
                          `predictive:${meal.id}`,
                        )
                      }
                      className="mb-3 w-full text-left text-xs px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                      disabled={isPastSelectedDay}
                    >
                      Du pleier ca {suggestedKcal} kcal her. Trykk for auto prefill.
                    </button>
                  )}

                  {items.length === 0 && (
                    <div className="flex flex-wrap gap-2">
                      {quickSuggestions.map((quick) => (
                        <button
                          key={quick.id}
                          type="button"
                          onClick={() => addFoodToMeal(meal.id, quick)}
                          className="text-xs px-3 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300 tap-scale"
                          disabled={isPastSelectedDay}
                        >
                          + {quick.name}
                        </button>
                      ))}
                      {mealTemplatesForSlot.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() =>
                            template.items.forEach((item) => addFoodToMeal(meal.id, { ...item, id: createFoodId() }, `template:${template.id}`))
                          }
                          className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300"
                          disabled={isPastSelectedDay}
                        >
                          + {template.name}
                        </button>
                      ))}
                      {quickSuggestions.length === 0 && mealTemplatesForSlot.length === 0 && (
                        <p className="text-xs text-gray-400">Ingen forslag enda. Logg forste matvare for a bygge forslag.</p>
                      )}
                    </div>
                  )}

                  {items.length > 0 && !lazyMode && (
                    <div>
                      <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-full bg-gray-100 dark:bg-gray-600 px-2 py-0.5 text-gray-600 dark:text-gray-200">P {Math.round(totals.protein)}g</span>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-600 px-2 py-0.5 text-gray-600 dark:text-gray-200">K {Math.round(totals.carbs)}g</span>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-600 px-2 py-0.5 text-gray-600 dark:text-gray-200">F {Math.round(totals.fat)}g</span>
                      </div>
                      <div className="space-y-1">
                        {visibleItems.map((item) => (
                          <p key={item.name} className="text-sm text-gray-700 dark:text-gray-200 flex justify-between gap-3">
                            <span className="truncate">
                              {item.name}
                              {item.count > 1 ? ` x${item.count}` : ''}
                            </span>
                            <span>{item.kcal} kcal</span>
                          </p>
                        ))}
                        {hiddenItemCount > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">+{hiddenItemCount} flere varer</p>}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addFoodToMeal(meal.id, createQuickPhotoEntry(meal.id, suggestedKcal))}
                      className="rounded-lg bg-orange-500 text-white text-xs px-3 py-2 font-medium"
                      title="Hurtigfoto"
                      disabled={isPastSelectedDay}
                    >
                      + Hurtigfoto ({roundToNearest(suggestedKcal, 10)})
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
                      onClick={() => setScanHint('AI food recognition blir hovedmodus her.')}
                      title="AI matgjenkjenning"
                      disabled={isPastSelectedDay}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Kamera
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
                      onClick={() => setScanHint('Strekkodeskanner klar for rask logging.')}
                      title="Strekkodeskanner"
                      disabled={isPastSelectedDay}
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      Strekkode
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-xs px-3 py-2"
                      onClick={() => setScanHint('Voice: "To egg og toast" (kommer snart).')}
                      title="Voice input"
                      disabled={isPastSelectedDay}
                    >
                      Stemme (snart)
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pendingTemplate && (
        <div className="mx-4 mb-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
            Du har logget dette flere ganger. Lagre som "{pendingTemplate.suggestedName}"?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSavedMealTemplates((prev) => [
                  ...prev,
                  {
                    id: createFoodId(),
                    mealId: pendingTemplate.mealId,
                    name: pendingTemplate.suggestedName,
                    items: pendingTemplate.items.map((item) => ({ ...item })),
                    usageCount: 0,
                  },
                ]);
                setPendingTemplate(null);
                setScanHint('Maltid lagret for 1-tap logging.');
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-700 text-white"
            >
              Lagre
            </button>
            <button
              type="button"
              onClick={() => setPendingTemplate(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            >
              Senere
            </button>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Trening</h3>
          </div>
          <button
            type="button"
            onClick={openWorkoutModal}
            className="text-xs font-medium text-orange-600 dark:text-orange-400 px-2 py-1 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30"
            disabled={isPastSelectedDay}
          >
            Logg tilpasset økt
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            type="button"
            onClick={() => addTraining(420, 'workout:45-intense')}
            className="w-full p-2 text-xs rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300"
            disabled={isPastSelectedDay}
          >
            <span className="block font-medium">Intensiv økt</span>
            <span className="block opacity-70">ca. 420 kcal</span>
          </button>
          <button
            type="button"
            onClick={() => addTraining(300, 'workout:strength')}
            className="w-full p-2 text-xs rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300"
            disabled={isPastSelectedDay}
          >
            <span className="block font-medium">Styrketrening</span>
            <span className="block opacity-70">ca. 300 kcal</span>
          </button>
          <button
            type="button"
            onClick={() => addTraining(350, 'workout:10k-steps')}
            className="w-full p-2 text-xs rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-300"
            disabled={isPastSelectedDay}
          >
            <span className="block font-medium">10 000 skritt</span>
            <span className="block opacity-70">ca. 350 kcal</span>
          </button>
        </div>
        {selectedDayWorkouts.length > 0 && (
          <div className="mt-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2">
            <p className="text-[11px] text-orange-700 dark:text-orange-300 mb-1">Dagens okter</p>
            <div className="space-y-1">
              {selectedDayWorkouts.map((session) => (
                <div key={session.id} className="text-xs text-orange-700 dark:text-orange-300 flex items-center justify-between gap-2">
                  <span className="truncate flex-1">
                    {session.exerciseName} ({session.durationMin} min)
                  </span>
                  <span className="shrink-0">{session.caloriesBurned} kcal</span>
                  {!isPastSelectedDay && (
                    <button
                      type="button"
                      onClick={() => removeWorkoutSession(session.id)}
                      className="shrink-0 w-4 h-4 rounded-full bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-200 flex items-center justify-center hover:bg-orange-300 dark:hover:bg-orange-700"
                      aria-label="Fjern økt"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-600" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Vann</h3>
          </div>
          <p className="text-xs text-cyan-700 dark:text-cyan-400">{dayLog.waterMl} / {WATER_GOAL_ML} ml</p>
        </div>

        <div className="mt-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 p-3">
          <div className="flex items-center justify-between text-xs text-cyan-700 dark:text-cyan-300 mb-2">
            <span>Vannmeter</span>
            <span>{waterMeterMl} ml</span>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            step={50}
            value={waterMeterMl}
            onChange={(event) => setWaterMeterMl(Number(event.target.value))}
            className="w-full accent-cyan-500"
            disabled={isPastSelectedDay}
          />
          <div className="mt-1 flex justify-between text-[11px] text-cyan-600 dark:text-cyan-400">
            <span>0 ml</span>
            <span>500 ml</span>
            <span>1000 ml</span>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => addWater(waterMeterMl, 'water:meter:add')}
              className="w-full p-2 text-xs rounded-lg bg-cyan-600 text-white disabled:bg-cyan-300 tap-scale"
              disabled={isPastSelectedDay || waterMeterMl <= 0}
            >
              Fyll glass
            </button>
          </div>
        </div>

        {!dayHasAnyLog && isTodaySelected && (
          <button
            type="button"
            onClick={() => handleQuickAdd('streak-protect')}
            className="w-full mt-3 p-3 text-xs rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
          >
            Quick Save 0 kcal to protect streak
          </button>
        )}
      </div>

      {/* Daily Challenges card */}
      {isTodaySelected && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Daglige utfordringer</h3>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${challengesCompletedToday === 3 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {challengesCompletedToday}/3
            </span>
          </div>
          <div className="space-y-3">
            {/* Challenge 1: Discipline score */}
            <div className={`rounded-xl p-3 border transition-all ${challenge1Done ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 challenge-flash' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                  {challenge1Done ? '✅' : '🎯'} Disiplinscore ≥ 80
                </span>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">+20 XP</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${challenge1Done ? 'bg-amber-500' : 'bg-orange-400'}`}
                  style={{ width: `${Math.min(100, (discipline.score / 80) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{discipline.score}/80 poeng</p>
            </div>

            {/* Challenge 2: Protein */}
            <div className={`rounded-xl p-3 border transition-all ${challenge2Done ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 challenge-flash' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                  {challenge2Done ? '✅' : '💪'} Proteinmål 85 %
                </span>
                <span className="text-[11px] font-bold text-green-600 dark:text-green-400">+12 XP</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${challenge2Done ? 'bg-green-500' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, proteinMetricPct)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{Math.round(proteinMetricPct)}/85 %</p>
            </div>

            {/* Challenge 3: Water */}
            <div className={`rounded-xl p-3 border transition-all ${challenge3Done ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800 challenge-flash' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                  {challenge3Done ? '✅' : '💧'} Vannmål 85 %
                </span>
                <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400">+12 XP</span>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${challenge3Done ? 'bg-cyan-500' : 'bg-sky-400'}`}
                  style={{ width: `${Math.min(100, waterMetricPct)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{Math.round(waterMetricPct)}/85 %</p>
            </div>
          </div>
          {challengesCompletedToday === 3 && (
            <p className="mt-3 text-center text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
              🏆 Alle utfordringer fullført — +44 XP!
            </p>
          )}
        </div>
      )}

      {isPastSelectedDay && (
        <p className="px-4 mt-2 text-xs text-amber-600">
          Denne dagen er last fordi den har passert. Dagens score er derfor uforanderlig.
        </p>
      )}

      {scanHint && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 bg-gray-900 text-white text-xs px-3 py-2 rounded-full z-50">
          {scanHint}
        </div>
      )}

      {showPopup && (
        <div className="popup-overlay">
          <div className="popup">
            <button
              type="button"
              onClick={dismissGoalPopupForDay}
              className="popup-close"
              aria-label="Lukk mal nadd varsel"
            >
              x
            </button>
            <div className="popup-icon">Goal</div>
            <h3 className="popup-title">MAL NADD</h3>
            <p className="popup-text">Sterk dag. Du holder deg innenfor kalorimarginen.</p>
          </div>
        </div>
      )}

      {showWorkoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Logg treningsokt</h3>
              <button
                type="button"
                onClick={() => setShowWorkoutModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              >
                x
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Tidspunkt</label>
                <input
                  type="datetime-local"
                  value={workoutStartedAt}
                  onChange={(event) => setWorkoutStartedAt(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Varighet (min)</label>
                  <input
                    inputMode="numeric"
                    value={workoutDurationMin}
                    onChange={(event) => setWorkoutDurationMin(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Kcal forbrent</label>
                  <input
                    inputMode="numeric"
                    value={workoutCalories}
                    onChange={(event) => setWorkoutCalories(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Type</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(['Run', 'Ride', 'Walk', 'Strength', 'HIIT', 'Other'] as WorkoutSession['workoutType'][]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setWorkoutType(type)}
                      className={`rounded-lg px-2 py-2 text-xs border ${workoutType === type ? 'bg-orange-500 text-white border-orange-500' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Ovelse / aktivitet</label>
                <input
                  value={workoutExerciseName}
                  onChange={(event) => setWorkoutExerciseName(event.target.value)}
                  placeholder="f.eks. Intervallop, benokt, sykkel"
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Notater (valgfritt)</label>
                <textarea
                  value={workoutNotes}
                  onChange={(event) => setWorkoutNotes(event.target.value)}
                  rows={3}
                  placeholder="Hvordan kjentes okten?"
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowWorkoutModal(false)}
                className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={saveWorkoutSession}
                className="flex-1 rounded-lg bg-orange-500 px-3 py-2 text-sm text-white"
              >
                Lagre okt
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickAddMenu && (
        <div className="fixed right-4 bottom-24 z-50 w-72 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 p-2 quick-menu-enter">
          <p className="text-[11px] uppercase text-gray-400 dark:text-gray-500 px-3 py-1">Smart quick buttons</p>
          {smartQuickActions.slice(0, 6).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleQuickAdd(action.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
            >
              {action.label}
            </button>
          ))}

          <p className="text-[11px] uppercase text-gray-400 dark:text-gray-500 px-3 py-1 mt-1">Intelligent repeat</p>
          <button type="button" onClick={() => handleQuickAdd('repeat-breakfast')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            Gjenta frokost
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-lunch')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            Gjenta lunsj
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-day-yesterday')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            Gjenta hele dagen
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-last-monday')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            Gjenta siste mandag
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-frequent')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            Gjenta vanligste dag
          </button>

          <p className="text-[11px] uppercase text-gray-400 dark:text-gray-500 px-3 py-1 mt-1">Rask makro-logging</p>
          <button type="button" onClick={() => handleQuickAdd('macro-protein')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            +30g protein
          </button>
          <button type="button" onClick={() => handleQuickAdd('macro-carbs')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            +50g karbohydrater
          </button>
          <button type="button" onClick={() => handleQuickAdd('macro-fat')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
            +20g fett
          </button>
        </div>
      )}

      {undoAction && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full bg-gray-900 text-white text-xs px-3 py-2 flex items-center gap-3">
          <span>{undoAction.label}</span>
          <button
            type="button"
            onClick={() => {
              undoAction.undo();
              setUndoAction(null);
              setScanHint('Angret');
            }}
            className="text-orange-300 font-semibold"
          >
            Angre
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowQuickAddMenu((prev) => !prev)}
        className="fixed right-4 bottom-8 z-50 w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center fab-pulse"
        title="Quick add"
        disabled={isPastSelectedDay}
      >
        <Plus className={`w-6 h-6 transition-transform ${showQuickAddMenu ? 'rotate-45' : ''}`} />
      </button>
    </div>
  );
}
