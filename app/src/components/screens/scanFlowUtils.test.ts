import { describe, expect, it } from 'vitest';
import {
  applyRecentItemBoost,
  buildBetterShotMessage,
  computeTemporalTrackingState,
  computeFrontVisibilityScore,
  confidenceBucket,
  createResolveRunGuard,
  createResolverSessionCache,
  shouldGateWrongButConfident,
  shouldPromptForBetterShot,
  shouldSuppressDuplicateRecognition,
} from './scanFlowUtils';

describe('scanFlowUtils', () => {
  it('stale-run protection ignores older run after a new run begins', () => {
    const guard = createResolveRunGuard();
    const runA = guard.begin();
    const runB = guard.begin();

    expect(runA.signal.aborted).toBe(true);
    expect(runB.signal.aborted).toBe(false);
    expect(guard.isCurrent(runA.id)).toBe(false);
    expect(guard.isCurrent(runB.id)).toBe(true);
  });

  it('resolver session cache returns bySeed hit on second lookup', () => {
    const cache = createResolverSessionCache();
    const imageHash = 'abc123';
    const seed = 'ramen';
    const value = {
      name: 'Ramen',
      calories: 120,
      protein: 5,
      carbs: 20,
      fat: 2,
      confidence: 88,
      image: 'blob://test',
    };

    expect(cache.getBySeed(imageHash, seed)).toBeNull();
    cache.setBySeed(imageHash, seed, value);
    expect(cache.getBySeed(imageHash, seed)).toEqual(value);
  });

  it('confidence bucketing maps boundaries correctly', () => {
    expect(confidenceBucket(0.19)).toBe('Low');
    expect(confidenceBucket(0.20)).toBe('Medium');
    expect(confidenceBucket(0.49)).toBe('Medium');
    expect(confidenceBucket(0.50)).toBe('Medium');
    expect(confidenceBucket(0.79)).toBe('Medium');
    expect(confidenceBucket(0.80)).toBe('High');
  });

  it('wrong-but-confident gate prevents auto-lock when resolver is weak', () => {
    expect(shouldGateWrongButConfident(0.82, 0.42)).toBe(true);
    expect(shouldGateWrongButConfident(0.62, 0.42)).toBe(false);
    expect(shouldGateWrongButConfident(0.82, 0.62)).toBe(false);
  });

  it('retake prompting triggers on weak frame quality or close match margin', () => {
    expect(
      shouldPromptForBetterShot({
        frameQuality: 0.31,
        topMatchConfidence: 0.74,
        topMatchMargin: 0.18,
        alternativeCount: 0,
        packagingType: 'can',
        ocrStrategy: 'targeted_packaging',
      })
    ).toBe(true);

    expect(
      shouldPromptForBetterShot({
        frameQuality: 0.76,
        topMatchConfidence: 0.81,
        topMatchMargin: 0.04,
        alternativeCount: 2,
        packagingType: 'bottle',
        ocrStrategy: 'targeted_packaging',
      })
    ).toBe(true);

    expect(
      shouldPromptForBetterShot({
        frameQuality: 0.78,
        topMatchConfidence: 0.88,
        topMatchMargin: 0.16,
        alternativeCount: 1,
        packagingType: 'bottle',
        ocrStrategy: 'targeted_packaging',
      })
    ).toBe(false);
  });

  it('builds packaging-aware retake guidance', () => {
    expect(buildBetterShotMessage({ packagingType: 'bottle', topMatchMargin: 0.03 })).toContain('rotate');
    expect(buildBetterShotMessage({ packagingType: 'plate', hasBarcodeAlternative: false })).toContain('closer');
    expect(buildBetterShotMessage({ glareScore: 0.8 })).toContain('glare');
  });

  it('computes front visibility score for packaged items', () => {
    expect(
      computeFrontVisibilityScore({
        packagingType: 'can',
        frameQuality: 0.8,
        ocrBestLineScore: 0.82,
        ocrTextCharCount: 20,
        topMatchConfidence: 0.86,
        topMatchMargin: 0.14,
      })
    ).toBeGreaterThan(0.75);

    expect(
      computeFrontVisibilityScore({
        packagingType: 'bottle',
        frameQuality: 0.32,
        ocrBestLineScore: 0.18,
        ocrTextCharCount: 2,
        topMatchConfidence: 0.4,
        topMatchMargin: 0.02,
      })
    ).toBeLessThan(0.4);
  });

  it('suppresses duplicate recognition when the same item is repeatedly seen', () => {
    expect(
      shouldSuppressDuplicateRecognition({
        previousName: 'Coca-Cola Zero Sugar 1.5L',
        nextName: 'Coca-Cola Zero Sugar 1.5L',
        previousAt: 1000,
        nowAt: 5000,
        frontVisibilityScore: 0.78,
      })
    ).toBe(true);

    expect(
      shouldSuppressDuplicateRecognition({
        previousName: 'Coca-Cola Zero Sugar 1.5L',
        nextName: 'Pepsi Max 1.5L',
        previousAt: 1000,
        nowAt: 5000,
        frontVisibilityScore: 0.78,
      })
    ).toBe(false);
  });

  it('applies only a small personalization boost to recent items', () => {
    const ranked = [
      { item: { name: 'Pepsi Max 1.5L', brand: 'Pepsi' }, combined: 0.71 },
      { item: { name: 'Coca-Cola Zero Sugar 1.5L', brand: 'Coca-Cola' }, combined: 0.7 },
    ];

    const boosted = applyRecentItemBoost(ranked, ['Coca-Cola Zero Sugar 1.5L']);

    expect(boosted[0].item.name).toBe('Coca-Cola Zero Sugar 1.5L');
    expect(boosted[0].combined).toBeCloseTo(0.74, 4);
  });

  it('computes temporal tracking continuity and suppresses abrupt low-quality swaps', () => {
    const stable = computeTemporalTrackingState({
      iou: 0.62,
      centerDist: 0.08,
      quality: 0.74,
      previousConfidence: 0.7,
      nextConfidence: 0.86,
    });
    expect(stable.shouldContinue).toBe(true);
    expect(stable.suppressSwap).toBe(false);
    expect(stable.alpha).toBeGreaterThan(0.4);
    expect(stable.smoothedConfidence).toBeGreaterThan(0.7);

    const abrupt = computeTemporalTrackingState({
      iou: 0.01,
      centerDist: 0.48,
      quality: 0.42,
      previousConfidence: 0.82,
      nextConfidence: 0.33,
    });
    expect(abrupt.suppressSwap).toBe(true);
    expect(abrupt.shouldContinue).toBe(false);
  });
});
