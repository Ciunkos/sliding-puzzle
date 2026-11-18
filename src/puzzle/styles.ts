// Styles of the puzzle screen. A stylesheet string, rendered once by the screen in a <style>
// element: media queries (dark mode, reduced motion), :focus-visible and keyframes need real CSS,
// and a `.css` import would break the unit tests (scripts/tsx-hooks.js loads only .ts and .tsx).
// Every class starts with `sp-`, so nothing here touches the rest of the page. The card colours
// match src/profile/styles.ts and the page colours in src/web/app.tsx (duplicated on purpose).
// Contrast (WCAG AA): white on tile #1f4fb8 is 7.3:1, on dark tile #3566d6 5.2:1, on won #13703a 6.2:1.
import type { CSSProperties } from 'react';
import type { Size } from './rules.ts';
import { BOARD_BORDER_SHARE, SCENE_MARGIN_SHARE } from './scene-model.ts';
import type { Place } from './view-model.ts';

/** A share of the stage's width in container units: 0.025 -> "2.5cqw". */
const cqw = (share: number) => `${String(Math.round(share * 1000) / 10)}cqw`;

/** The size and position of one cell: a tile slides when its transform changes. */
export function place(size: Size, at: Place): CSSProperties {
  const share = `calc(100% / ${String(size)})`;
  // A percentage in translate() is of the element itself, i.e. one cell per 100%.
  return {
    width: share,
    height: share,
    transform: `translate(${String(at.col * 100)}%, ${String(at.row * 100)}%)`,
  };
}

export function boardClass(size: Size, finished: boolean, layered = false): string {
  return `sp-board sp-size-${String(size)}${finished ? ' sp-won' : ''}${layered ? ' sp-layered' : ''}`;
}

