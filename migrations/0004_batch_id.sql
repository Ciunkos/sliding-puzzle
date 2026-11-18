-- The id of the last batch of moves applied to the game, so a retried batch whose first answer was
-- lost is recognised and answered with the stored game instead of "stale". NULL after a single
-- move, a reset or a new game: none of those can be replayed.
ALTER TABLE games ADD COLUMN last_batch_id TEXT;
