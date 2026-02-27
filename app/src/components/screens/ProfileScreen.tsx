import { Activity, ArrowLeft, Bell, ChevronRight, Globe, HelpCircle, LogOut, Moon, Settings, Shield, Trophy, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import {
  addDays,
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
type TrophyBadge = {
  id:
    | 'beta_tester'
    | 'developer'
    | 'og'
    | 'dedicated'
    | 'consistency_pro'
    | 'streak_master'
    | 'hydration_hero'
    | 'active_mover'
    | 'challenge_hunter'
    | 'logging_legend';
  label: string;
  description: string;
  unlocked: boolean;
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
  equippedBadgeIds: TrophyBadge['id'][];
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
  const { currentUser, updateUserName } = useCurrentUser();
  const [profile, setProfile] = useLocalStorageState<Profile>('profile', DEFAULT_PROFILE);
  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [weeklyReports, setWeeklyReports] = useLocalStorageState<Record<string, WeeklyPerformanceReport>>('home.weeklyReports.v1', EMPTY_WEEKLY_REPORTS);
  const [identityReports, setIdentityReports] = useLocalStorageState<IdentityReportsByMonth>('home.identityReports.v1', EMPTY_IDENTITY_REPORTS);
  const [showBmi, setShowBmi] = useState(false);
  const [showPersonalSettings, setShowPersonalSettings] = useState(false);
  const [showDietExplorer, setShowDietExplorer] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
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
  const [draftEquippedBadgeIds, setDraftEquippedBadgeIds] = useState<TrophyBadge['id'][]>(profile.equippedBadgeIds ?? []);
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
    if (b < 18.5) return 'Undervekt';
    if (b < 25) return 'Normal';
    if (b < 30) return 'Overvekt';
    return 'Fedme';
  };

  const bmiHistory = Array.isArray(profile.bmiHistory) ? profile.bmiHistory : [];
  const healthHistory = Array.isArray(profile.healthHistory) ? profile.healthHistory : [];
  const latestMeasurement = bmiHistory[0] ?? null;
  const previousMeasurement = bmiHistory[1] ?? null;
  const latestHealth = healthHistory[0] ?? null;
  const previousHealth = healthHistory[1] ?? null;
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
    const activeDays = allLogs.filter((log) => Object.values(log.meals).flat().length > 0 || log.waterMl > 0 || log.trainingKcal > 0).length;
    const mealsLogged = allLogs.reduce((sum, log) => sum + Object.values(log.meals).flat().length, 0);
    const caloriesLogged = allLogs.reduce(
      (sum, log) => sum + Object.values(log.meals).flat().reduce((daySum, food) => daySum + food.kcal, 0),
      0,
    );
    const numberFormatter = new Intl.NumberFormat('nb-NO');

    return [
      {
        label: 'Aktive dager',
        value: numberFormatter.format(activeDays),
        color: 'text-orange-500',
      },
      {
        label: 'Maltider logget',
        value: numberFormatter.format(mealsLogged),
        color: 'text-blue-500',
      },
      {
        label: 'Kalorier logget',
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
    { id: 'personal', icon: Settings, label: 'Personlig info', value: '' },
    { id: 'notifications', icon: Bell, label: 'Varsler', value: profile.notificationsEnabled ? 'Pa' : 'Av' },
    { id: 'privacy', icon: Shield, label: 'Personvern', value: profile.privacyMode },
    { id: 'darkmode', icon: Moon, label: 'Mork modus', value: darkMode ? 'Pa' : 'Av' },
    { id: 'language', icon: Globe, label: 'Sprak', value: profile.language },
    { id: 'journey', icon: Trophy, label: 'Your journey', value: '' },
    { id: 'bmi', icon: Activity, label: 'Mine malinger', value: '' },
    { id: 'help', icon: HelpCircle, label: 'Hjelp og stotte', value: '' },
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
      ? 'Oppadgaende'
      : latestWeeklyReport.trendDirection === 'down'
      ? 'Nedadgaende'
      : 'Stabil';

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

  const titleDescriptions: Record<string, string> = {
    'The Grinder': 'High consistency across the month.',
    'The Comeback': 'Strong improvement from early to late month.',
    'The Sharpshooter': 'Precise calorie control with stable execution.',
    'The Iron Discipline': '30+ day discipline streak unlocked.',
    'The Balanced Strategist': 'Balanced performance across calories, protein, water, and activity.',
  };

  const trophyBadges = useMemo(() => {
    const memberYear = Number.parseInt(profile.memberSince, 10);
    const currentYear = new Date().getFullYear();
    const isDeveloper = /dev|developer|admin|hrger/i.test(`${currentUser.name} ${profile.name}`);
    const allLogs = Object.values(logsByDate);
    const mealsLoggedTotal = allLogs.reduce((sum, log) => sum + Object.values(log.meals).flat().length, 0);
    const hydrationDays = allLogs.filter((log) => log.waterMl >= 1600).length;
    const workoutDays = allLogs.filter((log) => log.trainingKcal >= 200).length;

    const hasValidMemberYear = Number.isFinite(memberYear);
    const betaTesterUnlocked = hasValidMemberYear ? memberYear <= currentYear : monthlyIdentity.level.value >= 2;
    const ogUnlocked = hasValidMemberYear ? memberYear <= currentYear - 1 : monthlyIdentity.level.value >= 6;
    const dedicatedUnlocked = monthlyIdentity.bestStreakDays >= 14 || monthlyIdentity.consistencyRate >= 75;
    const consistencyProUnlocked = monthlyIdentity.consistencyRate >= 85;
    const streakMasterUnlocked = monthlyIdentity.bestStreakDays >= 30;
    const hydrationHeroUnlocked = hydrationDays >= 20;
    const activeMoverUnlocked = workoutDays >= 20;
    const challengeHunterUnlocked = monthlyIdentity.challengeCompletions >= 25;
    const loggingLegendUnlocked = mealsLoggedTotal >= 300;

    const badges: TrophyBadge[] = [
      {
        id: 'beta_tester',
        label: 'Beta Tester',
        description: 'Tidlig bruker som var med pa a teste appen.',
        unlocked: betaTesterUnlocked,
      },
      {
        id: 'developer',
        label: 'Developer',
        description: 'Utvikler-rolle for build/test-miljo.',
        unlocked: isDeveloper,
      },
      {
        id: 'og',
        label: 'OG',
        description: 'Tidlig medlem med lang historikk.',
        unlocked: ogUnlocked,
      },
      {
        id: 'dedicated',
        label: 'Dedicated',
        description: 'Hoy konsistens eller sterk streak.',
        unlocked: dedicatedUnlocked,
      },
      {
        id: 'consistency_pro',
        label: 'Consistency Pro',
        description: '85%+ konsistens i maanedsrapport.',
        unlocked: consistencyProUnlocked,
      },
      {
        id: 'streak_master',
        label: 'Streak Master',
        description: '30+ dagers disiplinstreak.',
        unlocked: streakMasterUnlocked,
      },
      {
        id: 'hydration_hero',
        label: 'Hydration Hero',
        description: '20 dager med minst 1600 ml vann logget.',
        unlocked: hydrationHeroUnlocked,
      },
      {
        id: 'active_mover',
        label: 'Active Mover',
        description: '20 treningsdager med 200+ kcal aktivitet.',
        unlocked: activeMoverUnlocked,
      },
      {
        id: 'challenge_hunter',
        label: 'Challenge Hunter',
        description: '25+ fullforte utfordringer i maaneden.',
        unlocked: challengeHunterUnlocked,
      },
      {
        id: 'logging_legend',
        label: 'Logging Legend',
        description: '300+ maltider logget totalt.',
        unlocked: loggingLegendUnlocked,
      },
    ];

    return badges;
  }, [
    currentUser.name,
    logsByDate,
    monthlyIdentity.bestStreakDays,
    monthlyIdentity.challengeCompletions,
    monthlyIdentity.consistencyRate,
    monthlyIdentity.level.value,
    profile.memberSince,
    profile.name,
  ]);

  const highlightedBadges = trophyBadges.filter((badge) => badge.unlocked).slice(0, 3);
  const equippedBadges = trophyBadges.filter((badge) => (profile.equippedBadgeIds ?? []).includes(badge.id)).slice(0, 3);

  const badgeStyleById = (id: TrophyBadge['id']) => {
    if (id === 'developer') return 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-indigo-300';
    if (id === 'og') return 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-300';
    if (id === 'beta_tester') return 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white border-fuchsia-300';
    if (id === 'dedicated') return 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-300';
    if (id === 'consistency_pro') return 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-300';
    if (id === 'streak_master') return 'bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-300';
    if (id === 'hydration_hero') return 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white border-cyan-300';
    if (id === 'active_mover') return 'bg-gradient-to-r from-lime-500 to-green-500 text-white border-lime-300';
    if (id === 'challenge_hunter') return 'bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-300';
    return 'bg-gradient-to-r from-slate-500 to-gray-600 text-white border-slate-300';
  };

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
            title="Tilbake"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Personlig info</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="card dark:bg-gray-800 dark:border-gray-700 m-0">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Profilbilde</label>
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
                      Velg bilde
                    </button>
                    {draftProfileImage && (
                      <button
                        onClick={() => setDraftProfileImage(null)}
                        className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-3 py-2 text-sm font-medium"
                      >
                        Fjern
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
                <label className="text-sm text-gray-600 dark:text-gray-400">Navn</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. Ola Nordmann"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Medlem siden</label>
                <input
                  value={draftMemberSince}
                  onChange={(e) => setDraftMemberSince(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 2024"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Alder</label>
                  <input
                    inputMode="numeric"
                    value={draftAge}
                    onChange={(e) => setDraftAge(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                    placeholder="f.eks. 30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Kjonn</label>
                  <select
                    value={draftSex}
                    onChange={(e) => setDraftSex(e.target.value as BiologicalSex)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="female">Kvinne</option>
                    <option value="male">Mann</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Aktivitet</label>
                <select
                  value={draftActivityLevel}
                  onChange={(e) => setDraftActivityLevel(e.target.value as ActivityLevel)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="sedentary">Stillesittende</option>
                  <option value="light">Lett aktiv</option>
                  <option value="moderate">Moderat aktiv</option>
                  <option value="very">Veldig aktiv</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Konfigurasjonsnivå</label>
                <select
                  value={draftSettingsTier}
                  onChange={(e) => setDraftSettingsTier(e.target.value as SettingsTier)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                >
                  <option value="basic">Basic mode</option>
                  <option value="advanced">Advanced mode</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">Goal kategori</label>
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
                  <label className="text-sm text-gray-600 dark:text-gray-400">Diet style</label>
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
                <label className="text-sm text-gray-600 dark:text-gray-400">Goal strategi</label>
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
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Advanced system</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Training type</label>
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
                      <label className="text-sm text-gray-600 dark:text-gray-400">Training day +kcal</label>
                      <input inputMode="numeric" value={draftTrainingBoost} onChange={(e) => setDraftTrainingBoost(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Metabolic sensitivity</label>
                      <select value={draftMetabolicSensitivity} onChange={(e) => setDraftMetabolicSensitivity(e.target.value as MetabolicSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="gain_easy">Gain weight easily</option>
                        <option value="normal">Normal</option>
                        <option value="lose_easy">Lose weight easily</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Plateau sensitivity</label>
                      <select value={draftPlateauSensitivity} onChange={(e) => setDraftPlateauSensitivity(e.target.value as PlateauSensitivity)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="conservative">Conservative</option>
                        <option value="standard">Standard</option>
                        <option value="aggressive">Aggressive</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Lifestyle</label>
                      <select value={draftLifestylePattern} onChange={(e) => setDraftLifestylePattern(e.target.value as LifestylePattern)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="3_meals">3 meals</option>
                        <option value="4_meals">4 meals</option>
                        <option value="5_small_meals">5 small meals</option>
                        <option value="if_16_8">Intermittent fasting 16:8</option>
                        <option value="omad">OMAD</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Behavior</label>
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
                      <label className="text-sm text-gray-600 dark:text-gray-400">Timeline</label>
                      <select value={draftTimelineType} onChange={(e) => setDraftTimelineType(e.target.value as TimelineType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="8_week_cut">8-week cut</option>
                        <option value="12_week_bulk">12-week bulk</option>
                        <option value="maintenance_open">Open maintenance</option>
                        <option value="event_based">Event-based</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Weeks</label>
                      <input inputMode="numeric" value={draftTimelineWeeks} onChange={(e) => setDraftTimelineWeeks(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  </div>

                  {draftTimelineType === 'event_based' && (
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Event date</label>
                      <input type="date" value={draftEventDate} onChange={(e) => setDraftEventDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200" />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Psychology type</label>
                      <select value={draftPsychologyType} onChange={(e) => setDraftPsychologyType(e.target.value as PsychologyType)} className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-gray-200">
                        <option value="data_driven">Data-driven</option>
                        <option value="visual">Visual learner</option>
                        <option value="competitive">Competitive</option>
                        <option value="community">Community-focused</option>
                        <option value="private">Private tracker</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 dark:text-gray-400">Special phase</label>
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
                      Cycle-based adjustment
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
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-2">Equip badges</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Velg opptil 3 badges som vises pa profilen og i feed.</p>
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
                        {isEquipped ? 'Equipped: ' : ''}{badge.label}
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
            className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
            title="Rediger profil"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className="mb-4 rounded-full p-[4px]"
              style={{
                background: `conic-gradient(#f59e0b ${xpRingProgress}%, rgba(255,255,255,0.35) ${xpRingProgress}% 100%)`,
              }}
            >
              {profile.profileImageDataUrl ? (
                <img
                  src={profile.profileImageDataUrl}
                  alt={profile.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/40 bg-white"
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
              className="absolute bottom-4 right-0 h-4 w-4 rounded-full border-2 border-white bg-green-500 shadow-sm"
              title="Aktiv"
              aria-label="Aktiv profilstatus"
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold mb-1">{profile.name}</h2>
            <p className="text-white/70">Medlem siden {profile.memberSince}</p>
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
          <div key={index} className="stat-card dark:bg-gray-800 dark:border-gray-700">
            <p className={`stat-value ${stat.color}`}>{stat.value}</p>
            <p className="stat-label dark:text-gray-300">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Smart diet profile</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{goalStrategyLabel}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {dietStyleLabel} | {settingsTierLabel}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDietExplorer(true)}
              className="text-xs rounded-lg bg-emerald-100 text-emerald-700 px-3 py-1.5"
            >
              Explore diets
            </button>
          </div>
        </div>
        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase">Allergier</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Filtreres automatisk i Maltider.</p>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAllergy(allergyInput);
              }
            }}
            placeholder="f.eks. fish, gluten, nuts"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
          />
          <button
            type="button"
            onClick={() => addAllergy(allergyInput)}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white"
            >
              Legg til
            </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(profile.allergies ?? []).length > 0 ? (
            (profile.allergies ?? []).map((allergy) => (
              <button
                key={allergy}
                type="button"
                onClick={() => removeAllergy(allergy)}
                className="text-xs px-2 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                title="Fjern allergi"
              >
                {allergy} x
              </button>
            ))
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Ingen allergier lagt til.</p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['gluten', 'milk', 'egg', 'nuts', 'fish', 'shellfish', 'soy', 'peanuts'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addAllergy(item)}
              className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              + {item}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <button onClick={() => setShowIdentity(true)} className="w-full text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Identity</p>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{monthlyIdentity.primaryTitle}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Level {monthlyIdentity.level.value} - {monthlyIdentity.level.label}
              </p>
              {highlightedBadges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {highlightedBadges.map((badge) => (
                    <span
                      key={badge.id}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-200"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-500">{monthlyIdentity.level.currentXp}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">/ {monthlyIdentity.level.nextLevelXp} XP</p>
            </div>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${monthlyIdentity.level.progressPct}%` }} />
          </div>
        </button>
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-orange-500" />
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Social safety controls</h3>
        </div>
        <div className="privacy-grid">
          <button
            type="button"
            onClick={toggleSocialAnonymous}
            className={`privacy-toggle dark:bg-gray-700 dark:text-gray-200 ${profile.socialAnonymousPosting ? 'privacy-on' : ''}`}
          >
            Anonymous posting: {profile.socialAnonymousPosting ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={toggleHideWeightNumbers}
            className={`privacy-toggle dark:bg-gray-700 dark:text-gray-200 ${profile.socialHideWeightNumbers ? 'privacy-on' : ''}`}
          >
            Hide weight numbers: {profile.socialHideWeightNumbers ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={toggleHideBodyPhotos}
            className={`privacy-toggle dark:bg-gray-700 dark:text-gray-200 ${profile.socialHideBodyPhotos ? 'privacy-on' : ''}`}
          >
            Hide body photos: {profile.socialHideBodyPhotos ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Daily Discipline Score</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Automatisk basert pa dagens logging</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-orange-500">{dailyDiscipline.score}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{dailyDiscipline.grade}</p>
          </div>
        </div>

        <div className="space-y-4">
          {dailyDiscipline.metrics.map((metric) => (
            <div key={metric.key}>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-300">{metric.label}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{metric.percent}%</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${metric.percent}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>{metric.progressLabel}</span>
                <span>{metric.targetLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase mb-1">Accomplished</p>
            {dailyDiscipline.accomplished.length > 0 ? (
              <div className="space-y-1">
                {dailyDiscipline.accomplished.map((item) => (
                  <p key={item} className="text-xs text-green-700 dark:text-green-200">
                    {item}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-green-700 dark:text-green-200">Ingen omrader over 85% enda i dag.</p>
            )}
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase mb-1">Missing</p>
            <div className="space-y-1">
              {(dailyDiscipline.missing.length > 0 ? dailyDiscipline.missing : ['Alle mal er dekket i dag.']).map((item) => (
                <p key={item} className="text-xs text-amber-700 dark:text-amber-200">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Weekly Performance Report</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Auto-genereres hver sondag</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {latestWeeklyReport.weekStartKey} til {latestWeeklyReport.weekEndKey}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-300">Avg discipline score</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{latestWeeklyReport.avgDisciplineScore}</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-300">Trend direction</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{trendLabel}</p>
          </div>
          <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-3">
            <p className="text-xs text-green-700 dark:text-green-300">Best day</p>
            <p className="text-base font-semibold text-green-700 dark:text-green-100">
              {formatDateKey(latestWeeklyReport.bestDay.dateKey)} ({latestWeeklyReport.bestDay.score})
            </p>
          </div>
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
            <p className="text-xs text-red-700 dark:text-red-300">Worst day</p>
            <p className="text-base font-semibold text-red-700 dark:text-red-100">
              {formatDateKey(latestWeeklyReport.worstDay.dateKey)} ({latestWeeklyReport.worstDay.score})
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 p-3">
          <p className="text-xs text-orange-700 dark:text-orange-300">Streak status</p>
          <p className="text-base font-semibold text-orange-700 dark:text-orange-100">{latestWeeklyReport.streakStatus}</p>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1">
          {latestWeeklyReport.days.map((day) => (
            <div key={day.dateKey} className="rounded-lg bg-gray-100 dark:bg-gray-700 p-2 text-center">
              <p className="text-[10px] text-gray-500 dark:text-gray-300">{formatDateKey(day.dateKey)}</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-100">{day.score}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-4 p-0 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        {getMenuItems().map((item, index) => (
          <button
            key={index}
            onClick={() => {
              if (item.id === 'bmi') setShowBmi(true);
              if (item.id === 'personal') openPersonalSettings();
              if (item.id === 'journey') setShowJourney(true);
              if (item.id === 'darkmode') toggleDarkMode();
              if (item.id === 'notifications') toggleNotifications();
              if (item.id === 'privacy') togglePrivacyMode();
              if (item.id === 'language') toggleLanguage();
            }}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 dark:border-gray-600"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center">
                <item.icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.value && (
                <span className="text-sm text-gray-500 dark:text-gray-400">{item.value}</span>
              )}
              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
          </button>
        ))}
      </div>

      <button className="w-full flex items-center justify-center gap-2 p-4 mt-4 text-red-500 font-medium">
        <LogOut className="w-5 h-5" />
        Logg ut
      </button>

      {showDietExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Explore diets</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pick a style and apply instantly.</p>
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
                          {option.title} {isActive ? '(active)' : ''}
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
                        {isActive ? 'Selected' : 'Use'}
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
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Trophy Room</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly identity update: {monthlyIdentity.monthKey}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-300">Avg discipline</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.avgDisciplineScore}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Consistency</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.consistencyRate}%</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Best streak</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.bestStreakDays} days</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Challenges</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{monthlyIdentity.challengeCompletions}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">XP Sources</p>
              <div className="space-y-1 text-sm">
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Logging</span>
                  <span>{monthlyIdentity.xpBreakdown.logging} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Hitting goals</span>
                  <span>{monthlyIdentity.xpBreakdown.goals} XP</span>
                </p>
                <p className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Completing challenges</span>
                  <span>{monthlyIdentity.xpBreakdown.challenges} XP</span>
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 flex justify-between">
                <p className="font-semibold text-gray-700 dark:text-gray-200">Total</p>
                <p className="font-semibold text-amber-600 dark:text-amber-300">{monthlyIdentity.xpBreakdown.total} XP</p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mt-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Unlocked Performance Titles</p>
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
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Trophy Badges</p>
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
                        {badge.unlocked ? 'Unlocked' : 'Locked'}
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

      {showJourney && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Your journey</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Visual oversikt over progresjonen din</p>
              </div>
              <button
                onClick={() => setShowJourney(false)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
                title="Lukk"
              >
                <X className="w-4 h-4 text-gray-700 dark:text-gray-200" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-sm">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Malinger logget</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{journeyWeightSeries.length}</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Endring vekt</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  {weightDeltaJourney === null ? '--' : `${weightDeltaJourney > 0 ? '+' : ''}${weightDeltaJourney} kg`}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-300">Snitt disiplin (14d)</p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  {Math.round(journeyDisciplineSeries.reduce((sum, p) => sum + p.score, 0) / Math.max(1, journeyDisciplineSeries.length))}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mb-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Vekttrend (kg)</p>
              <svg viewBox="0 0 420 170" className="w-full h-40">
                {(() => {
                  const values = journeyWeightSeries.map((point) => point.value);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = Math.max(1, max - min);
                  const coords = journeyWeightSeries.map((point, index) => {
                    const x = journeyWeightSeries.length === 1 ? 210 : (index / (journeyWeightSeries.length - 1)) * 390 + 15;
                    const y = 145 - ((point.value - min) / range) * 120;
                    return { x, y, value: point.value, date: point.date };
                  });
                  return (
                    <>
                      <line x1="15" y1="145" x2="405" y2="145" stroke="rgba(148,163,184,0.5)" strokeWidth="1" />
                      <polyline
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="3"
                        points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
                      />
                      {coords.map((c) => (
                        <g key={`${c.date}-${c.value}`}>
                          <circle cx={c.x} cy={c.y} r="3.5" fill="#f97316" />
                        </g>
                      ))}
                      <text x="15" y="164" fontSize="10" fill="currentColor" className="text-gray-500 dark:text-gray-300">
                        {formatDateKey(coords[0]?.date ?? toDateKey(today))}
                      </text>
                      <text x="340" y="164" fontSize="10" fill="currentColor" className="text-gray-500 dark:text-gray-300">
                        {formatDateKey(coords[coords.length - 1]?.date ?? toDateKey(today))}
                      </text>
                    </>
                  );
                })()}
              </svg>
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Disiplin siste 14 dager</p>
              <div className="grid grid-cols-14 gap-1 items-end h-28">
                {journeyDisciplineSeries.map((point) => (
                  <div key={point.dateKey} className="flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full rounded-sm bg-orange-500/85"
                      style={{ height: `${Math.max(6, Math.round((point.score / 100) * 90))}%` }}
                      title={`${formatDateKey(point.dateKey)}: ${point.score}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>{formatDateKey(journeyDisciplineSeries[0]?.dateKey ?? toDateKey(today))}</span>
                <span>{formatDateKey(journeyDisciplineSeries[journeyDisciplineSeries.length - 1]?.dateKey ?? toDateKey(today))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 -mt-24">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Mine malinger</h3>
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
                  <p className="text-xs text-gray-500 dark:text-gray-400">Siste vekt</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {latestMeasurement ? `${latestMeasurement.weightKg} kg` : `${profile.weightKg} kg`}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Endring siden sist</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {weightDeltaFromLast === null ? '--' : `${weightDeltaFromLast > 0 ? '+' : ''}${weightDeltaFromLast} kg`}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Hoyde (cm)</label>
                <input
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 180"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Vekt (kg)</label>
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 82"
                />
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                {bmi === null ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Skriv inn hoyde og vekt for a beregne malinger.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Din BMI akkurat na</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{bmi.toFixed(1)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{bmiCategory(bmi)}</p>
                    </div>
                    {healthyWeightRange && (
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        Sunn vekt for din hoyde: ca. {healthyWeightRange.min}-{healthyWeightRange.max} kg
                      </p>
                    )}
                    <button
                      onClick={saveBmi}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
                    >
                      Lagre maling
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Helse-logging (valgfritt)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Midje (cm)</label>
                    <input
                      inputMode="decimal"
                      value={waistCmInput}
                      onChange={(e) => setWaistCmInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                      placeholder="f.eks. 84"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Sovn (timer)</label>
                    <input
                      inputMode="decimal"
                      value={sleepHoursInput}
                      onChange={(e) => setSleepHoursInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                      placeholder="f.eks. 7.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Hvilepuls (bpm)</label>
                    <input
                      inputMode="numeric"
                      value={restingHrInput}
                      onChange={(e) => setRestingHrInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                      placeholder="f.eks. 58"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">Stress (1-10)</label>
                    <input
                      inputMode="numeric"
                      value={stressLevelInput}
                      onChange={(e) => setStressLevelInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                      placeholder="f.eks. 4"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400">Skritt (dag)</label>
                  <input
                    inputMode="numeric"
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-200"
                    placeholder="f.eks. 9000"
                  />
                </div>
              </div>

              {latestHealth && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Siste helsepunkt</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <p className="text-gray-600 dark:text-gray-300">Midje: <span className="font-semibold">{latestHealth.waistCm ?? '--'}{latestHealth.waistCm != null ? ' cm' : ''}</span></p>
                    <p className="text-gray-600 dark:text-gray-300">Sovn: <span className="font-semibold">{latestHealth.sleepHours ?? '--'}{latestHealth.sleepHours != null ? ' t' : ''}</span></p>
                    <p className="text-gray-600 dark:text-gray-300">Hvilepuls: <span className="font-semibold">{latestHealth.restingHr ?? '--'}{latestHealth.restingHr != null ? ' bpm' : ''}</span></p>
                    <p className="text-gray-600 dark:text-gray-300">Stress: <span className="font-semibold">{latestHealth.stressLevel ?? '--'}</span></p>
                    <p className="text-gray-600 dark:text-gray-300 col-span-2">Skritt: <span className="font-semibold">{latestHealth.steps ?? '--'}</span></p>
                  </div>
                  {previousHealth && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                      Trend siden sist:
                      {' '}
                      Midje {latestHealth.waistCm != null && previousHealth.waistCm != null ? `${latestHealth.waistCm - previousHealth.waistCm > 0 ? '+' : ''}${(latestHealth.waistCm - previousHealth.waistCm).toFixed(1)} cm` : '--'},
                      {' '}
                      Hvilepuls {latestHealth.restingHr != null && previousHealth.restingHr != null ? `${latestHealth.restingHr - previousHealth.restingHr > 0 ? '+' : ''}${(latestHealth.restingHr - previousHealth.restingHr).toFixed(0)} bpm` : '--'},
                      {' '}
                      Sovn {latestHealth.sleepHours != null && previousHealth.sleepHours != null ? `${latestHealth.sleepHours - previousHealth.sleepHours > 0 ? '+' : ''}${(latestHealth.sleepHours - previousHealth.sleepHours).toFixed(1)} t` : '--'}.
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-500">
                Tips: Logg malinger 1-2 ganger i uka pa samme tidspunkt. Kombiner vekt + midje + hvilepuls for bedre helsetrend.
              </p>

              {bmiHistory.length > 0 && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Siste malinger</p>
                  <div className="space-y-1">
                    {bmiHistory.slice(0, 3).map((entry) => (
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
        KaloriFit v1.0.0
      </p>
    </div>
  );
}
