import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../lib/i18n';
import type { LucideIcon } from 'lucide-react';
import {
  Flame,
  Camera,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Menu,
  Pencil,
  Plus,
  ScanLine,
  Apple,
  Egg,
  Sandwich,
  Trash2,
  UtensilsCrossed,
  Droplets,
  Dumbbell,
  X,
  BarChart2,
  RefreshCw,
  Settings,
  BookOpen,
  ChevronDown,
  Scale,
  TrendingUp,
  Microscope,
  Minus,
  Pill,
  Coffee,
  Zap,
  Fish,
  Leaf,
  Sun,
  Heart,
  FlaskConical,
  Check,
  Pin,
  Bookmark,
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { notifyXP } from '../../lib/xpNotifier';
import { rollVariableReward } from '../../lib/variableRewardEngine';
import { haptics } from '../../lib/haptics';
import {
  PROTEIN_GOAL_G,
  WATER_GOAL_ML,
  addDays,
  calculateDailyDisciplineScore,
  createEmptyDayLog,
  getTotalHydrationMl,
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
import { generateCoachMessage, computeAdaptiveComplexity } from '../../lib/coachEngine';
import { useLanguage } from '../../lib/i18n';
import CoachCard from '../coach/CoachCard';
import TrajectoryChart from '../trajectory/TrajectoryChart';
import GoalCelebrationOverlay from '../ui/GoalCelebrationOverlay';
import RollingNumber from '../ui/RollingNumber';

type MealTemplate = {
  id: MealId;
  name: string;
  icon: LucideIcon;
  color: string;
  recommended: number;
};

type LogEvent = {
  id: string;
  type: 'meal' | 'water' | 'workout' | 'macro' | 'repeat';
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
  imageUrl?: string;
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

type LoggedMealEntry = {
  mealId: MealId;
  index: number;
  entry: FoodEntry;
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
  allergies?: string[];
};

type DayMicroLog = {
  fiberG?: number;
  omega3G?: number;
  ironMg?: number;
  calciumMg?: number;
  vitCMg?: number;
  vitDUg?: number;
  magMg?: number;
  zincMg?: number;
  kreatinG?: number;
};

type CustomIntake = {
  id: string;
  name: string;
  icon: string;
  unit: string;
  goalPerDay: number;
};
// per-date log: { [dateKey]: { [intakeId]: amount } }
type CustomIntakeLogs = Record<string, Record<string, number>>;

const CUSTOM_INTAKE_ICONS: { key: string; label: string }[] = [
  { key: 'pill',     label: 'Pille'     },
  { key: 'coffee',   label: 'Kaffe'     },
  { key: 'zap',      label: 'Energi'    },
  { key: 'fish',     label: 'Fisk'      },
  { key: 'leaf',     label: 'Urt'       },
  { key: 'sun',      label: 'Vitamin D' },
  { key: 'heart',    label: 'Hjerte'    },
  { key: 'flask',    label: 'Tilskudd'  },
  { key: 'droplet',  label: 'Drikke'    },
  { key: 'apple',    label: 'Mat'       },
  { key: 'dumbbell', label: 'Trening'   },
];

function CustomIntakeIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  if (iconKey === 'coffee')   return <Coffee className={className} />;
  if (iconKey === 'zap')      return <Zap className={className} />;
  if (iconKey === 'fish')     return <Fish className={className} />;
  if (iconKey === 'leaf')     return <Leaf className={className} />;
  if (iconKey === 'sun')      return <Sun className={className} />;
  if (iconKey === 'heart')    return <Heart className={className} />;
  if (iconKey === 'flask')    return <FlaskConical className={className} />;
  if (iconKey === 'droplet')  return <Droplets className={className} />;
  if (iconKey === 'apple')    return <Apple className={className} />;
  if (iconKey === 'dumbbell') return <Dumbbell className={className} />;
  return <Pill className={className} />;
}

const ALLERGY_KEYWORDS: Record<string, string[]> = {
  gluten: ['gluten', 'hvete', 'bygg', 'rug', 'spelt', 'brød', 'pasta', 'mel', 'kake', 'kjeks', 'havre'],
  milk: ['melk', 'milk', 'ost', 'cheese', 'yogurt', 'fløte', 'smør', 'butter', 'cream', 'dairy', 'kefir', 'skyr', 'rømme', 'kesam'],
  egg: ['egg'],
  nuts: ['nøtter', 'nuts', 'mandel', 'almond', 'cashew', 'valnøtt', 'walnut', 'hasselnøtt', 'hazelnut', 'pistachio', 'pistasjnøtt'],
  fish: ['fisk', 'fish', 'laks', 'salmon', 'torsk', 'cod', 'sild', 'herring', 'makrell', 'mackerel', 'tuna', 'tunfisk', 'ørret', 'trout'],
  shellfish: ['skalldyr', 'shellfish', 'reke', 'shrimp', 'krabbe', 'crab', 'hummer', 'lobster', 'musling', 'mussel', 'østers', 'oyster', 'blekksprut'],
  soy: ['soya', 'soy', 'tofu', 'edamame', 'miso', 'tempeh'],
  peanuts: ['peanøtt', 'peanut', 'jordnøtt', 'groundnut'],
};
const ALLERGY_LABELS: Record<string, string> = { gluten: 'Gluten', milk: 'Melk', egg: 'Egg', nuts: 'Nøtter', fish: 'Fisk', shellfish: 'Skalldyr', soy: 'Soya', peanuts: 'Peanøtter' };

const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_NOTCH = RING_CIRCUMFERENCE * 0.055; // gap reserved until protein + water are also hit
const SWIPE_THRESHOLD = 45;
const WATER_CUP_SIZE_ML = 250;
const MAX_WATER_CUPS = 8;
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_HOME_PROFILE: HomeProfile = {};
const EMPTY_LOG_EVENTS: LogEvent[] = [];
const EMPTY_SAVED_MEAL_TEMPLATES: SavedMealTemplate[] = [];
const EMPTY_MICRO_LOGS: Record<string, DayMicroLog> = {};
const EMPTY_WORKOUT_SESSIONS: WorkoutSession[] = [];
const EMPTY_DATE_FLAGS: Record<string, true> = {};
const EMPTY_CUSTOM_INTAKES: CustomIntake[] = [];
const EMPTY_CUSTOM_INTAKE_LOGS: CustomIntakeLogs = {};
const CONSISTENCY_DROP_INSIGHT = 'Consistency dropped this week. Use a simpler logging mode temporarily.';
const SCAN_TARGET_DATE_KEY_STORAGE_KEY = 'kalorifit.scanTargetDateKey.v1';

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

const mealLabelById: Record<MealId, string> = {
  breakfast: 'Frokost',
  lunch: 'Lunsj',
  dinner: 'Middag',
  snacks: 'Snacks',
};

const mealIconToneById: Record<MealId, string> = {
  breakfast: 'bg-amber-100 dark:bg-amber-500/14 border border-amber-200/80 dark:border-amber-400/25',
  lunch: 'bg-emerald-100 dark:bg-emerald-500/14 border border-emerald-200/80 dark:border-emerald-400/25',
  dinner: 'bg-sky-100 dark:bg-sky-500/14 border border-sky-200/80 dark:border-sky-400/25',
  snacks: 'bg-fuchsia-100 dark:bg-fuchsia-500/14 border border-fuchsia-200/80 dark:border-fuchsia-400/25',
};

const mealIconGlyphToneById: Record<MealId, string> = {
  breakfast: 'text-amber-700 dark:text-amber-300/80',
  lunch: 'text-emerald-700 dark:text-emerald-300/80',
  dinner: 'text-sky-700 dark:text-sky-300/80',
  snacks: 'text-fuchsia-700 dark:text-fuchsia-300/80',
};

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
const kcalNumberFormat = new Intl.NumberFormat('nb-NO');

function formatDateKey(dateKey: string) {
  if (typeof dateKey !== 'string') return fullDateFormat.format(new Date());
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return fullDateFormat.format(new Date());
  }
  return fullDateFormat.format(new Date(year, month - 1, day));
}

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

function getRingColor(caloriesRemaining: number, netGoal: number) {
  if (caloriesRemaining < 0) return '#ef4444';
  const threshold = Math.max(150, netGoal * 0.1);
  if (caloriesRemaining <= threshold) return '#f97316';
  return '#22c55e';
}

function getWeeklyBarColor(fillRatio: number) {
  const clamped = Math.max(0, Math.min(fillRatio, 1));
  const hue = Math.round(clamped * 120);
  return `hsl(${hue}, 78%, 46%)`;
}

function isWithinCalorieRange(log: DayLog, targetKcal: number) {
  const consumed = Object.values(log.meals)
    .flat()
    .reduce((sum, item) => sum + item.kcal, 0);
  const goal = targetKcal + log.trainingKcal;
  const tolerance = Math.max(200, goal * 0.12);
  const remaining = goal - consumed;
  return consumed > 0 && remaining >= -tolerance && remaining <= tolerance * 1.5;
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
      breakfast: log.meals.breakfast.map((item) => ({ ...item })),
      lunch: log.meals.lunch.map((item) => ({ ...item })),
      dinner: log.meals.dinner.map((item) => ({ ...item })),
      snacks: log.meals.snacks.map((item) => ({ ...item })),
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

function localizeAdjustmentReason(reason: string, t: (key: string) => string) {
  if (reason.startsWith('Weight is not dropping. Applying -')) return t('home.adjustments.weightNotMoving');
  if (reason.startsWith('Weight is dropping too fast. Adding +')) return t('home.adjustments.losingFast');
  if (reason === 'Weight trend is in healthy fat-loss range.') return t('home.adjustments.healthyFatLoss');
  if (reason.startsWith('Weight gain is too slow. Applying +')) return t('home.adjustments.gainingTooSlow');
  if (reason.startsWith('Weight gain is too fast. Applying -')) return t('home.adjustments.gainingTooFast');
  if (reason === 'Weight trend is in healthy muscle-gain range.') return t('home.adjustments.healthyMuscle');
  if (reason.startsWith('Drift detected. Adjusting by')) return t('home.adjustments.driftAdjusted');
  if (reason === 'Trend is stable.') return t('home.adjustments.trendStable');
  if (reason === 'Standard mode uses static target.') return t('home.adjustments.staticGoal');
  return reason;
}

function localizeProjectionText(text: string) {
  if (text.startsWith('Open projection: ~')) {
    const value = text.replace('Open projection: ~', '').replace('kg/week', 'kg/uke');
    return `Estimert utvikling: ${value}`;
  }
  return text;
}

function localizeBehaviorInsight(insight: string, t: (key: string) => string) {
  if (insight === 'Weekend calorie intake is higher than weekdays. Consider a weekend buffer.') {
    return t('home.insights.weekendHigher');
  }
  if (insight === 'You under-eat protein on Sundays compared with your target.') {
    return t('home.insights.sundayProteinLow');
  }
  if (insight === 'Calories often spike after 8 PM. Plan a protein-forward evening meal.') {
    return t('home.insights.eveningSpike');
  }
  if (insight === 'Consistency dropped this week. Use a simpler logging mode temporarily.') {
    return t('home.insights.consistencyDrop');
  }
  return insight;
}

export default function HomeScreen() {
  const t = useT();
  const language = useLanguage();
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [profilePrefs, setProfilePrefs] = useLocalStorageState<HomeProfile>('profile', EMPTY_HOME_PROFILE);
  const [lastLoggedFood, setLastLoggedFood] = useLocalStorageState<FoodEntry | null>('home.lastLoggedFood.v1', null);
  const [logEvents, setLogEvents] = useLocalStorageState<LogEvent[]>('home.logEvents.v1', EMPTY_LOG_EVENTS);
  const [savedMealTemplates, setSavedMealTemplates] = useLocalStorageState<SavedMealTemplate[]>('home.savedMealTemplates.v1', EMPTY_SAVED_MEAL_TEMPLATES);
  const [savedMealsModalMealId, setSavedMealsModalMealId] = useState<MealId | null>(null);
  const [templatePortions, setTemplatePortions] = useState<Record<string, number>>({});
  const [workoutSessions, setWorkoutSessions] = useLocalStorageState<WorkoutSession[]>('home.workoutSessions.v1', EMPTY_WORKOUT_SESSIONS);
  const [goalPopupDismissedByDate, setGoalPopupDismissedByDate] = useLocalStorageState<Record<string, true>>(
    'home.goalPopupDismissedByDate.v1',
    EMPTY_DATE_FLAGS,
  );
  const [goalPopupShownByDate, setGoalPopupShownByDate] = useLocalStorageState<Record<string, true>>(
    'home.goalPopupShownByDate.v1',
    EMPTY_DATE_FLAGS,
  );
  type StreakFreezeState = { available: number; monthKey: string; frozenDays: string[] };
  const [streakFreeze, setStreakFreeze] = useLocalStorageState<StreakFreezeState>(
    'home.streakFreeze.v1',
    { available: 1, monthKey: '', frozenDays: [] },
  );
  const [today, setToday] = useState<Date>(() => startOfDay(new Date()));
  const [dayOffset, setDayOffset] = useState(0);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [historyViewDate, setHistoryViewDate] = useState(() => startOfDay(new Date()));
  const [historySelectedKey, setHistorySelectedKey] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [ringExpanded, setRingExpanded] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Record<MealId, boolean>>(collapsedMeals);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  const [showNutrientModal, setShowNutrientModal] = useState(false);
  const [microLogsByDate, setMicroLogsByDate] = useLocalStorageState<Record<string, DayMicroLog>>('home.microLogs.v1', EMPTY_MICRO_LOGS);
  const [microInputKey, setMicroInputKey] = useState<keyof DayMicroLog | null>(null);
  const [microInputValue, setMicroInputValue] = useState('');
  const [customIntakes, setCustomIntakes] = useLocalStorageState<CustomIntake[]>('home.customIntakes.v1', EMPTY_CUSTOM_INTAKES);
  const [customIntakeLogs, setCustomIntakeLogs] = useLocalStorageState<CustomIntakeLogs>('home.customIntakeLogs.v1', EMPTY_CUSTOM_INTAKE_LOGS);
  const [showAddIntakeModal, setShowAddIntakeModal] = useState(false);
  const [editingIntake, setEditingIntake] = useState<CustomIntake | null>(null);
  const [intakeForm, setIntakeForm] = useState<{ name: string; icon: string; unit: string; goalPerDay: string }>({ name: '', icon: 'pill', unit: 'dose', goalPerDay: '1' });
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [pendingInspirationRef, setPendingInspirationRef] = useState<{ postId: string; title: string; authorName: string; timestamp: number } | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate | null>(null);
  const [smartPrompt, setSmartPrompt] = useState<string | null>(null);
  const [heroMessageIndex, setHeroMessageIndex] = useState(0);
  const [heroMessageVisible, setHeroMessageVisible] = useState(true);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarView, setSidebarView] = useState<'menu' | 'logg' | 'goals' | 'journey'>('menu');
  const [workoutStartedAt, setWorkoutStartedAt] = useState('');
  const [workoutDurationMin, setWorkoutDurationMin] = useState('30');
  const [workoutCalories, setWorkoutCalories] = useState('220');
  const [workoutType, setWorkoutType] = useState<WorkoutSession['workoutType']>('Run');
  const [workoutExerciseName, setWorkoutExerciseName] = useState('');
  const [workoutNotes, setWorkoutNotes] = useState('');
  const [_isTrainingFlexing, setIsTrainingFlexing] = useState(false);
  const [animatingWaterCups, setAnimatingWaterCups] = useState<number[]>([]);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [showCustomWater, setShowCustomWater] = useState(false);
  const [customWaterInput, setCustomWaterInput] = useState('');

  const [animatedProgressRatio, setAnimatedProgressRatio] = useState(0);
  const [animatedProgressValue, setAnimatedProgressValue] = useState(0);
  const [ringAnimating, setRingAnimating] = useState(false);
  const [ringPumping, setRingPumping] = useState(false);
  const ringPumpTimerRef = useRef<number | null>(null);
  const [animatedConsumed, setAnimatedConsumed] = useState(0);
  const [animatedGoal, setAnimatedGoal] = useState(0);
  const [animatedTraining, setAnimatedTraining] = useState(0);
  const [animatedProtein, setAnimatedProtein] = useState(0);
  const [flashedStat, setFlashedStat] = useState<'consumed' | 'goal' | 'training' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ mealId: MealId; entryId: string; name: string } | null>(null);
  const [editingFood, setEditingFood] = useState<{
    mealId: MealId;
    entryId: string;
    name: string;
    kcal: string;
    protein: string;
    carbs: string;
    fat: string;
  } | null>(null);
  const [manualAddMeal, setManualAddMeal] = useState<MealId | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [headerMomentFlash, setHeaderMomentFlash] = useState(false);
  const [waterPourActive, setWaterPourActive] = useState(false);
  const [pinnedSections, setPinnedSections] = useLocalStorageState<string[]>('home.pinnedSections.v1', []);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const pinned = JSON.parse(localStorage.getItem('home.pinnedSections.v1') || '[]') as string[];
      return {
        trening: pinned.includes('trening'),
        vann: pinned.includes('vann'),
        andre: pinned.includes('andre'),
        kroppsvekt: pinned.includes('kroppsvekt'),
        kosthold: pinned.includes('kosthold'),
      };
    } catch {
      return { trening: false, vann: false, andre: false, kroppsvekt: false, kosthold: false };
    }
  });
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [showProteinCelebration, setShowProteinCelebration] = useState(false);
  const [personalBests, setPersonalBests] = useLocalStorageState<{ highestProteinG: number; longestStreak: number }>(
    'home.personalBests.v1',
    { highestProteinG: 0, longestStreak: 0 },
  );
  const [personalBestBanner, setPersonalBestBanner] = useState<string | null>(null);
  const [personalBestLeaving, setPersonalBestLeaving] = useState(false);
  type Morgenbrev = { forDateKey: string; kcal: number; protein: number; readDateKey: string | null };
  const [morgenbrev, setMorgenbrev] = useLocalStorageState<Morgenbrev | null>('home.morgenbrev.v1', null);
  const [tomorrowForecastDismissed, setTomorrowForecastDismissed] = useLocalStorageState<string | null>('home.tomorrowForecastDismissed.v1', null);
  const [prognoseResetDate, setPrognoseResetDate] = useLocalStorageState<string | null>('home.prognoseResetDate.v1', null);
  const [calorieTweakByDate, setCalorieTweakByDate] = useLocalStorageState<Record<string, number>>('home.calorieTweak.v1', {});
  const [showCalorieTweak, setShowCalorieTweak] = useState(false);
  const prevProteinRef = useRef<number>(0);
  const pbShownRef = useRef<{ protein: boolean; streak: boolean }>({ protein: false, streak: false });
  const halfwayHapticKeyRef = useRef<string>('');
  const perfectRingHapticKeyRef = useRef<string>('');
  const swipeStartXRef = useRef<number | null>(null);
  const ringLastTapAtRef = useRef(0);
  const trainingFlexTimeoutRef = useRef<number | null>(null);
  const waterCupAnimationTimersRef = useRef<number[]>([]);
  const progressAnimationFrameRef = useRef<number | null>(null);
  const progressAnimationTimeoutRef = useRef<number | null>(null);
  const animatedProgressRatioRef = useRef(0);
  const animatedProgressValueRef = useRef(0);
  const animatedConsumedRef = useRef(0);
  const animatedGoalRef = useRef(0);
  const animatedTrainingRef = useRef(0);
  const animatedProteinRef = useRef(0);
  const statAnimationFrameRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const headerMomentTimerRef = useRef<number | null>(null);
  const waterPourTimerRef = useRef<number | null>(null);
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

  // Extended macros — summed from scanned food labels (undefined = no data available)
  const dayEntries = useMemo(() => Object.values(dayLog.meals).flat(), [dayLog.meals]);
  const dayFiber = useMemo(() => {
    const entries = dayEntries.filter((e) => e.fiber_g != null);
    if (entries.length === 0) return null;
    return Math.round(entries.reduce((s, e) => s + (e.fiber_g ?? 0), 0) * 10) / 10;
  }, [dayEntries]);
  const daySugars = useMemo(() => {
    const entries = dayEntries.filter((e) => e.sugars_g != null);
    if (entries.length === 0) return null;
    return Math.round(entries.reduce((s, e) => s + (e.sugars_g ?? 0), 0) * 10) / 10;
  }, [dayEntries]);
  const daySatFat = useMemo(() => {
    const entries = dayEntries.filter((e) => e.saturated_fat_g != null);
    if (entries.length === 0) return null;
    return Math.round(entries.reduce((s, e) => s + (e.saturated_fat_g ?? 0), 0) * 10) / 10;
  }, [dayEntries]);
  const daySodium = useMemo(() => {
    const entries = dayEntries.filter((e) => e.sodium_mg != null);
    if (entries.length === 0) return null;
    return Math.round(entries.reduce((s, e) => s + (e.sodium_mg ?? 0), 0));
  }, [dayEntries]);

  const smartDietPlan = useMemo(() => {
    // Use the most recent weight from BEFORE today so that logging weight
    // today does not immediately shift the calorie target mid-day.
    const historyBeforeToday = (profilePrefs.bmiHistory ?? [])
      .filter((e) => e.date < todayKey && Number.isFinite(e.weightKg))
      .sort((a, b) => b.date.localeCompare(a.date));
    const stableWeightKg = historyBeforeToday.length > 0
      ? historyBeforeToday[0].weightKg
      : (profilePrefs.weightKg ?? 70);

    const normalizedProfile = normalizeNutritionProfile({
      age: profilePrefs.age,
      weightKg: stableWeightKg,
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
  // Note: weightKg still in deps so new users without bmiHistory get correct initial plan

  const optimizedTargetKcal = smartDietPlan.optimizedTargetKcal;
  const calorieTweak = calorieTweakByDate[selectedDateKey] ?? 0;
  const netGoal = optimizedTargetKcal + dayLog.trainingKcal + calorieTweak;
  const caloriesRemaining = netGoal - consumed;
  const hydrationMl = getTotalHydrationMl(dayLog);
  const waterProgress = Math.min(hydrationMl / WATER_GOAL_ML, 1);
  const progressRatio = netGoal <= 0 ? 0 : Math.min(consumed / netGoal, 1);
  const ringColor = getRingColor(caloriesRemaining, netGoal);
  const discipline = useMemo(
    () => calculateDailyDisciplineScore(dayLog, netGoal),
    [dayLog, netGoal],
  );

  // Adaptive coach message — one concrete action for today
  const coachMessage = useMemo(
    () => generateCoachMessage(dayLog, profilePrefs, undefined, language),
    [dayLog, profilePrefs, language],
  );

  // Adaptive complexity — simplify UI when user is struggling, unlock advanced when consistent
  const adaptiveComplexity = useMemo(
    () => computeAdaptiveComplexity(logsByDate),
    [logsByDate],
  );
  const progressText = caloriesRemaining < 0 ? t('home.overGoal') : t('home.caloriesLeft');
  const progressValue = caloriesRemaining < 0 ? Math.abs(caloriesRemaining) : caloriesRemaining;
  const progressDetailText = caloriesRemaining < 0
    ? t('home.caloriesOverTarget', { kcal: kcalNumberFormat.format(consumed - netGoal) })
    : t('home.caloriesNetTarget', { kcal: kcalNumberFormat.format(netGoal) });
  const proteinHit = protein >= PROTEIN_GOAL_G;
  const waterHit = waterProgress >= 1;
  const calorieHit = progressRatio >= 1;

  // Direction-aware ±100 kcal "in range" — what counts as hitting the goal depends on goal mode
  const _goalMode = profilePrefs.goalMode ?? 'maintenance';
  const inCalorieRange = consumed > 0 && (
    _goalMode === 'muscle_gain'
      ? consumed >= netGoal - 100                          // gaining: not more than 100 under
      : _goalMode === 'fat_loss'
      ? consumed >= netGoal * 0.5 && consumed <= netGoal + 100  // losing: in range, not over by 100
      : Math.abs(caloriesRemaining) <= 100                 // maintenance/recomp: ±100
  );
  const legendaryRing = proteinHit && waterHit && inCalorieRange; // replaces perfectRing for visual gold
  const perfectRing = proteinHit && waterHit && calorieHit;       // kept for haptics / near-perfect logic

  // Proximity to goal — drives side ring animations
  const _kcalToGoal = _goalMode === 'muscle_gain'
    ? Math.max(0, netGoal - consumed)   // how many kcal still needed to reach bulk target
    : Math.max(0, caloriesRemaining);   // how many kcal remaining for fat_loss / maintenance
  const goalProximity: 'cold' | 'warm' | 'hot' | 'burning' | 'perfect' | 'legendary' =
    consumed === 0 ? 'cold' :
    legendaryRing ? 'legendary' :
    inCalorieRange ? 'perfect' :
    _kcalToGoal < 50  ? 'burning' :
    _kcalToGoal < 150 ? 'hot' :
    _kcalToGoal < 300 ? 'warm' : 'cold';

  const rawDashoffset = RING_CIRCUMFERENCE - animatedProgressRatio * RING_CIRCUMFERENCE;
  const animatedStrokeDashoffset = (perfectRing || legendaryRing) ? rawDashoffset : Math.max(rawDashoffset, RING_NOTCH);
  const consistencyDropInsight = useMemo(
    () => smartDietPlan.behaviorInsights.find((insight) => insight === CONSISTENCY_DROP_INSIGHT) ?? null,
    [smartDietPlan.behaviorInsights],
  );
  const otherBehaviorInsights = useMemo(
    () => smartDietPlan.behaviorInsights.filter((insight) => insight !== CONSISTENCY_DROP_INSIGHT),
    [smartDietPlan.behaviorInsights],
  );
  const extraHeroTips = useMemo(() => {
    const tips: string[] = [];

    if (isTodaySelected && consumed === 0) {
      tips.push(t('home.tips.startMeal'));
    }
    if (isTodaySelected && waterProgress < 0.45) {
      tips.push(t('home.tips.drinkWater'));
    }
    if (consumed > 0 && protein < 60) {
      tips.push(t('home.tips.addProtein'));
    }
    if (caloriesRemaining > 450 && consumed > 0) {
      tips.push(t('home.tips.planAhead'));
    }

    return tips;
  }, [caloriesRemaining, consumed, isTodaySelected, protein, t, waterProgress]);
  const rotatingHeroMessages = useMemo(() => {
    const messages = [
      smartPrompt,
      consistencyDropInsight ? localizeBehaviorInsight(consistencyDropInsight, t) : null,
      ...otherBehaviorInsights.map((insight) => localizeBehaviorInsight(insight, t)),
      ...extraHeroTips,
    ].filter((message): message is string => Boolean(message?.trim()));

    return messages.filter((message, index) => messages.indexOf(message) === index);
  }, [consistencyDropInsight, extraHeroTips, otherBehaviorInsights, smartPrompt, t]);
  const rotatingHeroMessageKey = useMemo(() => rotatingHeroMessages.join('||'), [rotatingHeroMessages]);
  const activeHeroMessage = rotatingHeroMessages[heroMessageIndex] ?? null;

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

  // ─── Activity history modal data ─────────────────────────────────────────────
  const historyMonthLabel = useMemo(() =>
    new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' }).format(historyViewDate),
  [historyViewDate]);

  const historyMonthDays = useMemo(() => {
    const year = historyViewDate.getFullYear();
    const month = historyViewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const weekStart = startOfWeekMonday(firstDay);
    const days: Date[] = [];
    let cur = new Date(weekStart);
    while (days.length < 42) {
      days.push(new Date(cur));
      if (days.length >= 28 && cur > lastDay) break;
      cur = addDays(cur, 1);
    }
    while (days.length % 7 !== 0) { days.push(new Date(cur)); cur = addDays(cur, 1); }
    return days;
  }, [historyViewDate]);

  const historyMonthStats = useMemo(() => {
    const month = historyViewDate.getMonth();
    let totalScore = 0; let loggedDays = 0; let scoredDays = 0;
    historyMonthDays.forEach((date) => {
      if (date.getMonth() !== month || date > today) return;
      const key = toDateKey(date);
      const log = logsByDate[key];
      if (!log) return;
      const hasData = Object.values(log.meals).flat().length > 0 || getTotalHydrationMl(log) > 0 || log.trainingKcal > 0;
      if (!hasData) return;
      loggedDays++;
      totalScore += calculateDailyDisciplineScore(log).score;
      scoredDays++;
    });
    return { avgScore: scoredDays > 0 ? Math.round(totalScore / scoredDays) : 0, loggedDays };
  }, [historyViewDate, historyMonthDays, logsByDate, today]);

  const historySelectedLog = historySelectedKey ? (logsByDate[historySelectedKey] ?? null) : null;

  const historicalMealLog = useMemo(() => {
    return Object.entries(logsByDate)
      .filter(([dateKey, dayLog]) => dateKey < todayKey && Object.values(dayLog.meals).flat().length > 0)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 10)
      .map(([dateKey, dayLog]) => {
        const mealSections = (Object.entries(dayLog.meals) as Array<[keyof DayLog['meals'], DayLog['meals'][keyof DayLog['meals']]]>)
          .filter(([, foods]) => foods.length > 0);
        const foods = mealSections.flatMap(([, items]) => items);
        return {
          dateKey,
          mealSections,
          totalFoods: foods.length,
          totalKcal: foods.reduce((sum, item) => sum + item.kcal, 0),
          totalProtein: foods.reduce((sum, item) => sum + item.protein, 0),
        };
      });
  }, [logsByDate, todayKey]);

  const journeyWeightSeries = useMemo(() => {
    const source = (profilePrefs.bmiHistory ?? [])
      .filter((entry) => Number.isFinite(entry.weightKg))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-12)
      .map((entry) => ({ date: entry.date, value: Number(entry.weightKg) }));
    if (source.length > 0) return source;
    const fallbackWeight = Number(profilePrefs.weightKg);
    if (Number.isFinite(fallbackWeight)) {
      return [{ date: todayKey, value: fallbackWeight }];
    }
    return [];
  }, [profilePrefs.bmiHistory, profilePrefs.weightKg, todayKey]);

  const streak = useMemo(() => {
    let days = 0;
    for (let i = 0; i < 365; i += 1) {
      const key = toDateKey(addDays(today, -i));
      const log = logsByDate[key];
      const frozen = streakFreeze.frozenDays.includes(key);
      if (!frozen && (!log || !isWithinCalorieRange(log, optimizedTargetKcal))) break;
      days += 1;
    }
    return days;
  }, [logsByDate, today, optimizedTargetKcal, streakFreeze.frozenDays]);

  // Month-reset: restore 1 freeze on the 1st of each new month
  useEffect(() => {
    const currentMonthKey = toDateKey(today).slice(0, 7);
    if (streakFreeze.monthKey !== currentMonthKey) {
      setStreakFreeze((prev) => ({ ...prev, available: 1, monthKey: currentMonthKey }));
    }
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Urgency signals — drive the flickering flame + loss counter
  const todayHasNoLogs = isTodaySelected && Object.values(dayLog.meals).every((items) => items.length === 0);
  const currentHour = new Date().getHours();
  const flameAtRisk = todayHasNoLogs && streak > 0 && currentHour >= 20;
  const showLossCounter = todayHasNoLogs && streak > 0 && currentHour >= 21;
  const xpAtRisk = Math.max(30, Math.min(120, streak * 8));
  const todayFrozen = streakFreeze.frozenDays.includes(todayKey);

  // #8 — "Nesten perfekt dag" — 2/3 goals hit after 21:00
  const goalsHitCount = [calorieHit, proteinHit, waterHit].filter(Boolean).length;
  const nearPerfect = isTodaySelected && !perfectRing && goalsHitCount === 2 && currentHour >= 21;
  const missingGoalLabel = !calorieHit ? 'kalorimålet' : !proteinHit ? 'proteinmålet' : 'vannmålet';


  // #22 — Tomorrow forecast
  const showTomorrowForecast = isTodaySelected && currentHour >= 20 && consumed > 0 && tomorrowForecastDismissed !== todayKey;

  // Morgenbrev — write tonight's letter, reveal tomorrow morning
  useEffect(() => {
    if (!isTodaySelected || consumed <= 0 || currentHour < 20) return;
    if (morgenbrev?.forDateKey === todayKey) return; // already written for today
    setMorgenbrev({ forDateKey: todayKey, kcal: Math.round(consumed), protein: Math.round(protein), readDateKey: null });
  }, [isTodaySelected, consumed, currentHour, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const yesterdayKey = useMemo(() => toDateKey(addDays(today, -1)), [today]);
  const showMorgenbrev = morgenbrev?.forDateKey === yesterdayKey
    && morgenbrev.readDateKey !== todayKey
    && currentHour >= 5 && currentHour < 11;


  const weeklyConsistencyScore = useMemo(() => {
    const passes = weeklyData.filter((day) => {
      const log = logsByDate[day.key];
      return log ? isWithinCalorieRange(log, optimizedTargetKcal) : false;
    }).length;
    return Math.round((passes / weeklyData.length) * 100);
  }, [logsByDate, weeklyData, optimizedTargetKcal]);
  const todaysLoggedItems = useMemo<LoggedMealEntry[]>(
    () =>
      mealTemplates.flatMap((meal) =>
        dayLog.meals[meal.id].map((entry, index) => ({
          mealId: meal.id,
          index,
          entry,
        })),
      ),
    [dayLog.meals],
  );
  // ── Identity layer: slow-changing, reflects behavioral trend over days/weeks ──
  const identityMode = useMemo(() => {
    // Count consecutive days without any logged food (gap detection)
    let daysSinceLastLog = 0;
    for (let i = 1; i <= 14; i++) {
      const key = toDateKey(addDays(today, -i));
      const log = logsByDate[key];
      if (log && Object.values(log.meals).some((items) => items.length > 0)) break;
      daysSinceLastLog++;
    }
    // Returned today after a lapse → Rebuilding (warm comeback, never punishing)
    if (consumed > 0 && daysSinceLastLog >= 2) return 'rebuilding' as const;
    // Strong streak + solid weekly consistency → Locked In
    if (streak >= 5 && weeklyConsistencyScore >= 71) return 'locked_in' as const;
    // Regular logging pattern → Steady
    if (weeklyConsistencyScore >= 43 || streak >= 3) return 'steady' as const;
    return 'building' as const;
  }, [consumed, logsByDate, streak, today, weeklyConsistencyScore]);

  const identityCaption = useMemo(() => {
    const map = {
      locked_in: t('home.identity.lockedIn'),
      rebuilding: t('home.identity.rebuilding'),
      steady: t('home.identity.steady'),
      building: t('home.identity.building'),
    } as const;
    return map[identityMode];
  }, [identityMode, t]);

  // Bubble animation pacing varies by identity: Locked In = confident, Rebuilding = gentle
  const identityBubbleDurationFactor = useMemo(() => {
    if (identityMode === 'locked_in') return 0.82;
    if (identityMode === 'rebuilding') return 1.12;
    return 1.0;
  }, [identityMode]);

  // CSS modifier class for header gradient shift
  const identityHeaderModifier = useMemo(() => {
    if (identityMode === 'locked_in') return 'screen-header-locked-in';
    if (identityMode === 'rebuilding') return 'screen-header-rebuilding';
    if (identityMode === 'steady') return 'screen-header-steady';
    return '';
  }, [identityMode]);
  const headerActivityScore = useMemo(() => {
    const streakScore = Math.min(streak / 14, 1);
    const consistencyScore = weeklyConsistencyScore / 100;
    const trainingScore = Math.min(dayLog.trainingKcal / 400, 1);
    return Math.max(
      0.08,
      Math.min(
        progressRatio * 0.34
          + (discipline.score / 100) * 0.26
          + waterProgress * 0.14
          + trainingScore * 0.12
          + streakScore * 0.08
          + consistencyScore * 0.06,
        1,
      ),
    );
  }, [dayLog.trainingKcal, discipline.score, progressRatio, streak, waterProgress, weeklyConsistencyScore]);
  const headerBubbleSpecs = useMemo(
    () => [
      { Icon: Apple, left: '9%', delay: '0s', duration: '10.5s', size: 18, threshold: 0.1 },
      { Icon: Droplets, left: '24%', delay: '1.1s', duration: '9.1s', size: 20, threshold: 0.18 },
      { Icon: Flame, left: '39%', delay: '0.6s', duration: '8.7s', size: 19, threshold: 0.28 },
      { Icon: Dumbbell, left: '58%', delay: '1.8s', duration: '9.8s', size: 18, threshold: 0.4 },
      { Icon: Egg, left: '73%', delay: '0.2s', duration: '10.9s', size: 17, threshold: 0.52 },
      { Icon: UtensilsCrossed, left: '86%', delay: '1.4s', duration: '8.9s', size: 20, threshold: 0.66 },
    ],
    [],
  );

  useEffect(() => {
    animatedProgressRatioRef.current = animatedProgressRatio;
  }, [animatedProgressRatio]);

  useEffect(() => {
    animatedProgressValueRef.current = animatedProgressValue;
  }, [animatedProgressValue]);

  useEffect(() => {
    if (progressAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(progressAnimationFrameRef.current);
    }
    if (progressAnimationTimeoutRef.current !== null) {
      window.clearTimeout(progressAnimationTimeoutRef.current);
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      setAnimatedProgressRatio(progressRatio);
      setAnimatedProgressValue(progressValue);
      setRingAnimating(false);
      return undefined;
    }

    const ratioStart = animatedProgressRatioRef.current;
    const valueStart = animatedProgressValueRef.current;
    const durationMs = 950;
    const startedAt = performance.now();

    setRingAnimating(true);

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      setAnimatedProgressRatio(ratioStart + (progressRatio - ratioStart) * eased);
      setAnimatedProgressValue(Math.round(valueStart + (progressValue - valueStart) * eased));

      if (t < 1) {
        progressAnimationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      progressAnimationFrameRef.current = null;
      progressAnimationTimeoutRef.current = window.setTimeout(() => setRingAnimating(false), 240);
    };

    progressAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (progressAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(progressAnimationFrameRef.current);
        progressAnimationFrameRef.current = null;
      }
      if (progressAnimationTimeoutRef.current !== null) {
        window.clearTimeout(progressAnimationTimeoutRef.current);
        progressAnimationTimeoutRef.current = null;
      }
    };
  }, [progressRatio, progressValue, selectedDateKey]);

  // Sync animated refs for stat pills
  useEffect(() => { animatedConsumedRef.current = animatedConsumed; }, [animatedConsumed]);
  useEffect(() => { animatedGoalRef.current = animatedGoal; }, [animatedGoal]);
  useEffect(() => { animatedTrainingRef.current = animatedTraining; }, [animatedTraining]);
  useEffect(() => { animatedProteinRef.current = animatedProtein; }, [animatedProtein]);

  // Count-up animation for stat pills (Mål / Spist / Trening)
  useEffect(() => {
    if (statAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(statAnimationFrameRef.current);
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      setAnimatedConsumed(consumed);
      setAnimatedGoal(optimizedTargetKcal);
      setAnimatedTraining(dayLog.trainingKcal);
      setAnimatedProtein(protein);
      return undefined;
    }

    const consumedStart = animatedConsumedRef.current;
    const goalStart = animatedGoalRef.current;
    const trainingStart = animatedTrainingRef.current;
    const proteinStart = animatedProteinRef.current;
    const durationMs = 800;
    const startedAt = performance.now();

    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    if (consumed !== consumedStart) setFlashedStat('consumed');
    else if (optimizedTargetKcal !== goalStart) setFlashedStat('goal');
    else if (dayLog.trainingKcal !== trainingStart) setFlashedStat('training');
    flashTimerRef.current = window.setTimeout(() => setFlashedStat(null), 600);

    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedConsumed(Math.round(consumedStart + (consumed - consumedStart) * eased));
      setAnimatedGoal(Math.round(goalStart + (optimizedTargetKcal - goalStart) * eased));
      setAnimatedTraining(Math.round(trainingStart + (dayLog.trainingKcal - trainingStart) * eased));
      setAnimatedProtein(Math.round(proteinStart + (protein - proteinStart) * eased));
      if (t < 1) {
        statAnimationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        statAnimationFrameRef.current = null;
      }
    };

    statAnimationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (statAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(statAnimationFrameRef.current);
        statAnimationFrameRef.current = null;
      }
    };
  }, [consumed, optimizedTargetKcal, dayLog.trainingKcal, protein, selectedDateKey]);

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
        .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
        .slice(0, 3),
    [selectedDateKey, workoutSessions],
  );
  const hasTrainingLogged = selectedDayWorkouts.length > 0 || dayLog.trainingKcal > 0;

  const triggerTrainingFlex = () => {
    if (trainingFlexTimeoutRef.current != null) {
      window.clearTimeout(trainingFlexTimeoutRef.current);
    }
    setIsTrainingFlexing(true);
    trainingFlexTimeoutRef.current = window.setTimeout(() => {
      setIsTrainingFlexing(false);
      trainingFlexTimeoutRef.current = null;
    }, 1200);
  };

  const triggerWaterCupFillAnimation = (beforeMl: number, afterMl: number) => {
    const beforeCups = Math.ceil(beforeMl / WATER_CUP_SIZE_ML);
    const afterCups = Math.min(MAX_WATER_CUPS, Math.ceil(afterMl / WATER_CUP_SIZE_ML));
    if (afterCups <= beforeCups) return;

    for (let cupIndex = beforeCups + 1; cupIndex <= afterCups; cupIndex += 1) {
      const appearTimer = window.setTimeout(() => {
        setAnimatingWaterCups((prev) => (prev.includes(cupIndex) ? prev : [...prev, cupIndex]));
        const disappearTimer = window.setTimeout(() => {
          setAnimatingWaterCups((prev) => prev.filter((value) => value !== cupIndex));
        }, 720);
        waterCupAnimationTimersRef.current.push(disappearTimer);
      }, (cupIndex - (beforeCups + 1)) * 110);
      waterCupAnimationTimersRef.current.push(appearTimer);
    }
  };

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

  useEffect(() => {
    return () => {
      if (trainingFlexTimeoutRef.current != null) {
        window.clearTimeout(trainingFlexTimeoutRef.current);
      }
      if (headerMomentTimerRef.current !== null) {
        window.clearTimeout(headerMomentTimerRef.current);
      }
      if (waterPourTimerRef.current !== null) {
        window.clearTimeout(waterPourTimerRef.current);
      }
      waterCupAnimationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      waterCupAnimationTimersRef.current = [];
    };
  }, []);

  // Protein goal celebration — fires once per session when protein crosses the goal
  useEffect(() => {
    const proteinGoal = smartDietPlan.macros?.proteinG;
    if (!proteinGoal || !isTodaySelected) { prevProteinRef.current = protein; return; }
    const prev = prevProteinRef.current;
    if (prev < proteinGoal && protein >= proteinGoal) {
      setShowProteinCelebration(true);
    }
    prevProteinRef.current = protein;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein]);

  const showPersonalBest = (msg: string) => {
    setPersonalBestLeaving(false);
    setPersonalBestBanner(msg);
    // after 3s pulse, trigger exit animation then clear
    setTimeout(() => setPersonalBestLeaving(true), 3000);
    setTimeout(() => { setPersonalBestBanner(null); setPersonalBestLeaving(false); }, 3500);
  };

  // Personal best detection — protein record
  useEffect(() => {
    if (!isTodaySelected || protein <= 0) return;
    if (!pbShownRef.current.protein && protein > personalBests.highestProteinG) {
      pbShownRef.current.protein = true;
      setPersonalBests((prev) => ({ ...prev, highestProteinG: Math.round(protein) }));
      showPersonalBest(`Ny proteinrekord! ${Math.round(protein)}g i dag`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein]);

  // Personal best detection — streak record
  useEffect(() => {
    if (!isTodaySelected || streak <= 1) return;
    if (!pbShownRef.current.streak && streak > personalBests.longestStreak) {
      pbShownRef.current.streak = true;
      setPersonalBests((prev) => ({ ...prev, longestStreak: streak }));
      showPersonalBest(`Ny strekrekord! ${streak} dager på rad`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak]);

  // ── Haptic milestone: 50% calorie goal ──────────────────────────────────────
  useEffect(() => {
    if (!isTodaySelected) return;
    const key = `${selectedDateKey}:halfway`;
    if (progressRatio >= 0.5 && halfwayHapticKeyRef.current !== key) {
      halfwayHapticKeyRef.current = key;
      haptics.medium();
    }
    // reset if user drops below (e.g. edits a meal)
    if (progressRatio < 0.45) halfwayHapticKeyRef.current = '';
  }, [progressRatio, isTodaySelected, selectedDateKey]);

  // ── Haptic milestone: perfect ring (calorie + protein + water) ───────────────
  useEffect(() => {
    if (!isTodaySelected || !perfectRing) return;
    const key = `${selectedDateKey}:perfect`;
    if (perfectRingHapticKeyRef.current !== key) {
      perfectRingHapticKeyRef.current = key;
      haptics.strong();
    }
  }, [perfectRing, isTodaySelected, selectedDateKey]);

  useEffect(() => {
    const syncToday = () => setToday(startOfDay(new Date()));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncToday();
    };
    window.addEventListener('focus', syncToday);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', syncToday);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

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
    const next: Record<MealId, boolean> = { breakfast: false, lunch: false, dinner: false, snacks: false };
    let anyLogged = false;
    for (const meal of mealTemplates) {
      if (selectedLog.meals[meal.id].length > 0) {
        next[meal.id] = true;
        anyLogged = true;
      }
    }
    setExpandedMeals(anyLogged ? next : collapsedMeals);
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
    if (!hasBreakfast && near(breakfastPrompt)) setSmartPrompt(t('home.prompts.breakfast'));
    else if (!hasLunch && near(lunchPrompt)) setSmartPrompt(t('home.prompts.lunch'));
    else if (!hasDinner && near(dinnerPrompt)) setSmartPrompt(t('home.prompts.dinner'));
    else setSmartPrompt(null);
  }, [dayLog.meals.breakfast.length, dayLog.meals.dinner.length, dayLog.meals.lunch.length, isPastSelectedDay, isTodaySelected, logEvents]);

  useEffect(() => {
    if (isPastSelectedDay) setShowQuickAddMenu(false);
  }, [isPastSelectedDay]);

  useEffect(() => {
    setHeroMessageIndex(0);
    setHeroMessageVisible(true);
  }, [rotatingHeroMessageKey]);

  useEffect(() => {
    if (rotatingHeroMessages.length <= 1) {
      setHeroMessageVisible(true);
      return;
    }

    let fadeTimer: number | null = null;
    const cycle = () => {
      setHeroMessageVisible(false);
      fadeTimer = window.setTimeout(() => {
        setHeroMessageIndex((prev) => (prev + 1) % rotatingHeroMessages.length);
        setHeroMessageVisible(true);
      }, 2000);
    };

    const cycleTimer = window.setInterval(cycle, 7000);

    return () => {
      window.clearInterval(cycleTimer);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    };
  }, [rotatingHeroMessageKey, rotatingHeroMessages.length]);

  const updateDayLog = (key: string, updater: (current: DayLog) => DayLog) => {
    setLogsByDate((prev) => {
      if (key < todayKey) {
        setScanHint(t('home.dayLocked'));
        return prev;
      }
      const current = prev[key] ?? createEmptyDayLog();
      return {
        ...prev,
        [key]: updater(current),
      };
    });
  };

  const reward = () => haptics.light();

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
        suggestedName: `Standard ${mealId === 'breakfast' ? t('home.meals.breakfast') : mealId === 'lunch' ? t('home.meals.lunch') : mealId === 'dinner' ? t('home.meals.dinner') : t('home.meals.snacks')}`,
        items: nextMealItems.map((item) => ({ ...item })),
      });
    }
  };

  const addFoodToMeal = (mealId: MealId, food: FoodEntry, actionId = `food:${mealId}`) => {
    const addedId = createFoodId();
    const eventId = createFoodId();
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
      undo: () => {
        setDayLog(selectedDateKey, previousDay);
        setLogEvents((prev) => prev.filter((e) => e.id !== eventId));
      },
    });
    setLogEvents((prev) =>
      [...prev, { type: 'meal' as const, actionId, mealId, kcal: food.kcal, id: eventId, timestampIso: new Date().toISOString() }].slice(-1200),
    );
    maybeSuggestTemplate(mealId, nextMealItems);
    reward();
    notifyXP(10, '+10 XP');
    const bonus = rollVariableReward({ food, mealId, dayLog });
    if (bonus) setTimeout(() => notifyXP(bonus.xp, bonus.label), 380);
    // Allergy check — warn but still log the food
    const userAllergies = profilePrefs.allergies ?? [];
    if (userAllergies.length > 0) {
      const nameLower = food.name.toLowerCase();
      const matched = userAllergies.find((allergy) => {
        const keywords = ALLERGY_KEYWORDS[allergy.toLowerCase()] ?? [allergy.toLowerCase()];
        return keywords.some((kw) => nameLower.includes(kw));
      });
      if (matched) {
        setScanHint(`⚠️ Advarsel: kan inneholde ${ALLERGY_LABELS[matched.toLowerCase()] ?? matched}`);
      }
    }
    // Moment layer: brief header flash after every successful food log
    if (headerMomentTimerRef.current !== null) window.clearTimeout(headerMomentTimerRef.current);
    setHeaderMomentFlash(true);
    headerMomentTimerRef.current = window.setTimeout(() => setHeaderMomentFlash(false), 720);
    // Ring pump
    if (ringPumpTimerRef.current !== null) window.clearTimeout(ringPumpTimerRef.current);
    setRingPumping(true);
    ringPumpTimerRef.current = window.setTimeout(() => setRingPumping(false), 520);

    // Feature #21 — check if user was recently inspired by a community recipe (within 90 minutes)
    const lastViewed = localStorage.getItem('community.lastViewedRecipe.v1');
    if (lastViewed) {
      try {
        const ref = JSON.parse(lastViewed) as { postId: string; title: string; authorName: string; timestamp: number };
        if (Date.now() - ref.timestamp < 90 * 60 * 1000) {
          setPendingInspirationRef(ref);
        }
      } catch {}
    }
  };

  const openScanTab = (mode: 'photo' | 'barcode') => {
    window.sessionStorage.setItem(SCAN_TARGET_DATE_KEY_STORAGE_KEY, selectedDateKey);
    window.dispatchEvent(new CustomEvent('kalorifit:navigate', { detail: { tab: 'scan' } }));
    setScanHint(mode === 'photo' ? 'Aapner skann for bilde-logging.' : 'Aapner skann for strekkode.');
  };

  const removeFoodFromMeal = (mealId: MealId, entryId: string) => {
    if (isPastSelectedDay) {
      setScanHint(t('home.dayLocked'));
      return;
    }
    const previousDay = cloneDayLog(dayLog);
    const removedEntry = dayLog.meals[mealId].find((item) => item.id === entryId);
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      meals: {
        ...current.meals,
        [mealId]: current.meals[mealId].filter((item) => item.id !== entryId),
      },
    }));
    if (removedEntry) {
      setUndoAction({
        label: `${removedEntry.name} fjernet`,
        undo: () => setDayLog(selectedDateKey, previousDay),
      });
    }
    reward();
  };

  const openFoodEdit = (mealId: MealId, entry: FoodEntry) => {
    setEditingFood({
      mealId,
      entryId: entry.id,
      name: entry.name,
      kcal: String(entry.kcal),
      protein: String(entry.protein),
      carbs: String(entry.carbs),
      fat: String(entry.fat),
    });
  };

  const saveFoodEdit = () => {
    if (!editingFood) return;
    if (isPastSelectedDay) {
      setScanHint(t('home.dayLocked'));
      return;
    }
    const parsed = {
      kcal: Number(editingFood.kcal.replace(',', '.')),
      protein: Number(editingFood.protein.replace(',', '.')),
      carbs: Number(editingFood.carbs.replace(',', '.')),
      fat: Number(editingFood.fat.replace(',', '.')),
    };
    if (!editingFood.name.trim()) {
      setScanHint('Navn mangler.');
      return;
    }
    if ([parsed.kcal, parsed.protein, parsed.carbs, parsed.fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setScanHint('Bruk gyldige tall (0+).');
      return;
    }

    const previousDay = cloneDayLog(dayLog);
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      meals: {
        ...current.meals,
        [editingFood.mealId]: current.meals[editingFood.mealId].map((item) =>
          item.id === editingFood.entryId
            ? {
                ...item,
                name: editingFood.name.trim(),
                kcal: Math.round(parsed.kcal),
                protein: Math.round(parsed.protein),
                carbs: Math.round(parsed.carbs),
                fat: Math.round(parsed.fat),
              }
            : item,
        ),
      },
    }));

    setUndoAction({
      label: 'Matpost oppdatert',
      undo: () => setDayLog(selectedDateKey, previousDay),
    });
    setEditingFood(null);
    reward();
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
    triggerTrainingFlex();
    reward();
  };

  const addWater = (ml: number, actionId = 'water:250') => {
    const beforeMl = hydrationMl;
    const afterMl = beforeMl + ml;
    const previousDay = cloneDayLog(dayLog);
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      waterMl: current.waterMl + ml,
    }));
    triggerWaterCupFillAnimation(beforeMl, afterMl);
    setUndoAction({
      label: `Vann +${ml} ml`,
      undo: () => setDayLog(selectedDateKey, previousDay),
    });
    recordEvent({ type: 'water', actionId });
    reward();
    // Trigger water pour animation in the header
    if (waterPourTimerRef.current !== null) window.clearTimeout(waterPourTimerRef.current);
    setWaterPourActive(true);
    waterPourTimerRef.current = window.setTimeout(() => setWaterPourActive(false), 2200);
  };

  const removeWater = (ml: number) => {
    const previousDay = cloneDayLog(dayLog);
    updateDayLog(selectedDateKey, (current) => ({
      ...current,
      waterMl: Math.max(0, current.waterMl - ml),
    }));
    setUndoAction({
      label: `Vann -${ml} ml`,
      undo: () => setDayLog(selectedDateKey, previousDay),
    });
  };

  const logWeight = (kg: number) => {
    if (!Number.isFinite(kg) || kg <= 0) return;
    const entry = { date: selectedDateKey, weightKg: kg };
    setProfilePrefs((prev) => ({
      ...prev,
      weightKg: kg,
      bmiHistory: [entry, ...(Array.isArray(prev.bmiHistory) ? prev.bmiHistory : [])].filter(
        (e, i, arr) => arr.findIndex((x) => x.date === e.date) === i
      ).slice(0, 20),
    }));
    setShowWeightModal(false);
    setWeightInput('');
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

  const getPreviousDateWithMeal = (mealId: MealId) => {
    const keys = Object.keys(logsByDate)
      .filter((key) => key < selectedDateKey && logsByDate[key].meals[mealId].length > 0)
      .sort();
    return keys.length > 0 ? keys[keys.length - 1] : null;
  };

  const getLastMondayKey = () => {
    const keys = Object.keys(logsByDate)
      .filter((key) => {
        if (key >= selectedDateKey) return false;
        const date = new Date(`${key}T00:00:00`);
        return date.getDay() === 1;
      })
      .sort();
    return keys.length > 0 ? keys[keys.length - 1] : null;
  };

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
      setScanHint(t('home.dayLocked'));
      return;
    }
    setShowWorkoutModal(true);
  };

  const saveWorkoutSession = () => {
    const duration = Number(workoutDurationMin);
    const calories = Number(workoutCalories);
    if (!Number.isFinite(duration) || duration <= 0) {
      setScanHint('Legg inn gyldig varighet i minutter.');
      return;
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      setScanHint('Legg inn gyldige kalorier for treningsøkten.');
      return;
    }

    const exerciseName =
      workoutExerciseName.trim() ||
      ({ Run: 'Løping', Ride: 'Sykling', Walk: 'Gåtur', Strength: 'Styrke', HIIT: 'HIIT', Other: 'Annet' }[workoutType]);

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
      setScanHint(t('home.dayLocked'));
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
    setExpandedMeals((prev) => ({ ...prev, [mealId]: !prev[mealId] }));
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

  const dateLabel = isTodaySelected ? `I dag, ${fullDateFormat.format(selectedDate)}` : fullDateFormat.format(selectedDate);
  const timeGreeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return t('home.greeting.morning');
    if (h >= 12 && h < 18) return t('home.greeting.afternoon');
    return t('home.greeting.evening');
  }, [t]);
  const _coachMessage =
    consumed === 0
      ? 'Start dagen med et måltid for å bygge streak.'
      : caloriesRemaining > 0
      ? `Du er ${caloriesRemaining} kcal under malet i dag.`
      : `Du har overstiget malet med ${Math.abs(caloriesRemaining)} kcal.`;
  void _coachMessage;

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

  const toggleSection = (id: string) =>
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedSections((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    setExpandedSections((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="screen relative pb-32 overflow-x-hidden">
      {createPortal(
        showSidebar ? (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center">
          <button
            type="button"
            aria-label="Lukk meny"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setShowSidebar(false)}
          />
          <div className="relative w-full max-w-[430px] bg-zinc-950 rounded-t-3xl shadow-2xl border-t border-white/[0.07] max-h-[88dvh] flex flex-col overflow-hidden">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                {sidebarView !== 'menu' && (
                  <button
                    type="button"
                    onClick={() => setSidebarView('menu')}
                    className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center mr-1"
                  >
                    <ChevronLeft className="w-4 h-4 text-white/70" />
                  </button>
                )}
                <h3 className="text-base font-bold text-white/90">
                  {sidebarView === 'menu' ? t('home.sidebar.menu') : sidebarView === 'logg' ? t('home.sidebar.log') : sidebarView === 'goals' ? t('home.sidebar.goals') : t('home.sidebar.journey')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {sidebarView === 'menu' && (
                  <button
                    type="button"
                    onClick={() => { window.dispatchEvent(new CustomEvent('kalorifit:navigate', { detail: { tab: 'profile' } })); setShowSidebar(false); }}
                    className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center"
                    title="Innstillinger"
                  >
                    <Settings className="w-4 h-4 text-white/50" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowSidebar(false)}
                  className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>
            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 pt-4 pb-10 space-y-3">
              {sidebarView === 'menu' && (
                <>
                  {/* Today at a glance */}
                  <div className="rounded-2xl bg-orange-500/[0.12] border border-orange-500/20 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-3">I dag</p>
                    <div className="grid grid-cols-4 gap-1.5 text-center mb-3">
                      <div>
                        <p className="text-base font-bold text-white/90 tabular-nums">{consumed}</p>
                        <p className="text-[9px] text-white/40 mt-0.5">kcal</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-emerald-400">{Math.round(waterProgress * 100)}%</p>
                        <p className="text-[9px] text-white/40 mt-0.5">vann</p>
                        <div className="flex gap-1 mt-1.5 justify-center">
                          <button
                            type="button"
                            onClick={() => addWater(250, 'water:250:menu')}
                            disabled={isPastSelectedDay}
                            className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/15 rounded-md px-1.5 py-0.5 disabled:opacity-40 active:bg-emerald-500/25 transition-colors"
                          >+250</button>
                          <button
                            type="button"
                            onClick={() => addWater(500, 'water:500:menu')}
                            disabled={isPastSelectedDay}
                            className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/15 rounded-md px-1.5 py-0.5 disabled:opacity-40 active:bg-emerald-500/25 transition-colors"
                          >+500</button>
                        </div>
                      </div>
                      <div>
                        <p className="text-base font-bold text-orange-300">{discipline.score}</p>
                        <p className="text-[9px] text-white/40 mt-0.5">disiplin</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-amber-400 flex items-center justify-center gap-0.5">
                          <span>🔥</span><span>{streak}</span>
                        </p>
                        <p className="text-[9px] text-white/40 mt-0.5">dager</p>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.round(progressRatio * 100))}%` }}
                      />
                    </div>
                    {(() => {
                      const pm = smartDietPlan.macros;
                      const pt = pm?.proteinG ?? 120;
                      const ct = pm?.carbsG ?? 200;
                      const ftt = pm?.fatG ?? 70;
                      const bars = [
                        { label: 'Protein', val: Math.round(protein), target: pt, color: 'bg-blue-400' },
                        { label: 'Karbo', val: Math.round(carbs), target: ct, color: 'bg-orange-400' },
                        { label: 'Fett', val: Math.round(fat), target: ftt, color: 'bg-purple-400' },
                      ];
                      return (
                        <div className="space-y-1.5">
                          {bars.map(({ label, val, target, color }) => (
                            <div key={label}>
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[9px] text-white/40">{label}</span>
                                <span className="text-[9px] text-white/50 tabular-nums">{val}/{target}g</span>
                              </div>
                              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.round((val / target) * 100))}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <p className="text-[9px] text-white/30 mt-2">
                      {caloriesRemaining > 0 ? t('home.caloriesRemainingLabel', { kcal: Math.round(caloriesRemaining) }) : t('home.caloriesOverGoalLabel', { kcal: Math.abs(Math.round(caloriesRemaining)) })}
                    </p>
                  </div>

                  {/* Quick actions */}
                  {/* AI Skann — featured CTA */}
                  <button
                    type="button"
                    onClick={() => { window.dispatchEvent(new CustomEvent('kalorifit:navigate', { detail: { tab: 'scan' } })); setShowSidebar(false); }}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:brightness-110 transition-all"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                  >
                    <Camera className="w-5 h-5 text-white shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">AI Skann</p>
                      <p className="text-[10px] text-white/70">{t('home.scan.takePhotoHint')}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/60 shrink-0" />
                  </button>

                  {/* Quick actions */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/25 px-1 mb-2">Hurtigvalg</p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const h = new Date().getHours();
                          const meal = (h < 10 ? 'breakfast' : h < 14 ? 'lunch' : h < 19 ? 'dinner' : 'snacks') as MealId;
                          setExpandedMeals({ ...collapsedMeals, [meal]: true });
                          setRingExpanded(false);
                          setShowSidebar(false);
                        }}
                        disabled={isPastSelectedDay}
                        className="w-full flex items-center gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-3 text-left disabled:opacity-40 active:bg-orange-500/20 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                          <Plus className="w-4 h-4 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white/90">Legg til mat</p>
                          <p className="text-[10px] text-white/35">Søk, skann eller velg</p>
                        </div>
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { handleQuickAdd('repeat-last'); }}
                          disabled={isPastSelectedDay || !lastLoggedFood}
                          className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 text-left disabled:opacity-40 active:bg-white/[0.09] transition-colors"
                        >
                          <RefreshCw className="w-4 h-4 text-violet-400 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-white/90">{t('home.scan.repeatLast')}</p>
                            <p className="text-[10px] text-white/35 truncate max-w-[80px]">{lastLoggedFood?.name ?? '–'}</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleQuickAdd('repeat-day-yesterday'); setShowSidebar(false); }}
                          disabled={isPastSelectedDay}
                          className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 text-left disabled:opacity-40 active:bg-white/[0.09] transition-colors"
                        >
                          <RefreshCw className="w-4 h-4 text-blue-400 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-white/90">{t('home.scan.repeatYesterday')}</p>
                            <p className="text-[10px] text-white/35">Kopier måltider</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => { window.dispatchEvent(new CustomEvent('kalorifit:navigate', { detail: { tab: 'meals' } })); setShowSidebar(false); }}
                          className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 text-left active:bg-white/[0.09] transition-colors"
                        >
                          <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-white/90">Oppskrifter</p>
                            <p className="text-[10px] text-white/35">Finn måltider</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section navigators */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/25 px-1 mb-2">Oversikt</p>
                    <div className="space-y-1.5">
                      {([
                        { view: 'logg' as const, icon: BookOpen, color: 'text-blue-400 bg-blue-500/15', label: t('home.sidebar.log'), sub: t('home.sidebar.logSub') },
                        { view: 'goals' as const, icon: BarChart2, color: 'text-orange-400 bg-orange-500/15', label: t('home.sidebar.goals'), sub: t('home.sidebar.goalsSub') },
                        { view: 'journey' as const, icon: Flame, color: 'text-emerald-400 bg-emerald-500/15', label: t('home.sidebar.journey'), sub: t('home.sidebar.journeySub') },
                      ]).map(({ view, icon: Icon, color, label, sub }) => (
                        <button
                          key={view}
                          type="button"
                          onClick={() => setSidebarView(view)}
                          className="w-full text-left flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 active:bg-white/[0.09] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white/90">{label}</p>
                              <p className="text-[11px] text-white/35">{sub}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { setShowSidebar(false); setShowNutrientModal(true); }}
                        className="w-full text-left flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-3 active:bg-white/[0.09] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-teal-400 bg-teal-500/15">
                            <Microscope className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white/90">Mikronæring</p>
                            <p className="text-[11px] text-white/35">Omega-3, vitaminer, mineraler</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {sidebarView === 'logg' && (
                <div className="space-y-3">
                  {historicalMealLog.length === 0 ? (
                    <p className="text-xs text-white/40 text-center py-4">Ingen historisk matlogg enda.</p>
                  ) : (
                    historicalMealLog.map((day) => (
                      <div key={day.dateKey} className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-white/90">
                            {formatDateKey(day.dateKey)}
                          </p>
                          <p className="text-[11px] text-white/35">
                            {Math.round(day.totalKcal)} kcal · {Math.round(day.totalProtein)}g protein
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {day.mealSections.map(([mealId, foods]) => (
                            <div key={`${day.dateKey}-${mealId}`} className="rounded-xl bg-white/[0.04] border border-white/[0.05] p-2">
                              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">{mealLabelById[mealId as MealId] ?? mealId}</p>
                              <div className="space-y-0.5">
                                {foods.map((food) => (
                                  <p key={food.id} className="text-xs text-white/70">{food.name} <span className="text-white/35">· {Math.round(food.kcal)} kcal</span></p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {sidebarView === 'goals' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'BMR', value: `${smartDietPlan.bmr} kcal` },
                      { label: 'TDEE', value: `${smartDietPlan.tdee} kcal` },
                      { label: 'Dagsmal', value: `${smartDietPlan.optimizedTargetKcal} kcal` },
                      { label: 'Justering', value: `${smartDietPlan.weeklyAdjustmentKcal >= 0 ? '+' : ''}${smartDietPlan.weeklyAdjustmentKcal} kcal` },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-3 text-center">
                        <p className="text-base font-bold text-orange-300">{value}</p>
                        <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
                      </div>
                    ))}
                    {dayLog.trainingKcal > 0 && (
                      <div className="col-span-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                        <p className="text-base font-bold text-emerald-400">+{dayLog.trainingKcal} kcal → {netGoal} kcal</p>
                        <p className="text-[11px] text-white/40 mt-0.5">Treningsbonus inkludert i nettomål</p>
                      </div>
                    )}
                  </div>
                  {smartDietPlan.macros && (
                    <div className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-2">Makromål</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: 'Protein', value: `${smartDietPlan.macros.proteinG}g`, color: 'text-violet-300' },
                          { label: 'Karbo', value: `${smartDietPlan.macros.carbsG}g`, color: 'text-emerald-300' },
                          { label: 'Fett', value: `${smartDietPlan.macros.fatG}g`, color: 'text-amber-300' },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <p className={`text-base font-bold ${color}`}>{value}</p>
                            <p className="text-[11px] text-white/40">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {smartDietPlan.adjustmentReason && (
                    <p className="text-xs text-white/50 px-1">{localizeAdjustmentReason(smartDietPlan.adjustmentReason, t)}</p>
                  )}
                  {smartDietPlan.projectedProgressText && (
                    <div className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-3 text-center">
                      <p className="text-xs font-semibold text-emerald-400">{localizeProjectionText(smartDietPlan.projectedProgressText)}</p>
                    </div>
                  )}
                </div>
              )}

              {sidebarView === 'journey' && (
                <div>
                  {journeyWeightSeries.length === 0 ? (
                    <p className="text-xs text-white/40 text-center py-4">Ingen vektdata enda. Logg en måling for graf.</p>
                  ) : (
                    <div className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-4">
                      <p className="text-xs font-semibold text-white/60 mb-3">Vekttrend (kg)</p>
                      <svg viewBox="0 0 420 170" className="w-full h-36">
                        {(() => {
                          const values = journeyWeightSeries.map((p) => p.value);
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          const range = Math.max(1, max - min);
                          const coords = journeyWeightSeries.map((p, i) => ({
                            x: journeyWeightSeries.length === 1 ? 210 : (i / (journeyWeightSeries.length - 1)) * 390 + 15,
                            y: 145 - ((p.value - min) / range) * 120,
                            value: p.value,
                            date: p.date,
                          }));
                          return (
                            <>
                              <line x1="15" y1="145" x2="405" y2="145" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                              <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={coords.map((c) => `${c.x},${c.y}`).join(' ')} />
                              {coords.map((c) => (
                                <circle key={`${c.date}-${c.value}`} cx={c.x} cy={c.y} r="3.5" fill="#f97316" />
                              ))}
                              <text x="15" y="164" fontSize="10" fill="rgba(255,255,255,0.3)">{formatDateKey(coords[0]?.date ?? todayKey)}</text>
                              <text x="340" y="164" fontSize="10" fill="rgba(255,255,255,0.3)">{formatDateKey(coords[coords.length - 1]?.date ?? todayKey)}</text>
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        ) : null,
        document.body
      )}

      {/* ===== MORGENBREV — revealed next morning ===== */}
      {showMorgenbrev && morgenbrev && (
        <button
          type="button"
          onClick={() => setMorgenbrev((prev) => prev ? { ...prev, readDateKey: todayKey } : null)}
          className="mx-4 mt-3 mb-0 text-left rounded-2xl w-[calc(100%-32px)] morgenbrev-card"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="text-2xl shrink-0 mt-0.5">✉️</span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">Morgenbrev</p>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-white/90 leading-snug">
                I går: {kcalNumberFormat.format(morgenbrev.kcal)} kcal · {morgenbrev.protein}g protein
              </p>
              <p className="text-[12px] text-slate-500 dark:text-white/50 mt-1 leading-snug">
                Klarer du å slå det i dag? Dagen er din.
              </p>
            </div>
          </div>
        </button>
      )}

      {/* ===== COMPACT TOP BAR ===== */}
      <div className={`screen-header${identityHeaderModifier ? ` ${identityHeaderModifier}` : ''}${headerMomentFlash ? ' screen-header-moment-flash' : ''}`}>
        {/* Persistent header bottom wave */}
        <span className="screen-header-wave" aria-hidden="true" />
        {waterPourActive && (
          <div className="water-pour-container" aria-hidden="true">
            <div className="water-pour-wave" />
            {[9, 21, 34, 48, 61, 74, 88].map((left, i) => (
              <span
                key={left}
                className="water-drop"
                style={{ left: `${left}%`, animationDelay: `${i * 0.06}s` }}
              />
            ))}
          </div>
        )}
        <div className="screen-header-bubbles" aria-hidden="true">
          {headerBubbleSpecs.map(({ Icon, left, delay, duration, size, threshold }, index) => {
            const intensity = Math.max(0, Math.min((headerActivityScore - threshold) / (1 - threshold), 1));
            if (intensity <= 0.02) return null;
            return (
              <span
                key={`${left}-${index}`}
                className="screen-header-bubble"
                style={{
                  left,
                  animationDelay: delay,
                  animationDuration: `${(parseFloat(duration) * identityBubbleDurationFactor).toFixed(2)}s`,
                  opacity: 0.1 + intensity * 0.34,
                  transform: `translate3d(0, ${18 - intensity * 10}px, 0) scale(${0.78 + intensity * 0.42})`,
                }}
              >
                <Icon size={size} strokeWidth={2.1} />
              </span>
            );
          })}
        </div>

        <div className="screen-header-content">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setShowSidebar((prev) => {
                    const next = !prev;
                    if (next) setSidebarView('menu');
                    return next;
                  });
                }}
                className="h-9 w-9 shrink-0 rounded-2xl bg-slate-100/80 dark:bg-white/[0.07] flex items-center justify-center text-slate-600 dark:text-white/70 transition-colors hover:bg-slate-200/80 dark:hover:bg-white/[0.12]"
                title="Åpne meny"
              >
                {showSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-slate-900 dark:text-white/95 leading-tight">{timeGreeting}</p>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <span className="text-[11px] text-slate-400 dark:text-white/35 leading-tight truncate">{identityCaption}</span>
                  <span className="text-slate-300 dark:text-white/15 text-[10px] shrink-0">·</span>
                  <span className="flex items-center gap-0.5 text-[11px] text-slate-500 dark:text-white/40 font-medium shrink-0">
                    <Flame className={`h-3 w-3 ${flameAtRisk ? 'flame-at-risk' : 'text-orange-400'}`} />
                    {streak > 0 ? `${streak}d` : 'Start!'}
                    {todayFrozen && <span className="text-sky-400 ml-0.5">❄</span>}
                  </span>
                  {showLossCounter && (
                    <span className="flex items-center gap-0.5 text-[11px] font-bold text-red-500 dark:text-red-400 shrink-0 animate-pulse">
                      –{xpAtRisk} XP
                    </span>
                  )}
                  {isTodaySelected && flameAtRisk && !todayFrozen && streakFreeze.available > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setStreakFreeze((prev) => ({
                          ...prev,
                          available: prev.available - 1,
                          frozenDays: [...prev.frozenDays, todayKey],
                        }));
                      }}
                      className="flex items-center gap-0.5 text-[10px] font-semibold text-sky-500 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 rounded-full px-1.5 py-0.5 shrink-0"
                      title="Bruk streak freeze"
                    >
                      ❄ Frys
                    </button>
                  )}
                  {isTodaySelected && discipline.score > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-white/15 text-[10px] shrink-0">·</span>
                      <button
                        type="button"
                        onClick={() => { setShowSidebar(true); setSidebarView('menu'); }}
                        className={`flex items-center gap-0.5 text-[11px] font-semibold shrink-0 rounded-full px-1.5 py-0.5 transition-colors ${
                          discipline.score >= 80 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' :
                          discipline.score >= 50 ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10' :
                          'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                        }`}
                        title="Disiplinpoeng"
                      >
                        {discipline.score} / 100
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {activeHeroMessage && (
          <div className="hero-message-shell mt-3">
            <div className={`hero-message-card ${heroMessageVisible ? 'hero-message-card-visible' : 'hero-message-card-hidden'}`}>
              <p className="hero-message-text">{activeHeroMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* ===== DAILY COACH CARD ===== */}
      {isTodaySelected && (
        <div style={{ padding: '0 16px 0 16px' }}>
          <CoachCard
            message={coachMessage}
            lang={language}
            onAction={(priority) => {
              if (priority === 'protein' || priority === 'calories_under' || priority === 'logging') {
                window.dispatchEvent(new CustomEvent('kalorifit:navigate', { detail: { tab: 'scan' } }));
              } else if (priority === 'water') {
                setShowWorkoutModal(false);
                // Scroll to water section — trigger by setting focus hint
                document.getElementById('water-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (priority === 'workout') {
                setShowWorkoutModal(true);
              }
            }}
          />
        </div>
      )}

      {/* ===== CALORIE RING HERO ===== */}
      <div className={`calorie-hero${identityHeaderModifier ? ` calorie-hero-${identityMode.replace('_', '-')}` : ''}`}>
        {/* Identity orbs — soft ambient particles that float around the card */}
        <span className="hero-orb hero-orb-1" aria-hidden="true" />
        <span className="hero-orb hero-orb-2" aria-hidden="true" />
        <span className="hero-orb hero-orb-3" aria-hidden="true" />
        {/* Ambient shimmer wave */}
        <span className="hero-shimmer" aria-hidden="true" />
        {/* Rain effect when water is logged */}
        {waterPourActive && (
          <div className="hero-rain-container" aria-hidden="true">
            <div className="hero-rain-wave" />
            {[4,10,17,24,30,37,44,51,57,63,70,76,82,88,94].map((left, i) => (
              <span
                key={left}
                className="hero-rain-drop"
                style={{
                  left: `${left}%`,
                  animationDelay: `${i * 0.04}s`,
                  height: `${10 + (i % 3) * 4}px`,
                  opacity: 0.6 + (i % 4) * 0.1,
                }}
              />
            ))}
          </div>
        )}
        <div className="ring-proximity-wrapper">
          {goalProximity !== 'cold' && (
            <>
              <span className={`ring-aura ring-aura-1 ring-aura-${goalProximity}`} aria-hidden="true" />
              <span className={`ring-aura ring-aura-2 ring-aura-${goalProximity}`} aria-hidden="true" />
              {(goalProximity === 'burning' || goalProximity === 'legendary') && (
                <span className={`ring-aura ring-aura-3 ring-aura-${goalProximity}`} aria-hidden="true" />
              )}
            </>
          )}

        <button
          type="button"
          onClick={onRingTap}
          className={`progress-circle ${ringAnimating ? 'progress-circle-animating' : ''} ${ringPumping ? 'progress-circle-pumping' : ''} ${legendaryRing ? 'progress-circle-perfect' : inCalorieRange ? 'progress-circle-green' : ''}`}
          title="Vis kaloridetaljer"
        >
          <svg width="220" height="220" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ringColor} />
                <stop offset="100%" stopColor={ringColor} stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="ringGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="ringGreenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="50%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#16a34a" />
              </linearGradient>
              <filter id="ringGlow">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="ringGoldGlow">
                <feGaussianBlur stdDeviation="6" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="ringGreenGlow">
                <feGaussianBlur stdDeviation="5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <circle className="progress-circle-bg" cx="100" cy="100" r={RING_RADIUS} />
            <circle
              cx="100" cy="100" r={RING_RADIUS}
              fill="none"
              stroke={legendaryRing ? 'url(#ringGoldGrad)' : inCalorieRange ? 'url(#ringGreenGrad)' : 'url(#ringGrad)'}
              strokeWidth={legendaryRing ? 11 : inCalorieRange ? 10.5 : 10}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={animatedStrokeDashoffset}
              filter={legendaryRing ? 'url(#ringGoldGlow)' : inCalorieRange ? 'url(#ringGreenGlow)' : 'url(#ringGlow)'}
              className="progress-circle-meter"
              style={{ transition: 'stroke 500ms ease, stroke-dashoffset 650ms cubic-bezier(0.34, 1.56, 0.64, 1), stroke-width 300ms ease' }}
            />
          </svg>
          <div className="progress-text">
            <p className="progress-value">
              <RollingNumber value={animatedProgressValue} format={kcalNumberFormat.format.bind(kcalNumberFormat)} />
            </p>
            <p className="progress-label">{progressText}</p>
            <p className="progress-detail">{progressDetailText}</p>
          </div>
        </button>

        </div>

        {/* Stats row */}
        <div className="hero-stats-row">
          <div className={`hero-stat-pill hero-stat-pill-goal text-center${flashedStat === 'goal' ? ' hero-stat-flash' : ''}`}>
            <p className="hero-stat-value text-slate-900 dark:text-white">{kcalNumberFormat.format(animatedGoal)}</p>
            <p className="hero-stat-label">Mål</p>
          </div>
          <div className="hero-stat-divider" />
          <div className={`hero-stat-pill hero-stat-pill-eaten text-center${flashedStat === 'consumed' ? ' hero-stat-flash' : ''}`}>
            <p className="hero-stat-value text-orange-500 dark:text-orange-300">
              <RollingNumber value={animatedConsumed} format={kcalNumberFormat.format.bind(kcalNumberFormat)} />
            </p>
            <p className="hero-stat-label">{t('home.stats.consumed')}</p>
          </div>
          <div className="hero-stat-divider" />
          <div className={`hero-stat-pill hero-stat-pill-training text-center${flashedStat === 'training' ? ' hero-stat-flash' : ''}`}>
            <p className="hero-stat-value text-emerald-500 dark:text-emerald-300">+{kcalNumberFormat.format(animatedTraining)}</p>
            <p className="hero-stat-label">{t('home.stats.training')}</p>
          </div>
        </div>

        {/* Calorie pacing indicator */}
        {isTodaySelected && (() => {
          const now = new Date();
          const dayMinutes = now.getHours() * 60 + now.getMinutes();
          const dayPct = Math.round((dayMinutes / 1440) * 100);
          const kcalPct = Math.round(progressRatio * 100);
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          const isPacing = kcalPct <= dayPct + 10;
          return (
            <p className={`text-[11px] mt-3 text-center leading-snug ${isPacing ? 'text-slate-400 dark:text-white/30' : 'text-orange-500 dark:text-orange-400'}`}>
              {timeStr} — {kcalPct}% av kalorier brukt på {dayPct}% av dagen
            </p>
          );
        })()}

        {/* Finjuster mål — inline calorie goal tweak */}
        {isTodaySelected && (
          <div className="mt-3 flex flex-col items-center gap-2">
            {showCalorieTweak ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/[0.06] rounded-2xl px-3 py-2">
                <button
                  type="button"
                  onClick={() => setCalorieTweakByDate((prev) => ({ ...prev, [selectedDateKey]: (prev[selectedDateKey] ?? 0) - 50 }))}
                  className="w-8 h-8 rounded-full bg-white dark:bg-white/10 shadow-sm text-slate-700 dark:text-white/80 text-lg font-bold flex items-center justify-center active:scale-95 transition-transform"
                >−</button>
                <div className="flex flex-col items-center min-w-[80px]">
                  <p className="text-[13px] font-bold text-slate-800 dark:text-white/90 leading-none">
                    {kcalNumberFormat.format(netGoal)} kcal
                  </p>
                  {calorieTweak !== 0 && (
                    <p className={`text-[10px] font-semibold mt-0.5 ${calorieTweak > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                      {calorieTweak > 0 ? '+' : ''}{calorieTweak} justering
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCalorieTweakByDate((prev) => ({ ...prev, [selectedDateKey]: (prev[selectedDateKey] ?? 0) + 50 }))}
                  className="w-8 h-8 rounded-full bg-white dark:bg-white/10 shadow-sm text-slate-700 dark:text-white/80 text-lg font-bold flex items-center justify-center active:scale-95 transition-transform"
                >+</button>
                {calorieTweak !== 0 && (
                  <button
                    type="button"
                    onClick={() => setCalorieTweakByDate((prev) => { const n = { ...prev }; delete n[selectedDateKey]; return n; })}
                    className="ml-1 text-[10px] text-slate-400 dark:text-white/30 underline"
                  >nullstill</button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCalorieTweak(true)}
                className="text-[11px] text-slate-400 dark:text-white/30 hover:text-slate-500 dark:hover:text-white/50 transition-colors flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Finjuster mål
              </button>
            )}
          </div>
        )}

        {/* Macro row when expanded — tap to open nutrient detail */}
        {ringExpanded && (
          <button
            type="button"
            onClick={() => setShowNutrientModal(true)}
            className="mt-5 w-full grid grid-cols-4 gap-2 group"
            title="Se næringsstoffoversikt"
          >
            {[
              { label: 'Protein', value: animatedProtein, unit: 'g', target: smartDietPlan.macros?.proteinG ?? 120, color: '#3b82f6' },
              { label: 'Karbo', value: Math.round(carbs), unit: 'g', target: smartDietPlan.macros?.carbsG ?? 200, color: '#f97316' },
              { label: 'Fett', value: Math.round(fat), unit: 'g', target: smartDietPlan.macros?.fatG ?? 70, color: '#a855f7' },
              { label: 'Snitt/uke', value: weeklyAverage, unit: '', target: optimizedTargetKcal, color: '#22c55e' },
            ].map(({ label, value, unit, target, color }) => {
              const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
              return (
                <div key={label} className="bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] rounded-xl p-3 text-center relative overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-xl opacity-30 transition-all duration-700"
                    style={{ height: `${pct}%`, background: color }}
                  />
                  <p className="relative text-lg font-bold text-slate-900 dark:text-white">
                    <RollingNumber value={value} format={(n) => String(Math.round(n))} />
                    <span className="text-xs text-slate-500 dark:text-white/40 ml-0.5">{unit}</span>
                  </p>
                  <p className="relative text-[10px] text-slate-500 dark:text-white/35 mt-0.5">{label}</p>
                </div>
              );
            })}
            <p className="col-span-4 text-[10px] text-slate-400 dark:text-white/25 flex items-center justify-center gap-1 mt-0.5">
              Se fullstendig næringsoversikt <ChevronDown className="w-3 h-3" />
            </p>
          </button>
        )}
      </div>

      {/* ===== #8 — NESTEN PERFEKT DAG ===== */}
      {nearPerfect && (
        <div className="mx-4 mb-0 rounded-2xl overflow-hidden near-perfect-banner">
          <div className="flex items-center gap-3 p-4">
            <div className="near-perfect-ring-icon shrink-0">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(251,191,36,0.15)" strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="16"
                  fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * 0.055 + 2 * Math.PI * 16 * (1 / 3)}`}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-amber-700 dark:text-amber-300 leading-tight">Du er 1 steg unna en perfekt dag</p>
              <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 mt-0.5 leading-tight">Logger du <span className="font-semibold">{missingGoalLabel}</span> nå, lukker ringen seg.</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== #22 — TOMORROW FORECAST ===== */}
      {showTomorrowForecast && (
        <button
          type="button"
          onClick={() => setTomorrowForecastDismissed(todayKey)}
          className="mx-4 mb-0 text-left rounded-2xl w-[calc(100%-32px)] tomorrow-forecast-card"
        >
          <div className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 dark:text-white/30 uppercase tracking-widest mb-1">I morgen</p>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-white/90 leading-snug">
                Du starter på 0. Klarer du å slå i dag?
              </p>
              <p className="text-[11px] text-slate-400 dark:text-white/35 mt-1">
                I dag: {kcalNumberFormat.format(Math.round(consumed))} kcal · {Math.round(protein)}g protein
              </p>
            </div>
            <span className="text-2xl shrink-0 ml-3">🌅</span>
          </div>
        </button>
      )}

      {/* ===== SUNDAY WEEKLY TEASER ===== */}
      {isTodaySelected && today.getDay() === 0 && new Date().getHours() >= 18 && (() => {
        const loggedDays = weeklyData.filter((d) => d.consumed > 0).length;
        const bestDay = weeklyData
          .filter((d) => d.consumed > 0)
          .reduce(
            (b, d) => (d.consumed > b.consumed ? d : b),
            { label: '—', consumed: 0 } as (typeof weeklyData)[0],
          );
        return (
          <button
            type="button"
            onClick={() => { setShowSidebar(true); setSidebarView('logg'); }}
            className="mx-4 mb-0 text-left rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-500/[0.09] dark:to-violet-500/[0.09] border border-indigo-100 dark:border-indigo-400/20 p-4 w-[calc(100%-32px)]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Ukesoppsummering</p>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-400 dark:text-indigo-500 -rotate-90" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white/85 leading-snug">
              {loggedDays}/7 dager logget · Snitt {weeklyAverage} kcal
              {bestDay.consumed > 0 ? ` · Best ${bestDay.label}` : ''}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1">Trykk for full uksoversikt</p>
          </button>
        );
      })()}

      {/* ===== WEEKLY BAR CHART ===== */}
      <div className="weekly-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] text-slate-600 dark:text-white/40 font-semibold tracking-wider uppercase">Denne uken</p>
          <p className="text-[11px] text-slate-500 dark:text-white/30">Snitt: {weeklyAverage} kcal</p>
        </div>
        <div className="flex items-end justify-between gap-2 h-24">
          {weeklyData.map((day, barIndex) => {
            const dayTarget = Math.max(1, optimizedTargetKcal + (logsByDate[day.key]?.trainingKcal ?? 0));
            const ratioRaw = day.consumed / dayTarget;
            const ratio = Math.max(0, Math.min(ratioRaw, 1));
            const fillHeight = day.consumed > 0 ? Math.max(6, Math.round(ratio * 100)) : 4;
            const barColor = getWeeklyBarColor(ratio);
            return (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full max-w-[14px] h-20 rounded-full bg-slate-200/70 dark:bg-white/[0.04] flex flex-col justify-end overflow-hidden">
                  <div
                    className="w-full rounded-full weekly-bar-fill transition-all duration-700 ease-out"
                    style={{
                      height: `${fillHeight}%`,
                      backgroundColor: day.consumed > 0 ? barColor : 'rgba(148,163,184,0.4)',
                      boxShadow: day.consumed > 0 ? `0 0 8px ${barColor}30` : 'none',
                      animationDelay: `${barIndex * 60}ms`,
                    }}
                  />
                </div>
                <span className={`text-[10px] font-medium ${
                  day.isSelected
                    ? 'text-orange-500 dark:text-orange-400'
                    : day.isToday
                      ? 'text-slate-600 dark:text-white/60'
                      : 'text-slate-400 dark:text-white/25'
                }`}>
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="date-nav-row"
        onTouchStart={onDateTouchStart}
        onTouchEnd={onDateTouchEnd}
      >
        <button 
          type="button" 
          className="date-nav-button" 
          onClick={goPreviousDay} 
          title="Forrige dag"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-white/50" />
        </button>
        <button
          key={selectedDateKey}
          type="button"
          className="date-nav-chip date-nav-chip-animate flex items-center gap-2"
          onClick={() => { setHistoryViewDate(today); setHistorySelectedKey(null); setShowActivityHistory(true); }}
          title="Se aktivitetshistorikk"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-white/40 shrink-0" />
          <p className="text-slate-800 dark:text-white/80 font-medium text-center min-w-0 flex-1 text-sm">{dateLabel}</p>
        </button>
        <button 
          type="button" 
          className="date-nav-button" 
          onClick={goNextDay} 
          title="Neste dag"
        >
          <ChevronRight className="w-4 h-4 text-slate-500 dark:text-white/50" />
        </button>
      </div>

      {/* Quick log actions */}
      <div className="card card-elevated">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => openScanTab('photo')}
            className="btn-primary text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={isPastSelectedDay}
          >
            <Camera className="w-4 h-4" />
            {t('home.scan.takePhoto')}
          </button>
          <button
            type="button"
            onClick={() => openScanTab('barcode')}
            className="btn-secondary text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={isPastSelectedDay}
          >
            <ScanLine className="w-4 h-4" />
            {t('home.scan.barcode')}
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('repeat-last')}
            className="btn-neutral text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed flex flex-col items-center gap-0.5"
            disabled={isPastSelectedDay || !lastLoggedFood}
          >
            <span>{t('home.scan.repeatLast')}</span>
            {lastLoggedFood && (
              <span className="text-[10px] font-normal text-slate-400 dark:text-white/30 truncate max-w-full leading-tight">
                {lastLoggedFood.name} {lastLoggedFood.kcal} kcal · {lastLoggedFood.protein}g P
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('repeat-day-yesterday')}
            className="btn-neutral text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={isPastSelectedDay}
          >
            {t('home.scan.repeatYesterday')}
          </button>
        </div>
      </div>

      {/* Daily summary + log */}
      <div className="card card-elevated">
        {/* Kcal + Protein stats */}
        {isTodaySelected && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Calories */}
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Kalorier</p>
              <p className={`text-3xl font-bold leading-none ${caloriesRemaining < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white/90'}`}>
                {caloriesRemaining < 0 ? `+${Math.abs(Math.round(caloriesRemaining))}` : Math.round(caloriesRemaining)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{caloriesRemaining < 0 ? t('home.overMal') : t('home.kcalIgjen')}</p>
              <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${caloriesRemaining < 0 ? 'bg-red-400' : 'bg-orange-500'}`}
                  style={{ width: `${Math.min(progressRatio * 100, 100)}%` }}
                />
              </div>
            </div>
            {/* Protein */}
            {smartDietPlan.macros ? (
              <div className="rounded-xl bg-blue-50/60 dark:bg-blue-500/[0.07] border border-blue-100 dark:border-blue-400/[0.15] p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wider">Protein</p>
                  <p className="text-[10px] text-blue-400/70 dark:text-blue-300/40 font-medium">{Math.round(protein)} / {smartDietPlan.macros.proteinG}g</p>
                </div>
                <p className={`text-3xl font-bold leading-none ${protein >= smartDietPlan.macros.proteinG ? 'text-emerald-500' : 'text-gray-900 dark:text-white/90'}`}>
                  {protein >= smartDietPlan.macros.proteinG ? Math.round(protein) : `${Math.round(smartDietPlan.macros.proteinG - protein)}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{protein >= smartDietPlan.macros.proteinG ? t('home.stats.gReached') : t('home.stats.gRemaining')}</p>
                <div className="mt-2 h-2.5 rounded-full bg-blue-100 dark:bg-blue-500/[0.12] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${protein >= smartDietPlan.macros.proteinG ? 'bg-emerald-400' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min((protein / smartDietPlan.macros.proteinG) * 100, 100)}%`, boxShadow: protein > 0 ? '0 0 8px rgba(59,130,246,0.4)' : 'none' }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3 flex items-center justify-center">
                <p className="text-xs text-gray-400 dark:text-white/30">—</p>
              </div>
            )}
          </div>
        )}

        {/* Log header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-white/70">{t('home.foodLog.title')}</h3>
          {todaysLoggedItems.length > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-white/30">{todaysLoggedItems.length} varer</span>
          )}
        </div>

        {todaysLoggedItems.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-white/30 py-1">
            {isTodaySelected ? t('home.foodLog.emptyToday') : t('home.foodLog.empty')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {todaysLoggedItems.map(({ mealId, index, entry }, itemIndex) => (
              <div key={entry.id} className="food-log-item rounded-lg border border-slate-200 dark:border-white/[0.06] px-3 py-2" style={{ animationDelay: `${itemIndex * 40}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase text-slate-400 dark:text-white/30">{mealId === 'breakfast' ? t('home.meals.breakfast') : mealId === 'lunch' ? t('home.meals.lunch') : mealId === 'dinner' ? t('home.meals.dinner') : t('home.meals.snacks')} #{index + 1}</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white/90 truncate">{entry.name}</p>
                    <p className="text-xs text-slate-500 dark:text-white/40">{entry.kcal} kcal | P {entry.protein} | K {entry.carbs} | F {entry.fat}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openFoodEdit(mealId, entry)}
                      className="h-8 w-8 rounded-md border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40 flex items-center justify-center disabled:text-white/20 disabled:border-slate-200 dark:border-white/[0.06]"
                      title="Rediger"
                      disabled={isPastSelectedDay}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ mealId, entryId: entry.id, name: entry.name })}
                      className="h-8 w-8 rounded-md border border-red-500/20 text-red-400 flex items-center justify-center disabled:text-red-400/50 disabled:border-red-100"
                      title="Slett"
                      disabled={isPastSelectedDay}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 pb-24">
        {mealTemplates.map((meal) => {
          const items = dayLog.meals[meal.id];
          const totals = mealTotals[meal.id];
          const isExpanded = expandedMeals[meal.id];
          const MealIcon = meal.icon;
          const mealHistory = historicalMealStats[meal.id];
          const suggestedKcal = mealHistory.avgKcal > 0 ? mealHistory.avgKcal : meal.recommended;
          const groupedItems = groupFoodsByName(items);
          const previewItems = groupedItems.slice(0, 2);
          const extraPreviewCount = Math.max(groupedItems.length - previewItems.length, 0);
          const visibleItems = groupedItems.slice(0, 3);
          const hiddenItemCount = Math.max(groupedItems.length - visibleItems.length, 0);
          return (
            <div
              key={meal.id}
              className={`meal-item flex-col items-stretch${isExpanded ? ' meal-item-expanded' : ''}`}
              onTouchStart={(event) => onMealTouchStart(meal.id, event.touches[0]?.clientX ?? 0)}
              onTouchEnd={(event) => onMealTouchEnd(meal.id, event.changedTouches[0]?.clientX ?? 0)}
            >
              <button
                type="button"
                className="flex items-center justify-between"
                onClick={() => toggleMealExpanded(meal.id)}
              >
                <div className="meal-info">
                  <div key={`${meal.id}-${String(isExpanded)}`} className={`meal-icon ${mealIconToneById[meal.id]}${isExpanded ? ' meal-icon-popping' : ''}`}>
                    <MealIcon className={`w-6 h-6 ${mealIconGlyphToneById[meal.id]}`} />
                  </div>
                  <div className="text-left min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white/90">{meal.id === 'breakfast' ? t('home.meals.breakfast') : meal.id === 'lunch' ? t('home.meals.lunch') : meal.id === 'dinner' ? t('home.meals.dinner') : t('home.meals.snacks')}</h3>
                    {items.length > 0 ? (
                      <>
                        <p className="text-sm text-slate-500 dark:text-white/40">{totals.kcal} kcal</p>
                        <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5 truncate">
                          {previewItems.map((item) => `${item.name}${item.count > 1 ? ` x${item.count}` : ''}`).join(' + ')}
                          {extraPreviewCount > 0 ? ` + ${extraPreviewCount} til` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-400 dark:text-white/30">
                        {mealHistory.avgKcal > 0 ? t('home.foodLog.mealUsual', { kcal: mealHistory.avgKcal }) : t('home.foodLog.mealRecommended', { kcal: meal.recommended })}
                      </p>
                    )}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                  {/* Kcal progress bar — only when items logged */}
                  {items.length > 0 && (
                    <div className="mb-3">
                      <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${totals.kcal > meal.recommended ? 'bg-orange-400' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(100, Math.round((totals.kcal / meal.recommended) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Auto-prefill — only when nothing logged yet and we have history */}
                  {!items.length && mealHistory.avgKcal > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        addFoodToMeal(
                          meal.id,
                          {
                            id: `predictive-${meal.id}-${suggestedKcal}`,
                            name: `${t('home.foodLog.predicted')} ${meal.name}`,
                            kcal: suggestedKcal,
                            protein: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.protein)),
                            carbs: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.carbs)),
                            fat: Math.max(0, Math.round(suggestedKcal * globalMacroRatios.fat)),
                          },
                          `predictive:${meal.id}`,
                        )
                      }
                      className="mb-3 w-full text-left bg-orange-500/[0.06] border border-orange-500/15 text-orange-500 text-xs rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                      disabled={isPastSelectedDay}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-none">✨</span>
                        <span>Fyll inn vanlig mengde · ~{suggestedKcal} kcal</span>
                      </div>
                      {mealHistory.lastThree.length > 0 && (
                        <div className="flex gap-1">
                          {mealHistory.lastThree.map((k, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400">{k}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  )}

                  {/* Lagrede måltider trigger — always visible */}
                  {(() => {
                    const slotTemplates = savedMealTemplates.filter(t => t.mealId === meal.id);
                    const hasTemplates = slotTemplates.length > 0;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setSavedMealsModalMealId(meal.id);
                          setTemplatePortions({});
                        }}
                        className={`mb-3 w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${hasTemplates ? 'border-slate-200 dark:border-white/[0.06]' : 'border-dashed border-slate-200 dark:border-white/[0.06] opacity-60'}`}
                        disabled={isPastSelectedDay}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${hasTemplates ? 'bg-emerald-500/10' : 'bg-slate-100 dark:bg-white/[0.04]'}`}>
                            <Bookmark className={`w-3.5 h-3.5 ${hasTemplates ? 'text-emerald-500' : 'text-slate-400 dark:text-white/30'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-white/80">Lagrede måltider</p>
                            <p className="text-xs text-slate-400 dark:text-white/30">
                              {hasTemplates ? `${slotTemplates.length} lagret` : 'Ingen lagret ennå'}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 dark:text-white/30" />
                      </button>
                    );
                  })()}

                  {/* Logged items */}
                  {items.length > 0 && (
                    <div>
                      <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-slate-600 dark:text-white/60">P {Math.round(totals.protein)}g</span>
                        <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-slate-600 dark:text-white/60">K {Math.round(totals.carbs)}g</span>
                        <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2 py-0.5 text-slate-600 dark:text-white/60">F {Math.round(totals.fat)}g</span>
                      </div>
                      <div className="space-y-1">
                        {visibleItems.map((item) => (
                          <p key={item.name} className="text-sm text-slate-700 dark:text-white/70 flex justify-between gap-3">
                            <span className="truncate">
                              {item.name}
                              {item.count > 1 ? ` x${item.count}` : ''}
                            </span>
                            <span>{item.kcal} kcal</span>
                          </p>
                        ))}
                        {hiddenItemCount > 0 && <p className="text-xs text-slate-400 dark:text-white/30">+{hiddenItemCount} flere varer</p>}
                      </div>
                    </div>
                  )}

                  {/* Action buttons — improved hierarchy */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {/* Hurtigfoto — full width, primary */}
                    <button
                      type="button"
                      onClick={() => addFoodToMeal(meal.id, createQuickPhotoEntry(meal.id, suggestedKcal))}
                      className="col-span-2 rounded-xl bg-orange-500 text-white text-sm px-4 py-2.5 font-semibold w-full flex items-center justify-center gap-2"
                      title="Hurtigfoto"
                      disabled={isPastSelectedDay}
                    >
                      <Camera className="w-4 h-4" />
                      Hurtigfoto ({roundToNearest(suggestedKcal, 10)})
                    </button>
                    {/* Kamera + Strekkode side by side */}
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-white/40 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
                      onClick={() => setScanHint('AI food recognition blir hovedmodus her.')}
                      title="AI matgjenkjenning"
                      disabled={isPastSelectedDay}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Kamera
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-white/40 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
                      onClick={() => setScanHint(t('home.scan.barcodeHint'))}
                      title="Strekkodeskanner"
                      disabled={isPastSelectedDay}
                    >
                      <ScanLine className="w-3.5 h-3.5" />
                      {t('home.scan.barcode')}
                    </button>
                    {/* Manuell — full width ghost */}
                    <button
                      type="button"
                      className="col-span-2 rounded-xl border border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-white/40 text-xs px-3 py-2 flex items-center justify-center gap-1.5"
                      onClick={() => {
                        setManualAddMeal(meal.id);
                        setManualName('');
                        setManualKcal('');
                        setManualProtein('');
                        setManualCarbs('');
                        setManualFat('');
                      }}
                      title="Manuell logging"
                      disabled={isPastSelectedDay}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Manuell
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {savedMealsModalMealId !== null && createPortal((() => {
        const modalTemplates = savedMealTemplates.filter(t => t.mealId === savedMealsModalMealId);
        const mealLabel = savedMealsModalMealId === 'breakfast' ? 'Frokost' : savedMealsModalMealId === 'lunch' ? 'Lunsj' : savedMealsModalMealId === 'dinner' ? 'Middag' : 'Snacks';
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSavedMealsModalMealId(null)}>
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-slate-200 dark:bg-white/10" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white/90">Lagrede måltider</h2>
                  <p className="text-xs text-slate-400 dark:text-white/30">{mealLabel} · {modalTemplates.length} lagret</p>
                </div>
                <button type="button" onClick={() => setSavedMealsModalMealId(null)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-500 dark:text-white/40" />
                </button>
              </div>

              {/* Scrollable list */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                {modalTemplates.map(template => {
                  const portion = templatePortions[template.id] ?? 100;
                  const multiplier = portion / 100;
                  const templateKcal = Math.round(template.items.reduce((s, i) => s + (i.kcal ?? 0), 0) * multiplier);
                  const templateProtein = Math.round(template.items.reduce((s, i) => s + (i.protein ?? 0), 0) * multiplier);
                  const templateCarbs = Math.round(template.items.reduce((s, i) => s + (i.carbs ?? 0), 0) * multiplier);
                  const templateFat = Math.round(template.items.reduce((s, i) => s + (i.fat ?? 0), 0) * multiplier);

                  return (
                    <div key={template.id} className="rounded-2xl border border-slate-200 dark:border-white/[0.06] overflow-hidden">
                      {/* Photo placeholder */}
                      {template.imageUrl ? (
                        <img src={template.imageUrl} alt={template.name} className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/10 flex items-center justify-center">
                          <span className="text-5xl select-none">
                            {savedMealsModalMealId === 'breakfast' ? '🍳' : savedMealsModalMealId === 'lunch' ? '🥗' : savedMealsModalMealId === 'dinner' ? '🍽️' : '🍎'}
                          </span>
                        </div>
                      )}

                      {/* Info + controls */}
                      <div className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white/90">{template.name}</p>
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-xs text-slate-500 dark:text-white/40">{templateKcal} kcal</span>
                              <span className="text-xs text-slate-400 dark:text-white/30">·</span>
                              <span className="text-xs text-slate-500 dark:text-white/40">{templateProtein}g P</span>
                              <span className="text-xs text-slate-400 dark:text-white/30">·</span>
                              <span className="text-xs text-slate-500 dark:text-white/40">{templateCarbs}g K</span>
                              <span className="text-xs text-slate-400 dark:text-white/30">·</span>
                              <span className="text-xs text-slate-500 dark:text-white/40">{templateFat}g F</span>
                            </div>
                          </div>
                        </div>

                        {/* Portion adjuster */}
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-xs text-slate-500 dark:text-white/40 flex-shrink-0">Mengde</p>
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-xl p-0.5 flex-1">
                            <button
                              type="button"
                              onClick={() => setTemplatePortions(prev => ({ ...prev, [template.id]: Math.max(25, (prev[template.id] ?? 100) - 25) }))}
                              className="w-8 h-8 rounded-lg bg-white dark:bg-white/[0.08] shadow-sm text-slate-700 dark:text-white/70 font-bold text-lg flex items-center justify-center flex-shrink-0"
                            >
                              −
                            </button>
                            <div className="flex-1 text-center">
                              <input
                                type="number"
                                min={10}
                                max={400}
                                value={portion}
                                onChange={e => setTemplatePortions(prev => ({ ...prev, [template.id]: Math.max(10, Math.min(400, Number(e.target.value) || 100)) }))}
                                className="w-16 text-center text-sm font-semibold text-slate-900 dark:text-white/90 bg-transparent focus:outline-none"
                              />
                              <span className="text-xs text-slate-400 dark:text-white/30 block -mt-0.5">gram / %</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setTemplatePortions(prev => ({ ...prev, [template.id]: Math.min(400, (prev[template.id] ?? 100) + 25) }))}
                              className="w-8 h-8 rounded-lg bg-white dark:bg-white/[0.08] shadow-sm text-slate-700 dark:text-white/70 font-bold text-lg flex items-center justify-center flex-shrink-0"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Quick portion chips */}
                        <div className="flex gap-1.5 mb-3">
                          {[50, 75, 100, 150, 200].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setTemplatePortions(prev => ({ ...prev, [template.id]: p }))}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${portion === p ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/40'}`}
                            >
                              {p}%
                            </button>
                          ))}
                        </div>

                        {/* Add button */}
                        <button
                          type="button"
                          onClick={() => {
                            template.items.forEach(item =>
                              addFoodToMeal(savedMealsModalMealId, {
                                ...item,
                                id: createFoodId(),
                                kcal: Math.round((item.kcal ?? 0) * multiplier),
                                protein: Math.round((item.protein ?? 0) * multiplier),
                                carbs: Math.round((item.carbs ?? 0) * multiplier),
                                fat: Math.round((item.fat ?? 0) * multiplier),
                              }, `template:${template.id}`)
                            );
                            setSavedMealTemplates(prev =>
                              prev.map(e => e.id === template.id ? { ...e, usageCount: (e.usageCount ?? 0) + 1 } : e)
                            );
                            setSavedMealsModalMealId(null);
                            setTemplatePortions({});
                          }}
                          className="w-full rounded-xl bg-orange-500 text-white text-sm font-semibold py-2.5"
                        >
                          Legg til {templateKcal} kcal
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {pendingTemplate && (
        <div className="mx-4 mb-3 rounded-xl bg-emerald-500/10 p-3">
          <p className="text-xs text-emerald-400 mb-2">
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
                setScanHint('Måltid lagret for 1-tap logging.');
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white"
            >
              Lagre
            </button>
            <button
              type="button"
              onClick={() => setPendingTemplate(null)}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-400"
            >
              Senere
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className={`flex items-center gap-1 ${expandedSections.trening ? 'mb-4' : ''}`}>
          <button
            type="button"
            onClick={() => toggleSection('trening')}
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-gray-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white/90">Trening</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-2xl font-bold leading-none ${hasTrainingLogged ? 'text-gray-900 dark:text-white/90' : 'text-gray-400'}`}>
                  {dayLog.trainingKcal}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{t('home.stats.kcalBurned')}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform duration-200 shrink-0 ${expandedSections.trening ? '' : '-rotate-90'}`} />
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => togglePin('trening', e)}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${pinnedSections.includes('trening') ? 'text-orange-500' : 'text-slate-300 dark:text-white/20'}`}
            title={pinnedSections.includes('trening') ? 'Fjern festing' : pinnedSections.length >= 3 ? 'Maks 3 festet' : 'Fest seksjon'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>
        {expandedSections.trening && hasTrainingLogged && (
          <p className="text-sm text-gray-600 dark:text-white/60 mb-4">
            {selectedDayWorkouts.length > 0
              ? `${selectedDayWorkouts.length} økt${selectedDayWorkouts.length > 1 ? 'er' : ''} logget`
              : t('home.stats.workoutLogged')}
          </p>
        )}
        {expandedSections.trening && (
          <>
            <button
              type="button"
              onClick={openWorkoutModal}
              disabled={isPastSelectedDay}
              className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-sm py-3 px-4 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Logg treningsøkt
            </button>
            {selectedDayWorkouts.length > 0 && (
              <div className="mt-3 space-y-1">
                {selectedDayWorkouts.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={triggerTrainingFlex}
                    className="w-full text-left text-sm text-gray-700 dark:text-white/70 flex justify-between items-center gap-3 border-b border-gray-100 dark:border-white/[0.06] px-1 py-2 last:border-b-0"
                  >
                    <span className="truncate">{session.exerciseName} ({session.durationMin} min)</span>
                    <span className="font-semibold text-gray-900 dark:text-white/90 shrink-0">{session.caloriesBurned} kcal</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div id="water-section" className="card">
        <div className={`flex items-center gap-1 ${expandedSections.vann ? 'mb-2' : ''}`}>
          <button
            type="button"
            onClick={() => toggleSection('vann')}
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white/90">Vann</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-300">{hydrationMl} / {WATER_GOAL_ML} ml</p>
                <p className="text-xs text-cyan-600 dark:text-cyan-400">{Math.round(waterProgress * 100)}% {t('home.stats.ofGoal')}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform duration-200 shrink-0 ${expandedSections.vann ? '' : '-rotate-90'}`} />
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => togglePin('vann', e)}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${pinnedSections.includes('vann') ? 'text-cyan-500' : 'text-slate-300 dark:text-white/20'}`}
            title={pinnedSections.includes('vann') ? 'Fjern festing' : pinnedSections.length >= 3 ? 'Maks 3 festet' : 'Fest seksjon'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandedSections.vann && <div className="mt-4">
          {/* 8 Water Bottle Icons */}
          <div className="flex justify-center items-center gap-2 mb-4">
            {Array.from({ length: MAX_WATER_CUPS }, (_, index) => {
              const cupIndex = index + 1;
              const cupsNeeded = Math.ceil(hydrationMl / WATER_CUP_SIZE_ML);
              const isFilled = cupIndex <= cupsNeeded;
              const isFirstUnfilled = cupIndex === cupsNeeded + 1;
              const isAnimating = animatingWaterCups.includes(cupIndex);
              const isLastFilled = isFilled && cupIndex === Math.ceil(hydrationMl / WATER_CUP_SIZE_ML);
              return (
                <button
                  key={cupIndex}
                  type="button"
                  onClick={() => {
                    if (isPastSelectedDay) return;
                    if (isFilled) {
                      removeWater(WATER_CUP_SIZE_ML);
                    } else {
                      addWater(WATER_CUP_SIZE_ML, 'water:cup:tap');
                    }
                  }}
                  title={isFilled ? 'Klikk for å fjerne 250 ml' : 'Klikk for å legge til 250 ml'}
                  className={`relative h-14 w-9 transition-all duration-200 ${
                    !isPastSelectedDay ? 'cursor-pointer active:scale-95' : 'cursor-default'
                  }`}
                  disabled={isPastSelectedDay}
                >
                  <div className={`water-bottle-shell ${isAnimating ? 'water-cup-shell-fill' : ''} ${isFilled ? 'water-bottle-shell-filled' : 'water-bottle-shell-empty'}`}>
                    <div className="water-bottle-cap" />
                    <div className="water-bottle-body">
                      <div className={`water-bottle-liquid-layer ${isFilled ? 'water-bottle-liquid-filled' : ''} ${isAnimating ? 'water-cup-liquid-fill' : ''}`} />
                      <div className="water-bottle-shine" />
                    </div>
                  </div>
                  {/* Minus overlay for last filled cup */}
                  {isLastFilled && !isPastSelectedDay && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-[8px] flex items-center justify-center">
                      <Minus className="w-4 h-4 text-cyan-700 dark:text-cyan-200" />
                    </div>
                  )}
                  {/* Plus overlay for first unfilled cup */}
                  {isFirstUnfilled && !isPastSelectedDay && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-[8px] flex items-center justify-center">
                      <Plus className="w-4 h-4 text-cyan-700 dark:text-cyan-200" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Water progress text */}
          <div className="text-center mb-3">
            <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">{hydrationMl} / {WATER_GOAL_ML} ml</p>
          </div>

          {/* Quick-add water buttons */}
          {!isPastSelectedDay && (
            <div className="flex gap-2 justify-center flex-wrap">
              {[250, 500, 750].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => addWater(ml, `water:quick:${ml}`)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-xs font-semibold hover:bg-cyan-200 dark:hover:bg-cyan-800/40 transition-colors"
                >
                  +{ml} ml
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomWater((v) => !v)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors"
              >
                Egendefinert
              </button>
            </div>
          )}

          {/* Custom water amount input */}
          {showCustomWater && !isPastSelectedDay && (
            <div className="flex gap-2 mt-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="ml"
                value={customWaterInput}
                onChange={(e) => setCustomWaterInput(e.target.value)}
                className="flex-1 rounded-lg border border-cyan-200 dark:border-cyan-800/40 bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
              />
              <button
                type="button"
                onClick={() => {
                  const ml = Number(customWaterInput);
                  if (ml > 0) {
                    addWater(ml, 'water:custom');
                    setCustomWaterInput('');
                    setShowCustomWater(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold hover:bg-cyan-600 transition-colors"
              >
                Legg til
              </button>
            </div>
          )}
        </div>}
      </div>

      {/* Andre inntak — customizable */}
      <div className="card">
          {/* Header */}
          <div className={`flex items-center gap-1 ${expandedSections.andre ? 'mb-3' : ''}`}>
            <button
              type="button"
              onClick={() => toggleSection('andre')}
              className="flex-1 flex items-center justify-between min-w-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center">
                  <Pill className="w-5 h-5 text-slate-500 dark:text-white/50" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white/90">{t('home.extras.title')}</h3>
              </div>
              <div className="flex items-center gap-2">
                {customIntakes.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-white/30 font-medium">{customIntakes.length} stk</span>
                )}
                <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform duration-200 shrink-0 ${expandedSections.andre ? '' : '-rotate-90'}`} />
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => togglePin('andre', e)}
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${pinnedSections.includes('andre') ? 'text-slate-600 dark:text-white/60' : 'text-slate-300 dark:text-white/20'}`}
              title={pinnedSections.includes('andre') ? 'Fjern festing' : pinnedSections.length >= 3 ? 'Maks 3 festet' : 'Fest seksjon'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          </div>

          {expandedSections.andre && <>
          {!isPastSelectedDay && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => {
                  setEditingIntake(null);
                  setIntakeForm({ name: '', icon: 'pill', unit: 'dose', goalPerDay: '1' });
                  setShowAddIntakeModal(true);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-colors"
                title="Legg til inntak"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          {customIntakes.length === 0 ? (
            /* Empty state */
            <button
              type="button"
              onClick={() => {
                setEditingIntake(null);
                setIntakeForm({ name: '', icon: 'pill', unit: 'dose', goalPerDay: '1' });
                setShowAddIntakeModal(true);
              }}
              className="w-full flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-white/30 hover:border-violet-300 dark:hover:border-violet-500/40 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Legg til kreatin, kaffe, vitaminer...</span>
            </button>
          ) : (
            <div className="space-y-2">
              {customIntakes.map((intake) => {
                const taken = customIntakeLogs[selectedDateKey]?.[intake.id] ?? 0;
                const done = taken >= intake.goalPerDay;
                const pct = Math.min(100, (taken / Math.max(1, intake.goalPerDay)) * 100);
                return (
                  <div key={intake.id} className="flex items-center gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${done ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-violet-100 dark:bg-violet-900/20'}`}>
                      {done
                        ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        : <CustomIntakeIcon iconKey={intake.icon} className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                      }
                    </div>
                    {/* Name + progress */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white/90 truncate">{intake.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-white/[0.05] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-400 ${done ? 'bg-emerald-400' : 'bg-violet-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-medium shrink-0 ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-white/35'}`}>
                          {taken}/{intake.goalPerDay} {intake.unit}
                        </span>
                      </div>
                    </div>
                    {/* Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      {taken > 0 && !isPastSelectedDay && (
                        <button
                          type="button"
                          onClick={() => setCustomIntakeLogs(prev => {
                            const cur = prev[selectedDateKey]?.[intake.id] ?? 0;
                            const next = Math.max(0, cur - 1);
                            return { ...prev, [selectedDateKey]: { ...(prev[selectedDateKey] ?? {}), [intake.id]: next } };
                          })}
                          className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-white/30 hover:bg-slate-200 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                      {!isPastSelectedDay && (
                        <button
                          type="button"
                          onClick={() => setCustomIntakeLogs(prev => {
                            const cur = prev[selectedDateKey]?.[intake.id] ?? 0;
                            const next = cur + 1;
                            return { ...prev, [selectedDateKey]: { ...(prev[selectedDateKey] ?? {}), [intake.id]: next } };
                          })}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${done ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/30'}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      {/* Edit button */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIntake(intake);
                          setIntakeForm({
                            name: intake.name,
                            icon: intake.icon,
                            unit: intake.unit,
                            goalPerDay: String(intake.goalPerDay),
                          });
                          setShowAddIntakeModal(true);
                        }}
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-white/30 hover:bg-slate-200 transition-colors ml-0.5"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>}
      </div>

      {/* Weight Graph Section */}
      <div className="card bg-slate-100/70 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06]">
        <div className={`flex items-center gap-1 ${expandedSections.kroppsvekt ? 'mb-4' : ''}`}>
          <button
            type="button"
            onClick={() => toggleSection('kroppsvekt')}
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
                <Scale className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white/90">{t('home.bodyWeight.title')}</h3>
                {journeyWeightSeries.length >= 2 && (() => {
                  const first = journeyWeightSeries[0].value;
                  const last = journeyWeightSeries[journeyWeightSeries.length - 1].value;
                  const delta = last - first;
                  return (
                    <p className={`text-xs font-medium ${delta < 0 ? 'text-green-600 dark:text-green-400' : delta > 0 ? 'text-red-500' : 'text-slate-500 dark:text-white/40'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg totalt
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {journeyWeightSeries.length > 0 && (
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-900 dark:text-white/90">
                    {journeyWeightSeries[journeyWeightSeries.length - 1].value.toFixed(1)} kg
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/40">{t('home.bodyWeight.lastMeasurement')}</p>
                </div>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform duration-200 shrink-0 ${expandedSections.kroppsvekt ? '' : '-rotate-90'}`} />
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => togglePin('kroppsvekt', e)}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${pinnedSections.includes('kroppsvekt') ? 'text-orange-500' : 'text-slate-300 dark:text-white/20'}`}
            title={pinnedSections.includes('kroppsvekt') ? 'Fjern festing' : pinnedSections.length >= 3 ? 'Maks 3 festet' : 'Fest seksjon'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandedSections.kroppsvekt && <>
        {/* Improved Weight Chart */}
        {journeyWeightSeries.length > 0 ? (() => {
          const values = journeyWeightSeries.map((p) => p.value);
          const minVal = Math.min(...values);
          const maxVal = Math.max(...values);
          const range = Math.max(0.5, maxVal - minVal);
          const padded = { min: minVal - range * 0.15, max: maxVal + range * 0.15 };
          const W = 340;
          const H = 140;
          const PL = 36; // left padding for y-axis labels
          const PR = 10;
          const PT = 20;
          const PB = 30; // bottom padding for x-axis labels
          const chartW = W - PL - PR;
          const chartH = H - PT - PB;

          const toX = (i: number) => journeyWeightSeries.length === 1
            ? PL + chartW / 2
            : PL + (i / (journeyWeightSeries.length - 1)) * chartW;
          const toY = (v: number) => PT + chartH - ((v - padded.min) / (padded.max - padded.min)) * chartH;

          // Y-axis gridlines — 3 levels
          const gridLevels = [minVal, (minVal + maxVal) / 2, maxVal];

          // X-axis: show first, last, and middle dates
          const showDateAt = new Set([0, Math.floor((journeyWeightSeries.length - 1) / 2), journeyWeightSeries.length - 1]);

          const coords = journeyWeightSeries.map((p, i) => ({ x: toX(i), y: toY(p.value), value: p.value, date: p.date }));
          const polyPoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

          return (
            <div className="mb-4 bg-white dark:bg-white/[0.02] rounded-xl border border-slate-200 dark:border-white/[0.05] overflow-hidden">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '160px' }}>
                {/* Grid lines */}
                {gridLevels.map((v) => {
                  const gy = toY(v);
                  return (
                    <g key={v}>
                      <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" className="text-slate-900 dark:text-white" />
                      <text x={PL - 4} y={gy + 4} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.45" className="text-slate-700 dark:text-white">{v.toFixed(1)}</text>
                    </g>
                  );
                })}

                {/* Area fill */}
                <defs>
                  <linearGradient id="wgt-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <polygon
                  fill="url(#wgt-grad)"
                  points={`${coords[0].x},${PT + chartH} ${polyPoints} ${coords[coords.length - 1].x},${PT + chartH}`}
                />

                {/* Line */}
                <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={polyPoints} />

                {/* Data points with weight labels */}
                {coords.map((c, i) => (
                  <g key={`${c.date}-${i}`}>
                    <circle cx={c.x} cy={c.y} r="4" fill="#f97316" />
                    <text
                      x={c.x}
                      y={c.y - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill="#f97316"
                    >
                      {c.value.toFixed(1)}
                    </text>
                    {/* X-axis date labels */}
                    {showDateAt.has(i) && (
                      <text
                        x={c.x}
                        y={H - 4}
                        textAnchor="middle"
                        fontSize="8"
                        fill="currentColor"
                        fillOpacity="0.4"
                        className="text-slate-700 dark:text-white"
                      >
                        {c.date.slice(5)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          );
        })() : (
          <div className="h-40 flex flex-col items-center justify-center gap-2 bg-white dark:bg-white/[0.02] rounded-xl border border-slate-200 dark:border-white/[0.05] mb-4">
            <Scale className="w-8 h-8 text-slate-300 dark:text-white/20" />
            <p className="text-slate-500 dark:text-white/40 text-sm">Ingen vektdata enda</p>
            <p className="text-xs text-slate-400 dark:text-white/30">Logg vekt for å se graf</p>
          </div>
        )}

        {/* Log Weight Button */}
        <button
          type="button"
          onClick={() => {
            setWeightInput(profilePrefs.weightKg?.toString() ?? '');
            setShowWeightModal(true);
          }}
          className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <Scale className="w-4 h-4" />
          Logg vekt
        </button>
        </>}
      </div>

      {/* Diet / Goal Section */}
      <div className="card bg-slate-100/70 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06]">
        <div className={`flex items-center gap-1 ${expandedSections.kosthold ? 'mb-4' : ''}`}>
          <button
            type="button"
            onClick={() => toggleSection('kosthold')}
            className="flex-1 flex items-center justify-between min-w-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white/90">{t('home.dietGoal.title')}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-white/30">{netGoal} kcal</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-white/30 transition-transform duration-200 shrink-0 ${expandedSections.kosthold ? '' : '-rotate-90'}`} />
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => togglePin('kosthold', e)}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${pinnedSections.includes('kosthold') ? 'text-emerald-500' : 'text-slate-300 dark:text-white/20'}`}
            title={pinnedSections.includes('kosthold') ? 'Fjern festing' : pinnedSections.length >= 3 ? 'Maks 3 festet' : 'Fest seksjon'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandedSections.kosthold && <>
        {/* Goal toggle */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {([
            { key: 'fat_loss', label: 'Gå ned i vekt', desc: 'Kaloriunderskudd' },
            { key: 'muscle_gain', label: 'Øke i vekt', desc: 'Kalorioverskudd' },
          ] as { key: HomeProfile['goalMode']; label: string; desc: string }[]).map(({ key, label, desc }) => {
            const isActive = (profilePrefs.goalMode ?? 'fat_loss') === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setProfilePrefs((prev) => ({ ...prev, goalMode: key }))}
                className={`p-3 rounded-xl border-2 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] opacity-60'
                }`}
              >
                <p className={`text-sm font-semibold ${isActive ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-white/60'}`}>{label}</p>
                <p className={`text-xs ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-white/30'}`}>{desc}</p>
              </button>
            );
          })}
        </div>

        {/* Diet targets based on goal */}
        <div className="bg-white dark:bg-white/[0.03] rounded-xl p-3 border border-slate-200 dark:border-white/[0.06]">
          {(() => {
            const goalMode = profilePrefs.goalMode ?? 'fat_loss';
            const dietLabel =
              goalMode === 'muscle_gain' ? { title: 'Bulkdiett — daglige mål', color: 'text-emerald-600 dark:text-emerald-400', desc: 'Høyt protein + kalorioverskudd for muskelvekst' }
              : goalMode === 'recomp'     ? { title: 'Rekomposisjon — daglige mål', color: 'text-sky-600 dark:text-sky-400', desc: 'Moderat underskudd + høyt protein for fettforbrenning og muskelbevaring' }
              : goalMode === 'maintenance'? { title: 'Vedlikehold — daglige mål', color: 'text-slate-600 dark:text-slate-400', desc: 'Kaloribalanse med høyt protein for å holde vekten stabil' }
              : { title: 'Slankediett — daglige mål', color: 'text-orange-600 dark:text-orange-400', desc: 'Kaloriunderskudd med høyt protein for å bevare muskler' };
            return (
              <>
                <p className={`text-xs font-semibold ${dietLabel.color} uppercase tracking-wide mb-2`}>{dietLabel.title}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white/90">{netGoal} kcal</p>
                    <p className="text-[11px] text-slate-500 dark:text-white/40">Kalorimål</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-purple-600 dark:text-purple-400">{smartDietPlan.macros?.proteinG ?? '—'}g</p>
                    <p className="text-[11px] text-slate-500 dark:text-white/40">Protein</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{smartDietPlan.macros?.carbsG ?? '—'}g</p>
                    <p className="text-[11px] text-slate-500 dark:text-white/40">Karbo</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{smartDietPlan.macros?.fatG ?? '—'}g</p>
                    <p className="text-[11px] text-slate-500 dark:text-white/40">Fett</p>
                  </div>
                </div>
                {dayLog.trainingKcal > 0 && (
                  <p className="text-[11px] text-emerald-500 dark:text-emerald-400 mt-2 text-center">+{dayLog.trainingKcal} kcal trening inkludert i kalorimål</p>
                )}
                <p className="text-xs text-slate-500 dark:text-white/40 mt-1 text-center">{dietLabel.desc}</p>
              </>
            );
          })()}
        </div>
        </>}
      </div>

      {/* ===== NUTRITION TWIN / TRAJECTORY ===== */}
      {isTodaySelected && adaptiveComplexity !== 'minimal' && (
        <div style={{ padding: '0 16px' }}>
          <TrajectoryChart
            logsByDate={logsByDate}
            rawProfile={profilePrefs}
            resetDate={prognoseResetDate}
            onReset={() => setPrognoseResetDate(toDateKey(new Date()))}
          />
        </div>
      )}

      {isPastSelectedDay && (
        <p className="px-4 mt-2 text-xs text-amber-400/80">
          Denne dagen er last fordi den har passert. Dagens score er derfor uforanderlig.
        </p>
      )}

      {scanHint && createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 bg-gray-900 text-white text-xs px-3 py-2 rounded-full z-50">
          {scanHint}
        </div>,
        document.body
      )}

      {showPopup && createPortal(
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
            <div className="popup-icon">🎯</div>
            <h3 className="popup-title">MÅL NÅDD</h3>
            <p className="popup-text">Sterk dag. Du holder deg innenfor kalorimarginen.</p>
          </div>
        </div>,
        document.body
      )}

      {showWeightModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowWeightModal(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/[0.08] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90">Logg vekt</h3>
              <button type="button" onClick={() => setShowWeightModal(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs text-slate-500 dark:text-white/40 block mb-1">Vekt (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="f.eks. 75.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-2xl font-bold text-slate-900 dark:text-white/90 text-center"
              />
            </div>
            {journeyWeightSeries.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-white/40 text-center mb-4">
                Forrige: {journeyWeightSeries[journeyWeightSeries.length - 1].value.toFixed(1)} kg
                {(() => {
                  const prev = journeyWeightSeries[journeyWeightSeries.length - 1].value;
                  const curr = Number(weightInput);
                  if (!Number.isFinite(curr) || weightInput === '') return null;
                  const d = curr - prev;
                  return <span className={d < 0 ? 'text-green-500' : d > 0 ? 'text-red-500' : ''}> ({d > 0 ? '+' : ''}{d.toFixed(1)} kg)</span>;
                })()}
              </p>
            )}
            <button
              type="button"
              onClick={() => logWeight(Number(weightInput))}
              disabled={!weightInput || Number(weightInput) <= 0}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Lagre
            </button>
          </div>
        </div>,
        document.body
      )}

      {showWorkoutModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/[0.08] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90">Logg treningsøkt</h3>
              <button
                type="button"
                onClick={() => setShowWorkoutModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 flex items-center justify-center text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-white/40">Tidspunkt</label>
                <input
                  type="datetime-local"
                  value={workoutStartedAt}
                  onChange={(event) => setWorkoutStartedAt(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Varighet (min)</label>
                  <input
                    inputMode="numeric"
                    value={workoutDurationMin}
                    onChange={(event) => setWorkoutDurationMin(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Kcal forbrent</label>
                  <input
                    inputMode="numeric"
                    value={workoutCalories}
                    onChange={(event) => setWorkoutCalories(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-white/40">Type</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {([
                    ['Run', 'Løping'],
                    ['Ride', 'Sykling'],
                    ['Walk', 'Gåtur'],
                    ['Strength', 'Styrke'],
                    ['HIIT', 'HIIT'],
                    ['Other', 'Annet'],
                  ] as [WorkoutSession['workoutType'], string][]).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setWorkoutType(type)}
                      className={`rounded-lg px-2 py-2 text-xs border font-semibold transition-colors ${workoutType === type ? 'bg-orange-500 text-white border-orange-500' : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/[0.08] hover:bg-orange-50 dark:hover:bg-white/[0.08]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-white/40">Øvelse / aktivitet</label>
                <input
                  value={workoutExerciseName}
                  onChange={(event) => setWorkoutExerciseName(event.target.value)}
                  placeholder="f.eks. Intervallløp, benøkt, sykkel"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-white/40">Notater (valgfritt)</label>
                <textarea
                  value={workoutNotes}
                  onChange={(event) => setWorkoutNotes(event.target.value)}
                  rows={2}
                  placeholder="Hvordan kjentes økten?"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 resize-none"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowWorkoutModal(false)}
                className="flex-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-slate-700 dark:text-white/70"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={saveWorkoutSession}
                className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-3 py-2 text-sm text-white font-bold transition-colors"
              >
                Lagre økt
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {manualAddMeal && createPortal(
        <div className="fixed inset-0 flex items-end justify-center bg-black/50 p-0" style={{ zIndex: 1100 }}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-white/[0.08] shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
            <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-orange-500/10 to-amber-500/5 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
                    <Pencil className="w-4.5 h-4.5 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white/90">Legg til mat</h3>
                    <p className="text-xs text-slate-500 dark:text-white/40 capitalize">
                      {manualAddMeal === 'breakfast' ? t('home.meals.breakfast') : manualAddMeal === 'lunch' ? t('home.meals.lunch') : manualAddMeal === 'dinner' ? t('home.meals.dinner') : t('home.meals.snacks')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualAddMeal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-500 dark:text-white/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-5 space-y-4 overflow-y-auto" style={{ flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' } as React.CSSProperties}>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-white/40 uppercase tracking-wide">Matvare</label>
                <input
                  autoFocus
                  placeholder="f.eks. Havregrøt med bær"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-white/40 uppercase tracking-wide">Kalorier (kcal)</label>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={manualKcal}
                    onChange={(e) => setManualKcal(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-orange-500/30 bg-orange-500/5 dark:bg-orange-500/[0.04] px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-white/40 uppercase tracking-wide">Protein (g)</label>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={manualProtein}
                    onChange={(e) => setManualProtein(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-white/40 uppercase tracking-wide">Karbohydrat (g)</label>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={manualCarbs}
                    onChange={(e) => setManualCarbs(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-white/40 uppercase tracking-wide">Fett (g)</label>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={manualFat}
                    onChange={(e) => setManualFat(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!manualAddMeal) return;
                  const name = manualName.trim();
                  const kcal = Number(manualKcal.replace(',', '.'));
                  const protein = Number(manualProtein.replace(',', '.') || '0');
                  const carbs = Number(manualCarbs.replace(',', '.') || '0');
                  const fat = Number(manualFat.replace(',', '.') || '0');
                  if (!name) { setScanHint('Navn mangler.'); return; }
                  if (!Number.isFinite(kcal) || kcal < 0) { setScanHint('Ugyldig kaloriverdi.'); return; }
                  addFoodToMeal(manualAddMeal, {
                    id: createFoodId(),
                    name,
                    kcal: Math.round(kcal),
                    protein: Math.max(0, Math.round(protein)),
                    carbs: Math.max(0, Math.round(carbs)),
                    fat: Math.max(0, Math.round(fat)),
                  }, 'manual:add');
                  setManualAddMeal(null);
                }}
                className="w-full rounded-2xl bg-orange-500 text-white py-3.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <Plus className="w-4 h-4" />
                Legg til {manualKcal ? `${manualKcal} kcal` : 'mat'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingFood && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/[0.08] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white/90">Rediger matpost</h3>
              <button
                type="button"
                onClick={() => setEditingFood(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60"
              >
                x
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-white/40">Navn</label>
                <input
                  value={editingFood.name}
                  onChange={(event) => setEditingFood((prev) => (prev ? { ...prev, name: event.target.value } : null))}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Kcal</label>
                  <input
                    inputMode="decimal"
                    value={editingFood.kcal}
                    onChange={(event) => setEditingFood((prev) => (prev ? { ...prev, kcal: event.target.value } : null))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Protein</label>
                  <input
                    inputMode="decimal"
                    value={editingFood.protein}
                    onChange={(event) => setEditingFood((prev) => (prev ? { ...prev, protein: event.target.value } : null))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Karbo</label>
                  <input
                    inputMode="decimal"
                    value={editingFood.carbs}
                    onChange={(event) => setEditingFood((prev) => (prev ? { ...prev, carbs: event.target.value } : null))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-white/40">Fett</label>
                  <input
                    inputMode="decimal"
                    value={editingFood.fat}
                    onChange={(event) => setEditingFood((prev) => (prev ? { ...prev, fat: event.target.value } : null))}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingFood(null)}
                className="flex-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-sm text-slate-700 dark:text-white/70"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={saveFoodEdit}
                className="flex-1 rounded-lg bg-orange-500/100 px-3 py-2 text-sm text-white"
              >
                Lagre endringer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showQuickAddMenu && createPortal(
        <div className="fixed right-4 bottom-24 z-50 w-72 rounded-2xl bg-white shadow-xl border border-slate-200 dark:border-white/[0.06] p-2">
          <p className="text-[11px] uppercase text-slate-400 dark:text-white/30 px-3 py-1">Smart quick buttons</p>
          {smartQuickActions.slice(0, 6).map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleQuickAdd(action.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm"
            >
              {action.label}
            </button>
          ))}

          <p className="text-[11px] uppercase text-slate-400 dark:text-white/30 px-3 py-1 mt-1">Intelligent repeat</p>
          <button type="button" onClick={() => handleQuickAdd('repeat-breakfast')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            Repeat Breakfast
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-lunch')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            Repeat Lunch
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-day-yesterday')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            Repeat Whole Day
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-last-monday')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            Repeat Last Monday
          </button>
          <button type="button" onClick={() => handleQuickAdd('repeat-frequent')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            Repeat Most Frequent Day
          </button>

          <p className="text-[11px] uppercase text-slate-400 dark:text-white/30 px-3 py-1 mt-1">Macro-only quick log</p>
          <button type="button" onClick={() => handleQuickAdd('macro-protein')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            +30g protein
          </button>
          <button type="button" onClick={() => handleQuickAdd('macro-carbs')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            +50g carbs
          </button>
          <button type="button" onClick={() => handleQuickAdd('macro-fat')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100/70 dark:bg-white/[0.03] text-sm">
            +20g fat
          </button>
        </div>,
        document.body
      )}

      {undoAction && createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full bg-gray-900 text-white text-xs px-3 py-2 flex items-center gap-3">
          <span>{undoAction.label}</span>
          <button
            type="button"
            onClick={() => {
              undoAction.undo();
              setUndoAction(null);
              setScanHint('Angret');
            }}
            className="text-orange-700 dark:text-orange-300 font-semibold"
          >
            Angre
          </button>
        </div>,
        document.body
      )}

      {/* ===== ADD / EDIT CUSTOM INTAKE MODAL ===== */}
      {showAddIntakeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* backdrop — visual only, close on tap */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAddIntakeModal(false)} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 430, background: 'white', borderRadius: '24px 24px 0 0', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }} className="dark:bg-zinc-950 shadow-2xl">
            {/* Handle + header — sticky */}
            <div className="pt-3 pb-2 px-5 border-b border-slate-100 dark:border-white/[0.06] shrink-0">
              <div className="w-10 h-1 bg-slate-200 dark:bg-white/20 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingIntake ? 'Rediger inntak' : 'Nytt inntak'}
                </h2>
                <button type="button" onClick={() => setShowAddIntakeModal(false)} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-600 dark:text-white/60" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 20px 0', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }} className="space-y-5">
              {/* Icon picker */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">Ikon</p>
                <div className="grid grid-cols-6 gap-2">
                  {CUSTOM_INTAKE_ICONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIntakeForm(f => ({ ...f, icon: key }))}
                      title={label}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors ${intakeForm.icon === key ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30' : 'border-transparent bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.09]'}`}
                    >
                      <CustomIntakeIcon iconKey={key} className={`w-5 h-5 ${intakeForm.icon === key ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-white/50'}`} />
                      <span className={`text-[9px] font-medium leading-none ${intakeForm.icon === key ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 dark:text-white/30'}`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">Navn</p>
                <input
                  type="text"
                  placeholder="f.eks. Kreatin, Kaffe, Vitamin D..."
                  value={intakeForm.name}
                  onChange={e => setIntakeForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              {/* Unit + Goal row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">Enhet</p>
                  <input
                    type="text"
                    placeholder="g, mg, dose, kops..."
                    value={intakeForm.unit}
                    onChange={e => setIntakeForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-2">Dagsmål</p>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    step="any"
                    placeholder="1"
                    value={intakeForm.goalPerDay}
                    onChange={e => setIntakeForm(f => ({ ...f, goalPerDay: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
              </div>

              {/* Save / Delete */}
              <div className="flex gap-2 pt-1">
                {editingIntake && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomIntakes(prev => prev.filter(i => i.id !== editingIntake.id));
                      setShowAddIntakeModal(false);
                    }}
                    className="flex-none px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    Slett
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const name = intakeForm.name.trim();
                    if (!name) return;
                    const goal = parseFloat(intakeForm.goalPerDay.replace(',', '.')) || 1;
                    const unit = intakeForm.unit.trim() || 'dose';
                    if (editingIntake) {
                      setCustomIntakes(prev => prev.map(i => i.id === editingIntake.id
                        ? { ...i, name, icon: intakeForm.icon, unit, goalPerDay: goal }
                        : i
                      ));
                    } else {
                      const newIntake: CustomIntake = { id: `ci_${Date.now()}`, name, icon: intakeForm.icon, unit, goalPerDay: goal };
                      setCustomIntakes(prev => [...prev, newIntake]);
                    }
                    setShowAddIntakeModal(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-violet-500 text-white text-sm font-bold hover:bg-violet-600 transition-colors disabled:opacity-40"
                  disabled={!intakeForm.name.trim()}
                >
                  {editingIntake ? 'Lagre endringer' : 'Legg til'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== NUTRIENT DETAIL MODAL ===== */}
      {showNutrientModal && createPortal((() => {
        const macroTargets = smartDietPlan.macros;
        const proteinTarget = macroTargets?.proteinG ?? 120;
        const carbsTarget = macroTargets?.carbsG ?? 200;
        const fatTarget = macroTargets?.fatG ?? 70;
        const fiberTarget = macroTargets?.fiberG ?? (profilePrefs.sex === 'male' ? 38 : 25);
        const sugarsMaxTarget = macroTargets?.sugarsMaxG ?? 50;
        const satFatMaxTarget = macroTargets?.saturatedFatMaxG ?? 22;
        const sodiumMaxTarget = macroTargets?.sodiumMaxMg ?? 2000;

        const dayMicro = microLogsByDate[selectedDateKey] ?? {};

        // Use logged value if present, else estimate from intake
        const microVal = (key: keyof DayMicroLog, est: number) =>
          dayMicro[key] != null ? dayMicro[key]! : est;

        const logMicro = (key: keyof DayMicroLog, raw: string) => {
          const n = Number(raw.replace(',', '.'));
          if (!Number.isFinite(n) || n < 0) return;
          setMicroLogsByDate(prev => ({
            ...prev,
            [selectedDateKey]: { ...(prev[selectedDateKey] ?? {}), [key]: Math.round(n * 10) / 10 },
          }));
          setMicroInputKey(null);
          setMicroInputValue('');
        };

        const addMicro = (key: keyof DayMicroLog, delta: number) => {
          setMicroLogsByDate(prev => {
            const cur = (prev[selectedDateKey] ?? {})[key] ?? 0;
            return { ...prev, [selectedDateKey]: { ...(prev[selectedDateKey] ?? {}), [key]: Math.max(0, Math.round((cur + delta) * 10) / 10) } };
          });
        };

        const getBarColor = (pct: number) => {
          if (pct < 30) return '#ef4444';
          if (pct < 55) return '#f97316';
          if (pct < 80) return '#eab308';
          if (pct <= 115) return '#22c55e';
          return '#3b82f6';
        };

        const isMale = profilePrefs.sex === 'male';
        const age = profilePrefs.age ?? 30;

        // Fiber: use actual scanned data if available, otherwise estimate at 14g/1000 kcal
        const fiberEst = Math.round((consumed / 1000) * 14);
        const fiberValue = dayFiber ?? dayMicro['fiberG'] ?? fiberEst;
        const fiberIsScanned = dayFiber != null;

        const macros = [
          { label: 'Protein', value: Math.round(protein), target: proteinTarget, unit: 'g', color: '#3b82f6' },
          { label: 'Karbo', value: Math.round(carbs), target: carbsTarget, unit: 'g', color: '#f97316' },
          { label: 'Fett', value: Math.round(fat), target: fatTarget, unit: 'g', color: '#a855f7' },
          { label: 'Fiber', value: typeof fiberValue === 'number' ? Math.round(fiberValue) : 0, target: fiberTarget, unit: 'g', color: '#22c55e' },
        ];
        const maxMacroVal = Math.max(...macros.map(m => Math.max(m.value, m.target)));

        // Personalized micro targets by sex and age (Nordic/WHO recommendations)
        const ironTarget = isMale ? 9 : age < 50 ? 18 : 9;
        const calciumTarget = age >= 70 ? 1200 : 1000;
        const vitCTarget = isMale ? 90 : 75;
        const vitDTarget = age >= 70 ? 25 : 20;
        const magTarget = isMale ? (age >= 31 ? 420 : 400) : age >= 31 ? 320 : 310;
        const zincTarget = isMale ? 11 : 8;

        type MicroDef = { label: string; key: keyof DayMicroLog; est: number; target: number; unit: string; step: number };
        const microDefs: MicroDef[] = [
          // Fiber: use scanned data when available, otherwise estimate
          { label: 'Fiber', key: 'fiberG', est: typeof fiberValue === 'number' ? fiberValue : fiberEst, target: fiberTarget, unit: 'g', step: 1 },
          { label: 'Omega-3', key: 'omega3G', est: Math.round(fat * 0.06 * 10) / 10, target: isMale ? 1.6 : 1.1, unit: 'g', step: 0.1 },
          { label: 'Jern', key: 'ironMg', est: Math.round((consumed / 2000) * ironTarget), target: ironTarget, unit: 'mg', step: 1 },
          { label: 'Kalsium', key: 'calciumMg', est: Math.round((consumed / 2000) * calciumTarget), target: calciumTarget, unit: 'mg', step: 50 },
          { label: 'Vitamin C', key: 'vitCMg', est: Math.round((consumed / 2000) * vitCTarget), target: vitCTarget, unit: 'mg', step: 10 },
          { label: 'Vitamin D', key: 'vitDUg', est: Math.round((consumed / 2000) * vitDTarget), target: vitDTarget, unit: 'µg', step: 1 },
          { label: 'Magnesium', key: 'magMg', est: Math.round((consumed / 2000) * magTarget), target: magTarget, unit: 'mg', step: 25 },
          { label: 'Sink', key: 'zincMg', est: Math.round((consumed / 2000) * zincTarget), target: zincTarget, unit: 'mg', step: 1 },
          { label: 'Kreatin', key: 'kreatinG', est: 0, target: 5, unit: 'g', step: 1 },
        ];

        return (
          <div className="fixed inset-0 z-[1400] flex items-end justify-center">
            <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowNutrientModal(false); setMicroInputKey(null); }} aria-label="Lukk" />
            <div className="relative w-full max-w-[430px] max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white dark:bg-zinc-950 shadow-2xl border-t border-white/20 dark:border-white/[0.08]">
              {/* Handle + header */}
              <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 pt-3 pb-2 px-5 border-b border-slate-100 dark:border-white/[0.06]">
                <div className="w-10 h-1 bg-slate-200 dark:bg-white/20 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Næringsstoffer</h2>
                    <p className="text-xs text-slate-500 dark:text-white/40">{isTodaySelected ? t('home.today') : dateLabel} · {consumed} kcal spist</p>
                  </div>
                  <button type="button" onClick={() => { setShowNutrientModal(false); setMicroInputKey(null); }} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-600 dark:text-white/60" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-6 pb-8">
                {/* ── Macro pillar chart ── */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-4">Makronæringsstoffer</p>
                  <div className="flex items-end justify-around gap-4 h-44">
                    {macros.map(({ label, value, target, unit, color }) => {
                      const pct = Math.min(100, (value / Math.max(1, maxMacroVal)) * 100);
                      const targetPct = Math.min(100, (target / Math.max(1, maxMacroVal)) * 100);
                      const fillPct = Math.min(130, Math.round((value / Math.max(1, target)) * 100));
                      const barColor = getBarColor(fillPct);
                      return (
                        <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-700 dark:text-white/80">{value}<span className="text-[10px] text-slate-400 dark:text-white/30 ml-0.5">{unit}</span></p>
                          <div className="relative w-full max-w-[56px] h-32 rounded-2xl bg-slate-100 dark:bg-white/[0.05] overflow-hidden flex flex-col justify-end">
                            <div className="absolute left-0 right-0 border-t-2 border-dashed opacity-40" style={{ bottom: `${targetPct}%`, borderColor: color }} />
                            <div className="w-full rounded-b-2xl transition-all duration-700 ease-out" style={{ height: `${pct}%`, background: `linear-gradient(to top, ${barColor}, ${barColor}bb)`, boxShadow: `0 0 14px ${barColor}55` }} />
                          </div>
                          <p className="text-[11px] font-bold" style={{ color: barColor }}>{fillPct}%</p>
                          <p className="text-[10px] text-slate-500 dark:text-white/35 text-center">{label}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/20">/{target}{unit}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-white/25 text-center mt-2">
                    Stiplet linje = dagsmål · Fiber: {fiberIsScanned ? 'fra matvare' : 'estimert'}
                  </p>
                </div>

                {/* ── Limits: sugars, saturated fat, sodium ── */}
                {(daySugars != null || daySatFat != null || daySodium != null) && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-3">Begrensninger – fra matvarer</p>
                    <div className="space-y-3">
                      {([
                        { label: 'Sukker', value: daySugars, max: sugarsMaxTarget, unit: 'g' },
                        { label: 'Mettet fett', value: daySatFat, max: satFatMaxTarget, unit: 'g' },
                        { label: 'Natrium', value: daySodium, max: sodiumMaxTarget, unit: 'mg' },
                      ] as const).filter((row) => row.value != null).map(({ label, value, max, unit }) => {
                        const pct = Math.min(130, Math.round(((value as number) / Math.max(1, max)) * 100));
                        const over = pct > 100;
                        const barColor = pct <= 70 ? '#22c55e' : pct <= 100 ? '#eab308' : '#ef4444';
                        return (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-slate-700 dark:text-white/70">{label}</span>
                              <span className="text-xs font-semibold tabular-nums" style={{ color: barColor }}>
                                {value}{unit} <span className="text-slate-400 dark:text-white/30 font-normal">/ maks {max}{unit}</span>
                              </span>
                            </div>
                            <div className="h-2.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(to right, ${barColor}88, ${barColor})` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">{over ? `${pct - 100}% over grense` : `${100 - pct}% under grense`}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Micro radar chart ── */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-3">Mikronæring – oversikt</p>
                  <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06] py-3 px-1">
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={microDefs.map(({ label, key, est, target }) => ({
                        subject: label,
                        value: Math.min(120, Math.round((microVal(key, est) / Math.max(1, target)) * 100)),
                        fullMark: 100,
                      }))}>
                        <PolarGrid stroke="rgba(148,163,184,0.2)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 10, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="value" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.25} dot={{ r: 3, fill: '#14b8a6', strokeWidth: 0 }} />
                        <RechartsTooltip
                          formatter={(val: number) => [`${val}%`, 'Av dagsmål']}
                          contentStyle={{ background: 'rgba(15,15,20,0.92)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
                          itemStyle={{ color: '#14b8a6' }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-slate-400 dark:text-white/25 text-center -mt-1">% av dagsmål per næringsstoff</p>
                  </div>
                </div>

                {/* ── Micro loggable bars ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Mikronæringsstoffer</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">Loggbart</span>
                  </div>
                  <div className="space-y-4">
                    {microDefs.map(({ label, key, est, target, unit, step }) => {
                      const logged = dayMicro[key] != null;
                      const value = microVal(key, est);
                      const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
                      const barColor = getBarColor(pct);
                      const isEditing = microInputKey === key;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium text-slate-700 dark:text-white/70">{label}</span>
                              {key === 'fiberG' && fiberIsScanned && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300 font-bold">SKANN</span>}
                              {logged && key !== 'fiberG' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-bold">LOGGET</span>}
                              {key === 'fiberG' && !fiberIsScanned && dayMicro['fiberG'] != null && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-bold">LOGGET</span>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs font-semibold tabular-nums" style={{ color: barColor }}>{value}{unit}</span>
                              <span className="text-[10px] text-slate-400 dark:text-white/25">/{target}</span>
                              {!isPastSelectedDay && (
                                <>
                                  <button type="button" onClick={() => addMicro(key, -step)} className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 text-sm font-bold flex items-center justify-center leading-none">−</button>
                                  <button type="button" onClick={() => addMicro(key, step)} className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300 text-sm font-bold flex items-center justify-center leading-none">+</button>
                                  <button type="button" onClick={() => { setMicroInputKey(isEditing ? null : key); setMicroInputValue(String(value)); }} className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 text-xs flex items-center justify-center">✏️</button>
                                </>
                              )}
                            </div>
                          </div>
                          {isEditing && (
                            <div className="flex gap-2 mb-1.5">
                              <input
                                type="number"
                                inputMode="decimal"
                                value={microInputValue}
                                onChange={e => setMicroInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') logMicro(key, microInputValue); }}
                                className="flex-1 rounded-xl border border-orange-300 dark:border-orange-500/40 bg-white dark:bg-white/[0.06] px-3 py-1.5 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                                placeholder={`Skriv inn ${unit}`}
                                autoFocus
                              />
                              <button type="button" onClick={() => logMicro(key, microInputValue)} className="rounded-xl bg-orange-500 text-white px-3 py-1.5 text-sm font-semibold">Lagre</button>
                            </div>
                          )}
                          <div className="h-2.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${barColor}88, ${barColor})` }} />
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-white/25 mt-0.5">
                            {pct}% av dagsmål
                            {key === 'fiberG' && fiberIsScanned ? ' · fra matvarer' : (!logged ? ' · estimert' : '')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-5 text-[11px] text-slate-400 dark:text-white/25 text-center leading-relaxed">
                    Trykk + / − for å justere, eller ✏️ for manuell verdi. Verdier er estimert fra kaloriinntak – mål inn faktiske verdier for nøyaktighet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      <style>{`
        @keyframes waterBottleWaveMove {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes waterBottleWaveBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        .water-bottle-wave {
          position: absolute;
          left: -50%;
          width: 200%;
          height: 30px;
          border-radius: 45%;
          animation: waterBottleWaveMove 3.4s linear infinite;
        }
        .water-bottle-wave-back {
          top: -12px;
          background: rgba(255, 255, 255, 0.25);
          animation-duration: 4.1s;
        }
        .water-bottle-wave-front {
          top: -8px;
          background: rgba(255, 255, 255, 0.38);
          animation-duration: 2.7s;
          animation-name: waterBottleWaveMove, waterBottleWaveBob;
          animation-timing-function: linear, ease-in-out;
          animation-iteration-count: infinite, infinite;
        }
        @keyframes flexArmEmoji {
          0%, 100% { transform: rotate(-8deg) scale(1); }
          50% { transform: rotate(0deg) scale(1.14); }
        }
        .flex-arm-emoji {
          font-size: 3rem;
          line-height: 1;
          transform: rotate(-8deg) scale(1);
          transform-origin: 60% 70%;
          filter: drop-shadow(0 4px 8px rgba(234, 88, 12, 0.22));
        }
        .training-flex-active {
          animation: flexArmEmoji 1.15s ease-in-out infinite;
        }

        /* ── Morgenbrev ──────────────────────────────── */
        .morgenbrev-card {
          background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.06) 100%);
          border: 1px solid rgba(99,102,241,0.20);
          animation: morgenbrevGlow 4s ease-in-out infinite;
        }
        .dark .morgenbrev-card {
          background: linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.07) 100%);
          border-color: rgba(99,102,241,0.18);
        }
        @keyframes morgenbrevGlow {
          0%,100% { box-shadow: 0 2px 12px rgba(99,102,241,0.08); }
          50%      { box-shadow: 0 2px 20px rgba(99,102,241,0.18); }
        }

        /* ── Tomorrow forecast ────────────────────────── */
        .tomorrow-forecast-card {
          background: rgba(15,23,42,0.03);
          border: 1px solid rgba(15,23,42,0.08);
          transition: background 200ms ease;
        }
        .tomorrow-forecast-card:active { background: rgba(15,23,42,0.07); }
        .dark .tomorrow-forecast-card {
          background: rgba(255,255,255,0.03);
          border-color: rgba(255,255,255,0.07);
        }
        .dark .tomorrow-forecast-card:active { background: rgba(255,255,255,0.07); }

        /* ── Near-perfect banner ─────────────────────── */
        .near-perfect-banner {
          background: linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.08) 100%);
          border: 1px solid rgba(251,191,36,0.30);
          animation: nearPerfectPulse 3s ease-in-out infinite;
        }
        .dark .near-perfect-banner {
          background: linear-gradient(135deg, rgba(251,191,36,0.10) 0%, rgba(245,158,11,0.06) 100%);
          border-color: rgba(251,191,36,0.20);
        }
        @keyframes nearPerfectPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
          50%       { box-shadow: 0 0 16px 2px rgba(251,191,36,0.18); }
        }

        /* ── Perfect ring — gold glow ────────────────── */
        @keyframes perfectRingPulse {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(251,191,36,0.55)); }
          50%       { filter: drop-shadow(0 0 28px rgba(245,158,11,0.80)); }
        }
        .progress-circle-perfect {
          animation: perfectRingPulse 2.4s ease-in-out infinite;
        }
        .progress-circle-perfect.progress-circle-pumping {
          animation: ringPump 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
                     perfectRingPulse 2.4s ease-in-out 500ms infinite;
        }

        @keyframes greenRingPulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(34,197,94,0.45)); }
          50%       { filter: drop-shadow(0 0 20px rgba(34,197,94,0.70)); }
        }
        .progress-circle-green {
          animation: greenRingPulse 2.8s ease-in-out infinite;
        }

        /* ── Ring proximity aura pulses ─────────────────────── */
        .ring-proximity-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ring-aura {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          pointer-events: none;
          border: 2px solid transparent;
        }

        @keyframes ringAuraPulse {
          0%   { transform: scale(0.96); opacity: 0.7; }
          100% { transform: scale(1.38); opacity: 0; }
        }

        /* warm — slow, blue-grey */
        .ring-aura-warm { border-color: rgba(148,163,184,0.5); }
        .ring-aura-warm.ring-aura-1 { animation: ringAuraPulse 2.8s ease-out infinite; }
        .ring-aura-warm.ring-aura-2 { animation: ringAuraPulse 2.8s ease-out 1.4s infinite; }

        /* hot — medium, orange */
        .ring-aura-hot { border-color: rgba(249,115,22,0.55); }
        .ring-aura-hot.ring-aura-1 { animation: ringAuraPulse 1.8s ease-out infinite; }
        .ring-aura-hot.ring-aura-2 { animation: ringAuraPulse 1.8s ease-out 0.9s infinite; }

        /* burning — fast, red-orange, thicker */
        .ring-aura-burning { border-color: rgba(239,68,68,0.65); border-width: 3px; }
        .ring-aura-burning.ring-aura-1 { animation: ringAuraPulse 1.1s ease-out infinite; }
        .ring-aura-burning.ring-aura-2 { animation: ringAuraPulse 1.1s ease-out 0.37s infinite; }
        .ring-aura-burning.ring-aura-3 { animation: ringAuraPulse 1.1s ease-out 0.74s infinite; }

        /* perfect — soft green */
        .ring-aura-perfect { border-color: rgba(34,197,94,0.55); }
        .ring-aura-perfect.ring-aura-1 { animation: ringAuraPulse 2.2s ease-out infinite; }
        .ring-aura-perfect.ring-aura-2 { animation: ringAuraPulse 2.2s ease-out 1.1s infinite; }

        /* legendary — gold, wider travel */
        @keyframes ringAuraLegendary {
          0%   { transform: scale(0.96); opacity: 0.85; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .ring-aura-legendary { border-color: rgba(251,191,36,0.70); border-width: 2.5px; }
        .ring-aura-legendary.ring-aura-1 { animation: ringAuraLegendary 2s ease-out infinite; }
        .ring-aura-legendary.ring-aura-2 { animation: ringAuraLegendary 2s ease-out 0.67s infinite; }
        .ring-aura-legendary.ring-aura-3 { animation: ringAuraLegendary 2s ease-out 1.34s infinite; }

        /* ── Flame at risk ───────────────────────────── */
        @keyframes flameFlicker {
          0%,100% { opacity: 1;   color: #fb923c; filter: drop-shadow(0 0 3px #f97316); }
          18%     { opacity: 0.35; color: #dc2626; filter: none; }
          36%     { opacity: 0.85; color: #ef4444; filter: drop-shadow(0 0 2px #dc2626); }
          54%     { opacity: 0.25; color: #b91c1c; filter: none; }
          72%     { opacity: 0.7;  color: #f97316; filter: drop-shadow(0 0 4px #f97316); }
        }
        .flame-at-risk {
          animation: flameFlicker 1.4s ease-in-out infinite;
        }

        /* ── Ring pump ───────────────────────────────── */
        @keyframes ringPump {
          0%   { transform: scale(1); }
          28%  { transform: scale(1.06); filter: drop-shadow(0 0 30px rgba(249,115,22,0.55)); }
          55%  { transform: scale(0.97); }
          78%  { transform: scale(1.018); }
          100% { transform: scale(1); filter: none; }
        }
        .progress-circle-pumping {
          animation: ringPump 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        /* ── Hero card shimmer wave ───────────────────── */
        .hero-shimmer {
          position: absolute; inset: 0;
          pointer-events: none; z-index: 1;
          border-radius: inherit;
          background: linear-gradient(105deg,
            transparent 0%, transparent 38%,
            rgba(255,255,255,0.22) 50%,
            transparent 62%, transparent 100%);
          background-size: 220% 100%;
          animation: heroShimmerSweep 6s ease-in-out infinite;
        }
        @keyframes heroShimmerSweep {
          0%   { background-position: 180% 0; opacity: 0; }
          8%   { opacity: 1; }
          40%  { background-position: -40% 0; opacity: 0.6; }
          42%  { opacity: 0; }
          100% { background-position: -40% 0; opacity: 0; }
        }

        /* ── Screen-header bottom wave ────────────────── */
        .screen-header-wave {
          position: absolute; bottom: -6px; left: 0; right: 0; height: 18px;
          pointer-events: none; z-index: 3; overflow: hidden;
        }
        .screen-header-wave::before, .screen-header-wave::after {
          content: ''; position: absolute;
          width: 200%; height: 100%; top: 0; border-radius: 40%;
          animation: headerWaveRoll 5s linear infinite;
        }
        .screen-header-wave::before {
          left: -50%;
          background: rgba(249,115,22,0.10);
          animation-duration: 5s;
        }
        .screen-header-wave::after {
          left: -50%;
          background: rgba(251,146,60,0.07);
          animation-duration: 7s;
          animation-direction: reverse;
        }
        @keyframes headerWaveRoll {
          0%   { transform: translateX(0) scaleY(1); }
          50%  { transform: translateX(25%) scaleY(1.15); }
          100% { transform: translateX(50%) scaleY(1); }
        }

        /* ── Hero rain effect ─────────────────────────── */
        .hero-rain-container {
          position: absolute; inset: 0; pointer-events: none; z-index: 5;
          overflow: hidden; border-radius: inherit;
        }
        .hero-rain-wave {
          position: absolute; inset: 0;
          background: linear-gradient(180deg,
            rgba(56,189,248,0.28) 0%, rgba(14,165,233,0.14) 40%,
            rgba(56,189,248,0.05) 70%, transparent 100%);
          animation: heroRainWaveFall 1.8s cubic-bezier(0.22,0.61,0.36,1) forwards;
        }
        @keyframes heroRainWaveFall {
          0%   { transform: translateY(-100%); opacity: 0; }
          8%   { opacity: 1; }
          50%  { transform: translateY(0); opacity: 0.6; }
          100% { transform: translateY(0); opacity: 0; }
        }
        .hero-rain-drop {
          position: absolute; top: 0; width: 3px;
          border-radius: 50% 50% 46% 46% / 30% 30% 70% 70%;
          background: linear-gradient(180deg,
            rgba(186,237,255,0.95) 0%, rgba(56,189,248,0.88) 60%,
            rgba(14,165,233,0.75) 100%);
          box-shadow: 0 0 6px rgba(56,189,248,0.5), inset 0 1px 0 rgba(255,255,255,0.6);
          animation: heroRainDropFall 1.1s ease-in forwards;
        }
        @keyframes heroRainDropFall {
          0%   { transform: translateY(-20px) scaleY(0.7); opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 0.7; }
          100% { transform: translateY(280px) scaleY(1.4) scaleX(0.7); opacity: 0; }
        }

        /* ── Activity History — full-screen ─────────── */
        .ah-overlay {
          position: fixed; inset: 0; z-index: 1800;
          animation: ahFadeIn 180ms ease both;
        }
        @keyframes ahFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ah-panel {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; overflow: hidden;
          animation: ahSlideIn 320ms cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes ahSlideIn {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .ah-day-cell {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-radius: 14px; padding: 4px 2px;
          transition: background 0.15s ease, transform 0.12s ease;
          animation: ahCellPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        .ah-day-cell:disabled { opacity: 0.25; pointer-events: none; }
        .ah-day-cell:not(:disabled):active { transform: scale(0.84); }
        .ah-day-selected { background: rgba(249,115,22,0.13); outline: 2px solid rgba(249,115,22,0.45); }
        @keyframes ahCellPop {
          from { opacity: 0; transform: scale(0.55); }
          to   { opacity: 1; transform: scale(1); }
        }
        .ah-ring-fill { animation: ahRingDraw 0.65s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes ahRingDraw {
          from { opacity: 0; stroke-dashoffset: 69.12; }
          to   { opacity: 1; }
        }
        .ah-detail-card {
          border-radius: 22px; padding: 18px;
          background: rgba(248,250,252,1);
          border: 1px solid rgba(226,232,240,0.8);
          animation: ahDetailSlide 0.28s cubic-bezier(0.22,1,0.36,1) both;
        }
        .ah-detail-ring-fill { animation: ahRingDraw 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes ahDetailSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ===== ACTIVITY HISTORY MODAL ===== */}
      {showActivityHistory && createPortal(
        <div className="ah-overlay bg-white dark:bg-slate-950">
          <div className="ah-panel bg-white dark:bg-slate-950">
            {/* Header bar */}
            <div className="shrink-0 px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-white/[0.06]">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Aktivitetshistorikk</h2>
                <p className="text-xs text-slate-400 dark:text-white/35 mt-0.5">Trykk en dag for detaljer</p>
              </div>
              <button type="button" onClick={() => setShowActivityHistory(false)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center">
                <X className="w-5 h-5 text-slate-500 dark:text-white/60" />
              </button>
            </div>

            {/* Scrollable area */}
            <div className="overflow-y-auto flex-1 px-5 pb-10">

              {/* Month nav */}
              <div className="flex items-center justify-between mt-5 mb-5">
                <button
                  type="button"
                  onClick={() => setHistoryViewDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
                  className="w-11 h-11 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-white/70" />
                </button>
                <span className="text-lg font-bold text-slate-800 dark:text-white capitalize">{historyMonthLabel}</span>
                <button
                  type="button"
                  onClick={() => setHistoryViewDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
                  disabled={historyViewDate.getFullYear() === today.getFullYear() && historyViewDate.getMonth() >= today.getMonth()}
                  className="w-11 h-11 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center disabled:opacity-25 active:scale-90 transition-transform"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600 dark:text-white/70" />
                </button>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: 'Snitt score', value: `${historyMonthStats.avgScore}%`, color: historyMonthStats.avgScore >= 75 ? 'text-green-500 dark:text-green-400' : historyMonthStats.avgScore >= 50 ? 'text-orange-500' : 'text-slate-400 dark:text-white/40' },
                  { label: 'Dager logget', value: String(historyMonthStats.loggedDays), color: 'text-slate-800 dark:text-white' },
                  { label: 'Streak nå', value: `${streak}d`, color: streak >= 7 ? 'text-orange-500' : 'text-slate-800 dark:text-white' },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/[0.07] px-3 py-4 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 dark:text-white/35 mt-1 font-medium">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Weekday labels */}
              <div className="grid grid-cols-7 mb-2">
                {['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'].map((d) => (
                  <div key={d} className="text-center text-[11px] font-bold text-slate-300 dark:text-white/25 tracking-wide py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid — bigger rings */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {historyMonthDays.map((date, i) => {
                  const key = toDateKey(date);
                  const inMonth = date.getMonth() === historyViewDate.getMonth();
                  const isFuture = date > today;
                  const log = !isFuture ? (logsByDate[key] ?? null) : null;
                  const score = log ? calculateDailyDisciplineScore(log).score : 0;
                  const hasData = log ? (Object.values(log.meals).flat().length > 0 || getTotalHydrationMl(log) > 0 || log.trainingKcal > 0) : false;
                  const isToday = key === todayKey;
                  const isSelected = key === historySelectedKey;
                  const ringR = 14;
                  const ringC = 2 * Math.PI * ringR;
                  const ringOffset = ringC * (1 - (hasData ? score / 100 : 0));
                  const ringColor = score >= 80 ? '#22c55e' : score >= 55 ? '#f97316' : score > 0 ? '#ef4444' : 'rgba(148,163,184,0.25)';
                  const trackColor = inMonth && !isFuture ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.06)';
                  const numColor = !inMonth || isFuture ? 'rgba(148,163,184,0.25)' : isToday ? '#f97316' : hasData ? (score >= 55 ? '#1e293b' : '#64748b') : '#94a3b8';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => inMonth && !isFuture ? setHistorySelectedKey(isSelected ? null : key) : undefined}
                      disabled={!inMonth || isFuture}
                      className={`ah-day-cell ${isSelected ? 'ah-day-selected' : ''}`}
                      style={{ animationDelay: `${i * 10}ms` }}
                    >
                      <svg width="36" height="36" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r={ringR} fill="none" stroke={trackColor} strokeWidth="3" />
                        {hasData && (
                          <circle
                            cx="18" cy="18" r={ringR}
                            fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={ringC} strokeDashoffset={ringOffset}
                            transform="rotate(-90 18 18)"
                            className="ah-ring-fill"
                            style={{ animationDelay: `${i * 10 + 60}ms`, animationDuration: `${0.5 + (score / 100) * 0.9}s` }}
                          />
                        )}
                        {isToday && <circle cx="18" cy="18" r={ringR + 1.5} fill="none" stroke="rgba(249,115,22,0.3)" strokeWidth="1" />}
                        <text x="18" y="22.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={numColor}>
                          {date.getDate()}
                        </text>
                      </svg>
                    </button>
                  );
                })}
              </div>

              {/* Day detail card */}
              {historySelectedKey && historySelectedLog && (() => {
                const log = historySelectedLog;
                const dayConsumed = Object.values(log.meals).flat().reduce((s, f) => s + f.kcal, 0);
                const dayProtein = Object.values(log.meals).flat().reduce((s, f) => s + f.protein, 0);
                const dayWater = getTotalHydrationMl(log);
                const dayTarget = optimizedTargetKcal + log.trainingKcal;
                const dayScore = calculateDailyDisciplineScore(log);
                const detailRings = [
                  { label: 'Kalorier', value: `${kcalNumberFormat.format(dayConsumed)}`, sub: `av ${kcalNumberFormat.format(dayTarget)}`, ratio: Math.min(1, dayConsumed / Math.max(1, dayTarget)), color: '#f97316' },
                  { label: 'Protein', value: `${Math.round(dayProtein)}g`, sub: `av ${smartDietPlan.macros?.proteinG ?? PROTEIN_GOAL_G}g`, ratio: Math.min(1, dayProtein / (smartDietPlan.macros?.proteinG ?? PROTEIN_GOAL_G)), color: '#a855f7' },
                  { label: t('home.stats.water'), value: `${Math.round(dayWater / 100) / 10}L`, sub: `av ${WATER_GOAL_ML / 1000}L`, ratio: Math.min(1, dayWater / WATER_GOAL_ML), color: '#38bdf8' },
                  { label: t('home.stats.training'), value: log.trainingKcal > 0 ? `${log.trainingKcal} kcal` : '—', sub: log.trainingKcal > 0 ? t('home.stats.trained') : t('home.stats.notTrained'), ratio: Math.min(1, log.trainingKcal / 300), color: '#22c55e' },
                ];
                const detailR = 20;
                const detailC = 2 * Math.PI * detailR;
                return (
                  <div className="ah-detail-card mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white/90">{formatDateKey(historySelectedKey)}</p>
                        <p className="text-xs text-slate-400 dark:text-white/40">Disiplinscore: <span className="font-semibold text-slate-700 dark:text-white/70">{dayScore.score}%</span></p>
                      </div>
                      <button type="button" onClick={() => setHistorySelectedKey(null)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                        <X className="w-3 h-3 text-slate-400 dark:text-white/40" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {detailRings.map((ring, ri) => (
                        <div key={ring.label} className="flex flex-col items-center gap-1" style={{ animationDelay: `${ri * 60}ms` }}>
                          <svg width="52" height="52" viewBox="0 0 52 52">
                            <circle cx="26" cy="26" r={detailR} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="4" />
                            <circle
                              cx="26" cy="26" r={detailR}
                              fill="none"
                              stroke={ring.color}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={detailC}
                              strokeDashoffset={detailC * (1 - ring.ratio)}
                              transform="rotate(-90 26 26)"
                              className="ah-detail-ring-fill"
                              style={{ animationDelay: `${ri * 60 + 100}ms`, animationDuration: `${0.45 + ring.ratio * 0.85}s` }}
                            />
                          </svg>
                          <p className="text-[11px] font-bold text-slate-800 dark:text-white/80 leading-none">{ring.value}</p>
                          <p className="text-[9px] text-slate-400 dark:text-white/35 leading-none text-center">{ring.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* Meal breakdown */}
                    {Object.entries(log.meals).some(([, items]) => items.length > 0) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5">
                        {(Object.entries(log.meals) as Array<[MealId, FoodEntry[]]>).map(([mealId, items]) => {
                          if (items.length === 0) return null;
                          const label = mealId === 'breakfast' ? t('home.meals.breakfast') : mealId === 'lunch' ? t('home.meals.lunch') : mealId === 'dinner' ? t('home.meals.dinner') : t('home.meals.snacks');
                          const mealKcal = items.reduce((s, f) => s + f.kcal, 0);
                          return (
                            <div key={mealId} className="flex items-center justify-between">
                              <span className="text-xs text-slate-600 dark:text-white/55">{label}</span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-white/70">{mealKcal} kcal · {items.length} varer</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setDayOffset(Math.round((new Date(historySelectedKey.replace(/-/g, '/')).getTime() - today.getTime()) / 86400000)); setShowActivityHistory(false); }}
                      className="mt-3 w-full py-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold"
                    >
                      Gå til denne dagen →
                    </button>
                  </div>
                );
              })()}

            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Delete confirmation sheet */}
      {/* ===== FLOATING SPEED DIAL ===== */}
      {isTodaySelected && !isPastSelectedDay && createPortal(
        <>
          {speedDialOpen && (
            <div
              className="fixed inset-0 z-[3900]"
              onClick={() => setSpeedDialOpen(false)}
              aria-hidden="true"
            />
          )}
          <div className="fixed bottom-20 right-4 z-[4000] flex flex-col items-end gap-2">
            {speedDialOpen && (
              <div className="flex flex-col items-end gap-2 mb-1">
                {lastLoggedFood && (
                  <div className="flex items-center gap-2">
                    <div className="bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 shadow-lg border border-slate-100 dark:border-white/10">
                      <p className="text-xs font-semibold text-slate-700 dark:text-white/80 leading-tight">{lastLoggedFood.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-white/40">{lastLoggedFood.kcal} kcal · {lastLoggedFood.protein}g P</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { handleQuickAdd('repeat-last'); setSpeedDialOpen(false); }}
                      className="w-11 h-11 rounded-full bg-slate-700 dark:bg-slate-600 text-white shadow-lg flex items-center justify-center"
                      title="Gjenta sist"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 shadow-lg border border-slate-100 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-white/80">Manuelt</span>
                  <button
                    type="button"
                    onClick={() => { setManualAddMeal('snacks'); setSpeedDialOpen(false); }}
                    className="w-11 h-11 rounded-full bg-slate-500 dark:bg-slate-600 text-white shadow-lg flex items-center justify-center"
                    title="Manuelt"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 shadow-lg border border-slate-100 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-white/80">{t('home.scan.barcode')}</span>
                  <button
                    type="button"
                    onClick={() => { openScanTab('barcode'); setSpeedDialOpen(false); }}
                    className="w-11 h-11 rounded-full bg-orange-400 dark:bg-orange-500 text-white shadow-lg flex items-center justify-center"
                    title="Strekkode"
                  >
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-white dark:bg-gray-800 rounded-xl px-3 py-1.5 shadow-lg border border-slate-100 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-white/80">{t('home.scan.takePhoto')}</span>
                  <button
                    type="button"
                    onClick={() => { openScanTab('photo'); setSpeedDialOpen(false); }}
                    className="w-11 h-11 rounded-full bg-orange-500 dark:bg-orange-500 text-white shadow-lg flex items-center justify-center"
                    title="Ta bilde"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSpeedDialOpen((o) => !o)}
              className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${speedDialOpen ? 'bg-slate-700 dark:bg-slate-600 rotate-45' : 'bg-orange-500 hover:bg-orange-600'}`}
              title={speedDialOpen ? 'Lukk' : 'Logg mat'}
              aria-label="Logg mat"
            >
              <Plus className="w-6 h-6 text-white" />
            </button>
          </div>
        </>,
        document.body,
      )}

      {showProteinCelebration && createPortal(
        <GoalCelebrationOverlay
          emoji="💪"
          title="Proteinmål nådd!"
          subtitle={`${Math.round(protein)}g protein i dag`}
          onDismiss={() => setShowProteinCelebration(false)}
        />,
        document.body,
      )}

      {personalBestBanner && createPortal(
        <div className="fixed top-0 left-0 right-0 z-[8000] flex justify-center pointer-events-none">
          <div
            className="m-3 rounded-2xl bg-amber-400 dark:bg-amber-500 text-amber-950 text-sm font-bold px-5 py-3 flex items-center gap-2 shadow-xl"
            style={{ animation: personalBestLeaving
              ? 'pbBannerOut 0.5s cubic-bezier(0.4,0,1,1) both'
              : 'pbBannerIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both, pbBannerPulse 1.2s ease-in-out 0.45s 2'
            }}
          >
            <span role="img" aria-label="trophy">🏆</span>
            <span>{personalBestBanner}</span>
          </div>
        </div>,
        document.body,
      )}

      {/* Feature #21 — inspired-by bottom sheet */}
      {pendingInspirationRef && createPortal(
        <div className="inspiration-sheet-overlay" onClick={() => setPendingInspirationRef(null)}>
          <div className="inspiration-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Ble du inspirert?</p>
            <p className="text-xs text-gray-500 mt-1">"{pendingInspirationRef.title}" av {pendingInspirationRef.authorName}</p>
            <div className="flex gap-2 mt-4">
              <button
                className="inspiration-yes-btn"
                onClick={() => {
                  const counts = JSON.parse(localStorage.getItem('community.inspiredCounts.v1') ?? '{}') as Record<string, number>;
                  counts[pendingInspirationRef.postId] = (counts[pendingInspirationRef.postId] ?? 0) + 1;
                  localStorage.setItem('community.inspiredCounts.v1', JSON.stringify(counts));
                  localStorage.removeItem('community.lastViewedRecipe.v1');
                  setPendingInspirationRef(null);
                }}
              >
                Ja, gi dem +1 🙏
              </button>
              <button className="inspiration-no-btn" onClick={() => setPendingInspirationRef(null)}>Nei</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {pendingDelete && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-4" onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 dark:text-white/90 mb-1">{t('home.deleteConfirm.title')}</p>
            <p className="text-xs text-slate-500 dark:text-white/50 mb-5 truncate">{pendingDelete.name}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-700 dark:text-white/70"
              >
                {t('home.deleteConfirm.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { removeFoodFromMeal(pendingDelete.mealId, pendingDelete.entryId); setPendingDelete(null); }}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold"
              >
                {t('home.deleteConfirm.confirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
