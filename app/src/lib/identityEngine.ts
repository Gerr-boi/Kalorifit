import {
  calculateDailyDisciplineScore,
  startOfDay,
  toDateKey,
  type DailyDisciplineScore,
  type DayLog,
} from './disciplineEngine';

export type PerformanceTitle =
  | 'The Grinder'
  | 'The Comeback'
  | 'The Sharpshooter'
  | 'The Iron Discipline'
  | 'The Balanced Strategist';

export type MonthlyIdentityReport = {
  monthKey: string;
  generatedAtIso: string;
  primaryTitle: PerformanceTitle;
  unlockedTitles: PerformanceTitle[];
  avgDisciplineScore: number;
  consistencyRate: number;
  bestStreakDays: number;
  xpBreakdown: {
    logging: number;
    goals: number;
    challenges: number;
    total: number;
  };
  challengeCompletions: number;
  level: {
    value: number;
    label: string;
    currentXp: number;
    nextLevelXp: number;
    progressPct: number;
  };
};

export type IdentityReportsByMonth = Record<string, MonthlyIdentityReport>;

type DailyXp = {
  loggingXp: number;
  goalsXp: number;
  challengeXp: number;
  challengeCompletions: number;
};

const TITLE_ORDER: PerformanceTitle[] = [
  'The Iron Discipline',
  'The Comeback',
  'The Sharpshooter',
  'The Balanced Strategist',
  'The Grinder',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function monthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getNextDateKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + 1);
  return toDateKey(startOfDay(date));
}

function getLevelFromXp(totalXp: number) {
  const xp = Math.max(0, totalXp);
  let level = 1;
  let consumed = 0;

  while (xp >= consumed + level * 120) {
    consumed += level * 120;
    level += 1;
  }

  const xpIntoLevel = xp - consumed;
  const nextLevelXp = level * 120;
  const progressPct = round((xpIntoLevel / nextLevelXp) * 100);

  return {
    level,
    xpIntoLevel,
    nextLevelXp,
    progressPct: clamp(progressPct, 0, 100),
  };
}

function getLevelLabel(level: number): string {
  if (level >= 20) return 'Elite';
  if (level >= 10) return 'Disciplined';
  if (level >= 5) return 'Consistent';
  return 'Starter';
}

function getLongestDisciplineStreak(logsByDate: Record<string, DayLog>, endDateInclusive: Date): number {
  const endKey = toDateKey(startOfDay(endDateInclusive));
  const eligibleKeys = Object.keys(logsByDate)
    .filter((key) => key <= endKey)
    .sort();

  let best = 0;
  let current = 0;
  let previousKey: string | null = null;

  for (const key of eligibleKeys) {
    const log = logsByDate[key];
    const score = calculateDailyDisciplineScore(log).score;
    if (score < 70) {
      current = 0;
      previousKey = key;
      continue;
    }

    if (previousKey && getNextDateKey(previousKey) === key) {
      current += 1;
    } else {
      current = 1;
    }

    if (current > best) best = current;
    previousKey = key;
  }

  return best;
}

function getDailyXp(score: DailyDisciplineScore, log: DayLog): DailyXp {
  const mealsLogged = Object.values(log.meals).flat().length;
  const loggingXp = Math.min(20, mealsLogged * 5) + (log.waterMl > 0 ? 5 : 0) + (log.trainingKcal > 0 ? 5 : 0);

  const goalsHit = score.metrics.filter((metric) => metric.percent >= 85).length;
  const goalsXp = goalsHit * 12;

  const challengeCompletions = [
    score.score >= 80,
    (score.metrics.find((metric) => metric.key === 'protein')?.percent ?? 0) >= 85,
    (score.metrics.find((metric) => metric.key === 'water')?.percent ?? 0) >= 85,
  ].filter(Boolean).length;

  const challengeXp = challengeCompletions * 20;

  return {
    loggingXp,
    goalsXp,
    challengeXp,
    challengeCompletions,
  };
}

function deriveTitles(args: {
  avgScore: number;
  consistencyRate: number;
  bestStreakDays: number;
  improvementDelta: number;
  avgCalorieAdherence: number;
  avgProteinAdherence: number;
  avgWaterAdherence: number;
  avgActivityAdherence: number;
}): PerformanceTitle[] {
  const titles: PerformanceTitle[] = [];

  if (args.bestStreakDays >= 30) titles.push('The Iron Discipline');
  if (args.improvementDelta >= 12) titles.push('The Comeback');
  if (args.avgCalorieAdherence >= 92 && args.consistencyRate >= 70) titles.push('The Sharpshooter');
  if (
    args.avgCalorieAdherence >= 70 &&
    args.avgProteinAdherence >= 70 &&
    args.avgWaterAdherence >= 70 &&
    args.avgActivityAdherence >= 70
  ) {
    titles.push('The Balanced Strategist');
  }
  if (args.consistencyRate >= 80 && args.avgScore >= 70) titles.push('The Grinder');

  if (titles.length === 0) titles.push('The Grinder');

  return [...new Set(titles)].sort((a, b) => TITLE_ORDER.indexOf(a) - TITLE_ORDER.indexOf(b));
}

