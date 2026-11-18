// True once `active` has held for `delayMs` while the browser is online (and from then on). Used to
// fetch the 3D board's chunk only when the flat board has settled and there is a network: a chunk
// requested offline only fills the console with failed requests, and the flat board works anyway.
import { useEffect, useState } from 'react';

export function useQuietOnline(active: boolean, delayMs: number): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active || ready) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (navigator.onLine) setReady(true);
      }, delayMs);
    };
    wait();
    window.addEventListener('online', wait);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', wait);
    };
  }, [active, ready, delayMs]);
  return ready;
}
