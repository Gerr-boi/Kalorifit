-- ============================================================
-- Community feature — complete, idempotent migration
-- Safe to re-run at any time.
-- Assumes community_posts, community_reactions, community_saves
-- already exist (Supabase project baseline).
-- ============================================================

-- ── 1. community_posts — ALL columns the app reads/writes ────
--
-- Base columns (likely already exist; ADD COLUMN IF NOT EXISTS
-- is always safe).

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_name          TEXT         NOT NULL DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_initials      TEXT                  DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_avatar        TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS kind                 TEXT         NOT NULL DEFAULT 'workout';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS caption              TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_url            TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS duration_minutes     INTEGER               DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS calories             INTEGER               DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS pr_highlight         TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS streak               INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS visibility           TEXT         NOT NULL DEFAULT 'public';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS reactions            JSONB        NOT NULL DEFAULT '{"fire":0,"strong":0,"beast":0,"insane":0,"watching":0}';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS saves                INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS tries                INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS recipe_title         TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS recipe_ingredients   TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS recipe_steps         TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS recipe_servings      INTEGER;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS recipe_prep_minutes  INTEGER;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- Extended columns added by this migration
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ           DEFAULT NOW();
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS data                 JSONB;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS level                TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS goal                 TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS training_style       TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS identity_badge       TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS equipped_badge_ids   TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_calories        BOOLEAN               DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_body_photo      BOOLEAN               DEFAULT FALSE;

-- Denormalised comment count (kept in sync by trigger below)
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS comments_count       INTEGER      NOT NULL DEFAULT 0;

-- ── 2. community_posts — CHECK constraints ───────────────────
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

-- ── 3. community_reactions — add created_at if missing ───────
ALTER TABLE community_reactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Unique constraint: one reaction per user per post
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_reactions_post_id_user_id_key'
      AND conrelid = 'community_reactions'::regclass
  ) THEN
    ALTER TABLE community_reactions
      ADD CONSTRAINT community_reactions_post_id_user_id_key
      UNIQUE (post_id, user_id);
  END IF;
END;
$$;

-- ── 4. community_saves — add created_at if missing ───────────
ALTER TABLE community_saves ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ── 5. community_tries (new) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS community_tries (
  post_id    UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── 6. community_check_ins (new) ─────────────────────────────
CREATE TABLE IF NOT EXISTS community_check_ins (
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key   TEXT   NOT NULL,           -- 'YYYY-MM-DD'
  types      TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date_key)
);

-- ── 7. community_joined_challenges (new) ─────────────────────
CREATE TABLE IF NOT EXISTS community_joined_challenges (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

-- ── 8. community_follows (new) ───────────────────────────────
--
-- Required for 'friends' visibility: a post with visibility='friends'
-- is readable by any user who follows the author.
CREATE TABLE IF NOT EXISTS community_follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

-- ── 9. community_comments (new) ──────────────────────────────
CREATE TABLE IF NOT EXISTS community_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. community_post_reports (new) — content moderation ────
CREATE TABLE IF NOT EXISTS community_post_reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_id  UUID        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  reason       TEXT        NOT NULL
                             CHECK (reason IN ('spam','offensive','misinformation','other')),
  details      TEXT        CHECK (char_length(details) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, reporter_id)   -- one report per user per post
);

-- ============================================================
-- INDEXES — for the query paths the app actually uses
-- ============================================================

-- Public feed pagination (most common query)
CREATE INDEX IF NOT EXISTS idx_community_posts_public_feed
  ON community_posts (created_at DESC)
  WHERE visibility = 'public';

-- Feed filtered by kind
CREATE INDEX IF NOT EXISTS idx_community_posts_kind_feed
  ON community_posts (kind, created_at DESC)
  WHERE visibility = 'public';

-- My own posts
CREATE INDEX IF NOT EXISTS idx_community_posts_user
  ON community_posts (user_id, created_at DESC);

-- Reaction counts per post
CREATE INDEX IF NOT EXISTS idx_community_reactions_post
  ON community_reactions (post_id);

