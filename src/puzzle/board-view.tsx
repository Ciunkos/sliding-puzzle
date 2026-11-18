// The puzzle board: one button per tile, the blank as an empty cell.
import type { ReactElement } from 'react';
import type { SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import * as styles from './styles.ts';
import { type Cell, toCells } from './view-model.ts';

interface BoardViewProps {
  game: SavedGame<PuzzleState>;
  busy: boolean;
  onMove: (tile: number) => void;
}

function TileButton(props: {
  cell: Cell;
  busy: boolean;
  onMove: (tile: number) => void;
}): ReactElement {
  const { cell, busy, onMove } = props;
  return (
    <button
      type="button"
      data-testid={'tile-' + String(cell.tile)}
      disabled={!cell.movable || busy}
      style={styles.tile(cell.movable)}
      onClick={() => {
        onMove(cell.tile);
      }}
    >
      {cell.tile}
    </button>
  );
}

export function BoardView({ game, busy, onMove }: BoardViewProps): ReactElement {
  return (
    <div
      data-testid="board"
      role="group"
      aria-label="Sliding puzzle"
      data-board={game.state.board.join(',')}
      style={styles.board}
    >
      {toCells(game).map((cell) =>
        cell.tile === 0 ? (
          <div key="blank" data-testid="tile-blank" style={styles.blank} />
        ) : (
          <TileButton key={cell.tile} cell={cell} busy={busy} onMove={onMove} />
        ),
      )}
    </div>
  );
}
