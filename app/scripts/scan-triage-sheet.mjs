import fs from 'node:fs';
import path from 'node:path';
import { toCsv } from './scan-csv-utils.mjs';

const BUCKETS = [
  'wrong_product_right_brand',
  'wrong_brand',
  'false_positive',
  'good_match_low_confidence',
  'unknown_not_in_db',
  'bad_image',
];

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );
  return {
    inPath: kv.get('in') ?? 'server/data/scan-training-export.json',
    outPath: kv.get('out') ?? 'server/data/scan-triage-sheet.csv',
  };
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function tokenSet(value) {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

function overlapRatio(a, b) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function suggestBucket(item) {
  const failureTags = Array.isArray(item.failure_tags) ? item.failure_tags.map(normalize) : [];
  const reasons = Array.isArray(item.active_learning_reasons) ? item.active_learning_reasons.map(normalize) : [];
  const predicted = normalize(item.predicted_product);
  const target = normalize(item.target_label || item.user_corrected_to);

  if (item.not_food === true || failureTags.includes('hard_negative_non_food')) return 'false_positive';
  if (failureTags.includes('bad_photo') || failureTags.includes('motion_or_focus_blur') || failureTags.includes('specular_glare') || failureTags.includes('low_light') || failureTags.includes('low_label_visibility')) {
    return 'bad_image';
  }
  if (!predicted && target) return 'unknown_not_in_db';
  if (predicted && target && predicted !== target) {
    const predictedTokens = tokenSet(predicted);
    const targetTokens = tokenSet(target);
    const ratio = overlapRatio(predictedTokens, targetTokens);
    return ratio >= 0.34 ? 'wrong_product_right_brand' : 'wrong_brand';
  }
  if ((reasons.includes('low_confidence') || reasons.includes('candidate_disagreement')) && (!target || predicted === target)) {
    return 'good_match_low_confidence';
  }
  return 'unknown_not_in_db';
}

function duplicateKey(item) {
  const predicted = normalize(item.predicted_product) || 'none';
  const target = normalize(item.target_label || item.user_corrected_to) || 'none';
  const domain = normalize(item.domain_key) || 'unknown';
  const packaging = normalize(item.packaging_type) || 'unknown';
  return `${predicted}|${target}|${domain}|${packaging}`;
}

function priorityBand(item) {
  const priority = normalize(item.training_priority);
  if (priority === 'high') return 'A';
  if (priority === 'medium') return 'B';
  return 'C';
}

function run() {
  const { inPath, outPath } = parseArgs();
  const absoluteInPath = path.resolve(process.cwd(), inPath);
  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  const parsed = JSON.parse(fs.readFileSync(absoluteInPath, 'utf8'));
  const items = Array.isArray(parsed?.export) ? parsed.export : [];

  const rows = items.map((item) => ({
    review_status: 'todo',
    bucket: '',
    suggested_bucket: suggestBucket(item),
    priority_band: priorityBand(item),
    scan_log_id: item.scan_log_id ?? '',
    created_at: item.created_at ?? '',
    domain_key: item.domain_key ?? '',
    duplicate_key: duplicateKey(item),
    image_path: item.image_path ?? '',
    cropped_package_image_path: item.cropped_package_image_path ?? '',
    predicted_product: item.predicted_product ?? '',
    target_label: item.target_label ?? '',
    target_source: item.target_source ?? '',
    packaging_type: item.packaging_type ?? '',
    quality_bucket: item.quality_bucket ?? '',
    active_learning_score: item.active_learning_score ?? '',
    active_learning_reasons: Array.isArray(item.active_learning_reasons) ? item.active_learning_reasons.join('|') : '',
    failure_tags: Array.isArray(item.failure_tags) ? item.failure_tags.join('|') : '',
    not_food: item.not_food === true ? 'true' : 'false',
    notes: '',
  }));

  const headers = [
    'review_status',
    'bucket',
    'suggested_bucket',
    'priority_band',
    'scan_log_id',
    'created_at',
    'domain_key',
    'duplicate_key',
    'image_path',
    'cropped_package_image_path',
    'predicted_product',
    'target_label',
    'target_source',
    'packaging_type',
    'quality_bucket',
    'active_learning_score',
    'active_learning_reasons',
    'failure_tags',
    'not_food',
    'notes',
  ];

  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, toCsv(rows, headers), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outPath: absoluteOutPath,
    rowCount: rows.length,
    buckets: BUCKETS,
  }, null, 2));
}

run();
