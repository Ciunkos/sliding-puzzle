// The plain logic behind useGameSession: optimistic moves through the sync queue (sync.ts), one
// batch on the wire at a time with backoff, the queue and the play clock kept in storage, the best
// results. Everything from the outside world (storage, network state, time, timers) is injected.
//
// The session is `connected` once its queue was reconciled with the server's game. Until then (a
// load that could not reach the server) it shows the stored queue, or else the last game the
// server confirmed, takes taps, sends nothing, and tries the load again with backoff, on `online`
// and when the tab is shown.
import { type GameApi, GameApiError, StaleGameError } from './api.ts';
import { adoptClock, elapsedMs, type GameClock, newClock, reloadedClock, tick } from './clock.ts';
import type { BestResult, SavedGame } from './index.ts';
import { backoffMs, type SendOutcome, sendBatch } from './outbox.ts';
import {
  forgetQueues,
  loadClock,
  loadQueues,
  offlineConfirmed,
  offlineQueue,
  type QueueStorage,
  resumeQueues,
  saveClock,
  saveConfirmed,
  saveQueue,
} from './queue-storage.ts';
import { COULD_NOT_SAVE, errorMessage, NOTICES, settle } from './session.ts';
import {
  type MovesRequest,
  optimistic,
  reduce,
  startRound,
  type SyncEvent,
  type SyncState,
} from './sync.ts';

export { NOTICES };

