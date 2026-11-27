/**
 * Two I/O lanes for the authority's provider calls (project-library fast path FW4, invariant S10).
 *
 * - **Interactive**: every call a person or a session is waiting on. Never queued; counted while in flight.
 * - **Background**: bulk reads nobody waits on call by call (a cold root's full read, a validation, a snapshot poll,
 *   the audit, an orphan sweep, a Project Index compare, a connection that declared itself background). One provider
 *   call is admitted only while no interactive call is in flight, and at most {@link backgroundIoConcurrency} are in
 *   flight across all roots. A call that has waited {@link backgroundIoAgingMilliseconds} is admitted anyway, within
 *   the same limit, so a busy session cannot starve a validation.
 * - **Sweep**: an identity sweep a person is waiting on (a sole copy's permanent delete, an adopt that restores an id).
 *   Bulk work behind an interactive request: admitted within its own window of {@link sweepIoConcurrency} calls, never
 *   as unranked chains, and counted as interactive while in flight so background work yields to it.
 *
 * Admission sits at the provider call, below every lock: a lane never decides whether an operation may start, only
 * when each of its provider calls is issued. Nothing admitted waits on the scheduler again (a gated call runs the
 * provider's own method, and the provider's nested calls of its own methods are neither gated nor counted), so the
 * only waits on the scheduler are a queued call's, for a slot an admitted call frees when it settles or for the aging
 * timer. No interactive call ever waits on the scheduler, so no cycle through a lock can close: an interactive
 * operation blocked on a lock a background operation holds waits at most for that operation's calls, each admitted
 * within {@link backgroundIoAgingMilliseconds} of being issued plus the slots ahead of it.
 *
 * @module
 */

import { workerTimings as defaultWorkerTimings } from '#worker-timings.js';
import type { WorkerTimings } from '#worker-timings.js';

/**
 * Which lane a provider call runs in.
 *
 * @public
 */
export type IoLane = 'interactive' | 'background';

/** Background provider calls in flight at once, across all roots (FW4; tune from FW0's field capture). @public */
export const backgroundIoConcurrency = 4;

/** How long a queued background call waits behind interactive calls before it is admitted anyway (aging). @public */
export const backgroundIoAgingMilliseconds = 250;

/**
 * Provider calls a sweep a person is waiting on keeps in flight: its own bounded window, in place of the 64 read chains
 * the sweep issued unranked before FW4 (tune from FW0's field capture).
 *
 * @public
 */
export const sweepIoConcurrency = 16;

/** One queued call: when it was issued, and how to admit it. */
type Waiter = Readonly<{ queuedAt: number; admit: () => void }>;

/**
 * The admission rule, one per authority (its provider registry owns it).
 *
 * @public
 */
export class IoScheduler {
  /** Interactive calls in flight, per storage root. */
  private readonly _interactive = new Map<string, number>();
  private _interactiveTotal = 0;
  /** Background calls admitted and not yet settled. */
  private _background = 0;
  /** Sweep calls admitted and not yet settled. */
  private _sweep = 0;
  private readonly _backgroundQueue: Waiter[] = [];
  private readonly _sweepQueue: Waiter[] = [];
  /** Background and sweep calls in flight, by ticket, so an interactive call's wait can end when they have. */
  private readonly _ranked = new Set<number>();
  private _nextTicket = 0;
  /** Interactive calls waiting for the ranked calls in flight when they were issued: their `io.wait.interactive`. */
  private readonly _interactiveWaits = new Set<{ readonly startedAt: number; readonly ahead: Set<number> }>();
  private _agingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Above zero while a gated call's own method runs its synchronous part: the nested calls it makes are its own. */
  private _gatedDepth = 0;
  private readonly _timings: WorkerTimings;
  private readonly _clock: () => number;

  /**
   * Create a scheduler.
   *
   * @param options - The timing recorder (spans `io.wait.interactive` and `io.wait.background`) and the clock aging is
   *   measured on; default the worker's recorder and `Date.now`, which fake timers control.
   */
  public constructor(options?: Readonly<{ timings?: WorkerTimings; now?: () => number }>) {
    this._timings = options?.timings ?? defaultWorkerTimings;
    this._clock = options?.now ?? (() => Date.now());
  }

  /**
   * Interactive calls in flight: one root's, or every root's.
   *
   * @param storageRootKey - The root; every root when omitted.
   * @returns The count.
   */
  public interactiveInFlight(storageRootKey?: string): number {
    return storageRootKey === undefined ? this._interactiveTotal : (this._interactive.get(storageRootKey) ?? 0);
  }

  /**
   * Background calls admitted and not yet settled.
   *
   * @returns The count.
   */
  public backgroundInFlight(): number {
    return this._background;
  }

  /**
   * Background calls issued and not yet admitted.
   *
   * @returns The count.
   */
  public backgroundQueued(): number {
    return this._backgroundQueue.length;
  }

  /**
   * Sweep calls admitted and not yet settled.
   *
   * @returns The count.
   */
  public sweepInFlight(): number {
    return this._sweep;
  }

