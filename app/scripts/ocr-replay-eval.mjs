import fs from 'node:fs';
import path from 'node:path';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeText(input) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const denom = Math.max(1, left.length, right.length);
  return clamp01(1 - (levenshteinDistance(left, right) / denom));
}

function sampleWeight(sample) {
  const det = clamp01(sample.detScore);
  const crop = clamp01(sample.cropScore);
  const ocr = clamp01(sample.ocrConf ?? 0.5);
  const rescuePenalty = sample.source === 'rescued' ? 0.88 : 1;
  const rescueBonus = sample.source === 'rescued' ? (0.08 * clamp01(sample.rescueScore ?? 0.5)) : 0;
  return clamp01((((0.45 * det) + (0.45 * crop) + (0.1 * ocr)) * rescuePenalty) + rescueBonus);
}

function fuseSamples(samples) {
  const usable = samples
    .map((row) => ({ ...row, norm: normalizeText(row.text), weight: sampleWeight(row) }))
    .filter((row) => row.norm.length >= 2);
  if (!usable.length) {
    return { text: '', conf: 0, source: 'raw', rescueBrand: undefined, rescuedHitCount: 0, rawSupportCount: 0 };
  }

  const unique = new Map();
  for (const row of usable) {
    const prev = unique.get(row.norm);
    if (!prev || row.weight > prev.weight) unique.set(row.norm, row);
  }
  const candidates = [...unique.values()];
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0.0001) {
    return { text: '', conf: 0, source: 'raw', rescueBrand: undefined, rescuedHitCount: 0, rawSupportCount: 0 };
  }

  let best = candidates[0];
  let bestScore = -1;
  const scoreByNorm = new Map();
  for (const cand of candidates) {
    let score = 0;
    for (const row of usable) score += row.weight * similarity(cand.norm, row.norm);
    scoreByNorm.set(cand.norm, score);
    if (score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }

  if (best.source === 'rescued') {
    let bestRaw = null;
    let bestRawScore = -1;
    for (const cand of candidates) {
      if (cand.source !== 'raw') continue;
      const score = scoreByNorm.get(cand.norm) ?? 0;
      if (score > bestRawScore) {
        bestRaw = cand;
        bestRawScore = score;
      }
    }
    if (bestRaw && bestRawScore >= bestScore * 0.92) {
      best = bestRaw;
      bestScore = bestRawScore;
    }
  }

  const rescuedHitCount = usable.filter((row) => row.source === 'rescued' && similarity(row.norm, best.norm) >= 0.82).length;
  const rawSupportCount = usable.filter((row) => row.source === 'raw' && similarity(row.norm, best.norm) >= 0.45).length;
  return {
    text: best.text,
    conf: clamp01(bestScore / totalWeight),
    source: best.source,
    rescueBrand: best.rescueBrand,
    rescuedHitCount,
    rawSupportCount,
  };
}

function shouldCommit(state, continuityMs) {
  if (!state.fusedText || state.fusedText.length < 2) return false;
  if (state.fusedConf < 0.85) return false;
  if (state.stableCount < 3) return false;
  if (continuityMs < 500) return false;
  if (state.fusedSource === 'rescued') {
    if (state.fusedConf < 0.88) return false;
    if (!(state.rescuedHitCount >= 2 || (state.rescuedHitCount >= 1 && state.rawSupportCount >= 1))) return false;
  }
  return true;
}

function hasDisqualifier(text) {
  const lowered = normalizeText(text);
  return /\b(order\w*|org\w*|organisk|organisasjon)\b/i.test(lowered);
}

function brandCandidatesFromText(text) {
  const lowered = normalizeText(text);
  const list = [];
  if (/\burge\b|\butge\b|\borg\b|\borb\b|\burq\b/i.test(lowered)) list.push({ brand: 'urge', regexScore: 0.56 });
  if (/\bfanta\b|\bfant[ao]\b|\bfa\b/i.test(lowered)) list.push({ brand: 'fanta', regexScore: 0.56 });
  if (/\bcoca\b|\bcola\b|\bcoke\b/i.test(lowered)) list.push({ brand: 'coca cola', regexScore: 0.56 });
  if (/\bpepsi\b|\bpepxi\b|\bpeps[i1]\b/i.test(lowered)) list.push({ brand: 'pepsi', regexScore: 0.56 });
  return list;
}

function maybeRescue(frame) {
  const rawText = String(frame.rawText ?? '').trim();
  const candidates = (Array.isArray(frame.brandCandidates) ? frame.brandCandidates : brandCandidatesFromText(rawText))
    .sort((a, b) => (b.regexScore ?? 0) - (a.regexScore ?? 0));
  const best = candidates[0];
  const second = candidates[1];
  if (!best) return { applied: false, text: rawText, brand: undefined, rescueScore: 0, blocked: 'no_brand_candidate' };
  if (hasDisqualifier(rawText) && best.brand === 'urge') {
    return { applied: false, text: rawText, brand: undefined, rescueScore: 0, blocked: 'disqualified_context' };
  }

  const colorCue = best.brand === 'urge' ? clamp01(frame.greenCue) : best.brand === 'fanta' ? clamp01(frame.orangeCue) : 0.3;
  const typographyCue = clamp01((clamp01(frame.sharpNorm ?? frame.cropScore) * 0.5) + (clamp01(frame.contrastNorm ?? frame.cropScore) * 0.5));
  const cooccurrence = clamp01(frame.cooccurrenceCue);
  const cueScore = clamp01((0.45 * colorCue) + (0.3 * typographyCue) + (0.25 * cooccurrence));
  const rescueScore = clamp01(clamp01(best.regexScore ?? 0.5) + (cueScore * 0.38));
  const threshold = best.brand === 'urge' ? 0.74 : best.brand === 'fanta' ? 0.76 : 0.7;
  const competitionGap = second ? rescueScore - clamp01(second.regexScore ?? 0) : 1;
  if (competitionGap < 0.15) return { applied: false, text: rawText, brand: undefined, rescueScore, blocked: 'brand_competition' };
  if (rescueScore < threshold) return { applied: false, text: rawText, brand: undefined, rescueScore, blocked: 'low_rescue_score' };
  return { applied: true, text: best.brand, brand: best.brand, rescueScore, blocked: undefined };
}

