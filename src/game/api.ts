import { z } from 'zod';
import { gameStateSchema, type GameState } from './index.ts';

export class GameApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GameApiError';
    this.status = status;
  }
}

const errorBody = z.object({ error: z.string() });

export function createGameApi(fetchImpl: typeof fetch = fetch) {
  const base = (nickname: string) => `/api/profiles/${encodeURIComponent(nickname)}/game`;

  async function send(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, init);
    } catch {
      throw new GameApiError('Could not reach the server', 0);
    }
  }

  async function fail(res: Response): Promise<never> {
    const body: unknown = await res.json().catch(() => undefined);
    const parsed = errorBody.safeParse(body);
    const message = parsed.success
      ? parsed.data.error
      : `Request failed with status ${String(res.status)}`;
    throw new GameApiError(message, res.status);
  }

  async function readState(res: Response): Promise<GameState> {
    const body: unknown = await res.json().catch(() => undefined);
    const parsed = gameStateSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameApiError('Unexpected response from the server', res.status);
    }
    return parsed.data;
  }

  async function expectState(res: Response): Promise<GameState> {
    if (!res.ok) await fail(res);
    return readState(res);
  }

  return {
    async load(nickname: string): Promise<GameState | undefined> {
      const res = await send(base(nickname));
      if (res.status === 404) return undefined;
      return expectState(res);
    },

    async start(nickname: string): Promise<GameState> {
      return expectState(await send(base(nickname), { method: 'POST' }));
    },

    async move(nickname: string, tile: number): Promise<GameState> {
      return expectState(
        await send(`${base(nickname)}/move`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tile }),
        }),
      );
    },

    async reset(nickname: string): Promise<GameState> {
      return expectState(await send(`${base(nickname)}/reset`, { method: 'POST' }));
    },
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
