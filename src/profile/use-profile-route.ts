// The profile in the address bar: decided on load (see url.ts), kept in step with Back/Forward,
// and changed with pushState (switching) or replaceState (home, canonical casing, leaving an
// invalid URL). The only file that touches window.history and window.location.
import { useEffect, useState } from 'react';
import { generateNickname } from './generate.ts';
import { loadLastNickname } from './last-profile.ts';
import { decideStart, profilePath, type StartDecision } from './url.ts';

export interface ProfileRoute {
  route: StartDecision;
  /** Goes to `nickname`'s URL as a new history entry. */
  open: (nickname: string) => void;
  /** Goes to a new generated nickname; `replace` drops the current entry (an unusable URL). */
  openRandom: (mode: 'push' | 'replace') => void;
  /** Shows the server's casing of the profile on screen, in place of the current entry. */
  canonicalise: (nickname: string) => void;
}

function decideHere(base: string, random: () => number): StartDecision {
  return decideStart({
    pathname: window.location.pathname,
    base,
    remembered: loadLastNickname(),
    candidate: generateNickname(random),
  });
}

export function useProfileRoute(base: string, random: () => number): ProfileRoute {
  const [route, setRoute] = useState(() => decideHere(base, random));

  useEffect(() => {
    if (route.kind === 'play' && route.path !== window.location.pathname) {
      window.history.replaceState(null, '', route.path);
    }
  }, [route]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(decideHere(base, random));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [base, random]);

  function go(nickname: string, mode: 'push' | 'replace'): void {
    const path = profilePath(nickname, base);
    if (mode === 'push') window.history.pushState(null, '', path);
    else window.history.replaceState(null, '', path);
    setRoute({ kind: 'play', nickname, path });
  }

  return {
    route,
    open: (nickname) => {
      go(nickname, 'push');
    },
    openRandom: (mode) => {
      go(generateNickname(random), mode);
    },
    canonicalise: (nickname) => {
      go(nickname, 'replace');
    },
  };
}
