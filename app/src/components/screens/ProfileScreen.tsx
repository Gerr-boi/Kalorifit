import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { Settings, ChevronRight, Bell, Shield, Moon, Globe, HelpCircle, LogOut, Activity, ArrowLeft, Trophy, X, Trash2, AlertTriangle, Check } from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import PrivacyPolicyModal from '../legal/PrivacyPolicyModal';
import TermsModal from '../legal/TermsModal';
import {
  calculateDailyDisciplineScore,
  createEmptyDayLog,
  ensureWeeklyReportForSunday,
  generateWeeklyPerformanceReport,
  startOfDay,
  startOfWeekMonday,
  toDateKey,
  type DayLog,
  type WeeklyPerformanceReport,
} from '../../lib/disciplineEngine';
import {
  ensureMonthlyIdentityReport,
  generateMonthlyIdentityReport,
  getCurrentMonthKey,
  type IdentityReportsByMonth,
} from '../../lib/identityEngine';
import {
  ALL_BADGES,
  type EarnedBadge,
  type BadgeRarity,
} from '../../lib/achievementsEngine';
import {
  calculateBaseTargetKcal,
  DEFAULT_NUTRITION_PROFILE,
  normalizeNutritionProfile,
  type ActivityLevel,
  type BiologicalSex,
  type BehaviorPreference,
  type DietStyle,
  type DietMode,
  type GoalCategory,
  type GoalMode,
  type GoalStrategy,
  type LifestylePattern,
  type MetabolicSensitivity,
  type PlateauSensitivity,
  type PsychologyType,
  type SettingsTier,
  type SpecialPhase,
  type TimelineType,
  type TrainingType,
} from '../../lib/nutritionPlanner';

type BmiEntry = { date: string; bmi: number; weightKg: number; heightCm: number };

type Profile = {
  name: string;
  memberSince: string;
  heightCm: number;
  weightKg: number;
  age: number;
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
  bmiHistory: BmiEntry[];
  profileImageDataUrl?: string | null;
  notificationsEnabled: boolean;
  privacyMode: 'Standard' | 'Privat';
  language: 'Norsk' | 'English';
  socialAnonymousPosting: boolean;
  socialHideWeightNumbers: boolean;
  socialHideBodyPhotos: boolean;
};

const DEFAULT_PROFILE: Profile = {
  name: 'Member',
  memberSince: String(new Date().getFullYear()),
  heightCm: DEFAULT_NUTRITION_PROFILE.heightCm,
  weightKg: DEFAULT_NUTRITION_PROFILE.weightKg,
  age: DEFAULT_NUTRITION_PROFILE.age,
  sex: DEFAULT_NUTRITION_PROFILE.sex,
  activityLevel: DEFAULT_NUTRITION_PROFILE.activityLevel,
  goalMode: DEFAULT_NUTRITION_PROFILE.goalMode,
  dietMode: DEFAULT_NUTRITION_PROFILE.dietMode,
  settingsTier: DEFAULT_NUTRITION_PROFILE.settingsTier,
  goalCategory: DEFAULT_NUTRITION_PROFILE.goalCategory,
  goalStrategy: DEFAULT_NUTRITION_PROFILE.goalStrategy,
  dietStyle: DEFAULT_NUTRITION_PROFILE.dietStyle,
  trainingType: DEFAULT_NUTRITION_PROFILE.trainingType,
  trainingDayCalorieBoost: DEFAULT_NUTRITION_PROFILE.trainingDayCalorieBoost,
  metabolicSensitivity: DEFAULT_NUTRITION_PROFILE.metabolicSensitivity,
  plateauSensitivity: DEFAULT_NUTRITION_PROFILE.plateauSensitivity,
  cycleBasedAdjustments: DEFAULT_NUTRITION_PROFILE.cycleBasedAdjustments,
  cycleStartDate: DEFAULT_NUTRITION_PROFILE.cycleStartDate,
  cycleLengthDays: DEFAULT_NUTRITION_PROFILE.cycleLengthDays,
  lifestylePattern: DEFAULT_NUTRITION_PROFILE.lifestylePattern,
  behaviorPreference: DEFAULT_NUTRITION_PROFILE.behaviorPreference,
  timelineType: DEFAULT_NUTRITION_PROFILE.timelineType,
  timelineWeeks: DEFAULT_NUTRITION_PROFILE.timelineWeeks,
  eventDate: DEFAULT_NUTRITION_PROFILE.eventDate,
  psychologyType: DEFAULT_NUTRITION_PROFILE.psychologyType,
  specialPhase: DEFAULT_NUTRITION_PROFILE.specialPhase,
  bmiHistory: [],
  profileImageDataUrl: null,
  notificationsEnabled: true,
  privacyMode: 'Standard',
  language: 'Norsk',
  socialAnonymousPosting: false,
  socialHideWeightNumbers: false,
  socialHideBodyPhotos: false,
};

const DIET_EXPLORER_OPTIONS: Array<{
  style: DietStyle;
  title: string;
  description: string;
  bestFor: string;
}> = [
  { style: 'standard_balanced', title: 'Standard Balanced', description: 'Balanced carbs, protein, and fats for steady adherence.', bestFor: 'General health and sustainable fat loss.' },
  { style: 'high_protein', title: 'High Protein', description: 'Higher protein split to support satiety and muscle retention.', bestFor: 'Cutting phases and strength-focused plans.' },
  { style: 'low_carb', title: 'Low Carb', description: 'Reduced carbs with higher fat and protein intake.', bestFor: 'Users who feel better with fewer carbs.' },
  { style: 'high_carb_performance', title: 'High Carb Performance', description: 'Carb-forward structure to fuel intense training.', bestFor: 'Running, CrossFit, and high-volume workouts.' },
  { style: 'carb_cycling', title: 'Carb Cycling', description: 'Alternates carb intake based on training demand.', bestFor: 'Performance goals with body composition focus.' },
  { style: 'keto', title: 'Keto', description: 'Very low carb pattern with fat as primary fuel source.', bestFor: 'Users who prefer strict low-carb structures.' },
  { style: 'mediterranean', title: 'Mediterranean', description: 'Whole-food approach with olive oil, fish, legumes, and plants.', bestFor: 'Long-term heart and health-focused nutrition.' },
  { style: 'vegetarian', title: 'Vegetarian', description: 'Plant-forward pattern including dairy and eggs.', bestFor: 'Meat-free lifestyle with flexible protein sources.' },
  { style: 'vegan', title: 'Vegan', description: 'Fully plant-based nutrition pattern.', bestFor: 'Animal-free diet preference.' },
  { style: 'flexible_iifym', title: 'Flexible (IIFYM)', description: 'Macro-driven approach with flexible food choices.', bestFor: 'Users who want structure without rigid food rules.' },
  { style: 'structured_meal_plan', title: 'Structured Meal Plan', description: 'Pre-defined meal rhythm with less decision load.', bestFor: 'Routine-driven users who prefer consistency.' },
];

