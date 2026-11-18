// Active play time: from the first move to the finishing move, counting only while the tab is
// visible. Pure: timestamps (milliseconds) come in with every event; the screen does the ticking.

export interface PlayClock {
  /** Time already played in closed visible stretches. */
  banked: number;
  /** When the current visible stretch began; undefined while not counting. */
  since: number | undefined;
  started: boolean;
  stopped: boolean;
  visible: boolean;
  /** When the last timed event happened: what is known to have been played by a reload. */
  lastAt: number;
}

export type ClockEvent =
  | { type: 'move'; at: number }
  | { type: 'finish'; at: number }
  | { type: 'hide'; at: number }
  | { type: 'show'; at: number }
  /** A new game or a reset: nothing played yet. */
  | { type: 'restart' };

/** A clock that has not started, on a tab that is `visible` or not. */
export function newClock(visible: boolean): PlayClock {
  return { banked: 0, since: undefined, started: false, stopped: false, visible, lastAt: 0 };
}

/** The clock with its open stretch, if any, closed at `at`. */
function bank(clock: PlayClock, at: number): PlayClock {
  if (clock.since === undefined) return clock;
  return { ...clock, banked: clock.banked + Math.max(0, at - clock.since), since: undefined };
}

function moved(clock: PlayClock, at: number): PlayClock {
  if (clock.started) return clock;
  return { ...clock, started: true, since: clock.visible ? at : undefined };
}

function shown(clock: PlayClock, at: number): PlayClock {
  const counting = clock.started && !clock.stopped && clock.since === undefined;
  return { ...clock, visible: true, since: counting ? at : clock.since };
}

export function tick(clock: PlayClock, event: ClockEvent): PlayClock {
  if (event.type === 'restart') return newClock(clock.visible);
  return { ...timed(clock, event), lastAt: event.at };
}

function timed(clock: PlayClock, event: Exclude<ClockEvent, { type: 'restart' }>): PlayClock {
  switch (event.type) {
    case 'move':
      return moved(clock, event.at);
    case 'finish':
      return { ...bank(clock, event.at), started: true, stopped: true };
    case 'hide':
      return { ...bank(clock, event.at), visible: false };
    case 'show':
      return shown(clock, event.at);
  }
}

/** Milliseconds played by `now`. */
export function elapsedMs(clock: PlayClock, now: number): number {
  return bank(clock, now).banked;
}

/**
 * The clock of a page that was reloaded at `now`: what was played up to its last event is kept
 * (the time between that event and the reload is unknown, so it is not counted), and an unfinished
 * game counts again from the reload if the tab is visible.
 */
export function reloadedClock(clock: PlayClock, now: number, visible: boolean): PlayClock {
  const closed = bank(clock, clock.lastAt);
  const counting = closed.started && !closed.stopped && visible;
  return { ...closed, visible, since: counting ? now : undefined, lastAt: now };
}

/** A play clock and the game it measures, named by the moment the server started that game. */
export interface GameClock {
  startedAt: string;
  clock: PlayClock;
}

/**
 * The clock once the server's `game` is adopted at `now` (loaded, rejected, replaced): another
 * game gets a new clock, a finished game stops it, and an unfinished one counts on (after a
 * rejected finish, again from `now`).
 */
export function adoptClock(
  current: GameClock | undefined,
  game: { startedAt: string; finished: boolean },
  now: number,
  visible: boolean,
): GameClock {
  if (current?.startedAt !== game.startedAt) {
    return { startedAt: game.startedAt, clock: newClock(visible) };
  }
  const { clock } = current;
  if (game.finished)
    return { startedAt: game.startedAt, clock: tick(clock, { type: 'finish', at: now }) };
  if (!clock.stopped) return current;
  const resumed = { ...clock, stopped: false, since: clock.visible ? now : undefined, lastAt: now };
  return { startedAt: game.startedAt, clock: resumed };
}
