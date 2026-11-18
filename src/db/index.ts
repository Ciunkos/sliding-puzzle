// Isomorphic entry: the Db port types and the Cloudflare D1 driver. No node:* imports here, so a
// Worker can import it. The Node driver and the migrator live in server.ts.

export type SqlParam = string | number | null;

/** A result row. Callers validate the shape with zod; the driver does not. */
export type Row = Record<string, unknown>;

export interface Statement {
  sql: string;
  params?: readonly SqlParam[];
}

export interface Db {
  run(sql: string, params?: readonly SqlParam[]): Promise<{ changes: number }>;
  all(sql: string, params?: readonly SqlParam[]): Promise<Row[]>;
  get(sql: string, params?: readonly SqlParam[]): Promise<Row | undefined>;
  /** Atomic: every statement commits, or none does. */
  batch(statements: readonly Statement[]): Promise<void>;
}

// Minimal structural types for the D1 binding. Defined here so @cloudflare/workers-types is not needed.

export interface D1PreparedLike {
  bind(...values: SqlParam[]): D1PreparedLike;
  run(): Promise<{ meta: { changes: number } }>;
  all(): Promise<{ results: unknown[] }>;
  first(): Promise<unknown>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
  batch(stmts: D1PreparedLike[]): Promise<unknown[]>;
}

function toRow(value: unknown): Row {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('D1 returned a row that is not an object');
  }
  return { ...value };
}

export function createD1Db(binding: D1Like): Db {
  function prepare(sql: string, params: readonly SqlParam[] = []): D1PreparedLike {
    return binding.prepare(sql).bind(...params);
  }

  return {
    async run(sql, params) {
      const result = await prepare(sql, params).run();
      return { changes: result.meta.changes };
    },
    async all(sql, params) {
      const result = await prepare(sql, params).all();
      return result.results.map(toRow);
    },
    async get(sql, params) {
      const row = await prepare(sql, params).first();
      if (row === null || row === undefined) return undefined;
      return toRow(row);
    },
    async batch(statements) {
      // D1 batch() runs its statements in one transaction and rolls back on any failure.
      await binding.batch(statements.map((s) => prepare(s.sql, s.params)));
    },
  };
}
