/**
 * communityService.ts
 *
 * Abstraction layer for all community data operations.
 * Backed by Supabase when VITE_SUPABASE_URL is set, otherwise localStorage.
 *
 * DB INTEGRATION POINTS are marked with: // ← DB_HOOK
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReactionKey = 'fire' | 'strong' | 'beast' | 'insane' | 'watching';
export type PostVisibility = 'public' | 'friends' | 'private';
export type PostKind = 'workout' | 'recipe' | 'meal_win' | 'struggle' | 'reflection';
export type CheckInType = 'trained' | 'hit_protein' | 'in_calories' | 'slept_7h';
export type ChallengeId = 'protein_7day' | 'log_5day' | 'workout_3x' | 'clean_week' | 'recipe_share';

export type CommunityPost = {
  // Identity
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarDataUrl?: string;

  // Content
  kind: PostKind;
  caption: string;
  imageDataUrl?: string;
  visibility: PostVisibility;

  // Author context (snapshot at post time)
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  goal: string;
  trainingStyle: string;
  identityBadge: string;
  equippedBadgeIds: string[];
  streak: number;
  hideCalories: boolean;
  hideBodyPhoto: boolean;

  // Workout-specific
  durationMinutes: number;
  calories: number;
  prHighlight: string;

  // Recipe-specific
  recipeTitle?: string;
  recipeIngredients?: string[];
  recipeSteps?: string[];
  recipeServings?: number;
  recipePrepMinutes?: number;

  // Engagement (server-side counters in DB)
  reactions: Record<ReactionKey, number>;
  saves: number;
  tries: number;

  // Timestamps
  createdAt: number;        // Unix ms — for ordering
  updatedAt?: number;       // Unix ms — for conflict resolution

  // DB versioning field (optimistic concurrency)
  _v?: number;
};

export type DailyCheckIn = {
  userId: string;
  dateKey: string;           // 'YYYY-MM-DD'
  types: CheckInType[];
  updatedAt: number;
};

export type JoinedChallenge = {
  userId: string;
  challengeId: ChallengeId;
  joinedAt: number;
};

export type ReactionRecord = {
  userId: string;
  postId: string;
  reaction: ReactionKey;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Service interface — implement this against any DB ─────────────────────────

export interface ICommunityService {
  /** Fetch paginated public posts. cursor = last post's createdAt for pagination. */
  fetchPosts(opts?: { cursor?: number; limit?: number; filter?: PostKind | 'all' }): Promise<ServiceResult<CommunityPost[]>>;

  /** Create a new post. Returns the saved post with server-assigned fields. */
  createPost(post: Omit<CommunityPost, 'id' | 'reactions' | 'saves' | 'tries' | 'createdAt' | 'updatedAt' | '_v'>): Promise<ServiceResult<CommunityPost>>;

  /** Delete own post. */
  deletePost(postId: string, userId: string): Promise<ServiceResult<void>>;

  /** Toggle reaction on a post (add or remove). Returns updated reaction counts. */
  setReaction(postId: string, userId: string, reaction: ReactionKey | null): Promise<ServiceResult<Record<ReactionKey, number>>>;

  /** Toggle save on a post. Returns new saves count. */
  toggleSave(postId: string, userId: string): Promise<ServiceResult<{ saves: number; saved: boolean }>>;

  /** Toggle "tried this" on a post. Returns new tries count. */
  toggleTry(postId: string, userId: string): Promise<ServiceResult<{ tries: number; tried: boolean }>>;

  /** Upsert daily check-in for the user. */
  upsertCheckIn(checkIn: DailyCheckIn): Promise<ServiceResult<DailyCheckIn>>;

  /** Fetch today's check-in for a user. */
  fetchCheckIn(userId: string, dateKey: string): Promise<ServiceResult<DailyCheckIn | null>>;

  /** Join or leave a challenge. */
  toggleChallenge(userId: string, challengeId: ChallengeId): Promise<ServiceResult<{ joined: boolean }>>;

  /** Fetch the user's joined challenges. */
  fetchJoinedChallenges(userId: string): Promise<ServiceResult<JoinedChallenge[]>>;

  /** Fetch post IDs the user has saved. */
  fetchSavedPostIds(userId: string): Promise<ServiceResult<string[]>>;

  /** Fetch post IDs the user has tried. */
  fetchTriedPostIds(userId: string): Promise<ServiceResult<string[]>>;

  /** Fetch the user's reaction map { postId → ReactionKey }. */
  fetchMyReactions(userId: string): Promise<ServiceResult<Record<string, ReactionKey>>>;
}

