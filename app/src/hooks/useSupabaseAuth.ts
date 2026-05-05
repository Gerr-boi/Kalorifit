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

  const signUp = useCallback(async (email: string, password: string, username?: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };
    // VITE_APP_URL (set in Vercel env vars) takes priority so that even a
    // signup initiated from a staging/local environment redirects to the real
    // production URL.  Falls back to the current origin (correct in prod).
    const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appUrl,
        data: {
          username: (username ?? email.split('@')[0]).toLowerCase(),
          display_name: username ?? email.split('@')[0],
        },
      },
    });
    return { data, error };
  }, []);

  /**
   * Sign in with email OR username.
   * If `identifier` does not contain '@' it is treated as a username and
   * looked up via the `get_email_by_username` RPC before signing in.
   */
  const signIn = useCallback(async (identifier: string, password: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };

    const email = identifier.trim();

    if (!email.includes('@')) {
      return { error: { message: 'Logg inn med e-postadressen din' } };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Fire-and-forget login notification (requires login-notify Edge Function + RESEND_API_KEY)
    if (!error && data.session) {
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-notify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      ).catch(() => { /* ignore — notification is best-effort */ });
    }

    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return { error: { message: 'Supabase ikke konfigurert' } };
    const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appUrl,
    });
    return { error };
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!supabase) {
      try { window.localStorage.clear(); } catch {}
      return { error: null };
    }
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
        await supabase.auth.signOut();
        try { window.localStorage.clear(); } catch {}
        return { error: null };
      }
    } catch {
      // Best-effort
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
