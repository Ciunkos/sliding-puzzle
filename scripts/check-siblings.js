// Every test sits next to the file it covers: src/x/foo.test.ts needs src/x/foo.ts or foo.tsx.
// A test without a subject is either misplaced or tests something that no longer exists.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isEntrypoint, report } from './cli.js';

const TEST = /\.test\.tsx?$/;

/**
 * @param {string[]} files repo-relative paths
 * @returns {string[]} one message per test file that has no sibling subject
 */
export function testsWithoutSubject(files) {
  const known = new Set(files);
  return files
    .filter((file) => file.startsWith('src/') && TEST.test(file))
    .filter((file) => {
      const base = file.replace(TEST, '');
      return !known.has(`${base}.ts`) && !known.has(`${base}.tsx`);
    })
    .map(
      (file) =>
        `${file} has no sibling source file. Name the test after the file it covers (foo.ts -> foo.test.ts) and keep them in the same folder.`,
    );
}

function main() {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src'], {
    encoding: 'utf8',
  })
    .split('\n')
    // ls-files still lists tracked files that were deleted in the working tree.
    .filter((path) => path !== '' && existsSync(path));
  report('check-siblings', testsWithoutSubject(files), 'every test has its subject next to it');
}

if (isEntrypoint(import.meta.url)) main();
