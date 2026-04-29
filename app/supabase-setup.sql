-- =====================================================
-- KALORIFIT — KOMPLETT DATABASE SETUP
-- Fully idempotent. Safe to re-run at any time.
-- Covers both fresh installs and already-migrated projects.
-- Run in Supabase Dashboard → SQL Editor → New Query
-- =====================================================

-- =====================================================
-- 1. HELPER TRIGGER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Alias used by community migration triggers
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =====================================================
-- 2. CORE TABLES
-- =====================================================

-- Generic key-value sync store
CREATE TABLE IF NOT EXISTS user_kv_store (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT 'user',
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE user_kv_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own kv data"   ON user_kv_store;
DROP POLICY IF EXISTS "Users can insert own kv data" ON user_kv_store;
DROP POLICY IF EXISTS "Users can update own kv data" ON user_kv_store;
DROP POLICY IF EXISTS "Users can delete own kv data" ON user_kv_store;

CREATE POLICY "Users can read own kv data"   ON user_kv_store FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own kv data" ON user_kv_store FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own kv data" ON user_kv_store FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own kv data" ON user_kv_store FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_kv_store_user_id ON user_kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kv_store_scope   ON user_kv_store(scope);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  email                TEXT NOT NULL,
  display_name         TEXT,
  username             TEXT,
  avatar_url           TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  language             TEXT DEFAULT 'Norsk',
  notifications_enabled BOOLEAN DEFAULT FALSE,
  meal_reminders       JSONB DEFAULT '{"breakfast":false,"breakfastTime":"08:00","lunch":false,"lunchTime":"12:00","dinner":false,"dinnerTime":"18:00"}'::JSONB,
  goals                JSONB DEFAULT '{"calories":2000,"protein":150,"carbs":250,"fat":70}'::JSONB,
  privacy_settings     JSONB DEFAULT '{"anonymousPosting":false,"hideWeightNumbers":false,"hideBodyPhotos":false}'::JSONB
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON profiles(lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own data" ON profiles;
CREATE POLICY "Users own data" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Daily logs
CREATE TABLE IF NOT EXISTS daily_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  calories_consumed INTEGER DEFAULT 0,
  calories_goal     INTEGER DEFAULT 2000,
  protein           INTEGER DEFAULT 0,
  carbs             INTEGER DEFAULT 0,
  fat               INTEGER DEFAULT 0,
  meals             JSONB DEFAULT '[]'::JSONB,
  water_glasses     INTEGER DEFAULT 0,
  water_ml          INTEGER DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own daily_logs" ON daily_logs;
CREATE POLICY "Users own daily_logs" ON daily_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_daily_logs_updated_at ON daily_logs;
CREATE TRIGGER update_daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Foods
CREATE TABLE IF NOT EXISTS foods (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  barcode            TEXT,
  calories_per_100g  INTEGER NOT NULL,
  protein_per_100g   NUMERIC(6,2) DEFAULT 0,
  carbs_per_100g     NUMERIC(6,2) DEFAULT 0,
  fat_per_100g       NUMERIC(6,2) DEFAULT 0,
  serving_size       INTEGER DEFAULT 100,
  serving_unit       TEXT DEFAULT 'g',
  is_custom          BOOLEAN DEFAULT FALSE,
  is_favorite        BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public foods visible"      ON foods;
DROP POLICY IF EXISTS "Users create custom foods" ON foods;
DROP POLICY IF EXISTS "Users edit own foods"      ON foods;

CREATE POLICY "Public foods visible"      ON foods FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users create custom foods" ON foods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users edit own foods"      ON foods FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_foods_updated_at ON foods;
CREATE TRIGGER update_foods_updated_at
  BEFORE UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Legacy check-ins (kept for backwards compat; community_check_ins is the canonical table)
CREATE TABLE IF NOT EXISTS check_ins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  types      TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own check_ins" ON check_ins;
CREATE POLICY "Users own check_ins" ON check_ins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Legacy user_challenges (kept for backwards compat; community_joined_challenges is the canonical table)
CREATE TABLE IF NOT EXISTS user_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  progress     INTEGER DEFAULT 0,
  completed    BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, challenge_id)
);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own challenges" ON user_challenges;
CREATE POLICY "Users own challenges" ON user_challenges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 3. COMMUNITY TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS community_posts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name          TEXT NOT NULL DEFAULT '',
  author_initials      TEXT DEFAULT '',
  author_avatar        TEXT,
  kind                 TEXT NOT NULL DEFAULT 'workout',
  caption              TEXT,
  image_url            TEXT,
  duration_minutes     INTEGER DEFAULT 0,
  calories             INTEGER DEFAULT 0,
  pr_highlight         TEXT,
  streak               INTEGER NOT NULL DEFAULT 0,
  visibility           TEXT NOT NULL DEFAULT 'public',
  reactions            JSONB NOT NULL DEFAULT '{"fire":0,"strong":0,"beast":0,"insane":0,"watching":0}',
  saves                INTEGER NOT NULL DEFAULT 0,
  tries                INTEGER NOT NULL DEFAULT 0,
  recipe_title         TEXT,
  recipe_ingredients   TEXT[],
  recipe_steps         TEXT[],
  recipe_servings      INTEGER,
  recipe_prep_minutes  INTEGER,
  comments_count       INTEGER NOT NULL DEFAULT 0,
  -- Extended community columns
  data                 JSONB,
  level                TEXT,
  goal                 TEXT,
  training_style       TEXT,
  identity_badge       TEXT,
  equipped_badge_ids   TEXT[],
  hide_calories        BOOLEAN DEFAULT FALSE,
  hide_body_photo      BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ADD columns for projects that already have the base table
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS comments_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS data                JSONB;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS level               TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS goal                TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS training_style      TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS identity_badge      TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS equipped_badge_ids  TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_calories       BOOLEAN DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_body_photo     BOOLEAN DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_posts_kind_check'
      AND conrelid = 'community_posts'::regclass
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_kind_check
      CHECK (kind IN ('workout','recipe','meal_win','struggle','reflection'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_posts_visibility_check'
      AND conrelid = 'community_posts'::regclass
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_visibility_check
      CHECK (visibility IN ('public','friends','private'));
  END IF;
END;
$$;

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view posts"              ON community_posts;
DROP POLICY IF EXISTS "Public posts visible to all"        ON community_posts;
DROP POLICY IF EXISTS "Friend posts visible to followers"  ON community_posts;
DROP POLICY IF EXISTS "Users read own posts"               ON community_posts;
DROP POLICY IF EXISTS "Users create own posts"             ON community_posts;
DROP POLICY IF EXISTS "Users insert own posts"             ON community_posts;
DROP POLICY IF EXISTS "Users edit own posts"               ON community_posts;
DROP POLICY IF EXISTS "Users update own posts"             ON community_posts;
DROP POLICY IF EXISTS "Users delete own posts"             ON community_posts;

CREATE POLICY "Public posts visible to all"
  ON community_posts FOR SELECT USING (visibility = 'public');

CREATE POLICY "Friend posts visible to followers"
  ON community_posts FOR SELECT
  USING (
    visibility = 'friends'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM community_follows
      WHERE follower_id  = auth.uid()
        AND following_id = community_posts.user_id
    )
  );

CREATE POLICY "Users read own posts"   ON community_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own posts" ON community_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own posts" ON community_posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own posts" ON community_posts FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_posts_updated_at           ON community_posts;
DROP TRIGGER IF EXISTS set_community_posts_updated_at    ON community_posts;
CREATE TRIGGER set_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- community_reactions
CREATE TABLE IF NOT EXISTS community_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'fire',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, reaction_type)
);

