// Browser API client for the routes of one game. Pure over an injected fetch; responses are zod-parsed.
import { z } from 'zod';
import {
  type BestResult,
  bestResultsSchema,
  type GameDefinition,
  type SavedGame,
  savedGameSchema,
} from './index.ts';
import type { MovesRequest } from './sync.ts';

export class GameApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GameApiError';
    this.status = status;
  }
}

/**
 * The server refused the request and answered with its current game, which wins: the request was
 * made on an outdated version (`stale`), or its moves were illegal there.
 */
export class StaleGameError<State> extends GameApiError {
  readonly game: SavedGame<State>;

  constructor(game: SavedGame<State>, message = 'stale') {
    super(message, 409);
    this.name = 'StaleGameError';
    this.game = game;
  }
}

export interface GameApi<State, Move, Options> {
  /** The game this client talks about; the session applies its moves optimistically. */
  definition: GameDefinition<State, Move, Options>;
  /** The saved game, or a new one from `options` when the profile has none. */
  resume(nickname: string, options: Options): Promise<SavedGame<State>>;
  /** A new game, replacing any existing one. */
  start(nickname: string, options: Options): Promise<SavedGame<State>>;
  /** Rejects with StaleGameError (carrying the server's game) when the server refuses the batch. */
  sendMoves(nickname: string, request: MovesRequest<Move>): Promise<SavedGame<State>>;
  reset(nickname: string, baseVersion: number): Promise<SavedGame<State>>;
  /** The profile's best results per variant. */
  results(nickname: string): Promise<BestResult[]>;
}

const errorBody = z.object({ error: z.string() });

/** The error a failed response stands for: stale (with the current game), or a plain message. */
function failure<State>(
  res: Response,
  body: unknown,
  schema: z.ZodType<SavedGame<State>>,
): GameApiError {
  // The body alone identifies an answer whose game wins: `{ error, game }` (sent with 409).
  const stale = z.object({ error: z.string(), game: schema }).safeParse(body);
  if (stale.success) return new StaleGameError(stale.data.game, stale.data.error);
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
  /** Where the API is mounted, e.g. /sliding-puzzle/api; injected by the web composition root. */
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
  /** A request without an answer by then is given up, like an unreachable server. */
  timeoutMs = 10_000,
): GameApi<State, Move, Options> {
  const schema = savedGameSchema(definition.stateSchema);
  const base = (nickname: string) =>
    `${apiBase}/profiles/${encodeURIComponent(nickname)}/games/${encodeURIComponent(definition.id)}`;

  async function request<T>(url: string, init: RequestInit, answer: z.ZodType<T>): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GameApiError('Could not reach the server', 0);
    }
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) throw failure(res, body, schema);
    const parsed = answer.safeParse(body);
    if (!parsed.success) throw new GameApiError('Unexpected response from the server', res.status);
    return parsed.data;
  }
  const send = (url: string, init: RequestInit) => request(url, init, schema);

  return {
    definition,
    resume: (nickname, options) => send(base(nickname), sendJson('PUT', options)),
    start: (nickname, options) => send(base(nickname), sendJson('POST', options)),
    sendMoves: (nickname, moves) => send(`${base(nickname)}/moves`, sendJson('POST', moves)),
    reset: (nickname, baseVersion) =>
      send(`${base(nickname)}/reset`, sendJson('POST', { baseVersion })),
    results: (nickname) => request(`${base(nickname)}/results`, {}, bestResultsSchema),
  };
}
