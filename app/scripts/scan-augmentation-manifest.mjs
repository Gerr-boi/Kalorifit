import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );
  const daysRaw = Number.parseInt(kv.get('days') ?? '30', 10);
  const outRaw = kv.get('out') ?? 'server/data/scan-augmentation-manifest.json';
  return {
    days: Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30,
    outPath: outRaw,
  };
}

function findRecordsDir() {
  const candidates = [
    path.resolve(process.cwd(), '..', 'food_detection_bot', 'dataset', 'records'),
    path.resolve(process.cwd(), 'food_detection_bot', 'dataset', 'records'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not find food_detection_bot/dataset/records directory.');
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function run() {
  const { days, outPath } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));

  const recipeCounts = new Map();
  const packagingCounts = new Map();
  const examplesByRecipe = new Map();

  for (const file of files) {
    const full = path.join(recordsDir, file);
    let row;
    try {
      row = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const createdTs = Date.parse(String(row?.created_at ?? ''));
    if (!Number.isFinite(createdTs) || createdTs < thresholdTs) continue;

    const quality = row?.data_quality && typeof row.data_quality === 'object' ? row.data_quality : {};
    const flags = quality?.condition_flags && typeof quality.condition_flags === 'object' ? quality.condition_flags : {};
    const packagingType = typeof quality.packaging_type === 'string' ? quality.packaging_type : 'unknown';
    increment(packagingCounts, packagingType);

    const recipes = [];
    if (flags.glare) recipes.push('specular_glare');
    if (flags.blur) recipes.push('motion_blur_and_defocus');
    if (flags.low_light) recipes.push('low_light_and_sensor_noise');
    if (flags.low_label_visibility) recipes.push('perspective_tilt_and_partial_occlusion');
    if (flags.ambiguous_match) recipes.push('crop_shift_and_partial_visibility');
    if (flags.weak_ocr && !flags.low_label_visibility) recipes.push('label_text_dropout');

    for (const recipe of recipes) {
      increment(recipeCounts, recipe);
      const current = examplesByRecipe.get(recipe) ?? [];
      if (current.length < 6) {
        current.push({
          scan_log_id: row.scan_log_id,
          image_path: row.image_path,
          packaging_type: packagingType,
          training_priority: row.training_priority ?? 'low',
          failure_tags: Array.isArray(row.failure_tags) ? row.failure_tags : [],
        });
        examplesByRecipe.set(recipe, current);
      }
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    augmentationRecipes: topEntries(recipeCounts).map((entry) => ({
      name: entry.name,
      count: entry.count,
      samplePackaging: topEntries(packagingCounts, 6),
      examples: examplesByRecipe.get(entry.name) ?? [],
    })),
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, outPath: absoluteOutPath, recipeCount: manifest.augmentationRecipes.length }, null, 2));
}

run();