// ─── localStorage implementation ─────────────────────────────────────────────
//
// Replace this class with a real HTTP/Supabase/Firebase client to connect a DB.
// The UI never imports localStorage keys directly — only this service does.
//
// ← DB_HOOK: swap LocalStorageCommunityService for RemoteCommunityService

const LS_POSTS_KEY = 'community.posts.v1';
const LS_CHECK_INS_KEY = 'community.checkIns.v1';
const LS_JOINED_CHALLENGES_KEY = 'community.challenges.v1';
const LS_SAVED_POSTS_KEY = 'community.savedPosts.v1';
const LS_TRIED_POSTS_KEY = 'community.triedPosts.v1';
const LS_MY_REACTIONS_KEY = 'community.myReactions.v1';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — ignore
  }
}

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function createId(prefix: string): string {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

class LocalStorageCommunityService implements ICommunityService {
  async fetchPosts({ cursor, limit = 40, filter = 'all' }: { cursor?: number; limit?: number; filter?: PostKind | 'all' } = {}): Promise<ServiceResult<CommunityPost[]>> {
    let posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    if (filter !== 'all') posts = posts.filter((p) => p.kind === filter);
    if (cursor) posts = posts.filter((p) => p.createdAt < cursor);
    posts = [...posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    return ok(posts);
  }

  async createPost(draft: Omit<CommunityPost, 'id' | 'reactions' | 'saves' | 'tries' | 'createdAt' | 'updatedAt' | '_v'>): Promise<ServiceResult<CommunityPost>> {
    const post: CommunityPost = {
      ...draft,
      id: createId('post'),
      reactions: { fire: 0, strong: 0, beast: 0, insane: 0, watching: 0 },
      saves: 0,
      tries: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      _v: 1,
    };
    const posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    lsSet(LS_POSTS_KEY, [post, ...posts]);
    return ok(post);
  }

  async deletePost(postId: string, userId: string): Promise<ServiceResult<void>> {
    const posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    const next = posts.filter((p) => !(p.id === postId && p.authorId === userId));
    lsSet(LS_POSTS_KEY, next);
    return ok(undefined);
  }

  async setReaction(postId: string, _userId: string, reaction: ReactionKey | null): Promise<ServiceResult<Record<ReactionKey, number>>> {
    const posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    const myReactions = lsGet<Record<string, ReactionKey | undefined>>(LS_MY_REACTIONS_KEY, {});
    const previous = myReactions[postId];

    const next = posts.map((post) => {
      if (post.id !== postId) return post;
      const r = { ...post.reactions };
      if (previous && r[previous] > 0) r[previous] -= 1;
      if (reaction && reaction !== previous) r[reaction] += 1;
      return { ...post, reactions: r, updatedAt: Date.now() };
    });
    lsSet(LS_POSTS_KEY, next);
    lsSet(LS_MY_REACTIONS_KEY, { ...myReactions, [postId]: reaction === previous ? undefined : reaction ?? undefined });

    const updated = next.find((p) => p.id === postId);
    return ok(updated?.reactions ?? { fire: 0, strong: 0, beast: 0, insane: 0, watching: 0 });
  }

  async toggleSave(postId: string, _userId: string): Promise<ServiceResult<{ saves: number; saved: boolean }>> {
    const saved = lsGet<string[]>(LS_SAVED_POSTS_KEY, []);
    const alreadySaved = saved.includes(postId);
    const nextSaved = alreadySaved ? saved.filter((id) => id !== postId) : [...saved, postId];
    lsSet(LS_SAVED_POSTS_KEY, nextSaved);

    const posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    const delta = alreadySaved ? -1 : 1;
    lsSet(LS_POSTS_KEY, posts.map((p) => p.id === postId ? { ...p, saves: Math.max(0, (p.saves ?? 0) + delta), updatedAt: Date.now() } : p));
    const updatedPost = posts.find((p) => p.id === postId);
    return ok({ saves: Math.max(0, (updatedPost?.saves ?? 0) + delta), saved: !alreadySaved });
  }

  async toggleTry(postId: string, _userId: string): Promise<ServiceResult<{ tries: number; tried: boolean }>> {
    const tried = lsGet<string[]>(LS_TRIED_POSTS_KEY, []);
    const alreadyTried = tried.includes(postId);
    const nextTried = alreadyTried ? tried.filter((id) => id !== postId) : [...tried, postId];
    lsSet(LS_TRIED_POSTS_KEY, nextTried);

    const posts = lsGet<CommunityPost[]>(LS_POSTS_KEY, []);
    const delta = alreadyTried ? -1 : 1;
    lsSet(LS_POSTS_KEY, posts.map((p) => p.id === postId ? { ...p, tries: Math.max(0, (p.tries ?? 0) + delta), updatedAt: Date.now() } : p));
    const updatedPost = posts.find((p) => p.id === postId);
    return ok({ tries: Math.max(0, (updatedPost?.tries ?? 0) + delta), tried: !alreadyTried });
  }

  async upsertCheckIn(checkIn: DailyCheckIn): Promise<ServiceResult<DailyCheckIn>> {
    const all = lsGet<DailyCheckIn[]>(LS_CHECK_INS_KEY, []);
    const exists = all.findIndex((ci) => ci.userId === checkIn.userId && ci.dateKey === checkIn.dateKey);
    const next = exists >= 0
      ? all.map((ci, i) => i === exists ? { ...checkIn, updatedAt: Date.now() } : ci)
      : [...all, { ...checkIn, updatedAt: Date.now() }];
    lsSet(LS_CHECK_INS_KEY, next);
    return ok(checkIn);
  }

  async fetchCheckIn(userId: string, dateKey: string): Promise<ServiceResult<DailyCheckIn | null>> {
    const all = lsGet<DailyCheckIn[]>(LS_CHECK_INS_KEY, []);
    return ok(all.find((ci) => ci.userId === userId && ci.dateKey === dateKey) ?? null);
  }

  async toggleChallenge(userId: string, challengeId: ChallengeId): Promise<ServiceResult<{ joined: boolean }>> {
    const joined = lsGet<JoinedChallenge[]>(LS_JOINED_CHALLENGES_KEY, []);
    const existing = joined.findIndex((c) => c.userId === userId && c.challengeId === challengeId);
    if (existing >= 0) {
      lsSet(LS_JOINED_CHALLENGES_KEY, joined.filter((_, i) => i !== existing));
      return ok({ joined: false });
    }
    lsSet(LS_JOINED_CHALLENGES_KEY, [...joined, { userId, challengeId, joinedAt: Date.now() }]);
    return ok({ joined: true });
  }

  async fetchJoinedChallenges(userId: string): Promise<ServiceResult<JoinedChallenge[]>> {
    const all = lsGet<JoinedChallenge[]>(LS_JOINED_CHALLENGES_KEY, []);
    return ok(all.filter((c) => c.userId === userId));
  }

  async fetchSavedPostIds(_userId: string): Promise<ServiceResult<string[]>> {
    return ok(lsGet<string[]>(LS_SAVED_POSTS_KEY, []));
  }

  async fetchTriedPostIds(_userId: string): Promise<ServiceResult<string[]>> {
    return ok(lsGet<string[]>(LS_TRIED_POSTS_KEY, []));
  }

  async fetchMyReactions(_userId: string): Promise<ServiceResult<Record<string, ReactionKey>>> {
    const raw = lsGet<Record<string, ReactionKey | undefined>>(LS_MY_REACTIONS_KEY, {});
    const clean: Record<string, ReactionKey> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v) clean[k] = v;
    }
    return ok(clean);
  }
}

