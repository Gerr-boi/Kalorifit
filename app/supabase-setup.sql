-- =====================================================
-- KALORIFIT - DATABASE SETUP
-- =====================================================
-- Kjør denne SQL-koden i Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New Query
-- =====================================================

-- STEG 1: Opprett user_kv_store (generisk nøkkel-verdi tabell for app-data)
-- Denne tabellen synkroniserer all localStorage-data til skyen.
CREATE TABLE IF NOT EXISTS user_kv_store (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'user',  -- 'user' eller 'global'
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- STEG 2: Aktiver Row Level Security (RLS)
ALTER TABLE user_kv_store ENABLE ROW LEVEL SECURITY;

-- STEG 3: RLS-policyer — brukere kan kun lese/skrive egen data
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

-- STEG 4: Indeks for raskere oppslag
CREATE INDEX IF NOT EXISTS idx_user_kv_store_user_id ON user_kv_store(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kv_store_scope ON user_kv_store(scope);

-- =====================================================
-- FERDIG! 🎉
-- Nå kan KaloriFit synkronisere data mellom enheter.
-- =====================================================
