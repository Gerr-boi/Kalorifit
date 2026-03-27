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
    steps: ['Varm 2 dl melk på medium varme til den begynner å koke.', 'Rør inn 80 g havregryn og kok på lav varme i 5-6 minutter til kremete, rør jevnlig.', 'Ta av varmen og rør inn 30 g proteinpulver og 1 ts kanel til alt er godt blandet.', 'Hell i skål og topp med 100 g blåbær og 20 g mandler.', 'Drypp 1 ss honning over og server umiddelbart mens det er varmt.'],
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
    steps: ['Visp 3 egg med salt og pepper i en skål.', 'Varm 1 ts smør i panne på lav varme til det begynner å skumme.', 'Hell eggblandingen i pannen og rør forsiktig med tresleiv i 3-4 minutter til eggerøren er kremet og myk.', 'Mos 1/2 avokado med en gaffel og bred på 2 skiver ristet rugbrød.', 'Server eggerøren ved siden av med halverte cherrytomater og hakket gressløk på toppen.'],
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
    steps: ['Skyll 50 g spinat grundig og legg i blender sammen med 1 banan i stykker.', 'Tilsett 80 g frossen mango og 1,5 dl havredrikk, blend på høy hastighet i 60-90 sekunder til helt glatt.', 'Hell smoothien i en skål og kontroller konsistensen - den skal være tykk nok til å spise med skje.', 'Dryss 1 ss chiafrø, 25 g granola og 10 g kokosflak på toppen.', 'Server umiddelbart og spis med skje for best teksturopplevelse.'],
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
    steps: ['Hell 200 g gresk yoghurt i en dyp skål.', 'Grov hakk 20 g valnøtter og dryss over yoghurten.', 'Legg 80 g bringebær forsiktig på toppen, samt 20 g granola.', 'Drypp 1 ts honning over hele retten i en fin stråle.', 'Server umiddelbart for best smak og tekstur.'],
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
    steps: ['Blend 3 egg, 1 banan i stykker, 60 g havregryn, 25 g proteinpulver og 1 dl melk i blender til glatt røre.', 'La røren hvile i 2-3 minutter slik at havregrynene kan suge opp væske.', 'Varm smør i panne på medium varme til det skummer lett.', 'Hell små porsjoner røre i pannen og stek pannekaker i 2-3 minutter per side til gylne.', 'Server varme pannekaker med 80 g blåbær strødd over.'],
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
    steps: ['Bland 60 g havregryn, 1,5 dl havredrikk og 1 ss chiafrø grundig i et glass eller boks.', 'Rør godt slik at det ikke dannes klumper, og dekk til med plastfolie eller lokk.', 'Sett i kjøleskap minimum 4 timer, helst over natten (8-12 timer).', 'Om morgenen, rør blandingen igjen og sjekk konsistensen - tilsett mer havredrikk hvis for tykk.', 'Topp med 1 ss peanøttsmør, 1/2 banan i skiver og en dryss kanel før servering.'],
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
    steps: ['Visp 3 egg med en klype salt og pepper i en skål.', 'Varm 1 ts olivenolje i en non-stick panne på medium varme.', 'Hell eggblandingen i pannen og la den størkne i 1-2 minutter uten å røre.', 'Legg 60 g spinat, 30 g smuldret fetaost og 3 soltørkede tomater på den ene halvdelen av omeletten.', 'Brett omeletten forsiktig sammen med en spatel og stek ytterligere 1-2 minutter til fyllet er varmt og osten smeltet.'],
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
    steps: ['Legg 2 dl kefir, 100 g frosne jordbær, 30 g havregryn og 1 ts honning i blender.', 'Blend på høy hastighet i 45-60 sekunder til jordbærene er helt knust og blandingen er glatt.', 'La stå i 2-3 minutter slik at havregrynene kan suge opp væske og gi tykkere konsistens.', 'Hell smoothien i et høyt glass.', 'Dryss 1 ts linfrø over toppen og server umiddelbart med sugerør.'],
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
    steps: ['Legg 3 knekkebrød på en tallerken.', 'Fordel 100 g cottage cheese jevnt på knekkebrødene med en skje.', 'Skjær 1/2 agurk i tynne skiver og legg dem overlappende på cottage cheesen.', 'Mal frisk pepper over og dryss finhakket gressløk på toppen.', 'Server umiddelbart mens knekkebrødene fremdeles er sprø.'],
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
    steps: ['Skyll 60 g quinoa under kaldt vann til vannet blir klart.', 'Kok 2 dl havredrikk i en kjele, tilsett quinoa og 1 ts kanel.', 'Senk varmen og la putre under lokk i 15-18 minutter til væsken er absorbert og quinoa er myk.', 'Skjær 1 eple i små terninger og grov hakk 15 g valnøtter.', 'Hell quinoa i skål, topp med eple og valnøtter, og drypp 1 ts ahornsirup over før servering.'],
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
    steps: ['Krydre 120 g kyllingfilet med salt og pepper på begge sider.', 'Stek kyllingen i en varm panne på medium-høy varme i 6-8 minutter per side til innertemperaturen er 75°C.', 'La kyllingen hvile i 3 minutter, skjær deretter i tynne strimler.', 'Mos 1/2 avokado med limejuice, salt og pepper til en grov puré.', 'Legg avokadocremen på tortillaen, topp med kyllingstrimler, 30 g rucola og tomatskiver, rull tett og skjær i to.'],
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
    steps: ['Rist 2 skiver surdeigsbrød i brødrister til gylne og sprø.', 'Mos 1/2 avokado med 1 ts sitronjuice, salt og pepper til en kremete masse.', 'Bred avokadocremen jevnt på det varme brødet.', 'Legg 80 g røykt laks elegant på toppen av hver skive.', 'Fullfør med frisk dill, 1 ts kapers og en ekstra sprut sitronjuice.'],
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
    steps: ['Skyll 80 g quinoa og kok i saltet vann i 12-15 minutter til myk, hell av vannet og la avkjøle helt.', 'Skyll 150 g hermetiske kikerter og la de renne av.', 'Skjær 1/2 agurk i terninger, halver 100 g cherrytomater og finhakk 1/4 rødløk.', 'Bland quinoa med kikerter og grønnsaker i en stor skål.', 'Lag dressing av 2 ss olivenolje, 1 ss sitronjuice, salt og pepper, hell over salaten og bland godt.'],
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
    steps: ['Hell av væsken fra 1 boks tunfisk og mose fisken lett med en gaffel.', 'Bland tunfisk med 1 ss lett majones og 2 ss mais til en kremete salat.', 'Varm pitabrødet forsiktig i tørr panne i 30 sekunder per side.', 'Åpne pitabrødet forsiktig og legg inn 30 g salat på bunnen.', 'Fyll med tunfisksalaten og topp med agurk skiver før servering.'],
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
    steps: ['Kok 150 g edamame i saltet vann i 4-5 minutter til møre men fremdeles sprø.', 'Hell av vannet og skyll med kaldt vann for å stoppe koking, la avkjøle helt.', 'Julienne skjær 1 gulrot i tynne strimler og finhakk 50 g rødkål.', 'Bland edamame med gulrot, rødkål og finhakkede vårløk i en skål.', 'Drypp over 1 ss sesamolje og 1 ss riseddik, dryss med 1 ts sesamfrø og bland forsiktig.'],
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
    steps: ['Forvarm ovnen til 200°C (varmluft 180°C).', 'Skjær søtpoteten i båter og fordel på et bakepapirkledd brett. Drypp over 1/2 ss olivenolje, salt og pepper. Bak i 10 minutter.', 'Legg laksfileten og brokkolibukettene på brettet ved siden av søtpoteten. Press hvitløk over, drypp sitronjuice og resten av olivenoljen.', 'Bak i 12-15 minutter til laksen flaker lett med en gaffel og brokkolien er mør med sprø kanter.', 'Server med frisk dill og en sitronbåt ved siden av.'],
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
    steps: ['Skjær 300 g kyllingbryst i 2 cm terninger og krydre med salt og pepper.', 'Varm olje i en vid panne på medium-høy varme og brun kyllingbitene i 4-5 minutter til gylne på alle sider.', 'Tilsett 1 ss finhakket ingefær, 3 pressede hvitløksfedd og 2 ts garam masala, stek i 1 minutt til duften løfter seg.', 'Rør inn 2 ss tomatpuré og 2 dl kokosmelk, bring til koking.', 'Senk varmen og la putre i 12-15 minutter til kyllingen er gjennomstekt og sausen tykner. Server med nylaget ris.'],
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
    steps: ['Forvarm ovnen til 200°C og skjær 250 g søtpotet i 1 cm tykke staver.', 'Fordel søtpotetstaver på bakepapirkledd brett, drypp med 1 ss olivenolje og krydre med salt. Bak i 18-20 minutter til gylne og sprø.', 'Krydre 180 g indrefilet med salt, pepper og frisk rosmarin på begge sider.', 'Stek biffen i en varm panne på høy varme i 2-3 minutter per side for medium stekesikt.', 'La biffen hvile i 3 minutter før servering med søtpotetfries og 40 g rucola ved siden.'],
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
    steps: ['Finhakk 1 løk og 1 ss frisk ingefær.', 'Varm olje i en kjele på medium varme og fres løk og ingefær i 3-4 minutter til løken er gyllen og myk.', 'Tilsett 200 g røde linser, 2 dl kokosmelk, 2 dl vann og 1 ts kurkuma, rør godt.', 'Bring til koking, senk varmen og la putre i 18-20 minutter til linsene er myke og dalen er kremete.', 'Rør inn 100 g spinat og la det visne i 1-2 minutter. Server med varmt nanbrød.'],
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
    steps: ['Lag teriyakisaus ved å blande 2 ss soyasaus, 1 ss honning og 1 ts revet ingefær i en liten skål.', 'Stek 150 g laksfilet i en varm panne på medium-høy varme i 4 minutter på hver side.', 'Pensle laksen med teriyakisaus de siste 2 minuttene av steketiden.', 'Kok 80 g jasminris og damp 100 g brokkoli til den er mør men fremdeles sprø, ca 5 minutter.', 'Server laksen med ris og brokkoli, dryss 1 ts sesamfrø over.'],
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
    steps: ['Kok 150 g fullkornspasta i rikelig saltet vann etter pakningens anvisning til al dente.', 'Skjær 200 g kyllingfilet i biter og stek i en varm panne med olje i 6-8 minutter til gjennomstekt og gyllen.', 'Hell av pastavannet, men spar 1 dl pastamatte.', 'Bland den varme pastan med 3 ss pesto, tilsett litt pastamatte hvis nødvendig for kremete konsistens.', 'Rør inn kyllingbiter og halverte cherrytomater, topp med revet parmesan og rucola før servering.'],
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
    steps: ['Brun 400 g kyllinglår i en stor gryte på medium-høy varme i 5-6 minutter til gylne på alle sider.', 'Tilsett finhakket løk og 2 ss currypasta, stek i 2 minutter til duften løfter seg.', 'Hell i 2,5 dl kokosmelk og 200 g skylte kikerter, bring til koking.', 'Senk varmen og la putre under lokk i 15-18 minutter til kyllingen er gjennomstekt.', 'Smak til med salt og pepper, server med frisk koriander på toppen.'],
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
    steps: ['Forvarm ovnen til 200°C og smør en ildfast form med olivenolje.', 'Legg 180 g torskfilet i formen sammen med 150 g halverte cherrytomater og 10 oliven.', 'Smuldr 40 g fetaost over fisken og grønnsakene.', 'Drypp 2 ss olivenolje over og dryss med 1 ts oregano og ferskkvernet pepper.', 'Bak i 15-18 minutter til fisken flaker lett og tomatene er sprø. Server med sitronbåter.'],
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
    steps: ['Kok 80 g ris i saltet vann til myk, ca 12-15 minutter.', 'Varm 150 g svarte bønner i panne med 1 ts tacokrydder og en klype salt i 3-4 minutter.', 'Stek 1 skåret paprika og 1/4 rødløk på medium varme til myk og lett karamellisert, ca 5-6 minutter.', 'Legg ris i skål, topp med krydrede bønner, stekt grønnsaker og 1/2 skåret avokado.', 'Press limejuice over og pynt med frisk koriander før servering.'],
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
    steps: ['Kok 80 g nudler etter pakningens anvisning, hell av vannet og sett til side.', 'Stek 150 g biffstrimler på høy varme i 2-3 minutter til brunede utenpå men saftige inni.', 'Tilsett 100 g brokkoli og 1 skåret paprika, stek i 3-4 minutter til grønnsakene er møre men fremdeles sprø.', 'Tilsett 2 pressede hvitløksfedd og stek i 30 sekunder til duften løfter seg.', 'Bland inn nudlene med 2 ss soyasaus og 1 ss sesamolje, stek alt sammen i 1-2 minutter før servering.'],
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
    steps: ['Finhakk 1 løk og stek i smør på medium varme til gyllen, ca 4 minutter.', 'Tilsett 200 g skåret sjampinjong og stek til væsken er fordampet, ca 5 minutter.', 'Tilsett 150 g arborio ris og stek i 2 minutter til glassert med fett.', 'Hell i 1 dl hvitvin og rør til absorbert, deretter tilsett 5 dl varm grønnsakskraft litt om gangen mens du rører konstant.', 'Kok i 18-20 minutter til risen er kremet og al dente, rør inn parmesan og smør til slutt.'],
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
    steps: ['Brun 400 g kyllinglår i en stor gryte på medium-høy varme i 6-8 minutter til gylne på alle sider.', 'Tilsett 200 g søtpotet i terninger, 50 g tørkede aprikoser, 1 ts kanel og 1 ts spisskummen.', 'Hell over vann til det dekker ingrediensene, bring til koking.', 'Senk varmen og la putre under lokk i 25-30 minutter til kyllingen er mørt og søtpotetene er gjennomkokte.', 'Topp med 30 g hakkede mandler og frisk koriander før servering.'],
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
    steps: ['Krydre 160 g laksfilet med salt og pepper på begge sider.', 'Stek laksen i 1 ss olivenolje på medium-høy varme i 4-5 minutter per side til gyllen og gjennomstekt.', 'Sautér 200 g spinat og 2 pressede hvitløksfedd i samme panne i 2 minutter til spinaten visner.', 'Tilsett 1 dl kremfløte og en klype muskatnøtt, la sausen koke opp og tykne i 2-3 minutter.', 'Legg laksen på det kremete spinatet og server umiddelbart.'],
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
    steps: ['Brun 400 g kjøttdeig i en stor gryte på høy varme i 5-6 minutter til godt brunstekt.', 'Tilsett finhakket løk og stek videre i 3-4 minutter til løken er myk.', 'Rør inn 2 ts chilipulver, 1 ts spisskummen og stek kryddene i 1 minutt til duften løfter seg.', 'Tilsett 400 g hakkede tomater og 200 g kidneybønner, bring til koking.', 'Senk varmen og la putre i 30-35 minutter til sausen tykner, server med rømme på toppen.'],
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
    steps: ['Varm 2 ss grønn currypasta i 1 dl kokosmelk på medium varme i 2-3 minutter til duften løfter seg.', 'Hell i resten av kokosmelken (2 dl) og bring til koking.', 'Tilsett 1 skåret paprika og 100 g sukkererter, kok i 4-5 minutter til grønnsakene er møre.', 'Tilsett 250 g reker og kok i 3-4 minutter til rekene er varme og rosa.', 'Topp med thai basilikum og server med dampet jasminris.'],
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
    steps: ['Forvarm ovnen til 200°C og smør en ildfast form.', 'Skjær 300 g poteter i 3 mm tynne skiver og 300 g torskfilet i porsjonsstykker.', 'Legg poteter og fisk lagvis i formen, krydre hvert lag med salt, pepper og dill.', 'Hell 2 dl rømme jevnt over og dryss 60 g revet ost på toppen.', 'Bak i 25-30 minutter til potetene er møre og overflaten er gyllen.'],
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
    steps: ['Bløtlegg 100 g risnudler i varm vann i 8-10 minutter til myke, hell av vannet.', 'Skjær 120 g tofu i terninger og stek i olje på medium-høy varme i 5-6 minutter til gylne på alle sider.', 'Bland nudlene med 2 ss soyasaus, 1 ss limejuice og stek sammen med tofuen i 2-3 minutter.', 'Tilsett 80 g bønnespirer de siste 30 sekundene for å varme dem.', 'Topp med 25 g grovhakkede peanøtter og finhakkede vårløk før servering.'],
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
    steps: ['Kok 100 g ris og la avkjøle helt, helst bruk ris fra dagen før for best tekstur.', 'Stek 120 g kjøttdeig på høy varme i 4-5 minutter til brunstekt, krydre med soyasaus.', 'Sautér 80 g spinat raskt til visnet og julienneskåret gulrot til mør men sprø, hver for seg.', 'Stek 1 egg til ønsket konsistens (sunny side up anbefales).', 'Legg ris i skål, arranger kjøttdeig, grønnsaker og 60 g kimchi i seksjoner, topp med egg og 1 ss gochujang.'],
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
    steps: ['Krydre 180 g kyllingbryst med salt og pepper og stek i olivenolje på medium-høy varme.', 'Stek kyllingen i 6-7 minutter per side til gjennomstekt og gyllen utenpå.', 'Tilsett 1 presset hvitløksfedd og stek i 1 minutt til duften løfter seg.', 'Sautér 100 g spinat og 4 hakkede soltørkede tomater i samme panne i 2-3 minutter.', 'Server kyllingen på spinatblandingen og topp med 50 g smuldret fetaost og oregano.'],
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
    steps: ['Skjær 1 aubergine, 1 squash, 2 paprika og 3 tomater i jevne 2 cm terninger.', 'Stek aubergine og squash i 3 ss olivenolje på medium-høy varme i 6-8 minutter til gylne og halvveis møre.', 'Tilsett paprika og stek videre i 4-5 minutter til den begynner å bli myk.', 'Rør inn tomater, 3 pressede hvitløksfedd og timian, senk varmen til medium.', 'La putre i 20-25 minutter til alle grønnsaker er møre og smakene er blandet, rør av og til.'],
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
    steps: ['Brun 300 g biffstrimler på høy varme i 2-3 minutter til brunede utenpå men saftige inni, ta ut av pannen.', 'Stek 1 finhakket løk i samme panne til gyllen, tilsett 200 g skåret sjampinjong og stek til mørkere.', 'Senk varmen og bland inn 1,5 dl rømme og 1 ss sennep til en jevn saus.', 'Rør biffen tilbake i sausen og varm forsiktig i 2-3 minutter uten å koke.', 'Server over kokt pasta med finhakket persille på toppen.'],
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
    steps: ['Forvarm ovnen til 200°C og halver 1 stor aubergine på langs.', 'Riss kjøttet i et diamantmønster, drypp med olivenolje og krydre med salt og pepper.', 'Bak auberginehalvdelene i 25-30 minutter til kjøttet er mørt og gyllenbrunt.', 'Varm 100 g kikerter med 1 ts spisskummen og en klype salt i en panne i 3-4 minutter.', 'Server auberginen med 2 ss tahini drysset over, varme kikerter, granateplefrø og finhakket persille.'],
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
    steps: ['Lag teriyakisaus ved å blande 3 ss soyasaus, 1 ss mirin og 1 ss honning.', 'Stek 200 g kyllinglår på medium-høy varme i 6-8 minutter per side til gjennomstekt.', 'Pensle kyllingen med teriyakisaus de siste 3 minuttene og la sausen karamellisere.', 'Kok 80 g ris og 60 g edamame separat etter anvisning.', 'Skjær kyllingen i skiver, server med ris, edamame og dryss sesamfrø over.'],
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
    steps: ['Krydre 200 g laksfilet med salt, pepper og limezest, stek i olje på medium-høy varme i 4-5 minutter per side.', 'La laksen hvile i 2 minutter, del deretter i store flak med en gaffel.', 'Lag mangosalsa ved å blande terninger av 1/2 mango med finhakket 1/4 rødløk, koriander og limejuice.', 'Varm 4 tacolefser forsiktig i tørr panne i 30 sekunder per side.', 'Fyll tacoene med laksflak, 1/2 avokado i skiver og mangosalsa, server umiddelbart.'],
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
    steps: ['Finhakk 1 løk og stek i olje på medium varme i 4-5 minutter til myk og gyllen.', 'Tilsett 2 ts chilipulver og 1 ts spisskummen, stek kryddene i 1 minutt til duften løfter seg.', 'Rør inn 400 g hakkede tomater, 200 g kidney- og 200 g svarte bønner samt 100 g mais.', 'Bring til koking, senk varmen og la putre i 25-30 minutter til sausen tykner.', 'Smak til med salt og pepper, server med frisk koriander og limebåter.'],
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
    steps: ['Bland 150 g dadler i en foodprosessor til en grov paste dannes.', 'Tilsett 80 g mandler og mal til blandingen holder sammen når den klemmes.', 'Rør inn 30 g proteinpulver, 1 ss kakao og 1 ss kokosolje til en jevn masse.', 'Form blandingen til 12-15 baller med våte hender.', 'Rull ballene i 20 g kokosflak og kjøl i kjøleskapet i 30 minutter til de setter seg.'],
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
    steps: ['Skyll og skjær 1 gulrot, 1/2 agurk, 1/2 paprika og 2 selleri stilker i jevne staver.', 'Arranger grønnsaksstaver på en tallerken rundt en skål med 3 ss hummus.', 'Server umiddelbart mens grønnsakene er sprø og friske.'],
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
    steps: ['Mål opp 25 g mandler, 20 g valnøtter, 15 g gresskarfrø og 15 g rosiner.', 'Hakk 10 g mørk sjokolade i små biter.', 'Bland alle ingrediensene i en lufttett boks og rist godt.', 'Oppbevar i kjøleskapet og ta med porsjoner på 50-60 g som snacks.'],
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
    steps: ['Mos 1 moden banan grundig med en gaffel til en glatt puré.', 'Visp inn 2 egg og 1 ts kanel til blandingen er jevn.', 'Varm litt olje i en non-stick panne på medium-lav varme.', 'Stek små pannekaker i 2-3 minutter per side til gylne og faste.', 'Server varme pannekaker med 1 ss peanøttsmør på toppen.'],
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
    steps: ['Hell 150 g cottage cheese i en dyp skål.', 'Skyll 60 g blåbær forsiktig og la dem renne av.', 'Dryss blåbærene over cottage cheesen.', 'Drypp 1 ts honning i en fin stråle over hele retten.', 'Server umiddelbart mens blåbærene er friske og sprø.'],
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
    steps: ['Kok 150 g frosne edamame i skall i saltet vann i 4-5 minutter til møre.', 'Hell av vannet og la edamamene renne godt av.', 'Overfør til en varm serveringsskål.', 'Dryss jevnt med 1 ts havsalt og en klype chilflak hvis ønsket.', 'Server umiddelbart mens de fremdeles er varme, spis ved å trekke bønnene ut av skallene.'],
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
    steps: ['Skyll 1 eple og skjær det i 8 jevne båter.', 'Fjern kjernehuset fra hver eplebåt med en liten kniv.', 'Legg eplebåtene på en tallerken.', 'Varm 1,5 ss peanøttsmør lett i mikrobølgeovn i 15-20 sekunder til lett mykt.', 'Dypp hver eplebåt i det varme peanøttsmøret før du spiser, eller hell det over som en dressing.'],
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
    steps: ['Bland finhakket rosmarin fra 2 kvister med 3 pressede hvitløksfedd, salt og pepper.', 'Gni krydderpastaen inn i 2 lammekotteletter og la marinere i 10 minutter.', 'Stek lammekotteletene i 2 ss olivenolje på høy varme i 3-4 minutter per side for medium stekt.', 'Grill 150 g asparges på samme panne i 3-4 minutter til sprø og lett forkullet.', 'La lammekjøttet hvile i 3 minutter før servering med asparges ved siden.'],
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
    steps: ['Skjær 1 hode blomkål i buketter og 1 løk i grove biter.', 'Kok blomkål og løk i 4 dl grønnsakskraft i 12-15 minutter til meget møre.', 'Blend suppen med en stavblender til kremete konsistens, eller bruk vanlig blender.', 'Rør inn 1 dl fløte og en klype muskatnøtt, smak til med salt og pepper.', 'Server den varme suppen toppet med finhakket gressløk.'],
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
    steps: ['Finhakk 1 løk og 1 paprika, press 2 hvitløksfedd.', 'Stek løk og paprika i olivenolje på medium varme i 5-6 minutter til myk.', 'Tilsett hvitløk og 1 ts spisskummen, stek i 1 minutt til duften løfter seg.', 'Rør inn 400 g hakkede tomater og la putre i 8-10 minutter til sausen tykner.', 'Lag 4 små hull i sausen og knekk 1 egg i hvert hull. Dekk pannen og kok i 5-6 minutter til eggehavene er satt men plommene fremdeles myke.'],
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
    steps: ['Kok 300 g kyllingbryst i saltet vann i 12-15 minutter til gjennomstekt (innertemperatur 75°C).', 'La kyllingen avkjøle litt, trekk deretter kjøttet fra hverandre med to gafler til trevler.', 'Bland den trukne kyllingen med 2 ss BBQ-saus til godt dekket.', 'Kok 150 g ris og del 1 avokado i skiver, varm 80 g mais.', 'Legg ris i bunnen av to skåler, topp med kylling, avokado, mais og press limejuice over.'],
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
    steps: ['Skjær 250 g kyllingfilet i biter og stek i olje på medium-høy varme i 6-8 minutter til gyllen og gjennomstekt.', 'Kok 150 g penne pasta i saltet vann etter pakningens anvisning til al dente.', 'Lag saus ved å sautere 2 pressede hvitløksfedd i samme panne, tilsett 1,5 dl fløte og 6 hakkede soltørkede tomater.', 'Rør inn 60 g spinat og la det visne i sausen i 1-2 minutter.', 'Bland den varme pastaen med sausen og kyllingen, topp med 20 g revet parmesan.'],
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
    steps: ['Press 200 g tofu mellom papirhåndklær i 10 minutter for å fjerne overflødig væske.', 'Skjær tofuen i terninger og stek i olje på medium-høy varme i 5-6 minutter til gyllen på alle sider.', 'Tilsett 100 g brokkolibuketter, 1 skåret paprika og julienneskåret gulrot til pannen.', 'Stek grønnsakene i 3-4 minutter til de er møre men fremdeles sprø.', 'Bland alt med 2 ss soyasaus, 1 ss sesamolje og 1 ts revet ingefær før servering.'],
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
    steps: ['Stek 100 g skåret kyllingpølse i en vid paellapanne eller stor stekepanne på medium varme til gyllen.', 'Tilsett 1 skåret paprika og stek i 3-4 minutter til den begynner å bli myk.', 'Rør inn 200 g bomba ris (eller risotto-ris) og stek i 2 minutter til risen er glassert med fett.', 'Hell over 5 dl varm grønnsakskraft blandet med 1 ts safran, rør kort og la putre uten å røre i 12 minutter.', 'Legg 150 g reker og 80 g erter på toppen og fortsett å putre i 6-8 minutter til risen er mør og væsken absorbert.'],
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
    steps: ['Kok 200 g nypoteter i saltet vann i 12-15 minutter til møre, hell av vannet.', 'Stek 160 g ørretfilet i 15 g smør på medium-høy varme i 4-5 minutter per side til gyllen.', 'Tilsett 1 ss sitronjuice til pannen og sving rundt for å lage en enkel saus.', 'Damp 100 g asparges over kokende vann i 4-5 minutter til sprø-mør.', 'Server ørreten med potetene og asparges, topp med frisk dill og sitronsmørsausen.'],
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
    steps: ['Forvarm ovnen til 180°C og legg 6 skiver bacon rundt kantene i muffinsformer.', 'Visp 6 egg med 60 g revet ost, salt og pepper i en skål.', 'Fordel 50 g finhakket spinat i muffinsformene.', 'Hell eggblandingen over spinaten og baconet.', 'Bak i 18-20 minutter til eggene er satt og toppen er lett gyllen. La avkjøle i 5 minutter før servering.'],
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
    steps: ['Varm 1 ts sesamolje i en vid panne eller wok på høy varme.', 'Tilsett 200 g kald kokt ris (helst fra dagen før) og stek i 3-4 minutter til kornene skilles og blir litt sprø.', 'Tilsett 80 g kimchi og 1 ss soyasaus, stek alt sammen i 2-3 minutter til varmt.', 'Dytt risen til en side av pannen og stek 2 egg på den andre siden til ønsket konsistens.', 'Bland egget inn i risen og topp med finhakkede vårløk før servering.'],
    flags: { fermented: true },
    rating: 4.5,
    reviews: 198,
  }),
];