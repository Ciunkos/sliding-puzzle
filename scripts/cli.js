// Shared by the check scripts: run main() only when the file is executed, not when a test imports it.
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** @param {string} moduleUrl import.meta.url of the calling script */
export function isEntrypoint(moduleUrl) {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(moduleUrl);
}

/** Prints the problems and exits 1, or prints the ok line. */
export function report(name, problems, okLine) {
  if (problems.length === 0) {
    console.log(`${name}: ${okLine}`);
    return;
  }
  console.error(`${name}: ${String(problems.length)} problem(s)\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
