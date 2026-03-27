/**
 * supabaseSync.ts — Sync layer between localStorage and Supabase.
 *
 * Strategy: localStorage remains the primary data store for instant UI.
 * Supabase is the persistent backend. On login we pull from Supabase → localStorage.
 * On writes we push localStorage → Supabase in background.
 *
 * We use a generic `user_kv_store` table to mirror all localStorage keys as JSONB.
 * This avoids restructuring every component while ensuring nothing is lost.
 */

import { supabase } from './supabase';
import {
  getScopedStorageKey,
  emitLocalStorageStateChanged,
} from '../hooks/useLocalStorageState';

// Keys we sync to Supabase (covers all important app data)
const SYNCED_KEYS = [
  'profile',
  'home.dailyLogs.v2',
  'home.weeklyReports.v1',
  'home.identityReports.v1',
  'home.lastLoggedFood.v1',
  'home.logEvents.v1',
  'home.savedMealTemplates.v1',
  'home.workoutSessions.v1',
  'home.microLogs.v1',
  'home.goalPopupDismissed.v1',
  'home.goalPopupShown.v1',
  'meals.favoriteRecipeIds.v1',
  'meals.favoriteTags.v1',
] as const;

const GLOBAL_SYNCED_KEYS = [
  'community.posts.v1',
  'community.myReactions.v1',
  'community.addPostFabPosition.v1',
] as const;

// Debounce map to avoid spamming Supabase on rapid changes
const pendingUploads = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1500;

/**
 * Upload a single key to Supabase (upsert into user_kv_store).
 */
async function uploadKey(userId: string, key: string, scope: 'user' | 'global') {
  if (!supabase) return;

  const storageKey = scope === 'global' ? key : getScopedStorageKey(key, 'user');
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) return;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }

  const { error } = await supabase.from('user_kv_store').upsert(
    {
      user_id: userId,
      key,
      scope,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  );

  if (error) {
    console.warn(`[Sync] Failed to upload key "${key}":`, error.message);
  }
}

/**
 * Schedule a debounced upload for a key.
 */
function scheduleUpload(userId: string, key: string, scope: 'user' | 'global') {
  const mapKey = `${userId}:${key}`;
  const existing = pendingUploads.get(mapKey);
  if (existing) clearTimeout(existing);

  pendingUploads.set(
    mapKey,
    setTimeout(() => {
      pendingUploads.delete(mapKey);
      uploadKey(userId, key, scope).catch(() => {});
    }, DEBOUNCE_MS),
  );
}

/**
 * Download all synced keys from Supabase → localStorage.
 * Called on login/app load when authenticated.
 */
export async function pullFromSupabase(supabaseUserId: string): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('user_kv_store')
    .select('key, scope, value')
    .eq('user_id', supabaseUserId);

  if (error) {
    console.warn('[Sync] Failed to pull from Supabase:', error.message);
    return;
  }

  if (!data || data.length === 0) return;

  for (const row of data) {
    const storageKey =
      row.scope === 'global'
        ? row.key
        : getScopedStorageKey(row.key, 'user');

    const serialized = JSON.stringify(row.value);
    const existing = window.localStorage.getItem(storageKey);

    // Only overwrite if Supabase has data and localStorage is empty or different
    if (existing === null || existing !== serialized) {
      window.localStorage.setItem(storageKey, serialized);
      emitLocalStorageStateChanged(row.key, {
        scope: row.scope as 'user' | 'global',
      });
    }
  }
}

/**
 * Push all current localStorage data to Supabase.
 * Called after first login or when migrating from localStorage-only.
 */
export async function pushAllToSupabase(supabaseUserId: string): Promise<void> {
  if (!supabase) return;

  const rows: Array<{
    user_id: string;
    key: string;
    scope: string;
    value: unknown;
    updated_at: string;
  }> = [];

  const now = new Date().toISOString();

  for (const key of SYNCED_KEYS) {
    const storageKey = getScopedStorageKey(key, 'user');
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) continue;
    try {
      rows.push({
        user_id: supabaseUserId,
        key,
        scope: 'user',
        value: JSON.parse(raw),
        updated_at: now,
      });
    } catch { /* skip unparseable */ }
  }

  for (const key of GLOBAL_SYNCED_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      rows.push({
        user_id: supabaseUserId,
        key,
        scope: 'global',
        value: JSON.parse(raw),
        updated_at: now,
      });
    } catch { /* skip */ }
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('user_kv_store')
    .upsert(rows, { onConflict: 'user_id,key' });

  if (error) {
    console.warn('[Sync] Failed to push to Supabase:', error.message);
  }
}

/**
 * Start listening for localStorage changes and sync them to Supabase.
 * Returns a cleanup function.
 */
export function startSyncListener(supabaseUserId: string): () => void {
  if (!supabase) return () => {};

  const allSyncedKeys = new Set<string>([
    ...SYNCED_KEYS,
    ...GLOBAL_SYNCED_KEYS,
  ]);

  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || !detail.key) return;
    if (!allSyncedKeys.has(detail.key)) return;

    const scope: 'user' | 'global' = GLOBAL_SYNCED_KEYS.includes(
      detail.key as (typeof GLOBAL_SYNCED_KEYS)[number],
    )
      ? 'global'
      : 'user';

    scheduleUpload(supabaseUserId, detail.key, scope);
  };

  window.addEventListener('kalorifit:local-storage-state-changed', handler);

  // Also listen for native storage events (other tabs)
  const storageHandler = (event: StorageEvent) => {
    if (!event.key) return;
    // Check if the raw key maps to any synced key
    for (const key of allSyncedKeys) {
      const scopedKey = getScopedStorageKey(key, 'user');
      if (event.key === key || event.key === scopedKey) {
        const scope: 'user' | 'global' = GLOBAL_SYNCED_KEYS.includes(
          key as (typeof GLOBAL_SYNCED_KEYS)[number],
        )
          ? 'global'
          : 'user';
        scheduleUpload(supabaseUserId, key, scope);
        break;
      }
    }
  };

  window.addEventListener('storage', storageHandler);

  return () => {
    window.removeEventListener('kalorifit:local-storage-state-changed', handler);
    window.removeEventListener('storage', storageHandler);
    // Flush pending uploads
    for (const [, timer] of pendingUploads) clearTimeout(timer);
    pendingUploads.clear();
  };
}