/** The answer to a request a browser that knows it is offline does not make. */
const UNREACHABLE = {
  ok: false,
  error: new GameApiError('Could not reach the server', 0),
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
  /** The storage record of this tab's queue, if it has one. */
  private ownKey: string | undefined;
  private connected = false;
  private loading = false;
  /** A new game or a reset is running. */
  private acting = false;
  private message: string | undefined;
  /** Busy until the first load has answered. */
  private busy = true;
  private results: readonly BestResult[] = [];
  private clock: GameClock | undefined;
  /** The batches being sent, if any; a new game or a reset waits for them. */
  private flushing: Promise<void> | undefined;
  private retries = 0;
  private cancelRetry: (() => void) | undefined;
  private disposed = false;

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

  /**
   * Resumes the profile's game from the server and reconciles the stored queues with it, then
   * sends what waits. When the server cannot be reached, shows the stored queue and tries again.
   */
  async load(): Promise<void> {
    if (this.loading || this.disposed) return;
    this.loading = true;
    // A browser that knows it is offline is not asked to fail a request (and log it).
    const answer = this.env.isOnline()
      ? await settle(this.api.resume(this.nickname, this.options))
      : UNREACHABLE;
    this.loading = false;
    if (!this.live) return;
    if (!answer.ok) {
      this.loadFailed(answer.error);
      return;
    }
    this.connect(answer.value);
    await this.loadResults();
    await this.flush();
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

  /**
   * Resets the game to its start (online only). A finished game is not reset: a known solution
   * must not be replayed for a better result; the player starts a new game instead.
   */
  async reset(): Promise<void> {
    if (this.sync === undefined || this.view().game?.finished === true) return;
    await this.replace(() => this.resetOnServer());
  }

  /** The connection is back: load or send now, without waiting for the backoff. */
  async online(): Promise<void> {
    this.retries = 0;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    await this.reconnect();
  }

  /** The tab was hidden or shown: hidden time is not play time, and a shown tab sends. */
  async visibility(visible: boolean): Promise<void> {
    this.tickClock(visible ? 'show' : 'hide');
    if (visible) await this.reconnect();
  }

  elapsedMs(now: number): number {
    return this.clock === undefined ? 0 : elapsedMs(this.clock.clock, now);
  }

  /** Stops everything: later answers and timers change nothing. */
  dispose(): void {
    this.disposed = true;
    this.cancelRetry?.();
  }

  /**
   * Sends batches until nothing waits, one at a time: while sending, every caller gets the same
   * promise. Nothing is sent before the queue was reconciled with the server, while a new game or
   * a reset runs, or while the device is offline; after a failure, only when the backoff is over.
   */
  flush(): Promise<void> {
    this.flushing ??= this.sendAll().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private reconnect(): Promise<void> {
    return this.connected ? this.flush() : this.load();
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
    if (sync === undefined || !this.connected || this.acting || this.disposed) return undefined;
    if (!this.env.isOnline()) {
      if (sync.pending.length > 0) this.apply({ type: 'network-failed' });
      return undefined;
    }
    return startRound(this.api.definition, sync, this.elapsedMs(this.env.now()));
  }

  /** Sends the batch on the wire; false when it failed (a retry is scheduled). */
  private async send(request: MovesRequest<Move>): Promise<boolean> {
    const outcome = await sendBatch(this.api, this.nickname, request);
    if (!this.live) return false;
    this.settleOutcome(outcome);
    if (outcome.type === 'network-failed') {
      this.retryLater();
      return false;
    }
    this.retries = 0;
    if (outcome.type === 'refused') await this.reloadAfterRefusal();
    else if (outcome.game.finished) await this.loadResults();
    return true;
  }

  /** What a send's answer does to the queue and the clock. */
  private settleOutcome(outcome: SendOutcome<State, Move>): void {
    if (outcome.type === 'refused') {
      this.forgetQueue();
      return;
    }
    this.apply(outcome);
    if (outcome.type === 'rejected') this.adoptClockOf(outcome.game);
  }

  /** The server can never accept the queue: it is dropped, and the server's game is shown. */
  private async reloadAfterRefusal(): Promise<void> {
    const answer = await settle(this.api.resume(this.nickname, this.options));
    if (!this.live) return;
    if (answer.ok) this.connect(answer.value);
    else this.loadFailed(answer.error);
    this.message = COULD_NOT_SAVE;
    this.emit();
  }

  private retryLater(): void {
    this.retries += 1;
    this.cancelRetry?.();
    this.cancelRetry = this.env.schedule(() => {
      this.cancelRetry = undefined;
      void this.reconnect();
    }, backoffMs(this.retries));
  }

  /** The server's game is in: the stored queues are reconciled with it and become this tab's. */
  private connect(game: SavedGame<State>): void {
    const { definition } = this.api;
    const records = loadQueues(definition, this.nickname, this.env.storage);
    forgetQueues(this.env.storage, records);
    this.ownKey = undefined;
    this.connected = true;
    this.retries = 0;
    this.message = undefined;
    this.busy = false;
    this.clock ??= this.storedClock();
    this.adoptClockOf(game);
    this.save(resumeQueues(definition, game, records));
  }

  /** The load could not reach the server: show what is stored, and try again later. */
  private loadFailed(failure: unknown): void {
    if (this.sync === undefined) this.showStored(failure);
    this.busy = false;
    this.emit();
    this.retryLater();
  }

  /**
   * The stored queue, else the last confirmed game, shown until the server answers; without
   * either, why there is no game.
   */
  private showStored(failure: unknown): void {
    const { definition } = this.api;
    const shown =
      offlineQueue(definition, this.loadRecords()) ??
      offlineConfirmed(definition, this.nickname, this.env.storage);
    if (shown === undefined) {
      this.message = errorMessage(failure);
      return;
    }
    forgetQueues(this.env.storage, shown.merged);
    this.clock = this.storedClock();
    this.adoptClockOf(shown.state.confirmed);
    this.save(shown.state);
  }

  private loadRecords() {
    return loadQueues(this.api.definition, this.nickname, this.env.storage);
  }

  /** The play clock kept in storage, as it is after a reload now. */
  private storedClock(): GameClock | undefined {
    const stored = loadClock(this.api.definition.id, this.nickname, this.env.storage);
    if (stored === undefined) return undefined;
    const clock = reloadedClock(stored.clock, this.env.now(), this.env.isVisible());
    return { startedAt: stored.startedAt, clock };
  }

  /**
   * A new game or a reset: waits for the batch on the wire, gives a batch whose answer was lost
   * one more try, then replaces the game.
   */
  private async replace(request: () => Promise<SavedGame<State>>): Promise<void> {
    if (this.acting) return;
    this.acting = true;
    this.busy = true;
    this.message = undefined;
    this.emit();
    const answer = await settle(this.afterTheWire(request));
    this.acting = false;
    this.busy = false;
    if (!this.live) return;
    if (answer.ok) this.replaced(answer.value);
    else this.replaceFailed(answer.error);
    this.emit();
    await this.flush();
  }

  private async afterTheWire(request: () => Promise<SavedGame<State>>) {
    await this.flushing;
    const elapsed = this.elapsedMs(this.env.now());
    const round = this.sync?.inFlight && startRound(this.api.definition, this.sync, elapsed);
    if (round) this.settleOutcome(await sendBatch(this.api, this.nickname, round.request));
    return request();
  }

  /** The reset, on the version the server acknowledged; once more on its version if that moved on. */
  private async resetOnServer(): Promise<SavedGame<State>> {
    const version = this.sync?.confirmed.version ?? 0;
    const first = await settle(this.api.reset(this.nickname, version));
    if (first.ok) return first.value;
    const { error } = first;
    const moved = error instanceof StaleGameError && error.message === 'stale';
    if (!moved || error.game.finished) throw error;
    return this.api.reset(this.nickname, error.game.version);
  }

  private replaced(game: SavedGame<State>): void {
    this.connected = true;
    this.setClock({ startedAt: game.startedAt, clock: newClock(this.env.isVisible()) });
    this.save({ confirmed: game, pending: [] });
  }

  private replaceFailed(failure: unknown): void {
    if (!(failure instanceof StaleGameError)) {
      this.message = errorMessage(failure);
      return;
    }
    // The API client parsed this game with the same definition's state schema.
    const game = failure.game as SavedGame<State>;
    this.apply({ type: 'rejected', game });
    this.adoptClockOf(game);
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

  /** The queue is dropped: nothing is pending any more, and its record is forgotten. */
  private forgetQueue(): void {
    if (this.sync !== undefined) this.save({ confirmed: this.sync.confirmed, pending: [] });
  }

  /**
   * Shows `sync` and keeps its queue in this tab's record. A game the server just confirmed is kept
   * as well; one restored from storage while not connected is not news, and is not written back.
   */
  private save(sync: SyncState<State, Move>): void {
    const confirmedNow = this.connected && sync.confirmed !== this.sync?.confirmed;
    this.sync = sync;
    const { definition } = this.api;
    const key = saveQueue(definition.id, this.nickname, sync, this.env.storage, this.ownKey);
    this.ownKey = key;
    if (confirmedNow) saveConfirmed(definition.id, this.nickname, sync.confirmed, this.env.storage);
    this.emit();
  }

  private adoptClockOf(game: SavedGame<State>): void {
    const { env } = this;
    this.setClock(adoptClock(this.clock, game, env.now(), env.isVisible()));
  }

  private tickClock(type: 'move' | 'finish' | 'hide' | 'show'): void {
    if (this.clock === undefined) return;
    const clock = tick(this.clock.clock, { type, at: this.env.now() });
    this.setClock({ ...this.clock, clock });
  }

  private setClock(clock: GameClock): void {
    this.clock = clock;
    saveClock(this.api.definition.id, this.nickname, clock, this.env.storage);
  }

  /** Not disposed. A getter, so a check after an await reads the field again. */
  private get live(): boolean {
    return !this.disposed;
  }

  private emit(): void {
    if (!this.disposed) this.onChange(this.view());
  }
}
