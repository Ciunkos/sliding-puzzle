// Isomorphic entry: nickname rules and the profile shape. No node:* or hono imports here.
import { z } from 'zod';

export const nicknameSchema: z.ZodType<string> = z
  .string()
  .trim()
  .min(2, 'nickname must be 2-20 characters')
  .max(20, 'nickname must be 2-20 characters')
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
