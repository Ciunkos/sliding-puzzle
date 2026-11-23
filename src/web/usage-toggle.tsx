// "Usage statistics: on/off" in the game's menu (or under a profile page), with one sentence on what is counted. The choice
// is kept in this browser (analytics.ts); statistics are only ever sent from ciunkos.com.
import { type ReactElement, useId, useState } from 'react';
import { optedOut, setOptedOut } from './analytics.ts';
import { usageLabel } from './usage-preference.ts';

const CSS = `
.usage { font-family: system-ui, sans-serif; font-size: 0.875rem; }
.usage h3 { margin: 0 0 0.25rem; font-size: 1rem; }
.usage p { margin: 0 0 0.5rem; }
.usage button {
  min-height: 44px;
  font: inherit;
  font-size: 0.9375rem;
  padding: 0.25rem 1rem;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.usage button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
@media (prefers-color-scheme: dark) { .usage button:focus-visible { outline-color: #ffd23f; } }
`;

export function UsageToggle(): ReactElement {
  const headingId = useId();
  const [off, setOff] = useState(optedOut);
  const toggle = () => {
    setOptedOut(!off);
    setOff(!off);
  };
  return (
    <section className="usage" data-testid="usage-statistics" aria-labelledby={headingId}>
      <style>{CSS}</style>
      <h3 id={headingId}>Usage statistics</h3>
      <p>
        Counts visits, installs, new games and solved games (board size, moves, time), skin changes
        and sound switched on or off, never your nickname, board or photo.
      </p>
      <button type="button" data-testid="usage-toggle" aria-pressed={!off} onClick={toggle}>
        {usageLabel(off)}
      </button>
    </section>
  );
}
