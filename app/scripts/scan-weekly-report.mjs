import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const arg = process.argv.find((item) => item.startsWith('--days='));
  const days = arg ? Number.parseInt(arg.split('=')[1], 10) : 7;
  return { days: Number.isFinite(days) && days > 0 ? days : 7 };
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

function toPct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function run() {
  const { days } = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - days * 24 * 60 * 60 * 1000;

  const files = fs.readdirSync(recordsDir).filter((name) => name.endsWith('.json'));
  const weekly = [];
  for (const file of files) {
    const full = path.join(recordsDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      const createdTs = Date.parse(String(data?.created_at ?? ''));
      if (!Number.isFinite(createdTs) || createdTs < thresholdTs) continue;
      weekly.push(data);
    } catch {
      // ignore bad rows
    }
  }

  const contexts = weekly
    .map((row) => parseFeedbackContext(row?.feedback_notes))
    .filter((ctx) => ctx && typeof ctx === 'object');

  const seedWins = {
    dish_prediction: 0,
    vision_prediction: 0,
    selected_prediction: 0,
    ocr_text: 0,
    ocr_brand: 0,
    manual_search: 0,
  };
  let correctionTaps = 0;
  let highConfidenceWrong = 0;
  let circuitOpen = 0;
  let ocrRows = 0;
  let ocrTextGatePassed = 0;
  let brandBoostApplied = 0;
  let brandBoostWon = 0;
  const ttfc = [];

  for (const ctx of contexts) {
    const seed = String(ctx.seedWinSource ?? '');
    if (seed in seedWins) seedWins[seed] += 1;
    if (ctx.hadCorrectionTap === true) correctionTaps += 1;
    const chosenScore = typeof ctx.resolverChosenScore === 'number' ? ctx.resolverChosenScore : null;
    const chosenId = String(ctx.resolverChosenItemId ?? '').trim();
    const finalId = String(ctx.userFinalItemId ?? ctx.brandBoostUserFinalItemId ?? '').trim();
    if (ctx.hadCorrectionTap === true && chosenScore !== null && chosenScore >= 0.75 && chosenId && finalId && chosenId !== finalId) {
      highConfidenceWrong += 1;
    }
    if (ctx.circuitOpen === true) circuitOpen += 1;
    if (typeof ctx.ocrTextCharCount === 'number' && Number.isFinite(ctx.ocrTextCharCount)) {
      ocrRows += 1;
      if (ctx.ocrTextCharCount >= 8) ocrTextGatePassed += 1;
    }
    if (ctx.ocrBrandBoostUsed === true || ctx.brandBoostWasApplied === true) brandBoostApplied += 1;
    if (ctx.brandBoostWon === true || String(ctx.seedWinSource ?? '') === 'ocr_brand') brandBoostWon += 1;
    if (typeof ctx.timeToFirstCandidateMs === 'number' && Number.isFinite(ctx.timeToFirstCandidateMs)) {
      ttfc.push(Math.max(0, Math.round(ctx.timeToFirstCandidateMs)));
    }
  }

  const totalContext = contexts.length;
  const report = {
    windowDays: days,
    sessions: weekly.length,
    sessionsWithTelemetry: totalContext,
    seedWinRate: {
      dishSeedPct: toPct(seedWins.dish_prediction + seedWins.selected_prediction, totalContext),
      visionSeedPct: toPct(seedWins.vision_prediction, totalContext),
      ocrTextSeedPct: toPct(seedWins.ocr_text, totalContext),
      ocrBrandSeedPct: toPct(seedWins.ocr_brand, totalContext),
      manualSearchPct: toPct(seedWins.manual_search, totalContext),
    },
    correctionRatePct: toPct(correctionTaps, totalContext),
    highConfidenceWrongRatePct: toPct(highConfidenceWrong, totalContext),
    ocrTextGatePassPct: toPct(ocrTextGatePassed, ocrRows),
    brandBoostWinRatePct: toPct(brandBoostWon, Math.max(1, brandBoostApplied)),
    timeToFirstCandidateMs: {
      p50: percentile(ttfc, 50),
      p90: percentile(ttfc, 90),
      sampleCount: ttfc.length,
    },
    circuitOpenRatePct: toPct(circuitOpen, totalContext),
    alerts: [
      ...(toPct(highConfidenceWrong, totalContext) >= 6
        ? [{ level: 'warn', key: 'high_confidence_wrong_spike', thresholdPct: 6 }]
        : []),
      ...(ocrRows >= 12 && toPct(ocrTextGatePassed, ocrRows) < 35
        ? [{ level: 'warn', key: 'ocr_text_gate_pass_collapse', thresholdPct: 35 }]
        : []),
      ...(brandBoostApplied >= 8 && toPct(brandBoostWon, Math.max(1, brandBoostApplied)) < 12
        ? [{ level: 'warn', key: 'brand_boost_drift', thresholdPct: 12 }]
        : []),
    ],
  };

  console.log(JSON.stringify(report, null, 2));
}

run();
