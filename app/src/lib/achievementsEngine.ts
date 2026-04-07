/**
 * Badge/Achievement system — permanent unlockable badges checked against daily logs.
 * Separate from the monthly identity title system in identityEngine.ts.
 */

import { calculateDailyDisciplineScore, toDateKey, startOfDay, addDays, CALORIE_GOAL, PROTEIN_GOAL_G, WATER_GOAL_ML, type DayLog } from './disciplineEngine';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
};

export type EarnedBadge = {
  badgeId: string;
  earnedAtIso: string;
};

// ─── Badge Definitions ─────────────────────────────────────────────────────

export const ALL_BADGES: Badge[] = [
  // Onboarding
  { id: 'first_log', name: 'Første steg', description: 'Logg ditt første måltid', icon: '🌱', rarity: 'common' },
  { id: 'first_water', name: 'Første drikk', description: 'Logg vann for første gang', icon: '💧', rarity: 'common' },
  { id: 'first_workout', name: 'Første økt', description: 'Logg din første treningsøkt', icon: '🏋️', rarity: 'common' },

  // Streaks
  { id: 'streak_3', name: 'Varm start', description: '3 dager på rad innen kalorimål', icon: '🔥', rarity: 'common' },
  { id: 'streak_7', name: 'Uke-kriger', description: '7 dager streak', icon: '⚡', rarity: 'common' },
  { id: 'streak_14', name: 'To-ukers titan', description: '14 dager streak', icon: '💪', rarity: 'rare' },
  { id: 'streak_30', name: 'Jernvilje', description: '30 dager streak', icon: '🗿', rarity: 'rare' },
  { id: 'streak_60', name: 'Maskin', description: '60 dager streak', icon: '⚙️', rarity: 'epic' },
  { id: 'streak_90', name: 'Legende', description: '90 dager streak', icon: '👑', rarity: 'epic' },
  { id: 'streak_365', name: 'Et helt år', description: '365 dager streak', icon: '🌟', rarity: 'legendary' },

  // Logging volume
  { id: 'log_10', name: 'Ivrig logger', description: 'Logg 10 dager totalt', icon: '📓', rarity: 'common' },
  { id: 'log_30', name: 'Dedikert', description: 'Logg 30 dager totalt', icon: '📚', rarity: 'rare' },
  { id: 'log_100', name: 'Hundreklubb', description: 'Logg 100 dager totalt', icon: '💯', rarity: 'epic' },

  // Perfect days
  { id: 'perfect_day', name: 'Perfekt dag', description: 'Alle 4 måltider + vann + trening på én dag', icon: '✨', rarity: 'rare' },
  { id: 'perfect_week', name: 'Perfekt uke', description: '7 perfekte dager på rad', icon: '🏆', rarity: 'legendary' },

  // Calorie precision
  { id: 'calorie_sniper', name: 'Kalorisnikeren', description: 'Innen 50 kcal av mål 3 dager på rad', icon: '🎯', rarity: 'rare' },

  // Protein goals
  { id: 'protein_7', name: 'Proteinpumpe', description: 'Nå proteinmål 7 dager på rad', icon: '🥩', rarity: 'rare' },

  // Water goals
  { id: 'hydration_7', name: 'Hydreringshelt', description: 'Nå vannmål 7 dager på rad', icon: '🌊', rarity: 'rare' },

  // Discipline score
  { id: 'discipline_85', name: 'Skarpskytten', description: 'Få 85+ i disiplinscore på én dag', icon: '🎖️', rarity: 'common' },
  { id: 'discipline_streak_7', name: 'Jernrutine', description: '7 dager med 70+ score på rad', icon: '🔩', rarity: 'rare' },
  { id: 'discipline_streak_30', name: 'Stål', description: '30 dager med 70+ score på rad', icon: '🛡️', rarity: 'epic' },
  { id: 'discipline_100', name: 'Perfekt dag', description: 'Oppnå 100 i disiplinscore', icon: '💎', rarity: 'legendary' },

  // Volume / totals
  { id: 'log_200', name: 'Topp 200', description: 'Logg 200 dager totalt', icon: '📖', rarity: 'epic' },
  { id: 'workout_50', name: 'Treningsentusiast', description: 'Logg 50 treningsøkter totalt', icon: '🏃', rarity: 'rare' },
  { id: 'calorie_30_total', name: 'Kalorikontroll', description: 'Hold kalorimålet 30 dager totalt', icon: '📊', rarity: 'rare' },

  // Extended streaks
  { id: 'streak_180', name: 'Halvt år', description: '180 dager streak', icon: '🌍', rarity: 'legendary' },
  { id: 'calorie_sniper_week', name: 'Snikskytter Pro', description: 'Innen 50 kcal av mål 7 dager på rad', icon: '🎯', rarity: 'epic' },
  { id: 'protein_streak_30', name: 'Proteinmester', description: 'Nå proteinmål 30 dager på rad', icon: '🥩', rarity: 'epic' },

  // Special / fun
  { id: 'comeback', name: 'Tilbake igjen', description: 'Logg etter 3+ dagers pause', icon: '🦅', rarity: 'common' },
  { id: 'night_owl', name: 'Nattugle', description: 'Logg et måltid etter kl 22:00', icon: '🦉', rarity: 'common' },
  { id: 'early_bird', name: 'Tidligfugl', description: 'Logg frokost før kl 08:00', icon: '🌅', rarity: 'common' },
  { id: 'level_5', name: 'Nivå 5', description: 'Nå nivå 5', icon: '⭐', rarity: 'common' },
  { id: 'level_10', name: 'Nivå 10', description: 'Nå nivå 10', icon: '🌠', rarity: 'rare' },
  { id: 'level_20', name: 'Nivå 20 — Elite', description: 'Nå nivå 20', icon: '🚀', rarity: 'legendary' },
];

