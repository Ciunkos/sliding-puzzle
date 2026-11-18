import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Db } from '../db/index.ts';
import {
  applyMove,
  createRng,
  isSolvable,
  isSolved,
  legalMoves,
  shuffle,
  type Board,
} from '../puzzle/index.ts';
import { gameStateSchema, type GameState } from './index.ts';
import { createGameService } from './server.ts';
import { addProfile, ALL_TILES, insertGame, NEAR_SOLVED, openDb, SOLVED } from './test-helpers.ts';

/** Forwards to db, and runs `onGameRead` right after each read of the games row. */
function racingDb(db: Db, onGameRead: () => Promise<void>): Db {
  return {
    run: (sql, params) => db.run(sql, params),
    all: (sql, params) => db.all(sql, params),
    batch: (statements) => db.batch(statements),
    async get(sql, params) {
      const row = await db.get(sql, params);
      if (sql.includes('FROM games')) await onGameRead();
      return row;
    },
  };
}

function firstLegalTile(board: Board): number {
  const tile = legalMoves(board)[0];
  assert.ok(tile !== undefined);
  return tile;
}

describe('start', () => {
  test('creates a valid, solvable, unsolved game at version 1', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const game = await createGameService(db).start(id);

    assert.deepEqual(gameStateSchema.parse(game), game);
    assert.equal(isSolvable(game.board), true);
    assert.equal(isSolved(game.board), false);
    assert.equal(game.solved, false);
    assert.equal(game.moves, 0);
    assert.equal(game.version, 1);
    assert.deepEqual(game.initial, game.board);
  });

  test('get returns the started game, and undefined before any start', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    assert.equal(await service.get(id), undefined);
    const game = await service.start(id);
    assert.deepEqual(await service.get(id), game);
  });

  test('start again replaces the existing game', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const first = await createGameService(db, { random: createRng(1) }).start(id);
    const second = await createGameService(db, { random: createRng(2) }).start(id);

    assert.notDeepEqual(second.board, first.board);
    assert.equal(first.version, 1);
    assert.equal(second.version, first.version + 1);
    assert.deepEqual(await createGameService(db).get(id), second);
    const rows = await db.all('SELECT profile_id FROM games WHERE profile_id = ?', [id]);
    assert.equal(rows.length, 1);
  });

  test('a seeded rng gives the same board as puzzle.shuffle with that seed', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const game = await createGameService(db, { random: createRng(1) }).start(id);
    assert.deepEqual(game.board, shuffle(createRng(1)));

    const otherDb = await openDb();
    const otherId = await addProfile(otherDb, 'Alice');
    const other = await createGameService(otherDb, { random: createRng(1) }).start(otherId);
    assert.deepEqual(other.board, game.board);
  });
});

describe('move', () => {
  test('a legal move updates board, moves and version', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const game = await service.start(id);
    const tile = firstLegalTile(game.board);

    const expected = {
      board: applyMove(game.board, tile),
      initial: game.initial,
      moves: 1,
      solved: false,
      version: 2,
    };
    assert.deepEqual(await service.move(id, tile), { ok: true, state: expected });
    assert.deepEqual(await service.get(id), expected);
  });

  test('an illegal move leaves the state unchanged', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const before = await service.start(id);
    const illegal = ALL_TILES.find((tile) => !legalMoves(before.board).includes(tile));
    assert.ok(illegal !== undefined);

    assert.deepEqual(await service.move(id, illegal), { ok: false, reason: 'illegal-move' });
    assert.deepEqual(await service.get(id), before);
  });

  test('a move without a game returns no-game', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    assert.deepEqual(await createGameService(db).move(id, 1), { ok: false, reason: 'no-game' });
  });

  test('the correcting move solves the game, and a further move is already-solved', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    await insertGame(db, id, NEAR_SOLVED);
    const service = createGameService(db);

    const solved = {
      board: SOLVED,
      initial: NEAR_SOLVED,
      moves: 1,
      solved: true,
      version: 2,
    };
    assert.deepEqual(await service.move(id, 15), { ok: true, state: solved });

    // Tile 12 is legal on the solved board, so the rejection comes from the solved state.
    assert.deepEqual(await service.move(id, 12), { ok: false, reason: 'already-solved' });
    assert.deepEqual(await service.get(id), solved);
  });
});

