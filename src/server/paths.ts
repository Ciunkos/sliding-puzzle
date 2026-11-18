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

/** The part after the base path, which starts with a slash. */
function classifyRest(rest: string, pathname: string): PathKind {
  if (rest === '/api' || rest.startsWith('/api/')) return { kind: 'api' };
  // A profile path without a name is not a page: send it home instead of a bare 404.
  if (rest === '/p' || rest === '/p/') return { kind: 'redirect', to: BASE };
  if (rest === '/' || SLASHED_CLIENT_ROUTE.test(rest)) {
    return { kind: 'redirect', to: pathname.slice(0, -1) };
  }
  return CLIENT_ROUTE.test(rest) ? { kind: 'shell' } : { kind: 'asset' };
}

export function classify(pathname: string): PathKind {
  if (pathname === BASE) return { kind: 'shell' };
  if (!pathname.startsWith(`${BASE}/`)) return { kind: 'outside' };
  return classifyRest(pathname.slice(BASE.length), pathname);
}

/** The service worker script. Its scope is BASE, without a trailing slash, which is above it. */
export const SERVICE_WORKER_PATH = `${BASE}/sw.js`;

/** Built files whose names carry a hash of their content, so they never change. */
export const HASHED_ASSETS = `${BASE}/assets/`;

/**
 * Headers the app's files carry in every environment: the Node entry sets them, and the build writes
 * them into dist/web/_headers for Cloudflare. Hashed files may be kept for a year. The service
 * worker may control BASE itself only with Service-Worker-Allowed, and is never cached, so an update
 * is seen at once.
 */
export function pathHeaders(pathname: string): Record<string, string> {
  if (pathname.startsWith(HASHED_ASSETS)) {
    return { 'Cache-Control': 'public, max-age=31536000, immutable' };
  }
  if (pathname !== SERVICE_WORKER_PATH) return {};
  return { 'Cache-Control': 'no-store', 'Service-Worker-Allowed': BASE };
}
