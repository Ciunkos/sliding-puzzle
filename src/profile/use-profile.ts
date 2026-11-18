// Loads (gets or creates) the profile of a nickname from the server and remembers it on this device.
// Offline, or when the server cannot be reached, a profile opened here before plays from memory
// (see profile-start.ts); it is loaded from the server again when the connection returns.
// Keyed by the case-insensitive key, so showing the canonical casing does not load it again.
import { useEffect, useState } from 'react';
import { type createProfileApi, ProfileApiError } from './api.ts';
import { nicknameKey } from './index.ts';
import { type KnownProfile, loadKnownProfile, saveKnownProfile } from './known-profile.ts';
import { loadLastNickname, saveLastNickname } from './last-profile.ts';
import { decideProfileStart, type Reach } from './profile-start.ts';

const GENERIC_MESSAGE = 'Could not reach the server';

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: KnownProfile }
  /** Offline, and this profile was never opened on this device. `other` can be opened instead. */
  | { status: 'unavailable-offline'; other: KnownProfile | undefined }
  | { status: 'error'; message: string };

interface Loaded {
  key: string;
  state: ProfileState;
}

const LOADING: ProfileState = { status: 'loading' };

/** The last profile played here, if this device remembers it well enough to open it offline. */
function lastKnown(): KnownProfile | undefined {
  const last = loadLastNickname();
  return last === undefined ? undefined : loadKnownProfile(last);
}

/** What to show without the server: the remembered profile, or why it cannot open. */
function withoutServer(nickname: string, reach: Reach): ProfileState {
  const start = decideProfileStart({ reach, known: loadKnownProfile(nickname), last: lastKnown() });
  if (start.kind === 'remembered') return { status: 'ready', profile: start.profile };
  return {
    status: 'unavailable-offline',
    other: start.kind === 'ask-server' ? undefined : start.other,
  };
}

/** Asks the server for the profile; `settle` gets the state to show (unless the load was dropped). */
function loadFromServer(
  api: ReturnType<typeof createProfileApi>,
  nickname: string,
  settle: (state: ProfileState) => void,
): void {
  api.selectOrCreate(nickname).then(
    (profile) => {
      const known = { id: profile.id, nickname: profile.nickname };
      saveKnownProfile(known);
      saveLastNickname(known.nickname);
      settle({ status: 'ready', profile: known });
    },
    (error: unknown) => {
      if (error instanceof ProfileApiError && error.unreachable) {
        settle(withoutServer(nickname, 'unreachable'));
        return;
      }
      const message = error instanceof ProfileApiError ? error.message : GENERIC_MESSAGE;
      settle({ status: 'error', message });
    },
  );
}

/** Bumps `attempt` whenever the connection returns, so the profile is loaded from the server. */
function useReloadWhenOnline(reload: () => void): void {
  useEffect(() => {
    window.addEventListener('online', reload);
    return () => {
      window.removeEventListener('online', reload);
    };
  }, []);
}

export function useProfile(
  api: ReturnType<typeof createProfileApi>,
  nickname: string | undefined,
  onLoaded: (profile: KnownProfile) => void,
): { state: ProfileState; retry: () => void } {
  const key = nickname === undefined ? undefined : nicknameKey(nickname);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useReloadWhenOnline(() => {
    setAttempt((n) => n + 1);
  });

  useEffect(() => {
    if (nickname === undefined || key === undefined) return;
    let live = true;
    const settle = (state: ProfileState) => {
      if (!live) return;
      setLoaded({ key, state });
      if (state.status === 'ready') onLoaded(state.profile);
    };
    // A browser that knows it is offline is not asked to fail a request (and log it).
    if (navigator.onLine) loadFromServer(api, nickname, settle);
    else settle(withoutServer(nickname, 'offline'));
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
