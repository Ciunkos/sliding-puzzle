import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createGameApi, type GameApi } from './api.ts';
import type { GameState } from './index.ts';
import { errorMessage, loadOrStart } from './flow.ts';
import { solvedText, statusText, toCells } from './view-model.ts';

export { createGameApi, GameApiError } from './api.ts';

const defaultApi = createGameApi();

export interface GameViewProps {
  nickname: string;
  api?: GameApi;
}

const page: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  color: '#111',
  maxWidth: 360,
  margin: '0 auto',
  padding: 16,
};

const board: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 72px)',
  gap: 6,
  justifyContent: 'center',
  margin: '16px 0',
};

const tile: CSSProperties = {
  width: 72,
  height: 72,
  fontSize: 28,
  fontWeight: 700,
  color: '#111',
  background: '#fff',
  border: '2px solid #111',
  borderRadius: 8,
  cursor: 'pointer',
};

const blank: CSSProperties = { width: 72, height: 72 };

const button: CSSProperties = {
  fontSize: 16,
  padding: '8px 14px',
  marginRight: 8,
  borderRadius: 6,
  border: '2px solid #111',
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
};

const banner: CSSProperties = {
  background: '#0a6b2d',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 6,
  fontWeight: 600,
};

const error: CSSProperties = { color: '#b00020', fontWeight: 600 };

export function GameView({ nickname, api = defaultApi }: GameViewProps): ReactElement {
  const [game, setGame] = useState<GameState | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the nickname changes, so responses for an earlier profile are ignored.
  const session = useRef(0);
  // Synchronous guard: a click that lands before React re-renders must still be ignored.
  const inFlight = useRef(false);

  useEffect(() => {
    const current = ++session.current;
    const live = () => session.current === current;
    inFlight.current = true;
    setBusy(true);
    setGame(undefined);
    setMessage(undefined);
    loadOrStart(api, nickname)
      .then(
        (state) => {
          if (live()) setGame(state);
        },
        (failure: unknown) => {
          if (live()) setMessage(errorMessage(failure));
        },
      )
      .finally(() => {
        if (live()) {
          inFlight.current = false;
          setBusy(false);
        }
      });
    return () => {
      session.current++;
    };
  }, [api, nickname]);

  async function perform(task: () => Promise<GameState>) {
    if (inFlight.current) return;
    const current = session.current;
    inFlight.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const next = await task();
      if (session.current === current) setGame(next);
    } catch (failure: unknown) {
      if (session.current === current) setMessage(errorMessage(failure));
    } finally {
      if (session.current === current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  const cells = game ? toCells(game) : [];

  return (
    <main style={page}>
      <h1>Sliding puzzle</h1>

      {game ? (
        <>
          <p data-testid="moves">{statusText(game)}</p>
          <div
            data-testid="board"
            role="group"
            aria-label="Sliding puzzle"
            data-board={game.board.join(',')}
            style={board}
          >
            {cells.map((cell) =>
              cell.tile === 0 ? (
                <div key="blank" data-testid="tile-blank" style={blank} />
              ) : (
                <button
                  key={cell.tile}
                  type="button"
                  data-testid={'tile-' + String(cell.tile)}
                  disabled={!cell.movable || busy}
                  style={{
                    ...tile,
                    background: cell.movable ? '#fff' : '#e5e5e5',
                    color: cell.movable ? '#111' : '#555',
                    cursor: cell.movable ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    void perform(() => api.move(nickname, cell.tile));
                  }}
                >
                  {cell.tile}
                </button>
              ),
            )}
          </div>
          {game.solved ? (
            <div data-testid="solved-banner" role="status" style={banner}>
              {solvedText(game)}
            </div>
          ) : null}
        </>
      ) : (
        !message && <p>Loading…</p>
      )}

      {message ? (
        <p role="alert" data-testid="game-error" style={error}>
          {message}
        </p>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          data-testid="new-game"
          disabled={busy}
          style={button}
          onClick={() => {
            void perform(() => api.start(nickname));
          }}
        >
          New game
        </button>
        <button
          type="button"
          data-testid="reset"
          disabled={busy}
          style={button}
          onClick={() => {
            void perform(() => api.reset(nickname));
          }}
        >
          Reset
        </button>
      </div>
    </main>
  );
}
