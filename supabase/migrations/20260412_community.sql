-- ============================================================
-- Community feature tables  (idempotent — safe to re-run)
-- Run this in your Supabase SQL editor or via the CLI:
--   supabase db push
-- ============================================================

-- ── community_posts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_posts (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility  TEXT        NOT NULL DEFAULT 'public'
                          CHECK (visibility IN ('public', 'friends', 'private')),
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at  ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user_id     ON community_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility  ON community_posts (visibility);

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

-- ── community_reactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_reactions (
  post_id   TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  reaction  TEXT NOT NULL CHECK (reaction IN ('fire','strong','beast','insane','watching')),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reactions"   ON community_reactions;
DROP POLICY IF EXISTS "Users manage own reactions"  ON community_reactions;

CREATE POLICY "Anyone can read reactions"
  ON community_reactions FOR SELECT USING (true);

CREATE POLICY "Users manage own reactions"
  ON community_reactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_saves ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_saves (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE community_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own saves"    ON community_saves;
DROP POLICY IF EXISTS "Users manage own saves"  ON community_saves;

CREATE POLICY "Users read own saves"
  ON community_saves FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own saves"
  ON community_saves FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── community_tries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_tries (
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
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

-- ── community_check_ins ──────────────────────────────────────
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

-- ── community_joined_challenges ──────────────────────────────
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
-- Use CREATE OR REPLACE so re-runs are safe.
-- ============================================================

CREATE OR REPLACE FUNCTION community_toggle_reaction(
  p_post_id  TEXT,
  p_reaction TEXT
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

  SELECT reaction INTO v_existing
  FROM community_reactions
  WHERE post_id = p_post_id AND user_id = v_user_id;

  IF p_reaction IS NULL OR v_existing = p_reaction THEN
    DELETE FROM community_reactions
    WHERE post_id = p_post_id AND user_id = v_user_id;
  ELSE
    INSERT INTO community_reactions (post_id, user_id, reaction)
    VALUES (p_post_id, v_user_id, p_reaction)
    ON CONFLICT (post_id, user_id)
    DO UPDATE SET reaction = EXCLUDED.reaction;
  END IF;

  SELECT jsonb_build_object(
    'fire',    COUNT(*) FILTER (WHERE reaction = 'fire'),
    'strong',  COUNT(*) FILTER (WHERE reaction = 'strong'),
    'beast',   COUNT(*) FILTER (WHERE reaction = 'beast'),
    'insane',  COUNT(*) FILTER (WHERE reaction = 'insane'),
    'watching',COUNT(*) FILTER (WHERE reaction = 'watching')
  ) INTO v_reaction_counts
  FROM community_reactions
  WHERE post_id = p_post_id;

  UPDATE community_posts
  SET data       = jsonb_set(data, '{reactions}', v_reaction_counts),
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN v_reaction_counts;
END;
$$;

CREATE OR REPLACE FUNCTION community_toggle_save(p_post_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_saves INT;
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
  SET data       = jsonb_set(data, '{saves}', to_jsonb(v_new_saves)),
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('saves', v_new_saves, 'saved', NOT v_already);
END;
$$;

CREATE OR REPLACE FUNCTION community_toggle_try(p_post_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_already   BOOLEAN;
  v_new_tries INT;
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
  SET data       = jsonb_set(data, '{tries}', to_jsonb(v_new_tries)),
      updated_at = NOW()
  WHERE id = p_post_id;

  RETURN jsonb_build_object('tries', v_new_tries, 'tried', NOT v_already);
END;
$$;