ALTER TABLE community_reactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_reactions_post_id_user_id_key'
      AND conrelid = 'community_reactions'::regclass
  ) THEN
    ALTER TABLE community_reactions ADD CONSTRAINT community_reactions_post_id_user_id_key UNIQUE (post_id, user_id);
  END IF;
END;
$$;

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own reactions"        ON community_reactions;
DROP POLICY IF EXISTS "Anyone can read reactions"  ON community_reactions;
DROP POLICY IF EXISTS "Users manage own reactions" ON community_reactions;

CREATE POLICY "Anyone can read reactions"  ON community_reactions FOR SELECT USING (true);
CREATE POLICY "Users manage own reactions" ON community_reactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- community_saves
CREATE TABLE IF NOT EXISTS community_saves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE community_saves ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE community_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own saves"        ON community_saves;
DROP POLICY IF EXISTS "Users read own saves"   ON community_saves;
DROP POLICY IF EXISTS "Users manage own saves" ON community_saves;

CREATE POLICY "Users read own saves"   ON community_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own saves" ON community_saves FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- community_tries
CREATE TABLE IF NOT EXISTS community_tries (
  post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE community_tries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tries"    ON community_tries;
DROP POLICY IF EXISTS "Users manage own tries"  ON community_tries;

CREATE POLICY "Users read own tries"    ON community_tries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own tries"  ON community_tries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- community_check_ins (canonical — replaces legacy check_ins for community features)
CREATE TABLE IF NOT EXISTS community_check_ins (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key   TEXT NOT NULL,   -- 'YYYY-MM-DD'
  types      TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date_key)
);

