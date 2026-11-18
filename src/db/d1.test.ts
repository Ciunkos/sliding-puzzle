// Runs the shared Db contract against a real local D1 (workerd via Miniflare), not a fake, so the
// atomicity case checks D1's own batch() transaction and our driver's use of it.
import { after, before } from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { dbContract } from './contract.ts';
import { createD1Db } from './index.ts';
import type { D1Like } from './index.ts';

// One binding per contract case gives every case a fresh, empty database without restarting
// workerd. Raise this if the contract grows past it; makeDb fails loudly when the pool runs out.
const POOL_SIZE = 32;
const bindings = Array.from({ length: POOL_SIZE }, (_, i) => `DB_${String(i)}`);

/** miniflare types the binding with @cloudflare/workers-types, which is not installed: check it. */
function asD1(value: unknown): D1Like {
  if (typeof value !== 'object' || value === null) throw new TypeError('not a D1 binding');
  const { prepare, batch } = value as Record<string, unknown>;
  if (typeof prepare !== 'function' || typeof batch !== 'function') {
    throw new TypeError('D1 binding lacks prepare() or batch()');
  }
  return value as D1Like;
}

let mf: Miniflare | undefined;
let next = 0;

before(async () => {
  // No persistence path: Miniflare keeps D1 in a temp dir under os.tmpdir() and removes it on dispose.
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-01',
      script: 'export default { fetch: () => new Response(null, { status: 404 }) };',
      d1Databases: bindings,
    }),
  );
  await mf.ready;
});

after(async () => {
  await mf?.dispose();
});

dbContract('createD1Db (Miniflare D1)', async () => {
  const name = bindings[next];
  next += 1;
  if (mf === undefined) throw new Error('Miniflare is not started');
  if (name === undefined) {
    throw new Error(`D1 pool exhausted: raise POOL_SIZE above ${String(POOL_SIZE)}`);
  }
  return createD1Db(asD1(await mf.getD1Database(name)));
});
