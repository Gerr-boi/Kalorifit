import type { MealId } from './disciplineEngine';
import type { DietStyle, GoalCategory, GoalStrategy } from './nutritionPlanner';
import type { MealRecipe, MealSlot, NutritionTagId, SmartSortId } from '../data/mealRecipes';

type MacroHints = {
  protein?: number;
  carbs?: number;
  fat?: number;
};

type ScoreMealInput = {
  recipe: Pick<MealRecipe, 'id' | 'title' | 'source' | 'sortContexts' | 'dietStyles' | 'goalCategories' | 'goalStrategies' | 'tags' | 'signals'>;
  activeSort: SmartSortId;
  profileDietStyle: DietStyle;
  profileGoalCategory: GoalCategory;
  profileGoalStrategy: GoalStrategy;
  hardWorkoutToday: boolean;
  lowFiberToday: boolean;
  recentMealKeywords: Iterable<string>;
  favoriteRecipeIds: Set<string>;
  favoriteTags: NutritionTagId[];
  activeTagFilter?: NutritionTagId | null;
};

type InferMealMetadataInput = {
  title: string;
  calories: number;
  ingredients?: string[];
  steps?: string[];
  caption?: string;
  mealIdHint?: MealId;
  macroHints?: MacroHints;
};

const TAG_ORDER: NutritionTagId[] = [
  'gut_health',
  'high_protein',
  'low_inflammation',
  'brain_fuel',
  'hormone_support',
  'fiber_focus',
  'recovery',
];

const SORT_ORDER: SmartSortId[] = [
  'recommended',
  'goal',
  'post_workout',
  'evening',
  'gut',
  'high_energy',
  'anti_inflammatory',
];

const DIET_STYLE_ORDER: DietStyle[] = [
  'standard_balanced',
  'high_protein',
  'low_carb',
  'high_carb_performance',
  'keto',
  'mediterranean',
  'vegetarian',
  'vegan',
  'flexible_iifym',
];

const GOAL_CATEGORY_ORDER: GoalCategory[] = ['fat_loss', 'muscle_gain', 'recomp', 'performance', 'health'];
const GOAL_STRATEGY_ORDER: GoalStrategy[] = [
  'standard_cut',
  'lean_bulk',
  'high_protein_maintenance',
  'fat_reduction_no_scale',
  'strength_focus',
  'endurance_focus',
  'hybrid_athlete',
  'blood_markers',
  'stable_energy',
  'hormonal_balance',
  'gut_health',
];

const FERMENTED_WORDS = ['kimchi', 'kefir', 'kombucha', 'surkal', 'miso', 'tempeh', 'yoghurt', 'yogurt'];
const FIBER_WORDS = ['havre', 'oat', 'chia', 'linse', 'kiker', 'bøn', 'bonn', 'brokkoli', 'broccoli', 'quinoa', 'gronnsak', 'grønnsak', 'baer', 'bær'];
const HIGH_PROTEIN_WORDS = ['kylling', 'chicken', 'kalkun', 'turkey', 'laks', 'salmon', 'tunfisk', 'tuna', 'biff', 'beef', 'egg', 'omelett', 'cottage', 'hytteost', 'yoghurt', 'yogurt', 'reker', 'shrimp', 'protein', 'tofu', 'tempeh'];
const ANTI_INFLAMMATORY_WORDS = ['laks', 'salmon', 'sardiner', 'avokado', 'avocado', 'oliven', 'olive', 'baer', 'bær', 'granateple', 'tomat', 'brokkoli', 'broccoli', 'gurkemeie', 'turmeric'];
const BRAIN_WORDS = ['egg', 'laks', 'salmon', 'havre', 'oat', 'avokado', 'avocado', 'baer', 'bær', 'nott', 'nød', 'walnut', 'omega'];
const HORMONE_WORDS = ['egg', 'avokado', 'avocado', 'laks', 'salmon', 'frø', 'fro', 'chia', 'yoghurt', 'yogurt', 'oliven'];
const CARB_WORDS = ['ris', 'rice', 'potet', 'potato', 'pasta', 'havre', 'oat', 'wrap', 'tortilla', 'brod', 'brød', 'nudel', 'soba', 'quinoa', 'banan', 'mango'];
const EVENING_WORDS = ['kveld', 'suppe', 'omelett', 'salat', 'gryte', 'chili'];

const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  fish: ['laks', 'salmon', 'tunfisk', 'tuna', 'sardiner'],
  shellfish: ['reker', 'shrimp', 'scampi'],
  milk: ['yoghurt', 'yogurt', 'kefir', 'ost', 'cheese', 'feta', 'cottage', 'hytteost', 'milk'],
  gluten: ['brod', 'brød', 'wrap', 'tortilla', 'pasta', 'nudel', 'soba', 'granola'],
  soy: ['tofu', 'soy', 'soya', 'edamame', 'tempeh', 'miso'],
  egg: ['egg', 'omelett'],
  nuts: ['mandel', 'almond', 'cashew', 'valnott', 'valnøtt', 'nott', 'nøtt'],
  peanuts: ['peanott', 'peanut'],
};

