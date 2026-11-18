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
    await service.move(id, { add: 2 });

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

  test('get answers undefined before any game is started', async () => {
    const { service, id } = await setup();

    assert.equal(await service.get(id), undefined);
  });

  test('a legal move updates the state and counts one move and one version', async () => {
    // Given a new game at 0
    const { service, id } = await setup();
    await service.start(id, { target: 5 });

    // When 2 is added
    const result = await service.move(id, { add: 2 });

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
    const result = await service.move(id, { add: 4 });

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
    const result = await fiveMinutesLater.move(id, { add: 2 });

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
    await service.move(id, { add: 1 });

    // When another legal move is made
    const result = await service.move(id, { add: 1 });

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
    await service.move(id, { add: 2 });

    // When it is reset
    const result = await service.reset(id);

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

    assert.deepEqual(await service.move(id, { add: 1 }), { ok: false, reason: 'no-game' });
    assert.deepEqual(await service.reset(id), { ok: false, reason: 'no-game' });
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

  test('startWith rejects a state the definition does not accept and stores nothing', async () => {
    // Given a profile without a game
    const { service, id } = await setup();

    // When it tries to start from an already finished state
    const starting = service.startWith(id, { count: 5, target: 5 });

    // Then it is rejected and there is still no game
    await assert.rejects(starting, InvalidStartStateError);
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
    await service.move(id, { add: 3 });

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
    await service.move(id, { add: 3 });

    // Then the other game is untouched
    const game = await other.get(id);
    assert.ok(game);
    assert.deepEqual(game.state, { count: 0, target: 5 });
  });

  test('a move that read the old game never overwrites a game started meanwhile', async () => {
    // Given a game at 2, version 2
    const { service, id } = await setup();
    await service.start(id, { target: 5 });
    await service.move(id, { add: 2 });

    // When a move and a new game to 9 run at the same time (the move reads first)
    await Promise.all([service.move(id, { add: 1 }), service.start(id, { target: 9 })]);

    // Then the move landed on the new game, after the start
    assert.deepEqual(await service.get(id), {
      state: { count: 1, target: 9 },
      initial: { count: 0, target: 9 },
      moves: 1,
      finished: false,
      version: 4,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('two moves at the same time are both applied', async () => {
    // Given a new game at 0
    const { service, id } = await setup();
    await service.start(id, { target: 9 });

    // When 1 and 2 are added at the same time
    await Promise.all([service.move(id, { add: 1 }), service.move(id, { add: 2 })]);

    // Then both count, as two moves and two versions
    const game = await service.get(id);
    assert.ok(game);
    assert.deepEqual([game.state, game.moves, game.version], [{ count: 3, target: 9 }, 2, 3]);
  });
});

/** The plain model of a tally game far from its target: a number, and how many moves counted. */
interface Model {
  count: number;
  accepted: number;
}

interface Real {
  service: TallyService;
  id: number;
}

class LegalAdd implements AsyncCommand<Model, Real> {
  readonly add: number;
  constructor(add: number) {
    this.add = add;
  }
  check(): boolean {
    return true;
  }
  async run(model: Model, real: Real): Promise<void> {
    model.count += this.add;
    model.accepted += 1;
    await real.service.move(real.id, { add: this.add });
  }
  toString(): string {
    return `add ${String(this.add)}`;
  }
}

class IllegalAdd implements AsyncCommand<Model, Real> {
  readonly add: number;
  constructor(add: number) {
    this.add = add;
  }
  check(): boolean {
    return true;
  }
  async run(_model: Model, real: Real): Promise<void> {
    await real.service.move(real.id, { add: this.add });
  }
  toString(): string {
    return `illegal add ${String(this.add)}`;
  }
}

const COMMANDS = [
  fc.constantFrom(new LegalAdd(1), new LegalAdd(2), new LegalAdd(3)),
  fc.constantFrom(new IllegalAdd(-1), new IllegalAdd(0), new IllegalAdd(4), new IllegalAdd(9)),
];

test('any sequence of adds stores the count and version a plain counter predicts', async () => {
  // At most 20 adds of at most 3 never reach the target of 100, so the game never finishes.
  await fc.assert(
    fc.asyncProperty(fc.commands(COMMANDS, { maxCommands: 20 }), async (commands) => {
      const { service, id } = await setup();
      await service.start(id, { target: 100 });
      const model: Model = { count: 0, accepted: 0 };
      await fc.asyncModelRun(() => ({ model, real: { service, id } }), commands);
      const game = await service.get(id);
      assert.ok(game);
      assert.deepEqual([game.state.count, game.version], [model.count, 1 + model.accepted]);
    }),
    { numRuns: 50 },
  );
});
