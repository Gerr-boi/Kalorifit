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
  const outRaw = kv.get('out') ?? 'server/data/scan-dataset-miner.json';
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

function topEntries(map, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function augmentationPriorities(tagCounts, total) {
  const pct = (key) => (total ? ((tagCounts.get(key) ?? 0) / total) * 100 : 0);
  const priorities = [];
  if (pct('specular_glare') >= 8) priorities.push('Increase specular glare/reflection augmentation for curved packaging.');
  if (pct('motion_or_focus_blur') >= 8) priorities.push('Increase motion blur and defocus blur augmentation.');
  if (pct('low_light') >= 8) priorities.push('Increase low-light noise and exposure-shift augmentation.');
  if (pct('low_label_visibility') >= 6) priorities.push('Prioritize label-region detection and front-of-pack visibility scoring.');
  if (pct('hard_negative_non_food') >= 5 || pct('non_food_confuser_seen') >= 10) {
    priorities.push('Mine hard negatives from non-food household packaging and retrain with class-balanced sampling.');
  }
  return priorities;
}

function run() {
  const { days, outPath } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));

  const records = [];
  for (const file of files) {
    const full = path.join(recordsDir, file);
    try {
      const row = JSON.parse(fs.readFileSync(full, 'utf8'));
      const createdTs = Date.parse(String(row?.created_at ?? ''));
      if (!Number.isFinite(createdTs) || createdTs < thresholdTs) continue;
      records.push(row);
    } catch {
      // ignore bad rows
    }
  }

  const packagingCounts = new Map();
  const failureTagCounts = new Map();
  const qualityCounts = new Map();
  const hardNegativeCounts = new Map();
  const correctionPairs = new Map();
  const predictionCounts = new Map();

  let corrected = 0;
  let badPhoto = 0;
  let notFood = 0;

  for (const row of records) {
    const analysis = row?.analysis && typeof row.analysis === 'object' ? row.analysis : {};
    const packagingType = typeof analysis.packaging_type === 'string' ? analysis.packaging_type : 'unknown';
    increment(packagingCounts, packagingType);

    const dataQuality = row?.data_quality && typeof row.data_quality === 'object' ? row.data_quality : {};
    increment(qualityCounts, typeof dataQuality.quality_bucket === 'string' ? dataQuality.quality_bucket : 'unknown');

    const failureTags = Array.isArray(row?.failure_tags) ? row.failure_tags : [];
    for (const tag of failureTags) increment(failureTagCounts, String(tag));

    const predictions = Array.isArray(row?.predictions) ? row.predictions : [];
    for (const prediction of predictions.slice(0, 3)) {
      increment(predictionCounts, typeof prediction?.cls === 'string' ? prediction.cls : null);
    }

    if (row?.bad_photo === true) badPhoto += 1;
    if (row?.not_food === true) {
      notFood += 1;
      for (const prediction of predictions.slice(0, 3)) {
        increment(hardNegativeCounts, typeof prediction?.cls === 'string' ? prediction.cls : null);
      }
    }
    if (typeof row?.user_corrected_to === 'string' && row.user_corrected_to.trim()) {
      corrected += 1;
      const predicted = typeof row?.predicted_product === 'string' && row.predicted_product.trim()
        ? row.predicted_product.trim()
        : 'unknown_prediction';
      const key = `${predicted} -> ${row.user_corrected_to.trim()}`;
      increment(correctionPairs, key);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    totalRecords: records.length,
    correctedCount: corrected,
    badPhotoCount: badPhoto,
    notFoodCount: notFood,
    packagingBalance: topEntries(packagingCounts, 12),
    qualityBuckets: topEntries(qualityCounts, 8),
    failureTags: topEntries(failureTagCounts, 16),
    topHardNegatives: topEntries(hardNegativeCounts, 12),
    topPredictionLabels: topEntries(predictionCounts, 12),
    topCorrections: topEntries(correctionPairs, 12),
    augmentationPriorities: augmentationPriorities(failureTagCounts, records.length),
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, outPath: absoluteOutPath, totalRecords: records.length }, null, 2));
}

run();
