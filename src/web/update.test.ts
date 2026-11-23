import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { updateCheckDue, updateStep } from './update.ts';

/** A returning player: the page was controlled by a service worker when it loaded. */
const RETURNING = {
  hadController: true,
  waiting: false,
  controllerChanged: false,
  requested: false,
};

describe('updateStep', () => {
  test('a returning player with no new version sees nothing', () => {
    assert.equal(updateStep(RETURNING), 'none');
  });

  test('a new version waiting is offered, not applied', () => {
    assert.equal(updateStep({ ...RETURNING, waiting: true }), 'offer');
  });

  test('a new version that took control from another tab is offered, not applied', () => {
    assert.equal(updateStep({ ...RETURNING, controllerChanged: true }), 'offer');
  });

  test('the first install taking control is not an update', () => {
    // Given a first visit: no controller at load, then the new worker claims the page
    const state = {
      hadController: false,
      waiting: false,
      controllerChanged: true,
      requested: false,
    };

    // Then nothing is offered
    assert.equal(updateStep(state), 'none');
  });

  test('asking to reload while a version waits activates it first', () => {
    assert.equal(updateStep({ ...RETURNING, waiting: true, requested: true }), 'activate');
  });

  test('once the asked-for version has taken control, the page reloads', () => {
    const state = { hadController: true, waiting: true, controllerChanged: true, requested: true };

    assert.equal(updateStep(state), 'reload');
  });
});

/** An hour, in milliseconds. */
const HOUR = 3_600_000;

describe('updateCheckDue', () => {
  test('a page shown again within the hour does not check again', () => {
    assert.equal(updateCheckDue(1000, 1000 + HOUR - 1), false);
  });

  test('a page shown an hour after its last check checks again', () => {
    assert.equal(updateCheckDue(1000, 1000 + HOUR), true);
  });
});
