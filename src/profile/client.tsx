// Client entry: identity without authentication. The profile is in the URL (<base>/p/<nickname>);
// a first visit gets a generated nickname, a later one the last profile of this browser. Logic lives
// in url.ts, generate.ts, last-profile.ts and the use-*.ts hooks; this stays presentational.
import { type ReactElement, type ReactNode, useMemo, useRef, useState } from 'react';
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
  const toast = useRef<HTMLElement>(null);
  const welcome = useWelcome(nickname, profile.state.status === 'ready', toast);
  return { route, profile, welcome, toast, focusWelcome, setFocusWelcome };
}

/**
 * The nickname whose game is on screen: kept while the next profile loads, so switching profile
 * swaps the game in place (the screen, its menu and its focus stay) instead of tearing it down.
 */
function usePlayed(state: ProfileState, invalid: boolean): string | undefined {
  const played = useRef<string | undefined>(undefined);
  if (state.status === 'ready') played.current = state.profile.nickname;
  else if (invalid || state.status !== 'loading') played.current = undefined;
  return played.current;
}

/**
 * The profile's part of the menu (its heading a level 3 under the menu's own) or of its own pages
 * (level 2, under the page's heading), for the profile at `path`.
 */
function profileBar(
  route: ProfileRoute,
  path: string,
  nickname: string,
  level: 2 | 3,
): ReactElement {
  return (
    <ProfileBar
      level={level}
      nickname={nickname}
      shareUrl={new URL(path, window.location.origin).href}
      onOpen={route.open}
      onRandom={() => {
        route.openRandom('push');
      }}
    />
  );
}

/** Whether the state shows a game: one that is ready, or the last one while the next loads. */
function hasGame(state: ProfileState): boolean {
  return state.status === 'ready' || state.status === 'loading';
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
  const { route, profile, welcome, toast, focusWelcome, setFocusWelcome } = useGate(props);
  const { state, retry } = profile;
  const played = usePlayed(state, route.route.kind === 'invalid');
  if (route.route.kind === 'invalid') {
    return (
      <div className={styles.page}>
        <InvalidProfile
          raw={route.route.raw}
          onNewRandom={() => {
            setFocusWelcome(true);
            route.openRandom('replace');
          }}
        />
        {props.aside}
      </div>
    );
  }
  const shown = state.status === 'ready' ? state.profile.nickname : route.route.nickname;
  if (state.status === 'loading' && played === undefined) return <Loading />;
  if (!hasGame(state)) {
    return (
      <div className={styles.page}>
        {profileBar(route, route.route.path, shown, 2)}
        <ProfileContent state={state} retry={retry} onOpen={route.open} />
        {props.aside}
      </div>
    );
  }
  // One shape whether the next profile is still loading or ready: the game on screen stays mounted,
  // so a switch swaps the game in place (the screen, its menu and its focus stay).
  return (
    <>
      {/* Floats over the game; first, so the game stays the page's last block (index.html). */}
      {welcome ? (
        <WelcomeToast toastRef={toast} nickname={shown} focusOnMount={focusWelcome} />
      ) : null}
      {props.children(played ?? shown, profileBar(route, route.route.path, shown, 3))}
    </>
  );
}