// ─── Input sanitiser ─────────────────────────────────────────────────────────
//
// Centralised validation used by BOTH implementations so callers can't bypass
// limits regardless of which backend is active.

const ALLOWED_KINDS: ReadonlySet<string> = new Set(['workout', 'recipe', 'meal_win', 'struggle', 'reflection']);
const ALLOWED_VISIBILITY: ReadonlySet<string> = new Set(['public', 'friends', 'private']);
const ALLOWED_REACTIONS: ReadonlySet<string> = new Set(['fire', 'strong', 'beast', 'insane', 'watching']);
const MAX_CAPTION_LEN = 500;
const MAX_RECIPE_TITLE_LEN = 120;
const MAX_RECIPE_ITEMS = 50;
const MAX_RECIPE_ITEM_LEN = 200;
const MAX_IMAGE_DATA_URL_LEN = 250_000; // ~187 KB base64
const MAX_PR_HIGHLIGHT_LEN = 120;
const MAX_AUTHOR_NAME_LEN = 60;

function sanitiseString(s: string | undefined, maxLen: number): string {
  return (s ?? '').trim().slice(0, maxLen);
}

function sanitiseLines(raw: string[] | undefined, maxItems: number, maxItemLen: number): string[] {
  return (raw ?? [])
    .map((l) => l.trim().slice(0, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function validateImageDataUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.length > MAX_IMAGE_DATA_URL_LEN) return undefined;          // too large
  if (!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)) return undefined; // must be valid image data URL
  return url;
}

