import { describe, expect, it } from 'vitest';
import { fuseSamples, shouldCommitFusedText, textSimilarity, type OcrSample } from './ocrFusion';

describe('ocrFusion', () => {
  it('prefers sharper/lower-glare hypothesis via weighted medoid fusion', () => {
    const samples: OcrSample[] = [
      { ts: 1, text: 'urge', detScore: 0.82, cropScore: 0.88, ocrConf: 0.88, source: 'raw' },
      { ts: 2, text: 'utge', detScore: 0.77, cropScore: 0.42, ocrConf: 0.55, source: 'raw' },
      { ts: 3, text: 'urge', detScore: 0.8, cropScore: 0.82, ocrConf: 0.86, source: 'raw' },
    ];
    const fused = fuseSamples(samples);
    expect(fused.text.toLowerCase()).toBe('urge');
    expect(fused.conf).toBeGreaterThan(0.8);
    expect(fused.source).toBe('raw');
  });

  it('computes normalized string similarity robustly', () => {
    expect(textSimilarity('Pepsi Max', 'pepsi   max')).toBeGreaterThan(0.95);
    expect(textSimilarity('pepsi', 'urge')).toBeLessThan(0.3);
  });

  it('commits only after confidence + stability + continuity gates', () => {
    expect(
      shouldCommitFusedText({
        fusedText: 'urge',
        fusedConf: 0.9,
        stableCount: 3,
        continuityMs: 600,
        fusedSource: 'raw',
      })
    ).toBe(true);

    expect(
      shouldCommitFusedText({
        fusedText: 'urge',
        fusedConf: 0.82,
        stableCount: 3,
        continuityMs: 600,
        fusedSource: 'raw',
      })
    ).toBe(false);

    expect(
      shouldCommitFusedText({
        fusedText: 'urge',
        fusedConf: 0.9,
        stableCount: 2,
        continuityMs: 600,
        fusedSource: 'raw',
      })
    ).toBe(false);
  });

  it('does not commit rescued text from a single lucky rescue sample', () => {
    expect(
      shouldCommitFusedText({
        fusedText: 'urge',
        fusedConf: 0.91,
        stableCount: 3,
        continuityMs: 650,
        fusedSource: 'rescued',
        rescueBrand: 'urge',
        rescuedHitCount: 1,
        rawSupportCount: 0,
      })
    ).toBe(false);
  });
});
