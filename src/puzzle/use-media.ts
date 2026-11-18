// Whether a media query matches now, following changes (dark mode, reduced motion, pointer type).
import { useCallback, useSyncExternalStore } from 'react';

function queryOf(query: string): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(query) : undefined;
}

export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = queryOf(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => queryOf(query)?.matches ?? false,
    () => false,
  );
}
