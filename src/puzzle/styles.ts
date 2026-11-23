// Styles of the puzzle screen. A stylesheet string, rendered once by the screen in a <style>
// element: media queries (dark mode, reduced motion), :focus-visible and keyframes need real CSS,
// and a `.css` import would break the unit tests (scripts/tsx-hooks.js loads only .ts and .tsx).
// Every class starts with `sp-`, so nothing here touches the rest of the page. The warm colours
// match src/profile/styles.ts (duplicated on purpose). Contrast (WCAG AA): the burned numbers
// #3a2210 on the darkest wood #c48a48 are 5.0:1; text #2b1d10 on the page's darkest corner #d9bd92
// is 10:1, muted #5c4630 on #efdcbc 6.6:1; dark text #f3e9da on #2b2119 13:1, muted #cdbba3 8.4:1.
import type { CSSProperties } from 'react';
import type { Size } from './rules.ts';
import { BOARD_BORDER_SHARE, SCENE_MARGIN_SHARE, SLIDE_EASING, SLIDE_MS } from './scene-model.ts';
import type { Place } from './view-model.ts';

/** A share of the stage's width in container units: 0.025 -> "2.5cqw". */
const cqw = (share: number) => `${String(Math.round(share * 1000) / 10)}cqw`;

/**
 * The size and position of one cell: a tile slides when its transform changes. A `held` tile
 * (a drag) is drawn its --sp-drag-x and --sp-drag-y further, which the pointer handler writes on
 * it directly (use-board-input.ts), once a frame, without a render.
 */
export function place(size: Size, at: Place, held = false): CSSProperties {
  const share = `calc(100% / ${String(size)})`;
  // A percentage in translate() is of the element itself, i.e. one cell per 100%.
  const x = `${String(at.col * 100)}%`;
  const y = `${String(at.row * 100)}%`;
  const transform = held
    ? `translate(calc(${x} + var(--sp-drag-x, 0%)), calc(${y} + var(--sp-drag-y, 0%)))`
    : `translate(${x}, ${y})`;
  return { width: share, height: share, transform };
}

export function boardClass(size: Size, finished: boolean, layered = false): string {
  return `sp-board sp-size-${String(size)}${finished ? ' sp-won' : ''}${layered ? ' sp-layered' : ''}`;
}

/** A spring: overshoots a little and settles (CSS linear() easing), for the "jelly" moves. */
const SPRING = 'linear(0, 0.38 9%, 0.84 20%, 1.1 33%, 1.06 42%, 0.98 58%, 1.005 75%, 1)';
/** The 3D board's rim around the board, both sides together: the board is the arena / this. */
const WITH_RIM = String(1 + 2 * SCENE_MARGIN_SHARE);
/**
 * The board's side in the arena: as tall as fits with the 3D board's margin, and on a narrow screen
 * the full width (the margin's soft shadow may then reach into the screen's edge).
 */
const BOARD = `min(100cqw, 100cqh / ${WITH_RIM})`;

