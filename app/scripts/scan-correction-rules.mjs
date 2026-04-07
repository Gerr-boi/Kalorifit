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

  const daysRaw = Number.parseInt(kv.get('days') ?? '21', 10);
  const minSeenRaw = Number.parseInt(kv.get('min-seen') ?? '3', 10);
  const minCorrectionsRaw = Number.parseInt(kv.get('min-corrections') ?? '2', 10);
  const minRateRaw = Number.parseFloat(kv.get('min-rate') ?? '0.55');
  const outRaw = kv.get('out') ?? 'server/data/scan-ranking-rules.json';

  return {
    days: Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 21,
    minSeen: Number.isFinite(minSeenRaw) && minSeenRaw > 0 ? minSeenRaw : 3,
    minCorrections: Number.isFinite(minCorrectionsRaw) && minCorrectionsRaw > 0 ? minCorrectionsRaw : 2,
    minRate: Number.isFinite(minRateRaw) && minRateRaw > 0 && minRateRaw <= 1 ? minRateRaw : 0.55,
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

function normalizeId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || null;
}

function getCanonical(ctx) {
  return normalizeId(ctx?.brandBoostTopCanonical ?? null);
}

function getChosenId(ctx) {
  return normalizeId(ctx?.brandBoostResolverChosenItemId ?? ctx?.resolverChosenItemId ?? null);
}

function getFinalId(ctx) {
  return normalizeId(ctx?.brandBoostUserFinalItemId ?? ctx?.userFinalItemId ?? null);
}

function toFixed(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function run() {
  const args = parseArgs();
  const recordsDir = findRecordsDir();
  const thresholdTs = Date.now() - args.days * 24 * 60 * 60 * 1000;

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
      // ignore malformed rows
    }
  }

  const chosenStats = new Map();
  const finalStats = new Map();
  const pairStats = new Map();

  let contextsSeen = 0;
  let correctionContexts = 0;

  for (const row of records) {
    const ctx = parseFeedbackContext(row?.feedback_notes);
    if (!ctx || typeof ctx !== 'object') continue;

    const canonical = getCanonical(ctx);
    const chosenId = getChosenId(ctx);
    const finalId = getFinalId(ctx);
    const corrected = ctx?.hadCorrectionTap === true;

    if (!canonical || !chosenId) continue;
    contextsSeen += 1;
    if (corrected) correctionContexts += 1;

    const chosenKey = `${canonical}|${chosenId}`;
    const chosenBucket = chosenStats.get(chosenKey) ?? {
      canonical,
      itemId: chosenId,
      seenCount: 0,
      correctedAwayCount: 0,
      correctedTo: new Map(),
    };

    chosenBucket.seenCount += 1;

    if (corrected && finalId && finalId !== chosenId) {
      chosenBucket.correctedAwayCount += 1;
      chosenBucket.correctedTo.set(finalId, (chosenBucket.correctedTo.get(finalId) ?? 0) + 1);

      const finalKey = `${canonical}|${finalId}`;
      finalStats.set(finalKey, {
        canonical,
        itemId: finalId,
        correctionCount: (finalStats.get(finalKey)?.correctionCount ?? 0) + 1,
      });

      const pairKey = `${canonical}|${chosenId}|${finalId}`;
      pairStats.set(pairKey, {
        canonical,
        chosenId,
        finalId,
        count: (pairStats.get(pairKey)?.count ?? 0) + 1,
      });
    }

    chosenStats.set(chosenKey, chosenBucket);
  }

  const doNotPrefer = [...chosenStats.values()]
    .map((bucket) => {
      const correctionRate = bucket.seenCount > 0 ? bucket.correctedAwayCount / bucket.seenCount : 0;
      const majorCorrection = [...bucket.correctedTo.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      const penaltyRaw = Math.min(0.34, 0.12 + correctionRate * 0.3);
      return {
        canonical: bucket.canonical,
        itemId: bucket.itemId,
        seenCount: bucket.seenCount,
        correctedAwayCount: bucket.correctedAwayCount,
        correctionRate: toFixed(correctionRate),
        penalty: toFixed(penaltyRaw),
        topCorrectionTo: majorCorrection ? majorCorrection[0] : null,
        topCorrectionCount: majorCorrection ? majorCorrection[1] : 0,
      };
    })
    .filter((row) => row.seenCount >= args.minSeen && row.correctedAwayCount >= args.minCorrections && row.correctionRate >= args.minRate)
    .sort((a, b) => b.correctionRate - a.correctionRate || b.correctedAwayCount - a.correctedAwayCount)
    .slice(0, 200);

  const totalCorrectionsByCanonical = new Map();
  for (const row of finalStats.values()) {
    totalCorrectionsByCanonical.set(
      row.canonical,
      (totalCorrectionsByCanonical.get(row.canonical) ?? 0) + row.correctionCount
    );
  }

  const boosts = [...finalStats.values()]
    .map((row) => {
      const total = totalCorrectionsByCanonical.get(row.canonical) ?? 0;
      const share = total > 0 ? row.correctionCount / total : 0;
      const boostRaw = Math.min(0.22, 0.06 + share * 0.18);
      return {
        canonical: row.canonical,
        itemId: row.itemId,
        correctionCount: row.correctionCount,
        shareWithinBrand: toFixed(share),
        boost: toFixed(boostRaw),
      };
    })
    .filter((row) => row.correctionCount >= args.minCorrections)
    .sort((a, b) => b.correctionCount - a.correctionCount || b.shareWithinBrand - a.shareWithinBrand)
    .slice(0, 200);

  const confusion = [...pairStats.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 200);

  const payload = {
    generatedAt: new Date().toISOString(),
    windowDays: args.days,
    source: 'scan-correction-rules',
    killSwitchDefault: false,
    maxPenaltyPerBrand: 0.35,
    maxBoostPerBrand: 0.25,
    stats: {
      recordsScanned: records.length,
      contextsSeen,
      correctionContexts,
      doNotPreferCount: doNotPrefer.length,
      boostCount: boosts.length,
      confusionCount: confusion.length,
    },
    doNotPrefer,
    boosts,
    confusion,
  };

  const outPath = path.resolve(process.cwd(), args.outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    outPath,
    generatedAt: payload.generatedAt,
    windowDays: payload.windowDays,
    stats: payload.stats,
  }, null, 2));
}

run();