export function generateMonthlyIdentityReport(logsByDate: Record<string, DayLog>, date: Date): MonthlyIdentityReport {
  const monthDate = startOfDay(date);
  const monthKey = monthKeyFromDate(monthDate);
  const dayEntries = Object.entries(logsByDate)
    .filter(([dateKey]) => dateKey.startsWith(monthKey))
    .sort(([a], [b]) => (a < b ? -1 : 1));

  const dailyScores = dayEntries.map(([_, log]) => calculateDailyDisciplineScore(log));

  const avgDisciplineScore =
    dailyScores.length > 0
      ? round(dailyScores.reduce((sum, score) => sum + score.score, 0) / dailyScores.length)
      : 0;

  const consistentDays = dailyScores.filter((score) => score.score >= 70).length;
  const consistencyRate = dailyScores.length > 0 ? round((consistentDays / dailyScores.length) * 100) : 0;

  const split = Math.max(1, Math.floor(dailyScores.length / 2));
  const firstHalf = dailyScores.slice(0, split);
  const secondHalf = dailyScores.slice(split);
  const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((sum, score) => sum + score.score, 0) / firstHalf.length : 0;
  const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((sum, score) => sum + score.score, 0) / secondHalf.length : firstAvg;
  const improvementDelta = round(secondAvg - firstAvg);

  const avgMetric = (key: DailyDisciplineScore['metrics'][number]['key']) => {
    if (dailyScores.length === 0) return 0;
    return round(
      dailyScores.reduce((sum, score) => sum + (score.metrics.find((metric) => metric.key === key)?.percent ?? 0), 0) / dailyScores.length,
    );
  };

  const avgCalorieAdherence = avgMetric('calorie');
  const avgProteinAdherence = avgMetric('protein');
  const avgWaterAdherence = avgMetric('water');
  const avgActivityAdherence = avgMetric('activity');

  const bestStreakDays = getLongestDisciplineStreak(logsByDate, monthDate);

  const monthXp = dayEntries.reduce(
    (acc, [_, log]) => {
      const score = calculateDailyDisciplineScore(log);
      const dayXp = getDailyXp(score, log);
      return {
        logging: acc.logging + dayXp.loggingXp,
        goals: acc.goals + dayXp.goalsXp,
        challenges: acc.challenges + dayXp.challengeXp,
        challengeCompletions: acc.challengeCompletions + dayXp.challengeCompletions,
      };
    },
    { logging: 0, goals: 0, challenges: 0, challengeCompletions: 0 },
  );

  const lifetimeXp = Object.entries(logsByDate)
    .filter(([dateKey]) => dateKey <= toDateKey(monthDate))
    .reduce((sum, [_, log]) => {
      const score = calculateDailyDisciplineScore(log);
      const dayXp = getDailyXp(score, log);
      return sum + dayXp.loggingXp + dayXp.goalsXp + dayXp.challengeXp;
    }, 0);

  const level = getLevelFromXp(lifetimeXp);

  const titles = deriveTitles({
    avgScore: avgDisciplineScore,
    consistencyRate,
    bestStreakDays,
    improvementDelta,
    avgCalorieAdherence,
    avgProteinAdherence,
    avgWaterAdherence,
    avgActivityAdherence,
  });

  return {
    monthKey,
    generatedAtIso: new Date().toISOString(),
    primaryTitle: titles[0],
    unlockedTitles: titles,
    avgDisciplineScore,
    consistencyRate,
    bestStreakDays,
    xpBreakdown: {
      logging: monthXp.logging,
      goals: monthXp.goals,
      challenges: monthXp.challenges,
      total: monthXp.logging + monthXp.goals + monthXp.challenges,
    },
    challengeCompletions: monthXp.challengeCompletions,
    level: {
      value: level.level,
      label: getLevelLabel(level.level),
      currentXp: level.xpIntoLevel,
      nextLevelXp: level.nextLevelXp,
      progressPct: level.progressPct,
    },
  };
}

export function ensureMonthlyIdentityReport(
  today: Date,
  logsByDate: Record<string, DayLog>,
  reportsByMonth: IdentityReportsByMonth,
): IdentityReportsByMonth {
  const monthKey = monthKeyFromDate(today);
  if (reportsByMonth[monthKey]) return reportsByMonth;

  return {
    ...reportsByMonth,
    [monthKey]: generateMonthlyIdentityReport(logsByDate, today),
  };
}

export function getCurrentMonthKey(date: Date): string {
  return monthKeyFromDate(date);
}
