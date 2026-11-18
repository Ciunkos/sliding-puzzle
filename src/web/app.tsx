import type { ReactElement } from 'react';
import { ProfileGate } from '../profile/client.tsx';
import { features } from './features.tsx';
import { UpdateNotice } from './update-notice.tsx';

/** The installed game. One feature today; a game picker comes when there is a second one. */
function GameScreen(props: { nickname: string; apiBase: string }): ReactElement {
  const [feature] = features;
  if (feature === undefined) return <p data-testid="no-games">No games installed</p>;
  return <feature.Screen nickname={props.nickname} apiBase={props.apiBase} />;
}

/**
 * Shell: the profile from the URL, then its game. Each feature owns its own UI and API calls, under
 * `apiBase`. `base` is where the app is mounted; `random` generates nicknames for first visits;
 * `serviceWorkerUrl` is the offline worker (undefined in development). The page's own styles and the
 * same `<main>` and `<h1>` are in index.html, so the page looks the same before this renders.
 */
export function App(props: {
  apiBase: string;
  base: string;
  random: () => number;
  serviceWorkerUrl: string | undefined;
}): ReactElement {
  return (
    <main>
      <h1>Sliding Puzzle</h1>
      <ProfileGate apiBase={props.apiBase} base={props.base} random={props.random}>
        {(nickname) => <GameScreen nickname={nickname} apiBase={props.apiBase} />}
      </ProfileGate>
      <UpdateNotice url={props.serviceWorkerUrl} />
    </main>
  );
}
