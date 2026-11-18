import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc, { type AsyncCommand } from 'fast-check';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { createTestProfile } from '../test-support/profiles.ts';
import {
  ALWAYS_HIGH,
  ALWAYS_LOW,
  type TallyMove,
  type TallyOptions,
  type TallyState,
  tallyGame,
} from '../test-support/tally-game.ts';
import { createGameService, type GameService, InvalidStartStateError } from './service.ts';

type TallyService = GameService<TallyState, TallyMove, TallyOptions>;

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
    await service.move(id, { add: 2 }, 1);

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
    const result = await service.move(id, { add: 2 }, 1);

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

  test('an illegal move is rejected and leaves the stored game unchanged', async () => {
    // Given a new game at 0
    const { service, id } = await setup();
    await service.start(id, { target: 5 });

    // When 4 is added (only 1, 2 and 3 are legal)
    const result = await service.move(id, { add: 4 }, 1);

    // Then the move is rejected and the game is still the started one
    assert.deepEqual(result, { ok: false, reason: 'illegal-move' });
    assert.deepEqual(await service.get(id), {
      state: { count: 0, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a move that reaches the target finishes the game at the time of the move', async () => {
    // Given a game to 2 started at midnight
    const { db, service, id } = await setup();
    await service.start(id, { target: 2 });
    const fiveMinutesLater = createGameService(db, tallyGame, FIVE_MINUTES_LATER);

    // When 2 is added five minutes later
    const result = await fiveMinutesLater.move(id, { add: 2 }, 1);

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

  test('a move on a finished game is rejected as already finished', async () => {
    // Given a game to 1 that one move has finished
    const { service, id } = await setup();
    await service.start(id, { target: 1 });
    await service.move(id, { add: 1 }, 1);

    // When another legal move is made on the finished version
    const result = await service.move(id, { add: 1 }, 2);

    // Then it is rejected and the game stays at its finishing version
    assert.deepEqual(result, { ok: false, reason: 'already-finished' });
    const game = await service.get(id);
    assert.ok(game);
    assert.deepEqual(game.state, { count: 1, target: 1 });
  });

  test('reset restores the initial state, clears the moves and the finish, and raises the version', async () => {
    // Given a game to 2 that one move has finished
    const { service, id } = await setup();
    await service.start(id, { target: 2 });
    await service.move(id, { add: 2 }, 1);

    // When it is reset
    const result = await service.reset(id, 2);

    // Then it is back at the start, one version later
    assert.deepEqual(result, {
      ok: true,
      game: {
        state: { count: 0, target: 2 },
        initial: { count: 0, target: 2 },
        moves: 0,
        finished: false,
        version: 3,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
    });
  });

  test('a move or a reset without a game answers no-game', async () => {
    const { service, id } = await setup();

    assert.deepEqual(await service.move(id, { add: 1 }, 1), { ok: false, reason: 'no-game' });
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
    await service.move(id, { add: 3 }, 1);

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
    await service.move(id, { add: 3 }, 1);

    // Then the other game is untouched
    const game = await other.get(id);
    assert.ok(game);
    assert.deepEqual(game.state, { count: 0, target: 5 });
  });

  test('repeating a move with the same base version is stale and counts the move once', async () => {
    // Given a game to 2 that a move from version 1 has finished
    const { service, id } = await setup();
    await service.start(id, { target: 2 });
    await service.move(id, { add: 2 }, 1);

    // When the same request arrives again (a network retry, a second tab)
    const result = await service.move(id, { add: 2 }, 1);

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
    await service.move(id, { add: 3 }, 1);

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
    await service.move(id, { add: 2 }, 1);

    // When a move on version 2 and a new game to 9 run at the same time (the move reads first)
    const [result] = await Promise.all([
      service.move(id, { add: 1 }, 2),
      service.start(id, { target: 9 }),
    ]);

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
    const first = service.move(id, { add: 1 }, 1);
    const results = await Promise.all([first, service.move(id, { add: 2 }, 1)]);

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
    await service.move(id, { add: 3 }, 1);

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
    await real.service.move(real.id, { add: this.add }, model.version);
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
    await real.service.move(real.id, { add: this.add }, model.version - this.behind);
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