  /**
   * Count one interactive call from now until the returned function is called. A call a gated call's own method makes
   * synchronously is part of that gated call and is not counted.
   *
   * @param storageRootKey - The root the call is on.
   * @returns Call it once when the call settles, resolved or rejected.
   */
  public beginInteractive(storageRootKey: string): () => void {
    if (this._gatedDepth > 0) {
      return noop;
    }
    this._count(storageRootKey, 1);
    const wait = this._ranked.size === 0 ? undefined : { startedAt: this._timings.now(), ahead: new Set(this._ranked) };
    if (wait !== undefined) {
      this._interactiveWaits.add(wait);
    }
    let settled = false;
    return () => {
      if (settled) {
        return;
      }
      settled = true;
      if (wait !== undefined && this._interactiveWaits.delete(wait)) {
        this._timings.record('io.wait.interactive', wait.startedAt);
      }
      this._count(storageRootKey, -1);
      this._pump();
    };
  }

  /**
   * Run one background provider call once it is admitted.
   *
   * @param call - The call; its synchronous part runs with nested calls uncounted.
   * @returns What the call answers.
   */
  public async runBackground<Result>(call: () => Result | Promise<Result>): Promise<Awaited<Result>> {
    const issuedAt = this._timings.now();
    const queuedAt = this._clock();
    if (this._backgroundQueue.length > 0 || !this._admitsBackground(queuedAt)) {
      await this._enqueue(this._backgroundQueue, queuedAt);
    } else {
      this._background += 1;
    }
    this._timings.record('io.wait.background', issuedAt);
    return this._run(call, () => {
      this._background -= 1;
    });
  }

  /**
   * Run one call of a sweep a person is waiting on once its window has room. It counts as interactive while in flight,
   * so background calls yield to it, and as ranked work an interactive call issued meanwhile may wait behind.
   *
   * @param storageRootKey - The root the call is on.
   * @param call - The call.
   * @returns What the call answers.
   */
  public async runSweep<Result>(
    storageRootKey: string,
    call: () => Result | Promise<Result>,
  ): Promise<Awaited<Result>> {
    if (this._sweepQueue.length > 0 || this._sweep >= sweepIoConcurrency) {
      await this._enqueue(this._sweepQueue, this._clock());
    } else {
      this._sweep += 1;
    }
    this._count(storageRootKey, 1);
    return this._run(call, () => {
      this._sweep -= 1;
      this._count(storageRootKey, -1);
    });
  }

  /** Stop the aging timer; queued calls are admitted by the slots and interactive settles that remain. */
  public dispose(): void {
    clearTimeout(this._agingTimer);
    this._agingTimer = undefined;
  }

  private _count(storageRootKey: string, delta: 1 | -1): void {
    const count = (this._interactive.get(storageRootKey) ?? 0) + delta;
    if (count === 0) {
      this._interactive.delete(storageRootKey);
    } else {
      this._interactive.set(storageRootKey, count);
    }
    this._interactiveTotal += delta;
  }

  private async _run<Result>(call: () => Result | Promise<Result>, release: () => void): Promise<Awaited<Result>> {
    const ticket = this._nextTicket;
    this._nextTicket += 1;
    this._ranked.add(ticket);
    let released = false;
    const settle = (): void => {
      if (released) {
        return;
      }
      released = true;
      this._ranked.delete(ticket);
      for (const wait of this._interactiveWaits) {
        if (wait.ahead.delete(ticket) && wait.ahead.size === 0) {
          this._interactiveWaits.delete(wait);
          this._timings.record('io.wait.interactive', wait.startedAt);
        }
      }
      release();
      this._pump();
    };
    let result: Result | Promise<Result>;
    this._gatedDepth += 1;
    try {
      result = call();
    } catch (error) {
      settle();
      throw error;
    } finally {
      this._gatedDepth -= 1;
    }
    try {
      return await result;
    } finally {
      settle();
    }
  }

  /** Whether a background call queued at `queuedAt` may be admitted now. */
  private _admitsBackground(queuedAt: number): boolean {
    return (
      this._background < backgroundIoConcurrency &&
      (this._interactiveTotal === 0 || this._clock() - queuedAt >= backgroundIoAgingMilliseconds)
    );
  }

  private async _enqueue(queue: Waiter[], queuedAt: number): Promise<void> {
    const admitted = Promise.withResolvers<void>();
    queue.push({ queuedAt, admit: admitted.resolve });
    this._pump();
    return admitted.promise;
  }

  /** Admit what the rules allow, in issue order, reserving each slot as it admits; arm the aging timer for the head. */
  private _pump(): void {
    while (this._sweepQueue.length > 0 && this._sweep < sweepIoConcurrency) {
      this._sweep += 1;
      this._sweepQueue.shift()!.admit();
    }
    while (this._backgroundQueue.length > 0 && this._admitsBackground(this._backgroundQueue[0]!.queuedAt)) {
      this._background += 1;
      this._backgroundQueue.shift()!.admit();
    }
    clearTimeout(this._agingTimer);
    this._agingTimer = undefined;
    const head = this._backgroundQueue[0];
    if (head !== undefined && this._background < backgroundIoConcurrency) {
      /* Blocked only by interactive calls: wake when the head has aged. A full lane is woken by a release instead. */
      this._agingTimer = setTimeout(
        () => {
          this._agingTimer = undefined;
          this._pump();
        },
        Math.max(0, head.queuedAt + backgroundIoAgingMilliseconds - this._clock()),
      );
    }
  }
}

const noop = (): void => undefined;
