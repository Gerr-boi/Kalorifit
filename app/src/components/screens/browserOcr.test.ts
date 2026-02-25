import { describe, expect, it } from 'vitest';
import { brandBoostFromOcrText, ocrLinesToSeeds, pickOcrLang, preprocessForOcr } from './browserOcr';

describe('browserOcr helpers', () => {
  it('picks nor+eng for norwegian locales and eng otherwise', () => {
    expect(pickOcrLang('nb-NO')).toBe('nor+eng');
    expect(pickOcrLang('nn-NO')).toBe('nor+eng');
    expect(pickOcrLang('no')).toBe('nor+eng');
    expect(pickOcrLang('en-US')).toBe('eng');
  });

  it('extracts compact OCR seeds and filters nutrition-noise labels', () => {
    const seeds = ocrLinesToSeeds(
      [
        { text: 'PROTEIN BAR CHOCOLATE', confidence: 0.82 },
        { text: 'Ingredienser', confidence: 0.91 },
        { text: 'Naring', confidence: 0.95 },
        { text: 'Best before 12-2026', confidence: 0.76 },
      ],
      6
    );
    expect(seeds.some((row) => row.label.includes('protein bar chocolate'))).toBe(true);
    expect(seeds.some((row) => row.label === 'ingredienser')).toBe(false);
    expect(seeds.some((row) => row.label === 'naring')).toBe(false);
  });

  it('preprocessForOcr keeps alpha at 255 and emits binary output when threshold is enabled', () => {
    const input = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        20, 30, 40, 110,
        120, 130, 140, 50,
        220, 230, 240, 70,
        250, 250, 250, 0,
      ]),
    } as ImageData;

    const out = preprocessForOcr(input, { enableThreshold: true, threshold: 128, contrast: 1.35 });
    expect(out.data.length).toBe(16);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i + 3]).toBe(255);
      expect([0, 255]).toContain(out.data[i]);
      expect([0, 255]).toContain(out.data[i + 1]);
      expect([0, 255]).toContain(out.data[i + 2]);
    }
  });

  it('brand boost maps partial OCR tokens to canonical beverage seeds', () => {
    const boosted = brandBoostFromOcrText('c0ca c0la zero sukkerfri');
    expect(boosted.hits.length).toBeGreaterThan(0);
    expect(boosted.hits.some((hit) => hit.canonical === 'coca cola')).toBe(true);
    expect(boosted.boostedSeeds).toContain('coca cola');
  });

  it('rescues weak fragment OCR like "pepx" and "utge"', () => {
    const pe = brandBoostFromOcrText('pepx', { bestLineScore: 0.41, textCharCount: 8 });
    expect(pe.hits.some((hit) => hit.canonical === 'pepsi')).toBe(true);

    const urge = brandBoostFromOcrText('utge', { bestLineScore: 0.39, textCharCount: 10 });
    expect(urge.hits.some((hit) => hit.canonical === 'urge')).toBe(true);
  });

  it('maps cola-family OCR variants and norwegian sugar-free hints', () => {
    const coke = brandBoostFromOcrText('koki c0la uten sukker');
    expect(coke.hits.some((hit) => hit.canonical === 'coca cola')).toBe(true);
    expect(coke.boostedSeeds).toContain('coca cola uten sukker');

    const pepsi = brandBoostFromOcrText('pepxi max zero sugar');
    expect(pepsi.hits.some((hit) => hit.canonical === 'pepsi')).toBe(true);
    expect(pepsi.boostedSeeds).toContain('pepsi max');
    expect(pepsi.boostedSeeds).toContain('pepsi zero sugar');
  });

  it('rejects noisy OCR seed fragments like "i pas x"', () => {
    const seeds = ocrLinesToSeeds([{ text: 'i pas x', confidence: 0.92 }], 6);
    expect(seeds).toEqual([]);

    const textSeeds = brandBoostFromOcrText('i pas x', { bestLineScore: 0.41, textCharCount: 7 });
    expect(textSeeds.hits.some((hit) => hit.canonical === 'pepsi')).toBe(false);
  });
});
