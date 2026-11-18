import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateNickname } from './form.ts';

describe('validateNickname', () => {
  test('accepts a valid nickname and returns it trimmed', () => {
    assert.deepEqual(validateNickname('  Ada  '), { ok: true, nickname: 'Ada' });
  });

  test('accepts letters, digits, underscore and dash', () => {
    assert.deepEqual(validateNickname('a-B_9'), { ok: true, nickname: 'a-B_9' });
  });

  test('rejects a single character with the length message', () => {
    assert.deepEqual(validateNickname('A'), {
      ok: false,
      message: 'nickname must be 2-20 characters',
    });
  });

  test('rejects a nickname longer than 20 characters', () => {
    assert.deepEqual(validateNickname('a'.repeat(21)), {
      ok: false,
      message: 'nickname must be 2-20 characters',
    });
  });

  test('rejects an empty input with the length message', () => {
    assert.deepEqual(validateNickname(''), {
      ok: false,
      message: 'nickname must be 2-20 characters',
    });
  });

  test('rejects bad characters with the character message', () => {
    assert.deepEqual(validateNickname('a b'), {
      ok: false,
      message: 'nickname may only contain letters, digits, "_" and "-"',
    });
  });
});
