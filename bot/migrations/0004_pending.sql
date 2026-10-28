-- sudo pack: a meal estimate waiting for ✅ Log it / ✏️ Fix / ❌ (like Jake). data = JSON Proposal (food.ts).
CREATE TABLE pending (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   INTEGER NOT NULL,
  data TEXT NOT NULL
);
