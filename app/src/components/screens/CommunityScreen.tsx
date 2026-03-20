import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Bookmark,
  CheckCircle2,
  Flame,
  Heart,
  ImagePlus,
  Plus,
  Search,
  Soup,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import {
  addDays,
  CALORIE_GOAL,
  calculateDailyDisciplineScore,
  createEmptyDayLog,
  getTotalHydrationMl,
  PROTEIN_GOAL_G,
  startOfDay,
  startOfWeekMonday,
  toDateKey,
  type DayLog,
} from '../../lib/disciplineEngine';
import { getBadgeStyleById } from '../../lib/trophySystem';
import { useT } from '../../lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReactionKey = 'fire' | 'strong' | 'beast' | 'insane' | 'watching';
type CommunityPostVisibility = 'public' | 'friends' | 'private';
type CommunityPostKind = 'workout' | 'recipe' | 'meal_win' | 'struggle' | 'reflection';
type CheckInType = 'trained' | 'hit_protein' | 'in_calories' | 'slept_7h';
type MainTab = 'hub' | 'feed' | 'challenges';
type FeedFilter = 'all' | 'workouts' | 'recipes' | 'wins' | 'struggles';
type ChallengeId = 'protein_7day' | 'log_5day' | 'workout_3x' | 'clean_week' | 'recipe_share';

type CommunityProfile = {
  name?: string;
  profileImageDataUrl?: string | null;
  goalStrategy?: string;
  trainingType?: string;
  socialAnonymousPosting?: boolean;
  socialHideWeightNumbers?: boolean;
  socialHideBodyPhotos?: boolean;
  equippedBadgeIds?: string[];
  language?: 'Norsk' | 'English';
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
  kind: CommunityPostKind;
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
  visibility?: CommunityPostVisibility;
  reactions: Record<ReactionKey, number>;
  recipeTitle?: string;
  recipeIngredients?: string[];
  recipeSteps?: string[];
  recipeServings?: number;
  recipePrepMinutes?: number;
  saves?: number;
  tries?: number;
};

type DailyCheckIn = {
  dateKey: string;
  types: CheckInType[];
};

type JoinedChallenge = {
  challengeId: ChallengeId;
  joinedAt: number;
};

