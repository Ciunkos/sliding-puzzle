// Usage statistics, the pure decisions: whether this page may count at all, and what an event may
// carry. The nickname is part of the profile URL (/sliding-puzzle/p/<nickname>), so every web
// address leaves here as the app path only, and addresses of other sites as their origin only.

/** The one host that is counted: the real site. Never www, a preview host or localhost. */
const COUNTED_HOST = 'ciunkos.com';
const APP_PATH = '/sliding-puzzle';

/** What the browser says about this page and this player. */
export interface Surroundings {
  hostname: string;
  /** `navigator.webdriver`: the page is driven by automation (tests, crawlers). */
  webdriver: boolean;
  /** `navigator.doNotTrack`: '1' (or 'yes' in old browsers) when the player asks not to be tracked. */
  doNotTrack: string | null | undefined;
  /** `navigator.globalPrivacyControl`. */
  globalPrivacyControl: boolean;
  /** The player switched usage statistics off on this page. */
  optedOut: boolean;
}

export function analyticsAllowed(here: Surroundings): boolean {
  const doNotTrack = here.doNotTrack === '1' || here.doNotTrack === 'yes';
  const declined = doNotTrack || here.globalPrivacyControl || here.optedOut;
  return here.hostname === COUNTED_HOST && !here.webdriver && !declined;
}

const isAppPath = (path: string) => path === APP_PATH || path.startsWith(`${APP_PATH}/`);

/**
 * A web address without anything that names a player: an address of this app becomes its origin
 * and the app path, one of another site its origin, and an app path alone the app path. Any other
 * value is left as it is.
 */
export function scrubUrl(value: string): string {
  if (isAppPath(value)) return APP_PATH;
  if (!URL.canParse(value)) return value;
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return value;
  return isAppPath(url.pathname) ? `${url.origin}${APP_PATH}` : url.origin;
}

/**
 * A plain object only. The SDK's event also holds a Date (its timestamp); treating that as a record
 * would rebuild it as `{}`, and PostHog refuses an event without a readable time.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** Every string scrubbed, one level of nested objects too ($set, $set_once). */
function scrubValues(record: Record<string, unknown>, depth: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (typeof value === 'string') return [key, scrubUrl(value)];
      if (isRecord(value) && depth > 0) return [key, scrubValues(value, depth - 1)];
      return [key, value];
    }),
  );
}

/** An event as the analytics SDK is about to send it, with every web address scrubbed. */
export function scrubEvent(event: unknown): unknown {
  return isRecord(event) ? scrubValues(event, 2) : event;
}

/** This app's name on every event: the analytics project is shared with other sites. */
const APP_NAME = 'sliding-puzzle';

/** An event as the SDK is about to send it, with `app` among its properties. */
export function tagApp(event: unknown): unknown {
  if (!isRecord(event)) return event;
  const properties = isRecord(event.properties) ? event.properties : {};
  return { ...event, properties: { ...properties, app: APP_NAME } };
}