function normalizeText(parts: Array<string | undefined>) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function orderByKnownValues<T extends string>(values: Set<T>, order: readonly T[]) {
  return order.filter((value) => values.has(value));
}

function inferMealSlots(text: string, mealIdHint?: MealId): Array<Exclude<MealSlot, 'alle'>> {
  if (mealIdHint === 'breakfast') return ['frokost'];
  if (mealIdHint === 'lunch') return ['lunsj'];
  if (mealIdHint === 'dinner') return ['middag'];
  if (mealIdHint === 'snacks') return ['snacks'];

  const slots = new Set<Exclude<MealSlot, 'alle'>>();
  if (includesAny(text, ['frokost', 'breakfast', 'havre', 'smoothie', 'omelett', 'pannekake'])) slots.add('frokost');
  if (includesAny(text, ['lunsj', 'lunch', 'sandwich', 'wrap', 'salat', 'bowl'])) slots.add('lunsj');
  if (includesAny(text, ['middag', 'dinner', 'gryte', 'suppe', 'pasta', 'taco', 'chili'])) slots.add('middag');
  if (includesAny(text, ['snack', 'snacks', 'bar', 'kveld', 'yoghurt', 'smoothie'])) slots.add('snacks');
  if (!slots.size) slots.add('lunsj');
  return (['frokost', 'lunsj', 'middag', 'snacks'] as const).filter((slot): slot is Exclude<MealSlot, 'alle'> => slots.has(slot));
}

export function inferMealMetadata(input: InferMealMetadataInput): Pick<
  MealRecipe,
  'mealSlots' | 'tags' | 'sortContexts' | 'dietStyles' | 'goalCategories' | 'goalStrategies' | 'containsAllergens' | 'signals'
> {
  const text = normalizeText([input.title, input.caption, ...(input.ingredients ?? []), ...(input.steps ?? [])]);
  const mealSlots = inferMealSlots(text, input.mealIdHint);

  const protein = input.macroHints?.protein ?? (includesAny(text, HIGH_PROTEIN_WORDS) ? 28 : input.calories >= 500 ? 24 : 16);
  const carbs = input.macroHints?.carbs ?? (includesAny(text, CARB_WORDS) ? 42 : input.calories >= 500 ? 35 : 18);
  const fat = input.macroHints?.fat ?? (includesAny(text, ['avokado', 'avocado', 'oliven', 'olive', 'ost', 'cheese', 'nott', 'nøtt']) ? 18 : 10);

  const containsAllergens = Object.entries(ALLERGEN_KEYWORDS)
    .filter(([, words]) => includesAny(text, words))
    .map(([allergen]) => allergen);

  const signals = {
    fiber: includesAny(text, FIBER_WORDS) ? Math.max(7, Math.round(carbs / 6)) : Math.max(2, Math.round(carbs / 10)),
    fermented: includesAny(text, FERMENTED_WORDS),
    antiInflammatory: includesAny(text, ANTI_INFLAMMATORY_WORDS),
    highProtein: protein >= 24 || includesAny(text, HIGH_PROTEIN_WORDS),
    eveningFriendly: mealSlots.includes('middag') || mealSlots.includes('snacks') || includesAny(text, EVENING_WORDS),
    highEnergy: input.calories >= 480 || carbs >= 40,
    magnesiumRich: includesAny(text, ['havre', 'chia', 'mandel', 'almond', 'quinoa', 'bonn', 'bøn', 'brokkoli', 'broccoli', 'spinat']),
  };

  const tags = new Set<NutritionTagId>();
  if (signals.fermented || signals.fiber >= 7) tags.add('gut_health');
  if (signals.highProtein) tags.add('high_protein');
  if (signals.antiInflammatory) tags.add('low_inflammation');
  if (includesAny(text, BRAIN_WORDS) || signals.highEnergy) tags.add('brain_fuel');
  if (includesAny(text, HORMONE_WORDS) || fat >= 16) tags.add('hormone_support');
  if (signals.fiber >= 7) tags.add('fiber_focus');
  if (signals.highProtein && (signals.highEnergy || carbs >= 30)) tags.add('recovery');

  const sortContexts = new Set<SmartSortId>(['recommended']);
  if (tags.has('recovery')) sortContexts.add('post_workout');
  if (signals.eveningFriendly) sortContexts.add('evening');
  if (tags.has('gut_health')) sortContexts.add('gut');
  if (signals.highEnergy) sortContexts.add('high_energy');
  if (signals.antiInflammatory) sortContexts.add('anti_inflammatory');
  if (signals.highProtein || tags.has('brain_fuel')) sortContexts.add('goal');

  const dietStyles = new Set<DietStyle>(['standard_balanced', 'flexible_iifym']);
  const hasFishOrMeat = includesAny(text, ['kylling', 'chicken', 'kalkun', 'turkey', 'biff', 'beef', 'laks', 'salmon', 'tunfisk', 'tuna', 'reker', 'shrimp', 'kjott', 'kjøtt']);
  const hasDairyOrEgg = includesAny(text, ['egg', 'omelett', 'yoghurt', 'yogurt', 'ost', 'cheese', 'kefir', 'cottage', 'hytteost', 'milk']);
  if (!hasFishOrMeat && !hasDairyOrEgg) {
    dietStyles.add('vegan');
    dietStyles.add('vegetarian');
  } else if (!hasFishOrMeat) {
    dietStyles.add('vegetarian');
  }
  if (signals.highProtein) dietStyles.add('high_protein');
  if (signals.highEnergy) dietStyles.add('high_carb_performance');
  if (signals.antiInflammatory || includesAny(text, ['oliven', 'olive', 'fisk', 'laks', 'salmon', 'quinoa', 'bøn', 'bonn'])) dietStyles.add('mediterranean');
  if (carbs <= 18) dietStyles.add('low_carb');
  if (fat >= 24 && carbs <= 15) dietStyles.add('keto');

  const goalCategories = new Set<GoalCategory>(['health']);
  if (signals.highProtein) goalCategories.add('muscle_gain');
  if (signals.highProtein && signals.highEnergy) goalCategories.add('performance');
  if (signals.highProtein || signals.fiber >= 6) goalCategories.add('recomp');
  if (signals.fiber >= 7 && input.calories <= 520) goalCategories.add('fat_loss');

  const goalStrategies = new Set<GoalStrategy>(['stable_energy']);
  if (signals.highProtein) {
    goalStrategies.add('high_protein_maintenance');
    goalStrategies.add('strength_focus');
  }
  if (signals.highEnergy) {
    goalStrategies.add('hybrid_athlete');
    goalStrategies.add('endurance_focus');
  }
  if (signals.antiInflammatory) goalStrategies.add('blood_markers');
  if (tags.has('hormone_support')) goalStrategies.add('hormonal_balance');
  if (tags.has('gut_health')) goalStrategies.add('gut_health');
  if (signals.fiber >= 7 && input.calories <= 500) goalStrategies.add('fat_reduction_no_scale');
  if (signals.highProtein && input.calories >= 540) goalStrategies.add('lean_bulk');
  if (signals.highProtein && input.calories <= 460) goalStrategies.add('standard_cut');

  return {
    mealSlots,
    tags: orderByKnownValues(tags, TAG_ORDER),
    sortContexts: orderByKnownValues(sortContexts, SORT_ORDER),
    dietStyles: orderByKnownValues(dietStyles, DIET_STYLE_ORDER),
    goalCategories: orderByKnownValues(goalCategories, GOAL_CATEGORY_ORDER),
    goalStrategies: orderByKnownValues(goalStrategies, GOAL_STRATEGY_ORDER),
    containsAllergens,
    signals,
  };
}