export const css = `
.sp-puzzle {
  --sp-text: #111;
  --sp-muted: #4a5260;
  --sp-surface: #fff;
  --sp-line: #111;
  --sp-well: #d7dee8;
  --sp-tile: #1f4fb8;
  --sp-tile-text: #fff;
  --sp-won: #13703a;
  --sp-won-text: #13703a;
  --sp-ring-inner: #fff;
  --sp-ring-outer: #111;
  --sp-button: #fff;
  --sp-button-text: #111;
  --sp-pressed: #111;
  --sp-pressed-text: #fff;
  --sp-error: #b00020;
  color: var(--sp-text);
  background: var(--sp-surface);
  border: 2px solid var(--sp-line);
  border-radius: 8px;
  padding: 12px 16px 16px;
  margin: 0 0 16px;
}
@media (prefers-color-scheme: dark) {
  .sp-puzzle {
    --sp-text: #e8ecf3;
    --sp-muted: #aab3c2;
    --sp-surface: #10151f;
    --sp-line: #6b7689;
    --sp-well: #232b3a;
    --sp-tile: #3566d6;
    --sp-ring-inner: #10151f;
    --sp-ring-outer: #ffd23f;
    --sp-button: #1b2230;
    --sp-button-text: #e8ecf3;
    --sp-pressed: #e8ecf3;
    --sp-pressed-text: #10151f;
    --sp-error: #ff8a9a;
    --sp-won-text: #6fdc98;
  }
}
.sp-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.sp-status {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  min-height: 1.75rem;
  margin: 0 0 8px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sp-status p { margin: 0; }
.sp-board {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  max-width: 28rem;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  border: ${cqw(BOARD_BORDER_SHARE)} solid var(--sp-well);
  border-radius: 3.5cqw;
  background: var(--sp-well);
  container-type: inline-size;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.sp-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}
.sp-blank { position: absolute; top: 0; left: 0; box-sizing: border-box; padding: 1cqw; }
.sp-tile {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  margin: 0;
  /* 1% of the board on each side: the 3D tiles leave the same gap (use-three-parts.ts). */
  padding: 1cqw;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  touch-action: none;
  transition: transform 140ms ease-out;
}
.sp-tile[aria-disabled='true'] { cursor: default; }
.sp-tile:focus-visible { z-index: 1; }
.sp-face {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 9%;
  background: var(--sp-tile);
  color: var(--sp-tile-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  box-shadow: inset 0 -0.18em 0 rgb(0 0 0 / 0.28);
}
.sp-tile:focus-visible .sp-face {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-size-3 .sp-tile { font-size: 13cqw; }
.sp-size-4 .sp-tile { font-size: 9.5cqw; }
.sp-size-5 .sp-tile { font-size: 7.5cqw; }
.sp-won { animation: sp-pop 480ms ease-out; }
.sp-won .sp-face { background-color: var(--sp-won); }
@keyframes sp-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
.sp-stage {
  position: relative;
  isolation: isolate;
  max-width: 28rem;
  margin: 0 auto;
  /* The board's border and the 3D canvas are shares of this width (scene-model.ts). */
  container-type: inline-size;
}
/* The 3D board: under the buttons, a little larger than the board for its rim, shadow and tilt. */
.sp-scene {
  position: absolute;
  inset: -${cqw(SCENE_MARGIN_SHARE)};
  z-index: 0;
  pointer-events: none;
}
.sp-scene canvas { display: block; width: 100%; height: 100%; }
/* A picture tile: its square of the picture (inline style), and the optional number badge. */
.sp-face.sp-picture { position: relative; background-color: var(--sp-tile); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12); }
.sp-badge {
  position: absolute;
  top: 5%;
  left: 5%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5em;
  height: 1.5em;
  padding: 0 0.2em;
  box-sizing: border-box;
  border: 2px solid #fff;
  border-radius: 0.75em;
  background: rgb(17 17 17 / 0.82);
  color: #fff;
  font-size: 0.4em;
}
.sp-corner { display: block; animation: sp-fade 600ms ease-out; }
@keyframes sp-fade {
  from { transform: translateY(-12%) scale(1.06); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.sp-win { animation: sp-rise 320ms ease-out; }
.sp-banner { margin: 0; color: var(--sp-won-text); font-size: 17px; font-weight: 700; }
.sp-result { margin: 0; font-variant-numeric: tabular-nums; }
/* Transform only: fading the opacity would fail contrast checks while it runs. */
@keyframes sp-rise {
  from { transform: translateY(8px) scale(0.96); }
  to { transform: none; }
}
/* The line under the board: two lines are always reserved (how to play, a notice, or the win),
   so none of them appearing or going pushes the controls. */
.sp-below {
  box-sizing: border-box;
  min-height: 52px;
  max-width: 28rem;
  margin: 0 auto;
  padding: 6px 2px;
  font-size: 15px;
}
/* A fixed line height, so the bolder win lines take exactly the reserved two lines. */
.sp-below p { margin: 0; line-height: 20px; }
.sp-howto { color: var(--sp-muted); }
.sp-notice { color: var(--sp-muted); }
.sp-error { color: var(--sp-error); font-weight: 600; }
.sp-counts { display: flex; gap: 14px; margin: 0; }
.sp-timer { color: var(--sp-muted); }
.sp-saving { color: var(--sp-muted); font-size: 14px; font-weight: 400; }
.sp-best { margin: 16px 0 0; }
.sp-best ol {
  margin: 6px 0 0;
  padding-left: 1.6em;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
.sp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 0;
}
.sp-button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  padding: 8px 12px;
  border: 2px solid var(--sp-line);
  border-radius: 6px;
  background: var(--sp-button);
  color: var(--sp-button-text);
  font: inherit;
  font-size: 16px;
  cursor: pointer;
}
.sp-button[aria-pressed='true'] {
  background: var(--sp-pressed);
  color: var(--sp-pressed-text);
  font-weight: 700;
}
.sp-button[aria-disabled='true'] { cursor: progress; }
/* Unavailable, not just busy: muted and dashed (its description says why). */
.sp-unavailable[aria-disabled='true'] { border-style: dashed; color: var(--sp-muted); cursor: not-allowed; }
.sp-button:focus-visible,
.sp-tile:focus-visible { outline: none; }
.sp-button:focus-visible {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-sizes { margin: 16px 0 0; }
.sp-sizes .sp-row { margin-top: 6px; }
.sp-label { font-weight: 600; }
.sp-hint { margin: 6px 0 0; color: var(--sp-muted); font-size: 14px; }
/* The 3D board draws the tiles: the buttons stay exactly in place, see-through, so the focus
   ring (a box-shadow, not opacity) still shows on the tile it belongs to. */
.sp-layered { background: transparent; border-color: transparent; }
.sp-layered.sp-won { animation: none; }
.sp-layered .sp-face { background: transparent; color: transparent; box-shadow: none; }
.sp-layered .sp-tile:focus-visible .sp-face {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-look { margin: 16px 0 0; }
.sp-look > .sp-hint { margin-top: 6px; }
.sp-skins { margin: 10px 0 0; }
.sp-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border: 2px solid var(--sp-line);
  border-radius: 6px;
  background: var(--sp-button);
  font-size: 16px;
  cursor: pointer;
}
.sp-summary:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer); }
.sp-skin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
  margin: 10px 0 0;
}
.sp-skin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  padding: 6px 4px;
  border: 2px solid var(--sp-line);
  border-radius: 8px;
  background: var(--sp-button);
  color: var(--sp-button-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.sp-skin[aria-pressed='true'] {
  background: var(--sp-pressed);
  color: var(--sp-pressed-text);
  font-weight: 700;
}
.sp-skin:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer); }
.sp-thumb { display: block; width: 56px; height: 56px; border-radius: 6px; }
.sp-thumb-numbers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 4px;
  box-sizing: border-box;
  background: var(--sp-well);
}
.sp-thumb-numbers span {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--sp-tile);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
}
.sp-check { display: flex; align-items: center; gap: 10px; min-height: 44px; margin: 8px 0 0; }
.sp-check input { width: 22px; height: 22px; margin: 0; accent-color: var(--sp-tile); }
.sp-photo { margin: 4px 0 0; }
.sp-file { position: relative; display: inline-flex; align-items: center; justify-content: center; text-align: center; }
.sp-file-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.sp-file:focus-within { box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer); }
.sp-note:empty { display: none; }
@media (prefers-reduced-motion: reduce) {
  .sp-tile { transition: none; }
  .sp-won, .sp-win, .sp-corner { animation: none; }
}
`;
