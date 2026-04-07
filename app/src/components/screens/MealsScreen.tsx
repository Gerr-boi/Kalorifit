import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock, Flame, Plus, Search, Sparkles, Star, Users } from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { addDays, createEmptyDayLog, startOfDay, toDateKey, type DayLog, type FoodEntry, type MealId, type Micros } from '../../lib/disciplineEngine';
import FoodSearchModal from '../ui/FoodSearchModal';
import type { FoodSearchResult } from '../../lib/foodSearch';
import { normalizeNutritionProfile, type DietStyle, type GoalCategory, type GoalStrategy } from '../../lib/nutritionPlanner';

type SmartSortId = 'recommended' | 'goal' | 'post_workout' | 'evening' | 'gut' | 'high_energy' | 'anti_inflammatory';
type NutritionTagId = 'gut_health' | 'high_protein' | 'low_inflammation' | 'brain_fuel' | 'hormone_support' | 'fiber_focus' | 'recovery';
type MealSlot = 'alle' | 'frokost' | 'lunsj' | 'middag' | 'snacks';

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

type Recipe = {
  id: string;
  title: string;
  image: string;
  ingredients: string[];
  calories: number;
  time: string;
  rating: number;
  reviews: number;
  source: string;
  servings: number;
  mealSlots: Array<Exclude<MealSlot, 'alle'>>;
  tags: NutritionTagId[];
  sortContexts: SmartSortId[];
  dietStyles: DietStyle[];
  goalCategories: GoalCategory[];
  goalStrategies: GoalStrategy[];
  containsAllergens: string[];
  signals: {
    fiber: number;
    fermented: boolean;
    antiInflammatory: boolean;
    highProtein: boolean;
    eveningFriendly: boolean;
    highEnergy: boolean;
    magnesiumRich: boolean;
  };
};