export const css = `
/* Registered, so the page's colours can change with a transition when the picture changes. */
@property --sp-bg-1 { syntax: '<color>'; inherits: true; initial-value: #fbf3e4; }
@property --sp-bg-2 { syntax: '<color>'; inherits: true; initial-value: #efdcbc; }
@property --sp-bg-3 { syntax: '<color>'; inherits: true; initial-value: #d9bd92; }
.sp-puzzle {
  --sp-text: #2b1d10;
  --sp-muted: #5c4630;
  --sp-surface: #fffaf0;
  --sp-line: #2b1d10;
  --sp-frame: #5a3418;
  --sp-felt: #2f4a3a;
  --sp-felt-text: #f3e9da;
  --sp-tile: #d2a062;
  --sp-tile-text: #3a2210;
  --sp-won-text: #13703a;
  --sp-ring-inner: #fffaf0;
  --sp-ring-outer: #1d4ed8;
  --sp-button: #fffaf0;
  --sp-button-text: #2b1d10;
  --sp-pressed: #2b1d10;
  --sp-pressed-text: #fffaf0;
  --sp-primary: #7a3f12;
  --sp-primary-text: #fff8ec;
  --sp-error: #a1001a;
  --sp-well: #e6d6bb;
  /* The page behind the board: the picture's colours (palettes.ts, inline), or warm wood. */
  --sp-bg-1: var(--sp-bg-light-1, #fbf3e4);
  --sp-bg-2: var(--sp-bg-light-2, #efdcbc);
  --sp-bg-3: var(--sp-bg-light-3, #d9bd92);
  position: relative;
  box-sizing: border-box;
  height: 100%;
  overflow: hidden;
  color: var(--sp-text);
  background: radial-gradient(120% 95% at 50% 42%, var(--sp-bg-1) 0%, var(--sp-bg-2) 58%, var(--sp-bg-3) 100%);
  transition: --sp-bg-1 700ms ease, --sp-bg-2 700ms ease, --sp-bg-3 700ms ease;
  /* The screen's layout asks how wide the game is, not how wide the window is. */
  container-type: inline-size;
}
/* A soft vignette over the page, under everything on it. */
.sp-puzzle::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 18vmin rgb(60 30 5 / 0.22);
}
@media (prefers-color-scheme: dark) {
  .sp-puzzle {
    --sp-text: #f3e9da;
    --sp-muted: #cdbba3;
    --sp-surface: #1d1712;
    --sp-line: #8a7158;
    --sp-frame: #3a2210;
    --sp-felt: #1e3328;
    --sp-ring-inner: #1d1712;
    --sp-ring-outer: #ffd23f;
    --sp-button: #2a2119;
    --sp-button-text: #f3e9da;
    --sp-pressed: #f3e9da;
    --sp-pressed-text: #1d1712;
    --sp-primary: #e3a25a;
    --sp-primary-text: #2b1406;
    --sp-error: #ff8a9a;
    --sp-won-text: #6fdc98;
    --sp-well: #3a2e24;
    --sp-bg-1: var(--sp-bg-dark-1, #2b2119);
    --sp-bg-2: var(--sp-bg-dark-2, #1a140f);
    --sp-bg-3: var(--sp-bg-dark-3, #0d0a07);
  }
  .sp-puzzle::before { box-shadow: inset 0 0 18vmin rgb(0 0 0 / 0.5); }
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
/* The screen: the top corners, the board, the line under it, the bottom corners. Every row but
   the board's has a fixed height, so nothing that appears later moves anything. */
.sp-screen {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr) 44px auto;
  grid-template-areas:
    "top top top"
    "arena arena arena"
    "line line line"
    "reset . new";
  gap: 6px 10px;
  padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right))
    max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
}
/* Wider: the line sits between the two actions. */
@container (min-width: 40rem) {
  .sp-screen {
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "top top top"
      "arena arena arena"
      "reset line new";
  }
}
.sp-top {
  grid-area: top;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
}
.sp-status { position: relative; text-align: center; }
.sp-counts {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sp-surface) 78%, transparent);
  font-weight: 700;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 2px 10px rgb(40 20 5 / 0.12);
}
.sp-dot, .sp-timer { color: var(--sp-muted); }
/* Floats under the moves: it never takes room. */
.sp-saving {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 2px 0 0;
  color: var(--sp-muted);
  font-size: 13px;
}
.sp-saving:empty { display: none; }
.sp-arena {
  grid-area: arena;
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  /* The board is as large as the smaller side of this, the 3D rim included. */
  container-type: size;
}
.sp-stage {
  position: relative;
  isolation: isolate;
  grid-area: 1 / 1;
  width: ${BOARD};
  /* The board's border and the 3D canvas are shares of this width (scene-model.ts). */
  container-type: inline-size;
}
.sp-line {
  grid-area: line;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 44px;
  text-align: center;
  font-size: 14px;
  line-height: 18px;
}
.sp-line p { margin: 0; }
.sp-howto, .sp-notice { color: var(--sp-muted); }
.sp-howto { transition: opacity 600ms ease, visibility 0s linear 0s; }
/* After the first move: gone, its place kept. */
.sp-howto.sp-faded { opacity: 0; visibility: hidden; transition: opacity 600ms ease, visibility 0s linear 600ms; }
.sp-error { color: var(--sp-error); font-weight: 600; }
.sp-howto, .sp-notice, .sp-error {
  padding: 4px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sp-surface) 85%, transparent);
}
.sp-actions { display: contents; }
.sp-new-game { grid-area: new; justify-self: end; }
.sp-reset { grid-area: reset; justify-self: start; }
/* The board: a dark wooden tray with a felt floor. */
.sp-board {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 1 / 1;
  margin: 0;
  border: ${cqw(BOARD_BORDER_SHARE)} solid var(--sp-frame);
  border-radius: 3.5cqw;
  background:
    radial-gradient(circle at 50% 40%, rgb(255 255 255 / 0.06), transparent 70%),
    var(--sp-felt);
  box-shadow:
    inset 0 0.6cqw 1.6cqw rgb(0 0 0 / 0.5),
    0 0 0 1px rgb(0 0 0 / 0.35),
    0 0.3cqw 0 rgb(255 225 180 / 0.25) inset,
    0 3cqw 6cqw rgb(40 20 5 / 0.35);
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
  color: var(--sp-felt-text);
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
  /* The 3D board's spring (scene-model.ts); plain ease-out where linear() is not supported. */
  transition: transform ${String(SLIDE_MS)}ms ease-out;
  transition: transform ${String(SLIDE_MS)}ms ${SLIDE_EASING};
}
.sp-tile[aria-disabled='true'] { cursor: default; }
/* Held by a finger: it follows at once; on release it springs on into the gap or back. */
.sp-tile.sp-held { transition: none; cursor: grabbing; }
.sp-tile:focus-visible { z-index: 1; }
/* A wooden block: grain in two directions over a lit gradient, a bevel and a burned-in number. */
.sp-face {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 9%;
  background:
    repeating-linear-gradient(93deg, rgb(110 60 20 / 0.12) 0 1.5px, transparent 1.5px 6px),
    repeating-linear-gradient(87deg, rgb(255 240 210 / 0.12) 0 1px, transparent 1px 11px),
    radial-gradient(130% 100% at 28% 18%, #f2cf95 0%, #dcab68 52%, #c48a48 100%);
  color: var(--sp-tile-text);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-shadow: 0 1px 0 rgb(255 235 200 / 0.55);
  box-shadow:
    inset 0 0.12em 0 rgb(255 245 225 / 0.6),
    inset 0 -0.16em 0 rgb(90 50 20 / 0.45),
    inset 0 0 0 1px rgb(90 50 20 / 0.35),
    0 0.08em 0.18em rgb(20 10 2 / 0.45);
}
.sp-tile:focus-visible .sp-face {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-size-3 .sp-tile { font-size: 13cqw; }
.sp-size-4 .sp-tile { font-size: 9.5cqw; }
.sp-size-5 .sp-tile { font-size: 7.5cqw; }
/* Solved: the blocks glow like honey. */
.sp-won .sp-face {
  background:
    repeating-linear-gradient(93deg, rgb(110 60 20 / 0.1) 0 1.5px, transparent 1.5px 6px),
    radial-gradient(130% 100% at 28% 18%, #fde7a8 0%, #efc56a 55%, #d9a443 100%);
  box-shadow:
    inset 0 0.12em 0 rgb(255 250 230 / 0.7),
    inset 0 -0.16em 0 rgb(120 70 10 / 0.4),
    0 0 0.4em rgb(255 200 80 / 0.55);
}
/* A small shake of the flat board when a tile lands, a bigger one on the win (the 3D board shakes
   its camera instead). Two names, so the animation starts again on every move. */
.sp-stage[data-shake='a'] .sp-board:not(.sp-layered) { animation: sp-shake-a 200ms 110ms ease-out; }
.sp-stage[data-shake='b'] .sp-board:not(.sp-layered) { animation: sp-shake-b 200ms 110ms ease-out; }
.sp-stage[data-shake='win'] .sp-board:not(.sp-layered) { animation: sp-shake-win 560ms 120ms ease-out; }
@keyframes sp-shake-a {
  25% { transform: translate(0.4cqw, 0.25cqw); }
  60% { transform: translate(-0.3cqw, -0.15cqw); }
}
@keyframes sp-shake-b {
  25% { transform: translate(-0.4cqw, 0.25cqw); }
  60% { transform: translate(0.3cqw, -0.15cqw); }
}
/* A tile that cannot move wiggles on the flat board (the 3D board wiggles its own block). */
.sp-board:not(.sp-layered) .sp-tile[data-nudge='a'] .sp-face { animation: sp-wiggle-a 260ms ease-out; }
.sp-board:not(.sp-layered) .sp-tile[data-nudge='b'] .sp-face { animation: sp-wiggle-b 260ms ease-out; }
@keyframes sp-wiggle-a {
  20% { transform: translateX(-5%) rotate(-3deg); }
  45% { transform: translateX(4%) rotate(2deg); }
  70% { transform: translateX(-2%) rotate(-1deg); }
}
@keyframes sp-wiggle-b {
  20% { transform: translateX(5%) rotate(3deg); }
  45% { transform: translateX(-4%) rotate(-2deg); }
  70% { transform: translateX(2%) rotate(1deg); }
}
@keyframes sp-shake-win {
  15% { transform: translate(1cqw, -0.5cqw) rotate(0.6deg); }
  35% { transform: translate(-0.9cqw, 0.4cqw) rotate(-0.5deg); }
  55% { transform: translate(0.5cqw, -0.2cqw) scale(1.02); }
  80% { transform: translate(-0.2cqw, 0.1cqw); }
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
.sp-face.sp-picture { position: relative; background-color: var(--sp-tile); box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12), 0 0.08em 0.18em rgb(20 10 2 / 0.45); }
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
  text-shadow: none;
}
.sp-corner { display: block; animation: sp-fade 600ms ease-out; }
@keyframes sp-fade {
  from { transform: translateY(-12%) scale(1.06); opacity: 0; }
  to { transform: none; opacity: 1; }
}
/*
 * The win card: springs in where the line under the board was (free once solved: on a phone the
 * row above the actions, on a wider screen the space between them), never over the board, the
 * solved picture being the reward. Compact, on one row; taller than the line's 44 px row, it grows
 * upwards into the gap above (align-self: end). An overlay: it moves nothing.
 */
.sp-win-card {
  grid-area: line;
  align-self: end;
  justify-self: center;
  z-index: 3;
  box-sizing: border-box;
  max-width: 100%;
  display: grid;
  grid-template-columns: auto auto;
  grid-template-areas: "banner play" "result play";
  align-items: center;
  column-gap: 12px;
  row-gap: 2px;
  padding: 2px 2px 2px 14px;
  border: 2px solid var(--sp-line);
  border-radius: 999px;
  background: var(--sp-surface);
  box-shadow: 0 12px 32px rgb(20 10 2 / 0.35);
  animation: sp-pop-in 620ms ${SPRING} both;
}
.sp-banner { grid-area: banner; margin: 0; color: var(--sp-won-text); font-size: 1rem; font-weight: 800; line-height: 1.2; }
.sp-result { grid-area: result; margin: 0; font-size: 0.8125rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.sp-win-card .sp-button { grid-area: play; padding: 8px 14px; }
/* Transform only: fading the opacity would fail contrast checks while it runs. */
@keyframes sp-pop-in {
  from { transform: translateY(24px) scale(0.6); }
  to { transform: none; }
}
/* Buttons: pills that squash when pressed and spring back. */
.sp-button {
  box-sizing: border-box;
  min-width: 44px;
  min-height: 44px;
  padding: 8px 18px;
  border: 2px solid var(--sp-line);
  border-radius: 999px;
  background: var(--sp-button);
  color: var(--sp-button-text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 0 rgb(40 20 5 / 0.25), 0 4px 12px rgb(40 20 5 / 0.12);
  transition: transform 320ms ${SPRING};
}
.sp-button:active { transform: scale(0.9, 0.84); transition-duration: 70ms; }
.sp-primary {
  border-color: var(--sp-primary);
  background: var(--sp-primary);
  color: var(--sp-primary-text);
}
.sp-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
}
.sp-icon-button svg { fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; }
.sp-button[aria-pressed='true'] {
  background: var(--sp-pressed);
  color: var(--sp-pressed-text);
  font-weight: 700;
}
.sp-button[aria-disabled='true'] { cursor: progress; }
/* Unavailable, not just busy: muted and dashed (its description says why). */
.sp-unavailable[aria-disabled='true'] { border-style: dashed; color: var(--sp-muted); cursor: not-allowed; box-shadow: none; }
.sp-button:focus-visible,
.sp-tile:focus-visible { outline: none; }
.sp-button:focus-visible {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-hint { margin: 6px 0 0; color: var(--sp-muted); font-size: 14px; }
/* The 3D board draws the tiles: the buttons stay exactly in place, see-through, so the focus
   ring (a box-shadow, not opacity) still shows on the tile it belongs to. */
.sp-layered { background: transparent; border-color: transparent; box-shadow: none; }
.sp-layered .sp-face { background: transparent; color: transparent; box-shadow: none; text-shadow: none; }
.sp-layered .sp-tile:focus-visible .sp-face {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
/* The sound controls (sound-button.tsx): the corner speaker and the menu's two switches. */
.sp-sound-button {
  display: inline-flex; align-items: center; justify-content: center;
  inline-size: 44px; block-size: 44px; padding: 0; border-radius: 50%;
  border: 1px solid var(--sp-line, currentColor);
  background: var(--sp-button, transparent); color: var(--sp-button-text, inherit);
  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
.sp-sound-button[aria-pressed="false"] { color: var(--sp-muted, inherit); }
.sp-sound-button:focus-visible {
  outline: 3px solid var(--sp-ring-outer, currentColor); outline-offset: 2px;
}
.sp-sound-icon { display: block; }
.sp-sound-settings { display: grid; gap: 0.5rem; }
.sp-sound-switch {
  display: flex; align-items: center; gap: 0.75rem; min-block-size: 44px; cursor: pointer;
}
.sp-sound-switch input {
  appearance: none; -webkit-appearance: none; margin: 0; flex: none;
  inline-size: 2.75rem; block-size: 1.5rem; border-radius: 0.75rem; position: relative;
  border: 1px solid var(--sp-line, currentColor); background: var(--sp-well, transparent);
  cursor: pointer; transition: background-color 0.15s;
}
.sp-sound-switch input::after {
  content: ""; position: absolute; inset-block-start: 0.125rem; inset-inline-start: 0.125rem;
  inline-size: 1.125rem; block-size: 1.125rem; border-radius: 50%;
  background: var(--sp-button-text, currentColor); transition: transform 0.15s;
}
.sp-sound-switch input:checked { background: var(--sp-tile, currentColor); }
.sp-sound-switch input:checked::after {
  transform: translateX(1.25rem); background: var(--sp-tile-text, #fff);
}
.sp-sound-switch input:focus-visible {
  outline: 3px solid var(--sp-ring-outer, currentColor); outline-offset: 2px;
}
.sp-sound-note { margin: 0; font-size: 0.875rem; color: var(--sp-muted, inherit); }
@media (prefers-reduced-motion: reduce) {
  .sp-sound-switch input, .sp-sound-switch input::after { transition: none; }
}
/* The speaker crafted like the other HUD buttons. */
.sp-sound-button {
  border: 2px solid var(--sp-line);
  box-shadow: 0 2px 0 rgb(40 20 5 / 0.25), 0 4px 12px rgb(40 20 5 / 0.12);
  transition: transform 320ms ${SPRING};
}
.sp-sound-button:active { transform: scale(0.9, 0.84); transition-duration: 70ms; }
.sp-sound-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-sound-switch input:checked { background: var(--sp-primary); border-color: var(--sp-primary); }
.sp-sound-switch input:checked::after { background: var(--sp-primary-text); }
/* The menu: a card that drops from its corner with a jelly spring; its sections follow. */
.sp-menu {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 20px));
  max-width: none;
  max-height: calc(100svh - 20px);
  margin: max(10px, env(safe-area-inset-top)) auto auto max(10px, env(safe-area-inset-left));
  padding: 0;
  border: 2px solid var(--sp-line);
  border-radius: 22px;
  background: var(--sp-surface);
  color: var(--sp-text);
  box-shadow: 0 24px 60px rgb(20 10 2 / 0.4);
  overflow: auto;
  overscroll-behavior: contain;
  transform-origin: 22px 22px;
}
.sp-menu[open] { animation: sp-jelly 640ms ${SPRING} both; }
.sp-menu::backdrop { background: rgb(20 12 4 / 0.45); backdrop-filter: blur(3px); }
@keyframes sp-jelly {
  0% { transform: scale(0.4, 0.3); }
  45% { transform: scale(1.03, 0.98); }
  70% { transform: scale(0.99, 1.01); }
  100% { transform: none; }
}
.sp-menu-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 20px;
  background: var(--sp-surface);
  border-bottom: 1px solid color-mix(in srgb, var(--sp-line) 25%, transparent);
}
.sp-menu-title { margin: 0; font-size: 1.25rem; }
.sp-menu-body { padding: 4px 20px 20px; }
.sp-menu-body > * {
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--sp-line) 18%, transparent);
}
.sp-menu-body > :last-child { border-bottom: 0; }
.sp-menu[open] .sp-menu-body > * { animation: sp-rise 480ms ${SPRING} both; }
.sp-menu[open] .sp-menu-body > :nth-child(2) { animation-delay: 40ms; }
.sp-menu[open] .sp-menu-body > :nth-child(3) { animation-delay: 80ms; }
.sp-menu[open] .sp-menu-body > :nth-child(4) { animation-delay: 120ms; }
.sp-menu[open] .sp-menu-body > :nth-child(5) { animation-delay: 160ms; }
@keyframes sp-rise {
  from { transform: translateY(14px) scale(0.97); }
  to { transform: none; }
}
.sp-menu-shell > * + * { margin-top: 16px; }
.sp-menu-heading { margin: 0 0 8px; font-size: 1rem; }
.sp-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; }
.sp-menu-heading + .sp-row { margin-top: 0; }
.sp-row > .sp-button { flex: 1 1 0; min-width: 0; }
.sp-best ol {
  margin: 0;
  padding-left: 1.6em;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
/* On a touch screen the tilt button's place beside "3D board" is kept, so it appears without
   moving anything. */
@media (pointer: coarse) {
  .sp-look > .sp-row:first-child { display: grid; grid-template-columns: 1fr 1fr; }
}
.sp-look > .sp-row:first-child { margin-top: 0; }
.sp-look > .sp-hint { margin-top: 6px; }
.sp-skins { margin: 10px 0 0; }
.sp-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border: 2px solid var(--sp-line);
  border-radius: 999px;
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
  border-radius: 12px;
  background: var(--sp-button);
  color: var(--sp-button-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: transform 320ms ${SPRING};
}
.sp-skin:active { transform: scale(0.92, 0.88); transition-duration: 70ms; }
.sp-skin[aria-pressed='true'] {
  background: var(--sp-pressed);
  color: var(--sp-pressed-text);
  font-weight: 700;
}
.sp-skin:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer); }
.sp-thumb { display: block; width: 56px; height: 56px; border-radius: 8px; }
.sp-thumb-numbers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 4px;
  box-sizing: border-box;
  background: var(--sp-felt);
}
.sp-thumb-numbers span {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: #dcab68;
  color: #3a2210;
  font-weight: 800;
  font-size: 14px;
}
.sp-check { display: flex; align-items: center; gap: 10px; min-height: 44px; margin: 8px 0 0; }
.sp-check input { width: 22px; height: 22px; margin: 0; accent-color: var(--sp-primary); }
.sp-photo { margin: 4px 0 0; }
.sp-file { position: relative; display: inline-flex; align-items: center; justify-content: center; text-align: center; }
.sp-file-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.sp-file:focus-within { box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer); }
.sp-note:empty { display: none; }
@media (prefers-reduced-motion: reduce) {
  .sp-tile { transition: none; }
  .sp-corner, .sp-win-card, .sp-menu[open], .sp-menu[open] .sp-menu-body > * { animation: none; }
  .sp-stage[data-shake] .sp-board:not(.sp-layered),
  .sp-tile[data-nudge] .sp-face { animation: none; }
  .sp-puzzle, .sp-howto, .sp-howto.sp-faded { transition: none; }
  .sp-sound-button, .sp-sound-button:active { transition: none; transform: none; }
  .sp-button, .sp-skin, .sp-button:active, .sp-skin:active { transition: none; transform: none; }
}
`;
