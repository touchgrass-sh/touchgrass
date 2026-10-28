-- sudo pack, Jake parity (2026-10-27): UK food database, exercise, kitchen, daily ticks, waist, GIFs.

-- Where a meal came from (photo | text | barcode | label | suggest | caffeine) and whether it broke the fast
-- (eaten outside the eating window and over ~25 kcal). Drives the window streak and "committed" days.
ALTER TABLE meals ADD COLUMN source TEXT;
ALTER TABLE meals ADD COLUMN outside_window INTEGER NOT NULL DEFAULT 0;

-- Nutrition per 100g. CoFID (UK government food data) is seeded by 0006; barcodes and label photos are
-- saved as src 'off' / 'label' so the next scan works without the network.
CREATE TABLE foods (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp  TEXT,
  kcal REAL NOT NULL, p REAL NOT NULL, f REAL NOT NULL, c REAL NOT NULL, fib REAL,
  src  TEXT NOT NULL DEFAULT 'cofid'
);
CREATE VIRTUAL TABLE foods_fts USING fts5(name, content='foods', content_rowid='rowid');

CREATE TABLE exercise (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  day     TEXT NOT NULL,
  kind    TEXT NOT NULL,          -- skip | burpees
  reps    INTEGER,
  minutes REAL,
  kcal    REAL NOT NULL
);
CREATE INDEX exercise_day ON exercise (day);

-- Food at home (receipt photos, /kitchen add). Meal ideas prefer it.
CREATE TABLE kitchen (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, added TEXT NOT NULL, expires TEXT NOT NULL);

-- Daily tick-offs (habits like an inhaler). One row per item per day.
CREATE TABLE checks (day TEXT NOT NULL, item TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (day, item));

-- Waist in cm, one per day.
CREATE TABLE waist (day TEXT PRIMARY KEY, cm REAL NOT NULL, ts INTEGER NOT NULL);

-- Reaction GIFs the owner forwarded (Telegram file_ids, re-sent, never downloaded). tags = comma list.
CREATE TABLE gifs (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT NOT NULL UNIQUE, tags TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);
