import { supabase } from './supabase';
import type { Profile, DailyLog, CommunityPost } from './supabase';

// =====================================================
// Profiles
// =====================================================

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    return null;
  }
  return data;
}

// =====================================================
// Daily Logs
// =====================================================

export async function getDailyLog(userId: string, date: string): Promise<DailyLog | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching daily log:', error);
  }
  return data;
}

export async function upsertDailyLog(log: Partial<DailyLog>): Promise<DailyLog | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(log, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting daily log:', error);
    return null;
  }
  return data;
}

export async function addWater(userId: string, date: string, glasses: number): Promise<DailyLog | null> {
  const existing = await getDailyLog(userId, date);
  const currentGlasses = existing?.water_glasses ?? 0;

  return upsertDailyLog({
    user_id: userId,
    date,
    water_glasses: currentGlasses + glasses,
    water_ml: (currentGlasses + glasses) * 250,
  });
}

// =====================================================
// Community
// =====================================================

export async function getCommunityPosts(limit: number = 50): Promise<CommunityPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return data ?? [];
}

export async function createCommunityPost(post: Partial<CommunityPost>): Promise<CommunityPost | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('community_posts')
    .insert(post)
    .select()
    .single();

  if (error) {
    console.error('Error creating post:', error);
    return null;
  }
  return data;
}

export async function addReaction(postId: string, userId: string, reactionType: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('community_reactions')
    .insert({ post_id: postId, user_id: userId, reaction_type: reactionType });

  if (error) {
    console.error('Error adding reaction:', error);
    return false;
  }
  return true;
}

export async function savePost(postId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('community_saves')
    .insert({ post_id: postId, user_id: userId });

  if (error) {
    console.error('Error saving post:', error);
    return false;
  }
  return true;
}

// =====================================================
// Foods
// =====================================================

export async function searchFoods(query: string, limit: number = 20) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(limit);

  if (error) {
    console.error('Error searching foods:', error);
    return [];
  }
  return data ?? [];
}
