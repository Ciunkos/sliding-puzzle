// Over the real tally routes: a reset from version 1 tells whether a request arrived (it cannot be
// replayed, so a second arrival is stale).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ADA_TALLY, adaDevice } from '../test-support/device.ts';
import { flakyNetwork } from './flaky-network.ts';

const RESET = { method: 'POST', body: '{"baseVersion":1}' };

async function setup() {
  const device = await adaDevice(5);
  return { device, network: flakyNetwork(device.app) };
}

describe('the flaky network', () => {
  test('a lost request never reaches the app', async () => {
    const { device, network } = await setup();
    network.next = 'request-lost';

    await assert.rejects(network.fetch(`${ADA_TALLY}/reset`, RESET), TypeError);

    assert.partialDeepStrictEqual(await device.stored(), { version: 1 });
  });

  test('a lost answer reaches the app, but the caller only sees a failure', async () => {
    const { device, network } = await setup();
    network.next = 'answer-lost';

    await assert.rejects(network.fetch(`${ADA_TALLY}/reset`, RESET), TypeError);

    assert.partialDeepStrictEqual(await device.stored(), { version: 2 });
  });

  test('a request delivered twice reaches the app twice and answers with the second', async () => {
    const { network } = await setup();
    network.next = 'delivered-twice';

    const answer = await network.fetch(`${ADA_TALLY}/reset`, RESET);

    assert.partialDeepStrictEqual(await answer.json(), { error: 'stale', game: { version: 2 } });
  });

  test('a delivered request is answered once', async () => {
    const { network } = await setup();

    const answer = await network.fetch(`${ADA_TALLY}/reset`, RESET);

    assert.partialDeepStrictEqual(await answer.json(), { version: 2 });
  });
});
