import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './scan-csv-utils.mjs';

const ALLOWED_BUCKETS = new Set([
  'wrong_product_right_brand',
  'wrong_brand',
  'false_positive',
  'good_match_low_confidence',
  'unknown_not_in_db',
  'bad_image',
]);

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );
  return {
    inPath: kv.get('in') ?? 'server/data/scan-triage-sheet.csv',
    outPath: kv.get('out') ?? 'server/data/scan-dataset-manifest.json',
  };
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit = 20) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function manifestPath(bucket, row) {
  const target = normalize(row.target_label) || 'unknown';
  const predicted = normalize(row.predicted_product) || 'unknown';
  if (bucket === 'false_positive') return 'train/hard_negatives';
  if (bucket === 'bad_image') return 'train/quality_failures';
  if (bucket === 'unknown_not_in_db') return 'train/unknown_candidates';
  if (bucket === 'good_match_low_confidence') return 'train/positives';
  if (bucket === 'wrong_product_right_brand') return `train/confusions/${predicted}_vs_${target}`;
  if (bucket === 'wrong_brand') return `train/confusions/${predicted}_vs_${target}`;
  return 'train/misc';
}

function run() {
  const { inPath, outPath } = parseArgs();
  const absoluteInPath = path.resolve(process.cwd(), inPath);
  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  const rows = parseCsv(fs.readFileSync(absoluteInPath, 'utf8'));

  const reviewed = rows.filter((row) => {
    const bucket = normalize(row.bucket || row.suggested_bucket);
    return ALLOWED_BUCKETS.has(bucket) && normalize(row.review_status) !== 'skip';
  });

  const bucketCounts = new Map();
  const confusionPairs = new Map();
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCsv: absoluteInPath,
    reviewedCount: reviewed.length,
    targets: {
      positives: [],
      hard_negatives: [],
      confusions: {},
      quality_failures: [],
      unknown_candidates: [],
    },
    summary: {
      bucketCounts: [],
      topConfusionPairs: [],
    },
  };

  for (const row of reviewed) {
    const bucket = normalize(row.bucket || row.suggested_bucket);
    increment(bucketCounts, bucket);
    const entry = {
      scan_log_id: row.scan_log_id,
      created_at: row.created_at,
      image_path: row.image_path,
      cropped_package_image_path: row.cropped_package_image_path,
      manifest_path: manifestPath(bucket, row),
      bucket,
      predicted_product: row.predicted_product,
      target_label: row.target_label,
      domain_key: row.domain_key,
      packaging_type: row.packaging_type,
      quality_bucket: row.quality_bucket,
      active_learning_score: Number.parseFloat(row.active_learning_score || '0') || 0,
      notes: row.notes,
    };

    if (bucket === 'false_positive') {
      output.targets.hard_negatives.push(entry);
    } else if (bucket === 'bad_image') {
      output.targets.quality_failures.push(entry);
    } else if (bucket === 'unknown_not_in_db') {
      output.targets.unknown_candidates.push(entry);
    } else if (bucket === 'good_match_low_confidence') {
      output.targets.positives.push(entry);
    } else if (bucket === 'wrong_product_right_brand' || bucket === 'wrong_brand') {
      const pair = `${normalize(row.predicted_product) || 'unknown'}__vs__${normalize(row.target_label) || 'unknown'}`;
      if (!output.targets.confusions[pair]) output.targets.confusions[pair] = [];
      output.targets.confusions[pair].push(entry);
      increment(confusionPairs, pair);
    }
  }

  output.summary.bucketCounts = topEntries(bucketCounts);
  output.summary.topConfusionPairs = topEntries(confusionPairs);

  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outPath: absoluteOutPath,
    reviewedCount: reviewed.length,
    bucketCounts: output.summary.bucketCounts,
  }, null, 2));
}

run();
