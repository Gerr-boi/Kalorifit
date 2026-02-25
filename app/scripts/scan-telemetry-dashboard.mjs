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
  const daysRaw = Number.parseInt(kv.get('days') ?? '7', 10);
  const outRaw = kv.get('out') ?? 'server/data/scan-telemetry-dashboard.json';
  return {
    days: Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7,
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

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function run() {
  const { days, outPath } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));
  const sessions = [];
  for (const file of files) {
    const full = path.join(recordsDir, file);
    try {
      const row = JSON.parse(fs.readFileSync(full, 'utf8'));
      const createdTs = Date.parse(String(row?.created_at ?? ''));
      if (!Number.isFinite(createdTs) || createdTs < thresholdTs) continue;
      sessions.push(row);
    } catch {
      // ignore bad rows
    }
  }

  const contexts = sessions
    .map((row) => parseFeedbackContext(row?.feedback_notes))
    .filter((ctx) => ctx && typeof ctx === 'object');

  const ttfc = [];
  const resolveLatency = [];
  const seedWins = {
    dish_prediction: 0,
    selected_prediction: 0,
    vision_prediction: 0,
    ocr_text: 0,
    ocr_brand: 0,
    manual_search: 0,
  };

  let corrections = 0;
  let highConfidenceWrong = 0;
  let ocrGatePassed = 0;
  let ocrRows = 0;
  let brandBoostApplied = 0;
  let brandBoostWon = 0;

  for (const ctx of contexts) {
    const seed = String(ctx.seedWinSource ?? '');
    if (seed in seedWins) seedWins[seed] += 1;

    const hadCorrection = ctx.hadCorrectionTap === true;
    if (hadCorrection) corrections += 1;

    const chosenScore = typeof ctx.resolverChosenScore === 'number' ? ctx.resolverChosenScore : null;
    const chosenId = String(ctx.resolverChosenItemId ?? '').trim();
    const finalId = String(ctx.userFinalItemId ?? ctx.brandBoostUserFinalItemId ?? '').trim();
    if (hadCorrection && chosenScore !== null && chosenScore >= 0.75 && chosenId && finalId && chosenId !== finalId) {
      highConfidenceWrong += 1;
    }

    if (typeof ctx.timeToFirstCandidateMs === 'number' && Number.isFinite(ctx.timeToFirstCandidateMs)) {
      ttfc.push(Math.max(0, Math.round(ctx.timeToFirstCandidateMs)));
    }
    if (typeof ctx.resolveLatencyMs === 'number' && Number.isFinite(ctx.resolveLatencyMs)) {
      resolveLatency.push(Math.max(0, Math.round(ctx.resolveLatencyMs)));
    }

    if (typeof ctx.ocrTextCharCount === 'number' && Number.isFinite(ctx.ocrTextCharCount)) {
      ocrRows += 1;
      if (ctx.ocrTextCharCount >= 8) ocrGatePassed += 1;
    }

    if (ctx.ocrBrandBoostUsed === true || ctx.brandBoostWasApplied === true) {
      brandBoostApplied += 1;
    }
    if (ctx.brandBoostWon === true || String(ctx.seedWinSource ?? '') === 'ocr_brand') {
      brandBoostWon += 1;
    }
  }

  const total = contexts.length;
  const ocrGatePassPct = pct(ocrGatePassed, ocrRows);
  const brandBoostWinRatePct = pct(brandBoostWon, Math.max(1, brandBoostApplied));
  const correctionRatePct = pct(corrections, total);
  const highConfidenceWrongPct = pct(highConfidenceWrong, total);

  const alerts = [];
  if (highConfidenceWrongPct >= 6) {
    alerts.push({ level: 'warn', key: 'high_confidence_wrong_spike', valuePct: highConfidenceWrongPct, thresholdPct: 6 });
  }
  if (ocrRows >= 12 && ocrGatePassPct < 35) {
    alerts.push({ level: 'warn', key: 'ocr_gate_pass_collapse', valuePct: ocrGatePassPct, thresholdPct: 35 });
  }
  if (brandBoostApplied >= 8 && brandBoostWinRatePct < 12) {
    alerts.push({ level: 'warn', key: 'brand_boost_drift', valuePct: brandBoostWinRatePct, thresholdPct: 12 });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    sessions: sessions.length,
    sessionsWithTelemetry: total,
    seedWinRate: {
      dishSeedPct: pct(seedWins.dish_prediction + seedWins.selected_prediction, total),
      visionSeedPct: pct(seedWins.vision_prediction, total),
      ocrTextSeedPct: pct(seedWins.ocr_text, total),
      ocrBrandSeedPct: pct(seedWins.ocr_brand, total),
      manualSearchPct: pct(seedWins.manual_search, total),
    },
    correctionRatePct,
    highConfidenceWrongRatePct: highConfidenceWrongPct,
    ocr: {
      sampleCount: ocrRows,
      textGatePassPct: ocrGatePassPct,
    },
    brandBoost: {
      appliedCount: brandBoostApplied,
      wonCount: brandBoostWon,
      winRatePct: brandBoostWinRatePct,
    },
    latencyMs: {
      ttfcP50: percentile(ttfc, 50),
      ttfcP95: percentile(ttfc, 95),
      resolveP50: percentile(resolveLatency, 50),
      resolveP95: percentile(resolveLatency, 95),
    },
    alerts,
  };

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  fs.writeFileSync(absoluteOutPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ ok: true, outPath: absoluteOutPath, alerts: alerts.length }, null, 2));
}

run();
