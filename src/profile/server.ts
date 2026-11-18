// Server entry: the profile service (over the Db port) and its Hono routes.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db, Row } from '../db/index.ts';
import { nicknameKey, nicknameSchema, type Profile, profileSchema } from './index.ts';

export * from './index.ts';

export class InvalidNicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNicknameError';
  }
}

export interface ProfileService {
  /** Idempotent: a nickname in any casing returns the existing profile. */
  getOrCreate(nickname: string): Promise<Profile>;
  /** Case-insensitive; undefined for an unknown or an invalid nickname. */
  find(nickname: string): Promise<Profile | undefined>;
}

/** The profiles table row as SQLite returns it (snake_case columns). */
const profileRowSchema = z.object({
  id: z.number().int().positive(),
  nickname: z.string(),
  created_at: z.string(),
});

const createBodySchema = z.object({ nickname: z.string() });

function parseNickname(nickname: string): string {
  const result = nicknameSchema.safeParse(nickname);
  if (!result.success) {
    throw new InvalidNicknameError(result.error.issues[0]?.message ?? 'invalid nickname');
  }
  return result.data;
}

function toProfile(row: Row): Profile {
  const parsed = profileRowSchema.parse(row);
  return profileSchema.parse({
    id: parsed.id,
    nickname: parsed.nickname,
    createdAt: parsed.created_at,
  });
}

export function createProfileService(db: Db, now: () => Date): ProfileService {
  async function selectByKey(key: string): Promise<Profile | undefined> {
    const row = await db.get(
      'SELECT id, nickname, created_at FROM profiles WHERE nickname_key = ?',
      [key],
    );
    return row === undefined ? undefined : toProfile(row);
  }

  return {
    async getOrCreate(nickname) {
      const display = parseNickname(nickname);
      const key = nicknameKey(display);
      // ON CONFLICT keeps the first row (and its display casing). Two racing calls cannot both insert.
      await db.run(
        'INSERT INTO profiles (nickname, nickname_key, created_at) VALUES (?, ?, ?) ON CONFLICT(nickname_key) DO NOTHING',
        [display, key, now().toISOString()],
      );
      const profile = await selectByKey(key);
      if (profile === undefined) {
        throw new Error(`profile "${key}" is missing right after insert`);
      }
      return profile;
    },

    async find(nickname) {
      const parsed = nicknameSchema.safeParse(nickname);
      if (!parsed.success) return undefined;
      return selectByKey(nicknameKey(parsed.data));
    },
  };
}

export function profileRoutes(service: ProfileService): Hono {
  const app = new Hono();

  app.post('/api/profiles', async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'body must be a JSON object with a "nickname" string' }, 400);
    }
    try {
      return c.json(await service.getOrCreate(parsed.data.nickname), 200);
    } catch (error) {
      if (error instanceof InvalidNicknameError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  app.get('/api/profiles/:nickname', async (c) => {
    const profile = await service.find(c.req.param('nickname'));
    if (profile === undefined) {
      return c.json({ error: 'profile not found' }, 404);
    }
    return c.json(profile, 200);
  });

  return app;
}
