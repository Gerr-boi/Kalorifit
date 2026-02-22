import { useMemo, useState } from 'react';
import { BookOpen, Clock, Flame, Sparkles, Star, Users } from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { addDays, createEmptyDayLog, startOfDay, toDateKey, type DayLog, type FoodEntry, type MealId } from '../../lib/disciplineEngine';
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

const smartSortOptions: Array<{ id: SmartSortId; label: string }> = [
  { id: 'recommended', label: 'Anbefalt for deg' },
  { id: 'goal', label: 'Matcher malet ditt' },
  { id: 'post_workout', label: 'Etter trening' },
  { id: 'evening', label: 'Kveldvennlig' },
  { id: 'gut', label: 'Tarmvennlig' },
  { id: 'high_energy', label: 'Hoy energi' },
  { id: 'anti_inflammatory', label: 'Anti-inflammatorisk' },
];

const tagInfo: Record<NutritionTagId, { label: string; explanation: string; article: string; url: string; supplement: string; training: string }> = {
  gut_health: {
    label: '#GutHealth',
    explanation: 'Fermentert mat og fiber stotter tarmfloraen.',
    article: 'Harvard: Gut microbiome basics',
    url: 'https://www.health.harvard.edu/blog/do-gut-bacteria-inhibit-weight-loss-2020012318699',
    supplement: 'Prioriter mat forst, probiotika ved behov.',
    training: 'Rolig aktivitet passer ofte ved sensitiv mage.',
  },
  high_protein: {
    label: '#HighProtein',
    explanation: 'Protein hjelper metthet og muskelvedlikehold.',
    article: 'NIH: Protein and body composition',
    url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7539343/',
    supplement: 'Proteinpulver kan vaere praktisk.',
    training: 'Styrketrening + jevnt proteininntak fungerer best.',
  },
  low_inflammation: {
    label: '#LowInflammation',
    explanation: 'Omega-3, polyfenoler og hel mat kan dempe inflammasjon.',
    article: 'Cleveland Clinic: Anti-inflammatory eating',
    url: 'https://health.clevelandclinic.org/anti-inflammatory-diet',
    supplement: 'Omega-3 kan vurderes ved lavt fiskinntak.',
    training: 'Legg inn restitusjon etter harde okter.',
  },
  brain_fuel: {
    label: '#BrainFuel',
    explanation: 'Jevn energi og sunt fett stotter fokus.',
    article: 'Mayo Clinic: Brain food',
    url: 'https://www.mayoclinic.org/healthy-lifestyle/nutrition-and-healthy-eating/in-depth/brain-food/art-20048351',
    supplement: 'Magnesium er aktuelt ved hoy belastning.',
    training: 'Unnga for lange perioder uten mat.',
  },
  hormone_support: {
    label: '#HormoneSupport',
    explanation: 'Nok energi og sunt fett stotter hormonbalanse.',
    article: 'Johns Hopkins: Hormones and weight',
    url: 'https://www.hopkinsmedicine.org/health/wellness-and-prevention/hormones-and-weight-loss',
    supplement: 'Sjekk vitamin D ved mistanke om lavstatus.',
    training: 'Periodiser intensitet over uken.',
  },
  fiber_focus: {
    label: '#FiberFocus',
    explanation: 'Fiber stotter fordoyelse og metthet.',
    article: 'Cleveland Clinic: High-fiber foods',
    url: 'https://health.clevelandclinic.org/high-fiber-foods',
    supplement: 'Psyllium kan vaere nyttig ved lavt inntak.',
    training: 'Fordel fiber utover dagen.',
  },
  recovery: {
    label: '#Recovery',
    explanation: 'Protein + vaeske + antioksidanter stotter restitusjon.',
    article: 'ACSM: Recovery nutrition',
    url: 'https://www.acsm.org/all-blog-posts/certification-blog/acsm-certified-blog/2020/07/31/recovery-nutrition',
    supplement: 'Kreatin kan vurderes for styrkeidrett.',
    training: 'Spis innen 1-2 timer etter hard okt.',
  },
};

const recipes = mealRecipes;

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

