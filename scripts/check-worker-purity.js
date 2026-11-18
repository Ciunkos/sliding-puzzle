// The Cloudflare Worker has no Node APIs. Everything reachable from the Worker entry must be free
// of `node:` imports, or the deploy fails (or worse, fails at runtime). Local SQLite and the
// migrator live behind db/server.ts, which the Worker must never reach.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { isEntrypoint, report } from './cli.js';

const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const TYPE_ONLY = /(?:^|\n)\s*(?:import|export)\s+type\s[^'"\n]*?\sfrom\s+['"]([^'"]+)['"]/g;

/** Runtime import specifiers of a module's source (type-only imports are erased, so they are skipped). */
export function runtimeImports(source) {
  const typeOnly = new Set([...source.matchAll(TYPE_ONLY)].map((match) => match[1]));
  return [...source.matchAll(SPECIFIER)].map((match) => match[1]).filter((s) => !typeOnly.has(s));
}

/**
 * Walks relative imports from `entry` and returns one message per `node:` import found.
 * @param {string} entry repo-relative path
 * @param {(path: string) => string | undefined} read returns a file's source, or undefined if missing
 */
export function nodeImportsReachableFrom(entry, read) {
  const seen = new Set();
  const problems = [];
  const queue = [{ path: normalize(entry), via: [] }];
  while (queue.length > 0) {
    const { path, via } = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const source = read(path);
    if (source === undefined) continue;
    for (const specifier of runtimeImports(source)) {
      const trail = [...via, path];
      if (specifier.startsWith('node:')) {
        problems.push(
          `${path} imports ${specifier} and is bundled into the Worker (${trail.join(' -> ')}). ` +
            'Move the Node-only code behind a server-only entry the Worker does not import.',
        );
      } else if (specifier.startsWith('.')) {
        queue.push({ path: normalize(join(dirname(path), specifier)), via: trail });
      }
    }
  }
  return problems;
}

function main() {
  const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);
  const problems = nodeImportsReachableFrom('src/server/worker.ts', read);
  report('check-worker-purity', problems, 'the Worker bundle imports no node: modules');
}

if (isEntrypoint(import.meta.url)) main();
