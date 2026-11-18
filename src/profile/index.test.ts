import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { nicknameKey, nicknameSchema, profileSchema } from './index.ts';

describe('nicknameSchema', () => {
  test('accepts a valid nickname and returns it unchanged', () => {
    assert.equal(nicknameSchema.parse('Ada_99-x'), 'Ada_99-x');
  });

  test('trims surrounding whitespace and returns the trimmed string', () => {
    assert.equal(nicknameSchema.parse('  Ada  '), 'Ada');
  });

  test('length is counted after trimming', () => {
    assert.equal(nicknameSchema.parse(' ab '), 'ab');
    assert.equal(nicknameSchema.safeParse(' a ').success, false);
  });

  test('accepts the length bounds 2 and 20', () => {
    assert.equal(nicknameSchema.parse('ab'), 'ab');
    assert.equal(nicknameSchema.parse('a'.repeat(20)), 'a'.repeat(20));
  });

  test('rejects too short and too long', () => {
    assert.equal(nicknameSchema.safeParse('a').success, false);
    assert.equal(nicknameSchema.safeParse('a'.repeat(21)).success, false);
  });

  test('rejects empty and whitespace-only input', () => {
    assert.equal(nicknameSchema.safeParse('').success, false);
    assert.equal(nicknameSchema.safeParse('   ').success, false);
  });

  test('rejects characters outside [A-Za-z0-9_-]', () => {
    for (const bad of ['ada smith', 'zoé', 'a.b', 'ab@c', "a'b", 'ab/cd', '<b>x</b>']) {
      assert.equal(nicknameSchema.safeParse(bad).success, false, bad);
    }
  });
});

describe('nicknameKey', () => {
  test('is trimmed and lowercased', () => {
    assert.equal(nicknameKey('  AdA '), 'ada');
  });
});

describe('profileSchema', () => {
  test('accepts a well-formed profile', () => {
    const profile = { id: 1, nickname: 'Ada', createdAt: '2026-01-02T03:04:05.000Z' };
    assert.deepEqual(profileSchema.parse(profile), profile);
  });

  test('rejects a non-positive or non-integer id', () => {
    const base = { nickname: 'Ada', createdAt: '2026-01-02T03:04:05.000Z' };
    assert.equal(profileSchema.safeParse({ ...base, id: 0 }).success, false);
    assert.equal(profileSchema.safeParse({ ...base, id: 1.5 }).success, false);
  });
});
