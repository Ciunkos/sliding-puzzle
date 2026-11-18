// Browser API client for the routes of one game. Pure over an injected fetch; responses are zod-parsed.
import { z } from 'zod';
import { type GameDefinition, type SavedGame, savedGameSchema } from './index.ts';

export class GameApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GameApiError';
    this.status = status;
  }
}

/** The request was made on an outdated version; `game` is the server's current game. */
export class StaleGameError<State> extends GameApiError {
  readonly game: SavedGame<State>;

  constructor(game: SavedGame<State>) {
    super('stale', 409);
    this.name = 'StaleGameError';
    this.game = game;
  }
}

export interface GameApi<State, Move, Options> {
  /** The saved game, or a new one from `options` when the profile has none. */
  resume(nickname: string, options: Options): Promise<SavedGame<State>>;
  /** A new game, replacing any existing one. */
  start(nickname: string, options: Options): Promise<SavedGame<State>>;
  /** Rejects with StaleGameError when the game is no longer at `baseVersion`. */
  move(nickname: string, move: Move, baseVersion: number): Promise<SavedGame<State>>;
  reset(nickname: string, baseVersion: number): Promise<SavedGame<State>>;
}

const errorBody = z.object({ error: z.string() });

/** The error a failed response stands for: stale (with the current game), or a plain message. */
function failure<State>(
  res: Response,
  body: unknown,
  schema: z.ZodType<SavedGame<State>>,
): GameApiError {
  const stale = z.object({ error: z.literal('stale'), game: schema }).safeParse(body);
  if (res.status === 409 && stale.success) return new StaleGameError(stale.data.game);
  const parsed = errorBody.safeParse(body);
  const message = parsed.success
    ? parsed.data.error
    : `Request failed with status ${String(res.status)}`;
  return new GameApiError(message, res.status);
}

function sendJson(method: 'PUT' | 'POST', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function createGameApi<State, Move, Options>(
  definition: GameDefinition<State, Move, Options>,
  fetchImpl: typeof fetch = fetch,
): GameApi<State, Move, Options> {
  const schema = savedGameSchema(definition.stateSchema);
  const base = (nickname: string) =>
    `/api/profiles/${encodeURIComponent(nickname)}/games/${encodeURIComponent(definition.id)}`;

  async function send(url: string, init: RequestInit): Promise<SavedGame<State>> {
    let res: Response;
    try {
      res = await fetchImpl(url, init);
    } catch {
      throw new GameApiError('Could not reach the server', 0);
    }
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) throw failure(res, body, schema);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new GameApiError('Unexpected response from the server', res.status);
    return parsed.data;
  }

  return {
    resume: (nickname, options) => send(base(nickname), sendJson('PUT', options)),
    start: (nickname, options) => send(base(nickname), sendJson('POST', options)),
    move: (nickname, move, baseVersion) =>
      send(`${base(nickname)}/move`, sendJson('POST', { baseVersion, move })),
    reset: (nickname, baseVersion) =>
      send(`${base(nickname)}/reset`, sendJson('POST', { baseVersion })),
  };
}
