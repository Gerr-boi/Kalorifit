const FOOD101_CLASS_SUBSET = new Set<string>([
  'apple_pie',
  'baby_back_ribs',
  'baklava',
  'beef_carpaccio',
  'beef_tartare',
  'beet_salad',
  'bibimbap',
  'bread_pudding',
  'breakfast_burrito',
  'bruschetta',
  'caesar_salad',
  'cannoli',
  'caprese_salad',
  'carrot_cake',
  'ceviche',
  'cheese_plate',
  'cheesecake',
  'chicken_curry',
  'chicken_quesadilla',
  'chicken_wings',
  'chocolate_cake',
  'chocolate_mousse',
  'churros',
  'club_sandwich',
  'creme_brulee',
  'cup_cakes',
  'deviled_eggs',
  'donuts',
  'dumplings',
  'edamame',
  'eggs_benedict',
  'falafel',
  'filet_mignon',
  'fish_and_chips',
  'foie_gras',
  'french_fries',
  'french_onion_soup',
  'french_toast',
  'fried_calamari',
  'fried_rice',
  'frozen_yogurt',
  'garlic_bread',
  'gnocchi',
  'greek_salad',
  'grilled_cheese_sandwich',
  'grilled_salmon',
  'guacamole',
  'gyoza',
  'hamburger',
  'hot_and_sour_soup',
  'hot_dog',
  'hummus',
  'ice_cream',
  'lasagna',
  'lobster_bisque',
  'lobster_roll_sandwich',
  'macaroni_and_cheese',
  'macarons',
  'miso_soup',
  'mussels',
  'nachos',
  'omelette',
  'onion_rings',
  'oysters',
  'pad_thai',
  'paella',
  'pancakes',
  'panna_cotta',
  'peking_duck',
  'pho',
  'pizza',
  'pork_chop',
  'poutine',
  'prime_rib',
  'pulled_pork_sandwich',
  'ramen',
  'ravioli',
  'risotto',
  'samosa',
  'sashimi',
  'scallops',
  'seaweed_salad',
  'shrimp_and_grits',
  'spaghetti_bolognese',
  'spaghetti_carbonara',
  'spring_rolls',
  'steak',
  'strawberry_shortcake',
  'sushi',
  'tacos',
  'takoyaki',
  'tiramisu',
  'tuna_tartare',
  'waffles',
]);

const ALIAS_TO_FOOD101: Record<string, string> = {
  'french fries': 'french_fries',
  fries: 'french_fries',
  burger: 'hamburger',
  'ice cream': 'ice_cream',
  donut: 'donuts',
  doughnut: 'donuts',
  noodle: 'ramen',
  noodles: 'ramen',
  taco: 'tacos',
  pancake: 'pancakes',
  waffle: 'waffles',
};

function normalizeLabel(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}0-9\s_]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toFood101Canonical(input: string) {
  return normalizeLabel(input).replace(/\s+/g, '_');
}

export function humanizeFood101ClassName(canonical: string) {
  return canonical.replace(/_/g, ' ').trim();
}

export function mapToFood101Class(label: string): string | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;

  const fromAlias = ALIAS_TO_FOOD101[normalized];
  if (fromAlias && FOOD101_CLASS_SUBSET.has(fromAlias)) return fromAlias;

  const canonical = toFood101Canonical(normalized);
  if (FOOD101_CLASS_SUBSET.has(canonical)) return canonical;

  return null;
}

export function getFood101SeedQuery(label: string): string | null {
  const mapped = mapToFood101Class(label);
  if (!mapped) return null;
  return humanizeFood101ClassName(mapped);
}
