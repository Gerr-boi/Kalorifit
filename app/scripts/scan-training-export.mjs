import fs from 'node:fs';
import path from 'node:path';
import { deriveActiveLearningFromRecord, priorityWeight } from './scan-data-utils.mjs';

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );
  const daysRaw = Number.parseInt(kv.get('days') ?? '30', 10);
  const limitRaw = Number.parseInt(kv.get('limit') ?? '250', 10);
  const outRaw = kv.get('out') ?? 'server/data/scan-training-export.json';
  return {
    days: Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100,
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

function normalizeLabel(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function buildTrainingTarget(row) {
  if (row?.not_food === true) return { label: 'non_food_packaging', source: 'hard_negative' };
  const corrected = normalizeLabel(row?.user_corrected_to);
  if (corrected) return { label: corrected, source: 'user_corrected' };
  const accepted = normalizeLabel(row?.user_accepted_product);
  if (accepted) return { label: accepted, source: 'user_accepted' };
  const predicted = normalizeLabel(row?.predicted_product);
  if (predicted) return { label: predicted, source: 'predicted' };
  return { label: null, source: 'unknown' };
}

function run() {
  const { days, limit, outPath } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));

  const items = [];
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

    const activeLearning = deriveActiveLearningFromRecord(row);
    const target = buildTrainingTarget(row);
    const packagingType = typeof row?.analysis?.packaging_type === 'string' ? row.analysis.packaging_type : null;
    const qualityBucket = typeof row?.data_quality?.quality_bucket === 'string' ? row.data_quality.quality_bucket : null;
    const priority = typeof row?.training_priority === 'string' ? row.training_priority : (activeLearning.candidate ? 'medium' : 'low');

    if (!activeLearning.candidate && !target.label) continue;

    items.push({
      scan_log_id: row.scan_log_id,
      created_at: row.created_at,
      image_path: row.image_path,
      cropped_package_image_path: row.cropped_package_image_path ?? null,
      domain_key: activeLearning.domain_key,
      training_priority: priority,
      active_learning_score: activeLearning.score,
      active_learning_reasons: activeLearning.reasons,
      packaging_type: packagingType,
      quality_bucket: qualityBucket,
      failure_tags: Array.isArray(row?.failure_tags) ? row.failure_tags : [],
      target_label: target.label,
      target_source: target.source,
      predicted_product: row.predicted_product ?? null,
      user_corrected_to: row.user_corrected_to ?? null,
      not_food: row.not_food === true,
    });
  }

  items.sort((a, b) => {
    const p = priorityWeight(b.training_priority) - priorityWeight(a.training_priority);
    if (p !== 0) return p;
    return b.active_learning_score - a.active_learning_score;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    itemCount: items.length,
    export: items.slice(0, limit),
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, outPath: absoluteOutPath, itemCount: items.length }, null, 2));
}

run();