export const BADGE_MAP = new Map(ALL_BADGES.map((b) => [b.id, b]));

// ─── Helpers ───────────────────────────────────────────────────────────────

type DayEntry = [string, DayLog]; // [dateKey, DayLog]

function sortedEntries(logsByDate: Record<string, DayLog>): DayEntry[] {
  return Object.entries(logsByDate).sort(([a], [b]) => (a < b ? -1 : 1));
}

function isWithinCalorieRange(log: DayLog, targetKcal = CALORIE_GOAL) {
  const consumed = Object.values(log.meals)
    .flat()
    .reduce((sum, item) => sum + item.kcal, 0);
  const remaining = targetKcal + log.trainingKcal - consumed;
  return consumed > 0 && remaining >= -250 && remaining <= 300;
}

function calorieConsumed(log: DayLog): number {
  return Object.values(log.meals)
    .flat()
    .reduce((sum, item) => sum + item.kcal, 0);
}

function areConsecutiveDays(entries: DayEntry[]): boolean {
  for (let j = 1; j < entries.length; j++) {
    const diffMs = new Date(entries[j][0]).getTime() - new Date(entries[j - 1][0]).getTime();
    if (diffMs !== 86400000) return false;
  }
  return true;
}

function getTotalDaysLogged(entries: DayEntry[]): number {
  return entries.filter(([, log]) => calorieConsumed(log) > 0 || log.waterMl > 0).length;
}

function getCurrentStreak(logsByDate: Record<string, DayLog>): number {
  const today = toDateKey(startOfDay(new Date()));
  let streak = 0;
  for (let i = 0; i < 730; i++) {
    const key = toDateKey(addDays(startOfDay(new Date()), -i));
    if (key > today) continue;
    const log = logsByDate[key];
    if (!log || !isWithinCalorieRange(log)) break;
    streak++;
  }
  return streak;
}

function getLevelFromAllXp(logsByDate: Record<string, DayLog>): number {
  const totalXp = Object.entries(logsByDate).reduce((sum, [, log]) => {
    const score = calculateDailyDisciplineScore(log);
    const mealsLogged = Object.values(log.meals).flat().length;
    const loggingXp = Math.min(20, mealsLogged * 5) + (log.waterMl > 0 ? 5 : 0) + (log.trainingKcal > 0 ? 5 : 0);
    const goalsHit = score.metrics.filter((m) => m.percent >= 85).length;
    const goalsXp = goalsHit * 12;
    const challengeCompletions = [
      score.score >= 80,
      (score.metrics.find((m) => m.key === 'protein')?.percent ?? 0) >= 85,
      (score.metrics.find((m) => m.key === 'water')?.percent ?? 0) >= 85,
    ].filter(Boolean).length;
    return sum + loggingXp + goalsXp + challengeCompletions * 20;
  }, 0);

  let level = 1;
  let consumed = 0;
  while (totalXp >= consumed + level * 120) {
    consumed += level * 120;
    level++;
  }
  return level;
}

