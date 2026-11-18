# Deploying

The app is one Cloudflare Worker with static assets and a D1 database, served at
`https://ciunkos.com/sliding-puzzle` through the zone routes in `wrangler.toml`. It is deployed by
hand from a laptop. Run every command from the repository root. `npx wrangler` uses the wrangler
version pinned in `package.json`.

## Once: create the database and the secret

1. **Log in.** `npx wrangler login` opens the browser. To check it worked, run
   `npx wrangler whoami`: it names the account that owns the `ciunkos.com` zone.

2. **Create the D1 database.** `npx wrangler d1 create sliding-puzzle` prints a `database_id`.
   Paste it into `wrangler.toml` in place of `REPLACE_WITH_REAL_ID` (under `[[d1_databases]]`)
   and commit that change. The id is not a secret. To check, `npx wrangler d1 list` shows
   `sliding-puzzle`.

3. **Set the analytics token (optional).** `npx wrangler secret put POSTHOG_PROJECT_TOKEN`, then
   paste the PostHog project token when it asks. Type it only at that prompt. Never put it on the
   command line (it would land in shell history), in `wrangler.toml` or in any file in the repo.
   To check, `npx wrangler secret list` shows the name and not the value. Without the secret the
   app works and sends no statistics. An EU project needs nothing else. For another region, add
   `POSTHOG_HOST` (for example `https://us.i.posthog.com`) as a plain var or a secret.

## Every deploy

The short way is `npm run deploy`. npm runs `predeploy` first, which does steps 1 to 4 below, and
then `deploy` does steps 5 and 6. It stops at the first step that fails. Step by step:

1. `npm run check` must end without an error. It covers format, lint, types, unit and gate tests,
   the computed checks and the build.
2. `npm run test:e2e` must report all tests passed. It runs the `phone`, `desktop`, `app` and
   `worker` projects. `worker` is the rehearsal: the production build on `wrangler dev` (the
   Worker runtime) over a local D1 that every migration ran on (`.e2e/wrangler-state`, not your
   `worker:dev` state). It needs no login. To run only the rehearsal:
   `npx playwright test --project worker`.
3. `npm run worker:check` must end with `--dry-run: exiting now.` It proves the Worker bundle
   builds for Cloudflare.
4. `npx wrangler d1 migrations apply sliding-puzzle --remote` applies new migrations to the real
   database. It lists what it will apply and asks first. To check it worked, run
   `npx wrangler d1 migrations list sliding-puzzle --remote`, which should say there are no
   migrations to apply.
5. `npx wrangler deploy` uploads the Worker and the assets in `dist/web` and prints a Version ID.
   Keep that id. The routes it lists must be `ciunkos.com/sliding-puzzle*` and
   `www.ciunkos.com/sliding-puzzle*`.
6. `sh tests/prod.sh` smoke-tests production with curl. Every line must say `ok`. It ends with
   `smoke: all N checks passed` and exit status 0. It creates no data. The same script also runs
   against a local server: `BASE_URL=http://localhost:8797 sh tests/prod.sh` (it skips the www
   check there).

To see server errors after a deploy, run `npx wrangler tail`. Unexpected errors are logged with
the method and path, and the client only ever sees `{"error":"internal error"}`.

## Rolling back

`npx wrangler deployments list` shows recent versions. `npx wrangler rollback` goes back to the
previous one, and `npx wrangler rollback <version-id>` goes to a given one. Then run
`sh tests/prod.sh` again.

Rollback changes the code and the assets only. **D1 migrations are forward-only**. Nothing undoes
them, and a rollback leaves the schema as it is. So migrations must stay additive: the previous
version of the code has to keep working on the new schema. For this schema that means:

- a new table (`results` in 0005) or a new nullable column (`last_batch_id` in 0004, `score` in 0006) is safe, because older code does not read it;
- older code that inserts into `results` without the newer column writes NULL there, so the new
  code must accept NULL in every column it adds;
- dropping or renaming a table or column (as 0003 did, before any production data) breaks the
  rollback target. Do it in two deploys: first stop using it, then drop it once the old code
  can no longer come back.

To undo a bad migration, write a new migration that repairs it, rehearse it
(`npm run test:e2e` applies every migration to an empty local D1), and deploy. Export the data
before a risky one: `npx wrangler d1 export sliding-puzzle --remote --output backup.sql`. Keep the
export out of the repo, because it holds the nicknames.

## What only shows on real Cloudflare

The rehearsal runs the same Worker and assets, but some things only exist on the edge. Check them
by hand after the first deploy, and again whenever `wrangler.toml` or `src/server/paths.ts` changes:

- **The zone routes.** `wrangler dev` ignores `routes`. Only production shows that
  `ciunkos.com/sliding-puzzle*` reaches this Worker and that the rest of `ciunkos.com` does not.
  `tests/prod.sh` checks `/sliding-puzzle-x` (404 from this Worker). Open `https://ciunkos.com`
  as well, to see that the site's own pages still answer.
- **`_headers` on the edge.** The build writes `dist/web/_headers` (immutable hashed files, the
  service worker's `no-store` and `Service-Worker-Allowed`). `tests/prod.sh` checks both.
- **The www redirect.** `www.ciunkos.com` needs a proxied DNS record in the zone for the route to
  see it. `tests/prod.sh` checks the 301 to the apex.
- **Service-worker updates across deploys.** A player who has the app open keeps the old version
  until they press Reload in "A new version is ready". After a deploy, open the app in a browser
  that had the old version: the bar appears, and Reload brings the new one. The old version keeps
  calling the same API, so an API change must stay compatible with the version before it.
- **A 404 for a hashed file marked immutable.** The `_headers` rule for
  `/sliding-puzzle/assets/*` also matches a file that is missing. Cloudflare (and `wrangler dev`,
  as the rehearsal showed) then puts `Cache-Control: public, max-age=31536000, immutable` on the 404. A browser or a cache could keep that 404 for a year. That happens when a page from an
  older deploy asks for a chunk that the new deploy no longer has, and the chunk would stay
  broken after a fix. The workaround is in `src/server/worker.ts`: a missing file reaches the
  Worker, which fetches it from the assets and rewrites any error answer to
  `Cache-Control: no-store` (the Node server never sets the header on an error). The rehearsal
  and `tests/prod.sh` both check that a missing hashed file is 404 and not immutable. If
  production ever fails that check, the edge served the 404 without the Worker. Then add
  `"/sliding-puzzle/assets/*"` to `run_worker_first`, which costs one Worker invocation per
  asset request.

## Branch protection (GitHub, once)

In the repository settings, under Branches, add a rule for `main`:

- require a pull request before merging;
- require these status checks to pass: `Check (format, lint, types, tests, gates, build)`,
  `End-to-end (Playwright)` and `Mutation testing (do the tests fail when the code is wrong?)`;
- require branches to be up to date before merging;
- do not allow bypassing the rule, and block force pushes and deletions.

Deploy only from `main` after its CI is green.
