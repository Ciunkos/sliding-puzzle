// Hono routes of one game: /api/profiles/:nickname/games/:gameId (GET, POST), .../move, .../reset.
import { type Context, Hono } from 'hono';
import type { GameDefinition } from './index.ts';
import type { GameFailure, GameResult, GameService } from './service.ts';

/** What the engine needs from the profile module: resolve a nickname to an id. */
export interface ProfileLookup {
  find(nickname: string): Promise<{ id: number } | undefined>;
}

const FAILURES: Record<GameFailure, { status: 404 | 409; error: string }> = {
  'no-game': { status: 404, error: 'no active game' },
  'illegal-move': { status: 409, error: 'illegal move' },
  'already-finished': { status: 409, error: 'game already finished' },
};

function respond<State>(c: Context, result: GameResult<State>): Response {
  if (result.ok) return c.json(result.game, 200);
  const failure = FAILURES[result.reason];
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

export function gameRoutes<State, Move, Options>(
  definition: GameDefinition<State, Move, Options>,
  service: GameService<State, Move, Options>,
  profiles: ProfileLookup,
): Hono {
  const base = `/api/profiles/:nickname/games/${definition.id}`;
  const withProfile = profileGuard(profiles);
  const app = new Hono();

  app.get(
    base,
    withProfile(async (c, profileId) => {
      const game = await service.get(profileId);
      return game === undefined ? c.json({ error: 'no active game' }, 404) : c.json(game, 200);
    }),
  );

  app.post(
    base,
    withProfile(async (c, profileId) => {
      const options = definition.optionsSchema.safeParse(await readBody(c));
      if (!options.success) return c.json({ error: 'invalid game options' }, 400);
      return c.json(await service.start(profileId, options.data), 201);
    }),
  );

  app.post(
    `${base}/move`,
    withProfile(async (c, profileId) => {
      const move = definition.moveSchema.safeParse(await readBody(c));
      if (!move.success) return c.json({ error: 'invalid move request' }, 400);
      return respond(c, await service.move(profileId, move.data));
    }),
  );

  app.post(
    `${base}/reset`,
    withProfile(async (c, profileId) => respond(c, await service.reset(profileId))),
  );

  return app;
}
