import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { decideProfileStart } from './profile-start.ts';

const ADA = { id: 7, nickname: 'Ada' };
const GRACE = { id: 9, nickname: 'Grace' };

describe('decideProfileStart', () => {
  test('online, the server is asked even for a profile known here', () => {
    assert.deepEqual(decideProfileStart({ reach: 'online', known: ADA, last: ADA }), {
      kind: 'ask-server',
    });
  });

  test('offline, a profile opened here before plays from what this device remembers', () => {
    assert.deepEqual(decideProfileStart({ reach: 'offline', known: ADA, last: GRACE }), {
      kind: 'remembered',
      profile: ADA,
    });
  });

  test('when the server cannot be reached, a known profile plays from memory too', () => {
    assert.deepEqual(decideProfileStart({ reach: 'unreachable', known: ADA, last: ADA }), {
      kind: 'remembered',
      profile: ADA,
    });
  });

  test('offline, a profile never opened here cannot be opened, and the last one is offered', () => {
    assert.deepEqual(decideProfileStart({ reach: 'offline', known: undefined, last: GRACE }), {
      kind: 'unavailable-offline',
      other: GRACE,
    });
  });

  test('offline on a device that knows no profile, nothing is offered', () => {
    assert.deepEqual(
      decideProfileStart({ reach: 'unreachable', known: undefined, last: undefined }),
      {
        kind: 'unavailable-offline',
        other: undefined,
      },
    );
  });
});
