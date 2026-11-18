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

export interface GameApi<State, Move, Options> {
  /** The saved game, or undefined when the profile has none. */
  load(nickname: string): Promise<SavedGame<State> | undefined>;
  start(nickname: string, options: Options): Promise<SavedGame<State>>;
  move(nickname: string, move: Move): Promise<SavedGame<State>>;
  reset(nickname: string): Promise<SavedGame<State>>;
}

const errorBody = z.object({ error: z.string() });

async function failure(res: Response): Promise<GameApiError> {
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = errorBody.safeParse(body);
  const message = parsed.success
    ? parsed.data.error
    : `Request failed with status ${String(res.status)}`;
  return new GameApiError(message, res.status);
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
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

  async function send(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, init);
    } catch {
      throw new GameApiError('Could not reach the server', 0);
    }
  }

  async function expectGame(res: Response): Promise<SavedGame<State>> {
    if (!res.ok) throw await failure(res);
    const parsed = schema.safeParse(await res.json().catch(() => undefined));
    if (!parsed.success) throw new GameApiError('Unexpected response from the server', res.status);
    return parsed.data;
  }

  return {
    async load(nickname) {
      const res = await send(base(nickname));
      return res.status === 404 ? undefined : expectGame(res);
    },
    start: async (nickname, options) => expectGame(await send(base(nickname), postJson(options))),
    move: async (nickname, move) =>
      expectGame(await send(`${base(nickname)}/move`, postJson(move))),
    reset: async (nickname) =>
      expectGame(await send(`${base(nickname)}/reset`, { method: 'POST' })),
  };
}