type PostDraft = Parameters<ICommunityService['createPost']>[0];

function sanitiseDraft(draft: PostDraft): PostDraft {
  if (!ALLOWED_KINDS.has(draft.kind)) throw new Error(`Invalid post kind: ${draft.kind}`);
  if (!ALLOWED_VISIBILITY.has(draft.visibility ?? 'public')) throw new Error(`Invalid visibility`);
  return {
    ...draft,
    authorName: sanitiseString(draft.authorName, MAX_AUTHOR_NAME_LEN) || 'Anonymous',
    authorInitials: sanitiseString(draft.authorInitials, 4) || 'U',
    authorAvatarDataUrl: validateImageDataUrl(draft.authorAvatarDataUrl),
    caption: sanitiseString(draft.caption, MAX_CAPTION_LEN),
    imageDataUrl: validateImageDataUrl(draft.imageDataUrl),
    prHighlight: sanitiseString(draft.prHighlight, MAX_PR_HIGHLIGHT_LEN),
    recipeTitle: sanitiseString(draft.recipeTitle, MAX_RECIPE_TITLE_LEN) || undefined,
    recipeIngredients: sanitiseLines(draft.recipeIngredients, MAX_RECIPE_ITEMS, MAX_RECIPE_ITEM_LEN),
    recipeSteps: sanitiseLines(draft.recipeSteps, MAX_RECIPE_ITEMS, MAX_RECIPE_ITEM_LEN),
    durationMinutes: Math.max(1, Math.min(600, Number(draft.durationMinutes) || 1)),
    calories: Math.max(0, Math.min(10_000, Number(draft.calories) || 0)),
    recipeServings: Math.max(1, Math.min(100, Number(draft.recipeServings) || 1)),
    recipePrepMinutes: Math.max(1, Math.min(1440, Number(draft.recipePrepMinutes) || 1)),
    streak: Math.max(0, Math.min(3650, Number(draft.streak) || 0)),
  };
}

// ─── Supabase implementation ──────────────────────────────────────────────────
//
// Works with the existing community_posts column-based schema (from supabase.ts).
// Stores a full snapshot in `data JSONB` for fast reads; also populates individual
// columns so existing queries keep working.
// user_id is always taken from auth.uid() — never from client-supplied authorId.
//
// Schema: see supabase/migrations/20260412_community.sql

// Generate a proper UUID (no prefix) for Supabase UUID primary keys.
function newUuid(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  // Fallback (should never be needed in a browser context)
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

// Map a raw DB row to CommunityPost.
// Prefers the `data` JSONB snapshot (has all fields); falls back to columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPost(row: Record<string, any>): CommunityPost {
  if (row.data && typeof row.data === 'object' && row.data.id) {
    return row.data as CommunityPost;
  }
  // Reconstruct from individual columns (posts created before this migration)
  return {
    id: String(row.id),
    authorId: String(row.user_id ?? ''),
    authorName: String(row.author_name ?? 'Unknown'),
    authorInitials: String(row.author_initials ?? 'U'),
    authorAvatarDataUrl: row.author_avatar ? String(row.author_avatar) : undefined,
    kind: (row.kind as PostKind) ?? 'workout',
    caption: String(row.caption ?? ''),
    imageDataUrl: row.image_url ? String(row.image_url) : undefined,
    visibility: (row.visibility as PostVisibility) ?? 'public',
    level: (row.level as CommunityPost['level']) ?? 'Beginner',
    goal: String(row.goal ?? 'General fitness'),
    trainingStyle: String(row.training_style ?? 'Mixed training'),
    identityBadge: String(row.identity_badge ?? 'Starting Strong'),
    equippedBadgeIds: Array.isArray(row.equipped_badge_ids) ? row.equipped_badge_ids as string[] : [],
    streak: Number(row.streak ?? 0),
    hideCalories: Boolean(row.hide_calories ?? false),
    hideBodyPhoto: Boolean(row.hide_body_photo ?? false),
    durationMinutes: Number(row.duration_minutes ?? 30),
    calories: Number(row.calories ?? 0),
    prHighlight: String(row.pr_highlight ?? ''),
    recipeTitle: row.recipe_title ? String(row.recipe_title) : undefined,
    recipeIngredients: Array.isArray(row.recipe_ingredients) ? row.recipe_ingredients as string[] : undefined,
    recipeSteps: Array.isArray(row.recipe_steps) ? row.recipe_steps as string[] : undefined,
    recipeServings: row.recipe_servings != null ? Number(row.recipe_servings) : undefined,
    recipePrepMinutes: row.recipe_prep_minutes != null ? Number(row.recipe_prep_minutes) : undefined,
    reactions: (typeof row.reactions === 'object' && row.reactions)
      ? row.reactions as Record<ReactionKey, number>
      : { fire: 0, strong: 0, beast: 0, insane: 0, watching: 0 },
    saves: Number(row.saves ?? 0),
    tries: Number(row.tries ?? 0),
    createdAt: row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).getTime() : undefined,
  };
}

