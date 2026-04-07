/**
 * Evidence merger — combines multiple NutritionResult candidates
 * from different signals into one best result with a merged confidence score
 * and a human-readable explanation.
 *
 * Signal weights (independent, not mutually exclusive):
 *   barcode match        0.90  — strongest possible signal
 *   OCR text match       0.60  — good when barcode unavailable
 *   image similarity     0.50  — visual product match
 *   text search          0.45  — weakest, used for generic foods
 *   category match       0.30  — supporting signal only
 */

import type { EvidenceSignal, NutritionResult } from "./types";

export interface EvidenceCandidate {
  result: NutritionResult;
  signals: EvidenceSignal[];
}

const SIGNAL_WEIGHTS: Record<EvidenceSignal["type"], number> = {
  barcode: 0.90,
  ocr_text: 0.60,
  image_similarity: 0.50,
  text_search: 0.45,
  category: 0.30,
};

/**
 * Given a list of candidates (each with their evidence signals),
 * return the best merged result plus an ordered list of top candidates.
 */
export function mergeEvidence(candidates: EvidenceCandidate[]): {
  best: NutritionResult | null;
  ranked: NutritionResult[];
} {
  if (candidates.length === 0) return { best: null, ranked: [] };

  const scored = candidates.map(({ result, signals }) => {
    const merged = computeMergedConfidence(result.confidence, signals);
    const explanation = buildExplanation(signals, merged);
    return {
      result: {
        ...result,
        confidence: merged,
        evidenceSignals: signals,
        matchExplanation: explanation,
      } satisfies NutritionResult,
      merged,
    };
  });

  scored.sort((a, b) => b.merged - a.merged);

  return {
    best: scored[0]?.result ?? null,
    ranked: scored.map((s) => s.result),
  };
}

/**
 * When you have a single result but want to attach signal metadata to it,
 * use this helper to produce an annotated copy.
 */
export function annotateResult(
  result: NutritionResult,
  signals: EvidenceSignal[]
): NutritionResult {
  const merged = computeMergedConfidence(result.confidence, signals);
  return {
    ...result,
    confidence: merged,
    evidenceSignals: signals,
    matchExplanation: buildExplanation(signals, merged),
  };
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Noisy-OR combination: each independent signal "votes" toward certainty.
 * combined = 1 − ∏(1 − signal_confidence_i)
 * Then clamp to [base, 0.97].
 */
function computeMergedConfidence(baseConfidence: number, signals: EvidenceSignal[]): number {
  if (signals.length === 0) return Math.min(0.97, baseConfidence);

  // Effective confidence per signal = signal.confidence × weight
  const probs = signals.map((s) => {
    const w = SIGNAL_WEIGHTS[s.type] ?? 0.3;
    return Math.min(0.97, s.confidence * w);
  });

  // Noisy-OR
  const notCombined = probs.reduce((acc, p) => acc * (1 - p), 1);
  const combined = 1 - notCombined;

  // Blend with base confidence (50/50 so we don't completely ignore the source's own score)
  const blended = (combined + baseConfidence) / 2;
  return Math.min(0.97, Math.max(baseConfidence, blended));
}

function buildExplanation(signals: EvidenceSignal[], finalConfidence: number): string {
  if (signals.length === 0) return confidenceLabel(finalConfidence);

  const best = signals.reduce((a, b) => (a.confidence > b.confidence ? a : b));
  const label = confidenceLabel(finalConfidence);
  const signalDesc = describeSignal(best);

  if (signals.length === 1) {
    return `${label} (${signalDesc})`;
  }

  const others = signals
    .filter((s) => s !== best)
    .map(describeSignal)
    .slice(0, 2)
    .join(", ");

  return `${label} (${signalDesc} + ${others})`;
}

function describeSignal(s: EvidenceSignal): string {
  switch (s.type) {
    case "barcode": return `strekkode fra ${s.source}`;
    case "ocr_text": return `OCR-tekst fra ${s.source}`;
    case "image_similarity": return `bildelikhet fra ${s.source}`;
    case "text_search": return `tekstsøk i ${s.source}`;
    case "category": return `kategorimatch`;
    default: return s.source;
  }
}

function confidenceLabel(c: number): string {
  if (c >= 0.85) return "Høy sikkerhet";
  if (c >= 0.65) return "Middels sikkerhet";
  if (c >= 0.40) return "Lav sikkerhet";
  return "Gjetning";
}
