-- One row per finished game, written in the same atomic batch as the finishing move. `version` is
-- the version of the finishing move: versions of a profile's game only grow, so it is unique.
-- duration_ms is server-observed (finished_at - started_at); reported_ms is the active play time
-- the browser reported, clamped to duration_ms, or NULL when it reported none.
CREATE TABLE results (
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  game_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  variant TEXT NOT NULL,
  moves INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  reported_ms INTEGER,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, game_id, version)
);
CREATE INDEX results_best ON results (profile_id, game_id, variant, moves);
