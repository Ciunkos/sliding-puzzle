// Cloudflare Workers entry. Migrations are applied by `wrangler d1 migrations apply`, not here.
// Never import ../db/server.ts in this file: it pulls in node:sqlite, which Workers do not have.
import { createD1Db, type D1Like } from '../db/index.ts';
import { createApp } from './create-app.ts';

interface Env {
  DB: D1Like;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // Cheap to build per request. Test routes are never enabled in the Worker.
    const app = createApp({ db: createD1Db(env.DB) });
    return Promise.resolve(app.fetch(request));
  },
};
