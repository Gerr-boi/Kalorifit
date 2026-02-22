import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Plus, Trophy, UserPlus, X } from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { addDays, createEmptyDayLog, startOfDay, toDateKey, type DayLog } from '../../lib/disciplineEngine';

type ReactionKey = 'fire' | 'strong' | 'beast' | 'insane' | 'watching';

type CommunityProfile = {
  name?: string;
  profileImageDataUrl?: string | null;
  goalStrategy?: string;
  trainingType?: string;
  socialAnonymousPosting?: boolean;
  socialHideWeightNumbers?: boolean;
  socialHideBodyPhotos?: boolean;
  equippedBadgeIds?: string[];
};

type WorkoutSession = {
  dateKey: string;
  durationMin: number;
  caloriesBurned: number;
  workoutType: 'Run' | 'Ride' | 'Walk' | 'Strength' | 'HIIT' | 'Other';
  exerciseName: string;
};

type CommunityPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarDataUrl?: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  goal: string;
  trainingStyle: string;
  identityBadge: string;
  equippedBadgeIds?: string[];
  caption: string;
  imageDataUrl?: string;
  durationMinutes: number;
  calories: number;
  prHighlight: string;
  streak: number;
  createdAt: number;
  hideCalories: boolean;
  hideBodyPhoto: boolean;
  reactions: Record<ReactionKey, number>;
};

const reactionConfig: Array<{ key: ReactionKey; token: string; label: string }> = [
  { key: 'fire', token: 'FIRE', label: 'Fire' },
  { key: 'strong', token: 'STRONG', label: 'Strong' },
  { key: 'beast', token: 'BEAST', label: 'Beast' },
  { key: 'insane', token: 'INSANE', label: 'Insane' },
  { key: 'watching', token: 'WATCH', label: 'Watching' },
];

const emptyReactions: Record<ReactionKey, number> = {
  fire: 0,
  strong: 0,
  beast: 0,
  insane: 0,
  watching: 0,
};
const EMPTY_COMMUNITY_PROFILE: CommunityProfile = {};
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_WORKOUT_SESSIONS: WorkoutSession[] = [];
const EMPTY_POSTS: CommunityPost[] = [];
const EMPTY_MY_REACTIONS: Record<string, ReactionKey | undefined> = {};

function createId(prefix: string) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function initialsFromName(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || 'U';
}

function hasAnyActivity(log: DayLog) {
  const mealCount = Object.values(log.meals).flat().length;
  return mealCount > 0 || log.trainingKcal > 0 || log.waterMl > 0;
}

function calculateStreak(logsByDate: Record<string, DayLog>) {
  const today = startOfDay(new Date());
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    const key = toDateKey(addDays(today, -i));
    const log = logsByDate[key] ?? createEmptyDayLog();
    if (!hasAnyActivity(log)) break;
    streak += 1;
  }
  return streak;
}

function toLevel(streak: number): 'Beginner' | 'Intermediate' | 'Advanced' {
  if (streak >= 21) return 'Advanced';
  if (streak >= 7) return 'Intermediate';
  return 'Beginner';
}

function relativeTimeFrom(ts: number) {
  const ms = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < hour) return `${Math.max(1, Math.round(ms / minute))}m`;
  if (ms < day) return `${Math.round(ms / hour)}h`;
  return `${Math.round(ms / day)}d`;
}

