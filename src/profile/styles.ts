// Styles of the profile screens: class names, and one stylesheet (rendered by ProfileBar,
// InvalidProfile and the loading line, one of which is always on a profile screen) with a
// dark variant through @media (prefers-color-scheme: dark), which every browser in use supports.
// Buttons, the field and the disclosure are at least 44px tall (touch targets); text sizes are in
// rem, so they follow the reader's font size; focus is always visible. Colours are the warm,
// wood-and-paper ones of the game (src/puzzle/styles.ts), duplicated on purpose. Text contrast
// (WCAG AA): #2b1d10 on #fffaf0 is 15:1, #5c4630 on #fffaf0 is 8.3:1; dark #f3e9da on #1d1712 is
// 14:1, #cdbba3 on #1d1712 is 9.6:1.

export const section = 'pf-card';
export const heading = 'pf-heading';
export const notice = 'pf-notice';
export const row = 'pf-row';
export const button = 'pf-button';
export const input = 'pf-input';
/** Keeps the default display (list-item), so the disclosure triangle stays visible. */
export const summary = 'pf-summary';
export const disclosure = 'pf-disclosure';
export const error = 'pf-error';
export const raw = 'pf-raw';
/** The profile's part of the game menu. */
export const bar = 'pf-bar';
export const barHeading = 'pf-bar-heading';
export const barNotice = 'pf-bar-notice';
/** The profile's own pages (unusable name, offline, an error): a column with a margin. */
export const page = 'pf-page';
export const loading = 'pf-loading';
/** The first-visit toast over the game. */
export const toast = 'pf-toast';
export const toastHeading = 'pf-toast-heading';
export const toastName = 'pf-toast-name';
export const toastNotice = 'pf-toast-notice';

export const css = `
.pf-page {
  box-sizing: border-box;
  max-width: 40rem;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
.pf-loading { margin: 0; padding: 2rem 1rem; text-align: center; }
.pf-card {
  border: 2px solid #2b1d10;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 0 0 16px;
  color: #2b1d10;
  background: #fffaf0;
}
.pf-heading { font-size: 1.125rem; margin: 0 0 4px; overflow-wrap: anywhere; }
.pf-notice { margin: 0 0 8px; }
.pf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
.pf-button {
  min-height: 44px;
  font: inherit;
  font-size: 1rem;
  padding: 8px 16px;
  border-radius: 999px;
  border: 2px solid #2b1d10;
  background: #fffaf0;
  color: #2b1d10;
  cursor: pointer;
  transition: transform 260ms linear(0, 0.6 18%, 1.12 38%, 0.97 60%, 1.01 80%, 1);
}
.pf-button:active { transform: scale(0.92, 0.88); transition-duration: 60ms; }
.pf-input {
  min-height: 44px;
  box-sizing: border-box;
  font: inherit;
  font-size: 1rem;
  padding: 8px 12px;
  border: 2px solid #5c4630;
  border-radius: 10px;
  background: #fff;
  color: #2b1d10;
  flex: 1 1 10rem;
  min-width: 0;
}
.pf-summary {
  min-height: 44px;
  box-sizing: border-box;
  padding: 12px 0;
  cursor: pointer;
  font-weight: 600;
}
.pf-error { color: #a1001a; font-weight: 600; margin: 8px 0 0; }
.pf-raw { overflow-wrap: anywhere; font-weight: 600; }
.pf-bar-heading { font-size: 1.125rem; margin: 0; overflow-wrap: anywhere; }
.pf-bar-notice { margin: 4px 0 0; color: #5c4630; font-size: 0.9375rem; }
.pf-disclosure { margin: 4px 0 0; }
.pf-button:focus-visible, .pf-input:focus-visible, .pf-summary:focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}
/* Over the game, under its top corners. Takes no taps, so the board under it stays playable. */
.pf-toast {
  position: fixed;
  z-index: 30;
  top: calc(max(8px, env(safe-area-inset-top)) + 60px);
  left: 50%;
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 24px));
  padding: 12px 16px;
  border: 2px solid #2b1d10;
  border-radius: 16px;
  background: #fffaf0;
  color: #2b1d10;
  box-shadow: 0 12px 32px rgb(43 29 16 / 0.28);
  pointer-events: none;
  transform: translateX(-50%);
  animation: pf-drop 560ms linear(0, 0.42 12%, 0.86 24%, 1.08 38%, 1.02 52%, 0.99 70%, 1) both;
}
.pf-toast-heading { margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
.pf-toast-heading:focus { outline: none; }
.pf-toast-name { font-weight: 800; }
.pf-toast-notice { margin: 4px 0 0; font-size: 0.875rem; color: #5c4630; }
/* Transform only: a fade would fail contrast checks while it runs. */
@keyframes pf-drop {
  from { transform: translate(-50%, -24px) scale(0.9); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .pf-toast { animation: none; }
  .pf-button, .pf-button:active { transition: none; transform: none; }
}
@media (prefers-color-scheme: dark) {
  .pf-button:focus-visible, .pf-input:focus-visible, .pf-summary:focus-visible {
    outline-color: #ffd23f;
  }
  .pf-card, .pf-toast { border-color: #8a7158; color: #f3e9da; background: #1d1712; }
  .pf-button { border-color: #8a7158; color: #f3e9da; background: #2a2119; }
  .pf-input { border-color: #8a7158; color: #f3e9da; background: #120e0a; }
  .pf-bar-notice, .pf-toast-notice { color: #cdbba3; }
  .pf-error { color: #ff8a9a; }
}
`;
