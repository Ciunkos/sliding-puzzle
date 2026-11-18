import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Db, Statement } from './index.ts';

const appliedRows = z.array(z.object({ name: z.string() }));

/**
 * Splits a migration file into statements on `;` followed by a newline. Limitation: a `;` followed
 * by a newline inside a string literal or a trigger body will split the statement wrongly.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;[ \t]*\r?\n/)
    .map((part) => part.trim().replace(/;$/, '').trim())
    .filter((part) => part.replace(/--[^\n]*/g, '').trim() !== '');
}

/**
 * Applies every `*.sql` file in `migrationsDir` that is not yet recorded in `_migrations`, in
 * filename order. Each file runs as one atomic batch together with its bookkeeping row.
 */
export async function migrate(db: Db, migrationsDir: string): Promise<{ applied: string[] }> {
  await db.run(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const done = new Set(
    appliedRows.parse(await db.all('SELECT name FROM _migrations')).map((row) => row.name),
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const statements: Statement[] = splitStatements(sql).map((text) => ({ sql: text }));
    statements.push({
      sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
      params: [file, new Date().toISOString()],
    });

    try {
      await db.batch(statements);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Migration ${file} failed and was rolled back: ${reason}`, { cause: error });
    }
    applied.push(file);
  }

  return { applied };
}
