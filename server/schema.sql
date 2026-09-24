-- Esquema idempotente: se ejecuta en cada arranque del servidor.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  api_key_enc   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id          SERIAL PRIMARY KEY,
  owner_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  short_name  TEXT,
  color       TEXT NOT NULL DEFAULT '#2563eb',
  logo_url    TEXT,
  coach       TEXT,
  city        TEXT,
  stadium     TEXT,
  notes       TEXT NOT NULL DEFAULT '',
  external_id INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, external_id)
);

CREATE TABLE IF NOT EXISTS players (
  id          SERIAL PRIMARY KEY,
  team_id     INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  owner_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  number      INT,
  position    TEXT NOT NULL DEFAULT 'M' CHECK (position IN ('G','D','M','F')),
  photo_url   TEXT,
  notes       TEXT NOT NULL DEFAULT '',
  external_id INT,
  UNIQUE (team_id, external_id)
);
CREATE INDEX IF NOT EXISTS players_team_idx ON players(team_id);

CREATE TABLE IF NOT EXISTS matches (
  id               SERIAL PRIMARY KEY,
  owner_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  home_team_id     INT REFERENCES teams(id) ON DELETE SET NULL,
  away_team_id     INT REFERENCES teams(id) ON DELETE SET NULL,
  home_name        TEXT NOT NULL,
  away_name        TEXT NOT NULL,
  home_color       TEXT NOT NULL DEFAULT '#2563eb',
  away_color       TEXT NOT NULL DEFAULT '#dc2626',
  home_formation   TEXT NOT NULL DEFAULT '4-4-2',
  away_formation   TEXT NOT NULL DEFAULT '4-4-2',
  competition      TEXT NOT NULL DEFAULT '',
  venue            TEXT NOT NULL DEFAULT '',
  kickoff_at       TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  period           TEXT NOT NULL DEFAULT 'PRE',
  clock_seconds    INT NOT NULL DEFAULT 0,
  clock_started_at TIMESTAMPTZ,
  home_score       INT NOT NULL DEFAULT 0,
  away_score       INT NOT NULL DEFAULT 0,
  prematch_notes   TEXT NOT NULL DEFAULT '',
  summary          TEXT NOT NULL DEFAULT '',
  external_id      INT,
  league_ext_id    INT,
  season           INT,
  home_ext_id      INT,
  away_ext_id      INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_owner_idx ON matches(owner_id, kickoff_at DESC);

CREATE TABLE IF NOT EXISTS match_members (
  match_id INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id  INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS match_members_user_idx ON match_members(user_id);

CREATE TABLE IF NOT EXISTS match_players (
  id         SERIAL PRIMARY KEY,
  match_id   INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side       TEXT NOT NULL CHECK (side IN ('home','away')),
  player_id  INT REFERENCES players(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  number     INT,
  position   TEXT NOT NULL DEFAULT 'M' CHECK (position IN ('G','D','M','F')),
  is_starter BOOLEAN NOT NULL DEFAULT false,
  on_pitch   BOOLEAN NOT NULL DEFAULT false,
  x          REAL,
  y          REAL,
  notes      TEXT NOT NULL DEFAULT '',
  yellows    INT NOT NULL DEFAULT 0,
  red        BOOLEAN NOT NULL DEFAULT false,
  goals      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS match_players_match_idx ON match_players(match_id);

CREATE TABLE IF NOT EXISTS match_events (
  id                  SERIAL PRIMARY KEY,
  match_id            INT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  side                TEXT CHECK (side IN ('home','away')),
  match_player_id     INT,
  minute_label        TEXT NOT NULL DEFAULT '',
  period              TEXT,
  clock_seconds       INT NOT NULL DEFAULT 0,
  player_name         TEXT,
  related_player_name TEXT,
  description         TEXT NOT NULL DEFAULT '',
  created_by          INT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_events_match_idx ON match_events(match_id);

CREATE TABLE IF NOT EXISTS phrases (
  id         SERIAL PRIMARY KEY,
  owner_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL DEFAULT 'otras',
  text       TEXT NOT NULL,
  favorite   BOOLEAN NOT NULL DEFAULT false,
  uses       INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phrases_owner_idx ON phrases(owner_id);

CREATE TABLE IF NOT EXISTS notes (
  id         SERIAL PRIMARY KEY,
  owner_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   INT REFERENCES matches(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  pinned     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_owner_idx ON notes(owner_id);
