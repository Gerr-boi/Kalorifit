export type ResolverSeedSource = 'selected_prediction' | 'dish_prediction' | 'vision_prediction' | 'ocr_text' | 'ocr_brand';

export function confidenceBucket(confidence: number): 'Høy' | 'Medium' | 'Lav' {
  if (confidence >= 0.8) return 'Høy';
  if (confidence >= 0.2) return 'Medium';
  return 'Lav';
}

export function shouldGateWrongButConfident(topSeedConfidence: number, bestResolvedCombined: number) {
  return topSeedConfidence >= 0.78 && bestResolvedCombined < 0.55;
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
import type { MacroNutrients } from '../../ai-scanner-logic/types';
