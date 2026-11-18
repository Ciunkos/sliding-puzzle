// Isomorphic entry: nickname rules and the profile shape. No node:* or hono imports here.
import { z } from 'zod';

/**
 * 30 characters fit a generated nickname (two words of at most 10 letters, a 3-digit number and two
 * dashes: 25 characters) with room to spare.
 */
const LENGTH_MESSAGE = 'nickname must be 2-30 characters';

export const nicknameSchema: z.ZodType<string> = z
  .string()
  .trim()
  .min(2, LENGTH_MESSAGE)
  .max(30, LENGTH_MESSAGE)
  .regex(/^[A-Za-z0-9_-]+$/, 'nickname may only contain letters, digits, "_" and "-"');

/** The uniqueness key: the trimmed nickname, lowercased. */
export function nicknameKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export const profileSchema = z.object({
  id: z.number().int().positive(),
  nickname: z.string(),
  createdAt: z.string(),
});

export type Profile = z.infer<typeof profileSchema>;
