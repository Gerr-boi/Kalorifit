import { useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { pullFromSupabase, pushAllToSupabase, startSyncListener } from '../lib/supabaseSync';

/**
 * Hook that manages bidirectional sync between localStorage and Supabase.
 * Attach this once at the app root when the user is authenticated.
 */
export function useSupabaseSync(user: User | null) {
  const syncCleanupRef = useRef<(() => void) | null>(null);
  const hasInitialSyncRef = useRef(false);

  useEffect(() => {
    if (!user) {
      // Cleanup sync listener if user logs out
      if (syncCleanupRef.current) {
        syncCleanupRef.current();
        syncCleanupRef.current = null;
      }
      hasInitialSyncRef.current = false;
      return;
    }

    const userId = user.id;

    // Initial sync: pull from Supabase, then push local data (merge)
    const doInitialSync = async () => {
      if (hasInitialSyncRef.current) return;
      hasInitialSyncRef.current = true;

      try {
        // First pull remote data (won't overwrite if local is same)
        await pullFromSupabase(userId);
        // Then push any local-only data to Supabase
        await pushAllToSupabase(userId);
      } catch (err) {
        console.warn('[Sync] Initial sync error:', err);
      }

      // Start live sync listener
      syncCleanupRef.current = startSyncListener(userId);
    };

    doInitialSync();

    return () => {
      if (syncCleanupRef.current) {
        syncCleanupRef.current();
        syncCleanupRef.current = null;
      }
    };
  }, [user]);
}