-- Save counts per post
CREATE INDEX IF NOT EXISTS idx_community_saves_post
  ON community_saves (post_id);

-- Try counts per post
CREATE INDEX IF NOT EXISTS idx_community_tries_post
  ON community_tries (post_id);

-- Comments per post (chronological)
CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON community_comments (post_id, created_at ASC);

-- Who follows whom (reverse lookup)
CREATE INDEX IF NOT EXISTS idx_community_follows_following
  ON community_follows (following_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at auto-bump on community_posts
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_community_posts_updated_at ON community_posts;
CREATE TRIGGER set_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

DROP TRIGGER IF EXISTS set_community_comments_updated_at ON community_comments;
CREATE TRIGGER set_community_comments_updated_at
  BEFORE UPDATE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- comments_count denormalised counter
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- ── community_posts ──────────────────────────────────────────
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public posts visible to all"          ON community_posts;
DROP POLICY IF EXISTS "Friend posts visible to followers"    ON community_posts;
DROP POLICY IF EXISTS "Users read own posts"                 ON community_posts;
DROP POLICY IF EXISTS "Users insert own posts"               ON community_posts;
DROP POLICY IF EXISTS "Users update own posts"               ON community_posts;
DROP POLICY IF EXISTS "Users delete own posts"               ON community_posts;

-- Anyone (including unauthenticated) can read public posts
CREATE POLICY "Public posts visible to all"
  ON community_posts FOR SELECT
  USING (visibility = 'public');

-- Friends-only posts are readable by accepted followers
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

-- Owner can always read, write, update, delete their own posts
CREATE POLICY "Users read own posts"
  ON community_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own posts"
  ON community_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own posts"
  ON community_posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own posts"
  ON community_posts FOR DELETE
  USING (auth.uid() = user_id);

-- ── community_reactions ───────────────────────────────────────
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions"   ON community_reactions;
DROP POLICY IF EXISTS "Users manage own reactions"  ON community_reactions;

CREATE POLICY "Anyone can read reactions"
  ON community_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users manage own reactions"
  ON community_reactions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── community_saves ───────────────────────────────────────────
ALTER TABLE community_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saves"    ON community_saves;
DROP POLICY IF EXISTS "Users manage own saves"  ON community_saves;

CREATE POLICY "Users read own saves"
  ON community_saves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own saves"
  ON community_saves FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── community_tries ───────────────────────────────────────────
ALTER TABLE community_tries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tries"    ON community_tries;
DROP POLICY IF EXISTS "Users manage own tries"  ON community_tries;

CREATE POLICY "Users read own tries"
  ON community_tries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own tries"
  ON community_tries FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── community_check_ins ───────────────────────────────────────
ALTER TABLE community_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own check-ins" ON community_check_ins;

CREATE POLICY "Users manage own check-ins"
  ON community_check_ins FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── community_joined_challenges ───────────────────────────────
ALTER TABLE community_joined_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own challenges" ON community_joined_challenges;

CREATE POLICY "Users manage own challenges"
  ON community_joined_challenges FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── community_follows ─────────────────────────────────────────
ALTER TABLE community_follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows"    ON community_follows;
DROP POLICY IF EXISTS "Users manage own follows"   ON community_follows;

-- Public: lets anyone see follower counts / check if they follow someone
CREATE POLICY "Anyone can read follows"
  ON community_follows FOR SELECT
  USING (true);

CREATE POLICY "Users manage own follows"
  ON community_follows FOR ALL
  USING  (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);

-- ── community_comments ────────────────────────────────────────
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read comments on visible posts"  ON community_comments;
DROP POLICY IF EXISTS "Users insert own comments"       ON community_comments;
DROP POLICY IF EXISTS "Users update own comments"       ON community_comments;
DROP POLICY IF EXISTS "Users delete own comments"       ON community_comments;

-- Comments are only readable if the parent post is also visible to the caller
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
              WHERE f.follower_id  = auth.uid()
                AND f.following_id = p.user_id
            )
          )
        )
    )
  );

