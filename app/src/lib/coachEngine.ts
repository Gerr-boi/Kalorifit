/**
 * coachEngine.ts
 * Adaptive daily coach — reads the day's state and emits one concrete action.
 * Reads: DayLog, discipline score, nutrition plan, profile.
 */

import { calculateDailyDisciplineScore, type DayLog } from './disciplineEngine';
import { buildSmartDietPlan, normalizeNutritionProfile, type NutritionProfile } from './nutritionPlanner';

type Lang = 'Norsk' | 'English';

export type CoachPriority =
  | 'protein'
  | 'calories_under'
  | 'calories_over'
  | 'water'
  | 'workout'
  | 'logging'
  | 'on_track'
  | 'rest_day';

export type CoachUrgency = 'high' | 'medium' | 'low';

export type CoachMessage = {
  headline: string;
  action: string;
  reason: string;
  priority: CoachPriority;
  urgency: CoachUrgency;
  /** 0–100 how far through the day we estimate the user to be */
  dayProgress: number;
  /** Whether today has been flagged as a training day by having logged workout calories */
  isTrainingDay: boolean;
  /** The calorie target for today (may be boosted for training) */
  targetKcal: number;
  /** Protein target in grams */
  targetProteinG: number;
  /** How many kcal still to go (negative = over) */
  kcalRemaining: number;
  /** How many grams of protein still to go (negative = over) */
  proteinRemaining: number;
};

function totalKcal(log: DayLog): number {
  return Object.values(log.meals)
    .flat()
    .reduce((s, e) => s + e.kcal, 0);
}

function totalProtein(log: DayLog): number {
  return Object.values(log.meals)
    .flat()
    .reduce((s, e) => s + e.protein, 0);
}

function totalEntries(log: DayLog): number {
  return Object.values(log.meals).flat().length;
}

function hourNow(): number {
  return new Date().getHours();
}

/** 0–1 estimate of how far through the "eating window" the current hour is. */
function dayProgressFraction(): number {
  const h = hourNow();
  // eating window 7:00–22:00
  const start = 7;
  const end = 22;
  if (h <= start) return 0;
  if (h >= end) return 1;
  return (h - start) / (end - start);
}

function proteinFoodSuggestions(grams: number, lang: Lang): string {
  if (lang === 'English') {
    if (grams >= 60) return 'chicken breast, salmon, or cottage cheese + eggs';
    if (grams >= 35) return 'Greek yogurt + protein shake, or 2 eggs + cheese';
    if (grams >= 20) return '2 eggs, skyr, or 150g chicken';
    return 'a handful of nuts, skyr, or cottage cheese';
  }
  if (grams >= 60) return 'kyllingbryst, laks eller cottage cheese + egg';
  if (grams >= 35) return 'gresk yoghurt + proteindrikk eller 2 egg + ost';
  if (grams >= 20) return '2 egg, skyr eller 150g kylling';
  return 'en neve nøtter, skyr eller cottage cheese';
}

