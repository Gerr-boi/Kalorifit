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
  const limitRaw = Number.parseInt(kv.get('limit') ?? '50', 10);
  const outRaw = kv.get('out') ?? 'server/data/scan-active-learning-queue.json';
  return {
    days: Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50,
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

function run() {
  const { days, limit, outPath } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));

  const candidates = [];
  const reasons = new Map();
  const domains = new Map();

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
    if (activeLearning.candidate !== true) continue;

    const reasonList = Array.isArray(activeLearning.reasons) ? activeLearning.reasons.map(String) : [];
    for (const reason of reasonList) increment(reasons, reason);
    increment(domains, typeof activeLearning.domain_key === 'string' ? activeLearning.domain_key : 'unknown');

    candidates.push({
      scan_log_id: row.scan_log_id,
      created_at: row.created_at,
      image_path: row.image_path,
      predicted_product: row.predicted_product ?? null,
      user_corrected_to: row.user_corrected_to ?? null,
      training_priority: row.training_priority ?? 'low',
      active_learning_score: typeof activeLearning.score === 'number' ? activeLearning.score : 0,
      active_learning_reasons: reasonList,
      domain_key: activeLearning.domain_key ?? 'unknown',
      packaging_type: row?.analysis?.packaging_type ?? null,
      quality_bucket: row?.data_quality?.quality_bucket ?? null,
      failure_tags: Array.isArray(row?.failure_tags) ? row.failure_tags : [],
    });
  }

  candidates.sort((a, b) => {
    const deltaPriority = priorityWeight(b.training_priority) - priorityWeight(a.training_priority);
    if (deltaPriority !== 0) return deltaPriority;
    return b.active_learning_score - a.active_learning_score;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    candidateCount: candidates.length,
    topReasons: topEntries(reasons, 12),
    topDomains: topEntries(domains, 12),
    queue: candidates.slice(0, limit),
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, outPath: absoluteOutPath, candidateCount: candidates.length }, null, 2));
}

run();