CREATE POLICY "Users insert own comments"
  ON community_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own comments"
  ON community_comments FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own comments"
  ON community_comments FOR DELETE
  USING (auth.uid() = user_id);

-- ── community_post_reports ────────────────────────────────────
ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own reports"  ON community_post_reports;
DROP POLICY IF EXISTS "Users read own reports"    ON community_post_reports;

CREATE POLICY "Users insert own reports"
  ON community_post_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Users can only see their own report (prevents report-list enumeration)
CREATE POLICY "Users read own reports"
  ON community_post_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ============================================================
-- SECURITY DEFINER RPCs — atomic, bypass-proof mutations
-- ============================================================

-- ── community_toggle_reaction ─────────────────────────────────
--
-- Pass the reaction you want to set (fire/strong/beast/insane/watching),
-- or NULL to remove the current reaction.
-- Toggling the same reaction twice removes it.
-- Returns updated reaction counts for the post.

CREATE OR REPLACE FUNCTION community_toggle_reaction(
  p_post_id  UUID,
  p_reaction TEXT    -- one of fire/strong/beast/insane/watching, or NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID := auth.uid();
  v_existing        TEXT;
  v_reaction_counts JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reaction IS NOT NULL AND
     p_reaction NOT IN ('fire','strong','beast','insane','watching') THEN
    RAISE EXCEPTION 'Invalid reaction: %', p_reaction;
  END IF;

  -- Read current reaction
  SELECT reaction_type INTO v_existing
  FROM community_reactions
  WHERE post_id = p_post_id AND user_id = v_user_id;

  -- Remove existing (always)
  DELETE FROM community_reactions
  WHERE post_id = p_post_id AND user_id = v_user_id;

  -- Re-insert only if it differs from the old one (toggle-off otherwise)
  IF p_reaction IS NOT NULL AND p_reaction IS DISTINCT FROM v_existing THEN
    INSERT INTO community_reactions (post_id, user_id, reaction_type)
    VALUES (p_post_id, v_user_id, p_reaction);
  END IF;

  -- Recompute counts
  SELECT jsonb_build_object(
    'fire',     COUNT(*) FILTER (WHERE reaction_type = 'fire'),
    'strong',   COUNT(*) FILTER (WHERE reaction_type = 'strong'),
    'beast',    COUNT(*) FILTER (WHERE reaction_type = 'beast'),
    'insane',   COUNT(*) FILTER (WHERE reaction_type = 'insane'),
    'watching', COUNT(*) FILTER (WHERE reaction_type = 'watching')
  ) INTO v_reaction_counts
  FROM community_reactions
  WHERE post_id = p_post_id;

  -- Write back to denormalised column
  UPDATE community_posts
  SET reactions  = v_reaction_counts,
      updated_at = NOW()
  WHERE id = p_post_id;

  -- Keep data JSONB snapshot in sync
  UPDATE community_posts
  SET data = jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{reactions}',
    v_reaction_counts
  )
  WHERE id = p_post_id AND data IS NOT NULL;

  RETURN v_reaction_counts;
END;
$$;

