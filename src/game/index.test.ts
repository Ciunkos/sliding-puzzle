import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tallyGame } from '../test-support/tally-game.ts';
import { batchIdSchema, savedGameSchema } from './index.ts';

const SAVED = {
  state: { count: 1, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 1,
  finished: false,
  version: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

describe('savedGameSchema', () => {
  test('a well-formed saved game is accepted as it is', () => {
    const schema = savedGameSchema(tallyGame.stateSchema);

    assert.deepEqual(schema.parse(SAVED), SAVED);
  });

  test('a saved game whose state does not match the state schema is rejected', () => {
    const schema = savedGameSchema(tallyGame.stateSchema);

    const result = schema.safeParse({ ...SAVED, state: { count: 'one', target: 5 } });

    assert.equal(result.success, false);
  });

  test('a saved game at version 0 is rejected', () => {
    const schema = savedGameSchema(tallyGame.stateSchema);

    const result = schema.safeParse({ ...SAVED, version: 0 });

    assert.equal(result.success, false);
  });

  test('a batch id is 8-40 letters, digits, dashes and underscores, and nothing around them', () => {
    assert.equal(batchIdSchema.safeParse('7-2_abcXYZ').success, true);
    assert.equal(batchIdSchema.safeParse('!7-2-abcdef').success, false);
    assert.equal(batchIdSchema.safeParse('7-2-abcdef!').success, false);
  });
});
