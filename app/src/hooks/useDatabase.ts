import { useEffect, useState, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';
import { getProfile, getDailyLog, upsertDailyLog, addWater } from '../lib/database';
import type { User } from '@supabase/supabase-js';
import type { Profile, DailyLog } from '../lib/supabase';

export function useDatabase() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const userProfile = await getProfile(currentUser.id);
        setProfile(userProfile);
      }

      setLoading(false);
    };

    init();

    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const userProfile = await getProfile(session.user.id);
          setProfile(userProfile);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const syncDailyLog = useCallback(async (date: string, logData: Partial<DailyLog>) => {
    if (!user) return null;

    return upsertDailyLog({
      user_id: user.id,
      date,
      ...logData,
    });
  }, [user]);

  const addWaterGlass = useCallback(async (date: string) => {
    if (!user) return null;
    return addWater(user.id, date, 1);
  }, [user]);

  return {
    user,
    profile,
    loading,
    isAuthenticated: !!user,
    syncDailyLog,
    addWaterGlass,
  };
}
