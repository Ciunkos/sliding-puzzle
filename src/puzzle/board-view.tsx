// The puzzle board: one button per tile, absolutely placed, so a move slides it to its new cell.
// Tiles render in tile-number order and keep their element (key = tile number) across moves: the
// browser animates the transform, and focus stays on the tile. Positions live in the data-board order.
// The buttons are the only way to play. When the 3D board draws the tiles (`layered`), they stay
// exactly where they are, with a transparent face, so focus rings still show over the 3D tiles.
import type { ReactElement } from 'react';
import type { SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import type { Size } from './rules.ts';
import { boardClass, place } from './styles.ts';
import { useBoardInput } from './use-board-input.ts';
import { layout, pictureBackground, type Place, type TileView } from './view-model.ts';

/** How the board looks: the skin's name, its picture (if any) and whether the 3D board draws it. */
export interface BoardLook {
  skin: string;
  /** The picture's URL and whether its tiles carry number badges; undefined for numbers, and
   * while the 3D board draws the tiles. */
  picture: { url: string; badges: boolean } | undefined;
  /** The 3D board is drawn under the buttons. */
  layered: boolean;
  /** The id of an element that says what the picture shows. */
  describedBy: string | undefined;
}

const NUMBERS: BoardLook = {
  skin: 'numbers',
  picture: undefined,
  layered: false,
  describedBy: undefined,
};

interface BoardViewProps {
  game: SavedGame<PuzzleState>;
  onMove: (tile: number) => void;
  look?: BoardLook;
}

/** The visible face of a tile: its number, or its square of the picture with an optional badge. */
function Face(props: { tile: number; size: Size; look: BoardLook }): ReactElement {
  const { tile, size, look } = props;
  const { picture } = look;
  if (picture === undefined) return <span className="sp-face">{tile}</span>;
  return (
    <span className="sp-face sp-picture" style={pictureBackground(tile, size, picture.url)}>
      {picture.badges ? <span className="sp-badge">{tile}</span> : null}
    </span>
  );
}

/**
 * A tile that cannot move is aria-disabled, not disabled: it stays focusable and keeps focus. Only
 * the tab-stop tile is in the tab order (tabindex 0); the others are reached by click or focus().
 */
function TileButton(props: {
  tile: TileView;
  size: Size;
  tabStop: boolean;
  look: BoardLook;
}): ReactElement {
  const { tile, size } = props;
  return (
    <button
      type="button"
      className="sp-tile"
      data-testid={`tile-${String(tile.tile)}`}
      data-tile={tile.tile}
      aria-label={`Tile ${String(tile.tile)}`}
      aria-disabled={!tile.movable}
      tabIndex={props.tabStop ? 0 : -1}
      style={place(size, tile)}
    >
      <Face tile={tile.tile} size={size} look={props.look} />
    </button>
  );
}

/** The gap; on a solved picture it shows the missing corner, so the picture is whole. */
function Blank(props: { size: Size; finished: boolean; look: BoardLook; at: Place }): ReactElement {
  const { size, look } = props;
  const corner = props.finished ? look.picture : undefined;
  return (
    <div data-testid="tile-blank" className="sp-blank" style={place(size, props.at)}>
      {corner === undefined ? null : (
        <span
          className="sp-face sp-corner"
          style={pictureBackground(size * size, size, corner.url)}
        />
      )}
    </div>
  );
}

export function BoardView({ game, onMove, look = NUMBERS }: BoardViewProps): ReactElement {
  const view = layout(game);
  const input = useBoardInput(game.state.board, game.finished, onMove);
  return (
    <div
      ref={input.ref}
      data-testid="board"
      role="group"
      aria-label="Sliding puzzle"
      aria-describedby={look.describedBy}
      data-skin={look.skin}
      data-board={game.state.board.join(',')}
      className={boardClass(view.size, game.finished, look.layered)}
      onKeyDown={input.onKeyDown}
      onPointerDown={input.onPointerDown}
      onPointerUp={input.onPointerUp}
      onPointerCancel={input.onPointerCancel}
      onClick={input.onClick}
      onFocus={input.onFocus}
    >
      <Blank size={view.size} finished={game.finished} look={look} at={view.blank} />
      {view.tiles.map((tile) => (
        <TileButton
          key={tile.tile}
          tile={tile}
          size={view.size}
          tabStop={tile.tile === input.tabStop}
          look={look}
        />
      ))}
    </div>
  );
}
