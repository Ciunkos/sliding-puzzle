// Blocks real client, employer and people names from commits. The names live OUTSIDE the repo
// ($CLIENT_NAMES_FILE or ~/.config/client-names.txt, one per line, # comments), so the list itself
// is never committed. Without that file (for example on CI) the check is a no-op.
//   node scripts/check-client-names.js --staged      added lines and paths of the staged diff
//   node scripts/check-client-names.js --msg <file>  a commit message
//   node scripts/check-client-names.js --all         every tracked file and the whole history
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { isEntrypoint, report } from './cli.js';

/** @param {string} text the denylist file content */
export function parseNames(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
}

/**
 * Whole-word, case-insensitive, Unicode-aware: "Acme" matches "acme's" but not "acmeology".
 * @param {string[]} names
 * @returns {RegExp | undefined} undefined when there is nothing to look for
 */
export function nameMatcher(names) {
  if (names.length === 0) return undefined;
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * @param {RegExp} matcher
 * @param {string} where label for the message
 * @param {string} text
 */
export function findNames(matcher, where, text) {
  return text.split('\n').flatMap((line, index) => {
    const match = matcher.exec(line);
    return match ? [`${where}:${String(index + 1)}: "${match[1] ?? ''}"`] : [];
  });
}

/** Only the added lines of a unified diff, labelled with their file. */
export function addedLines(diff) {
  let file = '';
  return diff.split('\n').flatMap((line) => {
    if (line.startsWith('+++ ')) {
      file = line.slice(6);
      return [];
    }
    return line.startsWith('+') ? [{ file, text: line.slice(1) }] : [];
  });
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

function scanStaged(matcher) {
  const paths = findNames(matcher, 'staged path', git('diff', '--cached', '--name-only'));
  const lines = addedLines(git('diff', '--cached', '-U0', '--no-color')).flatMap((line) =>
    findNames(matcher, line.file, line.text),
  );
  return [...paths, ...lines];
}

function scanAll(matcher) {
  const tracked = git('ls-files').split('\n').filter(Boolean);
  const contents = tracked.filter(existsSync).flatMap((path) => {
    const buffer = readFileSync(path);
    return buffer.includes(0) ? [] : findNames(matcher, path, buffer.toString('utf8'));
  });
  const history = git('log', '--all', '-p', '--no-color', '--format=commit %h%n%B');
  return [
    ...findNames(matcher, 'tracked path', tracked.join('\n')),
    ...contents,
    ...findNames(matcher, 'history', history),
  ];
}

function scanMessage(matcher, file) {
  const message = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
  return findNames(matcher, 'commit message', message);
}

function main() {
  const listFile = process.env.CLIENT_NAMES_FILE ?? join(homedir(), '.config', 'client-names.txt');
  const matcher = existsSync(listFile)
    ? nameMatcher(parseNames(readFileSync(listFile, 'utf8')))
    : undefined;
  if (matcher === undefined) return;
  const [mode, argument] = process.argv.slice(2);
  const scans = {
    '--staged': () => scanStaged(matcher),
    '--all': () => scanAll(matcher),
    '--msg': () => scanMessage(matcher, argument ?? ''),
  };
  const scan = scans[mode ?? ''];
  if (scan === undefined) {
    console.error('usage: check-client-names.js --staged | --msg <file> | --all');
    process.exitCode = 2;
    return;
  }
  const hits = scan().slice(0, 20);
  report('check-client-names', hits, 'no denylisted names');
  if (hits.length > 0) console.error('Use a generic name instead. The list is outside the repo.');
}

if (isEntrypoint(import.meta.url)) main();
