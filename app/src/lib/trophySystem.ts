import { calculateDailyDisciplineScore, type DayLog } from './disciplineEngine';
import type { MonthlyIdentityReport } from './identityEngine';

export type TrophyBadgeId =
  | 'beta_tester'
  | 'developer'
  | 'og'
  | 'dedicated'
  | 'consistency_pro'
  | 'streak_master'
  | 'hydration_hero'
  | 'active_mover'
  | 'challenge_hunter'
  | 'logging_legend'
  | 'macro_commander'
  | 'calorie_sniper'
  | 'weekend_warrior'
  | 'breakfast_club'
  | 'level_veteran';

export type TrophyBadgeDefinition = {
  id: TrophyBadgeId;
  label: string;
  description: string;
  styleClass: string;
  confettiPalette: string[];
};

export type TrophyBadge = TrophyBadgeDefinition & {
  unlocked: boolean;
};

type TrophySystemInput = {
  currentUserName: string;
  profileName: string;
  memberSince: string;
  logsByDate: Record<string, DayLog>;
  monthlyIdentity: MonthlyIdentityReport;
};

export const TROPHY_BADGE_DEFINITIONS: TrophyBadgeDefinition[] = [
  {
    id: 'beta_tester',
    label: 'Beta Tester',
    description: 'Tidlig bruker som var med pa a teste appen.',
    styleClass: 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white border-fuchsia-300',
    confettiPalette: ['#d946ef', '#ec4899', '#f472b6', '#facc15'],
  },
  {
    id: 'developer',
    label: 'Developer',
    description: 'Utvikler-rolle for build/test-miljo.',
    styleClass: 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-indigo-300',
    confettiPalette: ['#6366f1', '#06b6d4', '#22d3ee', '#a5b4fc'],
  },
  {
    id: 'og',
    label: 'OG',
    description: 'Tidlig medlem med lang historikk.',
    styleClass: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-300',
    confettiPalette: ['#f59e0b', '#fb923c', '#f97316', '#fcd34d'],
  },
  {
    id: 'dedicated',
    label: 'Dedicated',
    description: 'Hoy konsistens eller sterk streak.',
    styleClass: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-300',
    confettiPalette: ['#10b981', '#14b8a6', '#34d399', '#2dd4bf'],
  },
  {
    id: 'consistency_pro',
    label: 'Consistency Pro',
    description: '85%+ konsistens i maanedsrapport.',
    styleClass: 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-300',
    confettiPalette: ['#3b82f6', '#6366f1', '#60a5fa', '#818cf8'],
  },
  {
    id: 'streak_master',
    label: 'Streak Master',
    description: '30+ dagers disiplinstreak.',
    styleClass: 'bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-300',
    confettiPalette: ['#ef4444', '#f43f5e', '#fb7185', '#fda4af'],
  },
  {
    id: 'hydration_hero',
    label: 'Hydration Hero',
    description: '20 dager med minst 1600 ml vann logget.',
    styleClass: 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white border-cyan-300',
    confettiPalette: ['#06b6d4', '#0ea5e9', '#22d3ee', '#7dd3fc'],
  },
  {
    id: 'active_mover',
    label: 'Active Mover',
    description: '20 treningsdager med 200+ kcal aktivitet.',
    styleClass: 'bg-gradient-to-r from-lime-500 to-green-500 text-white border-lime-300',
    confettiPalette: ['#84cc16', '#22c55e', '#4ade80', '#bef264'],
  },
  {
    id: 'challenge_hunter',
    label: 'Challenge Hunter',
    description: '25+ fullforte utfordringer i maaneden.',
    styleClass: 'bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-300',
    confettiPalette: ['#a855f7', '#8b5cf6', '#c084fc', '#ddd6fe'],
  },
  {
    id: 'logging_legend',
    label: 'Logging Legend',
    description: '300+ maltider logget totalt.',
    styleClass: 'bg-gradient-to-r from-slate-500 to-gray-600 text-white border-slate-300',
    confettiPalette: ['#64748b', '#475569', '#94a3b8', '#cbd5e1'],
  },
  {
    id: 'macro_commander',
    label: 'Macro Commander',
    description: '25 dager med 85%+ protein-treff.',
    styleClass: 'bg-gradient-to-r from-amber-500 to-red-500 text-white border-amber-300',
    confettiPalette: ['#f59e0b', '#ef4444', '#f97316', '#fdba74'],
  },
  {
    id: 'calorie_sniper',
    label: 'Calorie Sniper',
    description: '22 dager med 85%+ kalori-presisjon.',
    styleClass: 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-rose-300',
    confettiPalette: ['#f43f5e', '#ec4899', '#fb7185', '#f9a8d4'],
  },
  {
    id: 'weekend_warrior',
    label: 'Weekend Warrior',
    description: '10 helgedager med 200+ kcal trening.',
    styleClass: 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white border-violet-300',
    confettiPalette: ['#8b5cf6', '#6366f1', '#a78bfa', '#c4b5fd'],
  },
  {
    id: 'breakfast_club',
    label: 'Breakfast Club',
    description: '80 frokostmalter logget totalt.',
    styleClass: 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-yellow-300',
    confettiPalette: ['#facc15', '#fb923c', '#f59e0b', '#fde68a'],
  },
  {
    id: 'level_veteran',
    label: 'Level Veteran',
    description: 'Na minst level 10.',
    styleClass: 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white border-teal-300',
    confettiPalette: ['#14b8a6', '#0891b2', '#2dd4bf', '#67e8f9'],
  },
];

