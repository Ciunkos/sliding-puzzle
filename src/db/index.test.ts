// The shared Db contract against the D1 driver on a real local D1 (workerd through Miniflare),
// so the atomicity case checks D1's own batch() transaction and the driver's use of it.
import { after } from 'node:test';
import { closeTestD1, openTestD1Binding } from '../test-support/d1.ts';
import { dbContract } from '../test-support/db.contract.ts';
import { createD1Db } from './index.ts';

after(closeTestD1);

dbContract('createD1Db on a local D1', async () => createD1Db(await openTestD1Binding()));
