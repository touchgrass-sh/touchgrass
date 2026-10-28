-- touchgrass v1 schema. One owner per deployment, so no user_id columns.

-- Key/value: owner, settings JSON, onboarding/awaiting state, one-off flags.
CREATE TABLE state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Scheduled messages that must only fire once (key = "<kind>:<day>" etc).
CREATE TABLE sent (
  key TEXT PRIMARY KEY,
  ts  INTEGER NOT NULL
);

-- Agent hook events from the CLI.
CREATE TABLE hook_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  agent   TEXT NOT NULL,          -- claude | codex | test
  session TEXT NOT NULL,
  kind    TEXT NOT NULL,          -- start | stop
  ts      INTEGER NOT NULL
);
CREATE INDEX hook_events_session ON hook_events (session, ts);

-- Every nudge sent, and what the owner did with it.
CREATE TABLE nudges (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  day     TEXT NOT NULL,          -- owner's local YYYY-MM-DD
  move    TEXT NOT NULL,
  reps    INTEGER NOT NULL,
  unit    TEXT NOT NULL,          -- reps | sec
  status  TEXT NOT NULL DEFAULT 'sent',  -- sent | done | skipped | snoozed
  session TEXT,
  msg_id  INTEGER
);
CREATE INDEX nudges_day ON nudges (day);

CREATE TABLE meals (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ts     INTEGER NOT NULL,
  day    TEXT NOT NULL,
  label  TEXT NOT NULL,
  kcal   INTEGER,
  items  TEXT,                    -- JSON
  photo  TEXT                     -- Telegram file_id
);
CREATE INDEX meals_day ON meals (day);

CREATE TABLE fasts (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  start INTEGER NOT NULL,
  end   INTEGER
);

CREATE TABLE weights (
  day TEXT PRIMARY KEY,
  kg  REAL NOT NULL,
  ts  INTEGER NOT NULL
);

CREATE TABLE water (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  ts  INTEGER NOT NULL,
  day TEXT NOT NULL,
  ml  INTEGER NOT NULL
);
CREATE INDEX water_day ON water (day);

-- Rough Workers AI usage per day, so we degrade before the free allowance runs out.
CREATE TABLE ai_usage (
  day     TEXT PRIMARY KEY,
  neurons INTEGER NOT NULL DEFAULT 0,
  calls   INTEGER NOT NULL DEFAULT 0
);
