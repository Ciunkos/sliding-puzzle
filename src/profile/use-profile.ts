// Loads (gets or creates) the profile of a nickname from the server and remembers it locally.
// Keyed by the case-insensitive key, so showing the canonical casing does not load it again.
import { useEffect, useState } from 'react';
import { type createProfileApi, ProfileApiError } from './api.ts';
import { nicknameKey, type Profile } from './index.ts';
import { saveLastNickname } from './last-profile.ts';

const GENERIC_MESSAGE = 'Could not reach the server';

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'error'; message: string };

interface Loaded {
  key: string;
  state: ProfileState;
}

const LOADING: ProfileState = { status: 'loading' };

export function useProfile(
  api: ReturnType<typeof createProfileApi>,
  nickname: string | undefined,
  onLoaded: (profile: Profile) => void,
): { state: ProfileState; retry: () => void } {
  const key = nickname === undefined ? undefined : nicknameKey(nickname);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (nickname === undefined || key === undefined) return;
    let live = true;
    api.selectOrCreate(nickname).then(
      (profile) => {
        if (!live) return;
        saveLastNickname(profile.nickname);
        setLoaded({ key, state: { status: 'ready', profile } });
        onLoaded(profile);
      },
      (error: unknown) => {
        const message = error instanceof ProfileApiError ? error.message : GENERIC_MESSAGE;
        if (live) setLoaded({ key, state: { status: 'error', message } });
      },
    );
    return () => {
      live = false;
    };
    // Keyed by `key`: another casing of the same nickname is the same profile, so it is not reloaded.
  }, [api, key, attempt]);

  return {
    state: loaded !== undefined && loaded.key === key ? loaded.state : LOADING,
    retry: () => {
      setLoaded(undefined);
      setAttempt((n) => n + 1);
    },
  };
}
