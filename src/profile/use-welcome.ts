// Whether to show the first-visit toast: for a profile this device had never opened before the page
// asked for it (a generated first visit, a shared link, a new random profile), until the player
// first taps or presses a key (the first move, say), or for a while at most.
import { useEffect, useMemo, useState } from 'react';
import { nicknameKey } from './index.ts';
import { loadKnownProfile } from './known-profile.ts';

/** How long the toast stays. The notice it carries is in the game's menu for good. */
const WELCOME_MS = 12_000;

export function useWelcome(nickname: string | undefined, ready: boolean): boolean {
  const key = nickname === undefined ? undefined : nicknameKey(nickname);
  // Decided before the profile loads (loading remembers it), and again only for another profile.
  const newHere = useMemo(
    () => nickname !== undefined && loadKnownProfile(nickname) === undefined,
    [key],
  );
  const [expired, setExpired] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!ready || !newHere) return undefined;
    const dismiss = () => {
      setExpired(key);
    };
    const timer = setTimeout(dismiss, WELCOME_MS);
    window.addEventListener('pointerdown', dismiss, { capture: true });
    window.addEventListener('keydown', dismiss, { capture: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', dismiss, { capture: true });
      window.removeEventListener('keydown', dismiss, { capture: true });
    };
  }, [ready, newHere, key]);
  return ready && newHere && expired !== key;
}
