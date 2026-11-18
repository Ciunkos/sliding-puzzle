// Usage statistics, the browser wiring: asks the server whether analytics is on, then loads the
// pinned PostHog SDK (posthog-sdk.ts) with its integrity hash, through the same-origin proxy under
// <base>ph. Nothing is fetched or loaded unless analytics-policy.ts allows it on this page. No
// cookies (localStorage persistence), no autocapture, no session recording, no extra scripts.
// Modules do not know about this file: the composition root (main.tsx) sends the events.
import { z } from 'zod';
import type { FeatureEvent } from '../game/client.tsx';
import { analyticsAllowed, scrubEvent } from './analytics-policy.ts';
import { POSTHOG_SDK } from './posthog-sdk.ts';
import { readOptedOut, writeOptedOut } from './usage-preference.ts';

/**
 * An event this app sends: the page's own (`page_view`, `app_installed`) and a game screen's,
 * after the allowlist in feature-events.ts. Never a nickname, a profile path, a photo or a board.
 */
export type AnalyticsEvent = FeatureEvent;

export interface Analytics {
  track: (event: AnalyticsEvent) => void;
}

export const ANALYTICS_OFF: Analytics = { track: () => undefined };

const configSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), token: z.string().min(1) }),
]);

/** The browser's localStorage; reading it may throw (blocked storage), which counts as off. */
function browserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  return globalThis.localStorage;
}

/** True when the player switched usage statistics off in this browser. */
export function optedOut(): boolean {
  try {
    return readOptedOut(browserStorage());
  } catch {
    return true;
  }
}

/** Remembers the player's choice. */
export function setOptedOut(off: boolean): void {
  try {
    writeOptedOut(browserStorage(), off);
  } catch {
    // No storage at all: optedOut() already answers true.
  }
}

function allowedHere(): boolean {
  return analyticsAllowed({
    hostname: location.hostname,
    webdriver: navigator.webdriver,
    doNotTrack: navigator.doNotTrack,
    globalPrivacyControl: Reflect.get(navigator, 'globalPrivacyControl') === true,
    optedOut: optedOut(),
  });
}

/** The SDK's global: a queue (the documented stub) until the script loads, then the SDK itself. */
type PostHogGlobal = unknown[] & {
  __SV?: number;
  _i?: unknown[];
  capture?: (name: string, properties?: Record<string, unknown>) => void;
};

function sdkConfig(base: string): Record<string, unknown> {
  return {
    api_host: `${location.origin}${base}ph`,
    ui_host: 'https://eu.posthog.com',
    persistence: 'localStorage',
    person_profiles: 'identified_only',
    advanced_disable_feature_flags: true,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    respect_dnt: true,
    // The last word on every event: nothing after an opt-out, and no web address with a nickname.
    before_send: (event: unknown) => (optedOut() ? null : scrubEvent(event)),
  };
}

/** Installs the queue, then the pinned SDK, which takes the queue over when it loads. */
function loadSdk(token: string, base: string): void {
  const existing: unknown = Reflect.get(window, 'posthog');
  if (Array.isArray(existing)) return;
  const queue: PostHogGlobal = [];
  queue._i = [[token, sdkConfig(base)]];
  queue.capture = (...args: unknown[]) => queue.push(['capture', ...args]);
  queue.__SV = 1;
  Reflect.set(window, 'posthog', queue);
  const script = document.createElement('script');
  script.src = POSTHOG_SDK.src;
  script.integrity = POSTHOG_SDK.integrity;
  script.crossOrigin = 'anonymous';
  script.async = true;
  document.head.append(script);
}

function capture(event: AnalyticsEvent): void {
  if (optedOut()) return;
  const sdk = Reflect.get(window, 'posthog') as PostHogGlobal | undefined;
  sdk?.capture?.(event.name, { ...event.properties });
}

/**
 * Starts usage statistics when this page may count, and returns how to send an event: a no-op when
 * it may not, when the server has no token, or when anything on the way fails. Never throws.
 */
export async function startAnalytics(base: string): Promise<Analytics> {
  if (!allowedHere()) return ANALYTICS_OFF;
  try {
    const response = await fetch(`${base}analytics-config`, { cache: 'no-store' });
    const config = configSchema.parse(await response.json());
    if (!config.enabled) return ANALYTICS_OFF;
    loadSdk(config.token, base);
    return { track: capture };
  } catch {
    return ANALYTICS_OFF;
  }
}
