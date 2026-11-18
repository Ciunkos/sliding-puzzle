// The plain logic behind useGameSession: optimistic moves through the sync queue (sync.ts), one
// batch on the wire at a time with backoff, the queue kept in storage, the play clock, the best
// results. Everything from the outside world (storage, network state, time, timers) is injected.
import type { GameApi } from './api.ts';
import { type ClockEvent, elapsedMs, newClock, type PlayClock, tick } from './clock.ts';
import type { BestResult, SavedGame } from './index.ts';
import { backoffMs, sendBatch } from './outbox.ts';
import { loadQueue, type QueueStorage, resumeQueue, saveQueue } from './queue-storage.ts';
import { runRequest, type SessionTarget } from './session.ts';
import {
  type MovesRequest,
  optimistic,
  reduce,
  startRound,
  type SyncEvent,
  type SyncState,
} from './sync.ts';

export const NOTICES = {
  'server-newer': 'This game changed somewhere else. Showing the latest.',
  offline: 'You are offline. Your moves will be saved when you are back.',
} as const;

export interface DriverEnvironment {
  storage: QueueStorage;
  isOnline: () => boolean;
  isVisible: () => boolean;
  /** Milliseconds, for the play clock. */
  now: () => number;
  /** Runs `run` after `ms`; returns a function that cancels it. */
  schedule: (run: () => void, ms: number) => () => void;
}

/** What the screen shows. `game` is the optimistic game. */
export interface SessionView<State> {
  game: SavedGame<State> | undefined;
  /** An error, or else the notice. */
  message: string | undefined;
  notice: string | undefined;
  busy: boolean;
  /** Moves not yet acknowledged by the server. */
  syncing: boolean;
  results: readonly BestResult[];
}

export class SessionDriver<State, Move, Options> {
  private readonly api: GameApi<State, Move, Options>;
  private readonly nickname: string;
  private readonly options: Options;
  private readonly env: DriverEnvironment;
  private readonly onChange: (view: SessionView<State>) => void;
  private sync: SyncState<State, Move> | undefined;
  private message: string | undefined;
  /** Busy until the first load has answered. */
  private busy = true;
  private results: readonly BestResult[] = [];
  private clock: PlayClock;
  /** The batches being sent, if any; a new game or a reset waits for them. */
  private flushing: Promise<void> | undefined;
  private retries = 0;
  private cancelRetry: (() => void) | undefined;
  private disposed = false;
  private readonly target: SessionTarget<State>;

  constructor(
    api: GameApi<State, Move, Options>,
    nickname: string,
    options: Options,
    env: DriverEnvironment,
    onChange: (view: SessionView<State>) => void,
  ) {
    this.api = api;
    this.nickname = nickname;
    this.options = options;
    this.env = env;
    this.onChange = onChange;
    this.clock = newClock(env.isVisible());
    this.target = {
      setGame: () => undefined,
      setMessage: (message) => {
        this.message = message;
      },
      setBusy: (busy) => {
        this.busy = busy;
        this.emit();
      },
      inFlight: { current: false },
    };
  }

  view(): SessionView<State> {
    const notice = this.sync?.notice === undefined ? undefined : NOTICES[this.sync.notice];
    return {
      game: this.sync && optimistic(this.api.definition, this.sync),
      message: this.message ?? notice,
      notice,
      busy: this.busy,
      syncing: (this.sync?.pending.length ?? 0) > 0,
      results: this.results,
    };
  }

  /** Resumes the profile's game from the server, restores the stored queue, and sends it. */
  async load(): Promise<void> {
    const { api, nickname, options, env } = this;
    const restore = (game: SavedGame<State>) => {
      this.save(resumeQueue(game, loadQueue(api.definition, nickname, env.storage)));
      this.clock = newClock(env.isVisible());
    };
    await this.runAction(restore, () => api.resume(nickname, options));
    await this.loadResults();
  }

  /** A tap: shown at once when legal, then sent. Never waits for a request. */
  async move(move: Move): Promise<void> {
    const before = this.sync;
    this.apply({ type: 'tap', move });
    if (this.sync === before) return;
    this.tickClock('move');
    if (this.view().game?.finished === true) this.tickClock('finish');
    await this.flush();
  }

  /** Starts a new game (online only). */
  start(): Promise<void> {
    return this.replace(() => this.api.start(this.nickname, this.options));
  }

