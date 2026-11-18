// "Usage statistics: on/off" in the page footer, with one sentence on what is counted. The choice
// is kept in this browser (analytics.ts); statistics are only ever sent from ciunkos.com.
import { type ReactElement, useState } from 'react';
import { optedOut, setOptedOut } from './analytics.ts';

const CSS = `
.usage { font-family: system-ui, sans-serif; max-width: 28rem; margin: 0 auto 2rem; font-size: 0.875rem; }
.usage p { margin: 0.25rem 0; }
.usage button {
  min-height: 44px;
  font: inherit;
  padding: 0.25rem 0.75rem;
  border: 1px solid currentColor;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.usage button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
@media (prefers-color-scheme: dark) { .usage button:focus-visible { outline-color: #8ab4ff; } }
`;

export function UsageToggle(): ReactElement {
  const [off, setOff] = useState(optedOut);
  const toggle = () => {
    setOptedOut(!off);
    setOff(!off);
  };
  return (
    <footer className="usage" data-testid="usage-statistics">
      <style>{CSS}</style>
      <p>
        Counts visits, games started and solved, and skin changes, never your nickname, board or
        photo.
      </p>
      <button type="button" data-testid="usage-toggle" onClick={toggle}>
        Usage statistics: {off ? 'off' : 'on'}
      </button>
    </footer>
  );
}
