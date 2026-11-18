// Assertion guard. A commit that changes or removes lines in EXISTING tests while also changing
// production code must say why, with a "Reason: ..." line in the commit message. Agents (and people)
// make a red test green by editing the test; this makes that visible and deliberate.
//   node scripts/check-assertions.js --msg <file>          staged changes + the message being written
//   node scripts/check-assertions.js --range <base>..<head> every commit in the range (CI)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { isEntrypoint, report } from './cli.js';

const TEST_FILE = /\.(test|spec)\.tsx?$/;
const REASON = /^Reason: \S.{9,}$/m;

/** @param {string} numstat output of `git diff --numstat` / `git show --numstat --format=` */
export function parseNumstat(numstat) {
  return numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...path] = line.split('\t');
      return { path: path.join('\t'), added: Number(added) || 0, deleted: Number(deleted) || 0 };
    });
}

/**
 * True when existing test lines were changed or removed in the same change as production code.
 * Adding tests, or changing only tests, needs no reason.
 * @param {{path: string, added: number, deleted: number}[]} changes
 */
export function needsReason(changes) {
  const editedTests = changes.some((c) => TEST_FILE.test(c.path) && c.deleted > 0);
  const production = changes.some(
    (c) =>
      c.path.startsWith('src/') &&
      !c.path.startsWith('src/test-support/') &&
      !TEST_FILE.test(c.path),
  );
  return editedTests && production;
}

/** @param {string} message a commit message */
export function hasReason(message) {
  return REASON.test(message);
}

const PROBLEM =
  'existing test lines were changed together with production code, but the commit message has no ' +
  '"Reason: <why the expectation changed>" line (at least 10 characters). If the test was wrong, ' +
  'say why. If the code was wrong, fix the code and leave the test alone.';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function checkMessage(file) {
  const message = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
  const changes = parseNumstat(git('diff', '--cached', '--numstat'));
  return needsReason(changes) && !hasReason(message) ? [`this commit: ${PROBLEM}`] : [];
}

function checkRange(range) {
  const commits = git('log', '--format=%H', '--no-merges', range).split('\n').filter(Boolean);
  return commits.flatMap((hash) => {
    const changes = parseNumstat(git('show', '--numstat', '--format=', hash));
    const message = git('log', '-1', '--format=%B', hash);
    return needsReason(changes) && !hasReason(message) ? [`${hash.slice(0, 7)}: ${PROBLEM}`] : [];
  });
}

function main() {
  const [mode, argument] = process.argv.slice(2);
  if ((mode !== '--msg' && mode !== '--range') || argument === undefined) {
    console.error('usage: check-assertions.js --msg <file> | --range <base>..<head>');
    process.exitCode = 2;
    return;
  }
  const problems = mode === '--msg' ? checkMessage(argument) : checkRange(argument);
  report('check-assertions', problems, 'no unexplained test edits');
}

if (isEntrypoint(import.meta.url)) main();