export default function MealsScreen() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['r1', 'r4']));
  const [activeSort, setActiveSort] = useState<SmartSortId>('recommended');
  const [activeMealFilter, setActiveMealFilter] = useState<MealSlot>('alle');
  const [activeTag, setActiveTag] = useState<NutritionTagId | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<MealRecipe | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [diaryFeedback, setDiaryFeedback] = useState<string | null>(null);

  const [profilePrefs] = useLocalStorageState<ProfilePrefs>('profile', EMPTY_PROFILE_PREFS);
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [workouts] = useLocalStorageState<Array<{ dateKey: string; caloriesBurned: number }>>('home.workoutSessions.v1', EMPTY_WORKOUTS);
  const [, setLastLoggedFood] = useLocalStorageState<FoodEntry | null>('home.lastLoggedFood.v1', null);

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

  const poorSleepProxy = todayLog.waterMl < 800 && todaySignals.protein < 60;
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
    ? 'Denne uken mangler du fermentert mat. Tarmvennlige forslag prioriteres.'
    : weekSignals.fiber < 14
      ? 'Denne uken er fiberinntaket lavt. Flere fiberrike oppskrifter vises.'
      : weekSignals.protein < 650
        ? 'Protein er under ukesmal. Hoyprotein-oppskrifter er frontet.'
        : 'Bra flyt denne uken. Vi holder variasjon og restitusjon i fokus.';

  const bannerTitle = profile.goalStrategy === 'gut_health'
    ? 'Bra for tarmen din i dag'
    : hardWorkoutToday
      ? 'Restitusjonsmaltider etter hard okt'
      : poorSleepProxy
        ? 'Energi-stotte for en krevende dag'
        : 'Maltider tilpasset profilen din';
  const bannerSubtitle = profile.goalStrategy === 'gut_health'
    ? 'Mikrobiomet ditt trenger fermentert mat, fiberbredde og polyfenoler.'
    : 'Sortering og forslag er justert etter malet ditt og dagens signaler.';

  const recommendationBlocks = useMemo(() => {
    const blocks: Array<{ id: string; title: string; desc: string; match: (recipe: MealRecipe) => boolean }> = [];
    if (hardWorkoutToday) blocks.push({ id: 'recovery', title: 'Restitusjonsmaltider i dag', desc: 'Basert pa hard treningsdag.', match: (r) => r.tags.includes('recovery') || r.signals.highProtein });
    if (poorSleepProxy) blocks.push({ id: 'energy', title: 'Energi-stottende maltider', desc: 'Jevn energi ved lav restitusjon.', match: (r) => r.signals.highEnergy || r.signals.magnesiumRich });
    if (stressProxy) blocks.push({ id: 'calming', title: 'Magnesiumrike valg', desc: 'Nyttig ved hoy belastning.', match: (r) => r.signals.magnesiumRich || r.signals.antiInflammatory });
    if (lowFiberToday) blocks.push({ id: 'fiber', title: 'Du er lav pa fiber i dag', desc: '3 raske fiberforslag.', match: (r) => r.signals.fiber >= 7 });
    if (profile.goalStrategy === 'gut_health') blocks.push({ id: 'gut', title: 'Tarmmodus aktiv', desc: 'Fermentert og fiberrik mat prioriteres.', match: (r) => r.signals.fermented || r.sortContexts.includes('gut') });
    return blocks.slice(0, 4);
  }, [hardWorkoutToday, lowFiberToday, poorSleepProxy, profile.goalStrategy, stressProxy]);

  const filteredRecipes = useMemo(() => {
    const blocked = new Set([...(profilePrefs.allergies ?? []), ...(profilePrefs.intolerances ?? [])].map((v) => v.toLowerCase()));
    const profileDietFilter = profile.dietStyle === 'vegan' ? 'vegan' : profile.dietStyle === 'vegetarian' ? 'vegetarian' : 'alle';

    const eligible = recipes.filter((recipe) => {
      if (recipe.containsAllergens.some((a) => blocked.has(a.toLowerCase()))) return false;
      if (activeMealFilter !== 'alle' && !recipe.mealSlots.includes(activeMealFilter)) return false;
      if (profileDietFilter === 'vegan' && !recipe.dietStyles.includes('vegan')) return false;
      if (profileDietFilter === 'vegetarian' && !(recipe.dietStyles.includes('vegetarian') || recipe.dietStyles.includes('vegan'))) return false;
      return true;
    });
    const scoped = showFavoritesOnly ? eligible.filter((recipe) => favorites.has(recipe.id)) : eligible;
    return [...scoped].sort((a, b) => {
      const score = (r: MealRecipe) => {
        let s = r.rating;
        if (r.sortContexts.includes(activeSort)) s += 7;
        if (r.dietStyles.includes(profile.dietStyle)) s += 5;
        if (r.goalCategories.includes(profile.goalCategory)) s += 5;
        if (r.goalStrategies.includes(profile.goalStrategy)) s += 4;
        if (hardWorkoutToday && r.tags.includes('recovery')) s += 4;
        if (lowFiberToday && r.signals.fiber >= 7) s += 3;
        if (activeSort === 'goal' && r.goalCategories.includes(profile.goalCategory)) s += 3;
        if (activeSort === 'post_workout' && r.signals.highProtein) s += 3;
        if (activeSort === 'evening' && r.signals.eveningFriendly) s += 3;
        if (activeSort === 'gut' && (r.signals.fermented || r.signals.fiber >= 6)) s += 4;
        if (activeSort === 'high_energy' && r.signals.highEnergy) s += 4;
        if (activeSort === 'anti_inflammatory' && r.signals.antiInflammatory) s += 4;
        if (activeSort === 'recommended') {
          const title = r.title.toLowerCase();
          const keywordMatches = Array.from(recentMealKeywords).filter((token) => title.includes(token)).length;
          s += Math.min(keywordMatches, 2) * 1.5;
          if (favorites.has(r.id)) s += 1;
        }
        return s;
      };
      return score(b) - score(a);
    });
  }, [activeMealFilter, activeSort, favorites, hardWorkoutToday, lowFiberToday, profile.dietStyle, profile.goalCategory, profile.goalStrategy, profilePrefs.allergies, profilePrefs.intolerances, recentMealKeywords, showFavoritesOnly]);

  const blocksWithItems = useMemo(() => recommendationBlocks.map((block) => ({ ...block, items: filteredRecipes.filter(block.match).slice(0, 3) })), [filteredRecipes, recommendationBlocks]);
  const activeSortLabel = smartSortOptions.find((item) => item.id === activeSort)?.label ?? 'Anbefalt for deg';
  const mealFilterLabel = activeMealFilter === 'alle' ? 'For deg' : activeMealFilter[0].toUpperCase() + activeMealFilter.slice(1);
  const selectedMacros = selectedRecipe ? estimateMacros(selectedRecipe) : null;
  const selectedMicros = selectedRecipe ? estimateMicros(selectedRecipe) : null;
  const selectedIngredients = selectedRecipe ? getRecipeIngredients(selectedRecipe) : [];
  const selectedSteps = selectedRecipe ? getRecipeSteps(selectedRecipe) : [];

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

  function getRecipeIngredients(recipe: MealRecipe) {
    const lowerTitle = recipe.title.toLowerCase();
    const slotDefaults: Record<Exclude<MealSlot, 'alle'>, string[]> = {
      frokost: ['Havregryn 40 g', 'Baer 100 g'],
      lunsj: ['Blandet salat 80 g', 'Olivenolje 1 ss'],
      middag: ['Sesonggronnsaker 150 g', 'Urter og krydder'],
      snacks: ['Frukt 1 stk', 'Nodder 20 g'],
    };
    const keywordIngredients: Array<[string, string]> = [
      ['kimchi', 'Kimchi 60 g'],
      ['laks', 'Laks 150 g'],
      ['kylling', 'Kyllingfilet 150 g'],
      ['kalkun', 'Kalkun 150 g'],
      ['tofu', 'Tofu 180 g'],
      ['linse', 'Linser 140 g kokt'],
      ['kiker', 'Kikerter 120 g kokt'],
      ['bonn', 'Bonner 120 g kokt'],
      ['ris', 'Kokt ris 150 g'],
      ['quinoa', 'Quinoa 140 g kokt'],
      ['avocado', 'Avokado 1/2 stk'],
      ['spinat', 'Spinat 70 g'],
      ['broccoli', 'Brokkoli 120 g'],
      ['kefir', 'Kefir 2 dl'],
      ['yoghurt', 'Gresk yoghurt 170 g'],
      ['egg', 'Egg 2 stk'],
      ['omelett', 'Egg 2 stk'],
      ['wrap', 'Fullkornstortilla 1 stk'],
      ['pasta', 'Fullkornspasta 90 g ukokt'],
      ['soba', 'Sobanudler 80 g ukokt'],
      ['feta', 'Feta 40 g'],
      ['biff', 'Mager biff 140 g'],
      ['tunfisk', 'Tunfisk 150 g'],
      ['reker', 'Reker 150 g'],
    ];
    const inferred = keywordIngredients.filter(([k]) => lowerTitle.includes(k)).map(([, v]) => v);
    const slot = recipe.mealSlots[0] ?? 'lunsj';
    const combined = [...inferred, ...slotDefaults[slot], 'Sitron/eddik + salt og pepper'];
    return Array.from(new Set(combined)).slice(0, 8);
  }

  function getRecipeSteps(recipe: MealRecipe) {
    const slot = recipe.mealSlots[0] ?? 'lunsj';
    const base: Record<Exclude<MealSlot, 'alle'>, string[]> = {
      frokost: [
        'Bland hovedingrediensene i en bolle.',
        'Topp med frukt/baer og litt nodder eller frø.',
        'Server med en proteinkilde for bedre metthet.',
      ],
      lunsj: [
        'Stek eller varm opp proteinkilden.',
        'Sett sammen med gronnsaker og karbohydratkilde.',
        'Smak til med syre, urter og litt sunt fett.',
      ],
      middag: [
        'Forvarm panne eller ovn og klargjor alle ingredienser.',
        'Tilbered protein, deretter gronnsaker til de er møre.',
        'Server med valgfri karbohydratkilde og frisk topping.',
      ],
      snacks: [
        'Kutt og porsjoner ingrediensene.',
        'Kombiner en rask proteinkilde med frukt/gront.',
        'Smak til og server med en gang.',
      ],
    };
    if (recipe.signals.fermented) return [...base[slot], 'Legg til fermentert topping rett for servering.'];
    return base[slot];
  }

  function addRecipeToDiary(recipe: MealRecipe) {
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
    setDiaryFeedback(`${recipe.title} lagt til i dagbok.`);
    window.setTimeout(() => setDiaryFeedback(null), 2400);
  }

  return (
    <div className="screen">
      <div className="relative h-56">
        <img src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=900&h=420&fit=crop" alt="Personalized meals" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <h1 className="text-2xl font-bold leading-tight">{bannerTitle}</h1>
          <p className="text-sm text-white/85 mt-1">{bannerSubtitle}</p>
          <p className="text-xs text-cyan-200 mt-2">{weeklyInsight}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm border border-white/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{mealFilterLabel} - {activeSortLabel}</span>
          </div>
        </div>
      </div>

      <div className="sticky top-0 bg-white dark:bg-gray-900 z-20 border-b border-gray-200 dark:border-gray-700">
        <div className="scroll-container py-3">
          {(['alle', 'frokost', 'lunsj', 'middag', 'snacks'] as const).map((slot) => (
            <button key={slot} onClick={() => setActiveMealFilter(slot)} className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${activeMealFilter === slot ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              {slot === 'alle' ? 'For deg' : slot[0].toUpperCase() + slot.slice(1)}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
          {smartSortOptions.map((option) => (
            <button key={option.id} onClick={() => setActiveSort(option.id)} className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${activeSort === option.id ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {blocksWithItems.length > 0 && (
        <div className="px-4 py-4 space-y-3">
          {blocksWithItems.map((block, idx) => (
            <div
              key={block.id}
              className={`rounded-2xl border p-3 ${
                idx % 2 === 0
                  ? 'bg-gradient-to-br from-slate-50 to-white border-slate-100 dark:from-gray-800 dark:to-gray-800 dark:border-gray-700'
                  : 'bg-gradient-to-br from-orange-50 to-white border-orange-100 dark:from-gray-800 dark:to-gray-800 dark:border-gray-700'
              }`}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{block.title}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">{block.desc}</p>
              <div className="grid grid-cols-1 gap-2">
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
                    <img src={recipe.image} alt={recipe.title} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{recipe.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{recipe.calories} kcal - {recipe.time} - trykk for detaljer</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addRecipeToDiary(recipe);
                      }}
                      className="ml-auto shrink-0 rounded-lg bg-orange-500 text-white text-xs font-medium px-3 py-1.5"
                    >
                      Legg til
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{filteredRecipes.length} oppskrifter i smart visning</p>
        <button
          onClick={() => setShowFavoritesOnly((prev) => !prev)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${showFavoritesOnly ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
        >
          {showFavoritesOnly ? 'Viser favoritter' : 'Kun favoritter'}
        </button>
      </div>

      <div className="space-y-4 pb-28">
        {filteredRecipes.length === 0 && (
          <div className="mx-4 rounded-2xl border border-dashed border-slate-300 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 p-5 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-100">Ingen oppskrifter matcher akkurat na</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Bytt maltype, sortering eller skru av filter for favoritter.</p>
          </div>
        )}
        {filteredRecipes.map((recipe) => {
          const recommendationReasons = [
            recipe.goalCategories.includes(profile.goalCategory) ? 'Matcher mal' : null,
            recipe.dietStyles.includes(profile.dietStyle) ? 'Passer koststil' : null,
            hardWorkoutToday && recipe.tags.includes('recovery') ? 'Bra etter trening' : null,
            lowFiberToday && recipe.signals.fiber >= 7 ? 'Hoy fiber i dag' : null,
            activeSort === 'gut' && (recipe.signals.fermented || recipe.signals.fiber >= 6) ? 'Tarmvennlig' : null,
            activeSort === 'evening' && recipe.signals.eveningFriendly ? 'Kveldvennlig' : null,
          ].filter(Boolean).slice(0, 3) as string[];
          return (
            <div key={recipe.id} className="recipe-card cursor-pointer" onClick={() => setSelectedRecipe(recipe)}>
              <div className="relative">
                <img src={recipe.image} alt={recipe.title} className="recipe-image" />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setFavorites((prev) => (prev.has(recipe.id) ? new Set([...prev].filter((id) => id !== recipe.id)) : new Set(prev).add(recipe.id)));
                  }}
                  className="absolute top-3 right-3 w-10 h-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur rounded-full flex items-center justify-center shadow-md"
                >
                  <Star className={`w-5 h-5 ${favorites.has(recipe.id) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} />
                </button>
                <div className="absolute bottom-3 left-3 flex gap-2">
                  <span className="recipe-tag bg-black/50 text-white backdrop-blur">{recipe.source}</span>
                </div>
              </div>

              <div className="recipe-content">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-base mb-2 line-clamp-2">{recipe.title}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <div className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" /><span>{recipe.calories} kcal</span></div>
                  <div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /><span>{recipe.time}</span></div>
                  <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /><span>{recipe.servings} pers</span></div>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-2 mb-3">
                  <p className="text-[11px] text-slate-600 dark:text-gray-300 mb-1">Hvorfor anbefalt:</p>
                  <div className="flex flex-wrap gap-1">
                    {(recommendationReasons.length > 0 ? recommendationReasons : ['Variasjon i planen']).map((reason) => (
                      <span key={reason} className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300">
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {recipe.tags.map((tag) => (
                    <button key={tag} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full" onClick={(event) => { event.stopPropagation(); setActiveTag(tag); }}>
                      {tagInfo[tag].label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Klar pa {recipe.time}</div>
                  <div className="flex items-center gap-1 text-orange-500"><Star className="w-4 h-4 fill-current" /><span className="text-sm font-medium">{recipe.rating}</span><span className="text-xs text-gray-400 dark:text-gray-500">({recipe.reviews})</span></div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRecipe(recipe);
                  }}
                  className="mt-3 w-full rounded-lg bg-slate-800 text-white text-sm font-medium py-2"
                >
                  Se detaljer
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    addRecipeToDiary(recipe);
                  }}
                  className="mt-2 w-full rounded-lg bg-orange-500 text-white text-sm font-medium py-2"
                >
                  Legg til i dagbok
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {activeTag && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl border border-transparent dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tagInfo[activeTag].label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tagInfo[activeTag].explanation}</p>
              </div>
              <button onClick={() => setActiveTag(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">x</button>
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">Article</p>
              <a href={tagInfo[activeTag].url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm text-orange-600"><BookOpen className="w-4 h-4" />{tagInfo[activeTag].article}</a>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-3">Supplement: {tagInfo[activeTag].supplement}</div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-3">Training advice: {tagInfo[activeTag].training}</div>
            </div>
          </div>
        </div>
      )}

      {selectedRecipe && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-transparent dark:border-gray-700">
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

      {diaryFeedback && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-50 rounded-full bg-gray-900 text-white text-xs px-4 py-2">
          {diaryFeedback}
        </div>
      )}
    </div>
  );
}
