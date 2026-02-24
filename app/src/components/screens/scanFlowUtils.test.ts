import { describe, expect, it } from 'vitest';
import {
  confidenceBucket,
  createResolveRunGuard,
  createResolverSessionCache,
  shouldGateWrongButConfident,
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
    expect(confidenceBucket(0.19)).toBe('Lav');
    expect(confidenceBucket(0.20)).toBe('Medium');
    expect(confidenceBucket(0.49)).toBe('Medium');
    expect(confidenceBucket(0.50)).toBe('Medium');
    expect(confidenceBucket(0.79)).toBe('Medium');
    expect(confidenceBucket(0.80)).toBe('Høy');
  });

  it('wrong-but-confident gate prevents auto-lock when resolver is weak', () => {
    expect(shouldGateWrongButConfident(0.82, 0.42)).toBe(true);
    expect(shouldGateWrongButConfident(0.62, 0.42)).toBe(false);
    expect(shouldGateWrongButConfident(0.82, 0.62)).toBe(false);
  });
});
