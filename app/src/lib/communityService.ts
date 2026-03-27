/**
 * communityService.ts
 *
 * Abstraction layer for all community data operations.
 * Currently backed by localStorage via simple in-memory store.
 * Swap the implementation functions below to connect a real database
 * (e.g. Supabase, Firebase, REST API) without touching any UI code.
 *
 * DB INTEGRATION POINTS are marked with: // ← DB_HOOK
 */

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

  async setReaction(postId: string, userId: string, reaction: ReactionKey | null): Promise<ServiceResult<Record<ReactionKey, number>>> {
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

  async toggleSave(postId: string, userId: string): Promise<ServiceResult<{ saves: number; saved: boolean }>> {
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

  async toggleTry(postId: string, userId: string): Promise<ServiceResult<{ tries: number; tried: boolean }>> {
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

  async fetchSavedPostIds(userId: string): Promise<ServiceResult<string[]>> {
    return ok(lsGet<string[]>(LS_SAVED_POSTS_KEY, []));
  }

  async fetchTriedPostIds(userId: string): Promise<ServiceResult<string[]>> {
    return ok(lsGet<string[]>(LS_TRIED_POSTS_KEY, []));
  }

  async fetchMyReactions(userId: string): Promise<ServiceResult<Record<string, ReactionKey>>> {
    const raw = lsGet<Record<string, ReactionKey | undefined>>(LS_MY_REACTIONS_KEY, {});
    const clean: Record<string, ReactionKey> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v) clean[k] = v;
    }
    return ok(clean);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
//
// ← DB_HOOK: replace `new LocalStorageCommunityService()` with your DB client:
//   export const communityService: ICommunityService = new SupabaseCommunityService(supabaseClient);

export const communityService: ICommunityService = new LocalStorageCommunityService();
