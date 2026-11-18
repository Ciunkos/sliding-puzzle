import type { ReactElement } from 'react';
import { ProfileGate } from '../profile/client.tsx';
import { features } from './features.tsx';

/** The installed game. One feature today; a game picker comes when there is a second one. */
function GameScreen(props: { nickname: string; apiBase: string }): ReactElement {
  const [feature] = features;
  if (feature === undefined) return <p data-testid="no-games">No games installed</p>;
  return <feature.Screen nickname={props.nickname} apiBase={props.apiBase} />;
}

/** Page colours for light and dark; each module colours its own cards to match. */
const PAGE_CSS = `
body { background: #fff; color: #111; }
@media (prefers-color-scheme: dark) {
  body { background: #0a0d14; color: #e8ecf3; }
}
`;

/**
 * Shell: the profile from the URL, then its game. Each feature owns its own UI and API calls, under
 * `apiBase`. `base` is where the app is mounted; `random` generates nicknames for first visits.
 */
export function App(props: { apiBase: string; base: string; random: () => number }): ReactElement {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: '28rem' }}>
      <style>{PAGE_CSS}</style>
      <h1>Sliding Puzzle</h1>
      <ProfileGate apiBase={props.apiBase} base={props.base} random={props.random}>
        {(nickname) => <GameScreen nickname={nickname} apiBase={props.apiBase} />}
      </ProfileGate>
    </main>
  );
}