function scoreForLeaderboard(streak: number, postCount: number, totalCalories: number) {
  return streak * 100 + postCount * 25 + Math.round(totalCalories / 25);
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function badgeStyleById(id: string) {
  if (id === 'developer') return 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-indigo-300';
  if (id === 'og') return 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-300';
  if (id === 'beta_tester') return 'bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white border-fuchsia-300';
  if (id === 'dedicated') return 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-300';
  if (id === 'consistency_pro') return 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-300';
  if (id === 'streak_master') return 'bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-300';
  if (id === 'hydration_hero') return 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white border-cyan-300';
  if (id === 'active_mover') return 'bg-gradient-to-r from-lime-500 to-green-500 text-white border-lime-300';
  if (id === 'challenge_hunter') return 'bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-300';
  return 'bg-gradient-to-r from-slate-500 to-gray-600 text-white border-slate-300';
}

export default function CommunityScreen() {
  const { users, currentUser, activeUserId, setActiveUserId, createUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'feed' | 'friends' | 'pods'>('feed');
  const [newUserName, setNewUserName] = useState('');
  const [showAddPost, setShowAddPost] = useState(false);
  const [postMode, setPostMode] = useState<'photo' | 'text'>('photo');
  const [caption, setCaption] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [calories, setCalories] = useState('250');
  const [prHighlight, setPrHighlight] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [autoPostEnabled, setAutoPostEnabled] = useLocalStorageState<boolean>('community.autoPostEnabled.v1', true);

  const [profile] = useLocalStorageState<CommunityProfile>('profile', EMPTY_COMMUNITY_PROFILE);
  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [workoutSessions] = useLocalStorageState<WorkoutSession[]>('home.workoutSessions.v1', EMPTY_WORKOUT_SESSIONS);
  const [posts, setPosts] = useLocalStorageState<CommunityPost[]>('community.posts.v1', EMPTY_POSTS, { scope: 'global' });
  const [myReactions, setMyReactions] = useLocalStorageState<Record<string, ReactionKey | undefined>>(
    'community.myReactions.v1',
    EMPTY_MY_REACTIONS,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const displayName = profile.name?.trim() || 'You';
  const todayKey = useMemo(() => toDateKey(startOfDay(new Date())), []);
  const currentStreak = useMemo(() => calculateStreak(logsByDate), [logsByDate]);

  const latestTodayWorkout = useMemo(() => {
    return workoutSessions
      .filter((entry) => entry.dateKey === todayKey)
      .sort((a, b) => (a.durationMin < b.durationMin ? 1 : -1))[0] ?? null;
  }, [todayKey, workoutSessions]);

  useEffect(() => {
    setPosts((prev) => {
      let changed = false;
      const next = prev.map((post) => {
        if (post.authorId !== 'self') return post;
        changed = true;
        return { ...post, authorId: activeUserId };
      });
      return changed ? next : prev;
    });
  }, [activeUserId, setPosts]);

  const leaderboard = useMemo(() => {
    const byAuthor = posts.reduce<Record<string, { id: string; name: string; initials: string; streak: number; posts: number; calories: number }>>(
      (acc, post) => {
        const prev = acc[post.authorId] ?? {
          id: post.authorId,
          name: post.authorName,
          initials: post.authorInitials,
          streak: post.streak,
          posts: 0,
          calories: 0,
        };
        prev.streak = Math.max(prev.streak, post.streak);
        prev.posts += 1;
        prev.calories += post.calories;
        acc[post.authorId] = prev;
        return acc;
      },
      {},
    );

    const selfId = activeUserId;
    const current = byAuthor[selfId] ?? {
      id: selfId,
      name: displayName,
      initials: initialsFromName(displayName),
      streak: currentStreak,
      posts: 0,
      calories: 0,
    };
    current.name = displayName;
    current.initials = initialsFromName(displayName);
    current.streak = Math.max(current.streak, currentStreak);
    byAuthor[selfId] = current;

    return Object.values(byAuthor)
      .map((item) => ({
        ...item,
        score: scoreForLeaderboard(item.streak, item.posts, item.calories),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [activeUserId, currentStreak, displayName, posts]);

  const podMemberIds = useMemo(() => {
    const targetPodSize = 6;
    const minRelevantMembers = 3;
    const desiredGoal = normalizeToken(profile.goalStrategy ? profile.goalStrategy.split('_').join(' ') : '');
    const desiredTraining = normalizeToken(profile.trainingType ? profile.trainingType.split('_').join(' ') : '');

    const recentOthers = posts
      .filter((post) => post.authorId !== activeUserId)
      .sort((a, b) => b.createdAt - a.createdAt);

    const relevant = recentOthers.filter((post) => {
      const goalMatch = Boolean(desiredGoal) && normalizeToken(post.goal) === desiredGoal;
      const trainingMatch = Boolean(desiredTraining) && normalizeToken(post.trainingStyle) === desiredTraining;
      return goalMatch || trainingMatch;
    });

    const picked = new Set<string>();

    for (const post of relevant) {
      picked.add(post.authorId);
      if (picked.size >= targetPodSize) break;
    }

    if (picked.size < minRelevantMembers) {
      for (const post of recentOthers) {
        picked.add(post.authorId);
        if (picked.size >= targetPodSize) break;
      }
    }

    return picked;
  }, [activeUserId, posts, profile.goalStrategy, profile.trainingType]);

  const visiblePosts = useMemo(() => {
    if (activeTab === 'pods') {
      return posts.filter((post) => post.authorId === activeUserId || podMemberIds.has(post.authorId));
    }
    if (activeTab === 'friends') return posts.filter((post) => post.authorId !== activeUserId);
    return posts;
  }, [activeTab, activeUserId, podMemberIds, posts]);

  function openAddPostModal() {
    setShowAddPost(true);
    setPostMode('photo');
    setCaption('');
    setImageDataUrl(null);
    setDurationMinutes(String(latestTodayWorkout?.durationMin ?? 30));
    setCalories(String(latestTodayWorkout?.caloriesBurned ?? 250));
    setPrHighlight(latestTodayWorkout ? `${latestTodayWorkout.workoutType}: ${latestTodayWorkout.exerciseName || 'Strong session'}` : '');
  }

  function closeAddPostModal() {
    setShowAddPost(false);
    setImageDataUrl(null);
  }

  function pickImage() {
    fileInputRef.current?.click();
  }

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function createPost() {
    const nextDuration = Number.parseInt(durationMinutes, 10);
    const nextCalories = Number.parseInt(calories, 10);
    if (!caption.trim() && !imageDataUrl) return;

    const goal = profile.goalStrategy ? profile.goalStrategy.split('_').join(' ') : 'General fitness';
    const trainingStyle = profile.trainingType ? profile.trainingType.split('_').join(' ') : 'Mixed training';
    const streak = currentStreak;

    const nextPost: CommunityPost = {
      id: createId('post'),
      authorId: activeUserId,
      authorName: profile.socialAnonymousPosting ? 'Anonymous' : displayName,
      authorInitials: profile.socialAnonymousPosting ? 'AN' : initialsFromName(displayName),
      authorAvatarDataUrl: profile.socialAnonymousPosting ? undefined : (profile.profileImageDataUrl ?? undefined),
      level: toLevel(streak),
      goal,
      trainingStyle,
      identityBadge: streak >= 21 ? 'Iron Discipline' : streak >= 7 ? 'Consistency Builder' : 'Starting Strong',
      equippedBadgeIds: Array.isArray(profile.equippedBadgeIds) ? profile.equippedBadgeIds.slice(0, 3) : [],
      caption: caption.trim(),
      imageDataUrl: postMode === 'photo' ? (imageDataUrl ?? undefined) : undefined,
      durationMinutes: Number.isFinite(nextDuration) && nextDuration > 0 ? nextDuration : 30,
      calories: Number.isFinite(nextCalories) && nextCalories > 0 ? nextCalories : 250,
      prHighlight: prHighlight.trim() || 'Solid training block complete',
      streak,
      createdAt: Date.now(),
      hideCalories: Boolean(profile.socialHideWeightNumbers),
      hideBodyPhoto: Boolean(profile.socialHideBodyPhotos),
      reactions: { ...emptyReactions },
    };

    setPosts((prev) => [nextPost, ...prev]);
    closeAddPostModal();
  }

  function chooseReaction(postId: string, reaction: ReactionKey) {
    const previous = myReactions[postId];
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const nextReactions = { ...post.reactions };
        if (previous && nextReactions[previous] > 0) {
          nextReactions[previous] -= 1;
        }
        if (previous !== reaction) {
          nextReactions[reaction] += 1;
        }
        return { ...post, reactions: nextReactions };
      }),
    );

    setMyReactions((prev) => ({
      ...prev,
      [postId]: previous === reaction ? undefined : reaction,
    }));
  }

  function handleAddFriend() {
    const nextName = newUserName.trim();
    if (!nextName) return;
    createUser(nextName);
    setNewUserName('');
  }

  return (
    <div className="screen dark:bg-gray-900">
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold">Community</h1>
          <button className="social-pill social-pill-light">Progress + Accountability</button>
        </div>
        <p className="text-sm text-white/85 mb-4">Real posts from your activity log. Add quickly with photo mode.</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('feed')}
              className={`pb-2 border-b-2 font-medium ${
                activeTab === 'feed' ? 'border-white text-white' : 'border-transparent text-white/60'
              }`}
            >
              Feed
            </button>
            <button
              onClick={() => setActiveTab('friends')}
              className={`pb-2 border-b-2 font-medium ${
                activeTab === 'friends' ? 'border-white text-white' : 'border-transparent text-white/60'
              }`}
            >
              Friends
            </button>
            <button
              onClick={() => setActiveTab('pods')}
              className={`pb-2 border-b-2 font-medium ${
                activeTab === 'pods' ? 'border-white text-white' : 'border-transparent text-white/60'
              }`}
            >
              Pods
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAutoPostEnabled((prev) => !prev)}
            className={`social-switch ${autoPostEnabled ? 'social-switch-on' : ''}`}
          >
            Auto post {autoPostEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="social-section bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Friends</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">You: {currentUser.name}</p>
          </div>
          <select
            value={currentUser.id}
            onChange={(e) => setActiveUserId(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="New friend name"
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={handleAddFriend}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white"
          >
            Add friend
          </button>
        </div>
      </div>

      <div className="social-section bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Weekly leaderboard</h2>
        </div>
        <div className="space-y-2">
          {leaderboard.map((entry, index) => (
            <div key={entry.id} className="challenge-row">
              <p className="w-6 text-xs font-bold text-orange-600">#{index + 1}</p>
              <div className="w-10 h-10 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-xs font-bold text-orange-700">
                {entry.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="challenge-title">{entry.name}</p>
                <p className="challenge-meta">{entry.streak} day streak | {entry.posts} posts</p>
              </div>
              {index === 0 ? <span className="social-pill social-pill-success">Leader</span> : null}
            </div>
          ))}
          {leaderboard.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet. Be the first to lead.</p> : null}
        </div>
      </div>

      <div className="social-section bg-slate-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
          {activeTab === 'feed'
            ? 'All recent posts'
            : activeTab === 'friends'
              ? 'Friend posts only'
              : `Pod posts only (${podMemberIds.size + 1} members incl. you)`}
        </p>
      </div>

      <div className="pb-24">
        {visiblePosts.map((post) => {
          const showCalories = !post.hideCalories;
          const showImage = !post.hideBodyPhoto && Boolean(post.imageDataUrl);

          return (
            <div key={post.id} className="feed-item">
              <div className="feed-header">
                {post.authorAvatarDataUrl ? (
                  <img src={post.authorAvatarDataUrl} alt={post.authorName} className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-xs font-bold text-orange-700">
                    {post.authorInitials}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">{post.authorName}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {post.goal} | {post.trainingStyle} | {post.level} | {relativeTimeFrom(post.createdAt)}
                  </p>
                </div>
                <button className="text-gray-400 dark:text-gray-500">
                  <UserPlus className="w-5 h-5" />
                </button>
              </div>

              <div className="workout-card">
                <div className="workout-stats">
                  <div>
                    <p className="workout-label">Duration</p>
                    <p className="workout-value">{post.durationMinutes} min</p>
                  </div>
                  <div>
                    <p className="workout-label">Calories</p>
                    <p className="workout-value">{showCalories ? post.calories : '--'}</p>
                  </div>
                  <div>
                    <p className="workout-label">Streak</p>
                    <p className="workout-value">{post.streak} days</p>
                  </div>
                </div>
                <p className="workout-pr">PR: {post.prHighlight}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="social-pill">{post.identityBadge}</span>
                  {(post.equippedBadgeIds ?? []).slice(0, 3).map((badgeId) => (
                    <span key={`${post.id}-${badgeId}`} className={`text-[11px] px-2 py-0.5 rounded-full border ${badgeStyleById(badgeId)}`}>
                      {String(badgeId ?? '').split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ')}
                    </span>
                  ))}
                </div>
              </div>

              {post.caption ? <p className="text-gray-700 dark:text-gray-300 mt-3">{post.caption}</p> : null}
              {showImage ? <img src={post.imageDataUrl} alt="Post" className="w-full h-64 object-cover rounded-2xl mt-3" /> : null}

              <div className="reaction-row">
                {reactionConfig.map((reaction) => {
                  const selected = myReactions[post.id] === reaction.key;
                  return (
                    <button
                      key={reaction.key}
                      onClick={() => chooseReaction(post.id, reaction.key)}
                      className={`reaction-chip ${selected ? 'reaction-chip-active' : ''}`}
                    >
                      <span>{reaction.token}</span>
                      <span>{post.reactions[reaction.key]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {visiblePosts.length === 0 ? (
          <div className="social-section text-center text-gray-500 dark:text-gray-400">
            <p className="text-sm">No posts yet.</p>
            <p className="text-xs mt-1">Tap Add Post to publish your first workout.</p>
          </div>
        ) : null}
      </div>

      {!showAddPost ? (
        <button
          type="button"
          onClick={openAddPostModal}
          className="community-add-post-fab"
          aria-label="Add post"
          title="Add post"
        >
          <Plus className="w-6 h-6" />
        </button>
      ) : null}

      {showAddPost ? (
        <div className="fixed inset-0 z-[1400] bg-black/40 flex items-end justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-2xl mb-16 sm:mb-0 border border-transparent dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add post</h3>
              <button type="button" onClick={closeAddPostModal} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPostMode('photo')}
                className={`px-3 py-1.5 text-xs rounded-full border ${postMode === 'photo' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                Photo mode
              </button>
              <button
                type="button"
                onClick={() => setPostMode('text')}
                className={`px-3 py-1.5 text-xs rounded-full border ${postMode === 'text' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
              >
                Text mode
              </button>
            </div>

            {postMode === 'photo' ? (
              <div className="mb-3">
                <button type="button" onClick={pickImage} className="w-full rounded-lg border border-dashed border-orange-300 dark:border-orange-700 px-3 py-3 text-sm text-orange-700 dark:text-orange-300 flex items-center justify-center gap-2">
                  <ImagePlus className="w-4 h-4" />
                  {imageDataUrl ? 'Change photo' : 'Choose photo'}
                </button>
                {imageDataUrl ? <img src={imageDataUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg mt-2" /> : null}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              </div>
            ) : null}

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a short update"
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3"
            />

            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Duration (min)"
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
              />
              <input
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Calories"
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
              />
            </div>

            <input
              value={prHighlight}
              onChange={(e) => setPrHighlight(e.target.value)}
              placeholder="PR highlight"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAddPostModal} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                Cancel
              </button>
              <button type="button" onClick={createPost} className="px-4 py-2 rounded-lg bg-orange-500 text-white">
                Publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
