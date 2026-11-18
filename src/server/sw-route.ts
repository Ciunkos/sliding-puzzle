// Which requests the service worker (sw.ts) answers, and how. The service worker is one more
// environment that answers the app's paths, so it reads them with the same `classify`. Its scope has
// no trailing slash, so it also sees paths that only start with the app's name (/sliding-puzzle-x):
// those are outside, and go to the network like the API and the worker script itself.
import { BASE, classify, SERVICE_WORKER_PATH } from './paths.ts';

/**
 * - `page`: a page of the app, network first, else the cached shell (so any profile opens offline);
 * - `hashed`: a built file whose name changes with its content, cache first;
 * - `static`: any other file of the app, network first, else the cache;
 * - `pass`: not the worker's business.
 */
export type SwRoute = 'page' | 'hashed' | 'static' | 'pass';

export interface SwRequest {
  pathname: string;
  method: string;
  navigate: boolean;
  sameOrigin: boolean;
}

function assetRoute(pathname: string, navigate: boolean): SwRoute {
  if (navigate || pathname === SERVICE_WORKER_PATH) return 'pass';
  return pathname.startsWith(`${BASE}/assets/`) ? 'hashed' : 'static';
}

export function swRoute(request: SwRequest): SwRoute {
  if (request.method !== 'GET' || !request.sameOrigin) return 'pass';
  const path = classify(request.pathname);
  if (path.kind === 'shell') return request.navigate ? 'page' : 'static';
  return path.kind === 'asset' ? assetRoute(request.pathname, request.navigate) : 'pass';
}
