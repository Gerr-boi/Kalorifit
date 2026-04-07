import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface DatabaseContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const DatabaseContext = createContext<DatabaseContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
});

export function useAuth() {
  return useContext(DatabaseContext);
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <DatabaseContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}
