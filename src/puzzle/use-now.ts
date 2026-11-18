// The browser's clock for the screen's timer: re-renders once per `everyMs` while `active`.
// Hooks may read the time; the logic they feed (the engine's elapsedMs, formatElapsed) takes it as an argument.
import { useEffect, useState } from 'react';

/** Date.now() at the latest tick; ticking only while `active`, starting at once when it turns on. */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [active, everyMs]);
  return now;
}
