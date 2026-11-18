import { type ReactElement, useState } from 'react';
import { ProfilePicker } from '../profile/client.tsx';
import { features } from './features.tsx';

/** The installed game. One feature today; a game picker comes when there is a second one. */
function GameScreen(props: { nickname: string; apiBase: string }): ReactElement {
  const [feature] = features;
  if (feature === undefined) return <p data-testid="no-games">No games installed</p>;
  return <feature.Screen nickname={props.nickname} apiBase={props.apiBase} />;
}

/** Shell: pick a profile, then play. Each feature owns its own UI and API calls, under `apiBase`. */
export function App({ apiBase }: { apiBase: string }): ReactElement {
  const [nickname, setNickname] = useState<string | undefined>(undefined);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: '28rem' }}>
      <h1>Sliding Puzzle</h1>
      {nickname === undefined ? (
        <ProfilePicker
          apiBase={apiBase}
          onSelected={(profile) => {
            setNickname(profile.nickname);
          }}
        />
      ) : (
        <>
          <p>
            Playing as <strong data-testid="current-profile">{nickname}</strong>{' '}
            <button
              type="button"
              data-testid="switch-profile"
              onClick={() => {
                setNickname(undefined);
              }}
            >
              Switch profile
            </button>
          </p>
          <GameScreen nickname={nickname} apiBase={apiBase} />
        </>
      )}
    </main>
  );
}
