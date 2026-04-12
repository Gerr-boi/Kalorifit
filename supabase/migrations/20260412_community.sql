-- ============================================================
-- Community feature tables  (idempotent — safe to re-run)
-- Assumes community_posts, community_reactions, community_saves
-- already exist with id/post_id as UUID (Supabase default).
-- ============================================================

-- ── Extend existing community_posts ─────────────────────────
-- Add columns that may be missing from the original table.
-- IF NOT EXISTS makes each line safe to re-run.
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS data        JSONB;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS level                TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS goal                 TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS training_style       TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS identity_badge       TEXT;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS equipped_badge_ids   TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_calories        BOOLEAN DEFAULT FALSE;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hide_body_photo      BOOLEAN DEFAULT FALSE;

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public posts visible to all"  ON community_posts;
DROP POLICY IF EXISTS "Users read own posts"          ON community_posts;
DROP POLICY IF EXISTS "Users insert own posts"        ON community_posts;
DROP POLICY IF EXISTS "Users update own posts"        ON community_posts;
DROP POLICY IF EXISTS "Users delete own posts"        ON community_posts;

CREATE POLICY "Public posts visible to all"
  ON community_posts FOR SELECT USING (visibility = 'public');

CREATE POLICY "Users read own posts"
  ON community_posts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own posts"
  ON community_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own posts"
  ON community_posts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own posts"
  ON community_posts FOR DELETE USING (auth.uid() = user_id);

-- ── community_reactions (already exists, fix policies) ───────
-- The existing table uses reaction_type (not reaction).
-- Add a unique constraint on (post_id, user_id) if missing so
-- we can enforce one reaction per user per post.
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

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions"   ON community_reactions;
DROP POLICY IF EXISTS "Users manage own reactions"  ON community_reactions;

CREATE POLICY "Anyone can read reactions"
  ON community_reactions FOR SELECT USING (true);

CREATE POLICY "Users manage own reactions"
  ON community_reactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_saves (already exists, fix policies) ───────────
ALTER TABLE community_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saves"    ON community_saves;
DROP POLICY IF EXISTS "Users manage own saves"  ON community_saves;

CREATE POLICY "Users read own saves"
  ON community_saves FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own saves"
  ON community_saves FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_tries (new) ────────────────────────────────────
-- post_id is UUID to match community_posts.id
CREATE TABLE IF NOT EXISTS community_tries (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE community_tries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own tries"    ON community_tries;
DROP POLICY IF EXISTS "Users manage own tries"  ON community_tries;

CREATE POLICY "Users read own tries"
  ON community_tries FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own tries"
  ON community_tries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_check_ins (new) ────────────────────────────────
CREATE TABLE IF NOT EXISTS community_check_ins (
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key   TEXT   NOT NULL,
  types      TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date_key)
);

ALTER TABLE community_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own check-ins" ON community_check_ins;

CREATE POLICY "Users manage own check-ins"
  ON community_check_ins FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_joined_challenges (new) ────────────────────────
CREATE TABLE IF NOT EXISTS community_joined_challenges (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

ALTER TABLE community_joined_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own challenges" ON community_joined_challenges;

CREATE POLICY "Users manage own challenges"
  ON community_joined_challenges FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SECURITY DEFINER functions for atomic counter updates.
-- Uses reaction_type column (existing schema).
-- Uses DELETE + INSERT to avoid needing ON CONFLICT.
-- ============================================================

CREATE OR REPLACE FUNCTION community_toggle_reaction(
  p_post_id  UUID,
  p_reaction TEXT      -- one of fire/strong/beast/insane/watching, or NULL to remove
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

  SELECT reaction_type INTO v_existing
  FROM community_reactions
  WHERE post_id = p_post_id AND user_id = v_user_id;

  -- Remove existing reaction (always)
  DELETE FROM community_reactions
  WHERE post_id = p_post_id AND user_id = v_user_id;

  -- Insert new reaction unless it matches the existing one (toggle off) or is NULL
  IF p_reaction IS NOT NULL AND p_reaction IS DISTINCT FROM v_existing THEN
    INSERT INTO community_reactions (post_id, user_id, reaction_type)
    VALUES (p_post_id, v_user_id, p_reaction);
  END IF;

  -- Recompute counts
  SELECT jsonb_build_object(
    'fire',    COUNT(*) FILTER (WHERE reaction_type = 'fire'),
    'strong',  COUNT(*) FILTER (WHERE reaction_type = 'strong'),
    'beast',   COUNT(*) FILTER (WHERE reaction_type = 'beast'),
    'insane',  COUNT(*) FILTER (WHERE reaction_type = 'insane'),
    'watching',COUNT(*) FILTER (WHERE reaction_type = 'watching')
  ) INTO v_reaction_counts
  FROM community_reactions
  WHERE post_id = p_post_id;

  -- Write back to denormalised reactions field
  UPDATE community_posts
  SET reactions  = v_reaction_counts,
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN v_reaction_counts;
END;
$$;

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
    INSERT INTO community_saves (post_id, user_id) VALUES (p_post_id, v_user_id)
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
    INSERT INTO community_tries (post_id, user_id) VALUES (p_post_id, v_user_id)
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