type CustomMealForm = {
  title: string;
  mealSlot: Exclude<MealSlot, 'alle'>;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
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

const recipes: Recipe[] = [
  {
    id: 'r1',
    title: 'Kimchi bowl med laks og ris',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&h=420&fit=crop',
    ingredients: ['Laks', 'Kimchi', 'Jasminris', 'Agurk', 'Gulrot', 'Sesam'],
    calories: 540,
    time: '20 min',
    rating: 4.8,
    reviews: 510,
    source: 'Coop Mega',
    servings: 2,
    mealSlots: ['lunsj', 'middag'],
    tags: ['gut_health', 'recovery', 'low_inflammation'],
    sortContexts: ['recommended', 'post_workout', 'gut', 'anti_inflammatory'],
    dietStyles: ['standard_balanced', 'mediterranean', 'high_protein', 'high_carb_performance'],
    goalCategories: ['health', 'muscle_gain', 'performance', 'recomp'],
    goalStrategies: ['gut_health', 'strength_focus', 'hybrid_athlete', 'blood_markers'],
    containsAllergens: ['fish'],
    signals: { fiber: 5, fermented: true, antiInflammatory: true, highProtein: true, eveningFriendly: false, highEnergy: true, magnesiumRich: false },
  },
  {
    id: 'r2',
    title: 'Linsegryte med rotgronnsaker',
    image: 'https://images.unsplash.com/photo-1547592166-23acbe346499?w=700&h=420&fit=crop',
    ingredients: ['Rode linser', 'Lok', 'Gulrot', 'Selleri', 'Hvitlok', 'Tomat'],
    calories: 410,
    time: '35 min',
    rating: 4.5,
    reviews: 280,
    source: 'REMA 1000',
    servings: 3,
    mealSlots: ['lunsj', 'middag'],
    tags: ['gut_health', 'fiber_focus', 'hormone_support'],
    sortContexts: ['recommended', 'gut', 'anti_inflammatory', 'evening'],
    dietStyles: ['vegan', 'vegetarian', 'mediterranean', 'standard_balanced'],
    goalCategories: ['health', 'fat_loss', 'recomp'],
    goalStrategies: ['gut_health', 'blood_markers', 'hormonal_balance', 'fat_reduction_no_scale'],
    containsAllergens: [],
    signals: { fiber: 11, fermented: false, antiInflammatory: true, highProtein: false, eveningFriendly: true, highEnergy: false, magnesiumRich: true },
  },
  {
    id: 'r3',
    title: 'Kyllingwrap med avocado og spinat',
    image: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=700&h=420&fit=crop',
    ingredients: ['Fullkornswrap', 'Kyllingfilet', 'Avocado', 'Spinat', 'Yoghurt', 'Lime'],
    calories: 460,
    time: '15 min',
    rating: 4.6,
    reviews: 441,
    source: 'KIWI',
    servings: 2,
    mealSlots: ['lunsj'],
    tags: ['high_protein', 'brain_fuel', 'recovery'],
    sortContexts: ['recommended', 'goal', 'post_workout', 'high_energy'],
    dietStyles: ['high_protein', 'standard_balanced', 'flexible_iifym', 'high_carb_performance'],
    goalCategories: ['muscle_gain', 'recomp', 'performance', 'fat_loss'],
    goalStrategies: ['strength_focus', 'standard_bulk', 'hybrid_athlete', 'high_protein_maintenance'],
    containsAllergens: ['gluten'],
    signals: { fiber: 6, fermented: false, antiInflammatory: false, highProtein: true, eveningFriendly: false, highEnergy: true, magnesiumRich: true },
  },
  {
    id: 'r4',
    title: 'Ovnslaks med asparges og quinoa',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=700&h=420&fit=crop',
    ingredients: ['Laks', 'Quinoa', 'Asparges', 'Sitron', 'Olivenolje', 'Dill'],
    calories: 500,
    time: '24 min',
    rating: 4.9,
    reviews: 903,
    source: 'Meny',
    servings: 2,
    mealSlots: ['middag'],
    tags: ['high_protein', 'low_inflammation', 'brain_fuel'],
    sortContexts: ['recommended', 'goal', 'anti_inflammatory', 'post_workout'],
    dietStyles: ['mediterranean', 'high_protein', 'standard_balanced', 'keto'],
    goalCategories: ['performance', 'muscle_gain', 'health', 'recomp'],
    goalStrategies: ['strength_focus', 'endurance_focus', 'blood_markers', 'hybrid_athlete'],
    containsAllergens: ['fish'],
    signals: { fiber: 4, fermented: false, antiInflammatory: true, highProtein: true, eveningFriendly: true, highEnergy: false, magnesiumRich: false },
  },
  {
    id: 'r5',
    title: 'Overnight oats med chia og kefir',
    image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=700&h=420&fit=crop',
    ingredients: ['Havregryn', 'Kefir', 'Chiafro', 'Blabaer', 'Kanel', 'Mandler'],
    calories: 370,
    time: '10 min',
    rating: 4.6,
    reviews: 260,
    source: 'REMA 1000',
    servings: 1,
    mealSlots: ['frokost'],
    tags: ['gut_health', 'fiber_focus', 'brain_fuel'],
    sortContexts: ['recommended', 'gut', 'high_energy'],
    dietStyles: ['standard_balanced', 'vegetarian', 'mediterranean', 'high_carb_performance'],
    goalCategories: ['health', 'performance', 'fat_loss'],
    goalStrategies: ['gut_health', 'stable_energy', 'endurance_focus'],
    containsAllergens: ['milk'],
    signals: { fiber: 9, fermented: true, antiInflammatory: true, highProtein: false, eveningFriendly: false, highEnergy: true, magnesiumRich: true },
  },
  {
    id: 'r6',
    title: 'Kylling, ris og kimchi recovery bowl',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&h=420&fit=crop',
    ingredients: ['Kyllinglarfilet', 'Basmatiris', 'Kimchi', 'Edamame', 'Varlok', 'Sesam'],
    calories: 560,
    time: '22 min',
    rating: 4.8,
    reviews: 478,
    source: 'KIWI',
    servings: 2,
    mealSlots: ['lunsj', 'middag'],
    tags: ['recovery', 'high_protein', 'gut_health'],
    sortContexts: ['post_workout', 'recommended', 'high_energy', 'gut'],
    dietStyles: ['high_protein', 'standard_balanced', 'high_carb_performance', 'flexible_iifym'],
    goalCategories: ['muscle_gain', 'performance', 'recomp'],
    goalStrategies: ['strength_focus', 'hybrid_athlete', 'endurance_focus'],
    containsAllergens: [],
    signals: { fiber: 4, fermented: true, antiInflammatory: false, highProtein: true, eveningFriendly: true, highEnergy: true, magnesiumRich: false },
  },
  {
    id: 'r7',
    title: 'Torsk med soyaglaserte gronnsaker',
    image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=700&h=420&fit=crop',
    ingredients: ['Torsk', 'Brokkoli', 'Paprika', 'Sopp', 'Soyasaus', 'Ingefaar'],
    calories: 430,
    time: '26 min',
    rating: 4.7,
    reviews: 364,
    source: 'Meny',
    servings: 2,
    mealSlots: ['middag'],
    tags: ['low_inflammation', 'recovery', 'brain_fuel'],
    sortContexts: ['recommended', 'goal', 'anti_inflammatory', 'evening'],
    dietStyles: ['standard_balanced', 'mediterranean', 'high_protein'],
    goalCategories: ['health', 'performance', 'recomp', 'fat_loss'],
    goalStrategies: ['blood_markers', 'endurance_focus', 'stable_energy'],
    containsAllergens: ['fish', 'soy'],
    signals: { fiber: 6, fermented: false, antiInflammatory: true, highProtein: true, eveningFriendly: true, highEnergy: false, magnesiumRich: false },
  },
  {
    id: 'r8',
    title: 'Yoghurtbolle med granola og bær',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=700&h=420&fit=crop',
    ingredients: ['Gresk yoghurt', 'Granola', 'Bringebaer', 'Banan', 'Gresskarkjerner', 'Honning'],
    calories: 390,
    time: '8 min',
    rating: 4.5,
    reviews: 197,
    source: 'Coop Mega',
    servings: 1,
    mealSlots: ['frokost', 'snacks'],
    tags: ['brain_fuel', 'fiber_focus'],
    sortContexts: ['recommended', 'high_energy'],
    dietStyles: ['standard_balanced', 'vegetarian', 'high_carb_performance'],
    goalCategories: ['health', 'performance', 'fat_loss'],
    goalStrategies: ['stable_energy', 'endurance_focus', 'fat_reduction_no_scale'],
    containsAllergens: ['milk', 'nuts'],
    signals: { fiber: 7, fermented: false, antiInflammatory: false, highProtein: false, eveningFriendly: false, highEnergy: true, magnesiumRich: true },
  },
  {
    id: 'r9',
    title: 'Tempeh wok med sobanudler',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=700&h=420&fit=crop',
    ingredients: ['Tempeh', 'Sobanudler', 'Pak choi', 'Gulrot', 'Sesamolje', 'Lime'],
    calories: 520,
    time: '18 min',
    rating: 4.6,
    reviews: 286,
    source: 'REMA 1000',
    servings: 2,
    mealSlots: ['lunsj', 'middag'],
    tags: ['gut_health', 'brain_fuel', 'fiber_focus'],
    sortContexts: ['recommended', 'gut', 'high_energy', 'anti_inflammatory'],
    dietStyles: ['vegan', 'vegetarian', 'standard_balanced', 'high_carb_performance'],
    goalCategories: ['health', 'performance', 'recomp'],
    goalStrategies: ['gut_health', 'hybrid_athlete', 'endurance_focus'],
    containsAllergens: ['soy', 'gluten'],
    signals: { fiber: 10, fermented: true, antiInflammatory: true, highProtein: false, eveningFriendly: true, highEnergy: true, magnesiumRich: true },
  },
  {
    id: 'r10',
    title: 'Eggemuffins med cottage cheese',
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=700&h=420&fit=crop',
    ingredients: ['Egg', 'Cottage cheese', 'Spinat', 'Paprika', 'Varlok', 'Sort pepper'],
    calories: 320,
    time: '14 min',
    rating: 4.4,
    reviews: 141,
    source: 'KIWI',
    servings: 2,
    mealSlots: ['frokost', 'lunsj'],
    tags: ['high_protein', 'recovery'],
    sortContexts: ['recommended', 'goal', 'post_workout'],
    dietStyles: ['high_protein', 'standard_balanced', 'keto'],
    goalCategories: ['muscle_gain', 'fat_loss', 'recomp'],
    goalStrategies: ['strength_focus', 'high_protein_maintenance', 'fat_reduction_no_scale'],
    containsAllergens: ['egg', 'milk'],
    signals: { fiber: 2, fermented: false, antiInflammatory: false, highProtein: true, eveningFriendly: true, highEnergy: false, magnesiumRich: false },
  },
];

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

function hashToRange(seed: string, min: number, max: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const normalized = Math.abs(hash % 10000) / 10000;
  return Math.round(min + normalized * (max - min));
}

export default function MealsScreen() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['r1', 'r4']));
  const [activeSort, setActiveSort] = useState<SmartSortId>('recommended');
  const [activeMealFilter, setActiveMealFilter] = useState<MealSlot>('alle');
  const [activeTag, setActiveTag] = useState<NutritionTagId | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [diaryFeedback, setDiaryFeedback] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [customMealOpen, setCustomMealOpen] = useState(false);
  const [customMealForm, setCustomMealForm] = useState<CustomMealForm>({
    title: '',
    mealSlot: 'middag',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  const [foodSearchOpen, setFoodSearchOpen] = useState(false);
  const [pendingMicros, setPendingMicros] = useState<Micros | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const [profilePrefs] = useLocalStorageState<ProfilePrefs>('profile', {});
  const [logsByDate, setLogsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', {});
  const [workouts] = useLocalStorageState<Array<{ dateKey: string; caloriesBurned: number }>>('home.workoutSessions.v1', []);
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
  const recipeIdByTitle = useMemo(
    () => new Map(recipes.map((recipe) => [recipe.title.toLowerCase(), recipe.id])),
    [],
  );

  const recipeUsage = useMemo(() => {
    const usage: Record<string, { count: number; days: number }> = {};
    Object.entries(logsByDate).forEach(([, log]) => {
      const seenToday = new Set<string>();
      Object.values(log.meals)
        .flat()
        .forEach((item) => {
          const recipeId = recipeIdByTitle.get(item.name.toLowerCase());
          if (!recipeId) return;
          usage[recipeId] ??= { count: 0, days: 0 };
          usage[recipeId].count += 1;
          if (!seenToday.has(recipeId)) {
            seenToday.add(recipeId);
            usage[recipeId].days += 1;
          }
        });
    });
    return usage;
  }, [logsByDate, recipeIdByTitle]);
  const selectedRecipeMacros = useMemo(() => (selectedRecipe ? estimateMacros(selectedRecipe) : null), [selectedRecipe]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

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
    const blocks: Array<{ id: string; title: string; desc: string; match: (recipe: Recipe) => boolean }> = [];
    if (hardWorkoutToday) blocks.push({ id: 'recovery', title: 'Restitusjonsmaltider i dag', desc: 'Basert pa hard treningsdag.', match: (r) => r.tags.includes('recovery') || r.signals.highProtein });
    if (poorSleepProxy) blocks.push({ id: 'energy', title: 'Energi-stottende maltider', desc: 'Jevn energi ved lav restitusjon.', match: (r) => r.signals.highEnergy || r.signals.magnesiumRich });
    if (stressProxy) blocks.push({ id: 'calming', title: 'Magnesiumrike valg', desc: 'Nyttig ved hoy belastning.', match: (r) => r.signals.magnesiumRich || r.signals.antiInflammatory });
    if (lowFiberToday) blocks.push({ id: 'fiber', title: 'Du er lav pa fiber i dag', desc: '3 raske fiberforslag.', match: (r) => r.signals.fiber >= 7 });
    if (profile.goalStrategy === 'gut_health') blocks.push({ id: 'gut', title: 'Tarmmodus aktiv', desc: 'Fermentert og fiberrik mat prioriteres.', match: (r) => r.signals.fermented || r.sortContexts.includes('gut') });
    return blocks.slice(0, 4);
  }, [hardWorkoutToday, lowFiberToday, poorSleepProxy, profile.goalStrategy, stressProxy]);

  const filteredRecipes = useMemo(() => {
    const blocked = new Set([...(profilePrefs.allergies ?? []), ...(profilePrefs.intolerances ?? [])].map((v) => v.toLowerCase()));
    const eligible = recipes.filter((recipe) => {
      if (recipe.containsAllergens.some((a) => blocked.has(a.toLowerCase()))) return false;
      if (activeMealFilter !== 'alle' && !recipe.mealSlots.includes(activeMealFilter)) return false;
      return true;
    });
    const scoped = showFavoritesOnly ? eligible.filter((recipe) => favorites.has(recipe.id)) : eligible;
    return [...scoped].sort((a, b) => {
      const score = (r: Recipe) => {
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
        s += hashToRange(`${todayKey}:${activeSort}:${r.id}`, 0, 30) / 100;
        return s;
      };
      return score(b) - score(a);
    });
  }, [activeMealFilter, activeSort, favorites, hardWorkoutToday, lowFiberToday, profile.dietStyle, profile.goalCategory, profile.goalStrategy, profilePrefs.allergies, profilePrefs.intolerances, showFavoritesOnly, todayKey]);

  const blocksWithItems = useMemo(() => recommendationBlocks.map((block) => ({ ...block, items: filteredRecipes.filter(block.match).slice(0, 3) })), [filteredRecipes, recommendationBlocks]);
  const activeSortLabel = smartSortOptions.find((item) => item.id === activeSort)?.label ?? 'Anbefalt for deg';
  const mealFilterLabel = activeMealFilter === 'alle' ? 'For deg' : activeMealFilter[0].toUpperCase() + activeMealFilter.slice(1);

  useEffect(() => {
    if (!customMealOpen) return;
    setCustomMealForm((prev) => ({
      ...prev,
      mealSlot: activeMealFilter === 'alle' ? prev.mealSlot : activeMealFilter,
    }));
  }, [activeMealFilter, customMealOpen]);

  function toMealId(slot: Exclude<MealSlot, 'alle'>): MealId {
    if (slot === 'frokost') return 'breakfast';
    if (slot === 'lunsj') return 'lunch';
    if (slot === 'middag') return 'dinner';
    return 'snacks';
  }

  function getTargetMealId(recipe: Recipe): MealId {
    if (activeMealFilter !== 'alle') return toMealId(activeMealFilter);
    const hour = new Date().getHours();
    if (hour < 11 && recipe.mealSlots.includes('frokost')) return 'breakfast';
    if (hour < 16 && recipe.mealSlots.includes('lunsj')) return 'lunch';
    if (hour < 21 && recipe.mealSlots.includes('middag')) return 'dinner';
    const firstSlot = recipe.mealSlots[0] ?? 'snacks';
    return toMealId(firstSlot);
  }

  function estimateMacros(recipe: Recipe) {
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

  function showDiaryToast(message: string) {
    setDiaryFeedback(message);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setDiaryFeedback(null), 2400);
  }

  function addRecipeToDiary(recipe: Recipe) {
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
    showDiaryToast(`${recipe.title} lagt til i dagbok.`);
  }

  function updateCustomMealField<K extends keyof CustomMealForm>(field: K, value: CustomMealForm[K]) {
    setCustomMealForm((prev) => ({ ...prev, [field]: value }));
  }

  function onFoodSearchSelect(result: FoodSearchResult, grams: number) {
    const scale = grams / 100;
    setCustomMealForm((prev) => ({
      ...prev,
      title: result.name,
      calories: String(Math.round(result.per100g.kcal * scale)),
      protein: String(Math.round(result.per100g.protein * scale * 10) / 10),
      carbs: String(Math.round(result.per100g.carbs * scale * 10) / 10),
      fat: String(Math.round(result.per100g.fat * scale * 10) / 10),
    }));
    setPendingMicros(result.micros ?? null);
  }

  function addCustomMealToDiary() {
    const title = customMealForm.title.trim();
    const calories = Number(customMealForm.calories);
    const protein = Number(customMealForm.protein || '0');
    const carbs = Number(customMealForm.carbs || '0');
    const fat = Number(customMealForm.fat || '0');

    if (!title || !Number.isFinite(calories) || calories <= 0) {
      showDiaryToast('Legg inn navn og kcal for måltidet.');
      return;
    }

    const mealId = toMealId(customMealForm.mealSlot);
    const entry: FoodEntry = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `custom-meal-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: title,
      kcal: Math.round(calories),
      protein: Number.isFinite(protein) ? protein : 0,
      carbs: Number.isFinite(carbs) ? carbs : 0,
      fat: Number.isFinite(fat) ? fat : 0,
      ...(pendingMicros ? { micros: pendingMicros } : {}),
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
    setPendingMicros(null);
    setCustomMealOpen(false);
    setCustomMealForm({
      title: '',
      mealSlot: activeMealFilter === 'alle' ? 'middag' : activeMealFilter,
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
    });
    showDiaryToast(`${title} opprettet og lagt til i dagbok.`);
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

      <div className="sticky top-0 bg-white dark:bg-gray-900 z-20 border-b dark:border-gray-700">
        <div className="scroll-container py-3">
          {(['alle', 'frokost', 'lunsj', 'middag', 'snacks'] as const).map((slot) => (
            <button key={slot} onClick={() => setActiveMealFilter(slot)} className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${activeMealFilter === slot ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {slot === 'alle' ? 'For deg' : slot[0].toUpperCase() + slot.slice(1)}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
          {smartSortOptions.map((option) => (
            <button key={option.id} onClick={() => setActiveSort(option.id)} className={`text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${activeSort === option.id ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}>
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
                  ? 'bg-gradient-to-br from-slate-50 dark:from-slate-800 to-white dark:to-gray-800 border-slate-100 dark:border-gray-700'
                  : 'bg-gradient-to-br from-orange-50 dark:from-orange-950/30 to-white dark:to-gray-800 border-orange-100 dark:border-orange-900/40'
              }`}
            >
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{block.title}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">{block.desc}</p>
              <div className="grid grid-cols-1 gap-2">
                {block.items.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => setSelectedRecipe(recipe)}
                    className="w-full text-left flex items-center gap-3 bg-white dark:bg-gray-700 rounded-xl p-2 border border-slate-100 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <img src={recipe.image} alt={recipe.title} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{recipe.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{recipe.calories} kcal - {recipe.time} - trykk for innhold</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{filteredRecipes.length} oppskrifter i smart visning</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCustomMealOpen(true)}
            className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Opprett måltid
          </button>
          <button
            onClick={() => setShowFavoritesOnly((prev) => !prev)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${showFavoritesOnly ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
          >
            {showFavoritesOnly ? 'Viser favoritter' : 'Kun favoritter'}
          </button>
        </div>
      </div>

      <div className="space-y-4 pb-28">
        {filteredRecipes.length === 0 && (
          <div className="mx-4 rounded-2xl border border-dashed border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-800 p-5 text-center">
            <p className="text-sm font-semibold text-slate-700">Ingen oppskrifter matcher akkurat na</p>
            <p className="mt-1 text-xs text-slate-500">Bytt maltype, sortering eller skru av filter for favoritter.</p>
          </div>
        )}
        {filteredRecipes.map((recipe) => {
          const usage = recipeUsage[recipe.id] ?? { count: 0, days: 0 };
          return (
            <div key={recipe.id} className="recipe-card cursor-pointer" onClick={() => setSelectedRecipe(recipe)}>
              <div className="relative">
                <img src={recipe.image} alt={recipe.title} className="recipe-image" />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setFavorites((prev) => (prev.has(recipe.id) ? new Set([...prev].filter((id) => id !== recipe.id)) : new Set(prev).add(recipe.id)));
                  }}
                  className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-md"
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
                <div className="rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-gray-600 p-2 mb-3">
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {usage.count > 0 ? `${usage.count} ganger logget av deg` : 'Ny oppskrift for deg'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {usage.days > 0 ? `Brukt pa ${usage.days} ulike dager` : 'Trykk for a se ingredienser og detaljer'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {recipe.tags.map((tag) => (
                    <button key={tag} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full" onClick={(event) => { event.stopPropagation(); setActiveTag(tag); }}>
                      {tagInfo[tag].label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Klar pa {recipe.time}</div>
                  <div className="flex items-center gap-1 text-orange-500"><Star className="w-4 h-4 fill-current" /><span className="text-sm font-medium">{recipe.rating}</span><span className="text-xs text-gray-400">({recipe.reviews})</span></div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    addRecipeToDiary(recipe);
                  }}
                  className="mt-3 w-full rounded-lg bg-orange-500 text-white text-sm font-medium py-2"
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
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{tagInfo[activeTag].label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tagInfo[activeTag].explanation}</p>
              </div>
              <button onClick={() => setActiveTag(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">x</button>
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Article</p>
              <a href={tagInfo[activeTag].url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm text-orange-600"><BookOpen className="w-4 h-4" />{tagInfo[activeTag].article}</a>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 p-3">Supplement: {tagInfo[activeTag].supplement}</div>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 p-3">Training advice: {tagInfo[activeTag].training}</div>
            </div>
          </div>
        </div>
      )}

      {selectedRecipe && selectedRecipeMacros && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{selectedRecipe.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{selectedRecipe.calories} kcal - {selectedRecipe.time} - {selectedRecipe.servings} pers</p>
              </div>
              <button onClick={() => setSelectedRecipe(null)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">x</button>
            </div>
            <img src={selectedRecipe.image} alt={selectedRecipe.title} className="mt-3 w-full h-44 rounded-xl object-cover" />
            <div className="mt-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Ingredienser</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRecipe.ingredients.map((ingredient) => (
                  <span key={ingredient} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {ingredient}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Estimert makrofordeling</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 p-2 text-center">Protein {selectedRecipeMacros.protein} g</div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 p-2 text-center">Karbo {selectedRecipeMacros.carbs} g</div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 p-2 text-center">Fett {selectedRecipeMacros.fat} g</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                addRecipeToDiary(selectedRecipe);
                setSelectedRecipe(null);
              }}
              className="mt-4 w-full rounded-lg bg-orange-500 text-white text-sm font-medium py-2"
            >
              Legg til i dagbok
            </button>
          </div>
        </div>
      )}

      {customMealOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Opprett måltid</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lag et eget måltid og legg det rett i dagboken.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFoodSearchOpen(true)}
                  className="flex items-center gap-1.5 rounded-full bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-300 px-3 py-1 text-xs font-medium"
                >
                  <Search className="w-3 h-3" />
                  Søk i database
                </button>
                <button onClick={() => { setCustomMealOpen(false); setPendingMicros(null); }} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">×</button>
              </div>
            </div>

            {pendingMicros && (
              <div className="mt-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/40 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-green-700 dark:text-green-300 font-medium">✓ Hentet fra database — inkl. mikronæringsstoffer</p>
                <button type="button" onClick={() => setPendingMicros(null)} className="text-xs text-green-500 dark:text-green-400">Fjern</button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Navn</label>
                <input
                  type="text"
                  value={customMealForm.title}
                  onChange={(event) => updateCustomMealField('title', event.target.value)}
                  placeholder="F.eks. Kylling og ris"
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Måltid</label>
                <select
                  value={customMealForm.mealSlot}
                  onChange={(event) => updateCustomMealField('mealSlot', event.target.value as Exclude<MealSlot, 'alle'>)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                >
                  <option value="frokost">Frokost</option>
                  <option value="lunsj">Lunsj</option>
                  <option value="middag">Middag</option>
                  <option value="snacks">Snacks</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Kalorier</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={customMealForm.calories}
                    onChange={(event) => updateCustomMealField('calories', event.target.value)}
                    placeholder="450"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Protein (g)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={customMealForm.protein}
                    onChange={(event) => updateCustomMealField('protein', event.target.value)}
                    placeholder="35"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Karbohydrater (g)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={customMealForm.carbs}
                    onChange={(event) => updateCustomMealField('carbs', event.target.value)}
                    placeholder="40"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Fett (g)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={customMealForm.fat}
                    onChange={(event) => updateCustomMealField('fat', event.target.value)}
                    placeholder="15"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 text-sm outline-none focus:border-orange-400"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={addCustomMealToDiary}
              className="mt-4 w-full rounded-lg bg-orange-500 text-white text-sm font-medium py-2"
            >
              Opprett måltid
            </button>
          </div>
        </div>
      )}

      {foodSearchOpen && (
        <FoodSearchModal
          initialQuery={customMealForm.title}
          onSelect={onFoodSearchSelect}
          onClose={() => setFoodSearchOpen(false)}
        />
      )}

      {diaryFeedback && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 z-50 rounded-full bg-gray-900 text-white text-xs px-4 py-2">
          {diaryFeedback}
        </div>
      )}
    </div>
  );
}