-- ── community_toggle_save ─────────────────────────────────────
CREATE OR REPLACE FUNCTION community_toggle_save(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_saves BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_saves
    WHERE post_id = p_post_id AND user_id = v_user_id
  ) INTO v_already;

  IF v_already THEN
    DELETE FROM community_saves WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO community_saves (post_id, user_id)
    VALUES (p_post_id, v_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO v_new_saves FROM community_saves WHERE post_id = p_post_id;

  UPDATE community_posts
  SET saves      = v_new_saves,
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('saves', v_new_saves, 'saved', NOT v_already);
END;
$$;

-- ── community_toggle_try ──────────────────────────────────────
CREATE OR REPLACE FUNCTION community_toggle_try(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_tries BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_tries
    WHERE post_id = p_post_id AND user_id = v_user_id
  ) INTO v_already;

  IF v_already THEN
    DELETE FROM community_tries WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO community_tries (post_id, user_id)
    VALUES (p_post_id, v_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO v_new_tries FROM community_tries WHERE post_id = p_post_id;

  UPDATE community_posts
  SET tries      = v_new_tries,
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('tries', v_new_tries, 'tried', NOT v_already);
END;
$$;

-- ── community_toggle_follow ───────────────────────────────────
--
-- Follow or unfollow another user.
-- Returns { following: bool, followers_count: int }.
-- Cannot follow yourself (enforced by table CHECK as well).

CREATE OR REPLACE FUNCTION community_toggle_follow(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_already        BOOLEAN;
  v_follower_count BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_follows
    WHERE follower_id = v_user_id AND following_id = p_target_user_id
  ) INTO v_already;

  IF v_already THEN
    DELETE FROM community_follows
    WHERE follower_id = v_user_id AND following_id = p_target_user_id;
  ELSE
    INSERT INTO community_follows (follower_id, following_id)
    VALUES (v_user_id, p_target_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO v_follower_count
  FROM community_follows WHERE following_id = p_target_user_id;

  RETURN jsonb_build_object(
    'following',       NOT v_already,
    'followers_count', v_follower_count
  );
END;
$$;

-- ── community_add_comment ─────────────────────────────────────
--
-- Insert a comment and return the new row as JSONB.
-- Body is trimmed and capped at 500 chars server-side.

CREATE OR REPLACE FUNCTION community_add_comment(
  p_post_id UUID,
  p_body    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_body    TEXT := LEFT(TRIM(p_body), 500);
  v_id      UUID;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF char_length(v_body) = 0 THEN
    RAISE EXCEPTION 'Comment body cannot be empty';
  END IF;

  -- Verify the post exists and the caller can see it
  IF NOT EXISTS (
    SELECT 1 FROM community_posts p
    WHERE p.id = p_post_id
      AND (
        p.visibility = 'public'
        OR p.user_id = v_user_id
        OR (p.visibility = 'friends' AND EXISTS (
          SELECT 1 FROM community_follows f
          WHERE f.follower_id = v_user_id AND f.following_id = p.user_id
        ))
      )
  ) THEN
    RAISE EXCEPTION 'Post not found or not accessible';
  END IF;

  INSERT INTO community_comments (post_id, user_id, body, created_at, updated_at)
  VALUES (p_post_id, v_user_id, v_body, v_now, v_now)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id',         v_id,
    'post_id',    p_post_id,
    'user_id',    v_user_id,
    'body',       v_body,
    'created_at', v_now,
    'updated_at', v_now
  );
END;
$$;

-- ── community_delete_comment ──────────────────────────────────
--
-- Delete own comment. Post owners can also delete any comment on their post.

CREATE OR REPLACE FUNCTION community_delete_comment(p_comment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_post_id   UUID;
  v_author_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT post_id, user_id INTO v_post_id, v_author_id
  FROM community_comments
  WHERE id = p_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  -- Allow: comment author OR post owner
  IF v_author_id <> v_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM community_posts WHERE id = v_post_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'Not authorised to delete this comment';
    END IF;
  END IF;

  DELETE FROM community_comments WHERE id = p_comment_id;

  RETURN jsonb_build_object('deleted', true, 'comment_id', p_comment_id);
END;
$$;

-- ── community_report_post ─────────────────────────────────────
--
-- File a content report. One per (post, reporter) pair (upsert).

CREATE OR REPLACE FUNCTION community_report_post(
  p_post_id UUID,
  p_reason  TEXT,   -- spam / offensive / misinformation / other
  p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason NOT IN ('spam','offensive','misinformation','other') THEN
    RAISE EXCEPTION 'Invalid report reason: %', p_reason;
  END IF;

  INSERT INTO community_post_reports (post_id, reporter_id, reason, details)
  VALUES (p_post_id, v_user_id, p_reason, LEFT(TRIM(p_details), 500))
  ON CONFLICT (post_id, reporter_id) DO UPDATE
    SET reason     = EXCLUDED.reason,
        details    = EXCLUDED.details,
        created_at = NOW();

  RETURN jsonb_build_object('reported', true);
END;
$$;
