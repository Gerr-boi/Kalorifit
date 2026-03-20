/**
 * Simple client-side rate limiter using a sliding window per named key.
 *
 * OWASP A05 (Security Misconfiguration) / A04 (Insecure Design) mitigation:
 * prevents the client from hammering third-party APIs with API keys
 * (Kassalapp, OpenFoodFacts) regardless of how fast the UI triggers lookups.
 *
 * Usage:
 *   if (!rateLimiter.tryAcquire('kassalapp:barcode', { maxPerWindow: 30, windowMs: 60_000 })) {
 *     return null; // rate-limited, caller handles gracefully
 *   }
 */

interface WindowEntry {
  /** Timestamps (ms) of calls within the current window */
  calls: number[];
  /** Monotonic start of the current window */
  windowStart: number;
}

const store = new Map<string, WindowEntry>();

interface RateLimitOpts {
  /** Maximum number of calls allowed within `windowMs` */
  maxPerWindow: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Optional hard minimum gap between consecutive calls (ms) */
  minIntervalMs?: number;
}

/**
 * Returns `true` if the call is allowed, `false` if it is rate-limited.
 * Side-effect: records the call timestamp when allowed.
 */
export function tryAcquire(key: string, opts: RateLimitOpts): boolean {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now - entry.windowStart >= opts.windowMs) {
    entry = { calls: [], windowStart: now };
    store.set(key, entry);
  }

  // Evict calls outside the current window
  const cutoff = now - opts.windowMs;
  entry.calls = entry.calls.filter((t) => t > cutoff);

  // Hard minimum interval check
  if (opts.minIntervalMs && entry.calls.length > 0) {
    const lastCall = entry.calls[entry.calls.length - 1];
    if (now - lastCall < opts.minIntervalMs) return false;
  }

  if (entry.calls.length >= opts.maxPerWindow) return false;

  entry.calls.push(now);
  return true;
}

/** Expose current call count for a key (useful in tests / diagnostics) */
export function getCallCount(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  const cutoff = Date.now() - (entry.calls.length ? 0 : Infinity);
  return entry.calls.filter((t) => t > Date.now() - 60_000).length;
}

/** Reset a key's counter (useful in tests) */
export function resetKey(key: string): void {
  store.delete(key);
}
