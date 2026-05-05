import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Clock, Dumbbell, Flame, Info, Leaf, Plus, SlidersHorizontal, Sparkles, Sprout, Star, Users, Wind, X, Zap } from 'lucide-react';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { useT } from '../../lib/i18n';
import { addDays, createEmptyDayLog, getTotalHydrationMl, startOfDay, toDateKey, type DayLog, type FoodEntry, type MealId } from '../../lib/disciplineEngine';
import { getFavoriteTagMatches, inferMealMetadata, scoreMealRecommendation } from '../../lib/mealLibrary';
import { normalizeNutritionProfile, type DietStyle, type GoalCategory, type GoalStrategy } from '../../lib/nutritionPlanner';
import { mealRecipes, type MealRecipe, type MealSlot, type NutritionTagId, type SmartSortId } from '../../data/mealRecipes';

type ProfilePrefs = {
  goalCategory?: GoalCategory;
  goalStrategy?: GoalStrategy;
  dietStyle?: DietStyle;
  trainingType?: 'strength' | 'running' | 'crossfit' | 'cycling' | 'mixed' | 'sedentary';
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'very';
  specialPhase?: 'normal' | 'reverse_diet' | 'recovery' | 'smart_auto';
  allergies?: string[];
  intolerances?: string[];
};

// smartSortOptions, libraryOptions, mealFilterOptions and tagInfo are defined inside MealsScreen to use t()

const recipes = mealRecipes;
const COMMUNITY_RECIPE_PLACEHOLDER = 'https://images.unsplash.com/photo-1547592180-85f173990554?w=700&h=420&fit=crop';

type CommunityRecipePost = {
  id: string;
  kind?: 'workout' | 'recipe';
  authorId: string;
  caption?: string;
  imageDataUrl?: string;
  calories: number;
  recipeTitle?: string;
  recipeIngredients?: string[];
  recipeSteps?: string[];
  recipeServings?: number;
  recipePrepMinutes?: number;
};

type DisplayRecipe = MealRecipe & {
  origin: 'catalog' | 'community' | 'saved';
  customIngredients?: string[];
  customSteps?: string[];
  customCaption?: string;
};

type SavedMealTemplate = {
  id: string;
  mealId: MealId;
  name: string;
  items: FoodEntry[];
  usageCount: number;
};

function sumDaySignals(log: DayLog) {
  const items = Object.values(log.meals).flat();
  return items.reduce(
    (acc, item) => {
      const lower = item.name.toLowerCase();
      if (['havre', 'linse', 'kiker', 'brokkoli', 'chia', 'quinoa'].some((word) => lower.includes(word))) acc.fiber += 1;
      if (['kimchi', 'kefir', 'kombucha', 'yoghurt'].some((word) => lower.includes(word))) acc.fermented += 1;
      acc.protein += item.protein;
      return acc;
    },
    { fiber: 0, fermented: 0, protein: 0 },
  );
}

const EMPTY_PROFILE_PREFS: ProfilePrefs = {};
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_WORKOUTS: Array<{ dateKey: string; caloriesBurned: number }> = [];
const EMPTY_SAVED_MEAL_TEMPLATES: SavedMealTemplate[] = [];
const DEFAULT_FAVORITE_RECIPE_IDS = ['r1', 'r4'];
const DEFAULT_FAVORITE_TAGS: NutritionTagId[] = ['high_protein', 'gut_health'];

