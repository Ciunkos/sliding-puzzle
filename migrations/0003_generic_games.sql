-- One saved game per profile per game id. state and initial are JSON, validated by the game's
-- definition on every read. No production data existed, so the old table is dropped.
DROP TABLE games;
CREATE TABLE games (
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  game_id TEXT NOT NULL,
  state TEXT NOT NULL,
  initial TEXT NOT NULL,
  moves INTEGER NOT NULL,
  finished INTEGER NOT NULL,
  version INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, game_id)
);