  /** Resets the game to its start (online only), on the version the server acknowledged last. */
  reset(): Promise<void> {
    return this.replace((game) => this.api.reset(this.nickname, game.version));
  }

  /** The connection is back: send now, without waiting for the backoff. */
  async online(): Promise<void> {
    this.retries = 0;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    await this.flush();
  }

  /** The tab was hidden or shown: hidden time is not play time, and a shown tab sends. */
  async visibility(visible: boolean): Promise<void> {
    this.tickClock(visible ? 'show' : 'hide');
    if (visible) await this.flush();
  }

  elapsedMs(now: number): number {
    return elapsedMs(this.clock, now);
  }

  /** Stops everything: later answers and timers change nothing. */
  dispose(): void {
    this.disposed = true;
    this.cancelRetry?.();
  }

  /**
   * Sends batches until nothing waits, one at a time: while sending, every caller gets the same
   * promise. Nothing is sent while a busy request runs or the device is offline, and after a
   * failure only when the backoff is over.
   */
  flush(): Promise<void> {
    this.flushing ??= this.sendAll().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private async sendAll(): Promise<void> {
    for (let round = this.nextRound(); round !== undefined; round = this.nextRound()) {
      this.save(round.state);
      if (!(await this.send(round.request))) return;
    }
  }

  /** The next round to send, or undefined when there is none or now is not the time. */
  private nextRound() {
    const sync = this.sync;
    if (sync === undefined || this.target.inFlight.current || this.disposed) return undefined;
    if (!this.env.isOnline()) {
      this.markOffline(sync);
      return undefined;
    }
    return startRound(this.api.definition, sync, elapsedMs(this.clock, this.env.now()));
  }

  /** Offline: nothing is sent, and the player is told while moves wait. */
  private markOffline(sync: SyncState<State, Move>): void {
    if (sync.pending.length > 0) this.apply({ type: 'network-failed' });
  }

  /** Sends the batch on the wire; false when it failed (a retry is scheduled) or nothing was sent. */
  private async send(request: MovesRequest<Move>): Promise<boolean> {
    const event = await sendBatch(this.api, this.nickname, request);
    if (this.disposed) return false;
    this.apply(event);
    if (event.type === 'network-failed') {
      this.retryLater();
      return false;
    }
    this.retries = 0;
    if (event.game.finished) await this.loadResults();
    return true;
  }

  private retryLater(): void {
    this.retries += 1;
    this.cancelRetry?.();
    this.cancelRetry = this.env.schedule(() => {
      this.cancelRetry = undefined;
      void this.flush();
    }, backoffMs(this.retries));
  }

  /** A new game or a reset: waits for the batch on the wire, then replaces the game. */
  private async replace(request: (game: SavedGame<State>) => Promise<SavedGame<State>>) {
    const before = this.sync;
    if (before === undefined || this.target.inFlight.current) return;
    const adopt = (game: SavedGame<State>) => {
      this.apply({ type: 'replaced', game });
      this.clock = tick(this.clock, RESTART);
    };
    await this.runAction(adopt, async () => {
      await this.flushing;
      return request((this.sync ?? before).confirmed);
    });
  }

  /** Runs a busy request (load, new game, reset) through runRequest, then sends what waits. */
  private async runAction(
    setGame: (game: SavedGame<State>) => void,
    request: () => Promise<SavedGame<State>>,
  ): Promise<void> {
    await runRequest({ ...this.target, setGame }, () => !this.disposed, request);
    await this.flush();
  }

  private async loadResults(): Promise<void> {
    const results = await this.api.results(this.nickname).catch(() => undefined);
    if (results === undefined || this.disposed) return;
    this.results = results;
    this.emit();
  }

  private apply(event: SyncEvent<State, Move>): void {
    if (this.sync !== undefined) this.save(reduce(this.api.definition, this.sync, event));
  }

  /** Shows `sync` and keeps its queue in storage. */
  private save(sync: SyncState<State, Move>): void {
    this.sync = sync;
    saveQueue(this.api.definition.id, this.nickname, sync, this.env.storage);
    this.emit();
  }

  private tickClock(type: 'move' | 'finish' | 'hide' | 'show'): void {
    this.clock = tick(this.clock, { type, at: this.env.now() });
  }

  private emit(): void {
    if (!this.disposed) this.onChange(this.view());
  }
}

const RESTART: ClockEvent = { type: 'restart' };
