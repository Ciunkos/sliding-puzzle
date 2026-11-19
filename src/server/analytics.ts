// Usage statistics, server side: the config the page reads, and a same-origin proxy to PostHog, so
// the page never talks to a third party. Runtime-agnostic (no node: imports): node.ts and worker.ts
// both answer `analytics-config` and `ph/*` through `analyticsResponse`, so they answer the same.
// The project token is a Worker secret; without it analytics is off and the proxy forwards nothing.
// No rate limit binding and no paid service: the body cap and the path allowlist are the limits.
import { z } from 'zod';
import type { PathKind } from './paths.ts';

/** PostHog's EU ingest host, used unless POSTHOG_HOST names another one. */
export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
/** The largest event body forwarded, in bytes. */
export const MAX_EVENT_BYTES = 65_536;
/** The ingest paths the PostHog SDK posts to. Besides the SDK's settings request, nothing else under ph/ is found. */
const INGEST_PATH = /^\/(e|i\/v0(?:\/e)?|batch|capture)\/?$/;
const hostSchema = z.string().regex(/^https:\/\/[a-z0-9.-]+$/);
const NO_STORE = { 'Cache-Control': 'no-store' };

export type AnalyticsPath = Extract<PathKind, { kind: 'analytics-config' | 'analytics-proxy' }>;

export interface AnalyticsSettings {
  /** The PostHog project token, or undefined for analytics off. */
  token: string | undefined;
  /** The PostHog ingest host; DEFAULT_POSTHOG_HOST when undefined or not an https origin. */
  host: string | undefined;
  /** The outside world: the global fetch in production. */
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}

/** `{ enabled: false }` without a token, else the token the SDK needs. Never cached. */
export function analyticsConfig(token: string | undefined): Response {
  const body = token === undefined || token === '' ? { enabled: false } : { enabled: true, token };
  return Response.json(body, { headers: NO_STORE });
}

const status = (code: number) => new Response(null, { status: code, headers: NO_STORE });

/** The request body, or undefined once it grows past `max` bytes (a declared length is not trusted). */
async function boundedBody(
  request: Request,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Why a proxy request is refused before its body is read, or undefined when it may go on. */
function refusal(request: Request, rest: string, token: string | undefined): number | undefined {
  if (token === undefined || token === '') return 404;
  if (request.method !== 'POST' || !INGEST_PATH.test(rest)) return 404;
  if (request.headers.get('Origin') !== new URL(request.url).origin) return 403;
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_EVENT_BYTES) return 413;
  return undefined;
}

/** How a forwarded answer is shaped: the query passed on, and the content type answered with. */
interface Forwarding {
  /** The client's query string; '' to send none. */
  search: string;
  /** The content type to answer with; undefined to pass PostHog's on. */
  answerType: string | undefined;
}

/** Asks PostHog, and answers with its status, content type and body only. 502 when it cannot. */
async function forward(
  rest: string,
  settings: AnalyticsSettings,
  init: RequestInit,
  shape: Forwarding,
): Promise<Response> {
  const parsed = hostSchema.safeParse(settings.host);
  const host = parsed.success ? parsed.data : DEFAULT_POSTHOG_HOST;
  try {
    const upstream = await settings.fetch(`${host}${rest}${shape.search}`, init);
    const headers = new Headers(NO_STORE);
    headers.set('X-Content-Type-Options', 'nosniff');
    const answerType = shape.answerType ?? upstream.headers.get('Content-Type');
    if (answerType !== null) headers.set('Content-Type', answerType);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return status(502);
  }
}

/**
 * The SDK reads its project settings once per page, with a GET of `/array/<token>/config` (the
 * pinned SDK builds that path from its token): JSON, for this project's token only. Its query is
 * at most a cache-busting timestamp, which a no-store answer does not need, so none is passed on;
 * the answer is always JSON, never sniffed. Script code (`config.js`) is never fetched from
 * PostHog; the SDK itself is a pinned copy.
 */
function isSettingsRequest(request: Request, rest: string, token: string | undefined): boolean {
  if (token === undefined || token === '') return false;
  return request.method === 'GET' && rest === `/array/${token}/config`;
}

/**
 * Forwards one event batch: the body and its content type only. Cookies, the client's address and
 * every other header stay here; the answer comes back with its status and content type only.
 */
async function proxy(request: Request, rest: string, settings: AnalyticsSettings) {
  if (isSettingsRequest(request, rest, settings.token)) {
    return forward(
      rest,
      settings,
      { method: 'GET' },
      { search: '', answerType: 'application/json' },
    );
  }
  const refused = refusal(request, rest, settings.token);
  if (refused !== undefined) return status(refused);
  const body = await boundedBody(request, MAX_EVENT_BYTES);
  if (body === undefined) return status(413);
  const contentType = request.headers.get('Content-Type') ?? 'application/json';
  const search = new URL(request.url).search;
  return forward(
    rest,
    settings,
    { method: 'POST', body, headers: { 'Content-Type': contentType } },
    { search, answerType: undefined },
  );
}

export function analyticsResponse(
  request: Request,
  path: AnalyticsPath,
  settings: AnalyticsSettings,
): Promise<Response> {
  if (path.kind === 'analytics-proxy') return proxy(request, path.rest, settings);
  if (request.method !== 'GET' && request.method !== 'HEAD') return Promise.resolve(status(405));
  return Promise.resolve(analyticsConfig(settings.token));
}
