// Client entry: identity without authentication. The profile is in the URL (<base>/p/<nickname>);
// a first visit gets a generated nickname, a later one the last profile of this browser. Logic lives
// in url.ts, generate.ts, last-profile.ts and the use-*.ts hooks; this stays presentational.
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { createProfileApi } from './api.ts';
import { InvalidProfile } from './invalid-profile.tsx';
import { OfflineUnavailable } from './offline-unavailable.tsx';
import { ProfileBar } from './profile-bar.tsx';
import * as styles from './styles.ts';
import { useProfileRoute } from './use-profile-route.ts';
import { type ProfileState, useProfile } from './use-profile.ts';

function ProfileContent(props: {
  state: ProfileState;
  retry: () => void;
  onOpen: (nickname: string) => void;
  children: (nickname: string) => ReactNode;
}): ReactNode {
  const { state } = props;
  if (state.status === 'ready') return props.children(state.profile.nickname);
  if (state.status === 'loading') return <p>Loading profile…</p>;
  if (state.status === 'unavailable-offline') {
    return <OfflineUnavailable other={state.other?.nickname} onOpen={props.onOpen} />;
  }
  return (
    <>
      <p role="alert" data-testid="profile-load-error" className={styles.error}>
        {state.message}
      </p>
      <button type="button" className={styles.button} onClick={props.retry}>
        Try again
      </button>
    </>
  );
}

/** Resolves the profile from the URL, then renders `children` with its canonical nickname. */
export function ProfileGate(props: {
  /** Where the API is mounted, e.g. /sliding-puzzle/api. */
  apiBase: string;
  /** Where the app is mounted, e.g. /sliding-puzzle/ (Vite's BASE_URL). */
  base: string;
  /** The random source for generated nicknames; supplied by the composition root. */
  random: () => number;
  children: (nickname: string) => ReactNode;
}): ReactElement {
  const api = useMemo(() => createProfileApi(props.apiBase), [props.apiBase]);
  const { route, open, openRandom, canonicalise } = useProfileRoute(props.base, props.random);
  const [focusBar, setFocusBar] = useState(false);
  const nickname = route.kind === 'play' ? route.nickname : undefined;
  const { state, retry } = useProfile(api, nickname, (profile) => {
    // One profile, one URL: show the server's display casing.
    if (profile.nickname !== nickname) canonicalise(profile.nickname);
  });

  if (route.kind === 'invalid') {
    const onNewRandom = () => {
      setFocusBar(true);
      openRandom('replace');
    };
    return <InvalidProfile raw={route.raw} onNewRandom={onNewRandom} />;
  }
  return (
    <>
      <ProfileBar
        nickname={state.status === 'ready' ? state.profile.nickname : route.nickname}
        shareUrl={new URL(route.path, window.location.origin).href}
        focusOnMount={focusBar}
        onOpen={open}
        onRandom={() => {
          openRandom('push');
        }}
      />
      <ProfileContent state={state} retry={retry} onOpen={open}>
        {props.children}
      </ProfileContent>
    </>
  );
}
