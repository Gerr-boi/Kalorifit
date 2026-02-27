import type { MacroNutrients } from '../../ai-scanner-logic/types';

export type ResolverSeedSource = 'selected_prediction' | 'dish_prediction' | 'vision_prediction' | 'ocr_text' | 'ocr_brand';
export type NormalizedRectLike = { x: number; y: number; w: number; h: number };

export function confidenceBucket(confidence: number): 'High' | 'Medium' | 'Low' {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.2) return 'Medium';
  return 'Low';
}

export function shouldGateWrongButConfident(topSeedConfidence: number, bestResolvedCombined: number) {
  return topSeedConfidence >= 0.78 && bestResolvedCombined < 0.55;
}

export function shouldPromptForBetterShot(input: {
  frameQuality?: number | null;
  topMatchConfidence?: number | null;
  topMatchMargin?: number | null;
  alternativeCount?: number | null;
  packagingType?: string | null;
  ocrStrategy?: string | null;
}) {
  const frameQuality = typeof input.frameQuality === 'number' ? input.frameQuality : null;
  const topMatchConfidence = typeof input.topMatchConfidence === 'number' ? input.topMatchConfidence : null;
  const topMatchMargin = typeof input.topMatchMargin === 'number' ? input.topMatchMargin : null;
  const alternativeCount = typeof input.alternativeCount === 'number' ? input.alternativeCount : 0;
  const packagingType = String(input.packagingType ?? '').trim().toLowerCase();
  const ocrStrategy = String(input.ocrStrategy ?? '').trim().toLowerCase();

  if (frameQuality != null && frameQuality < 0.42) return true;
  if (topMatchConfidence != null && topMatchConfidence < 0.58) return true;
  if (topMatchMargin != null && topMatchMargin < 0.08 && alternativeCount > 0) return true;
  if (packagingType && ['can', 'bottle', 'carton', 'wrapper', 'pouch'].includes(packagingType) && ocrStrategy.startsWith('skipped')) {
    return true;
  }
  return false;
}

export function buildBetterShotMessage(input: {
  packagingType?: string | null;
  topMatchMargin?: number | null;
  hasBarcodeAlternative?: boolean | null;
  blurScore?: number | null;
  glareScore?: number | null;
  brightnessScore?: number | null;
}) {
  const packagingType = String(input.packagingType ?? '').trim().toLowerCase();
  const topMatchMargin = typeof input.topMatchMargin === 'number' ? input.topMatchMargin : null;
  const hasBarcodeAlternative = input.hasBarcodeAlternative === true;
  const blurScore = typeof input.blurScore === 'number' ? input.blurScore : null;
  const glareScore = typeof input.glareScore === 'number' ? input.glareScore : null;
  const brightnessScore = typeof input.brightnessScore === 'number' ? input.brightnessScore : null;

  if (glareScore != null && glareScore > 0.62) {
    return 'Tilt the item slightly to reduce glare on the label.';
  }
  if (blurScore != null && blurScore < 0.28) {
    return 'Hold the camera steadier and move a little closer.';
  }
  if (brightnessScore != null && brightnessScore < 0.3) {
    return 'The scene is a bit dark. Find more light or turn on flash.';
  }
  if (hasBarcodeAlternative) {
    return 'Show the barcode or front label more clearly for a safer match.';
  }
  if (packagingType && ['can', 'bottle', 'carton'].includes(packagingType)) {
    if (topMatchMargin != null && topMatchMargin < 0.08) {
      return 'Move closer and rotate the item slightly so the label is easier to read.';
    }
    return 'Try another photo of the front label without glare.';
  }
  return 'Try another photo a little closer or from a steadier angle.';
}

export function computeFrontVisibilityScore(input: {
  packagingType?: string | null;
  frameQuality?: number | null;
  ocrBestLineScore?: number | null;
  ocrTextCharCount?: number | null;
  topMatchConfidence?: number | null;
  topMatchMargin?: number | null;
}) {
  const packagingType = String(input.packagingType ?? '').trim().toLowerCase();
  if (!['can', 'bottle', 'carton', 'wrapper', 'pouch'].includes(packagingType)) return 1;
  const frameQuality = typeof input.frameQuality === 'number' ? Math.max(0, Math.min(1, input.frameQuality)) : 0.45;
  const ocrBestLineScore = typeof input.ocrBestLineScore === 'number' ? Math.max(0, Math.min(1, input.ocrBestLineScore)) : 0;
  const ocrTextCharCount = typeof input.ocrTextCharCount === 'number' ? Math.max(0, input.ocrTextCharCount) : 0;
  const topMatchConfidence = typeof input.topMatchConfidence === 'number' ? Math.max(0, Math.min(1, input.topMatchConfidence)) : 0;
  const topMatchMargin = typeof input.topMatchMargin === 'number' ? Math.max(0, Math.min(1, input.topMatchMargin)) : 0;
  const textPresence = Math.max(0, Math.min(1, ocrTextCharCount / 18));
  return Math.max(
    0,
    Math.min(
      1,
      (frameQuality * 0.28) +
      (ocrBestLineScore * 0.34) +
      (textPresence * 0.18) +
      (topMatchConfidence * 0.12) +
      (Math.min(1, topMatchMargin / 0.18) * 0.08)
    )
  );
}

