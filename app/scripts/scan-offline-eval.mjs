import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TOPK = 5;

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );

  const topkRaw = Number.parseInt(kv.get('topk') ?? String(DEFAULT_TOPK), 10);
  const endpointRaw = kv.get('endpoint') ?? process.env.SCAN_EVAL_ENDPOINT ?? 'http://127.0.0.1:8787/api/predict-dish';
  const casesRaw = kv.get('cases') ?? 'scripts/scan-eval-cases.json';
  const recordsDaysRaw = Number.parseInt(kv.get('records-days') ?? '14', 10);

  return {
    topk: Number.isFinite(topkRaw) ? Math.max(1, Math.min(10, topkRaw)) : DEFAULT_TOPK,
    endpoint: endpointRaw,
    casesPath: casesRaw,
    recordsDays: Number.isFinite(recordsDaysRaw) && recordsDaysRaw > 0 ? recordsDaysRaw : 14,
  };
}

function normalizeLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findRecordsDir() {
  const candidates = [
    path.resolve(process.cwd(), '..', 'food_detection_bot', 'dataset', 'records'),
    path.resolve(process.cwd(), 'food_detection_bot', 'dataset', 'records'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseFeedbackContext(feedbackNotes) {
  if (typeof feedbackNotes !== 'string' || !feedbackNotes.trim()) return null;
  try {
    const parsed = JSON.parse(feedbackNotes);
    if (parsed && typeof parsed === 'object' && parsed.context && typeof parsed.context === 'object') {
      return parsed.context;
    }
    return null;
  } catch {
    return null;
  }
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function toPct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function loadEvalCases(casesPath) {
  const absolute = path.resolve(process.cwd(), casesPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing eval case file: ${absolute}`);
  }
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Eval case file must be an array.');
  }

  return parsed
    .map((row, index) => {
      const imagePath = path.resolve(process.cwd(), String(row?.imagePath ?? ''));
      const expected = Array.isArray(row?.expected)
        ? row.expected.map((entry) => normalizeLabel(entry)).filter(Boolean)
        : [normalizeLabel(row?.expectedLabel)].filter(Boolean);

      if (!fs.existsSync(imagePath) || expected.length === 0) return null;
      return {
        id: String(row?.id ?? `case-${index + 1}`),
        imagePath,
        expected,
      };
    })
    .filter((row) => row !== null);
}

async function predictDish(endpoint, imagePath, topk) {
  const bytes = fs.readFileSync(imagePath);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('image', blob, path.basename(imagePath));
  form.append('topk', String(topk));

  const startedAt = Date.now();
  const response = await fetch(endpoint, { method: 'POST', body: form });
  const latencyMs = Date.now() - startedAt;
  const payload = await response.json();
  if (!response.ok) {
    return { ok: false, latencyMs, predictions: [], error: String(payload?.message ?? payload?.error ?? response.status) };
  }

  const predictions = Array.isArray(payload?.results)
    ? payload.results
        .map((row) => ({ label: normalizeLabel(row?.label), confidence: Number(row?.confidence ?? 0) }))
        .filter((row) => row.label)
    : [];

  return { ok: true, latencyMs, predictions, error: null };
}

function buildTelemetrySlice(recordsDays) {
  const recordsDir = findRecordsDir();
  if (!recordsDir) {
    return {
      available: false,
      reason: 'records_dir_missing',
    };
  }

  const thresholdTs = Date.now() - recordsDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));

  let total = 0;
  let correctionCount = 0;
  let ocrUsable = 0;
  let ocrRows = 0;
  let brandBoostWin = 0;
  let brandBoostApplied = 0;
  const resolveLatency = [];

  for (const file of files) {
    const full = path.join(recordsDir, file);
    try {
      const row = JSON.parse(fs.readFileSync(full, 'utf8'));
      const createdTs = Date.parse(String(row?.created_at ?? ''));
      if (!Number.isFinite(createdTs) || createdTs < thresholdTs) continue;
      const ctx = parseFeedbackContext(row?.feedback_notes);
      if (!ctx || typeof ctx !== 'object') continue;
      total += 1;
      if (ctx.hadCorrectionTap === true) correctionCount += 1;
      if (typeof ctx.ocrTextCharCount === 'number' && Number.isFinite(ctx.ocrTextCharCount)) {
        ocrRows += 1;
        if (ctx.ocrTextCharCount >= 8 && (ctx.ocrSeedCount ?? 0) > 0) ocrUsable += 1;
      }
      if (ctx.ocrBrandBoostUsed === true || ctx.brandBoostWasApplied === true) brandBoostApplied += 1;
      if (ctx.brandBoostWon === true || String(ctx.seedWinSource ?? '') === 'ocr_brand') brandBoostWin += 1;
      if (typeof ctx.resolveLatencyMs === 'number' && Number.isFinite(ctx.resolveLatencyMs)) {
        resolveLatency.push(Math.max(0, Math.round(ctx.resolveLatencyMs)));
      }
    } catch {
      // ignore
    }
  }

  return {
    available: true,
    windowDays: recordsDays,
    sampleCount: total,
    correctionRatePct: toPct(correctionCount, total),
    ocrUsableRatePct: toPct(ocrUsable, ocrRows),
    brandBoostWinRatePct: toPct(brandBoostWin, Math.max(1, brandBoostApplied)),
    resolveLatencyP95Ms: percentile(resolveLatency, 95),
  };
}

async function run() {
  const { topk, endpoint, casesPath, recordsDays } = parseArgs();
  const cases = loadEvalCases(casesPath);
  if (!cases.length) {
    throw new Error('No valid eval cases found. Add entries to scripts/scan-eval-cases.json.');
  }

  let top1Hits = 0;
  let topKHits = 0;
  let failedRequests = 0;
  const latency = [];
  const failures = [];

  for (const testCase of cases) {
    const result = await predictDish(endpoint, testCase.imagePath, topk);
    latency.push(result.latencyMs);
    if (!result.ok) {
      failedRequests += 1;
      failures.push({ id: testCase.id, error: result.error });
      continue;
    }

    const labels = result.predictions.map((row) => row.label);
    const top1 = labels[0] ?? null;
    const topkSlice = labels.slice(0, topk);

    if (top1 && testCase.expected.includes(top1)) top1Hits += 1;
    if (topkSlice.some((label) => testCase.expected.includes(label))) topKHits += 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    endpoint,
    topk,
    cases: cases.length,
    failedRequests,
    dishHitRate: {
      top1Pct: toPct(top1Hits, cases.length),
      topKPct: toPct(topKHits, cases.length),
    },
    latencyMs: {
      p50: percentile(latency, 50),
      p95: percentile(latency, 95),
    },
    telemetrySlice: buildTelemetrySlice(recordsDays),
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
}

run();
