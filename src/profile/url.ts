// Where a profile lives in the URL: <base>/p/<nickname>. Pure: the base is passed in by the web
// composition root (Vite's BASE_URL); nothing here reads the browser's location.
import { nicknameSchema } from './index.ts';

export type ProfileLocation =
  { kind: 'home' } | { kind: 'profile'; nickname: string } | { kind: 'invalid'; raw: string };

export type StartDecision =
  { kind: 'play'; nickname: string; path: string } | { kind: 'invalid'; raw: string };

/** The base without a trailing slash, e.g. /sliding-puzzle. */
function root(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function profilePath(nickname: string, base: string): string {
  return `${root(base)}/p/${encodeURIComponent(nickname)}`;
}

/** decodeURIComponent, or undefined for malformed percent-encoding (it throws a URIError). */
function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/** Reads a location's pathname (still percent-encoded). Never throws. */
export function nicknameFromPath(pathname: string, base: string): ProfileLocation {
  const prefix = `${root(base)}/p/`;
  if (!pathname.startsWith(prefix)) return { kind: 'home' };
  const segment = pathname.slice(prefix.length);
  const decoded = decode(segment);
  if (decoded === undefined) return { kind: 'invalid', raw: segment };
  const parsed = nicknameSchema.safeParse(decoded);
  return parsed.success
    ? { kind: 'profile', nickname: parsed.data }
    : { kind: 'invalid', raw: decoded };
}

/**
 * What to play on load: the profile in the URL; at home, the remembered nickname, else the
 * generated candidate. `path` is the URL to show for it (it replaces home in the history).
 */
export function decideStart(input: {
  pathname: string;
  base: string;
  remembered: string | undefined;
  candidate: string;
}): StartDecision {
  const location = nicknameFromPath(input.pathname, input.base);
  if (location.kind === 'invalid') return location;
  const nickname =
    location.kind === 'profile' ? location.nickname : (input.remembered ?? input.candidate);
  return { kind: 'play', nickname, path: profilePath(nickname, input.base) };
}

/**
 * `path` with the query and the hash of `location`: replacing the address's path (a generated
 * profile, the server's casing) keeps whatever else it carries, such as `?fps`.
 */
export function keepQuery(path: string, location: { search: string; hash: string }): string {
  return `${path}${location.search}${location.hash}`;
}
