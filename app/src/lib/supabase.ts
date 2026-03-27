import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[KaloriFit] Missing Supabase env vars. Running in offline/localStorage-only mode.',
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// =====================================================
// Types
// =====================================================

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  language: string;
  notifications_enabled: boolean;
  meal_reminders: {
    breakfast: boolean;
    breakfastTime: string;
    lunch: boolean;
    lunchTime: string;
    dinner: boolean;
    dinnerTime: string;
  };
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  privacy_settings: {
    anonymousPosting: boolean;
    hideWeightNumbers: boolean;
    hideBodyPhotos: boolean;
  };
};

export type DailyLog = {
  id: string;
  user_id: string;
  date: string;
  calories_consumed: number;
  calories_goal: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: Array<{
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    timestamp: string;
  }>;
  water_glasses: number;
  water_ml: number;
  notes: string | null;
};

export type CommunityPost = {
  id: string;
  user_id: string;
  author_name: string;
  author_initials: string | null;
  author_avatar: string | null;
  kind: 'workout' | 'recipe' | 'meal_win' | 'struggle' | 'reflection';
  caption: string | null;
  image_url: string | null;
  duration_minutes: number | null;
  calories: number | null;
  pr_highlight: string | null;
  streak: number;
  visibility: 'public' | 'friends' | 'private';
  reactions: {
    fire: number;
    strong: number;
    beast: number;
    insane: number;
    watching: number;
  };
  saves: number;
  tries: number;
  recipe_title: string | null;
  recipe_ingredients: string[] | null;
  recipe_steps: string[] | null;
  recipe_servings: number | null;
  recipe_prep_minutes: number | null;
  created_at: string;
};

// =====================================================
// Auth helpers
// =====================================================

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Supabase ikke konfigurert');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase ikke konfigurert');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