function parseArgs() {
  const kv = new Map(
    process.argv
      .slice(2)
      .map((arg) => arg.split('='))
      .filter((parts) => parts.length === 2)
      .map(([k, v]) => [k.replace(/^--/, ''), v])
  );
  return {
    casesPath: kv.get('cases') ?? 'scripts/ocr-replay-cases.json',
  };
}

function runCase(testCase) {
  const frames = Array.isArray(testCase.frames) ? testCase.frames : [];
  const state = {
    samples: [],
    fusedText: '',
    fusedConf: 0,
    fusedSource: 'raw',
    rescuedHitCount: 0,
    rawSupportCount: 0,
    stableCount: 0,
    committedText: '',
  };
  let firstLiveAt = null;
  let commitAt = null;
  let rescueAppliedCount = 0;
  let falseRescueCount = 0;
  let continuityStart = null;

  for (const frame of frames) {
    const tMs = Number(frame.tMs ?? 0);
    const detScore = clamp01(frame.detScore);
    const cropScore = clamp01(frame.cropScore);
    if (detScore >= 0.34) {
      if (continuityStart == null) continuityStart = tMs;
    } else {
      continuityStart = null;
    }
    if (detScore < 0.56 && state.fusedConf >= 0.72) continue;

    const rescue = maybeRescue(frame);
    if (rescue.applied) {
      rescueAppliedCount += 1;
      if (!testCase.expectedBrand || testCase.expectedBrand !== rescue.brand) falseRescueCount += 1;
    }
    const sample = {
      ts: tMs,
      text: rescue.applied ? rescue.text : String(frame.rawText ?? ''),
      ocrConf: clamp01(frame.ocrConf ?? 0.5),
      detScore,
      cropScore,
      source: rescue.applied ? 'rescued' : 'raw',
      rescueBrand: rescue.brand,
      rescueScore: rescue.applied ? rescue.rescueScore : undefined,
    };
    state.samples = [...state.samples, sample].slice(-5);
    const fused = fuseSamples(state.samples);
    const isStable = state.fusedText && similarity(state.fusedText, fused.text) >= 0.92;
    state.stableCount = isStable ? state.stableCount + 1 : 1;
    state.fusedText = fused.text;
    state.fusedConf = fused.conf;
    state.fusedSource = fused.source;
    state.rescuedHitCount = fused.rescuedHitCount;
    state.rawSupportCount = fused.rawSupportCount;
    if (!firstLiveAt && state.fusedText) firstLiveAt = tMs;
    const continuityMs = continuityStart == null ? 0 : Math.max(0, tMs - continuityStart);
    if (!state.committedText && shouldCommit(state, continuityMs)) {
      state.committedText = fused.text;
      commitAt = tMs;
    }
  }

  const expected = normalizeText(testCase.expectedCommitted ?? '');
  const committed = normalizeText(state.committedText ?? '');
  const isCorrect = expected ? similarity(expected, committed) >= 0.9 : committed.length === 0;
  return {
    id: testCase.id,
    expectedCommitted: expected,
    finalCommittedText: committed,
    committedCorrect: isCorrect,
    timeToFirstLiveTextMs: firstLiveAt,
    timeToCommitMs: commitAt,
    rescueAppliedCount,
    falseRescueCount,
  };
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

function main() {
  const { casesPath } = parseArgs();
  const fullPath = path.resolve(process.cwd(), casesPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing replay cases file: ${fullPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('Replay cases must be a non-empty array.');
  }

  const perCase = parsed.map((testCase) => runCase(testCase));
  const correct = perCase.filter((row) => row.committedCorrect).length;
  const liveTimes = perCase.map((row) => row.timeToFirstLiveTextMs).filter((v) => Number.isFinite(v));
  const commitTimes = perCase.map((row) => row.timeToCommitMs).filter((v) => Number.isFinite(v));
  const rescueApplied = perCase.reduce((sum, row) => sum + row.rescueAppliedCount, 0);
  const falseRescue = perCase.reduce((sum, row) => sum + row.falseRescueCount, 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    cases: perCase.length,
    commitAccuracyPct: toPct(correct, perCase.length),
    latency: {
      liveTextP50Ms: percentile(liveTimes, 50),
      liveTextP95Ms: percentile(liveTimes, 95),
      commitP50Ms: percentile(commitTimes, 50),
      commitP95Ms: percentile(commitTimes, 95),
    },
    rescue: {
      totalApplied: rescueApplied,
      falseRescueRatePct: rescueApplied ? toPct(falseRescue, rescueApplied) : 0,
    },
    perCase,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();