ALTER TABLE community_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own check-ins" ON community_check_ins;
CREATE POLICY "Users manage own check-ins" ON community_check_ins FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- community_joined_challenges (canonical — replaces legacy user_challenges for community features)
CREATE TABLE IF NOT EXISTS community_joined_challenges (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

ALTER TABLE community_joined_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own challenges" ON community_joined_challenges;
CREATE POLICY "Users manage own challenges" ON community_joined_challenges FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- community_follows
CREATE TABLE IF NOT EXISTS community_follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE community_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows"  ON community_follows;
DROP POLICY IF EXISTS "Users manage own follows" ON community_follows;

CREATE POLICY "Anyone can read follows"  ON community_follows FOR SELECT USING (true);
CREATE POLICY "Users manage own follows" ON community_follows FOR ALL
  USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);

-- community_comments
CREATE TABLE IF NOT EXISTS community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read comments on visible posts" ON community_comments;
DROP POLICY IF EXISTS "Users insert own comments"      ON community_comments;
DROP POLICY IF EXISTS "Users update own comments"      ON community_comments;
DROP POLICY IF EXISTS "Users delete own comments"      ON community_comments;

CREATE POLICY "Read comments on visible posts"
  ON community_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = community_comments.post_id
        AND (
          p.visibility = 'public'
          OR p.user_id = auth.uid()
          OR (
            p.visibility = 'friends'
            AND auth.uid() IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM community_follows f
              WHERE f.follower_id = auth.uid() AND f.following_id = p.user_id
            )
          )
        )
    )
  );

CREATE POLICY "Users insert own comments" ON community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments" ON community_comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own comments" ON community_comments FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_community_comments_updated_at ON community_comments;
CREATE TRIGGER set_community_comments_updated_at
  BEFORE UPDATE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- community_post_reports
CREATE TABLE IF NOT EXISTS community_post_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('spam','offensive','misinformation','other')),
  details     TEXT CHECK (char_length(details) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, reporter_id)
);

ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own reports" ON community_post_reports;
DROP POLICY IF EXISTS "Users read own reports"   ON community_post_reports;

CREATE POLICY "Users insert own reports" ON community_post_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users read own reports"   ON community_post_reports FOR SELECT USING (auth.uid() = reporter_id);

