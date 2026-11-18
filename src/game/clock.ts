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
  return { banked: 0, since: undefined, started: false, stopped: false, visible };
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
  switch (event.type) {
    case 'restart':
      return newClock(clock.visible);
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
