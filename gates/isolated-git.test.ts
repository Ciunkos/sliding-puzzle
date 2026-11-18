// The gates self-test runs git inside a throwaway clone. Git exports GIT_DIR (and friends) to
// hooks, so a self-test started from a hook would inherit them and run its commands against the
// REAL repository. That happened once: fixture commits reached the public branch. These tests
// keep the isolation honest.
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitDirOf, isInside, isolatedGitEnv } from './isolated-git.ts';

test('every GIT_ variable a hook exports is dropped', () => {
  const env = isolatedGitEnv({
    PATH: '/usr/bin',
    GIT_DIR: '/real/repo/.git',
    GIT_WORK_TREE: '/real/repo',
    GIT_INDEX_FILE: '/real/repo/.git/index',
    GIT_PREFIX: 'src/',
  });
  assert.deepEqual(env, { PATH: '/usr/bin', GATES_SELF_TEST: '1' });
});

test('the test runner context is dropped, so a nested node --test fails by exit code', () => {
  const env = isolatedGitEnv({ PATH: '/usr/bin', NODE_TEST_CONTEXT: 'child-v8' });
  assert.deepEqual(env, { PATH: '/usr/bin', GATES_SELF_TEST: '1' });
});

test('a path is inside a folder only at a path boundary', () => {
  assert.equal(isInside('/tmp/gates-abc/.git', '/tmp/gates-abc'), true);
  assert.equal(isInside('/tmp/gates-abc', '/tmp/gates-abc'), true);
  assert.equal(isInside('/tmp/gates-abcd/.git', '/tmp/gates-abc'), false);
  assert.equal(isInside('/real/repo/.git', '/tmp/gates-abc'), false);
});

test('with GIT_DIR pointing at another repository, git still acts on the folder it runs in', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'isolated-')));
  const hostile = { ...process.env, GIT_DIR: join(process.cwd(), '.git') };
  const found = gitDirOf(dir, isolatedGitEnv(hostile), ['init', '-q']);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(found, join(dir, '.git'));
});
