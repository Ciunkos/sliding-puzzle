// The deletion test. A feature is a good module if deleting its folder, and the lines that pin it
// in the composition roots, leaves a project that still compiles. This proves the foundations do
// not depend on the feature, so it can be removed or swapped for another one.
// Pins: every line that mentions a feature outside its own folder ends with `// pin: <folder>`.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isEntrypoint, report } from './cli.js';

const PIN = /\/\/ pin: ([a-z][a-z0-9-]*)\s*$/;

/**
 * @param {{path: string, text: string}[]} files
 * @returns {string[]} names of the pinned features, sorted
 */
export function pinnedFeatures(files) {
  const names = files.flatMap((file) =>
    file.text.split('\n').flatMap((line) => {
      const match = PIN.exec(line);
      return match ? [match[1] ?? ''] : [];
    }),
  );
  return [...new Set(names)].sort();
}

/** Removes every line pinned to `feature`. */
export function stripPins(text, feature) {
  return text
    .split('\n')
    .filter((line) => PIN.exec(line)?.[1] !== feature)
    .join('\n');
}

/**
 * Lines outside the feature folder that import it without a pin comment. Such a line would
 * survive the deletion and break the build, so it must be pinned (or removed).
 * @param {{path: string, text: string}[]} files
 * @param {string} feature
 */
export function unpinnedImports(files, feature) {
  const imports = new RegExp(`['"][./]*/${feature}/[^'"]*['"]`);
  return files
    .filter((file) => !file.path.startsWith(`src/${feature}/`))
    .flatMap((file) =>
      file.text
        .split('\n')
        .flatMap((line, index) =>
          imports.test(line) && PIN.exec(line)?.[1] !== feature
            ? [
                `${file.path}:${String(index + 1)} imports the feature "${feature}" without a pin. ` +
                  `Only composition roots may import a feature, and the line must end with "// pin: ${feature}".`,
              ]
            : [],
        ),
    );
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '' && existsSync(path));
}

/** Copies the project without `feature` and its pins into a temp dir and type-checks it there. */
function compilesWithout(feature, paths) {
  const dir = mkdtempSync(join(tmpdir(), `deletion-${feature}-`));
  try {
    for (const path of paths.filter((p) => !p.startsWith(`src/${feature}/`))) {
      cpSync(path, join(dir, path), { recursive: true });
      if (/^src\/.*\.tsx?$/.test(path)) {
        writeFileSync(join(dir, path), stripPins(readFileSync(path, 'utf8'), feature));
      }
    }
    symlinkSync(resolve('node_modules'), join(dir, 'node_modules'));
    const tsc = spawnSync(join(dir, 'node_modules/.bin/tsc'), ['--noEmit', '-p', dir], {
      encoding: 'utf8',
    });
    return tsc.status === 0
      ? []
      : [
          `deleting src/${feature} and its pins breaks the build. A foundation or root depends on it:\n` +
            `${tsc.stdout.split('\n').slice(0, 8).join('\n')}`,
        ];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const paths = trackedFiles();
  const sources = paths
    .filter((path) => /^src\/.*\.tsx?$/.test(path))
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const features = pinnedFeatures(sources);
  if (features.length === 0) {
    report('check-deletion', ['no "// pin: <feature>" lines found, so nothing was proven.'], '');
    return;
  }
  const problems = features.flatMap((feature) => {
    if (!existsSync(join('src', feature))) return [`pin names a missing folder: src/${feature}`];
    const loose = unpinnedImports(sources, feature);
    return loose.length > 0 ? loose : compilesWithout(feature, paths);
  });
  report('check-deletion', problems, `deletable features: ${features.join(', ')}`);
}

if (isEntrypoint(import.meta.url)) main();
