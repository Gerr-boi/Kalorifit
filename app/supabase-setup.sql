-- =====================================================
-- KALORIFIT - KOMPLETT DATABASE SETUP
-- =====================================================
-- Kjør denne SQL-koden i Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New Query
-- =====================================================

-- =====================================================
-- DEL 1: SYNC-TABELL (generisk nøkkel-verdi for app-data)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_kv_store (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'user',
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE user_kv_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kv data"
  ON user_kv_store FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kv data"
  ON user_kv_store FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own kv data"
  ON user_kv_store FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own kv data"
  ON user_kv_store FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_kv_store_user_id ON user_kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kv_store_scope ON user_kv_store(scope);

-- =====================================================
-- DEL 2: SPESIFIKKE TABELLER (for fremtidig direkte API-bruk)
-- =====================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  language TEXT DEFAULT 'Norsk',
  notifications_enabled BOOLEAN DEFAULT FALSE,
  meal_reminders JSONB DEFAULT '{"breakfast": false, "breakfastTime": "08:00", "lunch": false, "lunchTime": "12:00", "dinner": false, "dinnerTime": "18:00"}'::JSONB,
  goals JSONB DEFAULT '{"calories": 2000, "protein": 150, "carbs": 250, "fat": 70}'::JSONB,
  privacy_settings JSONB DEFAULT '{"anonymousPosting": false, "hideWeightNumbers": false, "hideBodyPhotos": false}'::JSONB
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  calories_consumed INTEGER DEFAULT 0,
  calories_goal INTEGER DEFAULT 2000,
  protein INTEGER DEFAULT 0,
  carbs INTEGER DEFAULT 0,
  fat INTEGER DEFAULT 0,
  meals JSONB DEFAULT '[]'::JSONB,
  water_glasses INTEGER DEFAULT 0,
  water_ml INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  calories_per_100g INTEGER NOT NULL,
  protein_per_100g NUMERIC(6,2) DEFAULT 0,
  carbs_per_100g NUMERIC(6,2) DEFAULT 0,
  fat_per_100g NUMERIC(6,2) DEFAULT 0,
  serving_size INTEGER DEFAULT 100,
  serving_unit TEXT DEFAULT 'g',
  is_custom BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_initials TEXT,
  author_avatar TEXT,
  kind TEXT NOT NULL DEFAULT 'workout',
  caption TEXT,
  image_url TEXT,
  duration_minutes INTEGER,
  calories INTEGER,
  pr_highlight TEXT,
  streak INTEGER DEFAULT 0,
  visibility TEXT DEFAULT 'public',
  reactions JSONB DEFAULT '{"fire": 0, "strong": 0, "beast": 0, "insane": 0, "watching": 0}'::JSONB,
  saves INTEGER DEFAULT 0,
  tries INTEGER DEFAULT 0,
  recipe_title TEXT,
  recipe_ingredients TEXT[],
  recipe_steps TEXT[],
  recipe_servings INTEGER,
  recipe_prep_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'fire',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS community_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  types TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, challenge_id)
);

-- =====================================================
-- DEL 3: ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users own data" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Daily logs
CREATE POLICY "Users own daily_logs" ON daily_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Check-ins
CREATE POLICY "Users own check_ins" ON check_ins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Challenges
CREATE POLICY "Users own challenges" ON user_challenges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Community posts (public read, own write)
CREATE POLICY "Public can view posts" ON community_posts
  FOR SELECT USING (true);

CREATE POLICY "Users create own posts" ON community_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users edit own posts" ON community_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own posts" ON community_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Reactions
CREATE POLICY "Users own reactions" ON community_reactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Saves
CREATE POLICY "Users own saves" ON community_saves
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Foods (public read for shared foods, own write for custom)
CREATE POLICY "Public foods visible" ON foods
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users create custom foods" ON foods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users edit own foods" ON foods
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- DEL 4: TRIGGERS (auto-oppdater updated_at)
-- =====================================================

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_daily_logs_updated_at ON daily_logs;
DROP TRIGGER IF EXISTS update_posts_updated_at ON community_posts;
DROP TRIGGER IF EXISTS update_foods_updated_at ON foods;
DROP FUNCTION IF EXISTS update_updated_at_column();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_daily_logs_updated_at BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON community_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_foods_updated_at BEFORE UPDATE ON foods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DEL 5: AUTO-OPPDATER PROFIL VED REGISTRERING
-- =====================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- DEL 6: STANDARD MATVARER (norske)
-- =====================================================