export default function ProfileScreen({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  const t = useT();
  const { currentUser, updateUserName } = useCurrentUser();
  const { signOut: rawSignOut, deleteAccount } = useSupabaseAuth();
  const signOut = onSignOut ?? rawSignOut;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [profile, setProfile] = useLocalStorageState<Profile>('profile', DEFAULT_PROFILE);
  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', {});
  const [weeklyReports, setWeeklyReports] = useLocalStorageState<Record<string, WeeklyPerformanceReport>>('home.weeklyReports.v1', {});
  const [identityReports, setIdentityReports] = useLocalStorageState<IdentityReportsByMonth>('home.identityReports.v1', {});
  const [earnedBadges] = useLocalStorageState<EarnedBadge[]>('app.earnedBadges.v1', []);
  const [showBmi, setShowBmi] = useState(false);
  const [showPersonalSettings, setShowPersonalSettings] = useState(false);
  const [showDietExplorer, setShowDietExplorer] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [heightCm, setHeightCm] = useState<string>(String(profile.heightCm));
  const [weightKg, setWeightKg] = useState<string>(String(profile.weightKg));
  const [draftName, setDraftName] = useState(profile.name);
  const [draftMemberSince, setDraftMemberSince] = useState(profile.memberSince);
  const [draftProfileImage, setDraftProfileImage] = useState<string | null>(profile.profileImageDataUrl ?? null);
  const [draftAge, setDraftAge] = useState(String(profile.age ?? DEFAULT_NUTRITION_PROFILE.age));
  const [draftSex, setDraftSex] = useState<BiologicalSex>(profile.sex ?? DEFAULT_NUTRITION_PROFILE.sex);
  const [draftActivityLevel, setDraftActivityLevel] = useState<ActivityLevel>(profile.activityLevel ?? DEFAULT_NUTRITION_PROFILE.activityLevel);
  const [draftSettingsTier, setDraftSettingsTier] = useState<SettingsTier>(profile.settingsTier ?? DEFAULT_NUTRITION_PROFILE.settingsTier);
  const [draftGoalCategory, setDraftGoalCategory] = useState<GoalCategory>(profile.goalCategory ?? DEFAULT_NUTRITION_PROFILE.goalCategory);
  const [draftGoalStrategy, setDraftGoalStrategy] = useState<GoalStrategy>(profile.goalStrategy ?? DEFAULT_NUTRITION_PROFILE.goalStrategy);
  const [draftDietStyle, setDraftDietStyle] = useState<DietStyle>(profile.dietStyle ?? DEFAULT_NUTRITION_PROFILE.dietStyle);
  const [draftTrainingType, setDraftTrainingType] = useState<TrainingType>(profile.trainingType ?? DEFAULT_NUTRITION_PROFILE.trainingType);
  const [draftTrainingBoost, setDraftTrainingBoost] = useState(String(profile.trainingDayCalorieBoost ?? DEFAULT_NUTRITION_PROFILE.trainingDayCalorieBoost));
  const [draftMetabolicSensitivity, setDraftMetabolicSensitivity] = useState<MetabolicSensitivity>(profile.metabolicSensitivity ?? DEFAULT_NUTRITION_PROFILE.metabolicSensitivity);
  const [draftPlateauSensitivity, setDraftPlateauSensitivity] = useState<PlateauSensitivity>(profile.plateauSensitivity ?? DEFAULT_NUTRITION_PROFILE.plateauSensitivity);
  const [draftCycleBasedAdjustments, setDraftCycleBasedAdjustments] = useState(Boolean(profile.cycleBasedAdjustments));
  const [draftCycleStartDate, setDraftCycleStartDate] = useState(profile.cycleStartDate ?? '');
  const [draftCycleLengthDays, setDraftCycleLengthDays] = useState(String(profile.cycleLengthDays ?? DEFAULT_NUTRITION_PROFILE.cycleLengthDays));
  const [draftLifestylePattern, setDraftLifestylePattern] = useState<LifestylePattern>(profile.lifestylePattern ?? DEFAULT_NUTRITION_PROFILE.lifestylePattern);
  const [draftBehaviorPreference, setDraftBehaviorPreference] = useState<BehaviorPreference>(profile.behaviorPreference ?? DEFAULT_NUTRITION_PROFILE.behaviorPreference);
  const [draftTimelineType, setDraftTimelineType] = useState<TimelineType>(profile.timelineType ?? DEFAULT_NUTRITION_PROFILE.timelineType);
  const [draftTimelineWeeks, setDraftTimelineWeeks] = useState(String(profile.timelineWeeks ?? DEFAULT_NUTRITION_PROFILE.timelineWeeks));
  const [draftEventDate, setDraftEventDate] = useState(profile.eventDate ?? '');
  const [draftPsychologyType, setDraftPsychologyType] = useState<PsychologyType>(profile.psychologyType ?? DEFAULT_NUTRITION_PROFILE.psychologyType);
  const [draftSpecialPhase, setDraftSpecialPhase] = useState<SpecialPhase>(profile.specialPhase ?? DEFAULT_NUTRITION_PROFILE.specialPhase);
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>('darkMode', false);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const toNumber = (s: string) => {
    const n = Number(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const bmi = (() => {
    const hCm = toNumber(heightCm);
    const wKg = toNumber(weightKg);
    if (!hCm || !wKg || hCm <= 0 || wKg <= 0) return null;
    const hM = hCm / 100;
    return wKg / (hM * hM);
  })();

  const bmiCategory = (b: number) => {
    if (b < 18.5) return t('profile.bmi.underweight');
    if (b < 25) return t('profile.bmi.normal');
    if (b < 30) return t('profile.bmi.overweight');
    return t('profile.bmi.obesity');
  };

  const latestMeasurement = profile.bmiHistory[0] ?? null;
  const previousMeasurement = profile.bmiHistory[1] ?? null;
  const weightDeltaFromLast =
    latestMeasurement && previousMeasurement
      ? Number((latestMeasurement.weightKg - previousMeasurement.weightKg).toFixed(1))
      : null;
  const healthyWeightRange = (() => {
    const hCm = toNumber(heightCm);
    if (!hCm || hCm <= 0) return null;
    const hM = hCm / 100;
    const min = 18.5 * hM * hM;
    const max = 24.9 * hM * hM;
    return { min: Number(min.toFixed(1)), max: Number(max.toFixed(1)) };
  })();

  useEffect(() => {
    setProfile((prev) => {
      const hasCustomName = prev.name?.trim() && prev.name !== DEFAULT_PROFILE.name;
      const nextName = hasCustomName ? prev.name : currentUser.name;
      return { ...DEFAULT_PROFILE, ...prev, name: nextName };
    });
  }, [currentUser.name, setProfile]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const todayLog = logsByDate[todayKey] ?? createEmptyDayLog();
  const profileCalorieGoal = useMemo(
    () => calculateBaseTargetKcal(normalizeNutritionProfile(profile)),
    [profile],
  );
  const dailyDiscipline = useMemo(
    () => calculateDailyDisciplineScore(todayLog, profileCalorieGoal),
    [todayLog, profileCalorieGoal],
  );

  const stats = useMemo(() => {
    const allLogs = Object.values(logsByDate);
    const activeDays = allLogs.filter((log) => Object.values(log.meals).flat().length > 0 || log.waterMl > 0 || log.trainingKcal > 0).length;
    const mealsLogged = allLogs.reduce((sum, log) => sum + Object.values(log.meals).flat().length, 0);
    const caloriesLogged = allLogs.reduce(
      (sum, log) => sum + Object.values(log.meals).flat().reduce((daySum, food) => daySum + food.kcal, 0),
      0,
    );

    return [
      { label: t('profile.statsLabels.days'), value: String(activeDays), color: 'text-orange-500' },
      { label: t('profile.statsLabels.meals'), value: String(mealsLogged), color: 'text-blue-500' },
      { label: t('profile.statsLabels.calories'), value: `${Math.round(caloriesLogged / 1000)}k`, color: 'text-green-500' },
    ];
  }, [logsByDate]);

  const latestWeeklyReport = useMemo(() => {
    const currentWeekStart = startOfWeekMonday(today);
    const weekKey = toDateKey(currentWeekStart);
    return weeklyReports[weekKey] ?? generateWeeklyPerformanceReport(logsByDate, currentWeekStart);
  }, [logsByDate, today, weeklyReports]);

  const monthlyIdentity = useMemo(() => {
    const monthKey = getCurrentMonthKey(today);
    return identityReports[monthKey] ?? generateMonthlyIdentityReport(logsByDate, today);
  }, [identityReports, logsByDate, today]);

  useEffect(() => {
    setWeeklyReports((prev) => ensureWeeklyReportForSunday(new Date(), logsByDate, prev));
  }, [logsByDate, setWeeklyReports]);

  useEffect(() => {
    setIdentityReports((prev) => ensureMonthlyIdentityReport(new Date(), logsByDate, prev));
  }, [logsByDate, setIdentityReports]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const toggleNotifications = () => {
    setProfile((prev) => ({
      ...prev,
      notificationsEnabled: !prev.notificationsEnabled,
    }));
  };

  const togglePrivacyMode = () => {
    setProfile((prev) => ({
      ...prev,
      privacyMode: prev.privacyMode === 'Standard' ? 'Privat' : 'Standard',
    }));
  };

  const toggleLanguage = () => {
    setProfile((prev) => ({
      ...prev,
      language: prev.language === 'Norsk' ? 'English' : 'Norsk',
    }));
  };

  const toggleSocialAnonymous = () => {
    setProfile((prev) => ({
      ...prev,
      socialAnonymousPosting: !prev.socialAnonymousPosting,
    }));
  };

  const toggleHideWeightNumbers = () => {
    setProfile((prev) => ({
      ...prev,
      socialHideWeightNumbers: !prev.socialHideWeightNumbers,
    }));
  };

  const toggleHideBodyPhotos = () => {
    setProfile((prev) => ({
      ...prev,
      socialHideBodyPhotos: !prev.socialHideBodyPhotos,
    }));
  };

  const openPersonalSettings = () => {
    setDraftName(profile.name);
    setDraftMemberSince(profile.memberSince);
    setDraftProfileImage(profile.profileImageDataUrl ?? null);
    setDraftAge(String(profile.age ?? DEFAULT_NUTRITION_PROFILE.age));
    setDraftSex(profile.sex ?? DEFAULT_NUTRITION_PROFILE.sex);
    setDraftActivityLevel(profile.activityLevel ?? DEFAULT_NUTRITION_PROFILE.activityLevel);
    setDraftSettingsTier(profile.settingsTier ?? DEFAULT_NUTRITION_PROFILE.settingsTier);
    setDraftGoalCategory(profile.goalCategory ?? DEFAULT_NUTRITION_PROFILE.goalCategory);
    setDraftGoalStrategy(profile.goalStrategy ?? DEFAULT_NUTRITION_PROFILE.goalStrategy);
    setDraftDietStyle(profile.dietStyle ?? DEFAULT_NUTRITION_PROFILE.dietStyle);
    setDraftTrainingType(profile.trainingType ?? DEFAULT_NUTRITION_PROFILE.trainingType);
    setDraftTrainingBoost(String(profile.trainingDayCalorieBoost ?? DEFAULT_NUTRITION_PROFILE.trainingDayCalorieBoost));
    setDraftMetabolicSensitivity(profile.metabolicSensitivity ?? DEFAULT_NUTRITION_PROFILE.metabolicSensitivity);
    setDraftPlateauSensitivity(profile.plateauSensitivity ?? DEFAULT_NUTRITION_PROFILE.plateauSensitivity);
    setDraftCycleBasedAdjustments(Boolean(profile.cycleBasedAdjustments));
    setDraftCycleStartDate(profile.cycleStartDate ?? '');
    setDraftCycleLengthDays(String(profile.cycleLengthDays ?? DEFAULT_NUTRITION_PROFILE.cycleLengthDays));
    setDraftLifestylePattern(profile.lifestylePattern ?? DEFAULT_NUTRITION_PROFILE.lifestylePattern);
    setDraftBehaviorPreference(profile.behaviorPreference ?? DEFAULT_NUTRITION_PROFILE.behaviorPreference);
    setDraftTimelineType(profile.timelineType ?? DEFAULT_NUTRITION_PROFILE.timelineType);
    setDraftTimelineWeeks(String(profile.timelineWeeks ?? DEFAULT_NUTRITION_PROFILE.timelineWeeks));
    setDraftEventDate(profile.eventDate ?? '');
    setDraftPsychologyType(profile.psychologyType ?? DEFAULT_NUTRITION_PROFILE.psychologyType);
    setDraftSpecialPhase(profile.specialPhase ?? DEFAULT_NUTRITION_PROFILE.specialPhase);
    setShowPersonalSettings(true);
  };

  const savePersonalSettings = () => {
    const nextName = draftName.trim();
    const nextMemberSince = draftMemberSince.trim();
    if (!nextName || !nextMemberSince) return;

    const normalized = normalizeNutritionProfile({
      age: Number(draftAge),
      sex: draftSex,
      activityLevel: draftActivityLevel,
      settingsTier: draftSettingsTier,
      goalCategory: draftGoalCategory,
      goalStrategy: draftGoalStrategy,
      dietStyle: draftDietStyle,
      trainingType: draftTrainingType,
      trainingDayCalorieBoost: Number(draftTrainingBoost),
      metabolicSensitivity: draftMetabolicSensitivity,
      plateauSensitivity: draftPlateauSensitivity,
      cycleBasedAdjustments: draftCycleBasedAdjustments,
      cycleStartDate: draftCycleStartDate || null,
      cycleLengthDays: Number(draftCycleLengthDays),
      lifestylePattern: draftLifestylePattern,
      behaviorPreference: draftBehaviorPreference,
      timelineType: draftTimelineType,
      timelineWeeks: Number(draftTimelineWeeks),
      eventDate: draftEventDate || null,
      psychologyType: draftPsychologyType,
      specialPhase: draftSpecialPhase,
      weightKg: profile.weightKg,
      heightCm: profile.heightCm,
    });

    setProfile((prev) => ({
      ...prev,
      name: nextName,
      memberSince: nextMemberSince,
      profileImageDataUrl: draftProfileImage,
      age: normalized.age,
      sex: normalized.sex,
      activityLevel: normalized.activityLevel,
      goalMode: normalized.goalMode,
      dietMode: normalized.dietMode,
      settingsTier: normalized.settingsTier,
      goalCategory: normalized.goalCategory,
      goalStrategy: normalized.goalStrategy,
      dietStyle: normalized.dietStyle,
      trainingType: normalized.trainingType,
      trainingDayCalorieBoost: normalized.trainingDayCalorieBoost,
      metabolicSensitivity: normalized.metabolicSensitivity,
      plateauSensitivity: normalized.plateauSensitivity,
      cycleBasedAdjustments: normalized.cycleBasedAdjustments,
      cycleStartDate: normalized.cycleStartDate,
      cycleLengthDays: normalized.cycleLengthDays,
      lifestylePattern: normalized.lifestylePattern,
      behaviorPreference: normalized.behaviorPreference,
      timelineType: normalized.timelineType,
      timelineWeeks: normalized.timelineWeeks,
      eventDate: normalized.eventDate,
      psychologyType: normalized.psychologyType,
      specialPhase: normalized.specialPhase,
    }));
    updateUserName(currentUser.id, nextName);
    setShowPersonalSettings(false);
  };

  const applyDietStyle = (style: DietStyle) => {
    const normalized = normalizeNutritionProfile({ dietStyle: style });
    setProfile((prev) => ({
      ...prev,
      dietStyle: normalized.dietStyle,
      dietMode: normalized.dietMode,
    }));
    setShowDietExplorer(false);
  };

  const onPickProfileImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      setDraftProfileImage(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveBmi = () => {
    if (bmi === null) return;

    const hCm = toNumber(heightCm);
    const wKg = toNumber(weightKg);
    if (!hCm || !wKg || hCm <= 0 || wKg <= 0) return;

    const entry: BmiEntry = {
      date: new Date().toISOString().slice(0, 10),
      bmi: Number(bmi.toFixed(1)),
      weightKg: Number(wKg.toFixed(1)),
      heightCm: Number(hCm.toFixed(1)),
    };

    setProfile((prev) => ({
      ...prev,
      heightCm: entry.heightCm,
      weightKg: entry.weightKg,
      bmiHistory: [entry, ...prev.bmiHistory].slice(0, 20),
    }));

    setShowBmi(false);
  };

  const initials = profile.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
  });

  const trendLabel =
    latestWeeklyReport.trendDirection === 'up'
      ? t('profile.trends.upward')
      : latestWeeklyReport.trendDirection === 'down'
      ? t('profile.trends.downward')
      : t('profile.trends.stable');

  const formatDateKey = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return dateFormatter.format(new Date(year, month - 1, day));
  };

  const titleDescriptions: Record<string, string> = {
    'The Grinder': 'High consistency across the month.',
    'The Comeback': 'Strong improvement from early to late month.',
    'The Sharpshooter': 'Precise calorie control with stable execution.',
    'The Iron Discipline': '30+ day discipline streak unlocked.',
    'The Balanced Strategist': 'Balanced performance across calories, protein, water, and activity.',
  };

  const goalStrategyLabel = (profile.goalStrategy ?? DEFAULT_NUTRITION_PROFILE.goalStrategy).split('_').join(' ');
  const dietStyleLabel = (profile.dietStyle ?? DEFAULT_NUTRITION_PROFILE.dietStyle).split('_').join(' ');
  const settingsTierLabel = profile.settingsTier ?? DEFAULT_NUTRITION_PROFILE.settingsTier;
  const xpRingProgress = monthlyIdentity.level.progressPct;

  const metricBarColor = (pct: number) =>
    pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-orange-500' : 'bg-red-500';

  const dayBarColor = (score: number) =>
    score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-orange-400' : score > 0 ? 'bg-amber-300' : 'bg-gray-200 dark:bg-white/[0.06]';

  if (showPersonalSettings) {
    return (
      <div className="screen min-h-screen bg-white dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowPersonalSettings(false)}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
            title="Tilbake"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('profile.personalSettings.title')}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="card dark:bg-gray-800 dark:border-gray-700 m-0">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.profileImageLabel')}</label>
                <div className="mt-2 flex items-center gap-3">
                  {draftProfileImage ? (
                    <img
                      src={draftProfileImage}
                      alt="Profilbilde"
                      className="w-16 h-16 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-lg font-semibold text-gray-600 dark:text-gray-200">
                      {initials || 'U'}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => profileImageInputRef.current?.click()}
                      className="rounded-xl bg-orange-500 px-3 py-2 text-white text-sm font-medium"
                    >
                      {t('profile.personalSettings.chooseImage')}
                    </button>
                    {draftProfileImage && (
                      <button
                        onClick={() => setDraftProfileImage(null)}
                        className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-3 py-2 text-sm font-medium"
                      >
                        {t('profile.personalSettings.removeImage')}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={profileImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickProfileImage}
                  className="hidden"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.nameLabel')}</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.personalSettings.namePlaceholder')}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.memberSinceLabel')}</label>
                <input
                  value={draftMemberSince}
                  onChange={(e) => setDraftMemberSince(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.personalSettings.memberSincePlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.ageLabel')}</label>
                  <input
                    inputMode="numeric"
                    value={draftAge}
                    onChange={(e) => setDraftAge(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                    placeholder={t('profile.personalSettings.agePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.genderLabel')}</label>
                  <select
                    value={draftSex}
                    onChange={(e) => setDraftSex(e.target.value as BiologicalSex)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="female">{t('profile.personalSettings.female')}</option>
                    <option value="male">{t('profile.personalSettings.male')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.activityLabel')}</label>
                <select
                  value={draftActivityLevel}
                  onChange={(e) => setDraftActivityLevel(e.target.value as ActivityLevel)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="sedentary">{t('profile.activityLabels.sedentary')}</option>
                  <option value="light">{t('profile.activityLabels.light')}</option>
                  <option value="moderate">{t('profile.activityLabels.moderate')}</option>
                  <option value="very">{t('profile.activityLabels.very')}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.configLevelLabel')}</label>
                <select
                  value={draftSettingsTier}
                  onChange={(e) => setDraftSettingsTier(e.target.value as SettingsTier)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="basic">{t('profile.personal.basicMode')}</option>
                  <option value="advanced">{t('profile.personal.advancedMode')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.goalCategoryLabel')}</label>
                  <select
                    value={draftGoalCategory}
                    onChange={(e) => setDraftGoalCategory(e.target.value as GoalCategory)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="fat_loss">{t('profile.goalCategoryLabels.fat_loss')}</option>
                    <option value="muscle_gain">{t('profile.goalCategoryLabels.muscle_gain')}</option>
                    <option value="recomp">{t('profile.goalCategoryLabels.recomp')}</option>
                    <option value="performance">{t('profile.goalCategoryLabels.performance')}</option>
                    <option value="health">{t('profile.goalCategoryLabels.health')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.dietStyleLabel')}</label>
                  <select
                    value={draftDietStyle}
                    onChange={(e) => setDraftDietStyle(e.target.value as DietStyle)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="standard_balanced">{t('profile.dietStyleLabels.standard_balanced')}</option>
                    <option value="high_protein">{t('profile.dietStyleLabels.high_protein')}</option>
                    <option value="low_carb">{t('profile.dietStyleLabels.low_carb')}</option>
                    <option value="high_carb_performance">{t('profile.dietStyleLabels.high_carb_performance')}</option>
                    <option value="carb_cycling">{t('profile.dietStyleLabels.carb_cycling')}</option>
                    <option value="keto">{t('profile.dietStyleLabels.keto')}</option>
                    <option value="mediterranean">{t('profile.dietStyleLabels.mediterranean')}</option>
                    <option value="vegetarian">{t('profile.dietStyleLabels.vegetarian')}</option>
                    <option value="vegan">{t('profile.dietStyleLabels.vegan')}</option>
                    <option value="flexible_iifym">{t('profile.dietStyleLabels.flexible_iifym')}</option>
                    <option value="structured_meal_plan">{t('profile.dietStyleLabels.structured_meal_plan')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.goalStrategyLabel')}</label>
                <select
                  value={draftGoalStrategy}
                  onChange={(e) => setDraftGoalStrategy(e.target.value as GoalStrategy)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="slow_cut">{t('profile.goalStrategyLabels.slow_cut')}</option>
                  <option value="standard_cut">{t('profile.goalStrategyLabels.standard_cut')}</option>
                  <option value="aggressive_cut">{t('profile.goalStrategyLabels.aggressive_cut')}</option>
                  <option value="event_prep">{t('profile.goalStrategyLabels.event_prep')}</option>
                  <option value="lean_bulk">{t('profile.goalStrategyLabels.lean_bulk')}</option>
                  <option value="standard_bulk">{t('profile.goalStrategyLabels.standard_bulk')}</option>
                  <option value="aggressive_bulk">{t('profile.goalStrategyLabels.aggressive_bulk')}</option>
                  <option value="high_protein_maintenance">{t('profile.goalStrategyLabels.high_protein_maintenance')}</option>
                  <option value="fat_reduction_no_scale">{t('profile.goalStrategyLabels.fat_reduction_no_scale')}</option>
                  <option value="strength_focus">{t('profile.goalStrategyLabels.strength_focus')}</option>
                  <option value="endurance_focus">{t('profile.goalStrategyLabels.endurance_focus')}</option>
                  <option value="hybrid_athlete">{t('profile.goalStrategyLabels.hybrid_athlete')}</option>
                  <option value="blood_markers">{t('profile.goalStrategyLabels.blood_markers')}</option>
                  <option value="stable_energy">{t('profile.goalStrategyLabels.stable_energy')}</option>
                  <option value="hormonal_balance">{t('profile.goalStrategyLabels.hormonal_balance')}</option>
                  <option value="gut_health">{t('profile.goalStrategyLabels.gut_health')}</option>
                </select>
              </div>

              {draftSettingsTier === 'advanced' && (
                <div className="space-y-3 rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">{t('profile.personalSettings.advancedSystemLabel')}</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.trainingTypeLabel')}</label>
                      <select value={draftTrainingType} onChange={(e) => setDraftTrainingType(e.target.value as TrainingType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="strength">{t('profile.trainingTypeLabels.strength')}</option>
                        <option value="running">{t('profile.trainingTypeLabels.running')}</option>
                        <option value="crossfit">{t('profile.trainingTypeLabels.crossfit')}</option>
                        <option value="cycling">{t('profile.trainingTypeLabels.cycling')}</option>
                        <option value="mixed">{t('profile.trainingTypeLabels.mixed')}</option>
                        <option value="sedentary">{t('profile.trainingTypeLabels.sedentary')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.trainingDayBoostLabel')}</label>
                      <input inputMode="numeric" value={draftTrainingBoost} onChange={(e) => setDraftTrainingBoost(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.metabolicLabel')}</label>
                      <select value={draftMetabolicSensitivity} onChange={(e) => setDraftMetabolicSensitivity(e.target.value as MetabolicSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="gain_easy">{t('profile.metabolicLabels.gain_easily')}</option>
                        <option value="normal">{t('profile.metabolicLabels.normal')}</option>
                        <option value="lose_easy">{t('profile.metabolicLabels.lose_easily')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.plateauLabel')}</label>
                      <select value={draftPlateauSensitivity} onChange={(e) => setDraftPlateauSensitivity(e.target.value as PlateauSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="conservative">{t('profile.plateauLabels.conservative')}</option>
                        <option value="standard">{t('profile.plateauLabels.standard')}</option>
                        <option value="aggressive">{t('profile.plateauLabels.aggressive')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.lifestyleLabel')}</label>
                      <select value={draftLifestylePattern} onChange={(e) => setDraftLifestylePattern(e.target.value as LifestylePattern)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="3_meals">{t('profile.lifestyleLabels.three_meals')}</option>
                        <option value="4_meals">{t('profile.lifestyleLabels.four_meals')}</option>
                        <option value="5_small_meals">{t('profile.lifestyleLabels.five_small')}</option>
                        <option value="if_16_8">{t('profile.lifestyleLabels.intermittent_16_8')}</option>
                        <option value="omad">{t('profile.lifestyleLabels.omad')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.behaviorLabel')}</label>
                      <select value={draftBehaviorPreference} onChange={(e) => setDraftBehaviorPreference(e.target.value as BehaviorPreference)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="strict">{t('profile.behaviorLabels.strict_structure')}</option>
                        <option value="flexible">{t('profile.behaviorLabels.flexible_approach')}</option>
                        <option value="coaching">{t('profile.behaviorLabels.coaching_reminders')}</option>
                        <option value="minimal">{t('profile.behaviorLabels.minimal_reminders')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.timelineLabel')}</label>
                      <select value={draftTimelineType} onChange={(e) => setDraftTimelineType(e.target.value as TimelineType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="8_week_cut">{t('profile.timelineLabels.eight_week_cut')}</option>
                        <option value="12_week_bulk">{t('profile.timelineLabels.twelve_week_bulk')}</option>
                        <option value="maintenance_open">{t('profile.timelineLabels.maintenance_open')}</option>
                        <option value="event_based">{t('profile.timelineLabels.event_based')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.weeksLabel')}</label>
                      <input inputMode="numeric" value={draftTimelineWeeks} onChange={(e) => setDraftTimelineWeeks(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  {draftTimelineType === 'event_based' && (
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.eventDateLabel')}</label>
                      <input type="date" value={draftEventDate} onChange={(e) => setDraftEventDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.psychologyLabel')}</label>
                      <select value={draftPsychologyType} onChange={(e) => setDraftPsychologyType(e.target.value as PsychologyType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="data_driven">{t('profile.psychologyLabels.data_driven')}</option>
                        <option value="visual">{t('profile.psychologyLabels.visual_learner')}</option>
                        <option value="competitive">{t('profile.psychologyLabels.competitive')}</option>
                        <option value="community">{t('profile.psychologyLabels.community_focused')}</option>
                        <option value="private">{t('profile.psychologyLabels.private_tracker')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personalSettings.specialPhaseLabel')}</label>
                      <select value={draftSpecialPhase} onChange={(e) => setDraftSpecialPhase(e.target.value as SpecialPhase)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="normal">{t('profile.specialPhaseLabels.normal')}</option>
                        <option value="reverse_diet">{t('profile.specialPhaseLabels.reverse_diet')}</option>
                        <option value="recovery">{t('profile.specialPhaseLabels.recovery_phase')}</option>
                        <option value="smart_auto">{t('profile.specialPhaseLabels.smart_auto')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input type="checkbox" checked={draftCycleBasedAdjustments} onChange={(e) => setDraftCycleBasedAdjustments(e.target.checked)} />
                      {t('profile.personalSettings.cycleAdjLabel')}
                    </label>
                    {draftCycleBasedAdjustments && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input type="date" value={draftCycleStartDate} onChange={(e) => setDraftCycleStartDate(e.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
                        <input inputMode="numeric" value={draftCycleLengthDays} onChange={(e) => setDraftCycleLengthDays(e.target.value)} placeholder={t('profile.personalSettings.cycleDaysPlaceholder')} className="rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowPersonalSettings(false)}
              className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-4 py-2 font-medium"
            >
              {t('profile.personalSettings.cancelButton')}
            </button>
            <button
              onClick={savePersonalSettings}
              className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
            >
              {t('profile.personalSettings.saveButton')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="profile-header">
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={() => setShowIdentity(true)}
            className="w-10 h-10 bg-amber-400/90 rounded-full flex items-center justify-center"
            title="Performance og level"
          >
            <Trophy className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={openPersonalSettings}
            className="w-10 h-10 bg-orange-500 hover:bg-orange-400 rounded-full flex items-center justify-center shadow-sm transition-colors"
            title="Rediger profil"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-44 rounded-full blur-3xl opacity-25 bg-amber-400 pointer-events-none" />
            <div
              className="mb-4 rounded-full p-[6px]"
              style={{
                background: `conic-gradient(#f59e0b ${xpRingProgress}%, rgba(255,255,255,0.20) ${xpRingProgress}% 100%)`,
              }}
            >
              {profile.profileImageDataUrl ? (
                <img
                  src={profile.profileImageDataUrl}
                  alt={profile.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/50 bg-white"
                />
              ) : (
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-5xl border-4 border-white/50">
                  {initials || 'U'}
                </div>
              )}
            </div>
            <div
              className="absolute bottom-5 right-0 h-4 w-4 rounded-full border-2 border-white bg-green-500 shadow-sm"
              title="Aktiv"
              aria-label="Aktiv profilstatus"
            />
          </div>
          <div className="mt-5 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-0.5">{profile.name}</h2>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{monthlyIdentity.primaryTitle} · Level {monthlyIdentity.level.value}</p>
            <p className="text-xs text-gray-400 dark:text-white/50 mt-1">{t('profile.memberSince')} {profile.memberSince}</p>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <p className="stat-value">{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 mx-4 rounded-2xl p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/25 dark:to-orange-900/15 border border-amber-200/70 dark:border-amber-700/30">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
              <h3 className="text-base font-black text-gray-900 dark:text-white tracking-tight uppercase">{monthlyIdentity.primaryTitle}</h3>
            </div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Level {monthlyIdentity.level.value} · {monthlyIdentity.level.label}
            </p>
          </div>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums shrink-0 ml-2">
            {monthlyIdentity.level.currentXp}/{monthlyIdentity.level.nextLevelXp} XP
          </span>
        </div>
        <div className="h-3 bg-amber-200/50 dark:bg-amber-900/50 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
            style={{ width: `${monthlyIdentity.level.progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
            {Math.max(0, monthlyIdentity.level.nextLevelXp - monthlyIdentity.level.currentXp)} XP til Level {monthlyIdentity.level.value + 1}
          </p>
          <button onClick={() => setShowIdentity(true)} className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {t('profile.seeAchievements')}
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('profile.smartDietProfile')}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white/90">{goalStrategyLabel}</p>
            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
              {dietStyleLabel} · {settingsTierLabel}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDietExplorer(true)}
              className="text-xs rounded-lg bg-gray-100 dark:bg-white/[0.08] text-gray-600 dark:text-white/60 px-3 py-1.5 font-medium"
            >
              {t('profile.exploreButton')}
            </button>
            <button
              type="button"
              onClick={openPersonalSettings}
              className="text-xs rounded-lg bg-orange-500 text-white px-3 py-1.5 font-medium"
            >
              {t('profile.changeButton')}
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('profile.dailyDiscipline')}</p>
            <p className="text-xs text-gray-400 dark:text-white/40">{t('profile.disciplineScore.subtitle')}</p>
          </div>
          <div className="flex flex-col items-center">
            {(() => {
              const r = 26;
              const circ = 2 * Math.PI * r;
              const progress = circ * (dailyDiscipline.score / 100);
              const col = dailyDiscipline.score >= 90 ? '#22c55e' : dailyDiscipline.score >= 70 ? '#f97316' : '#ef4444';
              return (
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r={r} fill="none"
                    stroke={col} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ - progress}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '32px 32px' }}
                  />
                  <text x="32" y="37" textAnchor="middle" style={{ fontSize: '15px', fontWeight: '800', fill: col }}>{dailyDiscipline.score}</text>
                </svg>
              );
            })()}
            <p className="text-[10px] text-gray-400 dark:text-white/40 -mt-1">{dailyDiscipline.grade}</p>
          </div>
        </div>

        <div className="space-y-4">
          {dailyDiscipline.metrics.map((metric) => (
            <div key={metric.key}>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-white/60">{metric.label}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white/90">{metric.percent}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${metricBarColor(metric.percent)}`} style={{ width: `${metric.percent}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-400 dark:text-white/35">
                <span>{metric.progressLabel}</span>
                <span>{metric.targetLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {dailyDiscipline.accomplished.length === 0 && dailyDiscipline.missing.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-white/30 px-1">{t('profile.noDataToday')}</p>
          )}
          {dailyDiscipline.accomplished.map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm text-gray-700 dark:text-white/70">{item}</span>
            </div>
          ))}
          {dailyDiscipline.missing.map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              </div>
              <span className="text-sm text-gray-500 dark:text-white/50">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('profile.weeklyReport.title')}</p>
            <p className="text-xs text-gray-400 dark:text-white/40">{t('profile.weeklyReport.subtitle')}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/40">
            {latestWeeklyReport.weekStartKey}–{latestWeeklyReport.weekEndKey}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3">
            <p className="text-xs text-gray-400 dark:text-white/40 mb-1">{t('profile.weeklyReport.avgScore')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white/90">{latestWeeklyReport.avgDisciplineScore}</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3">
            <p className="text-xs text-gray-400 dark:text-white/40 mb-1">{t('profile.weeklyReport.trend')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white/90">{trendLabel}</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3">
            <p className="text-xs text-gray-400 dark:text-white/40 mb-1">{t('profile.weeklyReport.bestDay')}</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-white/70">
              {formatDateKey(latestWeeklyReport.bestDay.dateKey)} ({latestWeeklyReport.bestDay.score})
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06] p-3">
            <p className="text-xs text-gray-400 dark:text-white/40 mb-1">{t('profile.weeklyReport.worstDay')}</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-white/70">
              {formatDateKey(latestWeeklyReport.worstDay.dateKey)} ({latestWeeklyReport.worstDay.score})
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.06]">
          <p className="text-xs text-gray-400 dark:text-white/40">{t('profile.weeklyReport.streak')}</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-white/70">{latestWeeklyReport.streakStatus}</p>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {latestWeeklyReport.days.map((day) => (
            <div key={day.dateKey} className="flex flex-col items-center gap-1">
              <p className="text-[9px] text-gray-400 dark:text-white/30">{formatDateKey(day.dateKey)}</p>
              <div className="w-full flex flex-col justify-end h-10 rounded-sm overflow-hidden bg-gray-100 dark:bg-white/[0.06]">
                <div
                  className={`w-full ${dayBarColor(day.score)}`}
                  style={{ height: `${Math.max(3, Math.round((day.score / 100) * 40))}px` }}
                />
              </div>
              <p className="text-[9px] font-semibold text-gray-600 dark:text-white/60">{day.score}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Health disclaimer */}
      <div className="mt-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          {t('profile.healthDisclaimer')}
        </p>
      </div>

      <div className="card mt-4 p-0 overflow-hidden">
        <button
          onClick={toggleNotifications}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.notifications')}</span>
          </div>
          <span className="text-sm text-gray-400 dark:text-white/40">{profile.notificationsEnabled ? t('profile.on') : t('profile.off')}</span>
        </button>

        <button
          onClick={togglePrivacyMode}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.privacy')}</span>
          </div>
          <span className="text-sm text-gray-400 dark:text-white/40">{profile.privacyMode}</span>
        </button>

        {[
          { label: t('profile.settingsMenu.anonymousPosting'), value: profile.socialAnonymousPosting, toggle: toggleSocialAnonymous },
          { label: t('profile.settingsMenu.hideWeight'), value: profile.socialHideWeightNumbers, toggle: toggleHideWeightNumbers },
          { label: t('profile.settingsMenu.hideBodyPhotos'), value: profile.socialHideBodyPhotos, toggle: toggleHideBodyPhotos },
        ].map(({ label, value, toggle }) => (
          <button
            key={label}
            type="button"
            onClick={toggle}
            className="w-full flex items-center justify-between pl-12 pr-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.015]"
          >
            <span className="text-sm text-gray-600 dark:text-white/60">{label}</span>
            <div className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-orange-500' : 'bg-gray-200 dark:bg-white/10'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        ))}

        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <Moon className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.darkMode')}</span>
          </div>
          <span className="text-sm text-gray-400 dark:text-white/40">{darkMode ? t('profile.on') : t('profile.off')}</span>
        </button>

        <button
          onClick={toggleLanguage}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.language')}</span>
          </div>
          <span className="text-sm text-gray-400 dark:text-white/40">{profile.language}</span>
        </button>

        <button
          onClick={() => setShowBmi(true)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors border-b border-gray-100 dark:border-white/[0.06]"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.measurements')}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/20" />
        </button>

        <button
          onClick={() => setShowHelp(true)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-gray-400 dark:text-white/40 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-white/80">{t('profile.settingsMenu.help')}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-white/20" />
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={() => signOut()}
        className="w-full flex items-center justify-center gap-2 p-4 mt-4 text-red-500 font-medium"
      >
        <LogOut className="w-5 h-5" />
        {t('profile.logOut')}
      </button>

      {/* Legal links */}
      <div className="flex justify-center gap-4 mt-2 pb-1">
        <button
          onClick={() => setShowPrivacy(true)}
          className="text-xs text-gray-400 dark:text-zinc-500 underline underline-offset-2 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          {t('profile.privacyPolicy')}
        </button>
        <button
          onClick={() => setShowTerms(true)}
          className="text-xs text-gray-400 dark:text-zinc-500 underline underline-offset-2 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          {t('profile.termsOfService')}
        </button>
      </div>

      {/* Delete account */}
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="w-full flex items-center justify-center gap-2 p-3 mt-1 mb-6 text-gray-400 dark:text-zinc-500 text-sm hover:text-red-500 dark:hover:text-red-400 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {t('profile.deleteAccount')}
      </button>

      {/* Delete account confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">{t('profile.deleteConfirm.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{t('profile.deleteConfirm.warning')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-zinc-300 mb-6 leading-relaxed">
              {t('profile.deleteConfirm.body')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 font-medium text-sm"
              >
                {t('profile.deleteConfirm.cancel')}
              </button>
              <button
                disabled={deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  await deleteAccount();
                  setDeleteLoading(false);
                  setShowDeleteConfirm(false);
                  window.location.reload();
                }}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? t('profile.deleteConfirm.deleting') : t('profile.deleteConfirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

      {/* Help & Support modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">{t('profile.help.title')}</h2>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">KaloriFit — v1.0</p>
                </div>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-600 dark:text-zinc-300" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-4 space-y-5 text-sm text-gray-700 dark:text-zinc-300">

              {/* Contact */}
              <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-700/30 p-4">
                <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-1">{t('profile.help.contact')}</p>
                <p className="text-sm text-gray-700 dark:text-zinc-300">
                  {t('profile.help.contactBody')}
                </p>
                <p className="mt-1 font-medium text-orange-500">support@kalorifit.no</p>
              </div>

              {/* FAQ */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">{t('profile.help.faqTitle')}</p>
                <div className="space-y-3">
                  {[
                    { q: t('profile.help.faq.q1'), a: t('profile.help.faq.a1') },
                    { q: t('profile.help.faq.q2'), a: t('profile.help.faq.a2') },
                    { q: t('profile.help.faq.q3'), a: t('profile.help.faq.a3') },
                    { q: t('profile.help.faq.q4'), a: t('profile.help.faq.a4') },
                    { q: t('profile.help.faq.q5'), a: t('profile.help.faq.a5') },
                  ].map(({ q, a }) => (
                    <div key={q} className="rounded-xl border border-gray-100 dark:border-zinc-800 p-3">
                      <p className="font-semibold text-gray-800 dark:text-white text-sm mb-1">{q}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">{a}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legal links */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowHelp(false); setShowPrivacy(true); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t('profile.privacyPolicy')}
                </button>
                <button
                  onClick={() => { setShowHelp(false); setShowTerms(true); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {t('profile.termsOfService')}
                </button>
              </div>

            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {t('profile.help.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDietExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('profile.dietExplorerModal.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.dietExplorerModal.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowDietExplorer(false)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
                title="Lukk"
              >
                <X className="w-4 h-4 text-gray-700 dark:text-gray-200" />
              </button>
            </div>

            <div className="space-y-2">
              {DIET_EXPLORER_OPTIONS.map((option) => {
                const isActive = option.style === profile.dietStyle;
                return (
                  <div
                    key={option.style}
                    className={`rounded-xl border p-3 ${isActive ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {option.title} {isActive ? t('profile.dietExplorerModal.active') : ''}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{option.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Best for: {option.bestFor}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyDietStyle(option.style)}
                        disabled={isActive}
                        className={`text-xs rounded-lg px-3 py-1.5 font-medium ${isActive ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'bg-emerald-100 text-emerald-700'}`}
                      >
                        {isActive ? t('profile.dietExplorerModal.selectedButton') : t('profile.dietExplorerModal.useButton')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showIdentity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('profile.identityModal.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.identityModal.monthlyUpdate')}{monthlyIdentity.monthKey}</p>
              </div>
              <button
                onClick={() => setShowIdentity(false)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
                title="Lukk"
              >
                <X className="w-4 h-4 text-gray-700 dark:text-gray-200" />
              </button>
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                <p className="text-base font-semibold text-amber-700 dark:text-amber-100">{monthlyIdentity.primaryTitle}</p>
              </div>
              <p className="text-xs text-amber-700/90 dark:text-amber-200 mt-1">{titleDescriptions[monthlyIdentity.primaryTitle]}</p>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <div className="flex justify-between items-end">
                <p className="text-sm text-gray-600 dark:text-gray-300">Level {monthlyIdentity.level.value} - {monthlyIdentity.level.label}</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {monthlyIdentity.level.currentXp}/{monthlyIdentity.level.nextLevelXp} XP
                </p>
              </div>
              <div className="h-2 bg-white dark:bg-gray-600 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full progress-bar-animated transition-all duration-700"
                  style={{ width: `${monthlyIdentity.level.progressPct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.identityModal.avgDiscipline')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.avgDisciplineScore}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.identityModal.consistency')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.consistencyRate}%</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.identityModal.bestStreak')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{t('profile.identityModal.bestStreakDays').replace('{n}', String(monthlyIdentity.bestStreakDays))}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.identityModal.challenges')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.challengeCompletions}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.identityModal.xpSources')}</p>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.identityModal.logging')}</span>
                  <span>{monthlyIdentity.xpBreakdown.logging} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.identityModal.hittingGoals')}</span>
                  <span>{monthlyIdentity.xpBreakdown.goals} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.identityModal.completingChallenges')}</span>
                  <span>{monthlyIdentity.xpBreakdown.challenges} XP</span>
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 flex justify-between">
                <p className="font-semibold text-gray-700 dark:text-gray-200">{t('profile.identityModal.total')}</p>
                <p className="font-semibold text-amber-600 dark:text-amber-300">{monthlyIdentity.xpBreakdown.total} XP</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.identityModal.unlockedTitles')}</p>
              <div className="space-y-2">
                {monthlyIdentity.unlockedTitles.map((title) => (
                  <div key={title} className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{titleDescriptions[title]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Badge Collection */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t('profile.identityModal.achievements')}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {earnedBadges.length}/{ALL_BADGES.length}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {ALL_BADGES.map((badge) => {
                  const earned = earnedBadges.some((e) => e.badgeId === badge.id);
                  const rarityColors: Record<BadgeRarity, string> = {
                    common:    'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
                    rare:      'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
                    epic:      'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700',
                    legendary: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700',
                  };
                  return (
                    <div
                      key={badge.id}
                      title={earned ? `${badge.name}: ${badge.description}` : '???'}
                      className={`aspect-square rounded-xl border flex items-center justify-center text-xl transition-all ${
                        earned
                          ? rarityColors[badge.rarity]
                          : 'bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 grayscale opacity-40'
                      }`}
                    >
                      <span style={{ filter: earned ? 'none' : 'blur(2px)' }}>
                        {earned ? badge.icon : '?'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showBmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 -mt-24">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('profile.bmiModal.title')}</h3>
              <button
                onClick={() => setShowBmi(false)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
              >
                x
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.bmiModal.latestWeight')}</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {latestMeasurement ? `${latestMeasurement.weightKg} kg` : `${profile.weightKg} kg`}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.bmiModal.changeSinceLast')}</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {weightDeltaFromLast === null ? '--' : `${weightDeltaFromLast > 0 ? '+' : ''}${weightDeltaFromLast} kg`}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.bmiModal.heightLabel')}</label>
                <input
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.bmiModal.heightPlaceholder')}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.bmiModal.weightLabel')}</label>
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.bmiModal.weightPlaceholder')}
                />
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                {bmi === null ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.bmiModal.enterToCalc')}</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.bmiModal.yourBmiNow')}</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{bmi.toFixed(1)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{bmiCategory(bmi)}</p>
                    </div>
                    {healthyWeightRange && (
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {t('profile.bmiModal.healthyWeight').replace('{min}', String(healthyWeightRange.min)).replace('{max}', String(healthyWeightRange.max))}
                      </p>
                    )}
                    <button
                      onClick={saveBmi}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
                    >
                      {t('profile.bmiModal.saveMeasurement')}
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-500">
                {t('profile.bmiModal.tip')}
              </p>

              {profile.bmiHistory.length > 0 && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.bmiModal.recentTitle')}</p>
                  <div className="space-y-1">
                    {profile.bmiHistory.slice(0, 3).map((entry) => (
                      <p key={`${entry.date}-${entry.bmi}`} className="text-xs text-gray-600 dark:text-gray-300">
                        {entry.date}: {entry.weightKg} kg, {entry.heightCm} cm, BMI {entry.bmi}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-4 pb-8">
        {t('profile.version')}
      </p>
    </div>
  );
}
