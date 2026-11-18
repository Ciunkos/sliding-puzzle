// Real profiles for tests: the real profile service over the given test database. No fakes.
import type { Db } from '../db/index.ts';
import { createProfileService, type ProfileService } from '../profile/server.ts';
import { fixedNow } from './db.ts';

/** The real profile service; it is also what the game engine uses as its profile lookup. */
export function testProfiles(db: Db): ProfileService {
  return createProfileService(db, fixedNow);
}

/** Creates a profile through the real service and returns its id and display nickname. */
export async function createTestProfile(
  db: Db,
  nickname: string,
): Promise<{ id: number; nickname: string }> {
  const profile = await testProfiles(db).getOrCreate(nickname);
  return { id: profile.id, nickname: profile.nickname };
}
