import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc, { type AsyncCommand } from 'fast-check';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { interleavingDb } from '../test-support/interleaving-db.ts';
import { createTestProfile } from '../test-support/profiles.ts';
import {
  ALWAYS_HIGH,
  ALWAYS_LOW,
  contextRecordingTally,
  playTallyGames,
  type TallyMove,
  type TallyOptions,
  type TallyState,
  tallyGame,
} from '../test-support/tally-game.ts';
import type { MoveContext } from './index.ts';
import { createGameService, type GameService, InvalidStartStateError } from './service.ts';

type TallyService = GameService<TallyState, TallyMove, TallyOptions>;

let batches = 0;
/** One move sent as a batch of one, each under its own batch id, so a repeat is never a replay. */
function move(service: TallyService, id: number, add: number, baseVersion: number) {
  batches += 1;
  const batchId = `one-move-${String(batches)}`;
  return service.applyMoves(id, { baseVersion, batchId, moves: [{ add }] });
}

const LATER = new Date('2026-01-01T00:05:00.000Z');
const AT_MIDNIGHT = { random: ALWAYS_LOW, now: fixedNow };
const FIVE_MINUTES_LATER = { random: ALWAYS_LOW, now: () => LATER };

/** A fresh database with one profile, Ada, and the tally game service over it. */
async function setup() {
  const db = await openTestDb();
  const ada = await createTestProfile(db, 'Ada');
  const service = createGameService(db, tallyGame, AT_MIDNIGHT);
  return { db, id: ada.id, service };
}