// ─── Main Check Function ───────────────────────────────────────────────────

export function checkNewBadges(
  logsByDate: Record<string, DayLog>,
  alreadyEarned: EarnedBadge[],
): EarnedBadge[] {
  const earnedIds = new Set(alreadyEarned.map((e) => e.badgeId));
  const nowIso = new Date().toISOString();
  const newlyEarned: EarnedBadge[] = [];

  const earn = (badgeId: string) => {
    if (!earnedIds.has(badgeId)) {
      newlyEarned.push({ badgeId, earnedAtIso: nowIso });
      earnedIds.add(badgeId); // prevent duplicates within this run
    }
  };

  const entries = sortedEntries(logsByDate);

  // ── First log, water, workout ──────────────────────────────────────────
  const hasAnyMeal = entries.some(([, log]) => Object.values(log.meals).flat().length > 0);
  if (hasAnyMeal) earn('first_log');

  const hasAnyWater = entries.some(([, log]) => log.waterMl > 0);
  if (hasAnyWater) earn('first_water');

  const hasAnyWorkout = entries.some(([, log]) => log.trainingKcal > 0);
  if (hasAnyWorkout) earn('first_workout');

  // ── Streak badges ──────────────────────────────────────────────────────
  const streak = getCurrentStreak(logsByDate);
  if (streak >= 3) earn('streak_3');
  if (streak >= 7) earn('streak_7');
  if (streak >= 14) earn('streak_14');
  if (streak >= 30) earn('streak_30');
  if (streak >= 60) earn('streak_60');
  if (streak >= 90) earn('streak_90');
  if (streak >= 180) earn('streak_180');
  if (streak >= 365) earn('streak_365');

  // ── Logging volume ─────────────────────────────────────────────────────
  const totalLogged = getTotalDaysLogged(entries);
  if (totalLogged >= 10) earn('log_10');
  if (totalLogged >= 30) earn('log_30');
  if (totalLogged >= 100) earn('log_100');
  if (totalLogged >= 200) earn('log_200');

  // ── Perfect day (all 4 meals + water + workout) ────────────────────────
  const hasPerfectDay = entries.some(([, log]) => {
    const allMeals = (['breakfast', 'lunch', 'dinner', 'snacks'] as const).every(
      (m) => log.meals[m].length > 0,
    );
    return allMeals && log.waterMl >= WATER_GOAL_ML * 0.8 && log.trainingKcal > 0;
  });
  if (hasPerfectDay) earn('perfect_day');

  // ── Perfect week (7 consecutive calendar days each with all 4 meals + water + workout) ─
  for (let i = 0; i <= entries.length - 7; i++) {
    const week = entries.slice(i, i + 7);
    if (
      week.length === 7 &&
      areConsecutiveDays(week) &&
      week.every(([, log]) => {
        const allMeals = (['breakfast', 'lunch', 'dinner', 'snacks'] as const).every(
          (m) => log.meals[m].length > 0,
        );
        return allMeals && log.waterMl >= WATER_GOAL_ML * 0.8 && log.trainingKcal > 0;
      })
    ) {
      earn('perfect_week');
      break;
    }
  }

  // ── Calorie sniper (within 50 kcal of goal 3 consecutive calendar days) ─
  for (let i = 0; i <= entries.length - 3; i++) {
    const trio = entries.slice(i, i + 3);
    if (
      trio.length === 3 &&
      areConsecutiveDays(trio) &&
      trio.every(([, log]) => {
        const consumed = calorieConsumed(log);
        const goal = CALORIE_GOAL + log.trainingKcal;
        return consumed > 0 && Math.abs(consumed - goal) <= 50;
      })
    ) {
      earn('calorie_sniper');
      break;
    }
  }

  // ── Protein 7 consecutive calendar days ───────────────────────────────
  for (let i = 0; i <= entries.length - 7; i++) {
    const week = entries.slice(i, i + 7);
    if (
      week.length === 7 &&
      areConsecutiveDays(week) &&
      week.every(([, log]) => {
        const totalProtein = Object.values(log.meals)
          .flat()
          .reduce((sum, item) => sum + item.protein, 0);
        return totalProtein >= PROTEIN_GOAL_G * 0.85;
      })
    ) {
      earn('protein_7');
      break;
    }
  }

  // ── Hydration 7 consecutive calendar days ─────────────────────────────
  for (let i = 0; i <= entries.length - 7; i++) {
    const week = entries.slice(i, i + 7);
    if (
      week.length === 7 &&
      areConsecutiveDays(week) &&
      week.every(([, log]) => log.waterMl >= WATER_GOAL_ML * 0.85)
    ) {
      earn('hydration_7');
      break;
    }
  }

  // ── Discipline score badges ────────────────────────────────────────────
  const hasHighScore = entries.some(([, log]) => calculateDailyDisciplineScore(log).score >= 85);
  if (hasHighScore) earn('discipline_85');

  const hasPerfectScore = entries.some(([, log]) => calculateDailyDisciplineScore(log).score >= 100);
  if (hasPerfectScore) earn('discipline_100');

  for (let i = 0; i <= entries.length - 7; i++) {
    const week = entries.slice(i, i + 7);
    if (
      week.length === 7 &&
      areConsecutiveDays(week) &&
      week.every(([, log]) => calculateDailyDisciplineScore(log).score >= 70)
    ) {
      earn('discipline_streak_7');
      break;
    }
  }

  for (let i = 0; i <= entries.length - 30; i++) {
    const month = entries.slice(i, i + 30);
    if (
      month.length === 30 &&
      areConsecutiveDays(month) &&
      month.every(([, log]) => calculateDailyDisciplineScore(log).score >= 70)
    ) {
      earn('discipline_streak_30');
      break;
    }
  }

  // ── Workout total ──────────────────────────────────────────────────────
  const totalWorkouts = entries.filter(([, log]) => log.trainingKcal > 0).length;
  if (totalWorkouts >= 50) earn('workout_50');

  // ── Calorie goal total days ────────────────────────────────────────────
  const totalCalorieGoalDays = entries.filter(([, log]) => isWithinCalorieRange(log)).length;
  if (totalCalorieGoalDays >= 30) earn('calorie_30_total');

  // ── Calorie sniper 7 consecutive days ─────────────────────────────────
  for (let i = 0; i <= entries.length - 7; i++) {
    const week = entries.slice(i, i + 7);
    if (
      week.length === 7 &&
      areConsecutiveDays(week) &&
      week.every(([, log]) => {
        const consumed = calorieConsumed(log);
        const goal = CALORIE_GOAL + log.trainingKcal;
        return consumed > 0 && Math.abs(consumed - goal) <= 50;
      })
    ) {
      earn('calorie_sniper_week');
      break;
    }
  }

  // ── Protein 30 consecutive days ────────────────────────────────────────
  for (let i = 0; i <= entries.length - 30; i++) {
    const month = entries.slice(i, i + 30);
    if (
      month.length === 30 &&
      areConsecutiveDays(month) &&
      month.every(([, log]) => {
        const totalProtein = Object.values(log.meals).flat().reduce((sum, item) => sum + item.protein, 0);
        return totalProtein >= PROTEIN_GOAL_G * 0.85;
      })
    ) {
      earn('protein_streak_30');
      break;
    }
  }

  // ── Comeback ──────────────────────────────────────────────────────────
  for (let i = 1; i < entries.length; i++) {
    const [prevKey] = entries[i - 1];
    const [currKey, currLog] = entries[i];
    if (calorieConsumed(currLog) === 0 && currLog.waterMl === 0) continue;
    const prevDate = new Date(prevKey);
    const currDate = new Date(currKey);
    const diffDays = (currDate.getTime() - prevDate.getTime()) / 86400000;
    if (diffDays >= 3) {
      earn('comeback');
      break;
    }
  }

  // ── Night owl (meal logged after 22:00) — uses log events approximation ─
  // We detect this from the log event timestamps via a different mechanism.
  // For now we check if last water/training was late — actual meal time
  // check is done in HomeScreen where we have the log events with timestamps.
  // Badge 'night_owl' and 'early_bird' are triggered from HomeScreen directly.

  // ── Level badges ──────────────────────────────────────────────────────
  const level = getLevelFromAllXp(logsByDate);
  if (level >= 5) earn('level_5');
  if (level >= 10) earn('level_10');
  if (level >= 20) earn('level_20');

  return newlyEarned;
}

export function getAllEarnedBadges(
  logsByDate: Record<string, DayLog>,
  storedBadges: EarnedBadge[],
): EarnedBadge[] {
  const newBadges = checkNewBadges(logsByDate, storedBadges);
  return [...storedBadges, ...newBadges];
}
