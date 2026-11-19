import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { FeatureEvent } from '../game/client.tsx';
import { allowedEvent, forwardFeatureEvents } from './feature-events.ts';

const SOLVED = { name: 'game_solved', properties: { size: 4, moves: 37, seconds: 95 } };

describe('allowedEvent', () => {
  test('an event on the list with its allowed properties passes unchanged', () => {
    assert.deepEqual(allowedEvent(SOLVED), {
      name: 'game_solved',
      properties: { size: 4, moves: 37, seconds: 95 },
    });
  });

  test('an event that is not on the list is dropped', () => {
    const event = { name: 'profile_opened', properties: { nickname: 'tortoise-squirrel-123' } };

    assert.equal(allowedEvent(event), undefined);
  });

  test('a name the list object inherits is not on the list', () => {
    assert.equal(allowedEvent({ name: 'constructor', properties: {} }), undefined);
  });

  test('a property that is not on the list, such as a nickname, is removed', () => {
    const event = {
      name: 'game_started',
      properties: { size: 3, nickname: 'tortoise-squirrel-123' },
    };

    assert.deepEqual(allowedEvent(event), { name: 'game_started', properties: { size: 3 } });
  });

  test('a string outside the known values is removed', () => {
    const event = { name: 'skin_changed', properties: { kind: 'rocket' } };

    assert.deepEqual(allowedEvent(event), { name: 'skin_changed', properties: {} });
  });

  test('every known kind of skin passes', () => {
    assert.deepEqual(allowedEvent({ name: 'skin_changed', properties: { kind: 'numbers' } }), {
      name: 'skin_changed',
      properties: { kind: 'numbers' },
    });
    assert.deepEqual(allowedEvent({ name: 'skin_changed', properties: { kind: 'picture' } }), {
      name: 'skin_changed',
      properties: { kind: 'picture' },
    });
    assert.deepEqual(allowedEvent({ name: 'skin_changed', properties: { kind: 'photo' } }), {
      name: 'skin_changed',
      properties: { kind: 'photo' },
    });
  });

  test('a number that is not finite is removed', () => {
    const event = { name: 'game_solved', properties: { size: 4, moves: Infinity, seconds: NaN } };

    assert.deepEqual(allowedEvent(event), { name: 'game_solved', properties: { size: 4 } });
  });

  test('a value of the wrong type is removed', () => {
    const event = { name: 'game_started', properties: { size: '4' } };

    assert.deepEqual(allowedEvent(event), { name: 'game_started', properties: {} });
  });

  test('switching sound on or off passes with whether it is on', () => {
    assert.deepEqual(
      [
        allowedEvent({ name: 'sound_changed', properties: { on: true } }),
        allowedEvent({ name: 'sound_changed', properties: { on: false } }),
      ],
      [
        { name: 'sound_changed', properties: { on: true } },
        { name: 'sound_changed', properties: { on: false } },
      ],
    );
  });

  test('a sound change that is not a plain true or false loses the value', () => {
    const event = { name: 'sound_changed', properties: { on: 'yes', volume: 3 } };

    assert.deepEqual(allowedEvent(event), { name: 'sound_changed', properties: {} });
  });

  test('a number where a kind of skin is expected is removed', () => {
    const event = { name: 'skin_changed', properties: { kind: 3 } };

    assert.deepEqual(allowedEvent(event), { name: 'skin_changed', properties: {} });
  });
});

describe('forwardFeatureEvents', () => {
  test('the analytics side receives exactly the allowed events, cleaned, in order', () => {
    // Given analytics standing in as the outside world, recording what it is handed
    const sent: FeatureEvent[] = [];
    const forward = forwardFeatureEvents((event) => sent.push(event));

    // When the screen reports an allowed event, an unknown one and one with a nickname
    forward(SOLVED);
    forward({ name: 'board_seen', properties: { board: '1,2,3' } });
    forward({ name: 'skin_changed', properties: { kind: 'photo', nickname: 'ada' } });

    // Then only the allowed ones arrived, without the nickname
    assert.deepEqual(sent, [
      { name: 'game_solved', properties: { size: 4, moves: 37, seconds: 95 } },
      { name: 'skin_changed', properties: { kind: 'photo' } },
    ]);
  });
});