describe('reset', () => {
  test('restores initial, zero moves, and bumps the version', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const start = await service.start(id);
    await service.move(id, firstLegalTile(start.board));

    assert.deepEqual(await service.reset(id), {
      ok: true,
      state: { board: start.initial, initial: start.initial, moves: 0, solved: false, version: 3 },
    });
  });

  test('reset without a game returns no-game', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    assert.deepEqual(await createGameService(db).reset(id), { ok: false, reason: 'no-game' });
  });
});

describe('persistence', () => {
  test('a second service on the same db resumes the game', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const first = createGameService(db);
    const game = await first.start(id);

    const second = createGameService(db);
    assert.deepEqual(await second.get(id), game);
    const tile = firstLegalTile(game.board);
    await second.move(id, tile);
    assert.equal((await first.get(id))?.moves, 1);
  });

  for (const [label, board] of [
    ['invalid JSON', 'not json'],
    ['a repeated tile', JSON.stringify([1, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0])],
    ['too few cells', JSON.stringify([1, 2, 3])],
  ] as const) {
    test(`get throws on a corrupt stored board (${label})`, async () => {
      const db = await openDb();
      const id = await addProfile(db, 'Alice');
      await db.run(
        'INSERT INTO games (profile_id, board, initial, moves, solved, version, updated_at) VALUES (?, ?, ?, 0, 0, 1, ?)',
        [id, board, JSON.stringify(SOLVED), '2026-01-01T00:00:00.000Z'],
      );
      await assert.rejects(createGameService(db).get(id));
    });
  }
});

describe('concurrency', () => {
  test('two concurrent moves on one game: one applies, the other is illegal, version matches', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const game = await service.start(id);
    const [a, b] = legalMoves(game.board);
    assert.ok(a !== undefined && b !== undefined);

    const results = await Promise.all([service.move(id, a), service.move(id, b)]);
    const wins = results.filter((result) => result.ok).length;
    // Once one tile has slid into the blank, the other tile is no longer next to it.
    assert.equal(wins, 1);
    assert.deepEqual(
      results.filter((result) => !result.ok),
      [{ ok: false, reason: 'illegal-move' }],
    );
    const state = await service.get(id);
    assert.ok(state !== undefined);
    assert.equal(state.version, 1 + wins);
    assert.equal(state.moves, wins);
  });

  test('a stale read is retried, and the move applies on the fresh state', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const game = await service.start(id);
    const tile = firstLegalTile(game.board);

    // After the first read, another writer resets the game (version 1 -> 2, same board).
    let raced = false;
    const racing = racingDb(db, async () => {
      if (raced) return;
      raced = true;
      await service.reset(id);
    });

    assert.deepEqual(await createGameService(racing).move(id, tile), {
      ok: true,
      state: {
        board: applyMove(game.board, tile),
        initial: game.initial,
        moves: 1,
        solved: false,
        version: 3,
      },
    });
  });

  test('gives up with an error after three attempts when the game keeps changing', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db);
    const game = await service.start(id);
    const tile = firstLegalTile(game.board);

    const racing = racingDb(db, async () => {
      await service.reset(id);
    });
    await assert.rejects(createGameService(racing).move(id, tile));
  });

  test('a move that read the old game before start() replaced it never overwrites the new game', async () => {
    const db = await openDb();
    const id = await addProfile(db, 'Alice');
    const service = createGameService(db, { random: createRng(1) });
    const old = await service.start(id);
    const tile = firstLegalTile(old.board);
    // Pick a replacement seed whose board still has `tile` legal, so the retry must apply the move.
    const seed = [2, 3, 4, 5, 6, 7, 8, 9].find((s) =>
      legalMoves(shuffle(createRng(s))).includes(tile),
    );
    assert.ok(seed !== undefined);

    const replaced: GameState[] = [];
    // Between the move's read of the old game and its compare-and-swap, start() replaces it.
    const racing = racingDb(db, async () => {
      if (replaced.length > 0) return;
      replaced.push(await createGameService(db, { random: createRng(seed) }).start(id));
    });
    const result = await createGameService(racing).move(id, tile);

    const fresh = replaced[0];
    assert.ok(fresh !== undefined);
    assert.equal(fresh.version, old.version + 1);
    // The retry re-reads the new game and applies the move to its board, not the old one.
    const expected = {
      board: applyMove(fresh.board, tile),
      initial: fresh.initial,
      moves: 1,
      solved: false,
      version: fresh.version + 1,
    };
    assert.deepEqual(result, { ok: true, state: expected });
    assert.deepEqual(await service.get(id), expected);
  });
});
