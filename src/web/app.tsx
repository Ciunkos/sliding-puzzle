import { useState, type ReactElement } from 'react';
import { GameView } from '../game/client.tsx';
import { ProfilePicker } from '../profile/client.tsx';

/** Shell: pick a profile, then play. Each feature owns its own UI and API calls. */
export function App(): ReactElement {
  const [nickname, setNickname] = useState<string | undefined>(undefined);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem auto', maxWidth: '28rem' }}>
      <h1>Sliding Puzzle</h1>
      {nickname === undefined ? (
        <ProfilePicker
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
          <GameView nickname={nickname} />
        </>
      )}
    </main>
  );
}
