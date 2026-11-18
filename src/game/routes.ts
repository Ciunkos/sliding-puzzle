// Hono routes of one game: /api/profiles/:nickname/games/:gameId (GET, PUT, POST), .../moves,
// .../move, .../reset, .../results.
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { batchIdSchema, type GameDefinition, MAX_BATCH } from './index.ts';
import type { BatchResult, GameFailure, GameResult, GameService } from './service.ts';

/** What the engine needs from the profile module: resolve a nickname to an id. */
export interface ProfileLookup {
  find(nickname: string): Promise<{ id: number } | undefined>;
}

const FAILURES: Record<GameFailure, { status: 404 | 409; error: string }> = {
  'no-game': { status: 404, error: 'no active game' },
  'illegal-move': { status: 409, error: 'illegal move' },
  'already-finished': { status: 409, error: 'game already finished' },
};

const baseVersion = z.number().int().min(1);
const resetBody = z.object({ baseVersion });

function respond<State>(c: Context, result: GameResult<State> | BatchResult<State>): Response {
  if (result.ok) return c.json(result.game, 200);
  if (result.reason === 'stale') return c.json({ error: 'stale', game: result.game }, 409);
  const failure = FAILURES[result.reason];
  // A rejected batch carries the stored game, so the browser can adopt it.
  if ('game' in result) return c.json({ error: failure.error, game: result.game }, failure.status);
  return c.json({ error: failure.error }, failure.status);
}

/** The JSON body; an empty body counts as `{}`; undefined when the body is not JSON. */
async function readBody(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

type ProfileHandler = (c: Context, profileId: number) => Promise<Response>;

/** Wraps a handler so it runs only for a known profile; every route answers 404 for an unknown nickname. */
function profileGuard(profiles: ProfileLookup) {
  return (handler: ProfileHandler) => async (c: Context) => {
    const profile = await profiles.find(c.req.param('nickname') ?? '');
    if (profile === undefined) return c.json({ error: 'profile not found' }, 404);
    return handler(c, profile.id);
  };
}

const invalid = (c: Context, error: string) => c.json({ error }, 400);

/** The handlers of a batch of moves and of a single move. */
function moveHandlers<State, Move>(
  definition: GameDefinition<State, Move, unknown>,
  service: GameService<State, Move, unknown>,
) {
  const moveBody = z.object({ baseVersion, move: definition.moveSchema });
  const movesBody = z.object({
    baseVersion,
    batchId: batchIdSchema,
    moves: z.array(definition.moveSchema).min(1).max(MAX_BATCH),
    elapsedMs: z.number().int().min(0).optional(),
  });
  return {
    moves: async (c, profileId) => {
      const body = movesBody.safeParse(await readBody(c));
      if (!body.success) return invalid(c, 'invalid moves request');
      return respond(c, await service.applyMoves(profileId, body.data));
    },
    move: async (c, profileId) => {
      const body = moveBody.safeParse(await readBody(c));
      if (!body.success) return invalid(c, 'invalid move request');
      return respond(c, await service.move(profileId, body.data.move, body.data.baseVersion));
    },
  } satisfies Record<string, ProfileHandler>;
}

/** The handler of every route of one game, each for an already resolved profile. */
function handlers<State, Move, Options>(
  definition: GameDefinition<State, Move, Options>,
  service: GameService<State, Move, Options>,
) {
  /** A handler that gets the game options from the body; invalid options are 400. */
  const withOptions =
    (run: (c: Context, profileId: number, options: Options) => Promise<Response>): ProfileHandler =>
    async (c, profileId) => {
      const options = definition.optionsSchema.safeParse(await readBody(c));
      if (!options.success) return invalid(c, 'invalid game options');
      return run(c, profileId, options.data);
    };

  return {
    get: async (c, profileId) => {
      const game = await service.get(profileId);
      return game === undefined ? c.json({ error: 'no active game' }, 404) : c.json(game, 200);
    },
    // Resume: the saved game (200), or a new one from the options when there is none (201).
    resume: withOptions(async (c, profileId, options) => {
      const { game, created } = await service.resume(profileId, options);
      return c.json(game, created ? 201 : 200);
    }),
    // New game, replacing any existing one.
    start: withOptions(async (c, profileId, options) =>
      c.json(await service.start(profileId, options), 201),
    ),
    ...moveHandlers(definition, service),
    results: async (c, profileId) => c.json(await service.results(profileId), 200),
    reset: async (c, profileId) => {
      const body = resetBody.safeParse(await readBody(c));
      if (!body.success) return invalid(c, 'invalid reset request');
      return respond(c, await service.reset(profileId, body.data.baseVersion));
    },
  } satisfies Record<string, ProfileHandler>;
}

export function gameRoutes<State, Move, Options>(
  definition: GameDefinition<State, Move, Options>,
  service: GameService<State, Move, Options>,
  profiles: ProfileLookup,
): Hono {
  const base = `/api/profiles/:nickname/games/${definition.id}`;
  const withProfile = profileGuard(profiles);
  const handle = handlers(definition, service);
  const app = new Hono();
  app.get(base, withProfile(handle.get));
  app.put(base, withProfile(handle.resume));
  app.post(base, withProfile(handle.start));
  app.post(`${base}/moves`, withProfile(handle.moves));
  app.post(`${base}/move`, withProfile(handle.move));
  app.get(`${base}/results`, withProfile(handle.results));
  app.post(`${base}/reset`, withProfile(handle.reset));
  return app;
}