type FloatingFabPosition = {
  x: number;
  y: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

// reactionConfig is defined inside the component so labels can be translated

const emptyReactions: Record<ReactionKey, number> = {
  fire: 0, strong: 0, beast: 0, insane: 0, watching: 0,
};

// CHALLENGE_DEFS is defined inside the component so titles can be translated

const POD_WEEKLY_CHALLENGES = [
  '4 workouts this week',
  'Hit protein goal 5 days',
  'Log every meal 5 days',
  'Share 2 healthy recipes',
  'Stay in calories 5 days',
  'Hit water goal 5 days',
  '3 strength sessions',
];

// POST_TYPE_CONFIG is defined inside the component so labels can be translated

// CHECK_IN_CONFIG is defined inside the component so labels can be translated

const EMPTY_COMMUNITY_PROFILE: CommunityProfile = {};
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_WORKOUT_SESSIONS: WorkoutSession[] = [];
const EMPTY_POSTS: CommunityPost[] = [];
const EMPTY_MY_REACTIONS: Record<string, ReactionKey | undefined> = {};
const EMPTY_CHECK_INS: DailyCheckIn[] = [];
const EMPTY_SAVED_POSTS: string[] = [];
const EMPTY_TRIED_POSTS: string[] = [];
const EMPTY_JOINED_CHALLENGES: JoinedChallenge[] = [];
const FAB_SIZE_PX = 56;
const FAB_VIEWPORT_MARGIN_PX = 12;
const FAB_TOP_OFFSET_PX = 88;
const FAB_BOTTOM_OFFSET_PX = 96;
const FAB_DRAG_THRESHOLD_PX = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function initialsFromName(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || 'U';
}

function hasAnyActivity(log: DayLog) {
  return Object.values(log.meals).flat().length > 0 || log.trainingKcal > 0 || getTotalHydrationMl(log) > 0;
}

function calculateStreak(logsByDate: Record<string, DayLog>) {
  const today = startOfDay(new Date());
  let streak = 0;
  for (let i = 0; i < 365; i += 1) {
    const key = toDateKey(addDays(today, -i));
    if (!hasAnyActivity(logsByDate[key] ?? createEmptyDayLog())) break;
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

function normalizeToken(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getDailyProtein(log: DayLog): number {
  return Object.values(log.meals).flat().reduce((s, e) => s + (e.protein ?? 0), 0);
}

function getDailyKcal(log: DayLog): number {
  return Object.values(log.meals).flat().reduce((s, e) => s + e.kcal, 0);
}

function clampFabPosition(position: FloatingFabPosition, viewportWidth?: number, viewportHeight?: number): FloatingFabPosition {
  const width = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 390);
  const height = viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 844);
  const minX = FAB_VIEWPORT_MARGIN_PX;
  const maxX = Math.max(minX, width - FAB_SIZE_PX - FAB_VIEWPORT_MARGIN_PX);
  const minY = FAB_TOP_OFFSET_PX;
  const maxY = Math.max(minY, height - FAB_SIZE_PX - FAB_BOTTOM_OFFSET_PX);
  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function getDefaultFabPosition(): FloatingFabPosition {
  if (typeof window === 'undefined') {
    return { x: FAB_VIEWPORT_MARGIN_PX, y: FAB_TOP_OFFSET_PX };
  }
  return clampFabPosition({
    x: window.innerWidth - FAB_SIZE_PX - FAB_VIEWPORT_MARGIN_PX,
    y: window.innerHeight - FAB_SIZE_PX - FAB_BOTTOM_OFFSET_PX,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const { activeUserId } = useCurrentUser();
  const t = useT();
  const badgeStyleById = getBadgeStyleById;

  const reactionConfig: Array<{ key: ReactionKey; token: string; label: string }> = [
    { key: 'fire', token: '🔥', label: t('community.reactions.fire') },
    { key: 'strong', token: '💪', label: t('community.reactions.strong') },
    { key: 'beast', token: '⚡', label: t('community.reactions.beast') },
    { key: 'insane', token: '🏆', label: t('community.reactions.insane') },
    { key: 'watching', token: '👀', label: t('community.reactions.watching') },
  ];

  const CHALLENGE_DEFS: Array<{
    id: ChallengeId;
    title: string;
    description: string;
    target: number;
    unit: string;
    color: string;
  }> = [
    { id: 'protein_7day', title: t('community.challenges.protein7day'), description: 'Hit your protein goal 7 days in a row', target: 7, unit: 'days', color: 'orange' },
    { id: 'log_5day', title: t('community.challenges.log5day'), description: 'Log all meals for 5 consecutive days', target: 5, unit: 'days', color: 'blue' },
    { id: 'workout_3x', title: t('community.challenges.workout3x'), description: 'Complete 3 workouts in the current week', target: 3, unit: 'workouts', color: 'green' },
    { id: 'clean_week', title: t('community.challenges.cleanWeek'), description: 'Stay in your calorie target 5 days this week', target: 5, unit: 'days', color: 'emerald' },
    { id: 'recipe_share', title: t('community.challenges.recipeDrop'), description: 'Share 3 recipes with the community', target: 3, unit: 'recipes', color: 'purple' },
  ];

  const POST_TYPE_CONFIG: Record<CommunityPostKind, { label: string; color: string; icon: string }> = {
    workout: { label: t('community.postTypes.trained'), color: 'orange', icon: '🏋️' },
    meal_win: { label: t('community.postTypes.mealWin'), color: 'green', icon: '🥗' },
    recipe: { label: t('community.postTypes.recipeDrop'), color: 'emerald', icon: '🍳' },
    struggle: { label: t('community.postTypes.struggle'), color: 'purple', icon: '💭' },
    reflection: { label: t('community.postTypes.reflection'), color: 'blue', icon: '📖' },
  };

  const CHECK_IN_CONFIG: Array<{ key: CheckInType; label: string; sublabel: string }> = [
    { key: 'trained', label: t('community.checkIns.trained'), sublabel: t('community.checkInSublabels.trained') },
    { key: 'hit_protein', label: t('community.checkIns.hitProtein'), sublabel: t('community.checkInSublabels.hitProtein') },
    { key: 'in_calories', label: t('community.checkIns.inCalories'), sublabel: t('community.checkInSublabels.inCalories') },
    { key: 'slept_7h', label: t('community.checkIns.slept7h'), sublabel: t('community.checkInSublabels.slept7h') },
  ];

  // Main UI state
  const [mainTab, setMainTab] = useState<MainTab>('hub');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [showAddPost, setShowAddPost] = useState(false);
  const [postKind, setPostKind] = useState<CommunityPostKind>('workout');
  const [caption, setCaption] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [calories, setCalories] = useState('250');
  const [prHighlight, setPrHighlight] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [postVisibility, setPostVisibility] = useState<CommunityPostVisibility>('public');
  const [recipeTitle, setRecipeTitle] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState('');
  const [recipeSteps, setRecipeSteps] = useState('');
  const [recipeServings, setRecipeServings] = useState('2');
  const [recipePrepMinutes, setRecipePrepMinutes] = useState('20');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandLeaderboard, setExpandLeaderboard] = useState(false);
  const [fabPosition, setFabPosition] = useLocalStorageState<FloatingFabPosition | null>('community.addPostFabPosition.v1', null);
  const [fabAnimating, setFabAnimating] = useState(false);
  const [isDraggingFab, setIsDraggingFab] = useState(false);

  // Persistent state
  const [profile] = useLocalStorageState<CommunityProfile>('profile', EMPTY_COMMUNITY_PROFILE);
  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [workoutSessions] = useLocalStorageState<WorkoutSession[]>('home.workoutSessions.v1', EMPTY_WORKOUT_SESSIONS);
  const [posts, setPosts] = useLocalStorageState<CommunityPost[]>('community.posts.v1', EMPTY_POSTS, { scope: 'global' });
  const [myReactions, setMyReactions] = useLocalStorageState<Record<string, ReactionKey | undefined>>('community.myReactions.v1', EMPTY_MY_REACTIONS);
  const [checkIns, setCheckIns] = useLocalStorageState<DailyCheckIn[]>('community.checkIns.v1', EMPTY_CHECK_INS);
  const [savedPostIds, setSavedPostIds] = useLocalStorageState<string[]>('community.savedPosts.v1', EMPTY_SAVED_POSTS);
  const [triedPostIds, setTriedPostIds] = useLocalStorageState<string[]>('community.triedPosts.v1', EMPTY_TRIED_POSTS);
  const [joinedChallenges, setJoinedChallenges] = useLocalStorageState<JoinedChallenge[]>('community.challenges.v1', EMPTY_JOINED_CHALLENGES);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fabOpenTimerRef = useRef<number | null>(null);
  const fabSuppressClickRef = useRef(false);
  const fabDragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const displayName = profile.name?.trim() || 'You';
  const todayKey = useMemo(() => toDateKey(startOfDay(new Date())), []);
  const currentStreak = useMemo(() => calculateStreak(logsByDate), [logsByDate]);
  const todayLog = useMemo(() => logsByDate[todayKey] ?? createEmptyDayLog(), [logsByDate, todayKey]);

  // Migrate old 'self' authorId
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

  // ─── Derived: today's check-in ──────────────────────────────────────────────

  useEffect(() => {
    if (fabPosition !== null) return;
    setFabPosition(getDefaultFabPosition());
  }, [fabPosition, setFabPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setFabPosition((prev) => clampFabPosition(prev ?? getDefaultFabPosition(), window.innerWidth, window.innerHeight));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setFabPosition]);

  useEffect(() => {
    if (!fabAnimating || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setFabAnimating(false), 360);
    return () => window.clearTimeout(timeoutId);
  }, [fabAnimating]);

  useEffect(() => () => {
    if (fabOpenTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(fabOpenTimerRef.current);
    }
  }, []);

  const todayCheckIn = useMemo(() => {
    return checkIns.find((ci) => ci.dateKey === todayKey) ?? { dateKey: todayKey, types: [] as CheckInType[] };
  }, [checkIns, todayKey]);

  // Auto-detect check-in status from logs
  const autoDetected = useMemo((): Set<CheckInType> => {
    const detected = new Set<CheckInType>();
    const todayWorkouts = workoutSessions.filter((s) => s.dateKey === todayKey);
    if (todayWorkouts.length > 0 || todayLog.trainingKcal > 0) detected.add('trained');
    if (getDailyProtein(todayLog) >= PROTEIN_GOAL_G) detected.add('hit_protein');
    const kcal = getDailyKcal(todayLog);
    if (kcal > 0 && Math.abs(kcal - CALORIE_GOAL) / CALORIE_GOAL < 0.15) detected.add('in_calories');
    return detected;
  }, [workoutSessions, todayKey, todayLog]);

  const activeCheckIns = useMemo((): Set<CheckInType> => {
    return new Set([...autoDetected, ...todayCheckIn.types]);
  }, [autoDetected, todayCheckIn.types]);

  function toggleCheckIn(type: CheckInType) {
    // Auto-detected ones are read-only; manual ones can be toggled
    if (autoDetected.has(type)) return;
    setCheckIns((prev) => {
      const existing = prev.find((ci) => ci.dateKey === todayKey);
      if (existing) {
        const already = existing.types.includes(type);
        return prev.map((ci) =>
          ci.dateKey === todayKey
            ? { ...ci, types: already ? ci.types.filter((t) => t !== type) : [...ci.types, type] }
            : ci,
        );
      }
      return [...prev, { dateKey: todayKey, types: [type] }];
    });
  }

  // ─── Derived: pod ───────────────────────────────────────────────────────────

  const podMemberIds = useMemo(() => {
    const targetPodSize = 6;
    const minRelevantMembers = 3;
    const desiredGoal = normalizeToken(profile.goalStrategy ? profile.goalStrategy.split('_').join(' ') : '');
    const desiredTraining = normalizeToken(profile.trainingType ? profile.trainingType.split('_').join(' ') : '');
    const recentOthers = posts.filter((p) => p.authorId !== activeUserId).sort((a, b) => b.createdAt - a.createdAt);
    const relevant = recentOthers.filter((p) => {
      const goalMatch = Boolean(desiredGoal) && normalizeToken(p.goal) === desiredGoal;
      const trainingMatch = Boolean(desiredTraining) && normalizeToken(p.trainingStyle) === desiredTraining;
      return goalMatch || trainingMatch;
    });
    const picked = new Set<string>();
    for (const p of relevant) { picked.add(p.authorId); if (picked.size >= targetPodSize) break; }
    if (picked.size < minRelevantMembers) {
      for (const p of recentOthers) { picked.add(p.authorId); if (picked.size >= targetPodSize) break; }
    }
    return picked;
  }, [activeUserId, posts, profile.goalStrategy, profile.trainingType]);

  const weeklyPodChallenge = useMemo(() => {
    const week = getISOWeek(new Date());
    return POD_WEEKLY_CHALLENGES[week % POD_WEEKLY_CHALLENGES.length];
  }, []);

  // Who in the pod has a post today (proxy for "trained today")
  const podTrainedToday = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    return new Set(
      posts
        .filter((p) => podMemberIds.has(p.authorId) && p.createdAt >= todayStart)
        .map((p) => p.authorId),
    );
  }, [podMemberIds, posts]);

  // ─── Derived: weekly recap ──────────────────────────────────────────────────

  const weeklyRecap = useMemo(() => {
    const weekStart = startOfWeekMonday(new Date());
    let daysLogged = 0;
    let daysWorkout = 0;
    let totalScore = 0;
    let scoredDays = 0;
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(addDays(weekStart, i));
      const log = logsByDate[key];
      if (!log) continue;
      if (hasAnyActivity(log)) daysLogged += 1;
      if (log.trainingKcal > 0 || workoutSessions.some((s) => s.dateKey === key)) daysWorkout += 1;
      const score = calculateDailyDisciplineScore(log).score;
      if (score > 0) { totalScore += score; scoredDays += 1; }
    }
    const avgScore = scoredDays > 0 ? Math.round(totalScore / scoredDays) : 0;
    return { daysLogged, daysWorkout, avgScore, streak: currentStreak };
  }, [logsByDate, workoutSessions, currentStreak]);

  // ─── Derived: challenge progress ────────────────────────────────────────────

  const challengeProgress = useMemo((): Record<ChallengeId, number> => {
    const weekStart = startOfWeekMonday(new Date());

    // protein_7day — consecutive days with protein >= goal (up to 7)
    let proteinStreak = 0;
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(addDays(startOfDay(new Date()), -i));
      const log = logsByDate[key];
      if (!log || getDailyProtein(log) < PROTEIN_GOAL_G) break;
      proteinStreak += 1;
    }

    // log_5day — consecutive days with any meal logged (up to 5)
    let logStreak = 0;
    for (let i = 0; i < 5; i++) {
      const key = toDateKey(addDays(startOfDay(new Date()), -i));
      const log = logsByDate[key];
      if (!log || Object.values(log.meals).flat().length === 0) break;
      logStreak += 1;
    }

    // workout_3x — workouts this week
    let weekWorkouts = 0;
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(addDays(weekStart, i));
      const log = logsByDate[key];
      if (log && log.trainingKcal > 0) weekWorkouts += 1;
      else if (workoutSessions.some((s) => s.dateKey === key)) weekWorkouts += 1;
    }

    // clean_week — days in calorie target this week
    let calorieOkDays = 0;
    for (let i = 0; i < 7; i++) {
      const key = toDateKey(addDays(weekStart, i));
      const log = logsByDate[key];
      if (!log) continue;
      const kcal = getDailyKcal(log);
      if (kcal > 0 && Math.abs(kcal - CALORIE_GOAL) / CALORIE_GOAL < 0.15) calorieOkDays += 1;
    }

    // recipe_share — recipes posted by user
    const myRecipes = posts.filter((p) => p.authorId === activeUserId && p.kind === 'recipe').length;

    return {
      protein_7day: Math.min(proteinStreak, 7),
      log_5day: Math.min(logStreak, 5),
      workout_3x: Math.min(weekWorkouts, 3),
      clean_week: Math.min(calorieOkDays, 5),
      recipe_share: Math.min(myRecipes, 3),
    };
  }, [logsByDate, workoutSessions, posts, activeUserId]);

  // ─── Derived: leaderboard ───────────────────────────────────────────────────

  const leaderboard = useMemo(() => {
    const byAuthor = posts.reduce<Record<string, { id: string; name: string; initials: string; streak: number; posts: number; score: number }>>(
      (acc, post) => {
        const prev = acc[post.authorId] ?? { id: post.authorId, name: post.authorName, initials: post.authorInitials, streak: post.streak, posts: 0, score: 0 };
        prev.streak = Math.max(prev.streak, post.streak);
        prev.posts += 1;
        prev.score += post.streak * 10 + (post.saves ?? 0) * 5 + (post.tries ?? 0) * 3 + 2;
        acc[post.authorId] = prev;
        return acc;
      },
      {},
    );
    const self = byAuthor[activeUserId] ?? { id: activeUserId, name: displayName, initials: initialsFromName(displayName), streak: currentStreak, posts: 0, score: 0 };
    self.name = displayName;
    self.initials = initialsFromName(displayName);
    self.streak = Math.max(self.streak, currentStreak);
    byAuthor[activeUserId] = self;
    return Object.values(byAuthor).sort((a, b) => b.score - a.score).slice(0, 10);
  }, [activeUserId, currentStreak, displayName, posts]);

  // ─── Derived: visible feed posts ────────────────────────────────────────────

  const feedPosts = useMemo(() => {
    let filtered = posts.filter((p) => {
      if (p.authorId === activeUserId) return true;
      const vis = p.visibility ?? 'public';
      return vis === 'public';
    });
    if (feedFilter === 'workouts') filtered = filtered.filter((p) => p.kind === 'workout');
    else if (feedFilter === 'recipes') filtered = filtered.filter((p) => p.kind === 'recipe' || p.kind === 'meal_win');
    else if (feedFilter === 'wins') filtered = filtered.filter((p) => p.kind === 'workout' || p.kind === 'meal_win');
    else if (feedFilter === 'struggles') filtered = filtered.filter((p) => p.kind === 'struggle');

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((p) =>
        p.authorName.toLowerCase().includes(q) ||
        p.caption.toLowerCase().includes(q) ||
        (p.recipeTitle ?? '').toLowerCase().includes(q),
      );
    }

    return [...filtered].sort((a, b) => {
      const scoreA = (a.saves ?? 0) * 3 + (a.tries ?? 0) * 2 + Object.values(a.reactions).reduce((s, v) => s + v, 0);
      const scoreB = (b.saves ?? 0) * 3 + (b.tries ?? 0) * 2 + Object.values(b.reactions).reduce((s, v) => s + v, 0);
      const recency = b.createdAt - a.createdAt;
      return scoreB - scoreA + recency * 0.00001;
    });
  }, [posts, activeUserId, feedFilter, searchQuery]);

  // ─── Latest workout for pre-fill ────────────────────────────────────────────

  const latestTodayWorkout = useMemo(() => {
    return workoutSessions.filter((s) => s.dateKey === todayKey).sort((a, b) => b.durationMin - a.durationMin)[0] ?? null;
  }, [todayKey, workoutSessions]);

  // ─── Post modal handlers ─────────────────────────────────────────────────────

  function openAddPostModal(kind: CommunityPostKind = 'workout') {
    setPostKind(kind);
    setCaption('');
    setImageDataUrl(null);
    setPostVisibility('public');
    setDurationMinutes(String(latestTodayWorkout?.durationMin ?? 30));
    setCalories(String(latestTodayWorkout?.caloriesBurned ?? 250));
    setPrHighlight(latestTodayWorkout ? `${latestTodayWorkout.workoutType}: ${latestTodayWorkout.exerciseName || 'Strong session'}` : '');
    setRecipeTitle('');
    setRecipeIngredients('');
    setRecipeSteps('');
    setRecipeServings('2');
    setRecipePrepMinutes('20');
    setShowAddPost(true);
  }

  function closeAddPostModal() {
    setShowAddPost(false);
    setImageDataUrl(null);
  }

  function triggerFabAnimation() {
    if (typeof window === 'undefined') {
      setFabAnimating(true);
      return;
    }
    setFabAnimating(false);
    window.requestAnimationFrame(() => setFabAnimating(true));
  }

  function activateFab() {
    triggerFabAnimation();
    if (typeof window === 'undefined') {
      openAddPostModal('workout');
      return;
    }
    if (fabOpenTimerRef.current !== null) window.clearTimeout(fabOpenTimerRef.current);
    fabOpenTimerRef.current = window.setTimeout(() => {
      fabOpenTimerRef.current = null;
      openAddPostModal('workout');
    }, 120);
  }

  function handleFabPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!fabPosition) return;
    fabSuppressClickRef.current = false;
    fabDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: fabPosition.x,
      originY: fabPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleFabPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const dragState = fabDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) > FAB_DRAG_THRESHOLD_PX) {
      dragState.moved = true;
      fabSuppressClickRef.current = true;
      setIsDraggingFab(true);
    }
    if (!dragState.moved) return;
    setFabPosition(clampFabPosition({
      x: dragState.originX + deltaX,
      y: dragState.originY + deltaY,
    }));
  }

  function resetFabDrag(event?: React.PointerEvent<HTMLButtonElement>) {
    const dragState = fabDragStateRef.current;
    if (dragState && event && dragState.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    fabDragStateRef.current = null;
    setIsDraggingFab(false);
  }

  function handleFabClick() {
    if (fabSuppressClickRef.current) {
      fabSuppressClickRef.current = false;
      return;
    }
    activateFab();
  }

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => { setImageDataUrl(typeof reader.result === 'string' ? reader.result : null); };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function createPost() {
    const isRecipe = postKind === 'recipe';
    const normalizedIngredients = recipeIngredients.split('\n').map((l) => l.trim()).filter(Boolean);
    const normalizedSteps = recipeSteps.split('\n').map((l) => l.trim()).filter(Boolean);
    if (isRecipe && (!recipeTitle.trim() || normalizedIngredients.length === 0 || normalizedSteps.length === 0)) return;
    if (!isRecipe && !caption.trim() && !imageDataUrl) return;

    const goal = profile.goalStrategy ? profile.goalStrategy.split('_').join(' ') : 'General fitness';
    const trainingStyle = profile.trainingType ? profile.trainingType.split('_').join(' ') : 'Mixed training';

    const nextPost: CommunityPost = {
      id: createId('post'),
      kind: postKind,
      authorId: activeUserId,
      authorName: profile.socialAnonymousPosting ? 'Anonymous' : displayName,
      authorInitials: profile.socialAnonymousPosting ? 'AN' : initialsFromName(displayName),
      authorAvatarDataUrl: profile.socialAnonymousPosting ? undefined : (profile.profileImageDataUrl ?? undefined),
      level: toLevel(currentStreak),
      goal,
      trainingStyle,
      identityBadge: currentStreak >= 21 ? 'Iron Discipline' : currentStreak >= 7 ? 'Consistency Builder' : 'Starting Strong',
      equippedBadgeIds: Array.isArray(profile.equippedBadgeIds) ? profile.equippedBadgeIds.slice(0, 3) : [],
      caption: caption.trim(),
      imageDataUrl: imageDataUrl ?? undefined,
      durationMinutes: Math.max(1, Number.parseInt(durationMinutes, 10) || 30),
      calories: Math.max(1, Number.parseInt(calories, 10) || 250),
      prHighlight: prHighlight.trim() || 'Solid session complete',
      streak: currentStreak,
      createdAt: Date.now(),
      hideCalories: Boolean(profile.socialHideWeightNumbers),
      hideBodyPhoto: Boolean(profile.socialHideBodyPhotos),
      visibility: postVisibility,
      reactions: { ...emptyReactions },
      recipeTitle: isRecipe ? recipeTitle.trim() : undefined,
      recipeIngredients: isRecipe ? normalizedIngredients : undefined,
      recipeSteps: isRecipe ? normalizedSteps : undefined,
      recipeServings: isRecipe ? (Number.parseInt(recipeServings, 10) || 2) : undefined,
      recipePrepMinutes: isRecipe ? (Number.parseInt(recipePrepMinutes, 10) || 20) : undefined,
      saves: 0,
      tries: 0,
    };

    setPosts((prev) => [nextPost, ...prev]);
    closeAddPostModal();
  }

  // ─── Reaction + action handlers ──────────────────────────────────────────────

  function chooseReaction(postId: string, reaction: ReactionKey) {
    const previous = myReactions[postId];
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        const nextReactions = { ...post.reactions };
        if (previous && nextReactions[previous] > 0) nextReactions[previous] -= 1;
        if (previous !== reaction) nextReactions[reaction] += 1;
        return { ...post, reactions: nextReactions };
      }),
    );
    setMyReactions((prev) => ({ ...prev, [postId]: previous === reaction ? undefined : reaction }));
  }

  function toggleSave(postId: string) {
    const alreadySaved = savedPostIds.includes(postId);
    setSavedPostIds((prev) => alreadySaved ? prev.filter((id) => id !== postId) : [...prev, postId]);
    if (!alreadySaved) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, saves: (p.saves ?? 0) + 1 } : p));
    } else {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, saves: Math.max(0, (p.saves ?? 0) - 1) } : p));
    }
  }

  function toggleTry(postId: string) {
    const alreadyTried = triedPostIds.includes(postId);
    setTriedPostIds((prev) => alreadyTried ? prev.filter((id) => id !== postId) : [...prev, postId]);
    if (!alreadyTried) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, tries: (p.tries ?? 0) + 1 } : p));
    } else {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, tries: Math.max(0, (p.tries ?? 0) - 1) } : p));
    }
  }

  function toggleChallenge(id: ChallengeId) {
    const alreadyJoined = joinedChallenges.some((c) => c.challengeId === id);
    if (alreadyJoined) {
      setJoinedChallenges((prev) => prev.filter((c) => c.challengeId !== id));
    } else {
      setJoinedChallenges((prev) => [...prev, { challengeId: id, joinedAt: Date.now() }]);
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  function renderPostTypeBadge(kind: CommunityPostKind) {
    const config = POST_TYPE_CONFIG[kind] ?? POST_TYPE_CONFIG['workout'];
    const colorMap: Record<string, string> = {
      orange: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/40 dark:text-orange-300',
      green: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900/40 dark:text-green-300',
      emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300',
      purple: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:border-purple-900/40 dark:text-purple-300',
      blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300',
    };
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorMap[config.color]}`}>
        {config.icon} {config.label}
      </span>
    );
  }

  // ─── Hub Tab ─────────────────────────────────────────────────────────────────

  function renderHubTab() {
    const podCount = podMemberIds.size + 1;
    const podCheckedIn = podTrainedToday.size + (activeCheckIns.has('trained') ? 1 : 0);

    return (
      <div className="pb-24 space-y-3">
        {/* Daily check-in card */}
        <div className="community-hub-card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t('community.hub.todayCheckIn')}</h2>
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{t('community.hub.done', { count: activeCheckIns.size })}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CHECK_IN_CONFIG.map((ci) => {
              const active = activeCheckIns.has(ci.key);
              const isAuto = autoDetected.has(ci.key);
              return (
                <button
                  key={ci.key}
                  type="button"
                  onClick={() => toggleCheckIn(ci.key)}
                  className={`checkin-chip ${active ? 'checkin-chip-active' : ''}`}
                >
                  <span className={`checkin-dot ${active ? 'checkin-dot-active' : ''}`} />
                  <div className="text-left">
                    <p className="text-xs font-semibold leading-tight">{ci.label}</p>
                    <p className="text-[10px] opacity-60 leading-tight">{isAuto ? '✓ auto-detected' : ci.sublabel}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {activeCheckIns.size > 0 && (
            <button
              type="button"
              onClick={() => openAddPostModal('workout')}
              className="mt-3 w-full py-2 text-xs font-semibold text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
            >
              Share today's win with the community →
            </button>
          )}
        </div>

        {/* Pod status card */}
        <div className="community-hub-card">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t('community.hub.yourPod')}</h2>
            <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">{t('community.hub.members', { count: podCount })}</span>
          </div>
          <div className="pod-challenge-banner">
            <Target className="w-4 h-4 text-orange-500 shrink-0" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">{t('community.hub.thisWeeksChallenge')}</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{weeklyPodChallenge}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('community.hub.trainedToday', { done: podCheckedIn, total: podCount })}
            </p>
            <div className="flex -space-x-1.5">
              {[...podMemberIds].slice(0, 4).map((id, i) => {
                const post = posts.find((p) => p.authorId === id);
                const initials = post ? post.authorInitials : '?';
                const trained = podTrainedToday.has(id);
                return (
                  <div
                    key={id}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${trained ? 'bg-orange-400 border-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 border-white dark:border-gray-800 text-gray-500 dark:text-gray-400'}`}
                    style={{ zIndex: 4 - i }}
                  >
                    {initials}
                  </div>
                );
              })}
              <div className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-orange-400 flex items-center justify-center text-[9px] font-bold text-white">
                {initialsFromName(displayName)}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly recap */}
        <div className="community-hub-card">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t('community.hub.thisWeek')}</h2>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: t('community.hub.daysLogged'), value: weeklyRecap.daysLogged, suffix: '/7' },
              { label: t('community.hub.workouts'), value: weeklyRecap.daysWorkout, suffix: '' },
              { label: t('community.hub.avgScore'), value: weeklyRecap.avgScore, suffix: '%' },
              { label: t('community.hub.streak'), value: weeklyRecap.streak, suffix: 'd' },
            ].map((stat) => (
              <div key={stat.label} className="recap-stat">
                <p className="recap-stat-value">{stat.value}<span className="text-[10px] opacity-60">{stat.suffix}</span></p>
                <p className="recap-stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
          {weeklyRecap.streak >= 7 && (
            <div className="mt-3 flex items-center gap-2 py-2 px-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30">
              <Flame className="w-4 h-4 text-orange-500 shrink-0" />
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">{weeklyRecap.streak} day streak — keep it going!</p>
            </div>
          )}
        </div>

        {/* Leaderboard (collapsible) */}
        <div className="community-hub-card">
          <button
            type="button"
            onClick={() => setExpandLeaderboard((v) => !v)}
            className="w-full flex items-center gap-2"
          >
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">{t('community.hub.consistencyLeaderboard')}</h2>
            <span className="ml-auto text-xs text-gray-400">{expandLeaderboard ? '▲' : '▼'}</span>
          </button>
          {expandLeaderboard && (
            <div className="mt-3 space-y-2">
              {leaderboard.map((entry, i) => (
                <div key={entry.id} className="flex items-center gap-3">
                  <p className="w-5 text-xs font-bold text-orange-600">#{i + 1}</p>
                  <div className="w-9 h-9 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-950/40 dark:to-orange-900/40 rounded-full flex items-center justify-center text-[10px] font-bold text-orange-700 dark:text-orange-300">
                    {entry.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{entry.streak}d streak · {entry.posts} posts</p>
                  </div>
                  {i === 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-900/40">Leader</span>}
                </div>
              ))}
              {leaderboard.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No posts yet. Be the first.</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Feed Tab ─────────────────────────────────────────────────────────────────

  function renderFeedTab() {
    const filterLabels: Array<{ key: FeedFilter; label: string }> = [
      { key: 'all', label: t('community.feedFilters.all') },
      { key: 'workouts', label: t('community.feedFilters.workouts') },
      { key: 'recipes', label: t('community.feedFilters.food') },
      { key: 'wins', label: t('community.feedFilters.wins') },
      { key: 'struggles', label: t('community.feedFilters.struggles') },
    ];
    return (
      <div className="pb-24">
        {/* Search + filter */}
        <div className="px-0 py-3 space-y-3">
          <label className="friend-search-input-wrap" htmlFor="community-search">
            <Search className="friend-search-icon" />
            <input
              id="community-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts, people, recipes"
              className="friend-search-input"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {filterLabels.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFeedFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                  feedFilter === f.key
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status bar */}
        {feedPosts.length > 0 && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3 px-1">
            Sorted by usefulness · {feedPosts.length} post{feedPosts.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* Posts */}
        {feedPosts.map((post) => renderPostCard(post))}

        {feedPosts.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm font-medium">No posts here yet.</p>
            <p className="text-xs mt-1">Be the first to share a win.</p>
            <button type="button" onClick={() => openAddPostModal('workout')} className="mt-4 px-4 py-2 text-sm font-semibold rounded-xl bg-orange-500 text-white">
              Post something
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderPostCard(post: CommunityPost) {
    const isSaved = savedPostIds.includes(post.id);
    const isTried = triedPostIds.includes(post.id);
    const isStruggle = post.kind === 'struggle';

    return (
      <div key={post.id} className={`feed-item ${isStruggle ? 'feed-item-struggle' : ''}`}>
        {/* Header */}
        <div className="feed-header">
          {post.authorAvatarDataUrl ? (
            <img src={post.authorAvatarDataUrl} alt={post.authorName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-950/40 dark:to-orange-900/40 rounded-full flex items-center justify-center text-xs font-bold text-orange-700 dark:text-orange-300">
              {post.authorInitials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">{post.authorName}</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {renderPostTypeBadge(post.kind)}
              <span className="text-[10px] text-gray-400">{relativeTimeFrom(post.createdAt)}</span>
            </div>
          </div>
          <button type="button" className="text-gray-300 dark:text-gray-600 hover:text-gray-400">
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Stats strip (for workout/meal_win) */}
        {(post.kind === 'workout' || post.kind === 'meal_win') && (
          <div className="workout-card mt-3">
            <div className="workout-stats">
              <div>
                <p className="workout-label">{post.kind === 'meal_win' ? t('community.post.prep') : t('community.post.duration')}</p>
                <p className="workout-value">{post.durationMinutes}m</p>
              </div>
              {!post.hideCalories && (
                <div>
                  <p className="workout-label">Calories</p>
                  <p className="workout-value">{post.calories}</p>
                </div>
              )}
              <div>
                <p className="workout-label">{t('community.post.streak')}</p>
                <p className="workout-value">{t('community.post.dStreak', { count: post.streak })}</p>
              </div>
            </div>
            {post.prHighlight && <p className="workout-pr mt-2">{post.prHighlight}</p>}
          </div>
        )}

        {/* Recipe card */}
        {post.kind === 'recipe' && (
          <div className="mt-3 rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-orange-50/70 dark:bg-orange-950/20 p-4 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Soup className="w-4 h-4 text-orange-500" />
              <p className="font-semibold text-gray-800 dark:text-gray-100">{post.recipeTitle ?? 'Recipe'}</p>
              {post.recipeServings ? <span className="text-xs text-gray-500 ml-auto">{post.recipeServings} servings</span> : null}
            </div>
            {(post.recipeIngredients ?? []).length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1">Ingredients</p>
                  <ul className="space-y-0.5 text-gray-700 dark:text-gray-300 text-xs">
                    {(post.recipeIngredients ?? []).map((ing, i) => <li key={i}>– {ing}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 mb-1">Steps</p>
                  <ol className="space-y-0.5 text-gray-700 dark:text-gray-300 text-xs">
                    {(post.recipeSteps ?? []).map((step, i) => <li key={i}>{i + 1}. {step}</li>)}
                  </ol>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Caption */}
        {post.caption ? (
          <p className={`mt-3 text-sm ${isStruggle ? 'text-purple-800 dark:text-purple-300 italic' : 'text-gray-700 dark:text-gray-300'}`}>
            {isStruggle && '💭 '}{post.caption}
          </p>
        ) : null}

        {/* Image */}
        {!post.hideBodyPhoto && post.imageDataUrl ? (
          <img src={post.imageDataUrl} alt="Post" className="w-full h-56 object-cover rounded-2xl mt-3" />
        ) : null}

        {/* Quality signals */}
        {((post.saves ?? 0) > 0 || (post.tries ?? 0) > 0) && (
          <div className="flex gap-3 mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            {(post.saves ?? 0) > 0 && <span>🔖 {post.saves} saved</span>}
            {(post.tries ?? 0) > 0 && <span>✓ {post.tries} tried this</span>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {/* Actionable reactions */}
          <button
            type="button"
            onClick={() => toggleSave(post.id)}
            className={`action-chip ${isSaved ? 'action-chip-active-blue' : ''}`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            {isSaved ? t('community.post.saved') : t('community.post.save')}
          </button>
          {(post.kind === 'recipe' || post.kind === 'meal_win') && (
            <button
              type="button"
              onClick={() => toggleTry(post.id)}
              className={`action-chip ${isTried ? 'action-chip-active-green' : ''}`}
            >
              <Zap className="w-3.5 h-3.5" />
              {isTried ? t('community.post.makingThis') : t('community.post.tryThis')}
            </button>
          )}
          {isStruggle && (
            <button type="button" className="action-chip action-chip-support">
              <Heart className="w-3.5 h-3.5" />
              Support
            </button>
          )}
          {/* Emoji reactions */}
          <div className="flex gap-1.5 ml-auto">
            {reactionConfig.slice(0, 3).map((reaction) => {
              const selected = myReactions[post.id] === reaction.key;
              return (
                <button
                  key={reaction.key}
                  onClick={() => chooseReaction(post.id, reaction.key)}
                  className={`reaction-chip text-xs ${selected ? 'reaction-chip-active' : ''}`}
                >
                  <span>{reaction.token}</span>
                  {post.reactions[reaction.key] > 0 && <span>{post.reactions[reaction.key]}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Badges */}
        {(post.equippedBadgeIds ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="social-pill text-[10px]">{post.identityBadge}</span>
            {(post.equippedBadgeIds ?? []).slice(0, 2).map((badgeId) => (
              <span key={badgeId} className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeStyleById(badgeId)}`}>
                {String(badgeId).split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Challenges Tab ───────────────────────────────────────────────────────────

  function renderChallengesTab() {
    const joinedIds = new Set(joinedChallenges.map((c) => c.challengeId));
    const active = CHALLENGE_DEFS.filter((c) => joinedIds.has(c.id));
    const available = CHALLENGE_DEFS.filter((c) => !joinedIds.has(c.id));

    const colorClasses: Record<string, { bar: string; badge: string; ring: string }> = {
      orange: { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900/40', ring: 'border-orange-200 dark:border-orange-900/40' },
      blue: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/40', ring: 'border-blue-200 dark:border-blue-900/40' },
      green: { bar: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900/40', ring: 'border-green-200 dark:border-green-900/40' },
      emerald: { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/40', ring: 'border-emerald-200 dark:border-emerald-900/40' },
      purple: { bar: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-900/40', ring: 'border-purple-200 dark:border-purple-900/40' },
    };

    function renderChallengeCard(def: typeof CHALLENGE_DEFS[0], joined: boolean) {
      const progress = challengeProgress[def.id];
      const pct = Math.round((progress / def.target) * 100);
      const done = progress >= def.target;
      const cc = colorClasses[def.color];
      return (
        <div key={def.id} className={`challenge-card ${cc.ring}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cc.badge} border`}>
              <Award className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{def.title}</p>
                {done && <span className="text-[10px] font-bold text-green-600 dark:text-green-400">✓ Done!</span>}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{def.description}</p>
              {joined && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">{progress}/{def.target} {def.unit}</span>
                    <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cc.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleChallenge(def.id)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                joined
                  ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                  : `${cc.badge} border`
              }`}
            >
              {joined ? t('community.post.leaveChallenge') : t('community.post.joinChallenge')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24 space-y-4">
        {/* Weekly pod challenge */}
        <div className="community-hub-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Pod challenge this week</h2>
          </div>
          <p className="text-base font-bold text-orange-600 dark:text-orange-400">{weeklyPodChallenge}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {podMemberIds.size + 1} members · resets every Monday
          </p>
        </div>

        {/* Active challenges */}
        {active.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 px-1">Active challenges</p>
            <div className="space-y-2">
              {active.map((def) => renderChallengeCard(def, true))}
            </div>
          </div>
        )}

        {/* Available challenges */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 px-1">
            {active.length > 0 ? t('community.post.availableChallenges') : 'Join a challenge'}
          </p>
          {available.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">You've joined all challenges!</p>
          ) : (
            <div className="space-y-2">
              {available.map((def) => renderChallengeCard(def, false))}
            </div>
          )}
        </div>

        {/* Tip */}
        <div className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
          <AlertCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Progress is auto-tracked from your food and workout logs. Just keep logging.</p>
        </div>
      </div>
    );
  }

  // ─── Post Modal ───────────────────────────────────────────────────────────────

  function renderPostModal() {
    const postTypes: Array<{ kind: CommunityPostKind; label: string; icon: string }> = [
      { kind: 'workout', label: t('community.postTypes.trained'), icon: '🏋️' },
      { kind: 'meal_win', label: t('community.postTypes.mealWin'), icon: '🥗' },
      { kind: 'recipe', label: t('community.postTypes.recipeDrop'), icon: '🍳' },
      { kind: 'struggle', label: t('community.postTypes.struggle'), icon: '💭' },
      { kind: 'reflection', label: t('community.postTypes.reflection'), icon: '📖' },
    ];
    const isRecipe = postKind === 'recipe';

    return (
      <div className="fixed inset-0 z-[1400] bg-black/50 flex items-end justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl mb-16 sm:mb-0 border border-transparent dark:border-gray-700 overflow-y-auto max-h-[90vh]">
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">New post</h3>
              <button type="button" onClick={closeAddPostModal} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Post type selector */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">
              {postTypes.map((pt) => (
                <button
                  key={pt.kind}
                  type="button"
                  onClick={() => setPostKind(pt.kind)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    postKind === pt.kind ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span>{pt.icon}</span>
                  {pt.label}
                </button>
              ))}
            </div>

            {/* Context hint */}
            {postKind === 'struggle' && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40 text-xs text-purple-700 dark:text-purple-300">
                Struggles are safe here. You can post anonymously in your privacy settings.
              </div>
            )}

            {/* Image upload (not for reflection/struggle) */}
            {postKind !== 'reflection' && postKind !== 'struggle' && (
              <div className="mb-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border border-dashed border-orange-300 dark:border-orange-700 px-3 py-2.5 text-sm text-orange-700 dark:text-orange-300 flex items-center justify-center gap-2">
                  <ImagePlus className="w-4 h-4" />
                  {imageDataUrl ? t('community.post.changePhoto') : t('community.post.addPhoto')}
                </button>
                {imageDataUrl && <img src={imageDataUrl} alt="Preview" className="w-full h-36 object-cover rounded-xl mt-2" />}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
              </div>
            )}

            {/* Caption */}
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                postKind === 'workout' ? t('community.prompts.workout') :
                postKind === 'meal_win' ? t('community.prompts.mealWin') :
                postKind === 'recipe' ? t('community.prompts.recipeDrop') :
                postKind === 'struggle' ? t('community.prompts.struggle') :
                t('community.prompts.reflection')
              }
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 mb-3 resize-none"
            />

            {/* Workout fields */}
            {(postKind === 'workout' || postKind === 'meal_win') && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  inputMode="numeric"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={postKind === 'workout' ? t('community.post.durationMin') : t('community.post.prepTimeMin')}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
                />
                <input
                  inputMode="numeric"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Calories"
                  className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
                />
              </div>
            )}
            {postKind === 'workout' && (
              <input
                value={prHighlight}
                onChange={(e) => setPrHighlight(e.target.value)}
                placeholder="Highlight (e.g. Bench: 3×5 at 90kg)"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3"
              />
            )}

            {/* Recipe fields */}
            {isRecipe && (
              <>
                <input
                  value={recipeTitle}
                  onChange={(e) => setRecipeTitle(e.target.value)}
                  placeholder="Recipe name *"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3"
                />
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <input inputMode="numeric" value={recipePrepMinutes} onChange={(e) => setRecipePrepMinutes(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Prep (min)" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  <input inputMode="numeric" value={recipeServings} onChange={(e) => setRecipeServings(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Servings" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  <input inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ''))} placeholder="kcal/serving" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                </div>
                <textarea value={recipeIngredients} onChange={(e) => setRecipeIngredients(e.target.value)} placeholder="Ingredients — one per line *" rows={4} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3 resize-none" />
                <textarea value={recipeSteps} onChange={(e) => setRecipeSteps(e.target.value)} placeholder="Steps — one per line *" rows={4} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 mb-3 resize-none" />
              </>
            )}

            {/* Visibility */}
            {postKind !== 'struggle' && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Visibility</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['public', 'friends', 'private'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setPostVisibility(v)}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize ${postVisibility === v ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAddPostModal} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium">Cancel</button>
              <button type="button" onClick={createPost} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold">Publish</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="screen community-screen">
      {/* Header */}
      <div className="community-hero">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Community</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">{currentStreak}d streak</span>
            {activeCheckIns.size > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40">
                {activeCheckIns.size}/4 today
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-white/60 mb-3">Accountability · Progress · Community</p>

        {/* Local-mode banner */}
        <div className="flex items-start gap-2 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 px-3 py-2 mb-3">
          <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
            {profile.language === 'English'
              ? 'This is your personal activity journal. Posts and challenges are saved locally — social features are coming soon.'
              : 'Dette er din personlige aktivitetsdagbok. Innlegg og utfordringer lagres lokalt — sosiale funksjoner kommer snart.'}
          </p>
        </div>

        {/* Main tabs + post button */}
        <div className="flex gap-1 items-center">
          {([['hub', t('community.tabs.hub')], ['feed', t('community.tabs.feed')], ['challenges', t('community.tabs.challenges')]] as [MainTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMainTab(tab)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
                mainTab === tab
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-500 dark:text-white/60 hover:text-gray-800 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pt-4">
        {mainTab === 'hub' && renderHubTab()}
        {mainTab === 'feed' && renderFeedTab()}
        {mainTab === 'challenges' && renderChallengesTab()}
      </div>



      {/* Post modal */}
      {showAddPost && renderPostModal()}

      {/* Floating action button */}
      <button
        type="button"
        onClick={handleFabClick}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={resetFabDrag}
        onPointerCancel={resetFabDrag}
        className={`community-add-post-fab ${fabAnimating ? 'community-add-post-fab-animate' : ''} ${isDraggingFab ? 'community-add-post-fab-dragging' : ''}`}
        style={fabPosition ? { left: `${fabPosition.x}px`, top: `${fabPosition.y}px` } : undefined}
        aria-label="Ny innlegg"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}
