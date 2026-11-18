// Over the real tally routes: a single move from version 1 tells whether a request arrived.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ADA_TALLY, adaDevice } from '../test-support/device.ts';
import { flakyNetwork } from './flaky-network.ts';

const MOVE = { method: 'POST', body: '{"baseVersion":1,"move":{"add":1}}' };

async function setup() {
  const device = await adaDevice(5);
  return { device, network: flakyNetwork(device.app) };
}

describe('the flaky network', () => {
  test('a lost request never reaches the app', async () => {
    const { device, network } = await setup();
    network.next = 'request-lost';

    await assert.rejects(network.fetch(`${ADA_TALLY}/move`, MOVE), TypeError);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
  });

  test('a lost answer reaches the app, but the caller only sees a failure', async () => {
    const { device, network } = await setup();
    network.next = 'answer-lost';

    await assert.rejects(network.fetch(`${ADA_TALLY}/move`, MOVE), TypeError);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 1 });
  });

  test('a request delivered twice reaches the app twice and answers with the second', async () => {
    const { network } = await setup();
    network.next = 'delivered-twice';

    const answer = await network.fetch(`${ADA_TALLY}/move`, MOVE);

    assert.partialDeepStrictEqual(await answer.json(), { error: 'stale', game: { moves: 1 } });
  });

  test('a delivered request is answered once', async () => {
    const { network } = await setup();

    const answer = await network.fetch(`${ADA_TALLY}/move`, MOVE);

    assert.partialDeepStrictEqual(await answer.json(), { moves: 1, version: 2 });
  });
});
