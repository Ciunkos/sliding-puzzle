// A real local Cloudflare D1 for tests (workerd through Miniflare), not a fake. One Miniflare
// instance serves every call; each call hands out a different, empty database from a fixed pool.
// Miniflare keeps D1 in a temp dir under os.tmpdir() (no persistence path, nothing in the repo)
// and removes it on dispose: call closeTestD1() from node:test's after().
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import type { D1Like } from '../db/index.ts';

// Bindings are fixed when workerd starts, so fresh databases come from a pool. Raise this if a
// test file opens more; openTestD1Binding fails loudly when the pool runs out.
const POOL_SIZE = 32;
const BINDINGS = Array.from({ length: POOL_SIZE }, (_, i) => `DB_${String(i)}`);

let started: Promise<Miniflare> | undefined;
let next = 0;

function start(): Promise<Miniflare> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-01',
      script: 'export default { fetch: () => new Response(null, { status: 404 }) };',
      d1Databases: BINDINGS,
    }),
  );
  return mf.ready.then(() => mf);
}

/** miniflare types the binding with @cloudflare/workers-types, which is not installed: check it. */
function asD1(value: unknown): D1Like {
  if (typeof value !== 'object' || value === null) throw new TypeError('not a D1 binding');
  const { prepare, batch } = value as Record<string, unknown>;
  if (typeof prepare !== 'function' || typeof batch !== 'function') {
    throw new TypeError('D1 binding lacks prepare() or batch()');
  }
  return value as D1Like;
}

/** A D1 binding to a fresh, empty database. Starts Miniflare on the first call. */
export async function openTestD1Binding(): Promise<D1Like> {
  const name = BINDINGS[next];
  next += 1;
  if (name === undefined) {
    throw new Error(`D1 pool exhausted: raise POOL_SIZE above ${String(POOL_SIZE)}`);
  }
  started ??= start();
  const mf = await started;
  return asD1(await mf.getD1Database(name));
}

/** Stops Miniflare and deletes its databases. Safe to call when it never started. */
export async function closeTestD1(): Promise<void> {
  const mf = started;
  started = undefined;
  next = 0;
  await (await mf)?.dispose();
}
