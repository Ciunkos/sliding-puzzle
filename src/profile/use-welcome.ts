// Whether to show the first-visit toast: for a profile this device had never opened before the page
// asked for it (a generated first visit, a shared link, a new random profile), until the player
// first taps or presses a key (the first move, say), or for a while at most.
import { type RefObject, useEffect, useMemo, useState } from 'react';
import { nicknameKey } from './index.ts';
import { loadKnownProfile } from './known-profile.ts';

/** How long the toast stays. The notice it carries is in the game's menu for good. */
const WELCOME_MS = 12_000;

const FOCUSABLE = 'button, summary, input, select, textarea, a[href], [tabindex="0"]';

/**
 * Focus inside the toast moves to the first control after it on the page (the game's first), so
 * it never falls to <body> when the toast goes.
 */
function handOffFocus(toast: HTMLElement | null): void {
  if (toast?.contains(document.activeElement) !== true) return;
  const after = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    (element) =>
      (toast.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
      element.checkVisibility(),
  );
  after?.focus();
}

export function useWelcome(
  nickname: string | undefined,
  ready: boolean,
  toast: RefObject<HTMLElement | null>,
): boolean {
  const key = nickname === undefined ? undefined : nicknameKey(nickname);
  // Decided before the profile loads (loading remembers it), and again only for another profile.
  const newHere = useMemo(
    () => nickname !== undefined && loadKnownProfile(nickname) === undefined,
    [key],
  );
  const [expired, setExpired] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!ready || !newHere) return undefined;
    const hide = () => {
      handOffFocus(toast.current);
      setExpired(key);
    };
    // After the key or tap has done its own work (a Tab has moved focus already, say).
    const dismiss = () => {
      setTimeout(hide, 0);
    };
    const timer = setTimeout(hide, WELCOME_MS);
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
