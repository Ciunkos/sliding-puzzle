// Migration folders written by hand for migrator tests: a literal map of file name to SQL becomes a
// fresh temp directory. Call removeMigrationDirs() from node:test's after() to delete them all.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs: string[] = [];

/** Writes `files` ({ '001_init.sql': 'CREATE TABLE ...;' }) into a new temp dir and returns its path. */
export async function writeMigrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'db-migrations-'));
  dirs.push(dir);
  await Promise.all(Object.entries(files).map(([name, sql]) => writeFile(join(dir, name), sql)));
  return dir;
}

/** Adds one more file to a directory made by writeMigrations. */
export async function addMigration(dir: string, name: string, sql: string): Promise<void> {
  await writeFile(join(dir, name), sql);
}

/** Deletes every directory made by writeMigrations. */
export async function removeMigrationDirs(): Promise<void> {
  const all = dirs.splice(0);
  await Promise.all(all.map((dir) => rm(dir, { recursive: true, force: true })));
}
