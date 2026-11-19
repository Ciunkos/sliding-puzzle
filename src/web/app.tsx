import type { ReactElement, ReactNode } from 'react';
import type { FeatureEvent } from '../game/client.tsx';
import { ProfileGate } from '../profile/client.tsx';
import { features } from './features.tsx';
import { UpdateNotice } from './update-notice.tsx';
import { UsageToggle } from './usage-toggle.tsx';

/** The installed game. One feature today; a game picker comes when there is a second one. */
function GameScreen(props: {
  nickname: string;
  apiBase: string;
  onEvent: (event: FeatureEvent) => void;
  shellMenu: ReactNode;
}): ReactElement {
  const [feature] = features;
  if (feature === undefined) return <p data-testid="no-games">No games installed</p>;
  return (
    <feature.Screen
      nickname={props.nickname}
      apiBase={props.apiBase}
      onEvent={props.onEvent}
      shellMenu={props.shellMenu}
    />
  );
}

/**
 * Shell: the profile from the URL, then its game, full screen. Each feature owns its own UI and API
 * calls, under `apiBase`, and shows the page's own controls (who is playing, usage statistics) in
 * its menu (`shellMenu`). `base` is where the app is mounted; `random` generates nicknames for
 * first visits; `serviceWorkerUrl` is the offline worker (undefined in development); `onEvent`
 * hears what the game screens report. The page's own styles and the same `<main>` and `<h1>` are
 * in index.html, so the page looks the same before this renders. `<main>` is exactly one screen
 * (index.html): nothing comes after it, so nothing can be pushed while the game grows in.
 */
export function App(props: {
  apiBase: string;
  base: string;
  random: () => number;
  serviceWorkerUrl: string | undefined;
  /** Hears what the game screens report (usage statistics decide what of it leaves the page). */
  onEvent: (event: FeatureEvent) => void;
}): ReactElement {
  return (
    <>
      <main>
        <h1>Sliding Puzzle</h1>
        <ProfileGate
          apiBase={props.apiBase}
          base={props.base}
          random={props.random}
          aside={<UsageToggle />}
        >
          {(nickname, profileMenu) => (
            <GameScreen
              nickname={nickname}
              apiBase={props.apiBase}
              onEvent={props.onEvent}
              shellMenu={
                <>
                  {profileMenu}
                  <UsageToggle />
                </>
              }
            />
          )}
        </ProfileGate>
      </main>
      <UpdateNotice url={props.serviceWorkerUrl} />
    </>
  );
}
