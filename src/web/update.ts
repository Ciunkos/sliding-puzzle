// When to offer a new version of the app, and what the Reload button does. Pure; the browser wiring
// is in use-service-worker.ts. A new version never reloads a game by itself: it is offered, and the
// player chooses when.

export interface UpdateState {
  /**
   * A service worker controls the page: from its load, or since the first install claimed it. Until
   * then, a change of controller is that first install, not an update.
   */
  hadController: boolean;
  /** A new version is installed and waits for the old one to let go. */
  waiting: boolean;
  /** Another version took control of the page after it loaded. */
  controllerChanged: boolean;
  /** The player pressed Reload. */
  requested: boolean;
}

/**
 * - `none`: nothing to show;
 * - `offer`: show "A new version is ready";
 * - `activate`: tell the waiting version to take over (then `controllerChanged` follows);
 * - `reload`: the new version is in control; reload the page into it.
 */
export type UpdateStep = 'none' | 'offer' | 'activate' | 'reload';

export function updateStep(state: UpdateState): UpdateStep {
  if (!state.hadController || !(state.waiting || state.controllerChanged)) return 'none';
  if (!state.requested) return 'offer';
  return state.controllerChanged ? 'reload' : 'activate';
}

/** At most one check for a new version an hour, when the page is shown again. */
const CHECK_EVERY_MS = 3_600_000;

/** Whether a page shown at `now`, which last asked for a new version at `lastCheck`, asks again. */
export function updateCheckDue(lastCheck: number, now: number): boolean {
  return now - lastCheck >= CHECK_EVERY_MS;
}
