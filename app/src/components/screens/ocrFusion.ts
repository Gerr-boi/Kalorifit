export type OcrSample = {
  ts: number;
  text: string;
  ocrConf?: number;
  detScore: number;
  cropScore: number;
  source: 'raw' | 'rescued';
  rescueBrand?: string;
  rescueScore?: number;
};

export type TrackOcrState = {
  id: string;
  samples: OcrSample[];
  fusedText: string;
  fusedConf: number;
  committedText?: string;
  commitConf?: number;
  stableCount: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function normalizeFusionText(input: string) {
  return String(input ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,:/\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function textSimilarity(a: string, b: string) {
  const left = normalizeFusionText(a);
  const right = normalizeFusionText(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const denom = Math.max(1, left.length, right.length);
  return clamp01(1 - (levenshteinDistance(left, right) / denom));
}

export function sampleWeight(sample: OcrSample) {
  const det = clamp01(sample.detScore);
  const crop = clamp01(sample.cropScore);
  const ocr = clamp01(sample.ocrConf ?? 0.5);
  const rescuePenalty = sample.source === 'rescued' ? 0.88 : 1;
  const rescueBonus = sample.source === 'rescued' ? (0.08 * clamp01(sample.rescueScore ?? 0.5)) : 0;
  return clamp01((((0.45 * det) + (0.45 * crop) + (0.1 * ocr)) * rescuePenalty) + rescueBonus);
}

export function fuseSamples(
  samples: OcrSample[],
): {
  text: string;
  conf: number;
  source: 'raw' | 'rescued';
  rescueBrand?: string;
  rescuedHitCount: number;
  rawSupportCount: number;
} {
  const usable = samples
    .map((s) => ({
      ...s,
      norm: normalizeFusionText(s.text),
      weight: sampleWeight(s),
    }))
    .filter((s) => s.norm.length >= 2);
  if (!usable.length) {
    return { text: '', conf: 0, source: 'raw', rescueBrand: undefined, rescuedHitCount: 0, rawSupportCount: 0 };
  }

  const byNorm = new Map<string, {
    display: string;
    weight: number;
    norm: string;
    source: 'raw' | 'rescued';
    rescueBrand?: string;
  }>();
  for (const row of usable) {
    const prev = byNorm.get(row.norm);
    if (!prev || row.weight > prev.weight) {
      byNorm.set(row.norm, {
        display: row.text.trim(),
        weight: row.weight,
        norm: row.norm,
        source: row.source,
        rescueBrand: row.rescueBrand,
      });
    }
  }
  const candidates = [...byNorm.values()];
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  if (!candidates.length || totalWeight <= 0.0001) {
    return { text: '', conf: 0, source: 'raw', rescueBrand: undefined, rescuedHitCount: 0, rawSupportCount: 0 };
  }

  let best = candidates[0];
  let bestScore = -1;
  const scoreByNorm = new Map<string, number>();
  for (const cand of candidates) {
    let score = 0;
    for (const row of usable) {
      score += row.weight * textSimilarity(cand.norm, row.norm);
    }
    scoreByNorm.set(cand.norm, score);
    if (score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }

  if (best.source === 'rescued') {
    let bestRaw: (typeof candidates[number]) | null = null;
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

  const rescuedHitCount = usable.filter((row) => {
    if (row.source !== 'rescued') return false;
    if (textSimilarity(row.norm, best.norm) < 0.82) return false;
    return true;
  }).length;
  const rawSupportCount = usable.filter((row) => {
    if (row.source !== 'raw') return false;
    return textSimilarity(row.norm, best.norm) >= 0.45;
  }).length;

  return {
    text: best.display,
    conf: clamp01(bestScore / totalWeight),
    source: best.source,
    rescueBrand: best.rescueBrand,
    rescuedHitCount,
    rawSupportCount,
  };
}

export function shouldCommitFusedText(input: {
  fusedText: string;
  fusedConf: number;
  stableCount: number;
  continuityMs: number;
  previousCommitted?: string;
  fusedSource?: 'raw' | 'rescued';
  rescueBrand?: string;
  rescuedHitCount?: number;
  rawSupportCount?: number;
  requiredStableCount?: number;
}) {
  const next = normalizeFusionText(input.fusedText);
  if (next.length < 2) return false;
  if (input.fusedConf < 0.85) return false;
  if (input.stableCount < (input.requiredStableCount ?? 3)) return false;
  if (input.continuityMs < 500) return false;
  if (input.fusedSource === 'rescued') {
    const rescueHits = input.rescuedHitCount ?? 0;
    const rawSupport = input.rawSupportCount ?? 0;
    if (input.fusedConf < 0.88) return false;
    if (!(rescueHits >= 2 || (rescueHits >= 1 && rawSupport >= 1))) return false;
    if (!input.rescueBrand) return false;
  }
  const prev = normalizeFusionText(input.previousCommitted ?? '');
  if (!prev) return true;
  return textSimilarity(prev, next) < 0.995;
}
