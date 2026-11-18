// Usage statistics, the browser wiring: asks the server whether analytics is on, then loads the
// pinned PostHog SDK (posthog-sdk.ts) with its integrity hash, through the same-origin proxy under
// <base>ph. Nothing is fetched or loaded unless analytics-policy.ts allows it on this page. No
// cookies (localStorage persistence), no autocapture, no session recording, no extra scripts.
// Modules do not know about this file: the composition root (main.tsx) sends the events.
import { z } from 'zod';
import { analyticsAllowed, scrubEvent } from './analytics-policy.ts';
import { POSTHOG_SDK } from './posthog-sdk.ts';

/** The events this app sends. Never a nickname, a profile path, a photo or a board. */
export type AnalyticsEvent =
  | { name: 'page_view' }
  | { name: 'game_started'; size: number }
  | { name: 'game_solved'; size: number; moves: number; seconds: number }
  | { name: 'skin_changed'; kind: 'numbers' | 'picture' | 'photo' }
  | { name: 'app_installed' };

export interface Analytics {
  track: (event: AnalyticsEvent) => void;
}

const OFF: Analytics = { track: () => undefined };

/** The player's choice in the footer, kept in this browser. */
const OPT_OUT_KEY = 'sliding-puzzle:usage-statistics';
const optOutSchema = z.literal('off');

const configSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({ enabled: z.literal(true), token: z.string().min(1) }),
]);

/** True when the player switched usage statistics off; storage that cannot be read counts as off. */
export function optedOut(): boolean {
  try {
    return optOutSchema.safeParse(globalThis.localStorage.getItem(OPT_OUT_KEY)).success;
  } catch {
    return true;
  }
}

/** Remembers the player's choice. A browser that blocks storage keeps statistics off anyway. */
export function setOptedOut(off: boolean): void {
  try {
    if (off) globalThis.localStorage.setItem(OPT_OUT_KEY, 'off');
    else globalThis.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Nothing to keep it in: optedOut() already answers true.
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
  const { name, ...properties } = event;
  sdk?.capture?.(name, properties);
}

/**
 * Starts usage statistics when this page may count, and returns how to send an event: a no-op when
 * it may not, when the server has no token, or when anything on the way fails. Never throws.
 */
export async function startAnalytics(base: string): Promise<Analytics> {
  if (!allowedHere()) return OFF;
  try {
    const response = await fetch(`${base}analytics-config`, { cache: 'no-store' });
    const config = configSchema.parse(await response.json());
    if (!config.enabled) return OFF;
    loadSdk(config.token, base);
    return { track: capture };
  } catch {
    return OFF;
  }
}
