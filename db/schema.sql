CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_goals (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, calories INTEGER NOT NULL DEFAULT 2000, protein NUMERIC(8,2) NOT NULL DEFAULT 150, carbs NUMERIC(8,2) NOT NULL DEFAULT 200, fat NUMERIC(8,2) NOT NULL DEFAULT 65, fiber NUMERIC(8,2) NOT NULL DEFAULT 25, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS foods (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, calories NUMERIC(10,2) NOT NULL DEFAULT 0, protein NUMERIC(10,2) NOT NULL DEFAULT 0, carbs NUMERIC(10,2) NOT NULL DEFAULT 0, fat NUMERIC(10,2) NOT NULL DEFAULT 0, fiber NUMERIC(10,2) NOT NULL DEFAULT 0, serving_size TEXT NOT NULL DEFAULT '1 serving', serving_amount NUMERIC(10,2) NOT NULL DEFAULT 1, serving_unit TEXT NOT NULL DEFAULT 'serving', source TEXT NOT NULL DEFAULT 'custom', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE foods ADD COLUMN IF NOT EXISTS serving_amount NUMERIC(10,2) NOT NULL DEFAULT 1;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS serving_unit TEXT NOT NULL DEFAULT 'serving';
CREATE INDEX IF NOT EXISTS foods_user_id_idx ON foods(user_id);
CREATE TABLE IF NOT EXISTS meals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, calories NUMERIC(10,2) NOT NULL DEFAULT 0, protein NUMERIC(10,2) NOT NULL DEFAULT 0, carbs NUMERIC(10,2) NOT NULL DEFAULT 0, fat NUMERIC(10,2) NOT NULL DEFAULT 0, fiber NUMERIC(10,2) NOT NULL DEFAULT 0, foods JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS meals_user_id_idx ON meals(user_id);
CREATE TABLE IF NOT EXISTS log_entries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, entry_type TEXT NOT NULL CHECK (entry_type IN ('food','meal')), name TEXT NOT NULL, calories NUMERIC(10,2) NOT NULL DEFAULT 0, protein NUMERIC(10,2) NOT NULL DEFAULT 0, carbs NUMERIC(10,2) NOT NULL DEFAULT 0, fat NUMERIC(10,2) NOT NULL DEFAULT 0, fiber NUMERIC(10,2) NOT NULL DEFAULT 0, foods JSONB, quantity NUMERIC(10,2) NOT NULL DEFAULT 1, consumed_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE log_entries ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2) NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS log_entries_user_date_idx ON log_entries(user_id, consumed_at DESC);

CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  security TEXT NOT NULL DEFAULT 'starttls' CHECK (security IN ('starttls','ssl','none')),
  username TEXT NOT NULL DEFAULT '',
  password_encrypted TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'NutriLog',
  public_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS health_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age INTEGER,
  sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('male','female','unspecified')),
  height_cm NUMERIC(6,2),
  current_weight_kg NUMERIC(8,2),
  goal_weight_kg NUMERIC(8,2),
  activity_level TEXT NOT NULL DEFAULT 'moderately_active' CHECK (activity_level IN ('sedentary','lightly_active','moderately_active','very_active','extremely_active')),
  goal_type TEXT NOT NULL DEFAULT 'maintain' CHECK (goal_type IN ('maintain','lose','gain')),
  desired_rate_lbs NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, duration_minutes NUMERIC(8,2) NOT NULL DEFAULT 0,
  intensity TEXT NOT NULL DEFAULT 'moderate' CHECK (intensity IN ('light','moderate','vigorous')),
  calories_burned NUMERIC(10,2) NOT NULL DEFAULT 0,
  calories_source TEXT NOT NULL DEFAULT 'estimated' CHECK (calories_source IN ('estimated','manual','device')),
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE, notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activities_user_date_idx ON activities(user_id, activity_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(8,2) NOT NULL, recorded_at DATE NOT NULL DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS weight_entries_user_date_idx ON weight_entries(user_id, recorded_at DESC, created_at DESC);


CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'green',
  mode TEXT NOT NULL DEFAULT 'light',
  accent_color TEXT NOT NULL DEFAULT '#6B9080',
  tracker_layout JSONB NOT NULL DEFAULT '{}'::jsonb,
  tab_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_user_id <> recipient_user_id),
  UNIQUE (requester_user_id, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS connections_recipient_status_idx ON connections(recipient_user_id, status);
CREATE INDEX IF NOT EXISTS connections_requester_status_idx ON connections(requester_user_id, status);

CREATE TABLE IF NOT EXISTS progress_sharing (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  share_calories BOOLEAN NOT NULL DEFAULT FALSE,
  share_macros BOOLEAN NOT NULL DEFAULT FALSE,
  share_weight BOOLEAN NOT NULL DEFAULT FALSE,
  share_weight_history BOOLEAN NOT NULL DEFAULT FALSE,
  share_activity BOOLEAN NOT NULL DEFAULT FALSE,
  share_goals BOOLEAN NOT NULL DEFAULT FALSE,
  share_charts BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
