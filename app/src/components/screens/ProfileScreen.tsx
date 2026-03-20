import { Activity, ArrowLeft, Bell, ChevronDown, ChevronRight, Globe, HelpCircle, LogOut, Moon, Settings, Shield, Trophy, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useT } from '../../lib/i18n';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import {
  addDays,
  calculateDailyDisciplineScore,
  CALORIE_GOAL,
  createEmptyDayLog,
  ensureWeeklyReportForSunday,
  getTotalHydrationMl,
  generateWeeklyPerformanceReport,
  PROTEIN_GOAL_G,
  startOfDay,
  startOfWeekMonday,
  toDateKey,
  WATER_GOAL_ML,
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
  evaluateTrophyBadges,
  getBadgeStyleById,
  type TrophyBadgeId,
} from '../../lib/trophySystem';
import {
  DEFAULT_NUTRITION_PROFILE,
  normalizeNutritionProfile,
  type ActivityLevel,
  type BehaviorPreference,
  type BiologicalSex,
  type DietMode,
  type DietStyle,
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
type HealthEntry = {
  date: string;
  waistCm: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  stressLevel: number | null;
  steps: number | null;
};
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
  healthHistory: HealthEntry[];
  profileImageDataUrl?: string | null;
  notificationsEnabled: boolean;
  privacyMode: 'Standard' | 'Privat';
  language: 'Norsk' | 'English';
  socialAnonymousPosting: boolean;
  socialHideWeightNumbers: boolean;
  socialHideBodyPhotos: boolean;
  allergies: string[];
  equippedBadgeIds: TrophyBadgeId[];
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
  healthHistory: [],
  profileImageDataUrl: null,
  notificationsEnabled: true,
  privacyMode: 'Standard',
  language: 'Norsk',
  socialAnonymousPosting: false,
  socialHideWeightNumbers: false,
  socialHideBodyPhotos: false,
  allergies: [],
  equippedBadgeIds: [],
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
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_WEEKLY_REPORTS: Record<string, WeeklyPerformanceReport> = {};
const EMPTY_IDENTITY_REPORTS: IdentityReportsByMonth = {};

export default function ProfileScreen() {
  const t = useT();

  const dietStyleTitles: Record<string, string> = {
    standard_balanced: t('profile.dietStyleLabels.standard_balanced'),
    high_protein: t('profile.dietStyleLabels.high_protein'),
    low_carb: t('profile.dietStyleLabels.low_carb'),
    high_carb_performance: t('profile.dietStyleLabels.high_carb_performance'),
    carb_cycling: t('profile.dietStyleLabels.carb_cycling'),
    keto: t('profile.dietStyleLabels.keto'),
    mediterranean: t('profile.dietStyleLabels.mediterranean'),
    vegetarian: t('profile.dietStyleLabels.vegetarian'),
    vegan: t('profile.dietStyleLabels.vegan'),
    flexible_iifym: t('profile.dietStyleLabels.flexible_iifym'),
    structured_meal_plan: t('profile.dietStyleLabels.structured_meal_plan'),
  };

  const { currentUser, updateUserName } = useCurrentUser();
  const [profile, setProfile] = useLocalStorageState<Profile>('profile', DEFAULT_PROFILE);
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [weeklyReports, setWeeklyReports] = useLocalStorageState<Record<string, WeeklyPerformanceReport>>('home.weeklyReports.v1', EMPTY_WEEKLY_REPORTS);
  const [identityReports, setIdentityReports] = useLocalStorageState<IdentityReportsByMonth>('home.identityReports.v1', EMPTY_IDENTITY_REPORTS);
  const [showBmi, setShowBmi] = useState(false);
  const [showPersonalSettings, setShowPersonalSettings] = useState(false);
  const [showDietExplorer, setShowDietExplorer] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);
  const [journeyExpanded, setJourneyExpanded] = useState(false);
  const [bmiExpanded, setBmiExpanded] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
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
  const [draftEquippedBadgeIds, setDraftEquippedBadgeIds] = useState<TrophyBadgeId[]>(profile.equippedBadgeIds ?? []);
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>('darkMode', false);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const [allergyInput, setAllergyInput] = useState('');
  const [waistCmInput, setWaistCmInput] = useState('');
  const [sleepHoursInput, setSleepHoursInput] = useState('');
  const [restingHrInput, setRestingHrInput] = useState('');
  const [stressLevelInput, setStressLevelInput] = useState('');
  const [stepsInput, setStepsInput] = useState('');

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

  const bmiHistory = Array.isArray(profile.bmiHistory) ? profile.bmiHistory : [];
  const healthHistory = Array.isArray(profile.healthHistory) ? profile.healthHistory : [];
  const latestMeasurement = bmiHistory[0] ?? null;
  const previousMeasurement = bmiHistory[1] ?? null;
  const latestHealth = healthHistory[0] ?? null;
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

  const toOptionalNumber = (value: string) => {
    const raw = value.trim();
    if (!raw) return null;
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

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
  const dailyDiscipline = useMemo(() => calculateDailyDisciplineScore(todayLog), [todayLog]);

  const stats = useMemo(() => {
    const allLogs = Object.values(logsByDate);
    const activeDays = allLogs.filter((log) => Object.values(log.meals).flat().length > 0 || getTotalHydrationMl(log) > 0 || log.trainingKcal > 0).length;
    const mealsLogged = allLogs.reduce((sum, log) => sum + Object.values(log.meals).flat().length, 0);
    const caloriesLogged = allLogs.reduce(
      (sum, log) => sum + Object.values(log.meals).flat().reduce((daySum, food) => daySum + food.kcal, 0),
      0,
    );
    const numberFormatter = new Intl.NumberFormat('nb-NO');

    return [
      {
        label: t('profile.stats.activeDays'),
        value: numberFormatter.format(activeDays),
        color: 'text-orange-500',
      },
      {
        label: t('profile.stats.mealsLogged'),
        value: numberFormatter.format(mealsLogged),
        color: 'text-blue-500',
      },
      {
        label: t('profile.stats.caloriesLogged'),
        value: numberFormatter.format(caloriesLogged),
        color: 'text-green-500',
      },
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

  const handleExportData = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      appVersion: 'KaloriFit v1',
      profile,
      logsByDate,
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalorifit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportData = (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string);
        if (!payload.profile && !payload.logsByDate) throw new Error('invalid');
        if (payload.profile) setProfile(payload.profile);
        if (payload.logsByDate) setLogsByDate(payload.logsByDate);
        setImportError(null);
      } catch {
        setImportError(profile.language === 'English' ? 'Invalid backup file.' : 'Ugyldig backup-fil.');
      }
    };
    reader.readAsText(file);
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
    setDraftEquippedBadgeIds(profile.equippedBadgeIds ?? []);
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
      equippedBadgeIds: draftEquippedBadgeIds,
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

    const healthEntry: HealthEntry = {
      date: entry.date,
      waistCm: toOptionalNumber(waistCmInput),
      sleepHours: toOptionalNumber(sleepHoursInput),
      restingHr: toOptionalNumber(restingHrInput),
      stressLevel: toOptionalNumber(stressLevelInput),
      steps: toOptionalNumber(stepsInput),
    };
    const hasHealthData =
      healthEntry.waistCm !== null ||
      healthEntry.sleepHours !== null ||
      healthEntry.restingHr !== null ||
      healthEntry.stressLevel !== null ||
      healthEntry.steps !== null;

    setProfile((prev) => ({
      ...prev,
      heightCm: entry.heightCm,
      weightKg: entry.weightKg,
      bmiHistory: [entry, ...(Array.isArray(prev.bmiHistory) ? prev.bmiHistory : [])].slice(0, 20),
      healthHistory: hasHealthData ? [healthEntry, ...(Array.isArray(prev.healthHistory) ? prev.healthHistory : [])].slice(0, 30) : (Array.isArray(prev.healthHistory) ? prev.healthHistory : []),
    }));

    setShowBmi(false);
  };

  const addAllergy = (rawValue: string) => {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return;
    setProfile((prev) => ({
      ...prev,
      allergies: Array.from(new Set([...(prev.allergies ?? []), normalized])),
    }));
    setAllergyInput('');
  };

  const removeAllergy = (value: string) => {
    const normalized = value.trim().toLowerCase();
    setProfile((prev) => ({
      ...prev,
      allergies: (prev.allergies ?? []).filter((item) => item.toLowerCase() !== normalized),
    }));
  };

  useEffect(() => {
    if (!showBmi) return;
    const latest = (Array.isArray(profile.healthHistory) ? profile.healthHistory : [])[0];
    setWaistCmInput(latest?.waistCm != null ? String(latest.waistCm) : '');
    setSleepHoursInput(latest?.sleepHours != null ? String(latest.sleepHours) : '');
    setRestingHrInput(latest?.restingHr != null ? String(latest.restingHr) : '');
    setStressLevelInput(latest?.stressLevel != null ? String(latest.stressLevel) : '');
    setStepsInput(latest?.steps != null ? String(latest.steps) : '');
  }, [profile.healthHistory, showBmi]);

  const getMenuItems = () => [
    { id: 'personal', icon: Settings, label: t('profile.sections.personalInfo'), value: '' },
    { id: 'notifications', icon: Bell, label: t('profile.sections.notifications'), value: profile.notificationsEnabled ? t('profile.on') : t('profile.off') },
    { id: 'privacy', icon: Shield, label: t('profile.sections.privacy'), value: profile.privacyMode },
    { id: 'darkmode', icon: Moon, label: t('profile.sections.darkMode'), value: darkMode ? t('profile.on') : t('profile.off') },
    { id: 'language', icon: Globe, label: t('profile.sections.language'), value: profile.language },
    { id: 'journey', icon: Trophy, label: t('profile.sections.journey'), value: '' },
    { id: 'bmi', icon: Activity, label: t('profile.sections.measurements'), value: '' },
    { id: 'help', icon: HelpCircle, label: t('profile.sections.help'), value: '' },
  ];

  const initials = (typeof profile.name === 'string' ? profile.name : '')
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
    if (typeof dateKey !== 'string') return dateFormatter.format(new Date());
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return dateFormatter.format(new Date());
    }
    return dateFormatter.format(new Date(year, month - 1, day));
  };

  const journeyWeightSeries = useMemo(() => {
    const source = (Array.isArray(profile.bmiHistory) ? profile.bmiHistory : [])
      .filter((entry) => Number.isFinite(entry.weightKg))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-12)
      .map((entry) => ({ date: entry.date, value: Number(entry.weightKg) }));
    if (source.length > 0) return source;
    return [{ date: toDateKey(startOfDay(new Date())), value: Number(profile.weightKg) }];
  }, [profile.bmiHistory, profile.weightKg]);

  const journeyDisciplineSeries = useMemo(() => {
    return Array.from({ length: 14 }, (_, idx) => {
      const date = addDays(today, -(13 - idx));
      const key = toDateKey(date);
      const score = calculateDailyDisciplineScore(logsByDate[key] ?? createEmptyDayLog()).score;
      return { dateKey: key, score };
    });
  }, [logsByDate, today]);

  const weightDeltaJourney = useMemo(() => {
    if (journeyWeightSeries.length < 2) return null;
    const first = journeyWeightSeries[0].value;
    const last = journeyWeightSeries[journeyWeightSeries.length - 1].value;
    return Number((last - first).toFixed(1));
  }, [journeyWeightSeries]);

  // Current consecutive-day streak (any log activity, score >= 1)
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let offset = 0; offset < 365; offset++) {
      const date = addDays(today, -offset);
      const log = logsByDate[toDateKey(date)] ?? createEmptyDayLog();
      const hasActivity =
        Object.values(log.meals).flat().length > 0 ||
        getTotalHydrationMl(log) > 0 ||
        log.trainingKcal > 0;
      if (!hasActivity) break;
      streak++;
    }
    return streak;
  }, [logsByDate, today]);

  // Today's totals for the snapshot card
  const todayTotals = useMemo(() => {
    const entries = Object.values(todayLog.meals).flat();
    const kcal = Math.round(entries.reduce((s, f) => s + f.kcal, 0));
    const protein = Math.round(entries.reduce((s, f) => s + f.protein, 0));
    const water = getTotalHydrationMl(todayLog);
    return { kcal, protein, water };
  }, [todayLog]);

  // 7-day rolling averages
  const weeklyNutritionAvg = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, -i);
      return logsByDate[toDateKey(date)] ?? createEmptyDayLog();
    });
    const totalKcal = days.reduce((s, log) => s + Object.values(log.meals).flat().reduce((n, f) => n + f.kcal, 0), 0);
    const totalProtein = days.reduce((s, log) => s + Object.values(log.meals).flat().reduce((n, f) => n + f.protein, 0), 0);
    const totalWater = days.reduce((s, log) => s + getTotalHydrationMl(log), 0);
    return {
      avgKcal: Math.round(totalKcal / 7),
      avgProtein: Math.round(totalProtein / 7),
      avgWaterL: Number((totalWater / 7 / 1000).toFixed(1)),
    };
  }, [logsByDate, today]);

  // Goal countdown
  const goalCountdown = useMemo(() => {
    if (profile.eventDate) {
      const eventDate = new Date(profile.eventDate);
      const daysLeft = Math.ceil((eventDate.getTime() - today.getTime()) / 86400000);
      return daysLeft > 0 ? { type: 'event' as const, daysLeft } : null;
    }
    if (profile.timelineType !== 'maintenance_open' && profile.timelineWeeks > 0) {
      const memberYear = parseInt(profile.memberSince, 10);
      const startDate = Number.isFinite(memberYear)
        ? new Date(memberYear, 0, 1)
        : today;
      const weeksElapsed = Math.floor((today.getTime() - startDate.getTime()) / (7 * 86400000));
      const weeksIn = Math.min(weeksElapsed, profile.timelineWeeks);
      return { type: 'timeline' as const, weeksIn, totalWeeks: profile.timelineWeeks };
    }
    return null;
  }, [profile.eventDate, profile.memberSince, profile.timelineType, profile.timelineWeeks, today]);

  const titleDescriptions: Record<string, string> = {
    'The Grinder': 'High consistency across the month.',
    'The Comeback': 'Strong improvement from early to late month.',
    'The Sharpshooter': 'Precise calorie control with stable execution.',
    'The Iron Discipline': '30+ day discipline streak unlocked.',
    'The Balanced Strategist': 'Balanced performance across calories, protein, water, and activity.',
  };

  const trophyBadges = useMemo(() => {
    return evaluateTrophyBadges({
      currentUserName: currentUser.name,
      profileName: profile.name,
      memberSince: profile.memberSince,
      logsByDate,
      monthlyIdentity,
    });
  }, [
    currentUser.name,
    logsByDate,
    monthlyIdentity,
    profile.memberSince,
    profile.name,
  ]);

  const highlightedBadges = trophyBadges.filter((badge) => badge.unlocked).slice(0, 3);
  const equippedBadges = trophyBadges.filter((badge) => (profile.equippedBadgeIds ?? []).includes(badge.id)).slice(0, 3);
  const badgeStyleById = getBadgeStyleById;

  const goalStrategyLabel = String(profile.goalStrategy ?? DEFAULT_NUTRITION_PROFILE.goalStrategy ?? '').split('_').join(' ');
  const dietStyleLabel = String(profile.dietStyle ?? DEFAULT_NUTRITION_PROFILE.dietStyle ?? '').split('_').join(' ');
  const settingsTierLabel = profile.settingsTier ?? DEFAULT_NUTRITION_PROFILE.settingsTier;
  const xpRingProgress = monthlyIdentity.level.progressPct;

  if (showPersonalSettings) {
    return (
      <div className="screen min-h-screen bg-white dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowPersonalSettings(false)}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
            title={t('profile.back')}
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('profile.personal.title')}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="card dark:bg-gray-800 dark:border-gray-700 m-0">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.profileImage')}</label>
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
                      {t('profile.personal.chooseImage')}
                    </button>
                    {draftProfileImage && (
                      <button
                        onClick={() => setDraftProfileImage(null)}
                        className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-3 py-2 text-sm font-medium"
                      >
                        {t('profile.personal.removeImage')}
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
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.name')}</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.personal.namePlaceholder')}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.memberSince')}</label>
                <input
                  value={draftMemberSince}
                  onChange={(e) => setDraftMemberSince(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder={t('profile.personal.memberSincePlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.age')}</label>
                  <input
                    inputMode="numeric"
                    value={draftAge}
                    onChange={(e) => setDraftAge(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                    placeholder={t('profile.personal.agePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.gender')}</label>
                  <select
                    value={draftSex}
                    onChange={(e) => setDraftSex(e.target.value as BiologicalSex)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="female">{t('profile.personal.female')}</option>
                    <option value="male">{t('profile.personal.male')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.activity')}</label>
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
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.configLevel')}</label>
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
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.goalCategory')}</label>
                  <select
                    value={draftGoalCategory}
                    onChange={(e) => setDraftGoalCategory(e.target.value as GoalCategory)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="fat_loss">Fat Loss</option>
                    <option value="muscle_gain">Muscle Gain</option>
                    <option value="recomp">Recomposition</option>
                    <option value="performance">Performance</option>
                    <option value="health">Health Focus</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.dietStyle')}</label>
                  <select
                    value={draftDietStyle}
                    onChange={(e) => setDraftDietStyle(e.target.value as DietStyle)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="standard_balanced">Standard Balanced</option>
                    <option value="high_protein">High Protein</option>
                    <option value="low_carb">Low Carb</option>
                    <option value="high_carb_performance">High Carb Performance</option>
                    <option value="carb_cycling">Carb Cycling</option>
                    <option value="keto">Keto</option>
                    <option value="mediterranean">Mediterranean</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="flexible_iifym">Flexible (IIFYM)</option>
                    <option value="structured_meal_plan">Structured Meal Plan</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.goalStrategy')}</label>
                <select
                  value={draftGoalStrategy}
                  onChange={(e) => setDraftGoalStrategy(e.target.value as GoalStrategy)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="slow_cut">Slow cut (-250)</option>
                  <option value="standard_cut">Standard cut (-400)</option>
                  <option value="aggressive_cut">Aggressive cut (-600)</option>
                  <option value="event_prep">Event prep</option>
                  <option value="lean_bulk">Lean bulk (+200)</option>
                  <option value="standard_bulk">Standard bulk (+350)</option>
                  <option value="aggressive_bulk">Aggressive bulk (+500)</option>
                  <option value="high_protein_maintenance">High protein maintenance</option>
                  <option value="fat_reduction_no_scale">Fat reduction no scale focus</option>
                  <option value="strength_focus">Strength focus</option>
                  <option value="endurance_focus">Endurance focus</option>
                  <option value="hybrid_athlete">Hybrid athlete</option>
                  <option value="blood_markers">Improve blood markers</option>
                  <option value="stable_energy">Stabilize energy</option>
                  <option value="hormonal_balance">Hormonal balance</option>
                  <option value="gut_health">Gut health</option>
                </select>
              </div>

              {draftSettingsTier === 'advanced' && (
                <div className="space-y-3 rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">{t('profile.personal.advancedSystem')}</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.trainingType')}</label>
                      <select value={draftTrainingType} onChange={(e) => setDraftTrainingType(e.target.value as TrainingType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="strength">Strength</option>
                        <option value="running">Running</option>
                        <option value="crossfit">CrossFit</option>
                        <option value="cycling">Cycling</option>
                        <option value="mixed">Mixed</option>
                        <option value="sedentary">Sedentary</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.trainingDayBoost')}</label>
                      <input inputMode="numeric" value={draftTrainingBoost} onChange={(e) => setDraftTrainingBoost(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.metabolicSensitivity')}</label>
                      <select value={draftMetabolicSensitivity} onChange={(e) => setDraftMetabolicSensitivity(e.target.value as MetabolicSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="gain_easy">Gain weight easily</option>
                        <option value="normal">Normal</option>
                        <option value="lose_easy">Lose weight easily</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.plateauSensitivity')}</label>
                      <select value={draftPlateauSensitivity} onChange={(e) => setDraftPlateauSensitivity(e.target.value as PlateauSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="conservative">Conservative</option>
                        <option value="standard">Standard</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.lifestyle')}</label>
                      <select value={draftLifestylePattern} onChange={(e) => setDraftLifestylePattern(e.target.value as LifestylePattern)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="3_meals">3 meals</option>
                        <option value="4_meals">4 meals</option>
                        <option value="5_small_meals">5 small meals</option>
                        <option value="if_16_8">Intermittent fasting 16:8</option>
                        <option value="omad">OMAD</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.behavior')}</label>
                      <select value={draftBehaviorPreference} onChange={(e) => setDraftBehaviorPreference(e.target.value as BehaviorPreference)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="strict">Strict structure</option>
                        <option value="flexible">Flexible approach</option>
                        <option value="coaching">Coaching reminders</option>
                        <option value="minimal">Minimal reminders</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.timeline')}</label>
                      <select value={draftTimelineType} onChange={(e) => setDraftTimelineType(e.target.value as TimelineType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="8_week_cut">8-week cut</option>
                        <option value="12_week_bulk">12-week bulk</option>
                        <option value="maintenance_open">Open maintenance</option>
                        <option value="event_based">Event-based</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.weeks')}</label>
                      <input inputMode="numeric" value={draftTimelineWeeks} onChange={(e) => setDraftTimelineWeeks(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  {draftTimelineType === 'event_based' && (
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.eventDate')}</label>
                      <input type="date" value={draftEventDate} onChange={(e) => setDraftEventDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.psychologyType')}</label>
                      <select value={draftPsychologyType} onChange={(e) => setDraftPsychologyType(e.target.value as PsychologyType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="data_driven">Data-driven</option>
                        <option value="visual">Visual learner</option>
                        <option value="competitive">Competitive</option>
                        <option value="community">Community-focused</option>
                        <option value="private">Private tracker</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">{t('profile.personal.specialPhase')}</label>
                      <select value={draftSpecialPhase} onChange={(e) => setDraftSpecialPhase(e.target.value as SpecialPhase)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="normal">Normal</option>
                        <option value="reverse_diet">Reverse diet</option>
                        <option value="recovery">Recovery phase</option>
                        <option value="smart_auto">Smart auto mode</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input type="checkbox" checked={draftCycleBasedAdjustments} onChange={(e) => setDraftCycleBasedAdjustments(e.target.checked)} />
                      {t('profile.personal.cycleAdjustment')}
                    </label>
                    {draftCycleBasedAdjustments && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <input type="date" value={draftCycleStartDate} onChange={(e) => setDraftCycleStartDate(e.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
                        <input inputMode="numeric" value={draftCycleLengthDays} onChange={(e) => setDraftCycleLengthDays(e.target.value)} placeholder="Cycle days" className="rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">{t('profile.personal.equipBadges')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('profile.personal.equipBadgesSubtitle')}</p>
                <div className="flex flex-wrap gap-2">
                  {trophyBadges.filter((badge) => badge.unlocked).map((badge) => {
                    const isEquipped = draftEquippedBadgeIds.includes(badge.id);
                    const equipLimitReached = draftEquippedBadgeIds.length >= 3 && !isEquipped;
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        disabled={equipLimitReached}
                        onClick={() =>
                          setDraftEquippedBadgeIds((prev) =>
                            prev.includes(badge.id)
                              ? prev.filter((id) => id !== badge.id)
                              : prev.length < 3
                                ? [...prev, badge.id]
                                : prev,
                          )
                        }
                        className={`text-xs px-2.5 py-1 rounded-full border transition-opacity ${
                          isEquipped
                            ? `${badgeStyleById(badge.id)}`
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600'
                        } ${equipLimitReached ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {isEquipped ? t('profile.personal.equipped') : ''}{badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowPersonalSettings(false)}
              className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-4 py-2 font-medium"
            >
              Avbryt
            </button>
            <button
              onClick={savePersonalSettings}
              className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
            >
              Lagre
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
            className="w-10 h-10 rounded-full bg-white/80 border border-slate-200/80 flex items-center justify-center dark:bg-white/20 dark:border-white/20"
            title="Rediger profil"
          >
            <Settings className="w-5 h-5 text-slate-700 dark:text-white" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className="mb-4 rounded-full p-[4px]"
              style={{
                background: `conic-gradient(#f59e0b ${xpRingProgress}%, rgba(148,163,184,0.35) ${xpRingProgress}% 100%)`,
              }}
            >
              {profile.profileImageDataUrl ? (
                <img
                  src={profile.profileImageDataUrl}
                  alt={profile.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/70 dark:border-white/40 bg-white"
                />
              ) : (
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-5xl border-4 border-white/40">
                  {initials || 'U'}
                </div>
              )}
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 text-white text-[11px] px-2 py-1 font-semibold whitespace-nowrap">
              LVL {monthlyIdentity.level.value} • {monthlyIdentity.level.currentXp}/{monthlyIdentity.level.nextLevelXp} XP
            </div>
            <div
              className="absolute bottom-4 right-0 h-4 w-4 rounded-full border-2 border-slate-100 dark:border-white bg-green-500 shadow-sm"
              title="Aktiv"
              aria-label="Aktiv profilstatus"
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{profile.name}</h2>
            <p className="text-slate-600 dark:text-white/80">Medlem siden {profile.memberSince}</p>
            {equippedBadges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {equippedBadges.map((badge) => (
                  <span key={badge.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${badgeStyleById(badge.id)}`}>
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card backdrop-blur-sm bg-white/80 dark:bg-white/[0.06] border border-white/70 dark:border-white/[0.1] shadow-lg">
            <p className={`stat-value ${stat.color}`}>{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        ))}
        <div className="stat-card backdrop-blur-sm bg-white/80 dark:bg-white/[0.06] border border-white/70 dark:border-white/[0.1] shadow-lg">
          <p className="stat-value text-amber-500">{currentStreak > 0 ? `🔥 ${currentStreak}` : '—'}</p>
          <p className="stat-label">{t('profile.stats.currentStreak')}</p>
        </div>
      </div>

      {/* Today's nutrition snapshot */}
      <div className="card mt-4">
        <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-3">{t('profile.todaySnapshot.title')}</p>
        <div className="space-y-3">
          {[
            {
              label: t('profile.todaySnapshot.kcal'),
              current: todayTotals.kcal,
              goal: CALORIE_GOAL,
              unit: 'kcal',
              pct: Math.min(100, Math.round((todayTotals.kcal / CALORIE_GOAL) * 100)),
              color: 'bg-orange-500',
              textColor: 'text-orange-500',
            },
            {
              label: t('profile.todaySnapshot.protein'),
              current: todayTotals.protein,
              goal: PROTEIN_GOAL_G,
              unit: 'g',
              pct: Math.min(100, Math.round((todayTotals.protein / PROTEIN_GOAL_G) * 100)),
              color: 'bg-blue-500',
              textColor: 'text-blue-500',
            },
            {
              label: t('profile.todaySnapshot.water'),
              current: Math.round(getTotalHydrationMl(todayLog) / 100) / 10,
              goal: WATER_GOAL_ML / 1000,
              unit: 'L',
              pct: Math.min(100, Math.round((getTotalHydrationMl(todayLog) / WATER_GOAL_ML) * 100)),
              color: 'bg-cyan-500',
              textColor: 'text-cyan-500',
            },
          ].map((row) => (
            <div key={row.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-white/70">{row.label}</span>
                <span className={`text-sm font-bold ${row.textColor}`}>
                  {row.current}{row.unit} <span className="text-slate-400 dark:text-white/30 font-normal text-xs">/ {row.goal}{row.unit}</span>
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${row.color}`} style={{ width: `${row.pct}%` }} />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1 text-right">{row.pct}% {t('profile.todaySnapshot.ofGoal')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Goal countdown */}
      {goalCountdown && (
        <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 dark:bg-indigo-500/[0.08] px-4 py-3">
          <p className="text-[10px] text-indigo-500 dark:text-indigo-300 uppercase tracking-widest font-bold mb-1">{t('profile.goalCountdown.title')}</p>
          {goalCountdown.type === 'event' ? (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-200">{goalCountdown.daysLeft}</span>
              <span className="text-sm text-indigo-500 dark:text-indigo-300">{t('profile.goalCountdown.eventCountdown')}</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-indigo-600 dark:text-indigo-200">{goalCountdown.weeksIn}</span>
              <span className="text-sm text-indigo-500 dark:text-indigo-300">{t('profile.goalCountdown.weeksIn')} {goalCountdown.totalWeeks}</span>
              <div className="flex-1 h-2 bg-indigo-100 dark:bg-white/[0.06] rounded-full overflow-hidden ml-1">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round((goalCountdown.weeksIn / goalCountdown.totalWeeks) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-1">{t('profile.dietProfile.title')}</p>
            <p className="text-base font-bold text-slate-800 dark:text-white/90 leading-tight">{goalStrategyLabel}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">{dietStyleLabel}</span>
              <span className="text-slate-300 dark:text-white/15 text-xs">·</span>
              <span className="text-[11px] text-slate-500 dark:text-white/40">{settingsTierLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDietExplorer(true)}
            className="shrink-0 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-2 font-semibold"
          >
            {t('profile.dietProfile.exploreButton')}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-white/60">{t('profile.dietProfile.allergiesTitle')}</p>
            <p className="text-[11px] text-slate-400 dark:text-white/30">{t('profile.dietProfile.allergiesSubtitle')}</p>
          </div>
          <div className="flex gap-2">
            <input
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAllergy(allergyInput);
                }
              }}
              placeholder={t('profile.dietProfile.allergiesPlaceholder')}
              className="flex-1 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 placeholder-slate-400 dark:placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            <button
              type="button"
              onClick={() => addAllergy(allergyInput)}
              className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white"
            >
              {t('profile.dietProfile.addButton')}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(profile.allergies ?? []).length > 0 ? (
              (profile.allergies ?? []).map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  onClick={() => removeAllergy(allergy)}
                  className="text-xs px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 font-medium"
                  title="Fjern allergi"
                >
                  {allergy} ×
                </button>
              ))
            ) : (
              <p className="text-xs text-slate-400 dark:text-white/30">{t('profile.dietProfile.noAllergies')}</p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([
              { key: 'gluten', label: 'Gluten', emoji: '🌾' },
              { key: 'milk', label: 'Melk', emoji: '🥛' },
              { key: 'egg', label: 'Egg', emoji: '🥚' },
              { key: 'nuts', label: 'Nøtter', emoji: '🌰' },
              { key: 'fish', label: 'Fisk', emoji: '🐟' },
              { key: 'shellfish', label: 'Skalldyr', emoji: '🦐' },
              { key: 'soy', label: 'Soya', emoji: '🫘' },
              { key: 'peanuts', label: 'Peanøtter', emoji: '🥜' },
            ] as Array<{ key: string; label: string; emoji: string }>).map(({ key, label, emoji }) => {
              const isActive = (profile.allergies ?? []).some((a) => a.toLowerCase() === key.toLowerCase());
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => isActive ? removeAllergy(key) : addAllergy(key)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border font-medium transition-colors flex items-center gap-1 ${
                    isActive
                      ? 'bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.07] text-slate-500 dark:text-white/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:border-amber-200 dark:hover:border-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{isActive ? `${label} ×` : `+ ${label}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <button onClick={() => setShowIdentity(true)} className="w-full text-left">
          <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-2.5">{t('profile.identity.title')}</p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white/90 leading-tight">{monthlyIdentity.primaryTitle}</h3>
              <p className="text-sm text-slate-500 dark:text-white/45 mt-0.5">
                Level {monthlyIdentity.level.value} · {monthlyIdentity.level.label}
              </p>
              {highlightedBadges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {highlightedBadges.map((badge) => (
                    <span
                      key={badge.id}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-amber-500 leading-tight">{monthlyIdentity.level.currentXp}</p>
              <p className="text-xs text-slate-400 dark:text-white/35 font-medium">/ {monthlyIdentity.level.nextLevelXp} XP</p>
            </div>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-white/[0.06] rounded-full mt-3 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${monthlyIdentity.level.progressPct}%`,
                background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              }}
            />
          </div>
        </button>
      </div>

      <div className="card mt-4">
        {/* Score header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-0.5">{t('profile.disciplineScore.title')}</p>
            <p className="text-xs text-slate-500 dark:text-white/40">{t('profile.disciplineScore.subtitle')}</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-orange-500 leading-none">{dailyDiscipline.score}</p>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${
              dailyDiscipline.grade === 'Utmerket' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
              : dailyDiscipline.grade === 'Bra' ? 'bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300'
              : dailyDiscipline.grade === 'OK' ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300'
              : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40'
            }`}>{dailyDiscipline.grade}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          {dailyDiscipline.metrics.map((metric) => (
            <div key={metric.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-white/70">{metric.label}</span>
                <span className={`text-sm font-bold ${metric.percent >= 85 ? 'text-emerald-500' : metric.percent >= 50 ? 'text-orange-500' : 'text-slate-400 dark:text-white/40'}`}>{metric.percent}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${metric.percent >= 85 ? 'bg-emerald-400' : 'bg-orange-400'}`}
                  style={{ width: `${metric.percent}%` }}
                />
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] text-slate-400 dark:text-white/30">
                <span>{metric.progressLabel}</span>
                <span>{metric.targetLabel}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Accomplished / missing */}
        {(dailyDiscipline.accomplished.length > 0 || dailyDiscipline.missing.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.07] border border-emerald-200 dark:border-emerald-500/15 p-3">
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5">Oppnådd</p>
              {dailyDiscipline.accomplished.length > 0 ? (
                <div className="space-y-1">
                  {dailyDiscipline.accomplished.map((item) => (
                    <p key={item} className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">✓ {item}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60">Ingen ennå</p>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/[0.07] border border-amber-200 dark:border-amber-500/15 p-3">
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">Mangler</p>
              <div className="space-y-1">
                {(dailyDiscipline.missing.length > 0 ? dailyDiscipline.missing : ['Alle mål nådd!']).map((item) => (
                  <p key={item} className="text-xs text-amber-700 dark:text-amber-300 leading-snug">{item}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-0.5">{t('profile.weeklyReport.title')}</p>
            <p className="text-xs text-slate-500 dark:text-white/40">{t('profile.weeklyReport.subtitle')}</p>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-white/30 font-medium">
            {latestWeeklyReport.weekStartKey} → {latestWeeklyReport.weekEndKey}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
            <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium mb-0.5">{t('profile.weeklyReport.avgDiscipline')}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white/90">{latestWeeklyReport.avgDisciplineScore}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
            <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium mb-0.5">{t('profile.weeklyReport.trend')}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white/90">{trendLabel}</p>
          </div>
          <div className="rounded-xl bg-emerald-500/8 dark:bg-emerald-500/[0.08] border border-emerald-500/15 p-3">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-0.5">{t('profile.weeklyReport.bestDay')}</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {formatDateKey(latestWeeklyReport.bestDay.dateKey)}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{latestWeeklyReport.bestDay.score} {t('profile.weeklyReport.points')}</p>
          </div>
          <div className="rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] p-3">
            <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium mb-0.5">{t('profile.weeklyReport.worstDay')}</p>
            <p className="text-sm font-bold text-slate-600 dark:text-white/60">
              {formatDateKey(latestWeeklyReport.worstDay.dateKey)}
            </p>
            <p className="text-xs text-slate-400 dark:text-white/35">{latestWeeklyReport.worstDay.score} {t('profile.weeklyReport.points')}</p>
          </div>
        </div>

        <div className="rounded-xl bg-orange-500/8 dark:bg-orange-500/[0.08] border border-orange-500/15 px-4 py-3 mb-3">
          <p className="text-[11px] text-orange-500 dark:text-orange-400 font-semibold mb-0.5">{t('profile.weeklyReport.streakStatus')}</p>
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-200">{latestWeeklyReport.streakStatus}</p>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {latestWeeklyReport.days.map((day) => {
            const pct = Math.min(day.score, 100);
            return (
              <div key={day.dateKey} className="flex flex-col items-center gap-1">
                <p className="text-[9px] text-slate-400 dark:text-white/30 font-medium">{formatDateKey(day.dateKey).split('.')[0]}.</p>
                <div className="w-full h-12 bg-slate-100 dark:bg-white/[0.05] rounded-lg overflow-hidden flex items-end">
                  <div
                    className="w-full rounded-lg"
                    style={{
                      height: `${Math.max(pct, 8)}%`,
                      background: pct >= 70 ? 'linear-gradient(180deg, #4ade80, #22c55e)' : pct >= 40 ? 'linear-gradient(180deg, #fb923c, #f97316)' : 'rgba(148,163,184,0.4)',
                    }}
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-600 dark:text-white/60">{day.score}</p>
              </div>
            );
          })}
        </div>

        {/* 7-day rolling averages */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]">
          <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold mb-3">{t('profile.weeklyAvg.title')}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('profile.weeklyAvg.kcal'), value: weeklyNutritionAvg.avgKcal, goal: CALORIE_GOAL, unit: '', pct: Math.min(100, Math.round((weeklyNutritionAvg.avgKcal / CALORIE_GOAL) * 100)), color: 'bg-orange-400' },
              { label: t('profile.weeklyAvg.protein'), value: weeklyNutritionAvg.avgProtein, goal: PROTEIN_GOAL_G, unit: 'g', pct: Math.min(100, Math.round((weeklyNutritionAvg.avgProtein / PROTEIN_GOAL_G) * 100)), color: 'bg-blue-400' },
              { label: t('profile.weeklyAvg.water'), value: weeklyNutritionAvg.avgWaterL, goal: WATER_GOAL_ML / 1000, unit: 'L', pct: Math.min(100, Math.round((weeklyNutritionAvg.avgWaterL / (WATER_GOAL_ML / 1000)) * 100)), color: 'bg-cyan-400' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3 text-center">
                <p className="text-lg font-bold text-slate-800 dark:text-white/90">{item.value}{item.unit}</p>
                <div className="h-1.5 bg-slate-200 dark:bg-white/[0.08] rounded-full overflow-hidden my-1.5">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-white/35 leading-tight">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick measurements card */}
      <div className="card mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-slate-400 dark:text-white/35 uppercase tracking-widest font-bold">{t('profile.quickMeasurements.title')}</p>
          <button
            onClick={() => setBmiExpanded(true)}
            className="text-xs font-semibold text-orange-500 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5"
          >
            {t('profile.quickMeasurements.logNew')}
          </button>
        </div>
        {latestMeasurement ? (
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3 text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-white/90">{latestMeasurement.weightKg}<span className="text-xs font-normal text-slate-400 ml-0.5">kg</span></p>
              <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">{t('profile.quickMeasurements.currentWeight')}</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${bmi !== null && bmi < 18.5 ? 'bg-blue-50 dark:bg-blue-500/[0.08] border-blue-200 dark:border-blue-500/20' : bmi !== null && bmi < 25 ? 'bg-emerald-50 dark:bg-emerald-500/[0.08] border-emerald-200 dark:border-emerald-500/20' : bmi !== null && bmi < 30 ? 'bg-amber-50 dark:bg-amber-500/[0.08] border-amber-200 dark:border-amber-500/20' : 'bg-red-50 dark:bg-red-500/[0.08] border-red-200 dark:border-red-500/20'}`}>
              <p className={`text-xl font-bold ${bmi !== null && bmi < 25 ? 'text-emerald-600 dark:text-emerald-300' : bmi !== null && bmi < 30 ? 'text-amber-600 dark:text-amber-300' : 'text-red-500 dark:text-red-300'}`}>{latestMeasurement.bmi}</p>
              <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">{t('profile.quickMeasurements.bmi')}</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3 text-center">
              <p className="text-xl font-bold text-slate-800 dark:text-white/90">
                {latestHealth?.waistCm != null ? <>{latestHealth.waistCm}<span className="text-xs font-normal text-slate-400 ml-0.5">cm</span></> : '—'}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">{t('profile.quickMeasurements.waist')}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400 dark:text-white/35">{t('profile.quickMeasurements.noData')}</p>
          </div>
        )}
        {weightDeltaFromLast !== null && (
          <p className={`text-xs mt-2.5 text-center font-medium ${weightDeltaFromLast < 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
            {weightDeltaFromLast > 0 ? '+' : ''}{weightDeltaFromLast} kg fra forrige måling
          </p>
        )}
      </div>

      <div className="card mt-4 p-0 overflow-hidden">
        {getMenuItems().map((item, index) => {
          const iconColors = [
            'bg-orange-100 dark:bg-orange-500/15 text-orange-500',
            'bg-blue-100 dark:bg-blue-500/15 text-blue-500',
            'bg-purple-100 dark:bg-purple-500/15 text-purple-500',
            'bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-white/60',
            'bg-green-100 dark:bg-green-500/15 text-green-600',
            'bg-amber-100 dark:bg-amber-500/15 text-amber-500',
            'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-600',
            'bg-rose-100 dark:bg-rose-500/15 text-rose-500',
          ];
          const colorClass = iconColors[index % iconColors.length];
          const isToggle = ['darkmode', 'notifications', 'language'].includes(item.id);
          const isPrivacy = item.id === 'privacy';
          return (
            <div key={index} className="border-b border-slate-100/80 dark:border-white/[0.06] last:border-b-0">
              <button
                onClick={() => {
                  if (item.id === 'bmi') setBmiExpanded((prev) => !prev);
                  if (item.id === 'personal') openPersonalSettings();
                  if (item.id === 'journey') setJourneyExpanded((prev) => !prev);
                  if (item.id === 'darkmode') toggleDarkMode();
                  if (item.id === 'notifications') toggleNotifications();
                  if (item.id === 'privacy') setPrivacyExpanded((prev) => !prev);
                  if (item.id === 'language') toggleLanguage();
                  if (item.id === 'help') setHelpExpanded((prev) => !prev);
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorClass}`}>
                    <item.icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-medium text-slate-700 dark:text-white/80">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.value && !isPrivacy && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      item.value === t('profile.on')
                        ? 'bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-300'
                        : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/40'
                    }`}>{item.value}</span>
                  )}
                  {isPrivacy
                    ? <ChevronDown className={`w-4 h-4 text-slate-300 dark:text-white/20 transition-transform ${privacyExpanded ? 'rotate-180' : ''}`} />
                    : item.id === 'journey'
                    ? <ChevronDown className={`w-4 h-4 text-slate-300 dark:text-white/20 transition-transform ${journeyExpanded ? 'rotate-180' : ''}`} />
                    : item.id === 'bmi'
                    ? <ChevronDown className={`w-4 h-4 text-slate-300 dark:text-white/20 transition-transform ${bmiExpanded ? 'rotate-180' : ''}`} />
                    : item.id === 'help'
                    ? <ChevronDown className={`w-4 h-4 text-slate-300 dark:text-white/20 transition-transform ${helpExpanded ? 'rotate-180' : ''}`} />
                    : !isToggle && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-white/20" />}
                </div>
              </button>

              {isPrivacy && privacyExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {([
                    { label: t('profile.privacy.anonymousPosting'), sub: t('profile.privacy.anonymousPostingSub'), on: profile.socialAnonymousPosting, toggle: toggleSocialAnonymous },
                    { label: t('profile.privacy.hideWeight'), sub: t('profile.privacy.hideWeightSub'), on: profile.socialHideWeightNumbers, toggle: toggleHideWeightNumbers },
                    { label: t('profile.privacy.hideBodyPhotos'), sub: t('profile.privacy.hideBodyPhotosSub'), on: profile.socialHideBodyPhotos, toggle: toggleHideBodyPhotos },
                  ] as Array<{ label: string; sub: string; on: boolean; toggle: () => void }>).map(({ label, sub, on, toggle }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={toggle}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5"
                    >
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-700 dark:text-white/80">{label}</p>
                        <p className="text-[11px] text-slate-400 dark:text-white/30">{sub}</p>
                      </div>
                      <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-3 ${on ? 'bg-orange-500' : 'bg-slate-200 dark:bg-white/[0.1]'}`}>
                        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {item.id === 'journey' && journeyExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: t('profile.journey.measurementsLogged'), value: journeyWeightSeries.length },
                      { label: t('profile.journey.weightChange'), value: weightDeltaJourney === null ? '--' : `${weightDeltaJourney > 0 ? '+' : ''}${weightDeltaJourney} kg` },
                      { label: t('profile.journey.avgDiscipline'), value: Math.round(journeyDisciplineSeries.reduce((sum, p) => sum + p.score, 0) / Math.max(1, journeyDisciplineSeries.length)) },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3 text-center">
                        <p className="text-xl font-bold text-slate-800 dark:text-white/90">{value}</p>
                        <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5 leading-tight">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-3">{t('profile.journey.weightTrend')}</p>
                    <svg viewBox="0 0 420 170" className="w-full h-32">
                      {(() => {
                        const values = journeyWeightSeries.map((point) => point.value);
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        const range = Math.max(1, max - min);
                        const coords = journeyWeightSeries.map((point, index) => {
                          const x = journeyWeightSeries.length === 1 ? 210 : (index / (journeyWeightSeries.length - 1)) * 390 + 15;
                          const y = 140 - ((point.value - min) / range) * 115;
                          return { x, y, value: point.value, date: point.date };
                        });
                        return (
                          <>
                            <line x1="15" y1="140" x2="405" y2="140" stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                            <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={coords.map((c) => `${c.x},${c.y}`).join(' ')} />
                            {coords.map((c) => (
                              <circle key={`${c.date}-${c.value}`} cx={c.x} cy={c.y} r="3" fill="#f97316" />
                            ))}
                            <text x="15" y="158" fontSize="9" fill="rgba(148,163,184,0.8)">{formatDateKey(coords[0]?.date ?? toDateKey(today))}</text>
                            <text x="340" y="158" fontSize="9" fill="rgba(148,163,184,0.8)">{formatDateKey(coords[coords.length - 1]?.date ?? toDateKey(today))}</text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-3">{t('profile.journey.disciplineLast14')}</p>
                    <div className="grid grid-cols-14 gap-1 items-end h-16">
                      {journeyDisciplineSeries.map((point) => (
                        <div key={point.dateKey} className="flex flex-col items-center justify-end h-full">
                          <div
                            className="w-full rounded-sm"
                            style={{
                              height: `${Math.max(6, Math.round((point.score / 100) * 90))}%`,
                              background: point.score >= 70 ? '#f97316' : 'rgba(148,163,184,0.35)',
                            }}
                            title={`${formatDateKey(point.dateKey)}: ${point.score}`}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-400 dark:text-white/30">
                      <span>{formatDateKey(journeyDisciplineSeries[0]?.dateKey ?? toDateKey(today))}</span>
                      <span>{formatDateKey(journeyDisciplineSeries[journeyDisciplineSeries.length - 1]?.dateKey ?? toDateKey(today))}</span>
                    </div>
                  </div>
                </div>
              )}

              {item.id === 'bmi' && bmiExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                      <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.latestWeight')}</p>
                      <p className="text-xl font-bold text-slate-800 dark:text-white/90 mt-0.5">
                        {latestMeasurement ? `${latestMeasurement.weightKg} kg` : `${profile.weightKg} kg`}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                      <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.changeSinceLast')}</p>
                      <p className={`text-xl font-bold mt-0.5 ${weightDeltaFromLast === null ? 'text-slate-400' : weightDeltaFromLast < 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                        {weightDeltaFromLast === null ? '--' : `${weightDeltaFromLast > 0 ? '+' : ''}${weightDeltaFromLast} kg`}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide">{t('profile.measurements.heightCm')}</label>
                      <input
                        inputMode="decimal"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        placeholder={t('profile.measurements.heightPlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide">{t('profile.measurements.weightKg')}</label>
                      <input
                        inputMode="decimal"
                        value={weightKg}
                        onChange={(e) => setWeightKg(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        placeholder={t('profile.measurements.weightPlaceholder')}
                      />
                    </div>
                  </div>
                  {bmi !== null ? (
                    <div className="rounded-xl bg-orange-500/[0.08] border border-orange-500/15 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] text-orange-500 dark:text-orange-400 font-semibold uppercase tracking-wide mb-0.5">{t('profile.measurements.yourBmiNow')}</p>
                        <p className="text-3xl font-bold text-slate-800 dark:text-white/90">{bmi.toFixed(1)}</p>
                        <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{bmiCategory(bmi)}</p>
                        {healthyWeightRange && (
                          <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1">
                            {t('profile.measurements.healthyWeightRange', { min: healthyWeightRange.min, max: healthyWeightRange.max })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={saveBmi}
                        className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm text-white font-semibold shadow-sm"
                      >
                        {t('profile.measurements.saveButton')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-white/30 text-center py-2">Skriv inn høyde og vekt for å beregne BMI.</p>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide mb-3">{t('profile.measurements.healthLogging')}</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {([
                        { label: t('profile.measurements.waistCm'), value: waistCmInput, set: setWaistCmInput, mode: 'decimal', ph: t('profile.measurements.waistPlaceholder') },
                        { label: t('profile.measurements.sleepHours'), value: sleepHoursInput, set: setSleepHoursInput, mode: 'decimal', ph: t('profile.measurements.sleepPlaceholder') },
                        { label: t('profile.measurements.restingHr'), value: restingHrInput, set: setRestingHrInput, mode: 'numeric', ph: t('profile.measurements.restingHrPlaceholder') },
                        { label: t('profile.measurements.stress'), value: stressLevelInput, set: setStressLevelInput, mode: 'numeric', ph: t('profile.measurements.stressPlaceholder') },
                      ] as Array<{ label: string; value: string; set: (v: string) => void; mode: React.HTMLAttributes<HTMLInputElement>['inputMode']; ph: string }>).map(({ label, value, set, mode, ph }) => (
                        <div key={label}>
                          <label className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{label}</label>
                          <input
                            inputMode={mode}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                            placeholder={ph}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5">
                      <label className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.stepsDay')}</label>
                      <input
                        inputMode="numeric"
                        value={stepsInput}
                        onChange={(e) => setStepsInput(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        placeholder={t('profile.measurements.stepsPlaceholder')}
                      />
                    </div>
                  </div>
                  {latestHealth && (
                    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                      <p className="text-xs font-semibold text-slate-600 dark:text-white/60 mb-2">{t('profile.measurements.lastHealthEntry')}</p>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {([
                          [t('profile.measurements.waist'), latestHealth.waistCm != null ? `${latestHealth.waistCm} ${t('profile.measurements.cm')}` : '--'],
                          [t('profile.measurements.sleep'), latestHealth.sleepHours != null ? `${latestHealth.sleepHours} ${t('profile.measurements.hoursAbbr')}` : '--'],
                          [t('profile.measurements.restingHr'), latestHealth.restingHr != null ? `${latestHealth.restingHr} ${t('profile.measurements.bpm')}` : '--'],
                          ['Stress', String(latestHealth.stressLevel ?? '--')],
                        ] as Array<[string, string]>).map(([k, v]) => (
                          <p key={k} className="text-slate-500 dark:text-white/45">{k}: <span className="font-semibold text-slate-700 dark:text-white/70">{v}</span></p>
                        ))}
                        <p className="col-span-2 text-slate-500 dark:text-white/45">{t('profile.measurements.steps')}<span className="font-semibold text-slate-700 dark:text-white/70">{latestHealth.steps ?? '--'}</span></p>
                      </div>
                    </div>
                  )}
                  {bmiHistory.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide mb-2">{t('profile.measurements.recentMeasurements')}</p>
                      <div className="space-y-1.5">
                        {bmiHistory.slice(0, 3).map((entry) => (
                          <div key={`${entry.date}-${entry.bmi}`} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2 flex justify-between text-xs">
                            <span className="text-slate-500 dark:text-white/40">{entry.date}</span>
                            <span className="font-semibold text-slate-700 dark:text-white/70">{entry.weightKg} kg · BMI {entry.bmi}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {item.id === 'help' && helpExpanded && (
                <div className="px-4 pb-4 space-y-2.5">
                  {[
                    { q: 'Hvordan logger jeg mat?', a: 'Gå til Hjem-fanen og trykk på et måltid (Frokost, Lunsj, osv.) for å legge til matvarer manuelt, via strekkode-skann eller bilde.' },
                    { q: 'Hva er disiplin-score?', a: 'Disiplin-score (0–100) belønner deg for å logge mat, drikke nok vann, trene og nå kalori- og proteinmålet ditt.' },
                    { q: 'Hvordan endrer jeg kalori- og proteinmål?', a: 'Gå til Profil → Personlig info og juster vekt, aktivitetsnivå og mål. Systemet beregner automatisk nye mål.' },
                    { q: 'Hva gjør allergifilteret?', a: 'Når du legger til allergier under Smart Diettprofel, vil appen advare deg når du prøver å logge matvarer som inneholder allergenet.' },
                    { q: 'Kan jeg eksportere dataene mine?', a: 'Ja, trykk på "Eksporter data"-knappen nederst på Profil-siden for å laste ned en kopi av loggene dine.' },
                  ].map(({ q, a }) => (
                    <div key={q} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                      <p className="text-sm font-semibold text-slate-700 dark:text-white/80 mb-1">{q}</p>
                      <p className="text-xs text-slate-500 dark:text-white/45 leading-relaxed">{a}</p>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400 dark:text-white/25 text-center pt-1">KaloriFit v1.0.0 · Rapporter bugs i appen</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mx-0 mt-4 mb-2">
        <button
          onClick={handleExportData}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/70 font-semibold active:scale-[0.98] transition-transform"
        >
          <Shield className="w-4 h-4" />
          {t('profile.exportData')}
        </button>
        <button
          onClick={() => importFileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/70 font-semibold active:scale-[0.98] transition-transform"
        >
          <Upload className="w-4 h-4" />
          {t('profile.importData')}
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportData}
        />
      </div>
      {importError && (
        <p className="text-xs text-red-500 text-center -mt-1 mb-2">{importError}</p>
      )}

      <button className="w-full flex items-center justify-center gap-2 mx-0 mt-2 mb-2 py-4 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.08] text-red-500 font-semibold active:scale-[0.98] transition-transform">
        <LogOut className="w-4 h-4" />
        {t('profile.logOut')}
      </button>

      {showDietExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('profile.dietExplorer.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.dietExplorer.subtitle')}</p>
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
                          {dietStyleTitles[option.style] ?? option.title} {isActive ? t('profile.dietExplorer.active') : ''}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{option.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.dietExplorer.bestFor')}{option.bestFor}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyDietStyle(option.style)}
                        disabled={isActive}
                        className={`text-xs rounded-lg px-3 py-1.5 font-medium ${isActive ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'bg-emerald-100 text-emerald-700'}`}
                      >
                        {isActive ? t('profile.dietExplorer.selectedButton') : t('profile.dietExplorer.useButton')}
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
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('profile.trophyRoom.title')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('profile.trophyRoom.monthlyUpdate')}{monthlyIdentity.monthKey}</p>
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
              {highlightedBadges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {highlightedBadges.map((badge) => (
                    <span key={badge.id} className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-200">
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <div className="flex justify-between items-end">
                <p className="text-sm text-gray-600 dark:text-gray-300">Level {monthlyIdentity.level.value} - {monthlyIdentity.level.label}</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {monthlyIdentity.level.currentXp}/{monthlyIdentity.level.nextLevelXp} XP
                </p>
              </div>
              <div className="h-2 bg-white dark:bg-gray-600 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${monthlyIdentity.level.progressPct}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.trophyRoom.avgDiscipline')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.avgDisciplineScore}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.trophyRoom.consistency')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.consistencyRate}%</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.trophyRoom.bestStreak')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.bestStreakDays} {t('profile.trophyRoom.days')}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">{t('profile.trophyRoom.challenges')}</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.challengeCompletions}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.trophyRoom.xpSources')}</p>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.trophyRoom.logging')}</span>
                  <span>{monthlyIdentity.xpBreakdown.logging} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.trophyRoom.hittingGoals')}</span>
                  <span>{monthlyIdentity.xpBreakdown.goals} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>{t('profile.trophyRoom.completingChallenges')}</span>
                  <span>{monthlyIdentity.xpBreakdown.challenges} XP</span>
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 flex justify-between">
                <p className="font-semibold text-gray-700 dark:text-gray-200">{t('profile.trophyRoom.total')}</p>
                <p className="font-semibold text-amber-600 dark:text-amber-300">{monthlyIdentity.xpBreakdown.total} XP</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.trophyRoom.unlockedTitles')}</p>
              <div className="space-y-2">
                {monthlyIdentity.unlockedTitles.map((title) => (
                  <div key={title} className="rounded-lg bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{titleDescriptions[title]}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{t('profile.trophyRoom.trophyBadges')}</p>
              <div className="space-y-2">
                {trophyBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`rounded-lg p-3 border ${
                      badge.unlocked
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-semibold ${badge.unlocked ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-100'}`}>
                        {badge.label}
                      </p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge.unlocked ? 'bg-emerald-100 dark:bg-emerald-800/70 text-emerald-700 dark:text-emerald-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`}>
                        {badge.unlocked ? t('profile.trophyRoom.unlocked') : t('profile.trophyRoom.locked')}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${badge.unlocked ? 'text-emerald-700/90 dark:text-emerald-200' : 'text-gray-500 dark:text-gray-400'}`}>{badge.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {false && showJourney && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-4 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white/90">{t('profile.journey.title')}</h3>
                <p className="text-xs text-slate-500 dark:text-white/40">{t('profile.journey.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowJourney(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-600 dark:text-white/70" />
              </button>
            </div>
            <div className="p-5">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: t('profile.journey.measurementsLogged'), value: journeyWeightSeries.length },
                { label: t('profile.journey.weightChange'), value: weightDeltaJourney === null ? '--' : `${weightDeltaJourney! > 0 ? '+' : ''}${weightDeltaJourney!} kg` },
                { label: t('profile.journey.avgDiscipline'), value: Math.round(journeyDisciplineSeries.reduce((sum, p) => sum + p.score, 0) / Math.max(1, journeyDisciplineSeries.length)) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3 text-center">
                  <p className="text-xl font-bold text-slate-800 dark:text-white/90">{value}</p>
                  <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-4 mb-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-3">{t('profile.journey.weightTrend')}</p>
              <svg viewBox="0 0 420 170" className="w-full h-36">
                {(() => {
                  const values = journeyWeightSeries.map((point) => point.value);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = Math.max(1, max - min);
                  const coords = journeyWeightSeries.map((point, index) => {
                    const x = journeyWeightSeries.length === 1 ? 210 : (index / (journeyWeightSeries.length - 1)) * 390 + 15;
                    const y = 140 - ((point.value - min) / range) * 115;
                    return { x, y, value: point.value, date: point.date };
                  });
                  return (
                    <>
                      <line x1="15" y1="140" x2="405" y2="140" stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                      <polyline fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={coords.map((c) => `${c.x},${c.y}`).join(' ')} />
                      {coords.map((c) => (
                        <circle key={`${c.date}-${c.value}`} cx={c.x} cy={c.y} r="3" fill="#f97316" />
                      ))}
                      <text x="15" y="158" fontSize="9" fill="rgba(148,163,184,0.8)">{formatDateKey(coords[0]?.date ?? toDateKey(today))}</text>
                      <text x="340" y="158" fontSize="9" fill="rgba(148,163,184,0.8)">{formatDateKey(coords[coords.length - 1]?.date ?? toDateKey(today))}</text>
                    </>
                  );
                })()}
              </svg>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-white/70 mb-3">{t('profile.journey.disciplineLast14')}</p>
              <div className="grid grid-cols-14 gap-1 items-end h-20">
                {journeyDisciplineSeries.map((point) => (
                  <div key={point.dateKey} className="flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max(6, Math.round((point.score / 100) * 90))}%`,
                        background: point.score >= 70 ? '#f97316' : 'rgba(148,163,184,0.35)',
                      }}
                      title={`${formatDateKey(point.dateKey)}: ${point.score}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-400 dark:text-white/30">
                <span>{formatDateKey(journeyDisciplineSeries[0]?.dateKey ?? toDateKey(today))}</span>
                <span>{formatDateKey(journeyDisciplineSeries[journeyDisciplineSeries.length - 1]?.dateKey ?? toDateKey(today))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {false && showBmi && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-4 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white/90">{t('profile.measurements.title')}</h3>
                <p className="text-xs text-slate-400 dark:text-white/35">{t('profile.measurements.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowBmi(false)}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-600 dark:text-white/70" />
              </button>
            </div>

            <div className="px-5 pb-6 space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                  <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.latestWeight')}</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-white/90 mt-0.5">
                    {latestMeasurement ? `${latestMeasurement.weightKg} kg` : `${profile.weightKg} kg`}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                  <p className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.changeSinceLast')}</p>
                  <p className={`text-xl font-bold mt-0.5 ${weightDeltaFromLast === null ? 'text-slate-400' : weightDeltaFromLast! < 0 ? 'text-emerald-500' : 'text-orange-500'}`}>
                    {weightDeltaFromLast === null ? '--' : `${weightDeltaFromLast! > 0 ? '+' : ''}${weightDeltaFromLast!} kg`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide">{t('profile.measurements.heightCm')}</label>
                  <input
                    inputMode="decimal"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    placeholder={t('profile.measurements.heightPlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide">{t('profile.measurements.weightKg')}</label>
                  <input
                    inputMode="decimal"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    placeholder={t('profile.measurements.weightPlaceholder')}
                  />
                </div>
              </div>

              {bmi !== null && (
                <div className="rounded-xl bg-orange-500/[0.08] border border-orange-500/15 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] text-orange-500 dark:text-orange-400 font-semibold uppercase tracking-wide mb-0.5">{t('profile.measurements.yourBmiNow')}</p>
                    <p className="text-3xl font-bold text-slate-800 dark:text-white/90">{bmi!.toFixed(1)}</p>
                    <p className="text-sm text-slate-500 dark:text-white/50 mt-0.5">{bmiCategory(bmi!)}</p>
                    {healthyWeightRange && (
                      <p className="text-[11px] text-slate-400 dark:text-white/30 mt-1">
                        {t('profile.measurements.healthyWeightRange', { min: healthyWeightRange!.min, max: healthyWeightRange!.max })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveBmi}
                    className="shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-sm text-white font-semibold shadow-sm"
                  >
                    {t('profile.measurements.saveButton')}
                  </button>
                </div>
              )}
              {bmi === null && (
                <p className="text-sm text-slate-400 dark:text-white/30 text-center py-2">Skriv inn høyde og vekt for å beregne BMI.</p>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide mb-3">{t('profile.measurements.healthLogging')}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { label: t('profile.measurements.waistCm'), value: waistCmInput, set: setWaistCmInput, mode: 'decimal', ph: t('profile.measurements.waistPlaceholder') },
                    { label: t('profile.measurements.sleepHours'), value: sleepHoursInput, set: setSleepHoursInput, mode: 'decimal', ph: t('profile.measurements.sleepPlaceholder') },
                    { label: t('profile.measurements.restingHr'), value: restingHrInput, set: setRestingHrInput, mode: 'numeric', ph: t('profile.measurements.restingHrPlaceholder') },
                    { label: t('profile.measurements.stress'), value: stressLevelInput, set: setStressLevelInput, mode: 'numeric', ph: t('profile.measurements.stressPlaceholder') },
                  ] as Array<{ label: string; value: string; set: (v: string) => void; mode: React.HTMLAttributes<HTMLInputElement>['inputMode']; ph: string }>).map(({ label, value, set, mode, ph }) => (
                    <div key={label}>
                      <label className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{label}</label>
                      <input
                        inputMode={mode}
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        placeholder={ph}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2.5">
                  <label className="text-[11px] text-slate-400 dark:text-white/35 font-medium">{t('profile.measurements.stepsDay')}</label>
                  <input
                    inputMode="numeric"
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    placeholder={t('profile.measurements.stepsPlaceholder')}
                  />
                </div>
              </div>

              {latestHealth && (
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] p-3">
                  <p className="text-xs font-semibold text-slate-600 dark:text-white/60 mb-2">{t('profile.measurements.lastHealthEntry')}</p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {([
                      [t('profile.measurements.waist'), latestHealth.waistCm != null ? `${latestHealth.waistCm} ${t('profile.measurements.cm')}` : '--'],
                      [t('profile.measurements.sleep'), latestHealth.sleepHours != null ? `${latestHealth.sleepHours} ${t('profile.measurements.hoursAbbr')}` : '--'],
                      [t('profile.measurements.restingHr'), latestHealth.restingHr != null ? `${latestHealth.restingHr} ${t('profile.measurements.bpm')}` : '--'],
                      ['Stress', String(latestHealth.stressLevel ?? '--')],
                    ] as Array<[string, string]>).map(([k, v]) => (
                      <p key={k} className="text-slate-500 dark:text-white/45">{k}: <span className="font-semibold text-slate-700 dark:text-white/70">{v}</span></p>
                    ))}
                    <p className="col-span-2 text-slate-500 dark:text-white/45">{t('profile.measurements.steps')}<span className="font-semibold text-slate-700 dark:text-white/70">{latestHealth.steps ?? '--'}</span></p>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 dark:text-white/25 text-center pb-1">
                {t('profile.measurements.loggingTip')}
              </p>

              {bmiHistory.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-white/45 uppercase tracking-wide mb-2">{t('profile.measurements.recentMeasurements')}</p>
                  <div className="space-y-1.5">
                    {bmiHistory.slice(0, 3).map((entry) => (
                      <div key={`${entry.date}-${entry.bmi}`} className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05] px-3 py-2 flex justify-between text-xs">
                        <span className="text-slate-500 dark:text-white/40">{entry.date}</span>
                        <span className="font-semibold text-slate-700 dark:text-white/70">{entry.weightKg} kg · BMI {entry.bmi}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-4 pb-8">
        KaloriFit v1.0.0
      </p>
    </div>
  );
}
