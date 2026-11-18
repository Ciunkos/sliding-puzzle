// Styles of the profile screens: class names, and one stylesheet (rendered by ProfileBar and
// InvalidProfile, one of which is always on a profile screen) with a
// dark variant through @media (prefers-color-scheme: dark), which every browser in use supports.
// Buttons, the field and the disclosure are at least 44px tall (touch targets). The colours match
// the puzzle card (src/puzzle/styles.ts) and the page (src/web/app.tsx); duplicated on purpose.

export const section = 'pf-card';
export const heading = 'pf-heading';
export const notice = 'pf-notice';
export const row = 'pf-row';
export const button = 'pf-button';
export const input = 'pf-input';
/** Keeps the default display (list-item), so the disclosure triangle stays visible. */
export const summary = 'pf-summary';
export const error = 'pf-error';
export const raw = 'pf-raw';

export const css = `
.pf-card {
  border: 2px solid #111;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 0 0 16px;
  color: #111;
  background: #fff;
}
.pf-heading { font-size: 18px; margin: 0 0 4px; overflow-wrap: anywhere; }
.pf-notice { margin: 0 0 8px; }
.pf-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; }
.pf-button {
  min-height: 44px;
  font-size: 16px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 2px solid #111;
  background: #fff;
  color: #111;
  cursor: pointer;
}
.pf-input {
  min-height: 44px;
  box-sizing: border-box;
  font-size: 16px;
  padding: 8px;
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
.pf-error { color: #b00020; font-weight: 600; margin: 8px 0 0; }
.pf-raw { overflow-wrap: anywhere; font-weight: 600; }
@media (prefers-color-scheme: dark) {
  .pf-card { border-color: #6b7689; color: #e8ecf3; background: #10151f; }
  .pf-button { border-color: #6b7689; color: #e8ecf3; background: #1b2230; }
  .pf-error { color: #ff8a9a; }
}
`;
