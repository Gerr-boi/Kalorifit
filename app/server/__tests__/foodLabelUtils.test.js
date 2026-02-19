import { describe, expect, it } from 'vitest';
import { normalizeAndFilterFoodItems } from '../foodLabelUtils.js';

describe('normalizeAndFilterFoodItems', () => {
  it('applies threshold, maps synonyms, and removes non-food labels', () => {
    const input = [
      { name: 'Fries', confidence: 0.91 },
      { name: 'chips', confidence: 0.88 },
      { name: 'Pizza', confidence: 0.92 },
      { name: 'shoe', confidence: 0.99 },
      { name: 'burger', confidence: 0.5 },
    ];

    const output = normalizeAndFilterFoodItems(input, 0.75);

    expect(output).toEqual([
      { name: 'pizza', confidence: 0.92 },
      { name: 'fries', confidence: 0.91 },
    ]);
  });

  it('normalizes noisy labels and deduplicates to strongest confidence', () => {
    const input = [
      { name: 'Fresh French Fries', confidence: 0.8 },
      { name: 'potato chips', confidence: 0.91 },
      { name: 'Fries', confidence: 0.87 },
      { name: 'kitchen table', confidence: 0.99 },
    ];

    const output = normalizeAndFilterFoodItems(input, 0.75);

    expect(output).toEqual([{ name: 'fries', confidence: 0.91 }]);
  });

  it('supports plural and close variants for common food labels', () => {
    const input = [
      { name: 'pancakes', confidence: 0.86 },
      { name: 'doughnuts', confidence: 0.9 },
      { name: 'blueberries', confidence: 0.89 },
    ];

    const output = normalizeAndFilterFoodItems(input, 0.8);

    expect(output).toEqual([
      { name: 'donut', confidence: 0.9 },
      { name: 'blueberry', confidence: 0.89 },
      { name: 'pancake', confidence: 0.86 },
    ]);
  });
});
