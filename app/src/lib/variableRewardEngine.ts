/**
 * Variable reward engine — unpredictable bonus XP on meal logging.
 * Fires ~20% of the time. The randomness is the mechanic.
 */

import type { DayLog, FoodEntry, MealId } from './disciplineEngine';
import { PROTEIN_GOAL_G, CALORIE_GOAL } from './disciplineEngine';

type BonusEvent = {
  xp: number;
  label: string;
};

type RewardContext = {
  food: FoodEntry;
  mealId: MealId;
  dayLog: DayLog;
};

function totalMacros(dayLog: DayLog) {
  let kcal = 0;
  let protein = 0;
  for (const items of Object.values(dayLog.meals)) {
    for (const item of items) {
      kcal += item.kcal;
      protein += item.protein;
    }
  }
  return { kcal, protein };
}

function mealsWithEntries(dayLog: DayLog): number {
  return Object.values(dayLog.meals).filter((items) => items.length > 0).length;
}

function pickBonus(ctx: RewardContext): BonusEvent | null {
  const hour = new Date().getHours();
  const { kcal: prevKcal, protein: prevProtein } = totalMacros(ctx.dayLog);
  const newKcal = prevKcal + ctx.food.kcal;
  const newProtein = prevProtein + ctx.food.protein;
  const filledMeals = mealsWithEntries(ctx.dayLog);

  const candidates: BonusEvent[] = [];

  // Protein milestone crosses
  if (prevProtein < PROTEIN_GOAL_G && newProtein >= PROTEIN_GOAL_G) {
    candidates.push({ xp: 75, label: `Proteinmål nådd! 💪 +75 XP` });
  }

  // Calorie precision — within 10% of goal
  if (newKcal >= CALORIE_GOAL * 0.9 && newKcal <= CALORIE_GOAL * 1.05 && prevKcal < CALORIE_GOAL * 0.9) {
    candidates.push({ xp: 60, label: `Presis logging! 🎯 +60 XP` });
  }

  // Breakfast before 9am
  if (ctx.mealId === 'breakfast' && hour < 9) {
    candidates.push({ xp: 40, label: `Tidligfugl! 🌅 +40 XP` });
  }

  // All 4 meals logged
  if (filledMeals === 3 && ctx.dayLog.meals[ctx.mealId].length === 0) {
    candidates.push({ xp: 80, label: `Alle måltider logget! ⚡ +80 XP` });
  }

  // High-protein food (>20g)
  if (ctx.food.protein >= 20) {
    candidates.push({ xp: 35, label: `Proteinsuperhelt! 🥩 +35 XP` });
  }

  // Evening discipline — logging dinner/snacks after 6pm
  if ((ctx.mealId === 'dinner' || ctx.mealId === 'snacks') && hour >= 18) {
    candidates.push({ xp: 30, label: `Kveldsdisiplin! 🌙 +30 XP` });
  }

  // Pure luck events — always eligible, low base rate
  candidates.push(
    { xp: 50, label: `Perfekt timing! ✨ +50 XP` },
    { xp: 25, label: `Konsistens-bonus! 🔥 +25 XP` },
    { xp: 45, label: `Logger du ikke? Jo! ⚡ +45 XP` },
  );

  // Roll: 20% base chance. Contextual candidates raise effective odds slightly.
  const roll = Math.random();
  const threshold = 0.20;
  if (roll >= threshold) return null;

  // Pick a random candidate
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function rollVariableReward(ctx: RewardContext): BonusEvent | null {
  return pickBonus(ctx);
}