class SupabaseCommunityService implements ICommunityService {
  private get db() {
    if (!supabase) throw new Error('Supabase not configured');
    return supabase;
  }

  async fetchPosts({ cursor, limit = 40, filter = 'all' }: { cursor?: number; limit?: number; filter?: PostKind | 'all' } = {}): Promise<ServiceResult<CommunityPost[]>> {
    try {
      let query = this.db
        .from('community_posts')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100));

      if (cursor) {
        query = query.lt('created_at', new Date(cursor).toISOString());
      }
      if (filter !== 'all') {
        query = query.eq('kind', filter);
      }

      const { data, error } = await query;
      if (error) return { ok: false, error: error.message };
      return ok((data ?? []).map(rowToPost));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async createPost(draft: PostDraft): Promise<ServiceResult<CommunityPost>> {
    try {
      const { data: { user }, error: authError } = await this.db.auth.getUser();
      if (authError || !user) return { ok: false, error: 'Ikke innlogget' };

      const clean = sanitiseDraft(draft);
      const now = Date.now();
      const post: CommunityPost = {
        ...clean,
        authorId: user.id,          // always server-verified UID
        id: newUuid(),              // proper UUID for the UUID primary key
        reactions: { fire: 0, strong: 0, beast: 0, insane: 0, watching: 0 },
        saves: 0,
        tries: 0,
        createdAt: now,
        updatedAt: now,
        _v: 1,
      };

      const nowIso = new Date(now).toISOString();
      const { error } = await this.db
        .from('community_posts')
        .insert({
          id: post.id,
          user_id: user.id,
          visibility: post.visibility ?? 'public',
          // Individual columns (existing schema)
          author_name: post.authorName,
          author_initials: post.authorInitials,
          author_avatar: post.authorAvatarDataUrl ?? null,
          kind: post.kind,
          caption: post.caption || null,
          image_url: post.imageDataUrl ?? null,
          duration_minutes: post.durationMinutes,
          calories: post.calories,
          pr_highlight: post.prHighlight || null,
          streak: post.streak,
          reactions: post.reactions,
          saves: 0,
          tries: 0,
          recipe_title: post.recipeTitle ?? null,
          recipe_ingredients: post.recipeIngredients ?? null,
          recipe_steps: post.recipeSteps ?? null,
          recipe_servings: post.recipeServings ?? null,
          recipe_prep_minutes: post.recipePrepMinutes ?? null,
          // Extended columns added by migration
          level: post.level,
          goal: post.goal,
          training_style: post.trainingStyle,
          identity_badge: post.identityBadge,
          equipped_badge_ids: post.equippedBadgeIds,
          hide_calories: post.hideCalories,
          hide_body_photo: post.hideBodyPhoto,
          // Full snapshot for fast reads
          data: post,
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (error) return { ok: false, error: error.message };
      return ok(post);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async deletePost(postId: string, _userId: string): Promise<ServiceResult<void>> {
    try {
      const { error } = await this.db.from('community_posts').delete().eq('id', postId);
      if (error) return { ok: false, error: error.message };
      return ok(undefined);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async setReaction(postId: string, _userId: string, reaction: ReactionKey | null): Promise<ServiceResult<Record<ReactionKey, number>>> {
    try {
      if (reaction && !ALLOWED_REACTIONS.has(reaction)) return { ok: false, error: 'Invalid reaction' };
      const { data, error } = await this.db.rpc('community_toggle_reaction', {
        p_post_id: postId,
        p_reaction: reaction ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return ok(data as Record<ReactionKey, number>);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async toggleSave(postId: string, _userId: string): Promise<ServiceResult<{ saves: number; saved: boolean }>> {
    try {
      const { data, error } = await this.db.rpc('community_toggle_save', { p_post_id: postId });
      if (error) return { ok: false, error: error.message };
      return ok(data as { saves: number; saved: boolean });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async toggleTry(postId: string, _userId: string): Promise<ServiceResult<{ tries: number; tried: boolean }>> {
    try {
      const { data, error } = await this.db.rpc('community_toggle_try', { p_post_id: postId });
      if (error) return { ok: false, error: error.message };
      return ok(data as { tries: number; tried: boolean });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async upsertCheckIn(checkIn: DailyCheckIn): Promise<ServiceResult<DailyCheckIn>> {
    try {
      const { data: { user } } = await this.db.auth.getUser();
      if (!user) return { ok: false, error: 'Ikke innlogget' };
      const { error } = await this.db
        .from('community_check_ins')
        .upsert({
          user_id: user.id,
          date_key: checkIn.dateKey,
          types: checkIn.types,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,date_key' });
      if (error) return { ok: false, error: error.message };
      return ok(checkIn);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchCheckIn(userId: string, dateKey: string): Promise<ServiceResult<DailyCheckIn | null>> {
    try {
      const { data, error } = await this.db
        .from('community_check_ins')
        .select('types')
        .eq('date_key', dateKey)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return ok(null);
      return ok({ userId, dateKey, types: data.types as CheckInType[], updatedAt: Date.now() });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async toggleChallenge(_userId: string, challengeId: ChallengeId): Promise<ServiceResult<{ joined: boolean }>> {
    try {
      const { data: { user } } = await this.db.auth.getUser();
      if (!user) return { ok: false, error: 'Ikke innlogget' };
      const { data: existing } = await this.db
        .from('community_joined_challenges')
        .select('challenge_id')
        .eq('challenge_id', challengeId)
        .maybeSingle();
      if (existing) {
        await this.db.from('community_joined_challenges').delete().eq('challenge_id', challengeId);
        return ok({ joined: false });
      }
      await this.db.from('community_joined_challenges')
        .insert({ user_id: user.id, challenge_id: challengeId, joined_at: new Date().toISOString() });
      return ok({ joined: true });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchJoinedChallenges(_userId: string): Promise<ServiceResult<JoinedChallenge[]>> {
    try {
      const { data, error } = await this.db
        .from('community_joined_challenges')
        .select('challenge_id, joined_at');
      if (error) return { ok: false, error: error.message };
      return ok((data ?? []).map((r) => ({
        userId: _userId,
        challengeId: r.challenge_id as ChallengeId,
        joinedAt: new Date(r.joined_at as string).getTime(),
      })));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchSavedPostIds(_userId: string): Promise<ServiceResult<string[]>> {
    try {
      const { data, error } = await this.db.from('community_saves').select('post_id');
      if (error) return { ok: false, error: error.message };
      return ok((data ?? []).map((r) => String(r.post_id)));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchTriedPostIds(_userId: string): Promise<ServiceResult<string[]>> {
    try {
      const { data, error } = await this.db.from('community_tries').select('post_id');
      if (error) return { ok: false, error: error.message };
      return ok((data ?? []).map((r) => String(r.post_id)));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async fetchMyReactions(_userId: string): Promise<ServiceResult<Record<string, ReactionKey>>> {
    try {
      // Existing table uses reaction_type column (not reaction)
      const { data, error } = await this.db
        .from('community_reactions')
        .select('post_id, reaction_type');
      if (error) return { ok: false, error: error.message };
      const map: Record<string, ReactionKey> = {};
      for (const r of data ?? []) {
        if (r.reaction_type) map[String(r.post_id)] = r.reaction_type as ReactionKey;
      }
      return ok(map);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
//
// Uses Supabase when configured; falls back to localStorage for offline dev.

export const communityService: ICommunityService = supabase
  ? new SupabaseCommunityService()
  : new LocalStorageCommunityService();
