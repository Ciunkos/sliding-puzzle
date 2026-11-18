import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateNickname } from './form.ts';

describe('validateNickname', () => {
  test('a valid input gives ok with the normalised nickname', () => {
    // Given input with surrounding spaces
    const input = '  Ada  ';

    // When it is validated
    const result = validateNickname(input);

    // Then the result is ok and carries the trimmed nickname
    assert.deepEqual(result, { ok: true, nickname: 'Ada' });
  });

  test('an invalid input gives not ok with the first rule message to show', () => {
    assert.deepEqual(validateNickname('A'), {
      ok: false,
      message: 'nickname must be 2-30 characters',
    });
  });
});