function createSavedMealId() {
  if (window.crypto?.randomUUID) return `saved-meal-${window.crypto.randomUUID()}`;
  return `saved-meal-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export default function MealsScreen() {
  const { activeUserId } = useCurrentUser();
  const t = useT();

  const smartSortOptions: Array<{ id: SmartSortId; label: string }> = [
    { id: 'recommended', label: t('meals.sort.recommended') },
    { id: 'goal', label: t('meals.sort.goal') },
    { id: 'post_workout', label: t('meals.sort.post_workout') },
    { id: 'evening', label: t('meals.sort.evening') },
    { id: 'gut', label: t('meals.sort.gut') },
    { id: 'high_energy', label: t('meals.sort.high_energy') },
    { id: 'anti_inflammatory', label: t('meals.sort.anti_inflammatory') },
  ];

  const libraryOptions = [
    { id: 'discover' as const, label: t('meals.library.discover') },
    { id: 'mine' as const, label: t('meals.library.mine') },
  ];

  const mealFilterOptions: Array<{ id: MealSlot; label: string }> = [
    { id: 'alle', label: t('meals.filters.all') },
    { id: 'frokost', label: t('meals.filters.breakfast') },
    { id: 'lunsj', label: t('meals.filters.lunch') },
    { id: 'middag', label: t('meals.filters.dinner') },
    { id: 'snacks', label: t('meals.filters.snacks') },
  ];

  const tagInfo: Record<NutritionTagId, { label: string; explanation: string; article: string; url: string; supplement: string; training: string }> = {
    gut_health: {
      label: t('meals.tagInfo.gut_health.label'),
      explanation: t('meals.tagInfo.gut_health.explanation'),
      article: t('meals.tagInfo.gut_health.article'),
      url: 'https://www.health.harvard.edu/blog/do-gut-bacteria-inhibit-weight-loss-2020012318699',
      supplement: t('meals.tagInfo.gut_health.supplement'),
      training: t('meals.tagInfo.gut_health.training'),
    },
    high_protein: {
      label: t('meals.tagInfo.high_protein.label'),
      explanation: t('meals.tagInfo.high_protein.explanation'),
      article: t('meals.tagInfo.high_protein.article'),
      url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7539343/',
      supplement: t('meals.tagInfo.high_protein.supplement'),
      training: t('meals.tagInfo.high_protein.training'),
    },
    low_inflammation: {
      label: t('meals.tagInfo.low_inflammation.label'),
      explanation: t('meals.tagInfo.low_inflammation.explanation'),
      article: t('meals.tagInfo.low_inflammation.article'),
      url: 'https://health.clevelandclinic.org/anti-inflammatory-diet',
      supplement: t('meals.tagInfo.low_inflammation.supplement'),
      training: t('meals.tagInfo.low_inflammation.training'),
    },
    brain_fuel: {
      label: t('meals.tagInfo.brain_fuel.label'),
      explanation: t('meals.tagInfo.brain_fuel.explanation'),
      article: t('meals.tagInfo.brain_fuel.article'),
      url: 'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/brain-food/art-20048351',
      supplement: t('meals.tagInfo.brain_fuel.supplement'),
      training: t('meals.tagInfo.brain_fuel.training'),
    },
    hormone_support: {
      label: t('meals.tagInfo.hormone_support.label'),
      explanation: t('meals.tagInfo.hormone_support.explanation'),
      article: t('meals.tagInfo.hormone_support.article'),
      url: 'https://www.hopkinsmedicine.org/health/wellness-and-prevention/hormones-and-weight-loss',
      supplement: t('meals.tagInfo.hormone_support.supplement'),
      training: t('meals.tagInfo.hormone_support.training'),
    },
    fiber_focus: {
      label: t('meals.tagInfo.fiber_focus.label'),
      explanation: t('meals.tagInfo.fiber_focus.explanation'),
      article: t('meals.tagInfo.fiber_focus.article'),
      url: 'https://health.clevelandclinic.org/high-fiber-foods',
      supplement: t('meals.tagInfo.fiber_focus.supplement'),
      training: t('meals.tagInfo.fiber_focus.training'),
    },
    recovery: {
      label: t('meals.tagInfo.recovery.label'),
      explanation: t('meals.tagInfo.recovery.explanation'),
      article: t('meals.tagInfo.recovery.article'),
      url: 'https://www.acsm.org/all-blog-posts/certification-blog/acsm-certified-blog/2020/07/31/recovery-nutrition',
      supplement: t('meals.tagInfo.recovery.supplement'),
      training: t('meals.tagInfo.recovery.training'),
    },
  };
  const [activeLibrary, setActiveLibrary] = useState<'discover' | 'mine'>('discover');
  const [activeSort, setActiveSort] = useState<SmartSortId>('recommended');
  const [activeMealFilter, setActiveMealFilter] = useState<MealSlot>('alle');
  const [activeTagFilter, setActiveTagFilter] = useState<NutritionTagId | null>(null);
  const [infoTag, setInfoTag] = useState<NutritionTagId | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<DisplayRecipe | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [expandedReasonCards, setExpandedReasonCards] = useState<Set<string>>(new Set());
  const [expandedTagInfoCards, setExpandedTagInfoCards] = useState<Set<string>>(new Set());
  const [peekRecipe, setPeekRecipe] = useState<DisplayRecipe | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [showStatBreakdown, setShowStatBreakdown] = useState(false);
  const heroTouchStartX = useRef<number | null>(null);
  const [diaryFeedback, setDiaryFeedback] = useState<string | null>(null);
  const [showCreateMealModal, setShowCreateMealModal] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealSlot, setNewMealSlot] = useState<MealId>('dinner');
  const [newMealKcal, setNewMealKcal] = useState('450');
  const [newMealProtein, setNewMealProtein] = useState('30');
  const [newMealCarbs, setNewMealCarbs] = useState('40');
  const [newMealFat, setNewMealFat] = useState('15');

  const [profilePrefs] = useLocalStorageState<ProfilePrefs>('profile', EMPTY_PROFILE_PREFS);
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [workouts] = useLocalStorageState<Array<{ dateKey: string; caloriesBurned: number }>>('home.workoutSessions.v1', EMPTY_WORKOUTS);
  const [, setLastLoggedFood] = useLocalStorageState<FoodEntry | null>('home.lastLoggedFood.v1', null);
  const [communityPosts] = useLocalStorageState<CommunityRecipePost[]>('community.posts.v1', [], { scope: 'global' });
  const [savedMealTemplates, setSavedMealTemplates] = useLocalStorageState<SavedMealTemplate[]>('home.savedMealTemplates.v1', EMPTY_SAVED_MEAL_TEMPLATES);
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useLocalStorageState<string[]>('meals.favoriteRecipeIds.v1', DEFAULT_FAVORITE_RECIPE_IDS);
  const [favoriteTags, setFavoriteTags] = useLocalStorageState<NutritionTagId[]>('meals.favoriteTags.v1', DEFAULT_FAVORITE_TAGS);
  const favorites = useMemo(() => new Set(favoriteRecipeIds), [favoriteRecipeIds]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const profile = useMemo(
    () =>
      normalizeNutritionProfile({
        goalCategory: profilePrefs.goalCategory,
        goalStrategy: profilePrefs.goalStrategy,
        dietStyle: profilePrefs.dietStyle,
        trainingType: profilePrefs.trainingType,
        activityLevel: profilePrefs.activityLevel,
        specialPhase: profilePrefs.specialPhase,
      }),
    [profilePrefs.activityLevel, profilePrefs.dietStyle, profilePrefs.goalCategory, profilePrefs.goalStrategy, profilePrefs.specialPhase, profilePrefs.trainingType],
  );

  const todayLog = logsByDate[todayKey] ?? createEmptyDayLog();
  const todaySignals = useMemo(() => sumDaySignals(todayLog), [todayLog]);
  const weekSignals = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => sumDaySignals(logsByDate[toDateKey(addDays(today, -i))] ?? createEmptyDayLog())).reduce(
      (acc, current) => ({ fiber: acc.fiber + current.fiber, fermented: acc.fermented + current.fermented, protein: acc.protein + current.protein }),
      { fiber: 0, fermented: 0, protein: 0 },
    );
  }, [logsByDate, today]);

  const hardWorkoutToday = useMemo(() => {
    const fromLogs = (logsByDate[todayKey]?.trainingKcal ?? 0) >= 350;
    const fromSessions = workouts.filter((entry) => entry.dateKey === todayKey).reduce((sum, e) => sum + (e.caloriesBurned ?? 0), 0) >= 350;
    return fromLogs || fromSessions;
  }, [logsByDate, todayKey, workouts]);

  const poorSleepProxy = getTotalHydrationMl(todayLog) < 800 && todaySignals.protein < 60;
  const stressProxy = profile.specialPhase === 'recovery' || profile.trainingType === 'crossfit';
  const lowFiberToday = todaySignals.fiber < 2;
  const recentMealKeywords = useMemo(() => {
    const words = new Set<string>();
    const stopwords = new Set(['med', 'og', 'til', 'for', 'på', 'the', 'and']);
    Array.from({ length: 7 }, (_, i) => logsByDate[toDateKey(addDays(today, -i))] ?? createEmptyDayLog())
      .flatMap((log) => Object.values(log.meals).flat())
      .forEach((item) => {
        item.name
          .toLowerCase()
          .split(/[^a-zA-ZæøåÆØÅ]+/)
          .filter((token) => token.length > 2 && !stopwords.has(token))
          .forEach((token) => words.add(token));
      });
    return words;
  }, [logsByDate, today]);

  const weeklyInsight = weekSignals.fermented < 4
    ? t('meals.weeklyInsight.lowFermented')
    : weekSignals.fiber < 14
      ? t('meals.weeklyInsight.lowFiber')
      : weekSignals.protein < 650
        ? t('meals.weeklyInsight.lowProtein')
        : t('meals.weeklyInsight.good');
  void weeklyInsight;

  const bannerTitle = profile.goalStrategy === 'gut_health'
    ? t('meals.banner.gutMode')
    : hardWorkoutToday
      ? t('meals.banner.recovery')
      : poorSleepProxy
        ? t('meals.banner.energy')
        : t('meals.banner.default');
  const bannerSubtitle = profile.goalStrategy === 'gut_health'
    ? t('meals.banner.gutSub')
    : t('meals.banner.defaultSub');
  void bannerTitle;
  void bannerSubtitle;

  const recommendationBlocks = useMemo(() => {
    const blocks: Array<{ id: string; title: string; desc: string; match: (recipe: MealRecipe) => boolean }> = [];
    if (hardWorkoutToday) blocks.push({ id: 'recovery', title: t('meals.recommendationBlocks.recoveryTitle'), desc: t('meals.recommendationBlocks.recoveryDesc'), match: (r) => r.tags.includes('recovery') || r.signals.highProtein });
    if (poorSleepProxy) blocks.push({ id: 'energy', title: t('meals.recommendationBlocks.energyTitle'), desc: t('meals.recommendationBlocks.energyDesc'), match: (r) => r.signals.highEnergy || r.signals.magnesiumRich });
    if (stressProxy) blocks.push({ id: 'calming', title: t('meals.recommendationBlocks.calmingTitle'), desc: t('meals.recommendationBlocks.calmingDesc'), match: (r) => r.signals.magnesiumRich || r.signals.antiInflammatory });
    if (lowFiberToday) blocks.push({ id: 'fiber', title: t('meals.recommendationBlocks.fiberTitle'), desc: t('meals.recommendationBlocks.fiberDesc'), match: (r) => r.signals.fiber >= 7 });
    if (profile.goalStrategy === 'gut_health') blocks.push({ id: 'gut', title: t('meals.recommendationBlocks.gutTitle'), desc: t('meals.recommendationBlocks.gutDesc'), match: (r) => r.signals.fermented || r.sortContexts.includes('gut') });
    return blocks.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardWorkoutToday, lowFiberToday, poorSleepProxy, profile.goalStrategy, stressProxy, t]);

  const rawMyRecipes = useMemo<DisplayRecipe[]>(() => {
    return communityPosts
      .filter((post) => post.authorId === activeUserId && post.kind === 'recipe' && post.recipeTitle?.trim())
      .map((post) => ({
        id: `community-${post.id}`,
        title: post.recipeTitle?.trim() ?? t('meals.myMealsSource'),
        image: post.imageDataUrl || COMMUNITY_RECIPE_PLACEHOLDER,
        calories: Math.max(0, Math.round(post.calories || 0)),
        time: `${Math.max(1, post.recipePrepMinutes ?? 20)} min`,
        rating: 4.7,
        reviews: 1,
        source: t('meals.myMealsSource'),
        servings: Math.max(1, post.recipeServings ?? 1),
        mealSlots: ['lunsj', 'middag'] satisfies Array<Exclude<MealSlot, 'alle'>>,
        tags: [] as NutritionTagId[],
        sortContexts: ['recommended'] satisfies SmartSortId[],
        dietStyles: [profile.dietStyle],
        goalCategories: [profile.goalCategory],
        goalStrategies: [profile.goalStrategy],
        containsAllergens: [],
        ingredients: post.recipeIngredients ?? [],
        steps: post.recipeSteps ?? [],
        signals: {
          fiber: 3,
          fermented: false,
          antiInflammatory: false,
          highProtein: (post.calories || 0) >= 350,
          eveningFriendly: true,
          highEnergy: (post.calories || 0) >= 450,
          magnesiumRich: false,
        },
        origin: 'community' as const,
        customIngredients: post.recipeIngredients ?? [],
        customSteps: post.recipeSteps ?? [],
        customCaption: post.caption?.trim() || '',
      }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [activeUserId, communityPosts, profile.dietStyle, profile.goalCategory, profile.goalStrategy]);

  const myRecipes = useMemo<DisplayRecipe[]>(() => {
    return rawMyRecipes.map((recipe) => ({
      ...recipe,
      ...inferMealMetadata({
        title: recipe.title,
        calories: recipe.calories,
        ingredients: recipe.customIngredients ?? [],
        steps: recipe.customSteps ?? [],
        caption: recipe.customCaption ?? '',
      }),
      source: t('meals.myMealsSource'),
    }));
  }, [rawMyRecipes, t]);

  const communityRecipeDatabase = useMemo<DisplayRecipe[]>(() => {
    return communityPosts
      .filter((post) => post.kind === 'recipe' && post.recipeTitle?.trim())
      .map((post) => {
        const title = post.recipeTitle?.trim() ?? 'Community';
        const calories = Math.max(0, Math.round(post.calories || 0));
        const inferred = inferMealMetadata({
          title,
          calories,
          ingredients: post.recipeIngredients ?? [],
          steps: post.recipeSteps ?? [],
          caption: post.caption?.trim() || '',
        });

        return {
          id: `community-db-${post.id}`,
          title,
          image: post.imageDataUrl || COMMUNITY_RECIPE_PLACEHOLDER,
          calories,
          time: `${Math.max(1, post.recipePrepMinutes ?? 20)} min`,
          rating: 4.5,
          reviews: Math.max(1, (post.recipeIngredients?.length ?? 0) + (post.recipeSteps?.length ?? 0)),
          source: 'Community',
          servings: Math.max(1, post.recipeServings ?? 1),
          ingredients: post.recipeIngredients ?? [],
          steps: post.recipeSteps ?? [],
          ...inferred,
          origin: 'community' as const,
          customIngredients: post.recipeIngredients ?? [],
          customSteps: post.recipeSteps ?? [],
          customCaption: post.caption?.trim() || '',
        };
      })
      .sort((a, b) => b.reviews - a.reviews || a.title.localeCompare(b.title));
  }, [communityPosts]);

  const savedMeals = useMemo<DisplayRecipe[]>(() => {
    return savedMealTemplates
      .map((template) => {
        const totals = template.items.reduce(
          (acc, item) => ({
            kcal: acc.kcal + item.kcal,
            protein: acc.protein + item.protein,
            carbs: acc.carbs + item.carbs,
            fat: acc.fat + item.fat,
          }),
          { kcal: 0, protein: 0, carbs: 0, fat: 0 },
        );
        const mealSlot = template.mealId === 'breakfast'
          ? 'frokost'
          : template.mealId === 'lunch'
            ? 'lunsj'
            : template.mealId === 'dinner'
              ? 'middag'
              : 'snacks';
        const mealSlotLabel = template.mealId === 'breakfast'
          ? t('meals.filters.breakfast')
          : template.mealId === 'lunch'
            ? t('meals.filters.lunch')
            : template.mealId === 'dinner'
              ? t('meals.filters.dinner')
              : t('meals.filters.snacks');
        const inferred = inferMealMetadata({
          title: template.name,
          calories: Math.max(0, Math.round(totals.kcal)),
          ingredients: template.items.map((item) => item.name),
          mealIdHint: template.mealId,
          macroHints: {
            protein: totals.protein,
            carbs: totals.carbs,
            fat: totals.fat,
          },
        });

        return {
          id: `saved-${template.id}`,
          title: template.name,
          image: COMMUNITY_RECIPE_PLACEHOLDER,
          calories: Math.max(0, Math.round(totals.kcal)),
          time: t('meals.readyNow'),
          rating: 5,
          reviews: Math.max(1, template.usageCount || 0),
          source: t('meals.savedMealsSource'),
          servings: 1,
          ingredients: template.items.map((item) => item.name),
          steps: [],
          ...inferred,
          mealSlots: inferred.mealSlots.length > 0 ? inferred.mealSlots : [mealSlot] satisfies Array<Exclude<MealSlot, 'alle'>>,
          origin: 'saved' as const,
          customIngredients: template.items.map((item) => `${item.name} - ${Math.round(item.kcal)} kcal`),
          customSteps: [],
          customCaption: `${template.usageCount} raske logger${mealSlotLabel ? ` • ${mealSlotLabel}` : ''}`,
        };
      })
      .sort((a, b) => b.reviews - a.reviews || a.title.localeCompare(b.title));
  }, [savedMealTemplates, t]);

  const filteredRecipes = useMemo<DisplayRecipe[]>(() => {
    const blocked = new Set([...(profilePrefs.allergies ?? []), ...(profilePrefs.intolerances ?? [])].map((v) => v.toLowerCase()));
    const profileDietFilter = profile.dietStyle === 'vegan' ? 'vegan' : profile.dietStyle === 'vegetarian' ? 'vegetarian' : 'alle';
    const sourceRecipes = activeLibrary === 'mine'
      ? [...savedMeals, ...myRecipes]
      : [...recipes.map((recipe) => ({ ...recipe, origin: 'catalog' as const })), ...communityRecipeDatabase];

    const eligible = sourceRecipes.filter((recipe) => {
      if (recipe.containsAllergens.some((a) => blocked.has(a.toLowerCase()))) return false;
      if (activeMealFilter !== 'alle' && !recipe.mealSlots.includes(activeMealFilter)) return false;
      if (activeTagFilter && !recipe.tags.includes(activeTagFilter)) return false;
      if (profileDietFilter === 'vegan' && !recipe.dietStyles.includes('vegan')) return false;
      if (profileDietFilter === 'vegetarian' && !(recipe.dietStyles.includes('vegetarian') || recipe.dietStyles.includes('vegan'))) return false;
      return true;
    });
    const scoped = showFavoritesOnly ? eligible.filter((recipe) => favorites.has(recipe.id)) : eligible;
    return [...scoped].sort((a, b) => {
      return scoreMealRecommendation({
        recipe: b,
        activeSort,
        profileDietStyle: profile.dietStyle,
        profileGoalCategory: profile.goalCategory,
        profileGoalStrategy: profile.goalStrategy,
        hardWorkoutToday,
        lowFiberToday,
        recentMealKeywords,
        favoriteRecipeIds: favorites,
        favoriteTags,
        activeTagFilter,
      }) - scoreMealRecommendation({
        recipe: a,
        activeSort,
        profileDietStyle: profile.dietStyle,
        profileGoalCategory: profile.goalCategory,
        profileGoalStrategy: profile.goalStrategy,
        hardWorkoutToday,
        lowFiberToday,
        recentMealKeywords,
        favoriteRecipeIds: favorites,
        favoriteTags,
        activeTagFilter,
      });
    });
  }, [activeLibrary, activeMealFilter, activeSort, activeTagFilter, communityRecipeDatabase, favoriteTags, favorites, hardWorkoutToday, lowFiberToday, myRecipes, profile.dietStyle, profile.goalCategory, profile.goalStrategy, profilePrefs.allergies, profilePrefs.intolerances, recentMealKeywords, savedMeals, showFavoritesOnly]);

  const blocksWithItems = useMemo(() => {
    const seen = new Set<string>();
    return recommendationBlocks.map((block) => {
      const items = filteredRecipes.filter((r) => !seen.has(r.id) && block.match(r)).slice(0, 3);
      items.forEach((r) => seen.add(r.id));
      return { ...block, items };
    });
  }, [filteredRecipes, recommendationBlocks]);
  const visibleRecommendationBlocks = useMemo(
    () => blocksWithItems.filter((block) => block.items.length > 0),
    [blocksWithItems],
  );
  const contextualHeader = useMemo(() => {
    const h = new Date().getHours();
    const m = new Date().getMinutes();
    const totalMin = h * 60 + m;
    if (totalMin < 9 * 60) return { title: t('meals.contextualHeader.morning.title'), sub: t('meals.contextualHeader.morning.sub') };
    if (totalMin < 10 * 60 + 30) return { title: t('meals.contextualHeader.midMorning.title'), sub: t('meals.contextualHeader.midMorning.sub') };
    if (totalMin < 11 * 60 + 30) {
      const minsToLunch = 11 * 60 + 30 - totalMin;
      return { title: t('meals.contextualHeader.preLunch.title', { n: String(minsToLunch) }), sub: t('meals.contextualHeader.preLunch.sub') };
    }
    if (totalMin < 13 * 60 + 30) return { title: t('meals.contextualHeader.lunch.title'), sub: t('meals.contextualHeader.lunch.sub') };
    if (totalMin < 16 * 60) return { title: t('meals.contextualHeader.afternoon.title'), sub: t('meals.contextualHeader.afternoon.sub') };
    if (totalMin < 18 * 60) {
      const minsToEve = 18 * 60 - totalMin;
      return { title: t('meals.contextualHeader.preDinner.title', { n: String(minsToEve) }), sub: t('meals.contextualHeader.preDinner.sub') };
    }
    if (totalMin < 20 * 60) return { title: t('meals.contextualHeader.dinner.title'), sub: t('meals.contextualHeader.dinner.sub') };
    return { title: t('meals.contextualHeader.evening.title'), sub: t('meals.contextualHeader.evening.sub') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const shownInBlocksIds = useMemo(
    () => new Set(visibleRecommendationBlocks.flatMap((block) => block.items.map((r) => r.id))),
    [visibleRecommendationBlocks],
  );

  const featuredMeals = useMemo(() => filteredRecipes.slice(0, 3), [filteredRecipes]);

  const heroReasonPills = useMemo(() =>
    featuredMeals.map((recipe) => {
      if (hardWorkoutToday && recipe.tags.includes('recovery')) return t('meals.reasonPills.afterWorkout');
      if (lowFiberToday && recipe.signals.fiber >= 7) return t('meals.reasonPills.lowFiber');
      if (profile.goalStrategy === 'gut_health' && (recipe.signals.fermented || recipe.sortContexts.includes('gut'))) return t('meals.reasonPills.gutFriendly');
      if (recipe.goalCategories.includes(profile.goalCategory)) return t('meals.reasonPills.matchesGoal');
      return null;
    }),
    [featuredMeals, hardWorkoutToday, lowFiberToday, profile.goalCategory, profile.goalStrategy, t],
  );

  const blockTheme: Record<string, { border: string; headerBg: string; iconColor: string; icon: React.ReactNode }> = {
    fiber:    { border: 'border-l-4 border-l-green-500',  headerBg: 'bg-green-50 dark:bg-green-900/20',   iconColor: 'text-green-600 dark:text-green-400',  icon: <Leaf className="h-4 w-4" /> },
    energy:   { border: 'border-l-4 border-l-amber-500',  headerBg: 'bg-amber-50 dark:bg-amber-900/20',   iconColor: 'text-amber-600 dark:text-amber-400',  icon: <Zap className="h-4 w-4" /> },
    recovery: { border: 'border-l-4 border-l-blue-500',   headerBg: 'bg-blue-50 dark:bg-blue-900/20',     iconColor: 'text-blue-600 dark:text-blue-400',    icon: <Dumbbell className="h-4 w-4" /> },
    calming:  { border: 'border-l-4 border-l-violet-500', headerBg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-600 dark:text-violet-400', icon: <Wind className="h-4 w-4" /> },
    gut:      { border: 'border-l-4 border-l-purple-500', headerBg: 'bg-purple-50 dark:bg-purple-900/20', iconColor: 'text-purple-600 dark:text-purple-400', icon: <Sprout className="h-4 w-4" /> },
  };
  const activeSortLabel = smartSortOptions.find((item) => item.id === activeSort)?.label ?? t('meals.sort.recommended');
  void activeSortLabel;
  const mealFilterLabel = activeMealFilter === 'alle' ? t('meals.library.discover') : mealFilterOptions.find((o) => o.id === activeMealFilter)?.label ?? activeMealFilter;
  void mealFilterLabel;
  const activeTagLabel = activeTagFilter ? tagInfo[activeTagFilter].label : t('meals.tags.allTags');
  void activeTagLabel;
  const selectedMacros = selectedRecipe ? estimateMacros(selectedRecipe) : null;
  const selectedMicros = selectedRecipe ? estimateMicros(selectedRecipe) : null;
  const selectedIngredients = selectedRecipe ? getRecipeIngredients(selectedRecipe) : [];
  const selectedSteps = selectedRecipe ? getRecipeSteps(selectedRecipe) : [];
  const visibleRecommendations = visibleRecommendationBlocks.reduce((sum, block) => sum + block.items.length, 0);
  const savedCount = savedMealTemplates.length;
  const personalizedCount = filteredRecipes.filter((recipe) => recipe.goalCategories.includes(profile.goalCategory)).length;
  const mineCount = savedMeals.length + myRecipes.length;
  const collectionTitle = activeLibrary === 'mine' ? t('meals.collection.myMeals') : t('meals.collection.allSuggestions');
  const collectionDescription = activeLibrary === 'mine'
    ? t('meals.collection.fromMine', { n: String(mineCount) })
    : t('meals.collection.fromLibrary', { n: String(filteredRecipes.length) });

  function toggleFavoriteRecipe(recipeId: string) {
    setFavoriteRecipeIds((prev) => (
      prev.includes(recipeId)
        ? prev.filter((id) => id !== recipeId)
        : [...prev, recipeId]
    ));
  }

  function toggleFavoriteTag(tag: NutritionTagId) {
    setFavoriteTags((prev) => (
      prev.includes(tag)
        ? prev.filter((value) => value !== tag)
        : [...prev, tag]
    ));
  }

  function toMealId(slot: Exclude<MealSlot, 'alle'>): MealId {
    if (slot === 'frokost') return 'breakfast';
    if (slot === 'lunsj') return 'lunch';
    if (slot === 'middag') return 'dinner';
    return 'snacks';
  }

  function getTargetMealId(recipe: MealRecipe): MealId {
    if (activeMealFilter !== 'alle') return toMealId(activeMealFilter);
    const hour = new Date().getHours();
    if (hour < 11 && recipe.mealSlots.includes('frokost')) return 'breakfast';
    if (hour < 16 && recipe.mealSlots.includes('lunsj')) return 'lunch';
    if (hour < 21 && recipe.mealSlots.includes('middag')) return 'dinner';
    const firstSlot = recipe.mealSlots[0] ?? 'snacks';
    return toMealId(firstSlot);
  }

  function estimateMacros(recipe: MealRecipe) {
    const kcal = Math.max(0, recipe.calories);
    let proteinRatio = 0.2;
    let carbsRatio = 0.5;
    let fatRatio = 0.3;
    if (recipe.signals.highProtein) {
      proteinRatio = 0.3;
      carbsRatio = 0.4;
      fatRatio = 0.3;
    }
    if (recipe.dietStyles.includes('keto')) {
      proteinRatio = 0.22;
      carbsRatio = 0.08;
      fatRatio = 0.7;
    }
    return {
      protein: Math.round(((kcal * proteinRatio) / 4) * 10) / 10,
      carbs: Math.round(((kcal * carbsRatio) / 4) * 10) / 10,
      fat: Math.round(((kcal * fatRatio) / 9) * 10) / 10,
    };
  }

  function estimateMicros(recipe: MealRecipe) {
    const fiber = Math.max(1, recipe.signals.fiber);
    const omega3 = recipe.containsAllergens.includes('fish') ? 1.6 : recipe.signals.antiInflammatory ? 0.5 : 0.1;
    const magnesium = (recipe.signals.magnesiumRich ? 140 : 75) + fiber * 6;
    const iron = 2.5 + fiber * 0.35 + (recipe.signals.highProtein ? 1.8 : 0.6);
    const potassium = (recipe.signals.highEnergy ? 700 : 480) + (recipe.signals.antiInflammatory ? 120 : 0);
    const vitaminC = (recipe.signals.antiInflammatory ? 32 : 18) + (recipe.signals.fiber >= 7 ? 10 : 0);
    return {
      fiberG: Math.round(fiber * 10) / 10,
      omega3G: Math.round(omega3 * 10) / 10,
      magnesiumMg: Math.round(magnesium),
      ironMg: Math.round(iron * 10) / 10,
      potassiumMg: Math.round(potassium),
      vitaminCMg: Math.round(vitaminC),
    };
  }

  function getRecipeIngredients(recipe: DisplayRecipe) {
    if (recipe.origin === 'saved' && recipe.customIngredients && recipe.customIngredients.length > 0) {
      return recipe.customIngredients;
    }
    if (recipe.origin === 'community' && recipe.customIngredients && recipe.customIngredients.length > 0) {
      return recipe.customIngredients;
    }
    // Use ingredients from recipe data if available
    if ('ingredients' in recipe && Array.isArray((recipe as MealRecipe & { ingredients?: string[] }).ingredients) && ((recipe as MealRecipe & { ingredients?: string[] }).ingredients ?? []).length > 0) {
      return (recipe as MealRecipe & { ingredients?: string[] }).ingredients ?? [];
    }
    return [t('meals.ingredientsNotAvailable')];
  }

  function getRecipeSteps(recipe: DisplayRecipe) {
    if (recipe.origin === 'saved' && recipe.customSteps && recipe.customSteps.length > 0) {
      return recipe.customSteps;
    }
    if (recipe.origin === 'community' && recipe.customSteps && recipe.customSteps.length > 0) {
      return recipe.customSteps;
    }
    // Use steps from recipe data if available
    if ('steps' in recipe && Array.isArray((recipe as MealRecipe & { steps?: string[] }).steps) && ((recipe as MealRecipe & { steps?: string[] }).steps ?? []).length > 0) {
      return (recipe as MealRecipe & { steps?: string[] }).steps ?? [];
    }
    return [t('meals.stepsNotAvailable')];
  }

  function addRecipeToDiary(recipe: DisplayRecipe) {
    const mealId = getTargetMealId(recipe);
    const macros = estimateMacros(recipe);
    const entry: FoodEntry = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `meal-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: recipe.title,
      kcal: Math.round(recipe.calories),
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    };

    setLogsByDate((prev) => {
      const next = { ...prev };
      const currentDay = next[todayKey] ?? createEmptyDayLog();
      next[todayKey] = {
        meals: {
          breakfast: [...currentDay.meals.breakfast],
          lunch: [...currentDay.meals.lunch],
          dinner: [...currentDay.meals.dinner],
          snacks: [...currentDay.meals.snacks],
        },
        trainingKcal: currentDay.trainingKcal,
        waterMl: currentDay.waterMl,
      };
      next[todayKey].meals[mealId].push(entry);
      return next;
    });
    setLastLoggedFood(entry);
    if (recipe.origin === 'saved') {
      const templateId = recipe.id.replace(/^saved-/, '');
      setSavedMealTemplates((prev) =>
        prev.map((template) => (
          template.id === templateId
            ? { ...template, usageCount: (template.usageCount ?? 0) + 1 }
            : template
        )),
      );
    }
    setDiaryFeedback(t('meals.feedback.addedToDiary', { name: recipe.title }));
  }

  function resetCreateMealForm() {
    setNewMealName('');
    setNewMealSlot('dinner');
    setNewMealKcal('450');
    setNewMealProtein('30');
    setNewMealCarbs('40');
    setNewMealFat('15');
  }

  function saveCustomMeal() {
    const name = newMealName.trim();
    const kcal = Number(newMealKcal.replace(',', '.'));
    const protein = Number(newMealProtein.replace(',', '.'));
    const carbs = Number(newMealCarbs.replace(',', '.'));
    const fat = Number(newMealFat.replace(',', '.'));

    if (!name) {
      setDiaryFeedback(t('meals.createMeal.errorNoName'));
      return;
    }
    if ([kcal, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setDiaryFeedback(t('meals.createMeal.errorInvalidMacros'));
      return;
    }

    const nextTemplate: SavedMealTemplate = {
      id: createSavedMealId(),
      mealId: newMealSlot,
      name,
      usageCount: 0,
      items: [
        {
          id: createSavedMealId(),
          name,
          kcal: Math.round(kcal),
          protein: Math.round(protein * 10) / 10,
          carbs: Math.round(carbs * 10) / 10,
          fat: Math.round(fat * 10) / 10,
        },
      ],
    };

    setSavedMealTemplates((prev) => [nextTemplate, ...prev]);
    setShowCreateMealModal(false);
    setActiveLibrary('mine');
    resetCreateMealForm();
    setDiaryFeedback(t('meals.createMeal.savedFeedback', { name }));
  }

  useEffect(() => {
    if (!showCreateMealModal) return;
    resetCreateMealForm();
  }, [showCreateMealModal]);

  useEffect(() => {
    setHeroIndex(0);
  }, [filteredRecipes]);

  useEffect(() => {
    if (!diaryFeedback) return;
    const timer = window.setTimeout(() => setDiaryFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [diaryFeedback]);

  return (
    <div className="screen">
      {activeLibrary === 'discover' && featuredMeals.length > 0 ? (() => {
        const safeIdx = Math.min(heroIndex, featuredMeals.length - 1);
        const heroMeal = featuredMeals[safeIdx];
        const reasonPill = heroReasonPills[safeIdx];
        return (
          <div>
            <div
              className="relative h-[220px] overflow-hidden"
              onTouchStart={(e) => { heroTouchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (heroTouchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - heroTouchStartX.current;
                if (dx < -40 && safeIdx < featuredMeals.length - 1) setHeroIndex(safeIdx + 1);
                else if (dx > 40 && safeIdx > 0) setHeroIndex(safeIdx - 1);
                heroTouchStartX.current = null;
              }}
            >
              <img src={heroMeal.image} alt={heroMeal.title} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

              {reasonPill && (
                <div className="absolute left-4 top-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" />
                    {reasonPill}
                  </span>
                </div>
              )}

              {favorites.has(heroMeal.id) && (
                <div className="absolute right-4 top-4">
                  <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300/50 bg-yellow-400/20 px-2.5 py-1.5 text-[11px] font-medium text-yellow-100 backdrop-blur-sm">
                    <Star className="h-3 w-3 fill-yellow-300 text-yellow-300" />
                    {t('meals.hero.favorite')}
                  </span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-4">
                <h2 className="text-xl font-bold leading-tight text-white">{heroMeal.title}</h2>
                <p className="mt-0.5 text-sm text-white/80">{heroMeal.calories} kcal · {heroMeal.time}</p>
                <div className="mt-3 flex items-center justify-between">
                  {heroMeal.rating ? (
                    <span className="inline-flex items-center gap-1 text-sm text-white/90">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {heroMeal.rating}
                    </span>
                  ) : <span />}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); addRecipeToDiary(heroMeal); }}
                    className="flex items-center gap-1.5 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg"
                  >
                    <Plus className="h-4 w-4" />
                    {t('meals.hero.addButton')}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 bg-white py-2.5 dark:bg-gray-900">
              {featuredMeals.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHeroIndex(i)}
                  className={`rounded-full transition-all ${i === safeIdx ? 'h-1.5 w-4 bg-slate-900 dark:bg-white' : 'h-1.5 w-1.5 bg-slate-300 dark:bg-gray-600'}`}
                  aria-label={t('meals.dotIndicator.show', { n: String(i + 1) })}
                />
              ))}
              {featuredMeals.length > 1 && (
                <span className="ml-2 text-[10px] text-slate-400 dark:text-gray-500">
                  {t('meals.hero.otherSuggestions', { n: String(featuredMeals.length - 1) })}
                </span>
              )}
            </div>
          </div>
        );
      })() : (
        <div className="relative h-32 overflow-hidden">
          <img src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=900&h=420&fit=crop" alt={t('meals.header.myMeals')} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <h1 className="text-xl font-bold">{t('meals.header.myMeals')}</h1>
            <p className="mt-0.5 text-xs text-white/80">{t('meals.header.available', { n: String(mineCount) })}</p>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/95">
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-gray-800">
              {libraryOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setActiveLibrary(option.id)}
                  className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition-all ${
                    activeLibrary === option.id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                      : 'text-slate-500 dark:text-gray-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {activeLibrary === 'mine' && (
                <button
                  type="button"
                  onClick={() => setShowCreateMealModal(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm"
                  aria-label="Opprett måltid"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(true)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSort !== 'recommended' || activeTagFilter
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('meals.filterBar.filterButton')}
                {(activeSort !== 'recommended' ? 1 : 0) + (activeTagFilter ? 1 : 0) > 0 && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold dark:bg-slate-900/20">
                    {(activeSort !== 'recommended' ? 1 : 0) + (activeTagFilter ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mealFilterOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setActiveMealFilter(option.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                  activeMealFilter === option.id
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => setShowStatBreakdown((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <Sparkles className="h-3 w-3 text-orange-400 dark:text-orange-300" />
          {activeLibrary === 'mine'
            ? `${mineCount} ${t('meals.stats.available').toLowerCase()}`
            : `${personalizedCount} ${t('meals.stats.fitsYou').toLowerCase()} (${filteredRecipes.length})`}
          {activeLibrary === 'discover' && visibleRecommendations > 0 && (
            <span className="text-slate-400 dark:text-gray-500"> · {visibleRecommendations} {t('meals.stats.personalTips').toLowerCase()}</span>
          )}
          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform dark:text-gray-500 ${showStatBreakdown ? 'rotate-180' : ''}`} />
        </button>
        {showStatBreakdown && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
              <p className="text-base font-semibold text-slate-900 dark:text-gray-100">{filteredRecipes.length}</p>
              <p className="text-[10px] leading-tight text-slate-400 dark:text-gray-500">{activeLibrary === 'mine' ? t('meals.stats.available') : t('meals.stats.recipes')}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
              <p className="text-base font-semibold text-slate-900 dark:text-gray-100">{personalizedCount}</p>
              <p className="text-[10px] leading-tight text-slate-400 dark:text-gray-500">{activeLibrary === 'mine' ? t('meals.stats.readyToLog') : t('meals.stats.fitsYou')}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
              <p className="text-base font-semibold text-slate-900 dark:text-gray-100">{activeLibrary === 'mine' ? savedCount : visibleRecommendations}</p>
              <p className="text-[10px] leading-tight text-slate-400 dark:text-gray-500">{activeLibrary === 'mine' ? t('meals.stats.saved') : t('meals.stats.personalTips')}</p>
            </div>
          </div>
        )}
      </div>

      {activeLibrary === 'discover' && visibleRecommendationBlocks.length > 0 && (
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{contextualHeader.title}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">{contextualHeader.sub}</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-gray-800 dark:text-gray-300">
              {t('meals.collection.quickChoices', { n: String(visibleRecommendations) })}
            </div>
          </div>
          {visibleRecommendationBlocks.map((block) => {
            const theme = blockTheme[block.id] ?? { border: 'border-l-4 border-l-slate-400', headerBg: 'bg-slate-50 dark:bg-gray-800/60', iconColor: 'text-slate-500 dark:text-gray-400', icon: <Sparkles className="h-4 w-4" /> };
            return (
            <div
              key={block.id}
              className={`overflow-hidden rounded-2xl border border-slate-100 dark:border-gray-700 ${theme.border}`}
            >
              <div className={`flex items-center gap-2 px-3 py-2.5 ${theme.headerBg}`}>
                <span className={theme.iconColor}>{theme.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{block.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">{block.desc}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-gray-900/50 dark:text-gray-400">
                  {block.items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 bg-white p-2 dark:bg-gray-900">
                {block.items.map((recipe) => (
                  <div
                    key={recipe.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedRecipe(recipe)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedRecipe(recipe);
                      }
                    }}
                    className="w-full text-left flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-2 border border-slate-100 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <img src={recipe.image} alt={recipe.title} className="w-16 h-16 rounded-lg object-cover" />
                      {recipe.rating && (
                        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                          {recipe.rating}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{recipe.title}</p>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{recipe.calories} kcal · {recipe.time}</span>
                        <ChevronRight className="h-3 w-3 text-slate-300 dark:text-gray-600" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addRecipeToDiary(recipe);
                      }}
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white"
                      aria-label={`Legg til ${recipe.title}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{collectionTitle}</p>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {collectionDescription}{activeTagFilter ? ` ${t('meals.collection.filteredBy', { tag: tagInfo[activeTagFilter].label })}` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowFavoritesOnly((prev) => !prev)}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${showFavoritesOnly ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
        >
          {showFavoritesOnly ? t('meals.collection.showingFavorites') : t('meals.collection.showFavorites')}
        </button>
      </div>

      <div className="space-y-4 pb-28">
        {filteredRecipes.length === 0 && (
          <div className="mx-4 rounded-2xl border border-dashed border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 p-5 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-100">
              {activeLibrary === 'mine' ? t('meals.empty.noOwn') : t('meals.empty.noMatch')}
            </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                {activeLibrary === 'mine' ? t('meals.empty.noOwnSub') : t('meals.empty.noMatchSub')}
              </p>
          </div>
        )}
        {filteredRecipes.filter((r) => activeLibrary !== 'discover' || !shownInBlocksIds.has(r.id)).map((recipe) => {
          const favoriteTagMatches = getFavoriteTagMatches(recipe, favoriteTags);
          const recommendationReasons = [
            recipe.goalCategories.includes(profile.goalCategory) ? t('meals.recommendReason.matchesGoal') : null,
            recipe.dietStyles.includes(profile.dietStyle) ? t('meals.recommendReason.fitsDiet') : null,
            hardWorkoutToday && recipe.tags.includes('recovery') ? t('meals.recommendReason.goodAfterWorkout') : null,
            lowFiberToday && recipe.signals.fiber >= 7 ? t('meals.recommendReason.highFiber') : null,
            activeSort === 'gut' && (recipe.signals.fermented || recipe.signals.fiber >= 6) ? t('meals.recommendReason.gutFriendly') : null,
            activeSort === 'evening' && recipe.signals.eveningFriendly ? t('meals.recommendReason.eveningFriendly') : null,
            favoriteTagMatches[0] ? t('meals.recommendReason.favoriteTag', { tag: tagInfo[favoriteTagMatches[0]].label }) : null,
          ].filter(Boolean).slice(0, 3) as string[];
          return (
            <div
              key={recipe.id}
              className="mx-4 cursor-pointer overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition-transform duration-200 dark:border-gray-800 dark:bg-gray-900"
              onClick={() => setSelectedRecipe(recipe)}
            >
              <div className="relative">
                <img src={recipe.image} alt={recipe.title} className="h-48 w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/75 to-transparent" />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavoriteRecipe(recipe.id);
                  }}
                  className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur dark:bg-gray-800/90"
                >
                  <Star className={`w-5 h-5 ${favorites.has(recipe.id) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                </button>
                <div className="absolute left-3 top-3 flex gap-2">
                  <span className="inline-flex rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                    {recipe.source}
                  </span>
                  {favorites.has(recipe.id) ? (
                    <span className="inline-flex rounded-full border border-yellow-300/60 bg-yellow-400/20 px-3 py-1 text-[11px] font-medium text-yellow-100 backdrop-blur">
                      {t('meals.hero.favorite')}
                    </span>
                  ) : null}
                </div>
                <div className="absolute bottom-3 left-3 right-14">
                  <h3 className="line-clamp-2 text-lg font-semibold text-white">{recipe.title}</h3>
                  <p className="mt-1 text-xs text-white/80">
                    {recipe.mealSlots.map((slot) => slot[0].toUpperCase() + slot.slice(1)).join(' • ')}
                  </p>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl bg-orange-50 px-3 py-2 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200">
                    <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] opacity-70">
                      <Flame className="h-3.5 w-3.5" />
                      Kcal
                    </div>
                    <p className="mt-1 font-semibold">{recipe.calories}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                    <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] opacity-70">
                      <Clock className="h-3.5 w-3.5" />
                      Tid
                    </div>
                    <p className="mt-1 font-semibold">{recipe.time}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                    <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] opacity-70">
                      <Users className="h-3.5 w-3.5" />
                      Porsj.
                    </div>
                    <p className="mt-1 font-semibold">{recipe.servings}</p>
                  </div>
                </div>

                {(() => {
                  const allReasons = recommendationReasons.length > 0
                    ? recommendationReasons
                    : [recipe.origin === 'community' ? t('meals.recipeCard.fromCommunity') : t('meals.recipeCard.variation')];
                  const isExpanded = expandedReasonCards.has(recipe.id);
                  const visibleReasons = isExpanded ? allReasons : allReasons.slice(0, 2);
                  const hiddenCount = allReasons.length - 2;
                  return (
                    <div className="mt-3 rounded-2xl border border-slate-200/70 bg-slate-50/90 p-3 dark:border-gray-800 dark:bg-gray-800/60">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-gray-400">{t('meals.recipeCard.whyThis')}</p>
                        <div className="flex items-center gap-1 text-orange-500">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-medium">{recipe.rating}</span>
                          <span className="text-xs text-slate-400 dark:text-gray-500">({recipe.reviews})</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleReasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                            {reason}
                          </span>
                        ))}
                        {!isExpanded && hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedReasonCards((prev) => new Set([...prev, recipe.id])); }}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                          >
                            +{hiddenCount}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {recipe.tags.length > 0 ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.tags.map((tag) => (
                        <button
                          key={tag}
                          className={`rounded-full px-2.5 py-1 text-xs ${
                            activeTagFilter === tag
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                              : favoriteTags.includes(tag)
                              ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-500/30'
                              : 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveTagFilter((prev) => prev === tag ? null : tag);
                          }}
                        >
                          {tagInfo[tag].label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedTagInfoCards((prev) => {
                            const next = new Set(prev);
                            prev.has(recipe.id) ? next.delete(recipe.id) : next.add(recipe.id);
                            return next;
                          });
                        }}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-gray-800 dark:text-gray-400"
                      >
                        {expandedTagInfoCards.has(recipe.id) ? t('meals.recipeCard.hideInfo') : t('meals.recipeCard.readMore')}
                      </button>
                    </div>
                    {expandedTagInfoCards.has(recipe.id) && (
                      <div className="mt-2 space-y-1.5">
                        {recipe.tags.map((tag) => (
                          <button
                            key={`${tag}-info`}
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setInfoTag(tag); }}
                            className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left dark:border-gray-800 dark:bg-gray-800/60"
                          >
                            <Info className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-gray-500" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-gray-200">{tagInfo[tag].label}</p>
                              <p className="truncate text-[10px] text-slate-500 dark:text-gray-400">{tagInfo[tag].explanation}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedRecipe(recipe);
                    }}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
                  >
                    {t('meals.recipeCard.details')}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      addRecipeToDiary(recipe);
                    }}
                    className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-medium text-white"
                  >
                    {t('meals.recipeCard.addToDiary')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {peekRecipe && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setPeekRecipe(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg rounded-t-3xl bg-white pb-8 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-44 w-full overflow-hidden rounded-t-3xl">
              <img src={peekRecipe.image} alt={peekRecipe.title} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
              <button
                type="button"
                onClick={() => setPeekRecipe(null)}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-4 right-4">
                <h3 className="text-base font-semibold text-white">{peekRecipe.title}</h3>
                <p className="text-xs text-white/80">{peekRecipe.mealSlots.map((s) => s[0].toUpperCase() + s.slice(1)).join(' · ')}</p>
              </div>
            </div>
            <div className="px-4 pt-4">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-orange-50 px-3 py-2 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200">
                  <p className="text-[10px] uppercase tracking-wide opacity-70">Kcal</p>
                  <p className="mt-0.5 font-semibold">{peekRecipe.calories}</p>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                  <p className="text-[10px] uppercase tracking-wide opacity-70">{t('meals.detail.microTitle').split(' ')[0]}</p>
                  <p className="mt-0.5 font-semibold">{peekRecipe.time}</p>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                  <p className="text-[10px] uppercase tracking-wide opacity-70">{t('meals.detail.servings')}</p>
                  <p className="mt-0.5 font-semibold">{peekRecipe.servings}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { addRecipeToDiary(peekRecipe); setPeekRecipe(null); }}
                  className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white"
                >
                  {t('meals.peek.addToDiary')}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedRecipe(peekRecipe); setPeekRecipe(null); }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {t('meals.peek.seeMore')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdvancedFilters && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowAdvancedFilters(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg rounded-t-3xl bg-white px-4 pb-8 pt-4 shadow-xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('meals.advancedFilters.title')}</p>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">{t('meals.advancedFilters.sortLabel')}</p>
                <div className="relative">
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {smartSortOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setActiveSort(option.id)}
                        className={`rounded-full border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                          activeSort === option.id
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30'
                            : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-white via-white/80 to-transparent pl-6 pr-1 dark:from-gray-900 dark:via-gray-900/80">
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-gray-500" />
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-gray-500">{t('meals.advancedFilters.tagsLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTagFilter(null)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                      activeTagFilter === null
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {t('meals.tags.allTags')}
                  </button>
                  {Object.entries(tagInfo).map(([tag, info]) => {
                    const typedTag = tag as NutritionTagId;
                    const isFavoriteTag = favoriteTags.includes(tag as NutritionTagId);
                    const isActiveFilter = activeTagFilter === typedTag;
                    return (
                      <div key={tag} className="inline-flex items-center gap-1">
                        <span className={`inline-flex items-center rounded-full border text-xs font-medium transition-colors ${
                          isActiveFilter
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                            : isFavoriteTag
                            ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200'
                            : 'border-slate-200 bg-white text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          <button
                            type="button"
                            onClick={() => toggleFavoriteTag(typedTag)}
                            className="pl-2.5 pr-1 py-2"
                            aria-label={`${isFavoriteTag ? 'Fjern' : 'Legg til'} favoritt-tag ${info.label}`}
                          >
                            <Star className={`h-3.5 w-3.5 ${isFavoriteTag ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTagFilter((prev) => prev === typedTag ? null : typedTag)}
                            className="pr-2.5 py-2"
                          >
                            {info.label}
                          </button>
                        </span>
                        <button
                          type="button"
                          onClick={() => setInfoTag(typedTag)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500"
                          aria-label={`Info om ${info.label}`}
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {(activeSort !== 'recommended' || activeTagFilter) && (
                <button
                  type="button"
                  onClick={() => { setActiveSort('recommended'); setActiveTagFilter(null); }}
                  className="text-xs text-slate-400 underline underline-offset-2 dark:text-gray-500"
                >
                  Tilbakestill filtre
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {infoTag && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setInfoTag(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl border border-transparent dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tagInfo[infoTag].label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tagInfo[infoTag].explanation}</p>
              </div>
              <button onClick={() => setInfoTag(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">x</button>
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Article</p>
              <a href={tagInfo[infoTag].url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm text-orange-600"><BookOpen className="w-4 h-4" />{tagInfo[infoTag].article}</a>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-3">Supplement: {tagInfo[infoTag].supplement}</div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3">Training advice: {tagInfo[infoTag].training}</div>
            </div>
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={() => setSelectedRecipe(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-transparent dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              <img src={selectedRecipe.image} alt={selectedRecipe.title} className="w-full h-48 sm:h-56 object-cover" />
              <button
                type="button"
                onClick={() => setSelectedRecipe(null)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 text-white"
              >
                x
              </button>
              <div className="absolute left-3 bottom-3">
                <span className="inline-flex rounded-full bg-black/55 px-3 py-1 text-xs text-white">{selectedRecipe.source}</span>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-gray-100">{selectedRecipe.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-gray-400">
                <span>{selectedRecipe.calories} kcal</span>
                <span>{selectedRecipe.time}</span>
                <span>{selectedRecipe.servings} pers</span>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-2">Makro per porsjon</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 p-2">Protein: {selectedMacros?.protein ?? 0} g</div>
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-2">Karbo: {selectedMacros?.carbs ?? 0} g</div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-2">Fett: {selectedMacros?.fat ?? 0} g</div>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-2">Mikro (estimert) per porsjon</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Fiber: {selectedMicros?.fiberG ?? 0} g</div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Magnesium: {selectedMicros?.magnesiumMg ?? 0} mg</div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Jern: {selectedMicros?.ironMg ?? 0} mg</div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Kalium: {selectedMicros?.potassiumMg ?? 0} mg</div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Vitamin C: {selectedMicros?.vitaminCMg ?? 0} mg</div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-900 p-2 border border-slate-100 dark:border-gray-700 text-slate-700 dark:text-gray-300">Omega-3: {selectedMicros?.omega3G ?? 0} g</div>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-2">Ingredienser</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-gray-300">
                  {selectedIngredients.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 mb-2">Slik lager du</p>
                <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700 dark:text-gray-300">
                  {selectedSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>

              {selectedRecipe.origin === 'community' && selectedRecipe.customCaption ? (
                <div className="mt-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 p-3 text-sm">
                  {selectedRecipe.customCaption}
                </div>
              ) : null}

              {selectedRecipe.containsAllergens.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-3 text-xs">
                  Allergener: {selectedRecipe.containsAllergens.join(', ')}
                </div>
              )}

              <div className="mt-5 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    addRecipeToDiary(selectedRecipe);
                    setSelectedRecipe(null);
                  }}
                  className="flex-1 rounded-lg bg-orange-500 text-white text-sm font-medium py-2.5"
                >
                  Legg til i dagbok
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRecipe(null)}
                  className="flex-1 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 text-sm font-medium py-2.5"
                >
                  Lukk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateMealModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-transparent dark:border-gray-700">
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">Opprett måltid</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                    Lagre et standardmåltid som kan logges raskt fra både Måltider og Hjem.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateMealModal(false)}
                  className="h-9 w-9 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-200"
                >
                  x
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Navn</label>
                  <input
                    value={newMealName}
                    onChange={(event) => setNewMealName(event.target.value)}
                    placeholder="f.eks. Fast frokost"
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-800 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Måltidstype</label>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      ['breakfast', 'Frokost'],
                      ['lunch', 'Lunsj'],
                      ['dinner', 'Middag'],
                      ['snacks', 'Snacks'],
                    ] as const).map(([mealId, label]) => (
                      <button
                        key={mealId}
                        type="button"
                        onClick={() => setNewMealSlot(mealId)}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                          newMealSlot === mealId
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Kcal</label>
                    <input
                      inputMode="decimal"
                      value={newMealKcal}
                      onChange={(event) => setNewMealKcal(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Protein</label>
                    <input
                      inputMode="decimal"
                      value={newMealProtein}
                      onChange={(event) => setNewMealProtein(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Karbo</label>
                    <input
                      inputMode="decimal"
                      value={newMealCarbs}
                      onChange={(event) => setNewMealCarbs(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">Fett</label>
                    <input
                      inputMode="decimal"
                      value={newMealFat}
                      onChange={(event) => setNewMealFat(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-slate-800 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={saveCustomMeal}
                  className="flex-1 rounded-lg bg-orange-500 text-white text-sm font-medium py-2.5"
                >
                  Lagre måltid
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateMealModal(false)}
                  className="flex-1 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 text-sm font-medium py-2.5"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {diaryFeedback && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-50 rounded-full bg-gray-900 text-white text-xs px-4 py-2">
          {diaryFeedback}
        </div>
      )}
    </div>
  );
}