export function shouldSuppressDuplicateRecognition(input: {
  previousName?: string | null;
  nextName?: string | null;
  previousAt?: number | null;
  nowAt?: number | null;
  frontVisibilityScore?: number | null;
}) {
  const previousName = String(input.previousName ?? '').trim().toLowerCase();
  const nextName = String(input.nextName ?? '').trim().toLowerCase();
  const previousAt = typeof input.previousAt === 'number' ? input.previousAt : null;
  const nowAt = typeof input.nowAt === 'number' ? input.nowAt : Date.now();
  const frontVisibilityScore = typeof input.frontVisibilityScore === 'number' ? input.frontVisibilityScore : 1;
  if (!previousName || !nextName || previousName !== nextName) return false;
  if (previousAt == null) return false;
  if ((nowAt - previousAt) > 6000) return false;
  return frontVisibilityScore >= 0.55;
}

export function applyRecentItemBoost<T extends { item: { name?: string; brand?: string | null }; combined: number }>(
  ranked: T[],
  recentNames: string[],
  maxBoost = 0.04,
) {
  const normalizedRecent = recentNames
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!normalizedRecent.length) return ranked;
  return ranked
    .map((entry) => {
      const label = `${String(entry.item.brand ?? '').trim()} ${String(entry.item.name ?? '').trim()}`.trim().toLowerCase();
      if (!label) return entry;
      const hit = normalizedRecent.some((recent) => label.includes(recent) || recent.includes(label));
      if (!hit) return entry;
      return { ...entry, combined: Math.max(0, Math.min(0.99, entry.combined + maxBoost)) };
    })
    .sort((a, b) => b.combined - a.combined);
}

export function computeTemporalTrackingState(input: {
  iou: number;
  centerDist: number;
  quality: number;
  previousConfidence?: number | null;
  nextConfidence?: number | null;
}) {
  const iou = Math.max(0, Math.min(1, input.iou));
  const centerDist = Math.max(0, input.centerDist);
  const quality = Math.max(0, Math.min(1, input.quality));
  const previousConfidence = typeof input.previousConfidence === 'number' ? Math.max(0, Math.min(1, input.previousConfidence)) : quality;
  const nextConfidence = typeof input.nextConfidence === 'number' ? Math.max(0, Math.min(1, input.nextConfidence)) : quality;
  const distanceContinuity = Math.max(0, Math.min(1, 1 - (centerDist / 0.36)));
  const continuity = Math.max(0, Math.min(1, (iou * 0.7) + (distanceContinuity * 0.3)));
  const suppressSwap = iou < 0.05 && centerDist > 0.43 && quality < 0.78;
  const shouldContinue = continuity >= 0.34;
  const alpha = Math.max(0, Math.min(1, 0.12 + (quality * 0.28) + (continuity * 0.32)));
  const smoothedConfidence = Math.max(0, Math.min(1, (previousConfidence * (1 - alpha)) + (nextConfidence * alpha)));
  return {
    continuity,
    distanceContinuity,
    suppressSwap,
    shouldContinue,
    alpha,
    smoothedConfidence,
  };
}

export function createResolveRunGuard() {
  let activeId = 0;
  let activeController: AbortController | null = null;

  return {
    begin() {
      activeController?.abort();
      activeId += 1;
      activeController = new AbortController();
      return { id: activeId, signal: activeController.signal };
    },
    isCurrent(id: number) {
      return id === activeId;
    },
  };
}

type ScannedFoodLike = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  image?: string;
  per100g?: MacroNutrients | null;
};

type SessionCache = {
  best: ScannedFoodLike | null;
  bySeed: Map<string, ScannedFoodLike>;
};

export function createResolverSessionCache() {
  const sessions = new Map<string, SessionCache>();
  return {
    ensure(imageHash: string) {
      if (!sessions.has(imageHash)) {
        sessions.set(imageHash, { best: null, bySeed: new Map() });
      }
      return sessions.get(imageHash) as SessionCache;
    },
    getBySeed(imageHash: string, seed: string) {
      return sessions.get(imageHash)?.bySeed.get(seed) ?? null;
    },
    setBySeed(imageHash: string, seed: string, value: ScannedFoodLike) {
      this.ensure(imageHash).bySeed.set(seed, value);
    },
    setBest(imageHash: string, value: ScannedFoodLike) {
      this.ensure(imageHash).best = value;
    },
    getBest(imageHash: string) {
      return sessions.get(imageHash)?.best ?? null;
    },
  };
}
