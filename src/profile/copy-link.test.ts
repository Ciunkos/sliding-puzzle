import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { copyText } from './copy-link.ts';

/** A stand-in for navigator.clipboard that records what was written. */
function recordingClipboard(written: string[]): Pick<Clipboard, 'writeText'> {
  return {
    writeText: (text) => {
      written.push(text);
      return Promise.resolve();
    },
  };
}

/** A clipboard as with permission denied: every write is refused. */
const REFUSING_CLIPBOARD = {
  writeText: (): Promise<void> => Promise.reject(new Error('NotAllowedError')),
};

/** A clipboard whose write throws before giving a promise. */
const THROWING_CLIPBOARD = {
  writeText: (): Promise<void> => {
    throw new TypeError('clipboard is broken');
  },
};

describe('copyText', () => {
  test('the text is written to the clipboard and the result is copied', async () => {
    // Given a working clipboard
    const written: string[] = [];

    // When the link is copied
    const result = await copyText(
      'http://localhost/sliding-puzzle/p/Ada',
      recordingClipboard(written),
    );

    // Then the clipboard holds the link
    assert.deepEqual(
      { result, written },
      {
        result: 'copied',
        written: ['http://localhost/sliding-puzzle/p/Ada'],
      },
    );
  });

  test('without a clipboard the result is unavailable', async () => {
    assert.equal(await copyText('link', undefined), 'unavailable');
  });

  test('a refused write gives failed instead of a rejection', async () => {
    assert.equal(await copyText('link', REFUSING_CLIPBOARD), 'failed');
  });

  test('a write that throws gives failed instead of throwing', async () => {
    assert.equal(await copyText('link', THROWING_CLIPBOARD), 'failed');
  });
});
