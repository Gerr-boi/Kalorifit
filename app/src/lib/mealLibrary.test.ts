import { describe, expect, it } from 'vitest';

import { getFavoriteTagMatches, inferMealMetadata, scoreMealRecommendation } from './mealLibrary';

describe('inferMealMetadata', () => {
  it('infers gut and recovery signals from fermented protein bowls', () => {
    const result = inferMealMetadata({
      title: 'Kimchi bowl med laks og ris',
      calories: 540,
      ingredients: ['kimchi', 'laks', 'ris', 'agurk'],
    });

    expect(result.mealSlots).toContain('lunsj');
    expect(result.tags).toEqual(expect.arrayContaining(['gut_health', 'high_protein', 'recovery']));
    expect(result.sortContexts).toEqual(expect.arrayContaining(['gut', 'post_workout', 'high_energy']));
    expect(result.containsAllergens).toContain('fish');
    expect(result.signals.fermented).toBe(true);
  });

  it('infers vegan fiber-forward meals without animal allergens', () => {
    const result = inferMealMetadata({
      title: 'Linsegryte med brokkoli og quinoa',
      calories: 430,
      ingredients: ['linser', 'brokkoli', 'quinoa', 'olivenolje'],
    });

    expect(result.dietStyles).toEqual(expect.arrayContaining(['vegan', 'vegetarian', 'mediterranean']));
    expect(result.tags).toEqual(expect.arrayContaining(['fiber_focus', 'gut_health', 'low_inflammation']));
    expect(result.containsAllergens).toHaveLength(0);
    expect(result.signals.fiber).toBeGreaterThanOrEqual(7);
  });
});

describe('getFavoriteTagMatches', () => {
  it('returns overlapping favorite tags in stable order', () => {
    const matches = getFavoriteTagMatches(
      { tags: ['brain_fuel', 'recovery', 'high_protein'] },
      ['high_protein', 'gut_health', 'brain_fuel'],
    );

    expect(matches).toEqual(['high_protein', 'brain_fuel']);
  });
});

describe('scoreMealRecommendation', () => {
  it('prefers meals that match active tag filters and favorite tags', () => {
    const baseArgs = {
      activeSort: 'recommended' as const,
      profileDietStyle: 'high_protein' as const,
      profileGoalCategory: 'recomp' as const,
      profileGoalStrategy: 'strength_focus' as const,
      hardWorkoutToday: true,
      lowFiberToday: false,
      recentMealKeywords: ['bowl', 'kimchi'],
      favoriteRecipeIds: new Set<string>(['fav-1']),
      favoriteTags: ['gut_health', 'high_protein'] as const,
      activeTagFilter: 'gut_health' as const,
    };

    const strong = scoreMealRecommendation({
      ...baseArgs,
      recipe: {
        id: 'fav-1',
        title: 'Kimchi protein bowl',
        source: 'Mine maltider',
        sortContexts: ['recommended', 'gut', 'post_workout'],
        dietStyles: ['high_protein'],
        goalCategories: ['recomp'],
        goalStrategies: ['strength_focus'],
        tags: ['gut_health', 'high_protein', 'recovery'],
        signals: {
          fiber: 8,
          fermented: true,
          antiInflammatory: false,
          highProtein: true,
          eveningFriendly: false,
          highEnergy: true,
          magnesiumRich: false,
        },
      },
    });

    const weak = scoreMealRecommendation({
      ...baseArgs,
      recipe: {
        id: 'other',
        title: 'Plain omelett',
        source: 'Community',
        sortContexts: ['recommended'],
        dietStyles: ['standard_balanced'],
        goalCategories: ['health'],
        goalStrategies: ['stable_energy'],
        tags: ['brain_fuel'],
        signals: {
          fiber: 2,
          fermented: false,
          antiInflammatory: false,
          highProtein: false,
          eveningFriendly: true,
          highEnergy: false,
          magnesiumRich: false,
        },
      },
    });

    expect(strong).toBeGreaterThan(weak);
  });
});