export function generateCoachMessage(
  log: DayLog,
  rawProfile: Partial<NutritionProfile> | null | undefined,
  now?: Date,
  lang: Lang = 'Norsk',
): CoachMessage {
  const profile = normalizeNutritionProfile(rawProfile);
  const plan = buildSmartDietPlan({ profile, logsByDate: {}, logEvents: [], weightHistory: [], date: now ?? new Date() });

  const isTrainingDay = log.trainingKcal > 0;
  const baseTarget = plan.optimizedTargetKcal ?? 2000;
  const targetKcal = isTrainingDay
    ? baseTarget + (profile.trainingDayCalorieBoost ?? 200)
    : baseTarget;
  const targetProteinG = plan.macros?.proteinG ?? 150;

  const eaten = totalKcal(log);
  const protein = totalProtein(log);
  const entries = totalEntries(log);
  const waterMl = log.waterMl ?? 0;

  const kcalRemaining = targetKcal - eaten;
  const proteinRemaining = targetProteinG - protein;

  const score = calculateDailyDisciplineScore(log);

  const dayProgress = dayProgressFraction();
  const h = (now ?? new Date()).getHours();
  const isLateDay = h >= 18;
  const isMorning = h < 10;

  // ---- Priority decision tree ----

  const nb = lang !== 'English';

  // 1. Nothing logged yet and it's past 10am
  if (entries === 0 && h >= 10) {
    return {
      headline: nb ? 'Ingen logging ennå i dag' : 'No logging yet today',
      action: nb
        ? 'Start med å logge frokosten — selv en enkel entry er nok for nå.'
        : 'Start by logging breakfast — even one simple entry is enough for now.',
      reason: nb
        ? 'Logging tidlig gir 15% av dagens discipline-score og setter deg i riktig modus.'
        : 'Logging early gives 15% of your discipline score and puts you in the right mindset.',
      priority: 'logging',
      urgency: 'high',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 2. Protein critically low late in the day
  if (isLateDay && proteinRemaining > 40) {
    const foods = proteinFoodSuggestions(proteinRemaining, lang);
    return {
      headline: nb ? `${Math.round(proteinRemaining)}g protein mangler` : `${Math.round(proteinRemaining)}g protein missing`,
      action: nb ? `Spis ${foods} i kveld for å nå målet.` : `Eat ${foods} tonight to hit your goal.`,
      reason: nb
        ? `Du er ${Math.round(proteinRemaining)}g bak på protein og har bare kvelden igjen. Protein er 25% av dagens score.`
        : `You're ${Math.round(proteinRemaining)}g behind on protein with only the evening left. Protein is 25% of your daily score.`,
      priority: 'protein',
      urgency: proteinRemaining > 60 ? 'high' : 'medium',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 3. Significantly over calories
  if (kcalRemaining < -300) {
    const over = Math.abs(kcalRemaining);
    return {
      headline: nb ? `${Math.round(over)} kcal over mål` : `${Math.round(over)} kcal over goal`,
      action: nb
        ? 'Dropp snacks i kveld og velg vann fremfor juice eller brus.'
        : 'Skip snacks tonight and choose water over juice or soda.',
      reason: nb
        ? `Du er ${Math.round(over)} kcal over dagens mål. Hold deg til protein og grønnsaker resten av dagen.`
        : `You're ${Math.round(over)} kcal over today's goal. Stick to protein and vegetables for the rest of the day.`,
      priority: 'calories_over',
      urgency: over > 600 ? 'high' : 'medium',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 4. Training day, no workout logged yet and it's afternoon
  if (isTrainingDay && log.trainingKcal === 0 && h >= 14) {
    return {
      headline: nb ? 'Treningsdag — logg økten' : 'Training day — log your session',
      action: nb
        ? 'Logg treningsøkten så kaloribudsjettet justeres automatisk.'
        : 'Log your workout so your calorie budget adjusts automatically.',
      reason: nb
        ? 'Treningsdager gir +' + (profile.trainingDayCalorieBoost ?? 200) + ' kcal ekstra. Du trenger å logge for å aktivere dette.'
        : 'Training days give +' + (profile.trainingDayCalorieBoost ?? 200) + ' kcal extra. You need to log to activate this.',
      priority: 'workout',
      urgency: 'medium',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 5. Water very low late in the day
  if (waterMl < 1000 && h >= 15) {
    return {
      headline: nb ? 'Lite vann i dag' : 'Low water intake today',
      action: nb
        ? `Drikk ${Math.round((2500 - waterMl) / 250)} glass vann fremover i ettermiddag.`
        : `Drink ${Math.round((2500 - waterMl) / 250)} glasses of water this afternoon.`,
      reason: nb
        ? `Du har bare drukket ${waterMl}ml. Vann er 15% av dagens score.`
        : `You've only had ${waterMl}ml. Water is 15% of your daily score.`,
      priority: 'water',
      urgency: 'medium',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 6. Calories still low and it's getting late (needs to eat more)
  if (kcalRemaining > 400 && isLateDay) {
    return {
      headline: nb ? `${Math.round(kcalRemaining)} kcal igjen` : `${Math.round(kcalRemaining)} kcal left`,
      action: nb
        ? 'Ta et næringsrikt måltid til — ikke hopp over middagen.'
        : 'Have one more nutritious meal — don\'t skip dinner.',
      reason: nb
        ? 'For lavt kaloriinntak over tid kan senke stoffskiftet og svekke muskelmasse.'
        : 'Chronically low calorie intake can slow your metabolism and reduce muscle mass.',
      priority: 'calories_under',
      urgency: kcalRemaining > 700 ? 'high' : 'medium',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 7. Morning: set intention
  if (isMorning) {
    const goalLabels: Record<string, { nb: string; en: string }> = {
      fat_loss:    { nb: 'fettforbrenning',  en: 'fat loss' },
      muscle_gain: { nb: 'muskelvekst',      en: 'muscle gain' },
      recomp:      { nb: 'rekomp',           en: 'recomp' },
      maintenance: { nb: 'vedlikehold',      en: 'maintenance' },
      performance: { nb: 'prestasjon',       en: 'performance' },
      health:      { nb: 'helse',            en: 'health' },
    };
    const goalEntry = goalLabels[profile.goalCategory];
    const goalLabel = goalEntry ? (nb ? goalEntry.nb : goalEntry.en) : (nb ? 'målet ditt' : 'your goal');
    return {
      headline: nb ? 'God morgen 👋' : 'Good morning 👋',
      action: nb
        ? `Mål for i dag: ${Math.round(targetKcal)} kcal og ${Math.round(targetProteinG)}g protein.`
        : `Today's targets: ${Math.round(targetKcal)} kcal and ${Math.round(targetProteinG)}g protein.`,
      reason: nb
        ? `Fokus på ${goalLabel}. Start med en proteindreven frokost for best effekt.`
        : `Focus on ${goalLabel}. Start with a protein-driven breakfast for best results.`,
      priority: 'on_track',
      urgency: 'low',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 8. Score excellent — affirm
  if (score.score >= 80) {
    return {
      headline: score.grade === 'Excellent'
        ? (nb ? 'Eksellent dag 🔥' : 'Excellent day 🔥')
        : (nb ? 'Sterk dag' : 'Strong day'),
      action: nb ? 'Hold kursen — du er godt innenfor alle mål.' : 'Stay on track — you\'re well within all your goals.',
      reason: `Discipline score: ${score.score}/100. ${score.accomplished.slice(0, 2).join('. ')}.`,
      priority: 'on_track',
      urgency: 'low',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 9. Protein medium deficit midday
  if (proteinRemaining > 25) {
    const foods = proteinFoodSuggestions(proteinRemaining, lang);
    return {
      headline: nb ? `${Math.round(proteinRemaining)}g protein igjen` : `${Math.round(proteinRemaining)}g protein left`,
      action: nb ? `Velg ${foods} til neste måltid.` : `Choose ${foods} for your next meal.`,
      reason: nb
        ? `Du har ${Math.round(protein)}g protein av ${Math.round(targetProteinG)}g mål.`
        : `You've had ${Math.round(protein)}g protein out of your ${Math.round(targetProteinG)}g goal.`,
      priority: 'protein',
      urgency: 'low',
      dayProgress,
      isTrainingDay,
      targetKcal,
      targetProteinG,
      kcalRemaining,
      proteinRemaining,
    };
  }

  // 10. On track
  return {
    headline: nb ? 'På rett spor' : 'On track',
    action: nb
      ? 'Fortsett å logge måltidene dine for å holde scoren oppe.'
      : 'Keep logging your meals to maintain your score.',
    reason: `Discipline score: ${score.score}/100.`,
    priority: 'on_track',
    urgency: 'low',
    dayProgress,
    isTrainingDay,
    targetKcal,
    targetProteinG,
    kcalRemaining,
    proteinRemaining,
  };
}

/** Returns how many consecutive days (including today) the user has logged with score >= threshold */
export function computeConsistencyStreak(
  logsByDate: Record<string, DayLog>,
  scoreThreshold = 50,
): number {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const log = logsByDate[key];
    if (!log) break;
    const s = calculateDailyDisciplineScore(log);
    if (s.score < scoreThreshold) break;
    streak++;
  }
  return streak;
}

/** Returns a simple adaptive complexity level based on recent discipline scores */
export type ComplexityLevel = 'minimal' | 'standard' | 'advanced';

export function computeAdaptiveComplexity(
  logsByDate: Record<string, DayLog>,
): ComplexityLevel {
  const scores: number[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const log = logsByDate[key];
    if (!log) continue;
    const s = calculateDailyDisciplineScore(log);
    scores.push(s.score);
  }
  if (scores.length === 0) return 'standard';
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const lowDays = scores.filter((s) => s < 40).length;
  if (lowDays >= 3) return 'minimal';
  if (avg >= 75 && scores.length >= 5) return 'advanced';
  return 'standard';
}