export function getFavoriteTagMatches(recipe: Pick<MealRecipe, 'tags'>, favoriteTags: NutritionTagId[]) {
  return favoriteTags.filter((tag) => recipe.tags.includes(tag));
}

export function scoreMealRecommendation({
  recipe,
  activeSort,
  profileDietStyle,
  profileGoalCategory,
  profileGoalStrategy,
  hardWorkoutToday,
  lowFiberToday,
  recentMealKeywords,
  favoriteRecipeIds,
  favoriteTags,
  activeTagFilter,
}: ScoreMealInput) {
  const favoriteTagMatches = getFavoriteTagMatches(recipe, favoriteTags);
  let score = recipe.source === 'Community' ? 3.5 : recipe.source === 'Mine måltider' ? 4.5 : 4;

  if (recipe.sortContexts.includes(activeSort)) score += 8;
  if (recipe.dietStyles.includes(profileDietStyle)) score += 6;
  if (recipe.goalCategories.includes(profileGoalCategory)) score += 6;
  if (recipe.goalStrategies.includes(profileGoalStrategy)) score += 5;
  if (hardWorkoutToday && recipe.tags.includes('recovery')) score += 5;
  if (lowFiberToday && recipe.signals.fiber >= 7) score += 4;
  if (favoriteTagMatches.length > 0) score += 3 + favoriteTagMatches.length * 1.5;
  if (activeTagFilter && recipe.tags.includes(activeTagFilter)) score += 9;
  if (favoriteRecipeIds.has(recipe.id)) score += 4;
  if (activeSort === 'goal' && recipe.goalCategories.includes(profileGoalCategory)) score += 3;
  if (activeSort === 'post_workout' && recipe.signals.highProtein) score += 4;
  if (activeSort === 'evening' && recipe.signals.eveningFriendly) score += 4;
  if (activeSort === 'gut' && (recipe.signals.fermented || recipe.signals.fiber >= 6)) score += 4;
  if (activeSort === 'high_energy' && recipe.signals.highEnergy) score += 4;
  if (activeSort === 'anti_inflammatory' && recipe.signals.antiInflammatory) score += 4;

  const title = recipe.title.toLowerCase();
  const keywordMatches = Array.from(recentMealKeywords).filter((token) => title.includes(token)).length;
  score += Math.min(keywordMatches, 3) * 1.5;

  if (recipe.source === 'Lagrede måltider') score += 1.5;
  if (recipe.source === 'Mine måltider') score += 1;

  return score;
}