INSERT INTO foods (name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_size, serving_unit, is_custom) VALUES
('Egg', 143, 12.6, 0.7, 9.5, 60, 'g', FALSE),
('Kyllingfilet', 165, 31, 0, 3.6, 150, 'g', FALSE),
('Laks', 208, 20, 0, 13, 150, 'g', FALSE),
('Rundstykke', 250, 8, 45, 3, 60, 'g', FALSE),
('Brød (grovt)', 220, 9, 40, 2, 40, 'g', FALSE),
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
('Jordbær', 32, 0.7, 7.7, 0.3, 100, 'g', FALSE),
('Blåbær', 57, 0.7, 14, 0.3, 100, 'g', FALSE),
('Avokado', 160, 2, 8.5, 14.7, 100, 'g', FALSE),
('Mandler', 579, 21, 22, 50, 30, 'g', FALSE),
('Valnøtter', 654, 15, 14, 65, 30, 'g', FALSE),
('Havregryn', 389, 16.9, 66, 6.9, 50, 'g', FALSE),
('Musli', 350, 8, 65, 6, 50, 'g', FALSE),
('Kjøttdeig (karbonadedeig)', 250, 18, 0, 20, 150, 'g', FALSE),
('Kjøttkaker', 280, 15, 8, 21, 100, 'g', FALSE),
('Pølser', 280, 12, 2, 25, 80, 'g', FALSE),
('Fiskepinner', 220, 10, 18, 12, 100, 'g', FALSE),
('Grandiosa', 260, 11, 30, 10, 100, 'g', FALSE),
('Coca-Cola', 42, 0, 10.6, 0, 330, 'ml', FALSE),
('Appelsinjuice', 45, 0.7, 10, 0.2, 200, 'ml', FALSE),
('Kaffe (svart)', 2, 0.3, 0, 0, 200, 'ml', FALSE),
('Te (uten melk)', 1, 0, 0.3, 0, 200, 'ml', FALSE),
('Sjokolade (melk)', 535, 7.7, 59, 30, 25, 'g', FALSE),
('Potetgull', 536, 7, 53, 35, 50, 'g', FALSE),
('Knekkebrød', 380, 10, 70, 5, 10, 'g', FALSE),
('Smør', 717, 0.9, 0.1, 81, 10, 'g', FALSE),
('Syltetøy', 250, 0.3, 62, 0.3, 20, 'g', FALSE),
('Leverpostei', 300, 15, 5, 25, 40, 'g', FALSE),
('Makrell i tomat', 220, 15, 5, 16, 110, 'g', FALSE),
('Tunfisk (hermetisk)', 116, 26, 0, 1, 80, 'g', FALSE),
('Bønner (kidney, hermetisk)', 100, 7, 15, 0.5, 120, 'g', FALSE),
('Erter (hermetisk)', 80, 5, 12, 0.5, 100, 'g', FALSE),
('Mais (hermetisk)', 90, 3, 18, 1, 100, 'g', FALSE),
('Olivenolje', 884, 0, 0, 100, 15, 'ml', FALSE),
('Ketchup', 100, 1, 25, 0, 20, 'ml', FALSE),
('Sennep', 60, 4, 6, 3, 10, 'ml', FALSE),
('Majones', 680, 1, 1, 75, 15, 'ml', FALSE),
('Pesto', 460, 6, 5, 46, 30, 'g', FALSE)
ON CONFLICT DO NOTHING;

-- =====================================================
-- DEL 7: REALTIME (live oppdateringer)
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE daily_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE community_reactions;

-- =====================================================
-- FERDIG! 🎉
-- Kjør hele denne filen i Supabase SQL Editor.
-- =====================================================
