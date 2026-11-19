import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { analyticsAllowed, scrubEvent, scrubUrl, tagApp } from './analytics-policy.ts';

/** A player on the real site who allowed everything. */
const ON_THE_SITE = {
  hostname: 'ciunkos.com',
  webdriver: false,
  doNotTrack: null,
  globalPrivacyControl: false,
  optedOut: false,
};

/** A generated-style nickname: two words and a number, as src/profile makes them. */
const NICKNAME = fc.stringMatching(/^[a-z]{3,10}-[a-z]{3,10}-[1-9][0-9]{2}$/);

/** A page view as the SDK would send it from a profile page, opened from another profile's link. */
function profilePageView(nickname: string) {
  return {
    event: 'page_view',
    properties: {
      $current_url: `https://ciunkos.com/sliding-puzzle/p/${nickname}?from=share#top`,
      $pathname: `/sliding-puzzle/p/${nickname}`,
      $referrer: `https://ciunkos.com/sliding-puzzle/p/${nickname}`,
      $host: 'ciunkos.com',
    },
    $set_once: { $initial_current_url: `https://ciunkos.com/sliding-puzzle/p/${nickname}` },
  };
}

describe('analyticsAllowed', () => {
  test('a player on ciunkos.com who allowed everything is counted', () => {
    assert.equal(analyticsAllowed(ON_THE_SITE), true);
  });

  test('the www host, a preview host and localhost are never counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, hostname: 'www.ciunkos.com' }), false);
    assert.equal(
      analyticsAllowed({ ...ON_THE_SITE, hostname: 'sliding-puzzle.workers.dev' }),
      false,
    );
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, hostname: 'localhost' }), false);
  });

  test('a browser driven by automation is never counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, webdriver: true }), false);
  });

  test('Do Not Track turned on is never counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, doNotTrack: '1' }), false);
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, doNotTrack: 'yes' }), false);
  });

  test('Do Not Track explicitly turned off is counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, doNotTrack: '0' }), true);
  });

  test('Global Privacy Control is never counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, globalPrivacyControl: true }), false);
  });

  test('a player who switched usage statistics off is never counted', () => {
    assert.equal(analyticsAllowed({ ...ON_THE_SITE, optedOut: true }), false);
  });
});

describe('scrubUrl', () => {
  test('a profile URL keeps only the origin and the app path', () => {
    assert.equal(
      scrubUrl('https://ciunkos.com/sliding-puzzle/p/Ada?from=share#top'),
      'https://ciunkos.com/sliding-puzzle',
    );
  });

  test('the home page loses its query', () => {
    assert.equal(
      scrubUrl('https://ciunkos.com/sliding-puzzle?x=1'),
      'https://ciunkos.com/sliding-puzzle',
    );
  });

  test('a profile path without an origin becomes the app path', () => {
    assert.equal(scrubUrl('/sliding-puzzle/p/Ada'), '/sliding-puzzle');
  });

  test('a link from another site keeps only its origin', () => {
    assert.equal(scrubUrl('https://search.example/results?q=Ada'), 'https://search.example');
  });

  test('a value that is not a web address is left as it is', () => {
    assert.equal(scrubUrl('Europe/Warsaw'), 'Europe/Warsaw');
  });
});

describe('scrubEvent', () => {
  test('no nickname survives in any property of a profile page view', () => {
    fc.assert(
      fc.property(
        NICKNAME,
        (nickname) => !JSON.stringify(scrubEvent(profilePageView(nickname))).includes(nickname),
      ),
    );
  });

  test('a page view keeps its name, host and the app path', () => {
    assert.deepEqual(scrubEvent(profilePageView('tortoise-squirrel-123')), {
      event: 'page_view',
      properties: {
        $current_url: 'https://ciunkos.com/sliding-puzzle',
        $pathname: '/sliding-puzzle',
        $referrer: 'https://ciunkos.com/sliding-puzzle',
        $host: 'ciunkos.com',
      },
      $set_once: { $initial_current_url: 'https://ciunkos.com/sliding-puzzle' },
    });
  });
});

/** When the SDK stamps an event: a Date object, not text. */
const SENT_AT = new Date('2026-11-19T09:00:00.000Z');

describe('scrubEvent and tagApp on what the SDK really sends', () => {
  test('the timestamp, a Date, is still that Date after scrubbing and tagging', () => {
    const event = { event: 'page_view', properties: {}, timestamp: SENT_AT };

    const sent = tagApp(scrubEvent(event));

    assert.deepEqual(sent, {
      event: 'page_view',
      properties: { app: 'sliding-puzzle' },
      timestamp: SENT_AT,
    });
  });

  test('a Date inside the properties is kept as it is', () => {
    const event = { event: 'page_view', properties: { $time: SENT_AT } };

    assert.deepEqual(scrubEvent(event), { event: 'page_view', properties: { $time: SENT_AT } });
  });
});

describe('tagApp', () => {
  test('every event names this app, beside the properties it already has', () => {
    assert.deepEqual(tagApp({ event: 'game_solved', properties: { size: 4, moves: 80 } }), {
      event: 'game_solved',
      properties: { size: 4, moves: 80, app: 'sliding-puzzle' },
    });
  });

  test('an event without properties gets them, with the app', () => {
    assert.deepEqual(tagApp({ event: '$identify' }), {
      event: '$identify',
      properties: { app: 'sliding-puzzle' },
    });
  });

  test('something that is not an event is left as it is', () => {
    assert.deepEqual([tagApp(null), tagApp('page_view'), tagApp([1])], [null, 'page_view', [1]]);
  });
});
