// What the polite live region says: the text of the latest move or win (see announcement()).
import { useEffect, useRef, useState } from 'react';
import type { SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import type { Board } from './rules.ts';
import { announcement } from './view-model.ts';

/** Keeps the last non-empty announcement, so a re-render does not clear what is being read out. */
export function useAnnouncement(game: SavedGame<PuzzleState> | undefined): string {
  const previous = useRef<Board | undefined>(undefined);
  const [text, setText] = useState('');
  useEffect(() => {
    // No game (another profile loading): what comes next is a load, not a move from the last board.
    if (game === undefined) {
      previous.current = undefined;
      return;
    }
    const next = announcement(previous.current, game);
    previous.current = game.state.board;
    if (next !== '') setText(next);
  }, [game]);
  return text;
}