describe('the game service', () => {
  test('starting a game saves version 1 with no moves and the start time', async () => {
    // Given a profile without a game
    const { service, id } = await setup();

    // When a game to 5 starts
    const game = await service.start(id, { target: 5 });

    // Then it is the first version, started now
    assert.deepEqual(game, {
      state: { count: 0, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('the start state comes from the injected random', async () => {
    const db = await openTestDb();
    const ada = await createTestProfile(db, 'Ada');
    const service = createGameService(db, tallyGame, { random: ALWAYS_HIGH, now: fixedNow });

    const game = await service.start(ada.id, { target: 5 });

    assert.deepEqual(game.state, { count: 1, target: 5 });
  });

  test('starting again replaces the game and keeps raising the version', async () => {
    // Given a game at version 2
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await move(service, id, 2, 1);

    // When a new game to 7 starts
    await service.start(id, { target: 7 });

    // Then the stored game is the new one, one version later
    assert.deepEqual(await service.get(id), {
      state: { count: 0, target: 7 },
      initial: { count: 0, target: 7 },
      moves: 0,
      finished: false,
      version: 3,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a legal move updates the state and counts one move and one version', async () => {
    // Given a new game at 0
    const { service, id } = await setup();
    await service.start(id, { target: 5 });

    // When 2 is added
    const result = await move(service, id, 2, 1);

    // Then the count is 2 after one move, and that is what get returns too
    const MOVED = {
      state: { count: 2, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 1,
      finished: false,
      version: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(result, { ok: true, game: MOVED });
    assert.deepEqual(await service.get(id), MOVED);
  });

  test('a move that reaches the target finishes the game at the time of the move', async () => {
    // Given a game to 2 started at midnight
    const { db, service, id } = await setup();
    await service.start(id, { target: 2 });
    const fiveMinutesLater = createGameService(db, tallyGame, FIVE_MINUTES_LATER);

    // When 2 is added five minutes later
    const result = await move(fiveMinutesLater, id, 2, 1);

    // Then the game is finished at that moment
    assert.deepEqual(result, {
      ok: true,
      game: {
        state: { count: 2, target: 2 },
        initial: { count: 0, target: 2 },
        moves: 1,
        finished: true,
        version: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:05:00.000Z',
      },
    });
  });

  test('reset restores the initial state, clears the moves and raises the version', async () => {
    // Given a game to 5 with one move
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await move(service, id, 2, 1);

    // When it is reset
    const result = await service.reset(id, 2);

    // Then it is back at the start, one version later
    assert.deepEqual(result, {
      ok: true,
      game: {
        state: { count: 0, target: 5 },
        initial: { count: 0, target: 5 },
        moves: 0,
        finished: false,
        version: 3,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a finished game cannot be reset: a known solution must not be replayed for a better result', async () => {
    // Given a game to 2 that one move has finished
    const { service, id } = await setup();
    await service.start(id, { target: 2 });
    await move(service, id, 2, 1);

    // When it is reset
    const result = await service.reset(id, 2);

    // Then the reset is refused with the finished game, which stays as it is
    const FINISHED = {
      state: { count: 2, target: 2 },
      initial: { count: 0, target: 2 },
      moves: 1,
      finished: true,
      version: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
    };
    assert.deepEqual(result, { ok: false, reason: 'already-finished', game: FINISHED });
    assert.deepEqual(await service.get(id), FINISHED);
  });

  test('a move or a reset without a game answers no-game', async () => {
    const { service, id } = await setup();

    assert.deepEqual(await move(service, id, 1, 1), { ok: false, reason: 'no-game' });
    assert.deepEqual(await service.reset(id, 1), { ok: false, reason: 'no-game' });
  });

  test('startWith starts from an acceptable chosen state', async () => {
    const { service, id } = await setup();

    const game = await service.startWith(id, { count: 4, target: 5 });

    assert.deepEqual(game, {
      state: { count: 4, target: 5 },
      initial: { count: 4, target: 5 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('startWith rejects a finished state and a state outside the schema, and stores nothing', async () => {
    // Given a profile without a game (the tally game has no isValidStart of its own)
    const { service, id } = await setup();

    // When it tries to start from a finished state, then from a negative count
    await assert.rejects(service.startWith(id, { count: 5, target: 5 }), InvalidStartStateError);
    await assert.rejects(service.startWith(id, { count: -1, target: 5 }), InvalidStartStateError);

    // Then there is still no game
    assert.equal(await service.get(id), undefined);
  });

  test('a stored game that does not match the state schema is rejected, not returned', async () => {
    // Given a saved game whose state was corrupted in the database
    const { db, service, id } = await setup();
    await service.start(id, { target: 5 });
    await db.run('UPDATE games SET state = ?', ['{"count":"many"}']);

    // When it is read, then reading fails
    await assert.rejects(service.get(id), { name: 'ZodError' });
  });

  test('the games of two profiles are independent', async () => {
    // Given Ada and Bob each with a new game
    const { db, service, id } = await setup();
    const bob = await createTestProfile(db, 'Bob');
    await service.start(id, { target: 5 });
    await service.start(bob.id, { target: 5 });

    // When Ada moves
    await move(service, id, 3, 1);

    // Then Bob's game is untouched
    const game = await service.get(bob.id);
    assert.ok(game);
    assert.deepEqual(game.state, { count: 0, target: 5 });
  });

  test('two games of one profile are independent', async () => {
    // Given Ada with a tally game and a second game with another id
    const { db, service, id } = await setup();
    const other = createGameService(db, { ...tallyGame, id: 'other' }, AT_MIDNIGHT);
    await service.start(id, { target: 5 });
    await other.start(id, { target: 5 });

    // When she moves in the tally game
    await move(service, id, 3, 1);

    // Then the other game is untouched
    const game = await other.get(id);
    assert.ok(game);
    assert.deepEqual(game.state, { count: 0, target: 5 });
  });

  test('repeating a move with the same base version is stale and counts the move once', async () => {
    // Given a game to 2 that a move from version 1 has finished
    const { service, id } = await setup();
    await service.start(id, { target: 2 });
    await move(service, id, 2, 1);

    // When the same request arrives again (a network retry, a second tab)
    const result = await move(service, id, 2, 1);

    // Then it is stale, not already finished, and carries the stored game, which is untouched
    const FINISHED = {
      state: { count: 2, target: 2 },
      initial: { count: 0, target: 2 },
      moves: 1,
      finished: true,
      version: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:00.000Z',
    };
    assert.deepEqual(result, { ok: false, reason: 'stale', game: FINISHED });
    assert.deepEqual(await service.get(id), FINISHED);
  });

  test('a reset from an outdated version is stale and leaves the game untouched', async () => {
    // Given a game at version 2
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await move(service, id, 3, 1);

    // When a reset made on version 1 arrives
    const result = await service.reset(id, 1);

    // Then it is stale and the move is kept
    assert.deepEqual(result, {
      ok: false,
      reason: 'stale',
      game: {
        state: { count: 3, target: 5 },
        initial: { count: 0, target: 5 },
        moves: 1,
        finished: false,
        version: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a move racing a new game is stale and the new game is untouched', async () => {
    // Given a game at 2, version 2
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await move(service, id, 2, 1);

    // When a move on version 2 and a new game to 9 run at the same time (the move reads first)
    const [result] = await Promise.all([move(service, id, 1, 2), service.start(id, { target: 9 })]);

    // Then the move is stale and the stored game is the new one, without moves
    const NEW_GAME = {
      state: { count: 0, target: 9 },
      initial: { count: 0, target: 9 },
      moves: 0,
      finished: false,
      version: 3,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(result, { ok: false, reason: 'stale', game: NEW_GAME });
    assert.deepEqual(await service.get(id), NEW_GAME);
  });

  test('of two moves from the same version at the same time, one applies and one is stale', async () => {
    // Given a new game at version 1
    const { service, id } = await setup();
    await service.start(id, { target: 9 });

    // When 1 and 2 are added from version 1 at the same time
    const first = move(service, id, 1, 1);
    const results = await Promise.all([first, move(service, id, 2, 1)]);

    // Then the first is applied and the second is told about it
    const AFTER_FIRST = {
      state: { count: 1, target: 9 },
      initial: { count: 0, target: 9 },
      moves: 1,
      finished: false,
      version: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(results, [
      { ok: true, game: AFTER_FIRST },
      { ok: false, reason: 'stale', game: AFTER_FIRST },
    ]);
  });

  test('resume keeps an existing game as it is', async () => {
    // Given a game to 5 with one move
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await move(service, id, 3, 1);

    // When the profile resumes with other options
    const resumed = await service.resume(id, { target: 9 });

    // Then it gets the existing game, not a new one
    assert.deepEqual(resumed, {
      created: false,
      game: {
        state: { count: 3, target: 5 },
        initial: { count: 0, target: 5 },
        moves: 1,
        finished: false,
        version: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('two resumes at the same time for a new profile create one game', async () => {
    // Given a profile without a game
    const { service, id } = await setup();

    // When it resumes twice at the same time (React StrictMode runs the effect twice)
    const results = await Promise.all([
      service.resume(id, { target: 4 }),
      service.resume(id, { target: 4 }),
    ]);

    // Then the first created version 1 and the second got that same game
    const CREATED = {
      state: { count: 0, target: 4 },
      initial: { count: 0, target: 4 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(results, [
      { created: true, game: CREATED },
      { created: false, game: CREATED },
    ]);
  });
});

const AT_FIVE = '2026-01-01T00:05:00.000Z';
const BATCH = { baseVersion: 1, batchId: 'batch-one', moves: [{ add: 1 }, { add: 2 }] };

/** Ada's game to `target`, started at midnight, and a service on a clock five minutes later. */
async function startedAtMidnight(target: number) {
  const { db, service, id } = await setup();
  await service.start(id, { target });
  const later = createGameService(db, tallyGame, FIVE_MINUTES_LATER);
  return { service, later, id };
}

describe('a batch of moves', () => {
  test('a legal batch on the stored version applies every move and counts each as a version', async () => {
    // Given a new game to 9 at version 1
    const { service, id } = await setup();
    await service.start(id, { target: 9 });

    // When 1 and 2 are added in one batch
    const result = await service.applyMoves(id, BATCH);

    // Then both count: 3 after two moves, at version 3
    assert.deepEqual(result, {
      ok: true,
      game: {
        state: { count: 3, target: 9 },
        initial: { count: 0, target: 9 },
        moves: 2,
        finished: false,
        version: 3,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a batch with one illegal move applies none of them and answers with the stored game', async () => {
    // Given a new game to 9
    const { service, id } = await setup();
    await service.start(id, { target: 9 });

    // When the illegal 4, then 1, are added in one batch
    const result = await service.applyMoves(id, { ...BATCH, moves: [{ add: 4 }, { add: 1 }] });

    // Then nothing changed and the answer carries the untouched game
    const UNTOUCHED = {
      state: { count: 0, target: 9 },
      initial: { count: 0, target: 9 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(result, { ok: false, reason: 'illegal-move', game: UNTOUCHED });
    assert.deepEqual(await service.get(id), UNTOUCHED);
  });

  test('the same batch again after it was applied is a replay answered with the stored game', async () => {
    // Given a batch that was applied, but whose answer was lost
    const { service, id } = await setup();
    await service.start(id, { target: 9 });
    await service.applyMoves(id, BATCH);

    // When the browser retries it with the same batch id
    const result = await service.applyMoves(id, BATCH);

    // Then it is acknowledged with the stored game, and the moves count once
    const APPLIED_ONCE = {
      state: { count: 3, target: 9 },
      initial: { count: 0, target: 9 },
      moves: 2,
      finished: false,
      version: 3,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    };
    assert.deepEqual(result, { ok: true, game: APPLIED_ONCE });
    assert.deepEqual(await service.get(id), APPLIED_ONCE);
  });

  test('another batch on a version that has moved on is stale', async () => {
    // Given a batch applied on version 1
    const { service, id } = await setup();
    await service.start(id, { target: 9 });
    await service.applyMoves(id, BATCH);

    // When another batch made on version 1 arrives (a second tab)
    const result = await service.applyMoves(id, { ...BATCH, batchId: 'batch-two' });

    // Then it is stale and carries the stored game
    assert.deepEqual(result, {
      ok: false,
      reason: 'stale',
      game: {
        state: { count: 3, target: 9 },
        initial: { count: 0, target: 9 },
        moves: 2,
        finished: false,
        version: 3,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a replay after a reset is stale: a reset forgets the last batch', async () => {
    // Given a batch applied on version 1, then a reset
    const { service, id } = await setup();
    await service.start(id, { target: 9 });
    await service.applyMoves(id, BATCH);
    await service.reset(id, 3);

    // When the batch is retried
    const result = await service.applyMoves(id, BATCH);

    // Then it is stale against the reset game
    assert.partialDeepStrictEqual(result, { ok: false, reason: 'stale' });
  });

  test('a move after the finishing move makes the whole batch illegal', async () => {
    // Given a game to 2
    const { service, id } = await setup();
    await service.start(id, { target: 2 });

    // When 2 (finishing) and then 1 are added in one batch
    const result = await service.applyMoves(id, { ...BATCH, moves: [{ add: 2 }, { add: 1 }] });

    // Then nothing is applied
    assert.deepEqual(result, {
      ok: false,
      reason: 'illegal-move',
      game: {
        state: { count: 0, target: 2 },
        initial: { count: 0, target: 2 },
        moves: 0,
        finished: false,
        version: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a batch on a finished game is already finished and carries the game', async () => {
    const { service, id } = await setup();
    await service.start(id, { target: 1 });
    await service.applyMoves(id, { ...BATCH, moves: [{ add: 1 }] });

    const result = await service.applyMoves(id, { ...BATCH, baseVersion: 2, batchId: 'batch-two' });

    assert.partialDeepStrictEqual(result, { ok: false, reason: 'already-finished' });
  });

  test('a batch without a game answers no-game', async () => {
    const { service, id } = await setup();

    assert.deepEqual(await service.applyMoves(id, BATCH), { ok: false, reason: 'no-game' });
  });

  test('apply gets the service clock and randomness as its context', async () => {
    // Given a game whose apply records its context, on a service five minutes after midnight
    const { db, id } = await setup();
    const seen: (MoveContext | undefined)[] = [];
    const service = createGameService(db, contextRecordingTally(seen), FIVE_MINUTES_LATER);
    await service.start(id, { target: 9 });

    // When one move is applied
    await service.applyMoves(id, { ...BATCH, moves: [{ add: 1 }] });

    // Then apply saw that clock and that random
    assert.deepEqual(seen, [{ now: LATER, random: ALWAYS_LOW }]);
  });

  test('reset starts the clock of the game again', async () => {
    const { later, id } = await startedAtMidnight(5);

    const result = await later.reset(id, 1);

    assert.partialDeepStrictEqual(result, { ok: true, game: { startedAt: AT_FIVE } });
  });
});

describe('the best results', () => {
  test('a finishing batch stores a result with the server time and the reported time clamped to it', async () => {
    // Given a game to 3 started at midnight
    const { later, id } = await startedAtMidnight(3);

    // When it is finished five minutes later, the browser claiming seven minutes of play
    await later.applyMoves(id, { ...BATCH, moves: [{ add: 3 }], elapsedMs: 420_000 });

    // Then the result has the five minutes the server saw, for both times
    assert.deepEqual(await later.results(id), [
      {
        variant: 'to 3',
        moves: 1,
        durationMs: 300_000,
        reportedMs: 300_000,
        finishedAt: '2026-01-01T00:05:00.000Z',
      },
    ]);
  });

  test('a game whose definition names no variant is of the default variant', async () => {
    const { db, id } = await setup();
    const plain = createGameService(db, { ...tallyGame, variant: undefined }, AT_MIDNIGHT);
    await plain.start(id, { target: 1 });

    await plain.applyMoves(id, { ...BATCH, moves: [{ add: 1 }] });

    assert.partialDeepStrictEqual(await plain.results(id), [{ variant: 'default' }]);
  });

  test('a game finished without a reported time stores the server time alone', async () => {
    const { later, id } = await startedAtMidnight(3);

    await move(later, id, 3, 1);

    assert.deepEqual(await later.results(id), [
      {
        variant: 'to 3',
        moves: 1,
        durationMs: 300_000,
        reportedMs: null,
        finishedAt: '2026-01-01T00:05:00.000Z',
      },
    ]);
  });

  test('results are grouped by variant, fewest moves first, then the shortest time', async () => {
    // Given games to 3 in one move (90 s and 60 s), in two moves, and a game to 2
    const { service, later, id } = await startedAtMidnight(3);
    await playTallyGames(service, later, id, [
      { target: 3, adds: [1, 2], elapsedMs: 10_000 },
      { target: 3, adds: [3], elapsedMs: 90_000 },
      { target: 2, adds: [2], elapsedMs: 5_000 },
      { target: 3, adds: [3], elapsedMs: 60_000 },
    ]);

    // When the results are listed
    const results = await service.results(id);

    // Then each variant lists its best first
    assert.deepEqual(results, [
      { variant: 'to 2', moves: 1, durationMs: 300_000, reportedMs: 5_000, finishedAt: AT_FIVE },
      { variant: 'to 3', moves: 1, durationMs: 300_000, reportedMs: 60_000, finishedAt: AT_FIVE },
      { variant: 'to 3', moves: 1, durationMs: 300_000, reportedMs: 90_000, finishedAt: AT_FIVE },
      { variant: 'to 3', moves: 2, durationMs: 300_000, reportedMs: 10_000, finishedAt: AT_FIVE },
    ]);
  });

  test('only the best five results of a variant are listed', async () => {
    const { service, later, id } = await startedAtMidnight(1);
    await playTallyGames(service, later, id, [
      { target: 1, adds: [1], elapsedMs: 6 },
      { target: 1, adds: [1], elapsedMs: 5 },
      { target: 1, adds: [1], elapsedMs: 4 },
      { target: 1, adds: [1], elapsedMs: 3 },
      { target: 1, adds: [1], elapsedMs: 2 },
      { target: 1, adds: [1], elapsedMs: 1 },
    ]);

    const results = await service.results(id);

    assert.deepEqual(results, [
      { variant: 'to 1', moves: 1, durationMs: 300_000, reportedMs: 1, finishedAt: AT_FIVE },
      { variant: 'to 1', moves: 1, durationMs: 300_000, reportedMs: 2, finishedAt: AT_FIVE },
      { variant: 'to 1', moves: 1, durationMs: 300_000, reportedMs: 3, finishedAt: AT_FIVE },
      { variant: 'to 1', moves: 1, durationMs: 300_000, reportedMs: 4, finishedAt: AT_FIVE },
      { variant: 'to 1', moves: 1, durationMs: 300_000, reportedMs: 5, finishedAt: AT_FIVE },
    ]);
  });

  test('a finishing batch wins even when another write lands right after it', async () => {
    // Given a game to 3, and another tab that resets the game right after the next batch commits
    const { db, id } = await setup();
    const shared = interleavingDb(db);
    const here = createGameService(shared, tallyGame, AT_MIDNIGHT);
    await here.start(id, { target: 3 });
    shared.afterNextBatch(() => createGameService(db, tallyGame, AT_MIDNIGHT).reset(id, 2));

    // When the finishing batch is sent
    const result = await here.applyMoves(id, { ...BATCH, moves: [{ add: 3 }], elapsedMs: 0 });

    // Then it is answered as applied: its result row was written with it
    assert.partialDeepStrictEqual(result, { ok: true, game: { finished: true, version: 2 } });
  });

  test('of two finishing batches at the same time, one wins and only its result is stored', async () => {
    // Given a game to 3 at version 1
    const { later, id } = await startedAtMidnight(3);

    // When two different finishing batches made on version 1 arrive at the same time
    const first = later.applyMoves(id, { ...BATCH, moves: [{ add: 3 }], elapsedMs: 1000 });
    const second = later.applyMoves(id, { ...BATCH, batchId: 'batch-two', moves: [{ add: 3 }] });
    const results = await Promise.all([first, second]);

    // Then the first is applied, the second is stale, and one result is stored
    assert.partialDeepStrictEqual(results, [{ ok: true }, { ok: false, reason: 'stale' }]);
    assert.deepEqual(await later.results(id), [
      { variant: 'to 3', moves: 1, durationMs: 300_000, reportedMs: 1000, finishedAt: AT_FIVE },
    ]);
  });
});

/** The plain model of a tally game far from its target: a number and the version it is at. */
interface Model {
  count: number;
  version: number;
}

interface Real {
  service: TallyService;
  id: number;
}

/** A legal add from the current version: the count grows and the version moves on. */
class LegalAdd implements AsyncCommand<Model, Real> {
  readonly add: number;
  constructor(add: number) {
    this.add = add;
  }
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    await move(real.service, real.id, this.add, model.version);
    model.count += this.add;
    model.version += 1;
  }
  toString(): string {
    return `add ${String(this.add)}`;
  }
}

/** A request that changes nothing: an illegal add from the current version (stale: false) or a
 * legal add from the version before it (stale: true). */
class RejectedAdd implements AsyncCommand<Model, Real> {
  readonly add: number;
  readonly behind: number;
  constructor(add: number, behind: number) {
    this.add = add;
    this.behind = behind;
  }
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    await move(real.service, real.id, this.add, model.version - this.behind);
  }
  toString(): string {
    return `add ${String(this.add)} from ${String(this.behind)} version(s) back`;
  }
}

const COMMANDS = [
  fc.constantFrom(new LegalAdd(1), new LegalAdd(2), new LegalAdd(3)),
  fc.constantFrom(new RejectedAdd(-1, 0), new RejectedAdd(0, 0), new RejectedAdd(4, 0)),
  fc.constantFrom(new RejectedAdd(1, 1), new RejectedAdd(3, 2)),
];

test('any sequence of current, illegal and stale adds stores what a plain counter predicts', async () => {
  // At most 20 adds of at most 3 never reach the target of 100, so the game never finishes.
  await fc.assert(
    fc.asyncProperty(fc.commands(COMMANDS, { maxCommands: 20 }), async (commands) => {
      const { service, id } = await setup();
      await service.start(id, { target: 100 });
      const model: Model = { count: 0, version: 1 };
      await fc.asyncModelRun(() => ({ model, real: { service, id } }), commands);
      const game = await service.get(id);
      assert.ok(game);
      assert.deepEqual([game.state.count, game.version], [model.count, model.version]);
    }),
    { numRuns: 50 },
  );
});
