import type { DietStyle, GoalCategory, GoalStrategy } from '../lib/nutritionPlanner';

export type SmartSortId = 'recommended' | 'goal' | 'post_workout' | 'evening' | 'gut' | 'high_energy' | 'anti_inflammatory';
export type NutritionTagId = 'gut_health' | 'high_protein' | 'low_inflammation' | 'brain_fuel' | 'hormone_support' | 'fiber_focus' | 'recovery';
export type MealSlot = 'alle' | 'frokost' | 'lunsj' | 'middag' | 'snacks';

export type MealRecipe = {
  id: string;
  title: string;
  image: string;
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
  ingredients: string[];
  steps: string[];
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

// Build recipe helper function that auto-infers metadata from minimal input
type BuildRecipeInput = {
  id: string;
  title: string;
  image: string;
  calories: number;
  time: string;
  servings: number;
  slots: Array<Exclude<MealSlot, 'alle'>>;
  source: string;
  ingredients: string[];
  steps: string[];
  // Optional overrides
  flags?: Partial<{
    fermented: boolean;
    antiInflammatory: boolean;
    highProtein: boolean;
    eveningFriendly: boolean;
    highEnergy: boolean;
    magnesiumRich: boolean;
    vegan: boolean;
    vegetarian: boolean;
    keto: boolean;
    mediterranean: boolean;
  }>;
  rating?: number;
  reviews?: number;
};

function buildRecipe(input: BuildRecipeInput): MealRecipe {
  const ingredientText = input.ingredients.join(' ').toLowerCase();
  const titleText = input.title.toLowerCase();
  
  // Detect allergens
  const containsAllergens: string[] = [];
  if (/egg|egger/.test(ingredientText)) containsAllergens.push('egg');
  if (/melk|yoghurt|ost|fløte|rømme|kefir|cottage/.test(ingredientText)) containsAllergens.push('melk');
  if (/havre|brød|pasta|tortilla|gluten|hvete/.test(ingredientText)) containsAllergens.push('gluten');
  if (/mandler|valnøtter|peanøtt|nøtter/.test(ingredientText)) containsAllergens.push('nøtter');
  if (/laks|torsk|ørret|tunfisk|reker|fisk/.test(ingredientText)) containsAllergens.push('fisk');
  if (/reker|skalldyr/.test(ingredientText)) containsAllergens.push('skalldyr');
  if (/soya|tofu|edamame/.test(ingredientText)) containsAllergens.push('soya');
  if (/tahini|sesam/.test(ingredientText)) containsAllergens.push('sesam');
  
  // Auto-infer signals
  const highProteinSources = /kylling|laks|biff|egg|torsk|reker|tunfisk|cottage|yoghurt|proteinpulver|linser|kikerter|tofu|kjøttdeig/;
  const fiberSources = /havre|linser|kikerter|quinoa|bønner|brokkoli|spinat|blomkål|chiafrø/;
  const fermentedSources = /yoghurt|kefir|kimchi/;
  const antiInflammatorySources = /laks|olivenolje|spinat|brokkoli|blåbær|mandler|valnøtter/;
  const magnesiumSources = /mandler|spinat|quinoa|avokado|chiafrø|linfrø|edamame/;
  
  const signals = {
    fiber: input.flags?.fermented ? 8 : (fiberSources.test(ingredientText) ? 6 : 3),
    fermented: input.flags?.fermented ?? fermentedSources.test(ingredientText),
    antiInflammatory: input.flags?.antiInflammatory ?? antiInflammatorySources.test(ingredientText),
    highProtein: input.flags?.highProtein ?? (highProteinSources.test(ingredientText) || input.calories > 400),
    eveningFriendly: input.flags?.eveningFriendly ?? (!/(egg|proteinpannekaker|energi)/.test(titleText)),
    highEnergy: input.flags?.highEnergy ?? (input.calories > 500 || /biff|bulk/.test(titleText)),
    magnesiumRich: input.flags?.magnesiumRich ?? magnesiumSources.test(ingredientText),
  };
  
  // Auto-infer diet styles
  const dietStyles: DietStyle[] = ['standard_balanced'];
  
  const animalProducts = /kylling|laks|biff|egg|torsk|reker|tunfisk|melk|yoghurt|ost|kjøttdeig|kalkun/;
  const meatFish = /kylling|laks|biff|torsk|reker|tunfisk|kjøttdeig|kalkun/;
  
  if (input.flags?.vegan || (!animalProducts.test(ingredientText) && !containsAllergens.includes('melk') && !containsAllergens.includes('egg'))) {
    dietStyles.push('vegan', 'vegetarian');
  } else if (input.flags?.vegetarian || !meatFish.test(ingredientText)) {
    dietStyles.push('vegetarian');
  }
  
  if (signals.highProtein || /protein/.test(titleText)) {
    dietStyles.push('high_protein');
  }
  
  if (input.flags?.keto || (input.calories < 350 && !/(havre|ris|pasta|brød)/.test(ingredientText))) {
    dietStyles.push('keto', 'low_carb');
  }
  
  if (input.flags?.mediterranean || /olivenolje|fetaost|oliven|tomat/.test(ingredientText)) {
    dietStyles.push('mediterranean');
  }
  
  // Auto-infer tags based on signals
  const tags: NutritionTagId[] = [];
  if (signals.highProtein) tags.push('high_protein');
  if (signals.fiber > 5) tags.push('fiber_focus');
  if (signals.fermented || /probio|gut/.test(ingredientText)) tags.push('gut_health');
  if (signals.antiInflammatory) tags.push('low_inflammation');
  if (/omega|laks|valnøtter|mandler/.test(ingredientText)) tags.push('brain_fuel');
  if (/recovery|post/.test(titleText) || signals.highProtein) tags.push('recovery');
  if (/hormon/.test(ingredientText) || containsAllergens.includes('soya')) tags.push('hormone_support');
  
  // Auto-infer sort contexts based on tags and characteristics
  const sortContexts: SmartSortId[] = ['recommended'];
  if (signals.highProtein && input.calories > 400) sortContexts.push('post_workout');
  if (signals.eveningFriendly || /evening|kveld/.test(titleText)) sortContexts.push('evening');
  if (signals.fermented || tags.includes('gut_health')) sortContexts.push('gut');
  if (signals.antiInflammatory) sortContexts.push('anti_inflammatory');
  if (signals.highEnergy || input.calories > 500) sortContexts.push('high_energy');
  if (tags.includes('high_protein') || tags.includes('recovery')) sortContexts.push('goal');
  
  // Auto-infer goal categories
  const goalCategories: GoalCategory[] = ['health'];
  if (signals.highProtein || input.calories > 450) goalCategories.push('muscle_gain');
  if (input.calories < 400) goalCategories.push('fat_loss');
  if (input.calories >= 400 && input.calories <= 500 && signals.highProtein) goalCategories.push('recomp');
  if (signals.highEnergy || input.calories > 500) goalCategories.push('performance');
  
  // Auto-infer goal strategies
  const goalStrategies: GoalStrategy[] = [];
  if (signals.antiInflammatory || tags.includes('gut_health')) goalStrategies.push('blood_markers');
  if (signals.highProtein) goalStrategies.push('high_protein_maintenance');
  if (input.calories > 500) goalStrategies.push('lean_bulk');
  if (input.calories > 550) goalStrategies.push('standard_bulk');
  if (signals.highProtein && goalCategories.includes('performance')) goalStrategies.push('strength_focus');
  if (input.calories < 350) goalStrategies.push('slow_cut');
  if (input.calories >= 350 && input.calories < 450 && goalCategories.includes('fat_loss')) goalStrategies.push('standard_cut');
  if (!signals.highEnergy && signals.eveningFriendly) goalStrategies.push('stable_energy');
  if (containsAllergens.includes('soya') || tags.includes('hormone_support')) goalStrategies.push('hormonal_balance');
  
  return {
    id: input.id,
    title: input.title,
    image: input.image,
    calories: input.calories,
    time: input.time,
    rating: input.rating ?? 4.5,
    reviews: input.reviews ?? 200,
    source: input.source,
    servings: input.servings,
    mealSlots: input.slots,
    tags,
    sortContexts,
    dietStyles,
    goalCategories,
    goalStrategies,
    containsAllergens,
    ingredients: input.ingredients,
    steps: input.steps,
    signals,
  };
}

export const mealRecipes: MealRecipe[] = [
  // ========== FROKOST ==========
  buildRecipe({
    id: 'r1',
    title: 'Havregrøt med blåbær og mandler',
    image: 'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=700&h=420&fit=crop',
    calories: 420,
    time: '10 min',
    servings: 1,
    slots: ['frokost'],
    source: 'Hverdagsmat',
    ingredients: ['Havregryn 80 g', 'Melk 2 dl', 'Proteinpulver vanilje 30 g', 'Blåbær 100 g', 'Mandler 20 g', 'Honning 1 ss', 'Kanel 1 ts'],
    steps: ['Kok havregryn i melk på medium varme i 5 min.', 'Rør inn proteinpulver og kanel.', 'Topp med blåbær, mandler og honning.'],
    rating: 4.7,
    reviews: 312,
  }),

  buildRecipe({
    id: 'r2',
    title: 'Eggerøre med avokado og rugbrød',
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=700&h=420&fit=crop',
    calories: 410,
    time: '8 min',
    servings: 1,
    slots: ['frokost', 'lunsj'],
    source: 'Proteinrik',
    ingredients: ['Egg 3 stk', 'Avokado 1/2 stk', 'Rugbrød 2 skiver', 'Smør 1 ts', 'Cherrytomater 6 stk', 'Salt og pepper', 'Gressløk'],
    steps: ['Visp egg med salt og pepper, stek i smør på lav varme.', 'Mos avokado og bred på ristet rugbrød.', 'Server eggerøre ved siden med halvert tomat og gressløk.'],
    flags: { eveningFriendly: false },
    rating: 4.6,
    reviews: 245,
  }),

  buildRecipe({
    id: 'r3',
    title: 'Grønn smoothie bowl',
    image: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=700&h=420&fit=crop',
    calories: 340,
    time: '5 min',
    servings: 1,
    slots: ['frokost'],
    source: 'Lettvint',
    ingredients: ['Spinat 50 g', 'Banan 1 stk', 'Mango frossen 80 g', 'Havredrikk 1.5 dl', 'Chiafrø 1 ss', 'Granola 25 g', 'Kokosflak 10 g'],
    steps: ['Blend spinat, banan, mango og havredrikk til glatt.', 'Hell i skål og topp med chiafrø, granola og kokos.', 'Spis med skje — ikke drikk.'],
    flags: { vegan: true, antiInflammatory: true, magnesiumRich: true },
    rating: 4.5,
    reviews: 189,
  }),

  buildRecipe({
    id: 'r4',
    title: 'Gresk yoghurt med nøtter og bær',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=700&h=420&fit=crop',
    calories: 320,
    time: '3 min',
    servings: 1,
    slots: ['frokost', 'snacks'],
    source: 'Lettvint',
    ingredients: ['Gresk yoghurt 200 g', 'Valnøtter 20 g', 'Bringebær 80 g', 'Honning 1 ts', 'Granola 20 g'],
    steps: ['Hell yoghurt i skål.', 'Topp med bær, valnøtter og granola.', 'Drypp honning over.'],
    flags: { fermented: true },
    rating: 4.8,
    reviews: 387,
  }),

  buildRecipe({
    id: 'r5',
    title: 'Proteinpannekaker med bær',
    image: 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=700&h=420&fit=crop',
    calories: 450,
    time: '15 min',
    servings: 2,
    slots: ['frokost'],
    source: 'Treningsmat',
    ingredients: ['Egg 3 stk', 'Banan 1 stk', 'Havregryn 60 g', 'Proteinpulver 25 g', 'Melk 1 dl', 'Blåbær 80 g', 'Smør til steking'],
    steps: ['Blend egg, banan, havregryn, proteinpulver og melk.', 'Stek pannekaker i smør på medium varme.', 'Server med blåbær.'],
    flags: { eveningFriendly: false, highProtein: true },
    rating: 4.4,
    reviews: 203,
  }),

  buildRecipe({
    id: 'r6',
    title: 'Overnight oats med chiafrø',
    image: 'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=700&h=420&fit=crop',
    calories: 370,
    time: '5 min + natt',
    servings: 1,
    slots: ['frokost'],
    source: 'Meal prep',
    ingredients: ['Havregryn 60 g', 'Havredrikk 1.5 dl', 'Chiafrø 1 ss', 'Peanøttsmør 1 ss', 'Banan 1/2 stk', 'Kanel 1 ts'],
    steps: ['Bland havregryn, havredrikk og chiafrø i glass.', 'Sett i kjøleskap over natten.', 'Topp med peanøttsmør, banan og kanel om morgenen.'],
    flags: { vegan: true, magnesiumRich: true },
    rating: 4.6,
    reviews: 278,
  }),

  buildRecipe({
    id: 'r7',
    title: 'Omelett med spinat og fetaost',
    image: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?w=700&h=420&fit=crop',
    calories: 380,
    time: '10 min',
    servings: 1,
    slots: ['frokost', 'lunsj'],
    source: 'Proteinrik',
    ingredients: ['Egg 3 stk', 'Spinat 60 g', 'Fetaost 30 g', 'Soltørket tomat 3 stk', 'Olivenolje 1 ts', 'Oregano'],
    steps: ['Visp egg og hell i panne med olivenolje.', 'Legg på spinat, feta og soltørket tomat.', 'Brett sammen og stek ferdig.'],
    flags: { mediterranean: true, eveningFriendly: false },
    rating: 4.5,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r8',
    title: 'Kefir-smoothie med bær og havre',
    image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=700&h=420&fit=crop',
    calories: 310,
    time: '5 min',
    servings: 1,
    slots: ['frokost', 'snacks'],
    source: 'Hverdagsmat',
    ingredients: ['Kefir 2 dl', 'Jordbær frosne 100 g', 'Havregryn 30 g', 'Honning 1 ts', 'Linfrø 1 ts'],
    steps: ['Blend kefir, jordbær, havregryn og honning.', 'Hell i glass og dryss linfrø over.'],
    flags: { fermented: true },
    rating: 4.3,
    reviews: 167,
  }),

  buildRecipe({
    id: 'r9',
    title: 'Cottage cheese på knekkebrød',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=700&h=420&fit=crop',
    calories: 280,
    time: '3 min',
    servings: 1,
    slots: ['frokost', 'snacks'],
    source: 'Lettvint',
    ingredients: ['Knekkebrød 3 stk', 'Cottage cheese 100 g', 'Agurk 1/2 stk', 'Pepper', 'Gressløk'],
    steps: ['Bred cottage cheese på knekkebrød.', 'Legg på agurk, pepper og gressløk.'],
    rating: 4.2,
    reviews: 134,
  }),

  buildRecipe({
    id: 'r10',
    title: 'Quinoa frokostbolle med eple',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=700&h=420&fit=crop',
    calories: 390,
    time: '20 min',
    servings: 1,
    slots: ['frokost'],
    source: 'Meal prep',
    ingredients: ['Quinoa 60 g', 'Havredrikk 2 dl', 'Eple 1 stk', 'Valnøtter 15 g', 'Kanel 1 ts', 'Ahornsirup 1 ts'],
    steps: ['Kok quinoa i havredrikk med kanel i 15 min.', 'Skjær eple i biter.', 'Server med eple, valnøtter og ahornsirup.'],
    flags: { vegan: true },
    rating: 4.4,
    reviews: 156,
  }),

  // ========== LUNSJ ==========
  buildRecipe({
    id: 'r11',
    title: 'Kyllingwrap med avokado',
    image: 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=700&h=420&fit=crop',
    calories: 480,
    time: '12 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Enkel lunsj',
    ingredients: ['Fullkornstortilla 1 stk', 'Kyllingfilet 120 g', 'Avokado 1/2 stk', 'Rucola 30 g', 'Tomat 1 stk', 'Limejuice', 'Salt og pepper'],
    steps: ['Stek kylling med salt og pepper, skjær i strimler.', 'Mos avokado med lime.', 'Legg alt i tortilla og rull.'],
    flags: { eveningFriendly: false },
    rating: 4.7,
    reviews: 345,
  }),

  buildRecipe({
    id: 'r12',
    title: 'Laks og avokado toast',
    image: 'https://images.unsplash.com/photo-1539252554453-80ab65ce3586?w=700&h=420&fit=crop',
    calories: 420,
    time: '8 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Proteinrik',
    ingredients: ['Surdeigsbrød 2 skiver', 'Røykt laks 80 g', 'Avokado 1/2 stk', 'Sitronjuice 1 ts', 'Dill', 'Kapers 1 ts'],
    steps: ['Rist brød.', 'Mos avokado med sitron og salt.', 'Legg laks, dill og kapers på toppen.'],
    flags: { eveningFriendly: false },
    rating: 4.8,
    reviews: 289,
  }),

  buildRecipe({
    id: 'r13',
    title: 'Quinoasalat med kikerter',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&h=420&fit=crop',
    calories: 440,
    time: '20 min',
    servings: 2,
    slots: ['lunsj'],
    source: 'Meal prep',
    ingredients: ['Quinoa 80 g', 'Kikerter hermetisk 150 g', 'Agurk 1/2 stk', 'Cherrytomater 100 g', 'Rødløk 1/4 stk', 'Olivenolje 2 ss', 'Sitronjuice 1 ss'],
    steps: ['Kok quinoa, la avkjøle.', 'Bland med kikerter, agurk, tomat og rødløk.', 'Drypp over olivenolje og sitron.'],
    flags: { vegan: true, mediterranean: true },
    rating: 4.5,
    reviews: 213,
  }),

  buildRecipe({
    id: 'r14',
    title: 'Tunfisksalat i pitabrød',
    image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=700&h=420&fit=crop',
    calories: 400,
    time: '10 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Enkel lunsj',
    ingredients: ['Tunfisk i vann 1 boks', 'Pitabrød 1 stk', 'Majones lett 1 ss', 'Mais 2 ss', 'Salat 30 g', 'Agurk skiver'],
    steps: ['Bland tunfisk med majones og mais.', 'Fyll pitabrød med salat og tunfiskblanding.', 'Legg på agurk.'],
    flags: { eveningFriendly: false },
    rating: 4.3,
    reviews: 178,
  }),

  buildRecipe({
    id: 'r15',
    title: 'Asiatisk edamamesalat',
    image: 'https://images.unsplash.com/photo-1505253213348-cd54c92b037e?w=700&h=420&fit=crop',
    calories: 350,
    time: '12 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Vegetar',
    ingredients: ['Edamame 150 g', 'Gulrot julienne 1 stk', 'Rødkål 50 g', 'Sesamolje 1 ss', 'Riseddik 1 ss', 'Sesamfrø 1 ts', 'Vårløk 2 stk'],
    steps: ['Kok edamame 5 min, la avkjøle.', 'Bland med gulrot, rødkål og vårløk.', 'Drypp sesamolje og riseddik, dryss sesamfrø.'],
    flags: { vegan: true },
    rating: 4.4,
    reviews: 156,
  }),

  buildRecipe({
    id: 'r16',
    title: 'Caprese sandwich',
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=700&h=420&fit=crop',
    calories: 380,
    time: '5 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Sommermat',
    ingredients: ['Ciabatta 1 stk', 'Mozzarella 80 g', 'Tomat 1 stor', 'Basilikum frisk', 'Balsamico 1 ss', 'Olivenolje 1 ts'],
    steps: ['Del ciabatta og legg på mozzarella og tomat.', 'Topp med basilikum.', 'Drypp over balsamico og olivenolje.'],
    flags: { vegetarian: true, mediterranean: true },
    rating: 4.6,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r17',
    title: 'Kalkun og hummus wrap',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=700&h=420&fit=crop',
    calories: 460,
    time: '8 min',
    servings: 1,
    slots: ['lunsj'],
    source: 'Enkel lunsj',
    ingredients: ['Fullkornstortilla 1 stk', 'Kalkunpålegg 80 g', 'Hummus 3 ss', 'Spinat 30 g', 'Paprika 1/2 stk', 'Agurk strimler'],
    steps: ['Bred hummus på tortilla.', 'Legg på kalkun, spinat, paprika og agurk.', 'Rull tett og skjær i to.'],
    flags: { eveningFriendly: false },
    rating: 4.5,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r18',
    title: 'Linsesuppe med brød',
    image: 'https://images.unsplash.com/photo-1547592166-23acbe346499?w=700&h=420&fit=crop',
    calories: 380,
    time: '25 min',
    servings: 2,
    slots: ['lunsj', 'middag'],
    source: 'Komfort',
    ingredients: ['Røde linser 150 g', 'Løk 1 stk', 'Gulrot 1 stk', 'Hvitløk 2 fedd', 'Grønnsakskraft 5 dl', 'Spisskummen 1 ts', 'Sitronjuice'],
    steps: ['Fres løk, hvitløk og gulrot.', 'Tilsett linser, kraft og spisskummen, kok 20 min.', 'Blend halvparten for kremete konsistens, press sitron over.'],
    flags: { vegan: true, antiInflammatory: true },
    rating: 4.4,
    reviews: 167,
  }),

  // ========== MIDDAG ==========
  buildRecipe({
    id: 'r19',
    title: 'Ovnsbakt laks med brokkoli',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=700&h=420&fit=crop',
    calories: 510,
    time: '22 min',
    servings: 1,
    slots: ['middag'],
    source: 'Treningsmat',
    ingredients: ['Laksfilet 160 g', 'Brokkoli 200 g', 'Søtpotet 150 g', 'Olivenolje 1 ss', 'Sitron 1/2 stk', 'Hvitløk 2 fedd', 'Dill'],
    steps: ['Sett ovn på 200°C. Legg laks, brokkoli og søtpotetbåter på brett.', 'Drypp olivenolje, sitron og hvitløk over.', 'Bak i 18-20 min. Topp med dill.'],
    flags: { highEnergy: true },
    rating: 4.9,
    reviews: 456,
  }),

  buildRecipe({
    id: 'r20',
    title: 'Kylling tikka masala',
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&h=420&fit=crop',
    calories: 520,
    time: '30 min',
    servings: 2,
    slots: ['middag'],
    source: 'Komfort',
    ingredients: ['Kyllingbryst 300 g', 'Kokosmelk 2 dl', 'Tomatpuré 2 ss', 'Garam masala 2 ts', 'Ingefær 1 ss', 'Hvitløk 3 fedd', 'Ris 150 g'],
    steps: ['Skjær kylling i biter, brun i panne.', 'Tilsett krydder, tomatpuré og kokosmelk.', 'La putre 15 min. Server med ris.'],
    flags: { highEnergy: true },
    rating: 4.7,
    reviews: 378,
  }),

  buildRecipe({
    id: 'r21',
    title: 'Biff med søtpotetfries',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=700&h=420&fit=crop',
    calories: 560,
    time: '25 min',
    servings: 1,
    slots: ['middag'],
    source: 'Proteinrik',
    ingredients: ['Indrefilet 180 g', 'Søtpotet 250 g', 'Rucola 40 g', 'Olivenolje 2 ss', 'Salt og pepper', 'Rosmarin'],
    steps: ['Skjær søtpotet i staver, stek i ovn 200°C i 20 min.', 'Krydre biff, stek 2-3 min per side.', 'Server med søtpotetfries og rucola.'],
    flags: { highEnergy: true, eveningFriendly: false },
    rating: 4.6,
    reviews: 312,
  }),

  buildRecipe({
    id: 'r22',
    title: 'Vegetar linse dal',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=700&h=420&fit=crop',
    calories: 420,
    time: '30 min',
    servings: 2,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Røde linser 200 g', 'Kokosmelk 2 dl', 'Løk 1 stk', 'Kurkuma 1 ts', 'Ingefær 1 ss', 'Spinat 100 g', 'Nanbrød 2 stk'],
    steps: ['Fres løk og ingefær. Tilsett linser, kokosmelk og kurkuma.', 'Kok 20 min til linsene er myke.', 'Rør inn spinat. Server med nanbrød.'],
    flags: { vegan: true, antiInflammatory: true },
    rating: 4.5,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r23',
    title: 'Teriyaki laks med ris',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=700&h=420&fit=crop',
    calories: 490,
    time: '18 min',
    servings: 1,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Laksfilet 150 g', 'Soyasaus 2 ss', 'Honning 1 ss', 'Ingefær 1 ts', 'Jasminris 80 g', 'Brokkoli 100 g', 'Sesamfrø 1 ts'],
    steps: ['Bland soya, honning og ingefær til teriyakisaus.', 'Stek laks og pensle med saus.', 'Server med ris og dampet brokkoli.'],
    rating: 4.6,
    reviews: 267,
  }),

  buildRecipe({
    id: 'r24',
    title: 'Pasta med pesto og kylling',
    image: 'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=700&h=420&fit=crop',
    calories: 540,
    time: '18 min',
    servings: 2,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Fullkornspasta 150 g', 'Kyllingfilet 200 g', 'Pesto 3 ss', 'Cherrytomater 100 g', 'Parmesan 20 g', 'Rucola 30 g'],
    steps: ['Kok pasta. Stek kylling.', 'Bland pasta med pesto, tomat og kylling.', 'Topp med parmesan og rucola.'],
    flags: { highEnergy: true },
    rating: 4.5,
    reviews: 298,
  }),

  buildRecipe({
    id: 'r25',
    title: 'Curry kylling med kikerter',
    image: 'https://images.unsplash.com/photo-1563379091339-03246963d96c?w=700&h=420&fit=crop',
    calories: 500,
    time: '28 min',
    servings: 2,
    slots: ['middag'],
    source: 'Treningsmat',
    ingredients: ['Kyllinglår 400 g', 'Kikerter 200 g', 'Kokosmelk 2.5 dl', 'Currypasta 2 ss', 'Løk 1 stk', 'Ingefær 1 ss', 'Koriander frisk'],
    steps: ['Brun kylling i gryte.', 'Tilsett løk, currypasta, kokosmelk og kikerter.', 'La putre 15 min. Topp med koriander.'],
    flags: { highEnergy: true },
    rating: 4.7,
    reviews: 289,
  }),

  buildRecipe({
    id: 'r26',
    title: 'Gresk bakt torsk',
    image: 'https://images.unsplash.com/photo-1544827797-0f85e2e0e164?w=700&h=420&fit=crop',
    calories: 380,
    time: '22 min',
    servings: 1,
    slots: ['middag'],
    source: 'Sommermat',
    ingredients: ['Torskfilet 180 g', 'Cherrytomater 150 g', 'Oliven 10 stk', 'Fetaost 40 g', 'Olivenolje 2 ss', 'Oregano 1 ts', 'Sitron'],
    steps: ['Legg torsk i ildfast form med tomater, oliven og feta.', 'Drypp olivenolje og oregano over.', 'Bak 200°C i 15-18 min.'],
    flags: { mediterranean: true, keto: true },
    rating: 4.5,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r27',
    title: 'Taco bowl med bønner',
    image: 'https://images.unsplash.com/photo-1512838243191-b84cad2d4e1b?w=700&h=420&fit=crop',
    calories: 510,
    time: '20 min',
    servings: 1,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Svarte bønner 150 g', 'Ris 80 g', 'Avokado 1/2 stk', 'Paprika 1 stk', 'Rødløk 1/4 stk', 'Lime 1 stk', 'Koriander frisk'],
    steps: ['Kok ris. Varm bønner med tacokrydder.', 'Stek paprika og løk.', 'Legg alt i skål med avokado og lime.'],
    flags: { vegan: true, highEnergy: true },
    rating: 4.4,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r28',
    title: 'Wok med biff og grønnsaker',
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=700&h=420&fit=crop',
    calories: 470,
    time: '15 min',
    servings: 1,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Biffstrimler 150 g', 'Brokkoli 100 g', 'Paprika 1 stk', 'Soyasaus 2 ss', 'Sesamolje 1 ss', 'Hvitløk 2 fedd', 'Nudler 80 g'],
    steps: ['Stek biff raskt på høy varme.', 'Tilsett grønnsaker og stek 3 min.', 'Bland med kokte nudler, soya og sesamolje.'],
    flags: { eveningFriendly: false },
    rating: 4.5,
    reviews: 256,
  }),

  buildRecipe({
    id: 'r29',
    title: 'Risotto med sopp',
    image: 'https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=700&h=420&fit=crop',
    calories: 430,
    time: '30 min',
    servings: 2,
    slots: ['middag'],
    source: 'Komfort',
    ingredients: ['Arborio ris 150 g', 'Sjampinjong 200 g', 'Grønnsakskraft 5 dl', 'Løk 1 stk', 'Parmesan 30 g', 'Hvitvin 1 dl', 'Smør 15 g'],
    steps: ['Stek løk og sopp. Tilsett ris.', 'Hell i vin og kraft gradvis mens du rører.', 'Rør inn parmesan og smør til slutt.'],
    flags: { vegetarian: true },
    rating: 4.3,
    reviews: 178,
  }),

  buildRecipe({
    id: 'r30',
    title: 'Marokkansk kyllinggryte',
    image: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=700&h=420&fit=crop',
    calories: 490,
    time: '40 min',
    servings: 2,
    slots: ['middag'],
    source: 'Komfort',
    ingredients: ['Kyllinglår 400 g', 'Søtpotet 200 g', 'Aprikoser tørket 50 g', 'Mandler 30 g', 'Kanel 1 ts', 'Spisskummen 1 ts', 'Koriander frisk'],
    steps: ['Brun kylling i gryte.', 'Tilsett søtpotet, aprikoser og krydder.', 'La putre 25 min. Topp med mandler og koriander.'],
    rating: 4.7,
    reviews: 267,
  }),

  buildRecipe({
    id: 'r31',
    title: 'Laks med kremet spinat',
    image: 'https://images.unsplash.com/photo-1485963631004-f2f00b1d6606?w=700&h=420&fit=crop',
    calories: 460,
    time: '18 min',
    servings: 1,
    slots: ['middag'],
    source: 'Proteinrik',
    ingredients: ['Laksfilet 160 g', 'Spinat 200 g', 'Kremfløte 1 dl', 'Hvitløk 2 fedd', 'Muskatnøtt 1 ts', 'Olivenolje 1 ss'],
    steps: ['Stek laks i olivenolje.', 'Sautér spinat med hvitløk.', 'Tilsett fløte og muskatnøtt. Server laks på spinat.'],
    flags: { keto: true },
    rating: 4.6,
    reviews: 213,
  }),

  buildRecipe({
    id: 'r32',
    title: 'Chili con carne',
    image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=700&h=420&fit=crop',
    calories: 490,
    time: '40 min',
    servings: 3,
    slots: ['middag'],
    source: 'Komfort',
    ingredients: ['Kjøttdeig 400 g', 'Kidneybønner 200 g', 'Hakkede tomater 400 g', 'Løk 1 stk', 'Chilipulver 2 ts', 'Spisskummen 1 ts', 'Rømme til topping'],
    steps: ['Brun kjøttdeig og løk.', 'Tilsett krydder, tomater og bønner.', 'La putre 30 min. Server med rømme.'],
    rating: 4.5,
    reviews: 345,
  }),

  buildRecipe({
    id: 'r33',
    title: 'Thai grønn curry med reker',
    image: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=700&h=420&fit=crop',
    calories: 440,
    time: '20 min',
    servings: 2,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Reker 250 g', 'Kokosmelk 3 dl', 'Grønn currypasta 2 ss', 'Sukkererter 100 g', 'Paprika 1 stk', 'Basilikum thai', 'Jasminris 150 g'],
    steps: ['Stek currypasta i kokosmelk.', 'Tilsett grønnsaker og reker.', 'Kok 8 min. Server med ris.'],
    rating: 4.6,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r34',
    title: 'Norsk fiskegrateng',
    image: 'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=700&h=420&fit=crop',
    calories: 430,
    time: '35 min',
    servings: 2,
    slots: ['middag'],
    source: 'Hverdagsmat',
    ingredients: ['Torskfilet 300 g', 'Poteter 300 g', 'Rømme 2 dl', 'Ost revet 60 g', 'Dill', 'Salt og pepper'],
    steps: ['Skjær poteter tynt, legg lagvis med fisk i form.', 'Hell rømme over og topp med ost.', 'Bak 200°C i 25 min.'],
    rating: 4.4,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r35',
    title: 'Vegetar pad thai',
    image: 'https://images.unsplash.com/photo-1559314809-0f31657def5e?w=700&h=420&fit=crop',
    calories: 460,
    time: '20 min',
    servings: 1,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Risnudler 100 g', 'Tofu 120 g', 'Bønnespirer 80 g', 'Peanøtter 25 g', 'Limejuice 1 ss', 'Soyasaus 2 ss', 'Vårløk 2 stk'],
    steps: ['Bløtlegg nudler. Stek tofu til gyllen.', 'Bland nudler med soyasaus og lime.', 'Topp med bønnespirer, peanøtter og vårløk.'],
    flags: { vegan: true },
    rating: 4.4,
    reviews: 189,
  }),

  buildRecipe({
    id: 'r36',
    title: 'Koreansk bibimbap',
    image: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=700&h=420&fit=crop',
    calories: 480,
    time: '25 min',
    servings: 1,
    slots: ['middag'],
    source: 'Treningsmat',
    ingredients: ['Ris 100 g', 'Kjøttdeig 120 g', 'Kimchi 60 g', 'Spinat 80 g', 'Gulrot julienne 1 stk', 'Egg 1 stk', 'Gochujang 1 ss'],
    steps: ['Kok ris. Stek kjøttdeig med soya.', 'Sautér spinat og gulrot separat.', 'Legg alt i skål med stekt egg og kimchi. Bland med gochujang.'],
    flags: { fermented: true },
    rating: 4.6,
    reviews: 213,
  }),

  buildRecipe({
    id: 'r37',
    title: 'Keto kylling med fetaost',
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=700&h=420&fit=crop',
    calories: 440,
    time: '22 min',
    servings: 1,
    slots: ['middag'],
    source: 'Proteinrik',
    ingredients: ['Kyllingbryst 180 g', 'Fetaost 50 g', 'Soltørket tomat 4 stk', 'Spinat 100 g', 'Olivenolje 1 ss', 'Oregano', 'Hvitløk 1 fedd'],
    steps: ['Stek kylling med hvitløk.', 'Sautér spinat med soltørket tomat.', 'Server kylling med feta på toppen.'],
    flags: { keto: true },
    rating: 4.3,
    reviews: 167,
  }),

  buildRecipe({
    id: 'r38',
    title: 'Ratatouille',
    image: 'https://images.unsplash.com/photo-1572441713132-51c75654db73?w=700&h=420&fit=crop',
    calories: 280,
    time: '35 min',
    servings: 2,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Aubergine 1 stk', 'Squash 1 stk', 'Paprika 2 stk', 'Tomater 3 stk', 'Hvitløk 3 fedd', 'Timian', 'Olivenolje 3 ss'],
    steps: ['Skjær grønnsaker i terninger.', 'Stek aubergine og squash først, deretter paprika.', 'Tilsett tomater og hvitløk, la putre 20 min.'],
    flags: { vegan: true, keto: true, mediterranean: true },
    rating: 4.3,
    reviews: 145,
  }),

  buildRecipe({
    id: 'r39',
    title: 'Biff stroganoff',
    image: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=700&h=420&fit=crop',
    calories: 530,
    time: '25 min',
    servings: 2,
    slots: ['middag'],
    source: 'Komfort',
    ingredients: ['Biffstrimler 300 g', 'Sjampinjong 200 g', 'Rømme 1.5 dl', 'Løk 1 stk', 'Sennep 1 ss', 'Pasta 150 g', 'Persille'],
    steps: ['Brun biff raskt. Stek løk og sopp.', 'Bland inn rømme og sennep.', 'Server med kokt pasta og persille.'],
    flags: { highEnergy: true },
    rating: 4.5,
    reviews: 289,
  }),

  buildRecipe({
    id: 'r40',
    title: 'Bakt aubergine med tahini',
    image: 'https://images.unsplash.com/photo-1505576399279-0d309f7b7b5d?w=700&h=420&fit=crop',
    calories: 360,
    time: '30 min',
    servings: 1,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Aubergine 1 stor', 'Tahini 2 ss', 'Kikerter 100 g', 'Granateple frø', 'Persille', 'Olivenolje 1 ss', 'Spisskummen 1 ts'],
    steps: ['Halver aubergine, riss i kryss og bak 200°C i 25 min.', 'Varm kikerter med spisskummen.', 'Server med tahini, kikerter, granateple og persille.'],
    flags: { vegan: true, mediterranean: true },
    rating: 4.4,
    reviews: 156,
  }),

  buildRecipe({
    id: 'r41',
    title: 'Japansk teriyaki kylling',
    image: 'https://images.unsplash.com/photo-1580959375944-abd7e991f971?w=700&h=420&fit=crop',
    calories: 460,
    time: '18 min',
    servings: 1,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Kyllinglår 200 g', 'Soyasaus 3 ss', 'Mirin 1 ss', 'Honning 1 ss', 'Ris 80 g', 'Edamame 60 g', 'Sesamfrø'],
    steps: ['Stek kylling og pensle med teriyakisaus.', 'Kok ris og edamame.', 'Server med sesamfrø.'],
    rating: 4.6,
    reviews: 278,
  }),

  buildRecipe({
    id: 'r42',
    title: 'Laksetaco med mangosalsa',
    image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=700&h=420&fit=crop',
    calories: 470,
    time: '20 min',
    servings: 2,
    slots: ['middag'],
    source: 'Sommermat',
    ingredients: ['Laksfilet 200 g', 'Tacolefser 4 stk', 'Mango 1/2 stk', 'Rødløk 1/4 stk', 'Koriander', 'Limejuice 1 ss', 'Avokado 1/2 stk'],
    steps: ['Stek laks og del i biter.', 'Bland mango, rødløk, koriander og lime til salsa.', 'Fyll tacolefser med laks, avokado og salsa.'],
    flags: { eveningFriendly: false },
    rating: 4.7,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r43',
    title: 'Vegetar chili sin carne',
    image: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=700&h=420&fit=crop',
    calories: 400,
    time: '35 min',
    servings: 3,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Kidneybønner 200 g', 'Svarte bønner 200 g', 'Hakkede tomater 400 g', 'Mais 100 g', 'Løk 1 stk', 'Chilipulver 2 ts', 'Spisskummen 1 ts'],
    steps: ['Fres løk med krydder.', 'Tilsett tomater, bønner og mais.', 'La putre 25 min.'],
    flags: { vegan: true },
    rating: 4.3,
    reviews: 187,
  }),

  // ========== SNACKS ==========
  buildRecipe({
    id: 'r44',
    title: 'Proteinballer med dadler',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=700&h=420&fit=crop',
    calories: 180,
    time: '15 min',
    servings: 6,
    slots: ['snacks'],
    source: 'Treningsmat',
    ingredients: ['Dadler 150 g', 'Mandler 80 g', 'Proteinpulver 30 g', 'Kakao 1 ss', 'Kokosflak 20 g', 'Kokosolje 1 ss'],
    steps: ['Blend dadler og mandler i foodprosessor.', 'Bland inn proteinpulver, kakao og kokosolje.', 'Form til baller og rull i kokosflak. Kjøl 30 min.'],
    flags: { vegetarian: true },
    rating: 4.5,
    reviews: 267,
  }),

  buildRecipe({
    id: 'r45',
    title: 'Hummus med grønnsaker',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=700&h=420&fit=crop',
    calories: 190,
    time: '5 min',
    servings: 1,
    slots: ['snacks'],
    source: 'Lettvint',
    ingredients: ['Hummus 3 ss', 'Gulrot 1 stk', 'Agurk 1/2 stk', 'Paprika 1/2 stk', 'Selleri 2 stilker'],
    steps: ['Skjær grønnsaker i staver.', 'Server med hummus til dipping.'],
    flags: { vegan: true },
    rating: 4.3,
    reviews: 189,
  }),

  buildRecipe({
    id: 'r46',
    title: 'Energimiks med nøtter',
    image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=700&h=420&fit=crop',
    calories: 260,
    time: '2 min',
    servings: 1,
    slots: ['snacks'],
    source: 'Lettvint',
    ingredients: ['Mandler 25 g', 'Valnøtter 20 g', 'Gresskarfrø 15 g', 'Rosiner 15 g', 'Mørk sjokolade 10 g'],
    steps: ['Bland alt i en boks.', 'Ta med som snacks.'],
    flags: { vegan: true, keto: true },
    rating: 4.2,
    reviews: 134,
  }),

  buildRecipe({
    id: 'r47',
    title: 'Bananpannekaker med peanøttsmør',
    image: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=700&h=420&fit=crop',
    calories: 320,
    time: '10 min',
    servings: 1,
    slots: ['snacks', 'frokost'],
    source: 'Hverdagsmat',
    ingredients: ['Banan 1 stk', 'Egg 2 stk', 'Peanøttsmør 1 ss', 'Kanel 1 ts'],
    steps: ['Mos banan og bland med egg.', 'Stek små pannekaker.', 'Server med peanøttsmør.'],
    flags: { eveningFriendly: false },
    rating: 4.4,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r48',
    title: 'Cottage cheese med bær',
    image: 'https://images.unsplash.com/photo-1571043733612-97bbcb3b5b9b?w=700&h=420&fit=crop',
    calories: 180,
    time: '2 min',
    servings: 1,
    slots: ['snacks'],
    source: 'Proteinrik',
    ingredients: ['Cottage cheese 150 g', 'Blåbær 60 g', 'Honning 1 ts'],
    steps: ['Hell cottage cheese i skål.', 'Topp med blåbær og honning.'],
    rating: 4.5,
    reviews: 312,
  }),

  buildRecipe({
    id: 'r49',
    title: 'Edamame med havsalt',
    image: 'https://images.unsplash.com/photo-1564834744159-ff0ea41ba4b9?w=700&h=420&fit=crop',
    calories: 140,
    time: '5 min',
    servings: 1,
    slots: ['snacks'],
    source: 'Lettvint',
    ingredients: ['Edamame i skall 150 g', 'Havsalt 1 ts', 'Chilflak valgfritt'],
    steps: ['Kok edamame 5 min.', 'Dryss havsalt og chili over.'],
    flags: { vegan: true, keto: true },
    rating: 4.2,
    reviews: 123,
  }),

  buildRecipe({
    id: 'r50',
    title: 'Eple med peanøttsmør',
    image: 'https://images.unsplash.com/photo-1568702846914-96b305d2ead1?w=700&h=420&fit=crop',
    calories: 220,
    time: '2 min',
    servings: 1,
    slots: ['snacks'],
    source: 'Lettvint',
    ingredients: ['Eple 1 stk', 'Peanøttsmør 1.5 ss', 'Kanel valgfritt'],
    steps: ['Skjær eple i båter.', 'Dypp i peanøttsmør.'],
    flags: { vegan: true },
    rating: 4.3,
    reviews: 245,
  }),

  // ========== EKSTRA MIDDAGER ==========
  buildRecipe({
    id: 'r51',
    title: 'Lammekotteletter med rosmarin',
    image: 'https://images.unsplash.com/photo-1558030006-450675393462?w=700&h=420&fit=crop',
    calories: 520,
    time: '20 min',
    servings: 1,
    slots: ['middag'],
    source: 'Proteinrik',
    ingredients: ['Lammekotteletter 2 stk', 'Rosmarin 2 kvister', 'Hvitløk 3 fedd', 'Olivenolje 2 ss', 'Asparges 150 g', 'Salt og pepper'],
    steps: ['Krydre lam med rosmarin, hvitløk og salt.', 'Stek på høy varme 3-4 min per side.', 'Grill asparges som tilbehør.'],
    flags: { highEnergy: true, eveningFriendly: false, keto: true },
    rating: 4.7,
    reviews: 198,
  }),

  buildRecipe({
    id: 'r52',
    title: 'Kremet blomkålsuppe',
    image: 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=700&h=420&fit=crop',
    calories: 250,
    time: '25 min',
    servings: 2,
    slots: ['middag', 'lunsj'],
    source: 'Komfort',
    ingredients: ['Blomkål 1 hode', 'Løk 1 stk', 'Grønnsakskraft 4 dl', 'Fløte 1 dl', 'Muskatnøtt', 'Gressløk'],
    steps: ['Kok blomkål og løk i kraft til mykt.', 'Blend til kremet. Tilsett fløte og muskatnøtt.', 'Server med gressløk.'],
    flags: { vegetarian: true, keto: true },
    rating: 4.3,
    reviews: 156,
  }),

  buildRecipe({
    id: 'r53',
    title: 'Shakshuka',
    image: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=700&h=420&fit=crop',
    calories: 380,
    time: '20 min',
    servings: 2,
    slots: ['middag', 'frokost'],
    source: 'Hverdagsmat',
    ingredients: ['Egg 4 stk', 'Hakkede tomater 400 g', 'Paprika 1 stk', 'Løk 1 stk', 'Hvitløk 2 fedd', 'Spisskummen 1 ts', 'Koriander frisk'],
    steps: ['Fres løk, paprika og hvitløk med spisskummen.', 'Tilsett tomater og la putre 10 min.', 'Lag hull og knekk egg oppi. Lokk på, kok 5-6 min.'],
    flags: { vegetarian: true, mediterranean: true },
    rating: 4.6,
    reviews: 234,
  }),

  buildRecipe({
    id: 'r54',
    title: 'Pulled chicken bowl',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=700&h=420&fit=crop',
    calories: 500,
    time: '25 min',
    servings: 2,
    slots: ['middag'],
    source: 'Meal prep',
    ingredients: ['Kyllingbryst 300 g', 'Ris 150 g', 'Avokado 1 stk', 'Mais 80 g', 'Rødløk 1/4 stk', 'Lime', 'BBQ-saus 2 ss'],
    steps: ['Kok kylling og dra fra hverandre med gaffel.', 'Bland med BBQ-saus.', 'Server i skål med ris, avokado, mais og lime.'],
    flags: { highEnergy: true },
    rating: 4.5,
    reviews: 213,
  }),

  buildRecipe({
    id: 'r55',
    title: 'Kremet kyllingpasta',
    image: 'https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=700&h=420&fit=crop',
    calories: 550,
    time: '20 min',
    servings: 2,
    slots: ['middag'],
    source: 'Rask middag',
    ingredients: ['Kyllingfilet 250 g', 'Penne 150 g', 'Fløte 1.5 dl', 'Soltørket tomat 6 stk', 'Spinat 60 g', 'Parmesan 20 g', 'Hvitløk 2 fedd'],
    steps: ['Stek kylling. Kok pasta.', 'Lag saus av fløte, hvitløk, soltørket tomat og spinat.', 'Bland alt og topp med parmesan.'],
    flags: { highEnergy: true },
    rating: 4.4,
    reviews: 289,
  }),

  buildRecipe({
    id: 'r56',
    title: 'Tofu stir-fry med grønnsaker',
    image: 'https://images.unsplash.com/photo-1571197200382-0d139dbf63a5?w=700&h=420&fit=crop',
    calories: 380,
    time: '18 min',
    servings: 1,
    slots: ['middag'],
    source: 'Vegetar',
    ingredients: ['Tofu 200 g', 'Brokkoli 100 g', 'Paprika 1 stk', 'Gulrot 1 stk', 'Soyasaus 2 ss', 'Sesamolje 1 ss', 'Ingefær 1 ts'],
    steps: ['Press tofu og stek til gyllen.', 'Tilsett grønnsaker og stek 3-4 min.', 'Bland med soya, sesam og ingefær.'],
    flags: { vegan: true },
    rating: 4.2,
    reviews: 145,
  }),

  buildRecipe({
    id: 'r57',
    title: 'Spansk paella',
    image: 'https://images.unsplash.com/photo-1534080564583-6be75777b70a?w=700&h=420&fit=crop',
    calories: 480,
    time: '35 min',
    servings: 2,
    slots: ['middag'],
    source: 'Sommermat',
    ingredients: ['Bomba ris 200 g', 'Reker 150 g', 'Kyllingpølse 100 g', 'Safran 1 ts', 'Paprika 1 stk', 'Erter 80 g', 'Grønnsakskraft 5 dl'],
    steps: ['Stek kyllingpølse og paprika i vid panne.', 'Tilsett ris og kraft med safran.', 'Legg reker og erter på toppen siste 8 min.'],
    flags: { mediterranean: true, eveningFriendly: false },
    rating: 4.8,
    reviews: 312,
  }),

  buildRecipe({
    id: 'r58',
    title: 'Ørret med sitronsmør og poteter',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=700&h=420&fit=crop',
    calories: 450,
    time: '25 min',
    servings: 1,
    slots: ['middag'],
    source: 'Hverdagsmat',
    ingredients: ['Ørretfilet 160 g', 'Smør 15 g', 'Sitronjuice 1 ss', 'Nypoteter 200 g', 'Asparges 100 g', 'Dill', 'Salt og pepper'],
    steps: ['Kok poteter. Stek ørret i smør.', 'Tilsett sitronjuice til pannen.', 'Server med dampede asparges og dill.'],
    rating: 4.5,
    reviews: 178,
  }),

  buildRecipe({
    id: 'r59',
    title: 'Keto bacon og eggmuffins',
    image: 'https://images.unsplash.com/photo-1508427953056-b00b8d78ebf5?w=700&h=420&fit=crop',
    calories: 350,
    time: '25 min',
    servings: 6,
    slots: ['snacks', 'frokost'],
    source: 'Meal prep',
    ingredients: ['Egg 6 stk', 'Bacon 6 skiver', 'Ost revet 60 g', 'Spinat 50 g', 'Salt og pepper'],
    steps: ['Kle muffinsformer med bacon.', 'Visp egg med ost, spinat, salt og pepper.', 'Hell i former og bak 180°C i 20 min.'],
    flags: { keto: true, eveningFriendly: false },
    rating: 4.3,
    reviews: 167,
  }),

  buildRecipe({
    id: 'r60',
    title: 'Kimchi stekt ris',
    image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=700&h=420&fit=crop',
    calories: 430,
    time: '15 min',
    servings: 1,
    slots: ['middag', 'lunsj'],
    source: 'Rask middag',
    ingredients: ['Ris (kokt fra dagen før) 200 g', 'Kimchi 80 g', 'Egg 2 stk', 'Vårløk 2 stk', 'Soyasaus 1 ss', 'Sesamolje 1 ts'],
    steps: ['Stek ris i sesamolje på høy varme.', 'Tilsett kimchi og soyasaus, stek 3 min.', 'Push til side, stek egg og bland inn. Topp med vårløk.'],
    flags: { fermented: true },
    rating: 4.5,
    reviews: 198,
  }),
];