-- =====================================================
-- 4. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_community_posts_public_feed  ON community_posts (created_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_community_posts_kind_feed    ON community_posts (kind, created_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_community_posts_user         ON community_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post     ON community_reactions (post_id);
CREATE INDEX IF NOT EXISTS idx_community_saves_post         ON community_saves (post_id);
CREATE INDEX IF NOT EXISTS idx_community_tries_post         ON community_tries (post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post      ON community_comments (post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_community_follows_following  ON community_follows (following_id);

-- =====================================================
-- 5. COMMENTS COUNT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION trg_community_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inc_comments_count ON community_comments;
CREATE TRIGGER trg_inc_comments_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION trg_community_comments_count();

-- =====================================================
-- 6. AUTH HELPERS
-- =====================================================

-- Look up email from username (used for username login; authenticated only to prevent enumeration)
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE lower(username) = lower(trim(p_username))
  LIMIT 1;
  RETURN v_email;
END;
$$;

-- anon intentionally excluded: allowing anon access enables unauthenticated username→email enumeration
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO authenticated;

-- Auto-create profile row on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    lower(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
  )
  ON CONFLICT (id) DO UPDATE SET
    username     = EXCLUDED.username,
    display_name = EXCLUDED.display_name;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 7. COMMUNITY RPCs (SECURITY DEFINER — atomic mutations)
-- =====================================================

CREATE OR REPLACE FUNCTION community_toggle_reaction(p_post_id UUID, p_reaction TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_existing        TEXT;
  v_reaction_counts JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_reaction IS NOT NULL AND p_reaction NOT IN ('fire','strong','beast','insane','watching') THEN
    RAISE EXCEPTION 'Invalid reaction: %', p_reaction;
  END IF;

  SELECT reaction_type INTO v_existing
  FROM community_reactions WHERE post_id = p_post_id AND user_id = v_user_id;

  DELETE FROM community_reactions WHERE post_id = p_post_id AND user_id = v_user_id;

  IF p_reaction IS NOT NULL AND p_reaction IS DISTINCT FROM v_existing THEN
    INSERT INTO community_reactions (post_id, user_id, reaction_type)
    VALUES (p_post_id, v_user_id, p_reaction);
  END IF;

  SELECT jsonb_build_object(
    'fire',     COUNT(*) FILTER (WHERE reaction_type = 'fire'),
    'strong',   COUNT(*) FILTER (WHERE reaction_type = 'strong'),
    'beast',    COUNT(*) FILTER (WHERE reaction_type = 'beast'),
    'insane',   COUNT(*) FILTER (WHERE reaction_type = 'insane'),
    'watching', COUNT(*) FILTER (WHERE reaction_type = 'watching')
  ) INTO v_reaction_counts
  FROM community_reactions WHERE post_id = p_post_id;

  UPDATE community_posts
  SET reactions = v_reaction_counts, updated_at = NOW()
  WHERE id = p_post_id;

  RETURN v_reaction_counts;
END;
$$;

CREATE OR REPLACE FUNCTION community_toggle_save(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_saves BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM community_saves WHERE post_id = p_post_id AND user_id = v_user_id) INTO v_already;
  IF v_already THEN
    DELETE FROM community_saves WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO community_saves (post_id, user_id) VALUES (p_post_id, v_user_id) ON CONFLICT DO NOTHING;
  END IF;
  SELECT COUNT(*) INTO v_new_saves FROM community_saves WHERE post_id = p_post_id;
  UPDATE community_posts SET saves = v_new_saves, updated_at = NOW() WHERE id = p_post_id;
  RETURN jsonb_build_object('saves', v_new_saves, 'saved', NOT v_already);
END;
$$;

CREATE OR REPLACE FUNCTION community_toggle_try(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_tries BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM community_tries WHERE post_id = p_post_id AND user_id = v_user_id) INTO v_already;
  IF v_already THEN
    DELETE FROM community_tries WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO community_tries (post_id, user_id) VALUES (p_post_id, v_user_id) ON CONFLICT DO NOTHING;
  END IF;
  SELECT COUNT(*) INTO v_new_tries FROM community_tries WHERE post_id = p_post_id;
  UPDATE community_posts SET tries = v_new_tries, updated_at = NOW() WHERE id = p_post_id;
  RETURN jsonb_build_object('tries', v_new_tries, 'tried', NOT v_already);
END;
$$;

CREATE OR REPLACE FUNCTION community_toggle_follow(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_already        BOOLEAN;
  v_follower_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_user_id = p_target_user_id THEN RAISE EXCEPTION 'Cannot follow yourself'; END IF;
  SELECT EXISTS(SELECT 1 FROM community_follows WHERE follower_id = v_user_id AND following_id = p_target_user_id) INTO v_already;
  IF v_already THEN
    DELETE FROM community_follows WHERE follower_id = v_user_id AND following_id = p_target_user_id;
  ELSE
    INSERT INTO community_follows (follower_id, following_id) VALUES (v_user_id, p_target_user_id) ON CONFLICT DO NOTHING;
  END IF;
  SELECT COUNT(*) INTO v_follower_count FROM community_follows WHERE following_id = p_target_user_id;
  RETURN jsonb_build_object('following', NOT v_already, 'followers_count', v_follower_count);
END;
$$;

CREATE OR REPLACE FUNCTION community_add_comment(p_post_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_body    TEXT := LEFT(TRIM(p_body), 500);
  v_id      UUID;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF char_length(v_body) = 0 THEN RAISE EXCEPTION 'Comment body cannot be empty'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM community_posts p WHERE p.id = p_post_id
      AND (p.visibility = 'public' OR p.user_id = v_user_id
        OR (p.visibility = 'friends' AND EXISTS (
          SELECT 1 FROM community_follows f WHERE f.follower_id = v_user_id AND f.following_id = p.user_id
        )))
  ) THEN
    RAISE EXCEPTION 'Post not found or not accessible';
  END IF;
  INSERT INTO community_comments (post_id, user_id, body, created_at, updated_at)
  VALUES (p_post_id, v_user_id, v_body, v_now, v_now) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'post_id', p_post_id, 'user_id', v_user_id, 'body', v_body, 'created_at', v_now, 'updated_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION community_delete_comment(p_comment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_post_id   UUID;
  v_author_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT post_id, user_id INTO v_post_id, v_author_id FROM community_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found'; END IF;
  IF v_author_id <> v_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM community_posts WHERE id = v_post_id AND user_id = v_user_id) THEN
      RAISE EXCEPTION 'Not authorised to delete this comment';
    END IF;
  END IF;
  DELETE FROM community_comments WHERE id = p_comment_id;
  RETURN jsonb_build_object('deleted', true, 'comment_id', p_comment_id);
END;
$$;

CREATE OR REPLACE FUNCTION community_report_post(p_post_id UUID, p_reason TEXT, p_details TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_reason NOT IN ('spam','offensive','misinformation','other') THEN
    RAISE EXCEPTION 'Invalid report reason: %', p_reason;
  END IF;
  INSERT INTO community_post_reports (post_id, reporter_id, reason, details)
  VALUES (p_post_id, v_user_id, p_reason, LEFT(TRIM(p_details), 500))
  ON CONFLICT (post_id, reporter_id) DO UPDATE
    SET reason = EXCLUDED.reason, details = EXCLUDED.details, created_at = NOW();
  RETURN jsonb_build_object('reported', true);
END;
$$;

-- =====================================================
-- 8. SEED FOODS (norske matvarer)
-- =====================================================

INSERT INTO foods (name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_size, serving_unit, is_custom) VALUES
('Egg', 143, 12.6, 0.7, 9.5, 60, 'g', FALSE),
('Kyllingfilet', 165, 31, 0, 3.6, 150, 'g', FALSE),
('Laks', 208, 20, 0, 13, 150, 'g', FALSE),
('Rundstykke', 250, 8, 45, 3, 60, 'g', FALSE),
('Brod (grovt)', 220, 9, 40, 2, 40, 'g', FALSE),
('Ris (kokt)', 130, 2.7, 28, 0.3, 150, 'g', FALSE),
('Pasta (kokt)', 131, 5, 25, 1.1, 150, 'g', FALSE),
('Potet (kokt)', 87, 1.9, 20, 0.1, 150, 'g', FALSE),
('Brokkoli', 34, 2.8, 7, 0.4, 100, 'g', FALSE),
('Gulrot', 41, 0.9, 10, 0.2, 100, 'g', FALSE),
('Tomat', 18, 0.9, 3.9, 0.2, 100, 'g', FALSE),
('Agurk', 15, 0.7, 3.6, 0.1, 100, 'g', FALSE),
('Ost (gul)', 400, 25, 1, 33, 30, 'g', FALSE),
('Melk (lett)', 47, 3.4, 4.9, 1, 200, 'ml', FALSE),
('Yoghurt (naturell)', 61, 3.5, 4.7, 3.3, 150, 'g', FALSE),
('Banan', 89, 1.1, 23, 0.3, 120, 'g', FALSE),
('Eple', 52, 0.3, 14, 0.2, 150, 'g', FALSE),
('Appelsin', 47, 0.9, 12, 0.1, 150, 'g', FALSE),
('Jordbaer', 32, 0.7, 7.7, 0.3, 100, 'g', FALSE),
('Blablaer', 57, 0.7, 14, 0.3, 100, 'g', FALSE),
('Avokado', 160, 2, 8.5, 14.7, 100, 'g', FALSE),
('Mandler', 579, 21, 22, 50, 30, 'g', FALSE),
('Valnotter', 654, 15, 14, 65, 30, 'g', FALSE),
('Havregryn', 389, 16.9, 66, 6.9, 50, 'g', FALSE),
('Musli', 350, 8, 65, 6, 50, 'g', FALSE),
('Kjoettdeig (karbonadedeig)', 250, 18, 0, 20, 150, 'g', FALSE),
('Kjoettkaker', 280, 15, 8, 21, 100, 'g', FALSE),
('Polser', 280, 12, 2, 25, 80, 'g', FALSE),
('Fiskepinner', 220, 10, 18, 12, 100, 'g', FALSE),
('Grandiosa', 260, 11, 30, 10, 100, 'g', FALSE),
('Coca-Cola', 42, 0, 10.6, 0, 330, 'ml', FALSE),
('Appelsinjuice', 45, 0.7, 10, 0.2, 200, 'ml', FALSE),
('Kaffe (svart)', 2, 0.3, 0, 0, 200, 'ml', FALSE),
('Te (uten melk)', 1, 0, 0.3, 0, 200, 'ml', FALSE),
('Sjokolade (melk)', 535, 7.7, 59, 30, 25, 'g', FALSE),
('Potetgull', 536, 7, 53, 35, 50, 'g', FALSE),
('Kneklebrod', 380, 10, 70, 5, 10, 'g', FALSE),
('Smor', 717, 0.9, 0.1, 81, 10, 'g', FALSE),
('Syltetoy', 250, 0.3, 62, 0.3, 20, 'g', FALSE),
('Leverpostei', 300, 15, 5, 25, 40, 'g', FALSE),
('Makrell i tomat', 220, 15, 5, 16, 110, 'g', FALSE),
('Tunfisk (hermetisk)', 116, 26, 0, 1, 80, 'g', FALSE),
('Bonner (kidney, hermetisk)', 100, 7, 15, 0.5, 120, 'g', FALSE),
('Erter (hermetisk)', 80, 5, 12, 0.5, 100, 'g', FALSE),
('Mais (hermetisk)', 90, 3, 18, 1, 100, 'g', FALSE),
('Olivenolje', 884, 0, 0, 100, 15, 'ml', FALSE),
('Ketchup', 100, 1, 25, 0, 20, 'ml', FALSE),
('Sennep', 60, 4, 6, 3, 10, 'ml', FALSE),
('Majones', 680, 1, 1, 75, 15, 'ml', FALSE),
('Pesto', 460, 6, 5, 46, 30, 'g', FALSE)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 9. REALTIME
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_logs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'community_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'community_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_reactions;
  END IF;
END $$;

-- =====================================================
-- DONE. Fresh install and migrated projects now match.
-- =====================================================
