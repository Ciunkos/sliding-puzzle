CREATE TABLE games (
  profile_id INTEGER PRIMARY KEY REFERENCES profiles(id),
  board TEXT NOT NULL,
  initial TEXT NOT NULL,
  moves INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
