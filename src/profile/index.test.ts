import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { nicknameKey, nicknameSchema } from './index.ts';

const LENGTH_MESSAGE = /nickname must be 2-20 characters/;
// ZodError messages are JSON, so the quoted "_" and "-" are escaped there: match the plain start.
const CHARACTER_MESSAGE = /nickname may only contain letters, digits/;

/** Strings of allowed and disallowed characters, so both accepted and rejected inputs come up. */
const NICKNAME_LIKE = fc.string({
  unit: fc.constantFrom('a', 'Z', '7', '_', '-', ' ', '.', 'é'),
  maxLength: 24,
});

describe('nicknameSchema', () => {
  test('a nickname of letters, digits, underscore and dash is accepted unchanged', () => {
    assert.equal(nicknameSchema.parse('Ada_99-x'), 'Ada_99-x');
  });

  test('surrounding whitespace is trimmed off', () => {
    assert.equal(nicknameSchema.parse('  Ada  '), 'Ada');
  });

  test('the shortest and the longest allowed nicknames are accepted', () => {
    assert.equal(nicknameSchema.parse('ab'), 'ab');
    assert.equal(nicknameSchema.parse('abcdefghijklmnopqrst'), 'abcdefghijklmnopqrst');
  });

  test('one character or twenty-one characters are rejected with the length message', () => {
    assert.throws(() => nicknameSchema.parse('a'), LENGTH_MESSAGE);
    assert.throws(() => nicknameSchema.parse('abcdefghijklmnopqrstu'), LENGTH_MESSAGE);
  });

  test('length is counted after trimming, so whitespace does not make a nickname long enough', () => {
    assert.throws(() => nicknameSchema.parse(' a '), LENGTH_MESSAGE);
    assert.throws(() => nicknameSchema.parse('   '), LENGTH_MESSAGE);
  });

  test('spaces, punctuation and accented letters are rejected with the character message', () => {
    assert.throws(() => nicknameSchema.parse('ada smith'), CHARACTER_MESSAGE);
    assert.throws(() => nicknameSchema.parse('a.b'), CHARACTER_MESSAGE);
    assert.throws(() => nicknameSchema.parse('zoé'), CHARACTER_MESSAGE);
  });

  test('any accepted nickname is 2-20 allowed characters and parsing it again changes nothing', () => {
    fc.assert(
      fc.property(NICKNAME_LIKE, (input) => {
        fc.pre(nicknameSchema.safeParse(input).success);
        const accepted = nicknameSchema.parse(input);
        assert.match(accepted, /^[A-Za-z0-9_-]{2,20}$/);
        assert.equal(nicknameSchema.parse(accepted), accepted);
      }),
    );
  });
});

describe('nicknameKey', () => {
  test('the key of a nickname is trimmed and lower-cased', () => {
    assert.equal(nicknameKey('  AdA '), 'ada');
  });
});
