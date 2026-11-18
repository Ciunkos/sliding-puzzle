// Styles of the puzzle screen. A stylesheet string, rendered once by the screen in a <style>
// element: media queries (dark mode, reduced motion), :focus-visible and keyframes need real CSS,
// and a `.css` import would break the unit tests (scripts/tsx-hooks.js loads only .ts and .tsx).
// Every class starts with `sp-`, so nothing here touches the rest of the page.
// Contrast (WCAG AA): white on tile #1f4fb8 is 7.3:1, on dark tile #3566d6 5.2:1, on won #13703a 6.2:1.
import type { CSSProperties } from 'react';
import type { Size } from './rules.ts';
import type { Place } from './view-model.ts';

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

export function boardClass(size: Size, finished: boolean): string {
  return `sp-board sp-size-${String(size)}${finished ? ' sp-won' : ''}`;
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
    --sp-line: #5b6577;
    --sp-well: #232b3a;
    --sp-tile: #3566d6;
    --sp-ring-inner: #10151f;
    --sp-ring-outer: #ffd23f;
    --sp-button: #1b2230;
    --sp-button-text: #e8ecf3;
    --sp-pressed: #e8ecf3;
    --sp-pressed-text: #10151f;
    --sp-error: #ff8a9a;
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
  box-sizing: border-box;
  width: 100%;
  max-width: 28rem;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  border: 4px solid var(--sp-well);
  border-radius: 12px;
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
.sp-blank { position: absolute; top: 0; left: 0; }
.sp-tile {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 3px;
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
  border-radius: 8px;
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
.sp-won .sp-face { background: var(--sp-won); }
@keyframes sp-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
.sp-banner {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--sp-won);
  color: #fff;
  font-weight: 600;
  text-align: center;
  animation: sp-rise 320ms ease-out;
}
/* Transform only: fading the opacity would fail contrast checks while it runs. */
@keyframes sp-rise {
  from { transform: translateY(8px) scale(0.96); }
  to { transform: none; }
}
.sp-error { margin: 12px 0 0; color: var(--sp-error); font-weight: 600; }
.sp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
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
.sp-button:focus-visible,
.sp-tile:focus-visible { outline: none; }
.sp-button:focus-visible {
  box-shadow: 0 0 0 2px var(--sp-ring-inner), 0 0 0 5px var(--sp-ring-outer);
}
.sp-sizes { margin: 16px 0 0; }
.sp-sizes .sp-row { margin-top: 6px; }
.sp-label { font-weight: 600; }
.sp-hint { margin: 6px 0 0; color: var(--sp-muted); font-size: 14px; }
@media (prefers-reduced-motion: reduce) {
  .sp-tile { transition: none; }
  .sp-won, .sp-banner { animation: none; }
}
`;
