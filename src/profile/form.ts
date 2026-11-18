// Pure nickname validation for the picker form.
import { nicknameSchema } from './index.ts';

export type NicknameValidation = { ok: true; nickname: string } | { ok: false; message: string };

export function validateNickname(input: string): NicknameValidation {
  const result = nicknameSchema.safeParse(input);
  if (result.success) return { ok: true, nickname: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? 'invalid nickname' };
}
