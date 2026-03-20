import type { Barcode, NutritionResult } from "./types";

const STORAGE_KEY = "kf_nutrition_cache_v1";
const TTL_MS = 1000 * 60 * 60 * 24; // 24h
const MAX_ENTRIES = 200;

interface CacheEntry {
  value: NutritionResult;
  expiresAt: number;
}

function loadFromStorage(): Map<Barcode, CacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries = JSON.parse(raw) as [Barcode, CacheEntry][];
    const now = Date.now();
    return new Map(entries.filter(([, e]) => e.expiresAt > now));
  } catch {
    return new Map();
  }
}

function saveToStorage(cache: Map<Barcode, CacheEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...cache.entries()]));
  } catch {
    // Storage quota exceeded — clear and accept the loss
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

const cache: Map<Barcode, CacheEntry> = loadFromStorage();

export function getCached(barcode: Barcode): NutritionResult | null {
  const hit = cache.get(barcode);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(barcode);
    return null;
  }
  return hit.value;
}

export function setCached(barcode: Barcode, value: NutritionResult) {
  // Evict oldest entry when at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(barcode, { value, expiresAt: Date.now() + TTL_MS });
  saveToStorage(cache);
}
