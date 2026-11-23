// Whether to say "Saving…": only once saving has lasted SAVING_SHOWN_AFTER_MS, so a move that is
// saved at once never makes the hint blink. The decision is showSaving() in view-model.ts.
import { useEffect, useState } from 'react';
import { SAVING_SHOWN_AFTER_MS, showSaving } from './view-model.ts';

export function useSavingHint(syncing: boolean): boolean {
  // When saving began (undefined: it is not saving) and the time last looked at.
  const [clock, setClock] = useState<{ since: number | undefined; now: number }>(() => ({
    since: undefined,
    now: Date.now(),
  }));
  if (syncing !== (clock.since !== undefined)) {
    // Set while rendering: React renders again at once, so the hint costs no commit of its own.
    const at = Date.now();
    setClock({ since: syncing ? at : undefined, now: at });
  }
  useEffect(() => {
    if (!syncing) return undefined;
    const timer = setTimeout(() => {
      setClock((was) => ({ since: was.since, now: Date.now() }));
    }, SAVING_SHOWN_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [syncing]);
  return showSaving(clock.since, clock.now);
}