export function getBadgeStyleById(id: TrophyBadgeId | string) {
  return TROPHY_BADGE_DEFINITIONS.find((badge) => badge.id === id)?.styleClass
    ?? 'bg-gradient-to-r from-slate-500 to-gray-600 text-white border-slate-300';
}

export function getBadgeDefinitionById(id: TrophyBadgeId | string) {
  return TROPHY_BADGE_DEFINITIONS.find((badge) => badge.id === id) ?? null;
}

function isWeekendDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function evaluateTrophyBadges(input: TrophySystemInput): TrophyBadge[] {
  const memberYear = Number.parseInt(input.memberSince, 10);
  const currentYear = new Date().getFullYear();
  const isDeveloper = /dev|developer|admin|hrger/i.test(`${input.currentUserName} ${input.profileName}`);
  const allLogs = Object.entries(input.logsByDate);
  const allLogValues = allLogs.map(([, log]) => log);
  const mealsLoggedTotal = allLogValues.reduce((sum, log) => sum + Object.values(log.meals).flat().length, 0);
  const breakfastMealsTotal = allLogValues.reduce((sum, log) => sum + (log.meals.breakfast?.length ?? 0), 0);
  const hydrationDays = allLogValues.filter((log) => log.waterMl >= 1600).length;
  const workoutDays = allLogValues.filter((log) => log.trainingKcal >= 200).length;
  const proteinGoalDays = allLogValues.filter((log) => (
    (calculateDailyDisciplineScore(log).metrics.find((metric) => metric.key === 'protein')?.percent ?? 0) >= 85
  )).length;
  const calorieControlDays = allLogValues.filter((log) => (
    (calculateDailyDisciplineScore(log).metrics.find((metric) => metric.key === 'calorie')?.percent ?? 0) >= 85
  )).length;
  const weekendWorkoutDays = allLogs.filter(([dateKey, log]) => isWeekendDateKey(dateKey) && (log.trainingKcal ?? 0) >= 200).length;

  const hasValidMemberYear = Number.isFinite(memberYear);
  const unlockedById: Record<TrophyBadgeId, boolean> = {
    beta_tester: hasValidMemberYear ? memberYear <= currentYear : input.monthlyIdentity.level.value >= 2,
    developer: isDeveloper,
    og: hasValidMemberYear ? memberYear <= currentYear - 1 : input.monthlyIdentity.level.value >= 6,
    dedicated: input.monthlyIdentity.bestStreakDays >= 14 || input.monthlyIdentity.consistencyRate >= 75,
    consistency_pro: input.monthlyIdentity.consistencyRate >= 85,
    streak_master: input.monthlyIdentity.bestStreakDays >= 30,
    hydration_hero: hydrationDays >= 20,
    active_mover: workoutDays >= 20,
    challenge_hunter: input.monthlyIdentity.challengeCompletions >= 25,
    logging_legend: mealsLoggedTotal >= 300,
    macro_commander: proteinGoalDays >= 25,
    calorie_sniper: calorieControlDays >= 22,
    weekend_warrior: weekendWorkoutDays >= 10,
    breakfast_club: breakfastMealsTotal >= 80,
    level_veteran: input.monthlyIdentity.level.value >= 10,
  };

  return TROPHY_BADGE_DEFINITIONS.map((badge) => ({
    ...badge,
    unlocked: Boolean(unlockedById[badge.id]),
  }));
}

export function getNewlyUnlockedBadges(before: TrophyBadge[], after: TrophyBadge[]) {
  const unlockedBefore = new Set(before.filter((badge) => badge.unlocked).map((badge) => badge.id));
  return after.filter((badge) => badge.unlocked && !unlockedBefore.has(badge.id));
}
