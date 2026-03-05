import { getFood101SeedQuery } from './food101';
import { resolveLabelOFFWithCandidates } from './labelResolver';
import { resolveLabelMatvaretabellen } from './matvaretabellen';
import { isFoodRepoEnabled, resolveLabelFoodRepoWithCandidates } from './foodRepo';
import type { NutritionResult } from './types';

type ResolveAcrossOptions = {
  brand?: string | null;
  hints?: string[];
  limitPerSource?: number;
  includeFoodRepo?: boolean;
};

export type DatasetResolveResult = {
  best: NutritionResult | null;
  candidates: NutritionResult[];
};

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQueries(label: string, hints: string[]) {
  const queries: string[] = [];
  const primary = label.trim();
  const food101 = getFood101SeedQuery(primary);
  for (const value of [primary, food101 ?? '', ...hints]) {
    const normalized = normalize(value);
    if (!normalized) continue;
    if (!queries.some((entry) => normalize(entry) === normalized)) {
      queries.push(value.trim());
    }
  }
  return queries.slice(0, 3);
}

function mergeCandidates(candidates: NutritionResult[]) {
  const byKey = new Map<string, NutritionResult>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${normalize(candidate.name)}:${normalize(candidate.brand ?? '')}`;
    const previous = byKey.get(key);
    if (!previous || candidate.confidence > previous.confidence) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

export async function resolveLabelAcrossDatasets(
  label: string,
  options: ResolveAcrossOptions = {}
): Promise<DatasetResolveResult> {
  const trimmed = label.trim();
  if (!trimmed) return { best: null, candidates: [] };

  const hints = Array.isArray(options.hints) ? options.hints : [];
  const limitPerSource = Math.max(1, Math.min(5, options.limitPerSource ?? 3));
  const shouldUseFoodRepo = options.includeFoodRepo === true && isFoodRepoEnabled();
  const queries = buildQueries(trimmed, hints);
  if (!queries.length) return { best: null, candidates: [] };

  const merged: NutritionResult[] = [];

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const queryPenalty = index === 0 ? 1 : 0.93;

    const tasks: Array<Promise<{ best: NutritionResult | null; candidates: NutritionResult[] }>> = [
      resolveLabelMatvaretabellen(query),
      resolveLabelOFFWithCandidates(query, { brand: options.brand, hints }, limitPerSource),
    ];
    if (shouldUseFoodRepo) {
      tasks.push(resolveLabelFoodRepoWithCandidates(query, { brand: options.brand }, limitPerSource));
    }

    const results = await Promise.all(tasks);
    for (const result of results) {
      for (const candidate of result.candidates) {
        merged.push({
          ...candidate,
          confidence: Math.max(0.2, Math.min(0.99, candidate.confidence * queryPenalty)),
          raw: {
            ...(candidate.raw && typeof candidate.raw === 'object' ? candidate.raw as Record<string, unknown> : {}),
            normalizedQuery: normalize(query),
            queryVariantIndex: index,
            usedFood101Seed: index > 0 && normalize(query) !== normalize(trimmed),
          },
        });
      }
    }
  }

  const sorted = mergeCandidates(merged);
  return {
    best: sorted[0] ?? null,
    candidates: sorted,
  };
}
