-- The score a game's definition gave the finished game (GameDefinition.score), or NULL for a game
-- that does not score. Games ranked by highest score list their results by it.
ALTER TABLE results ADD COLUMN score INTEGER;
