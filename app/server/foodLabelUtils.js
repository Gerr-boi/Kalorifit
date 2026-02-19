export const DEFAULT_THRESHOLD = 0.7;

const NOISE_WORDS = new Set([
  'food',
  'dish',
  'meal',
  'closeup',
  'close',
  'up',
  'fresh',
  'cooked',
  'fried',
  'baked',
  'roasted',
  'plate',
  'bowl',
  'portion',
]);

const NON_FOOD_HINTS = new Set([
  'table',
  'person',
  'human',
  'hand',
  'furniture',
  'room',
  'kitchen',
  'wall',
  'shoe',
  'shirt',
  'vehicle',
]);

const aliasToCanonical = new Map();
const canonicalFoodLabels = new Set();

function registerFood(canonical, aliases) {
  canonicalFoodLabels.add(canonical);
  aliasToCanonical.set(canonical, canonical);
  for (const alias of aliases) {
    aliasToCanonical.set(alias, canonical);
  }
}

registerFood('pizza', ['pizza pie', 'pepperoni pizza', 'margherita pizza']);
registerFood('burger', ['hamburger', 'cheeseburger', 'beef burger', 'chicken burger']);
registerFood('salad', ['green salad', 'mixed salad', 'caesar salad']);
registerFood('apple', ['red apple', 'green apple']);
registerFood('banana', ['bananas']);
registerFood('orange', ['oranges']);
registerFood('sandwich', ['club sandwich', 'sub sandwich']);
registerFood('wrap', ['chicken wrap', 'tortilla wrap']);
registerFood('taco', ['tacos']);
registerFood('burrito', ['burritos']);
registerFood('pasta', ['spaghetti', 'noodle', 'noodles', 'macaroni']);
registerFood('rice', ['fried rice']);
registerFood('sushi', ['maki', 'nigiri', 'sashimi']);
registerFood('fries', ['french fries', 'chips', 'potato chips']);
registerFood('potato', ['potatoes']);
registerFood('steak', ['beef steak']);
registerFood('beef', []);
registerFood('chicken', ['grilled chicken']);
registerFood('fish', ['salmon', 'tuna', 'cod']);
registerFood('shrimp', ['prawn', 'prawns']);
registerFood('egg', ['eggs', 'boiled egg', 'fried egg']);
registerFood('omelette', ['omelet']);
registerFood('bread', ['loaf']);
registerFood('toast', []);
registerFood('soup', ['broth']);
registerFood('cake', ['cupcake']);
registerFood('cookie', ['cookies', 'biscuit']);
registerFood('ice cream', ['gelato']);
registerFood('yogurt', ['yoghurt']);
registerFood('milk', []);
registerFood('cheese', []);
registerFood('sausage', ['sausages']);
registerFood('hot dog', ['hotdog']);
registerFood('donut', ['doughnut', 'donuts', 'doughnuts']);
registerFood('pancake', ['pancakes']);
registerFood('waffle', ['waffles']);
registerFood('avocado', []);
registerFood('tomato', ['tomatoes']);
registerFood('cucumber', []);
registerFood('broccoli', []);
registerFood('carrot', ['carrots']);
registerFood('strawberry', ['strawberries']);
registerFood('blueberry', ['blueberries']);
registerFood('grapes', ['grape']);
registerFood('porridge', ['oatmeal']);
registerFood('smoothie', []);
registerFood('kebab', ['doner']);
registerFood('falafel', []);
registerFood('ramen', []);
registerFood('meatball', ['meatballs']);
registerFood('lasagna', ['lasagne']);
registerFood('chili', ['chili con carne']);

function normalizeLabel(name) {
  const withNorwegian = name
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a');
  return withNorwegian
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IRREGULAR_SINGULARS = new Map([
  ['fries', 'fries'],
  ['chips', 'chips'],
  ['pasta', 'pasta'],
  ['sushi', 'sushi'],
]);

function singularizeToken(token) {
  const irregular = IRREGULAR_SINGULARS.get(token);
  if (irregular) return irregular;
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function compactLabel(label, useSingularForm = false) {
  const normalized = normalizeLabel(label);
  if (!normalized) return '';

  return normalized
    .split(' ')
    .map((token) => (useSingularForm ? singularizeToken(token) : token))
    .filter((token) => token && !NOISE_WORDS.has(token))
    .join(' ')
    .trim();
}

function toCanonicalLabel(name) {
  const compact = compactLabel(name, false);
  const singularCompact = compactLabel(name, true);
  if (!compact && !singularCompact) return '';

  const exactRaw = aliasToCanonical.get(compact);
  if (exactRaw) return exactRaw;
  const exactSingular = aliasToCanonical.get(singularCompact);
  if (exactSingular) return exactSingular;

  let bestMatch = '';
  const variants = [compact, singularCompact];
  for (const alias of aliasToCanonical.keys()) {
    for (const variant of variants) {
      if (variant && variant.includes(alias) && alias.length > bestMatch.length) {
        bestMatch = alias;
      }
    }
  }

  if (bestMatch) return aliasToCanonical.get(bestMatch) ?? (compact || singularCompact);
  return compact || singularCompact;
}

function isFoodLabel(label) {
  if (!label) return false;
  if (canonicalFoodLabels.has(label)) return true;
  if (NON_FOOD_HINTS.has(label)) return false;

  for (const hint of NON_FOOD_HINTS) {
    if (label.includes(hint)) return false;
  }

  for (const canonical of canonicalFoodLabels) {
    if (label.includes(canonical) || canonical.includes(label)) {
      return true;
    }
  }

  return false;
}

export function normalizeAndFilterFoodItems(items, threshold = DEFAULT_THRESHOLD) {
  const byName = new Map();

  for (const item of items ?? []) {
    if (!item || typeof item.name !== 'string') continue;
    if (typeof item.confidence !== 'number' || Number.isNaN(item.confidence)) continue;
    if (item.confidence < threshold) continue;

    const canonical = toCanonicalLabel(item.name);
    if (!isFoodLabel(canonical)) continue;

    const prev = byName.get(canonical);
    if (!prev || item.confidence > prev.confidence) {
      byName.set(canonical, { name: canonical, confidence: item.confidence });
    }
  }

  return [...byName.values()].sort((a, b) => b.confidence - a.confidence);
}
