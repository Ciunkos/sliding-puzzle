import type { ReactElement } from 'react';
import { ProfileGate } from '../profile/client.tsx';
import { features } from './features.tsx';

/** The installed game. One feature today; a game picker comes when there is a second one. */
function GameScreen(props: { nickname: string; apiBase: string }): ReactElement {
  const [feature] = features;
  if (feature === undefined) return <p data-testid="no-games">No games installed</p>;
  return <feature.Screen nickname={props.nickname} apiBase={props.apiBase} />;
}

/**
 * Shell: the profile from the URL, then its game. Each feature owns its own UI and API calls, under
 * `apiBase`. `base` is where the app is mounted; `random` generates nicknames for first visits.
 */
export function App(props: { apiBase: string; base: string; random: () => number }): ReactElement {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: '28rem' }}>
      <h1>Sliding Puzzle</h1>
      <ProfileGate apiBase={props.apiBase} base={props.base} random={props.random}>
        {(nickname) => <GameScreen nickname={nickname} apiBase={props.apiBase} />}
      </ProfileGate>
    </main>
  );
}
