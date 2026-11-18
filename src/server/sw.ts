// The service worker: the app opens and plays offline. It lives next to paths.ts because it is one
// more environment answering the app's paths (sw-route.ts); it is browser code all the same, and it
// imports nothing but those two pure files. vite.config.ts builds it as /sliding-puzzle/sw.js and
// writes the build's shell files into PRECACHE and VERSION. src/web/use-service-worker.ts registers
// it in production builds only. It never answers the API: the game keeps its own offline queue.
//
// - install: precache the shell (the page and the files it loads at once), not the lazy chunks;
// - pages: network first, else the cached shell, so a profile never opened before opens offline;
// - hashed files (/assets/): cache first; lazy chunks are cached the first time they load;
// - other files of the app (icons, manifest): network first, else the cache;
// - a new version waits until the player presses Reload (src/web/update.ts), then takes over.
import { BASE } from './paths.ts';
import { swRoute } from './sw-route.ts';

/** Replaced at build time: the shell's URLs, separated by spaces. */
const PRECACHE = '__SW_PRECACHE__'.split(' ');
/** Replaced at build time: a hash of the shell, so every build has its own caches. */
const VERSION = '__SW_VERSION__';
const SHELL_URL = BASE;
const CACHE_PREFIX = 'sliding-puzzle-';
const SHELL_CACHE = `${CACHE_PREFIX}${VERSION}-shell`;
const LAZY_CACHE = `${CACHE_PREFIX}${VERSION}-lazy`;

// The service worker globals, as far as this file uses them (the project's lib is the DOM's).
interface WorkerEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface WorkerFetchEvent extends WorkerEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerMessageEvent extends WorkerEvent {
  readonly data: unknown;
}
interface WorkerScope {
  addEventListener(type: 'install' | 'activate', listener: (event: WorkerEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: WorkerFetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  readonly location: Location;
}
const worker = self as unknown as WorkerScope;

async function cached(request: Request | string): Promise<Response | undefined> {
  const shell = await caches.open(SHELL_CACHE);
  const lazy = await caches.open(LAZY_CACHE);
  return (await shell.match(request)) ?? (await lazy.match(request));
}

/** Keeps a successful answer for offline use, without making the page wait for it. */
function keep(event: WorkerFetchEvent, response: Response): Response {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    event.waitUntil(caches.open(LAZY_CACHE).then((cache) => cache.put(event.request, copy)));
  }
  return response;
}

async function networkFirst(
  event: WorkerFetchEvent,
  fallback: string | Request,
): Promise<Response> {
  try {
    return await fetch(event.request);
  } catch {
    return (await cached(fallback)) ?? Response.error();
  }
}

async function cacheFirst(event: WorkerFetchEvent): Promise<Response> {
  return (await cached(event.request)) ?? keep(event, await fetch(event.request));
}

async function networkFirstKept(event: WorkerFetchEvent): Promise<Response> {
  try {
    return keep(event, await fetch(event.request));
  } catch {
    return (await cached(event.request)) ?? Response.error();
  }
}

worker.addEventListener('install', (event) => {
  // `reload` skips the HTTP cache, so the shell is this version's.
  const requests = PRECACHE.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(requests)));
});

worker.addEventListener('activate', (event) => {
  const own = [SHELL_CACHE, LAZY_CACHE];
  const removeOld = caches.keys().then((names) => {
    const old = names.filter((name) => name.startsWith(CACHE_PREFIX) && !own.includes(name));
    return Promise.all(old.map((name) => caches.delete(name)));
  });
  event.waitUntil(removeOld.then(() => worker.clients.claim()));
});

worker.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const route = swRoute({
    pathname: url.pathname,
    method: request.method,
    navigate: request.mode === 'navigate',
    sameOrigin: url.origin === worker.location.origin,
  });
  if (route === 'pass') return;
  if (route === 'page') event.respondWith(networkFirst(event, SHELL_URL));
  else if (route === 'hashed') event.respondWith(cacheFirst(event));
  else event.respondWith(networkFirstKept(event));
});
