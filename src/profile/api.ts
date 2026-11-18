// Browser API client for the profile routes. Pure over an injected fetch, so it is unit-testable.
import { z } from 'zod';
import { type Profile, profileSchema } from './index.ts';

const GENERIC_MESSAGE = 'Could not reach the server';

export class ProfileApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileApiError';
  }
}

const errorBodySchema = z.object({ error: z.string() });

/** Reads the body as JSON; undefined when it is not JSON at all. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** `apiBase` is where the API is mounted, e.g. /sliding-puzzle/api; injected by the web composition root. */
export function createProfileApi(
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): {
  selectOrCreate(nickname: string): Promise<Profile>;
} {
  return {
    async selectOrCreate(nickname: string): Promise<Profile> {
      let res: Response;
      try {
        res = await fetchImpl(`${apiBase}/profiles`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nickname }),
        });
      } catch {
        throw new ProfileApiError(GENERIC_MESSAGE);
      }

      const body = await readJson(res);

      if (res.status === 400) {
        const parsed = errorBodySchema.safeParse(body);
        throw new ProfileApiError(parsed.success ? parsed.data.error : GENERIC_MESSAGE);
      }
      if (!res.ok) {
        throw new ProfileApiError(GENERIC_MESSAGE);
      }

      const profile = profileSchema.safeParse(body);
      if (!profile.success) {
        throw new ProfileApiError(GENERIC_MESSAGE);
      }
      return profile.data;
    },
  };
}
