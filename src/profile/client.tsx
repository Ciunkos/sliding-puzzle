// Client entry: identity without authentication. The profile is in the URL (<base>/p/<nickname>);
// a first visit gets a generated nickname, a later one the last profile of this browser. Logic lives
// in url.ts, generate.ts, last-profile.ts and the use-*.ts hooks; this stays presentational.
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { createProfileApi } from './api.ts';
import { InvalidProfile } from './invalid-profile.tsx';
import { OfflineUnavailable } from './offline-unavailable.tsx';
import { ProfileBar } from './profile-bar.tsx';
import * as styles from './styles.ts';
import { type ProfileRoute, useProfileRoute } from './use-profile-route.ts';
import { type ProfileState, useProfile } from './use-profile.ts';
import { useWelcome } from './use-welcome.ts';
import { WelcomeToast } from './welcome-toast.tsx';

/** What the profile shows itself while there is no game: loading, offline, an error. */
function ProfileContent(props: {
  state: ProfileState;
  retry: () => void;
  onOpen: (nickname: string) => void;
}): ReactNode {
  const { state } = props;
  if (state.status === 'unavailable-offline') {
    return <OfflineUnavailable other={state.other?.nickname} onOpen={props.onOpen} />;
  }
  if (state.status !== 'error') return null;
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

interface GateProps {
  /** Where the API is mounted, e.g. /sliding-puzzle/api. */
  apiBase: string;
  /** Where the app is mounted, e.g. /sliding-puzzle/ (Vite's BASE_URL). */
  base: string;
  /** The random source for generated nicknames; supplied by the composition root. */
  random: () => number;
  aside?: ReactNode;
  children: (nickname: string, profileMenu: ReactNode) => ReactNode;
}

/** The profile behind the URL, its loading state and the first-visit toast. */
function useGate(props: GateProps) {
  const api = useMemo(() => createProfileApi(props.apiBase), [props.apiBase]);
  const route = useProfileRoute(props.base, props.random);
  const [focusWelcome, setFocusWelcome] = useState(false);
  const nickname = route.route.kind === 'play' ? route.route.nickname : undefined;
  const profile = useProfile(api, nickname, (loaded) => {
    // One profile, one URL: show the server's display casing.
    if (loaded.nickname !== nickname) route.canonicalise(loaded.nickname);
  });
  const welcome = useWelcome(nickname, profile.state.status === 'ready');
  return { route, profile, welcome, focusWelcome, setFocusWelcome };
}

/** The profile's part of the menu (or of its own pages), for the profile at `path`. */
function profileBar(route: ProfileRoute, path: string, nickname: string): ReactElement {
  return (
    <ProfileBar
      nickname={nickname}
      shareUrl={new URL(path, window.location.origin).href}
      onOpen={route.open}
      onRandom={() => {
        route.openRandom('push');
      }}
    />
  );
}

/** The loading line, before the profile is known. */
function Loading(): ReactElement {
  return (
    <>
      <style>{styles.css}</style>
      <p className={styles.loading}>Loading profile…</p>
    </>
  );
}

/**
 * Resolves the profile from the URL, then renders `children` with its canonical nickname and the
 * profile's part of the game's menu (who is playing, the link, switching). A first visit gets a
 * toast over the game. The profile's own pages (an unusable name, offline, an error) show `aside`
 * under them, e.g. the page's usage statistics switch.
 */
export function ProfileGate(props: GateProps): ReactElement {
  const { route, profile, welcome, focusWelcome, setFocusWelcome } = useGate(props);
  const { state, retry } = profile;
  if (route.route.kind === 'invalid') {
    const onNewRandom = () => {
      setFocusWelcome(true);
      route.openRandom('replace');
    };
    return (
      <div className={styles.page}>
        <InvalidProfile raw={route.route.raw} onNewRandom={onNewRandom} />
        {props.aside}
      </div>
    );
  }
  const shown = state.status === 'ready' ? state.profile.nickname : route.route.nickname;
  const bar = profileBar(route, route.route.path, shown);
  if (state.status === 'loading') return <Loading />;
  if (state.status !== 'ready') {
    return (
      <div className={styles.page}>
        {bar}
        <ProfileContent state={state} retry={retry} onOpen={route.open} />
        {props.aside}
      </div>
    );
  }
  return (
    <>
      {/* Floats over the game; first, so the game stays the page's last block (index.html). */}
      {welcome ? <WelcomeToast nickname={shown} focusOnMount={focusWelcome} /> : null}
      {props.children(shown, bar)}
    </>
  );
}
