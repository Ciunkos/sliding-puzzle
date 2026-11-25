// Proves the git hooks REJECT what they are meant to reject, on a throwaway clone of this repo.
// A gate that has only ever passed proves nothing. Each case commits (or pushes) one bad change
// and expects a refusal that names the problem; a control case shows a clean change is accepted.
// The gate files on disk (.githooks, scripts, the oxlint config and lint/, package.json) are copied
// over the clone, so uncommitted edits to the gates are what is tested.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { after, before, describe, test } from 'node:test';
import { assertIsolated, SELF_TEST_ENV } from './isolated-git.ts';

const ROOT = resolve(import.meta.dirname, '..');
const GATE_FILES = [
  '.githooks',
  'scripts',
  'gates',
  'oxlint.config.ts',
  'lint',
  'package.json',
  'tsconfig.json',
];
// pre-push runs `npm run check`, which runs this file again inside the clone: stop the recursion.
const NESTED = process.env.GATES_SELF_TEST === '1';
// NODE_TEST_CONTEXT is set by the test runner for its children. If the hooks inherited it, the
// `node --test` they start would act as a nested child and stop failing through its exit code.
// Never the inherited environment: see isolated-git.ts for why.
const ENV = SELF_TEST_ENV;

let repo = '';

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env: ENV });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function write(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
}

/** Stages the files and tries to commit them; a refused commit is rolled back. */
function commit(files: Record<string, string>, message = 'Add a fixture') {
  write(files);
  git('add', '-A');
  const result = git('commit', '-m', message);
  if (result.status !== 0) {
    git('reset', '-q', '--hard', 'HEAD');
    git('clean', '-fdq');
  }
  return result;
}

const SUBJECT = { 'src/profile/greeting.ts': "export const GREETING = 'hello';\n" };
const testFile = (body: string) => ({
  ...SUBJECT,
  'src/profile/greeting.test.ts': `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GREETING } from './greeting.ts';

test('the greeting is a friendly word', () => {
${body}
});
`,
});

if (!NESTED) {
  before(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'gates-')));
    execFileSync('git', ['clone', '-q', ROOT, repo], { env: ENV });
    // Before the first commit: git here must act on the clone and nothing else.
    assertIsolated(repo, ENV);
    for (const path of GATE_FILES) cpSync(join(ROOT, path), join(repo, path), { recursive: true });
    symlinkSync(join(ROOT, 'node_modules'), join(repo, 'node_modules'));
    git('config', 'user.email', 'gates@example.test');
    git('config', 'user.name', 'Gates Self Test');
    git('config', 'core.hooksPath', '.githooks');
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'Baseline with the gate files under test');
  });

  after(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('pre-commit', () => {
    test('accepts a clean change (control: the refusals below are not incidental)', () => {
      const result = commit(testFile("  assert.equal(GREETING, 'hello');"));
      assert.equal(result.status, 0, result.output);
    });

    test('refuses a deep import into another module', () => {
      const result = commit({ 'src/game/reach.ts': "import '../profile/api.ts';\n\nexport {};\n" });
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Deep import into another module/);
    });

    test('refuses the engine importing a feature', () => {
      const result = commit({
        'src/game/reach.ts': "import '../puzzle/index.ts';\n\nexport {};\n",
      });
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Module "game" may only depend on/);
    });

    test('refuses a test with an if', () => {
      const result = commit(
        testFile("  if (GREETING.length > 0) {\n    assert.equal(GREETING, 'hello');\n  }"),
      );
      assert.notEqual(result.status, 0);
      assert.match(result.output, /no-restricted-syntax/);
    });

    test('refuses Math.random in a test', () => {
      const result = commit(
        testFile("  assert.equal(Math.random() < 2, true);\n  assert.equal(GREETING, 'hello');"),
      );
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Math\.random/);
    });

    test('refuses an expected value that is computed', () => {
      const result = commit(testFile('  assert.equal(GREETING, GREETING.toLowerCase());'));
      assert.notEqual(result.status, 0);
      assert.match(result.output, /test-standard\(literal-expected\)/);
    });

    test('refuses a type error', () => {
      const result = commit({
        'src/profile/greeting.ts': "export const GREETING: number = 'hello';\n",
      });
      assert.notEqual(result.status, 0);
      assert.match(result.output, /TS2322/);
    });

    test('refuses an unformatted file', () => {
      const result = commit({ 'src/profile/greeting.ts': "export const GREETING   =  'hello'\n" });
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Code style issues|\[warn\]/);
    });
  });

  describe('commit-msg', () => {
    const editedTestAndCode = () => {
      const test = 'src/profile/form.test.ts';
      const code = 'src/profile/form.ts';
      return {
        [test]: readFileSync(join(repo, test), 'utf8').replace(
          /test\('([^']+)'/,
          "test('$1 indeed'",
        ),
        [code]: `${readFileSync(join(repo, code), 'utf8')}\n// touched by the gates self-test\n`,
      };
    };

    test('refuses an edited test with production code when the message gives no reason', () => {
      const result = commit(editedTestAndCode(), 'Change the form');
      assert.notEqual(result.status, 0);
      assert.match(result.output, /has no "Reason: /);
    });

    test('accepts the same change when the message says why', () => {
      const result = commit(
        editedTestAndCode(),
        'Change the form\n\nReason: the test name was misleading, behaviour is unchanged.',
      );
      assert.equal(result.status, 0, result.output);
    });
  });

  describe('pre-push', () => {
    test('refuses to push a failing unit test', () => {
      const remote = mkdtempSync(join(tmpdir(), 'gates-remote-'));
      execFileSync('git', ['init', '-q', '--bare', remote], { env: ENV });
      git('remote', 'add', 'selftest', remote);
      const committed = commit(
        testFile("  assert.equal(GREETING, 'goodbye');"),
        'Add a failing test',
      );
      assert.equal(committed.status, 0, committed.output);

      const pushed = git('push', 'selftest', 'HEAD:refs/heads/main');
      rmSync(remote, { recursive: true, force: true });

      assert.notEqual(pushed.status, 0);
      assert.match(pushed.output, /pre-push: check FAILED/);
      // Refused because of the failing test, not for some unrelated reason.
      assert.match(pushed.output, /the greeting is a friendly word/);
    });
  });
}
