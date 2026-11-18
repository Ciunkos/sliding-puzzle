// The puzzle board: one button per tile, absolutely placed, so a move slides it to its new cell.
// Tiles render in tile-number order and keep their element (key = tile number) across moves: the
// browser animates the transform, and focus stays on the tile. Positions live in the data-board order.
import type { ReactElement } from 'react';
import type { SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import type { Size } from './rules.ts';
import { boardClass, place } from './styles.ts';
import { useBoardInput } from './use-board-input.ts';
import { layout, type TileView } from './view-model.ts';

interface BoardViewProps {
  game: SavedGame<PuzzleState>;
  onMove: (tile: number) => void;
}

/** A tile that cannot move is aria-disabled, not disabled: it stays focusable and keeps focus. */
function TileButton({ tile, size }: { tile: TileView; size: Size }): ReactElement {
  return (
    <button
      type="button"
      className="sp-tile"
      data-testid={`tile-${String(tile.tile)}`}
      data-tile={tile.tile}
      aria-label={`Tile ${String(tile.tile)}`}
      aria-disabled={!tile.movable}
      style={place(size, tile)}
    >
      <span className="sp-face">{tile.tile}</span>
    </button>
  );
}

export function BoardView({ game, onMove }: BoardViewProps): ReactElement {
  const view = layout(game);
  const input = useBoardInput(game.state.board, game.finished, onMove);
  return (
    <div
      ref={input.ref}
      data-testid="board"
      role="group"
      aria-label="Sliding puzzle"
      data-board={game.state.board.join(',')}
      className={boardClass(view.size, game.finished)}
      onKeyDown={input.onKeyDown}
      onPointerDown={input.onPointerDown}
      onPointerUp={input.onPointerUp}
      onPointerCancel={input.onPointerCancel}
      onClick={input.onClick}
    >
      <div data-testid="tile-blank" className="sp-blank" style={place(view.size, view.blank)} />
      {view.tiles.map((tile) => (
        <TileButton key={tile.tile} tile={tile} size={view.size} />
      ))}
    </div>
  );
}
