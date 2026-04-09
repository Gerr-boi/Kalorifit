import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
};

export function useSupabaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!supabase) {
      // Local-only mode: just clear all localStorage data
      try { window.localStorage.clear(); } catch {}
      return { error: null };
    }
    // Call a Supabase Edge Function or admin endpoint to delete the user.
    // Supabase does not expose user self-deletion from the client SDK by default;
    // this calls the /functions/v1/delete-account edge function if available.
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return { error: { message: 'Ikke innlogget' } };

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        // If edge function not deployed, still sign out and clear local data
        await supabase.auth.signOut();
        try { window.localStorage.clear(); } catch {}
        return { error: null };
      }
    } catch {
      // Best-effort: sign out and clear local data
    }

    await supabase.auth.signOut();
    try { window.localStorage.clear(); } catch {}
    return { error: null };
  }, []);

  return {
    user,
    session,
    loading,
    isAuthenticated: !!session,
    signUp,
    signIn,
    signOut,
    resetPassword,
    deleteAccount,
  };
}
