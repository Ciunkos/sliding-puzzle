// The one place that decides what a URL path under the app's prefix is. Pure: used by the Node
// entry, the Worker entry and the Vite dev server, so every environment answers the same paths.
// The canonical form of every page has no trailing slash.

export const BASE = '/sliding-puzzle';

export type PathKind =
  | { kind: 'redirect'; to: string }
  | { kind: 'api' }
  | { kind: 'shell' }
  | { kind: 'asset' }
  | { kind: 'outside' };

/** A client route the shell answers: /p/<name>. */
const CLIENT_ROUTE = /^\/p\/[^/]+$/;
/** A client route with a trailing slash: /p/<name>/. */
const SLASHED_CLIENT_ROUTE = /^\/p\/[^/]+\/$/;

export function classify(pathname: string): PathKind {
  if (pathname === BASE) return { kind: 'shell' };
  if (!pathname.startsWith(`${BASE}/`)) return { kind: 'outside' };
  const rest = pathname.slice(BASE.length);
  if (rest === '/api' || rest.startsWith('/api/')) return { kind: 'api' };
  if (rest === '/' || SLASHED_CLIENT_ROUTE.test(rest)) {
    return { kind: 'redirect', to: pathname.slice(0, -1) };
  }
  if (CLIENT_ROUTE.test(rest)) return { kind: 'shell' };
  return { kind: 'asset' };
}
