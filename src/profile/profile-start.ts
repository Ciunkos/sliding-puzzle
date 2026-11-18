// How a profile opens: from the server when it can be reached, else from what this device
// remembers of it. Pure; use-profile.ts reads the network state and storage and acts on it.
import type { KnownProfile } from './known-profile.ts';

/**
 * - `online`: the browser thinks it is online and nothing failed yet;
 * - `offline`: the browser knows it is offline, so no request is made at all;
 * - `unreachable`: a request was made and did not reach the server.
 */
export type Reach = 'online' | 'offline' | 'unreachable';

export type ProfileStart =
  | { kind: 'ask-server' }
  | { kind: 'remembered'; profile: KnownProfile }
  /** Never opened on this device: it cannot open offline. `other` is a profile that can. */
  | { kind: 'unavailable-offline'; other: KnownProfile | undefined };

export function decideProfileStart(input: {
  reach: Reach;
  /** This nickname's profile as this device remembers it. */
  known: KnownProfile | undefined;
  /** The last profile played on this device, as it remembers it. */
  last: KnownProfile | undefined;
}): ProfileStart {
  if (input.reach === 'online') return { kind: 'ask-server' };
  if (input.known !== undefined) return { kind: 'remembered', profile: input.known };
  return { kind: 'unavailable-offline', other: input.last };
}
