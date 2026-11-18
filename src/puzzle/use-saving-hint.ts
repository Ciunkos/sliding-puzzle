// Whether to say "Saving…": only once saving has lasted SAVING_SHOWN_AFTER_MS, so a move that is
// saved at once never makes the hint blink. The decision is showSaving() in view-model.ts.
import { useEffect, useState } from 'react';
import { SAVING_SHOWN_AFTER_MS, showSaving } from './view-model.ts';

export function useSavingHint(syncing: boolean): boolean {
  const [since, setSince] = useState<number | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!syncing) {
      setSince(undefined);
      return undefined;
    }
    const start = Date.now();
    setSince(start);
    setNow(start);
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, SAVING_SHOWN_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [syncing]);
  return showSaving(since, now);
}
