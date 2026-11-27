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

/**
 * How long an admitted background call counts toward {@link backgroundIoConcurrency} (the coordinator's ruling on a
 * hung root): past it the call is stalled, its slot is released for accounting while the call itself runs on, and
 * `io.background.stalled` moves. The same 5 s as a root other than Home is given to answer its admission (blueprint
 * D1). Applied to every root, Home included: a background call is a listing or a small record read, so one that runs
 * 5 s is behind a hung mount or a saturated backend, and releasing its slot costs only concurrency, never correctness.
 *
 * @public
 */
export const backgroundIoStallMilliseconds = 5000;

/** One queued call: its root, when it was queued, and how to admit it. */
type Waiter = Readonly<{ storageRootKey: string; queuedAt: number; admit: () => void }>;

/**
 * The admission rule, one per authority (its provider registry owns it).
 *
 * @public
 */
export class IoScheduler {
  /** Interactive calls in flight, per storage root. */
  private readonly _interactive = new Map<string, number>();
  private _interactiveTotal = 0;
  /** Background calls admitted, not yet settled and not stalled: the ones that count toward the limit. */
  private _background = 0;
  /** {@link IoScheduler._background}, per root. */
  private readonly _backgroundByRoot = new Map<string, number>();
  /** Background calls in flight past {@link backgroundIoStallMilliseconds}, per root. */
  private readonly _stalled = new Map<string, number>();
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
   * Background calls admitted, not yet settled and not stalled: the ones that count toward the limit of four.
   *
   * @returns The count.
   */
  public backgroundInFlight(): number {
    return this._background;
  }

  /**
   * Background calls in flight past the stall deadline: one root's, or every root's.
   *
   * @param storageRootKey - The root; every root when omitted.
   * @returns The count.
   */
  public backgroundStalled(storageRootKey?: string): number {
    return storageRootKey === undefined
      ? [...this._stalled.values()].reduce((sum, count) => sum + count, 0)
      : (this._stalled.get(storageRootKey) ?? 0);
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
   * Run one background provider call once it is admitted. Admitted, it counts toward the limit until it settles or
   * until {@link backgroundIoStallMilliseconds} pass, whichever is first; a root with stalled calls in flight is
   * admitted one call at a time, so a hung root never claims the slots it released.
   *
   * @param storageRootKey - The root the call is on.
   * @param call - The call; its synchronous part runs with nested calls uncounted.
   * @returns What the call answers.
   */
  public async runBackground<Result>(
    storageRootKey: string,
    call: () => Result | Promise<Result>,
  ): Promise<Awaited<Result>> {
    const issuedAt = this._timings.now();
    await this._enqueue(this._backgroundQueue, { storageRootKey, queuedAt: this._clock() });
    this._timings.record('io.wait.background', issuedAt);
    let stalled = false;
    return this._run(
      call,
      () => {
        if (stalled) {
          adjust(this._stalled, storageRootKey, -1);
        } else {
          this._background -= 1;
          adjust(this._backgroundByRoot, storageRootKey, -1);
        }
      },
      () => {
        stalled = true;
        this._background -= 1;
        adjust(this._backgroundByRoot, storageRootKey, -1);
        adjust(this._stalled, storageRootKey, 1);
        this._timings.count('io.background.stalled');
      },
    );
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
      await this._enqueue(this._sweepQueue, { storageRootKey, queuedAt: this._clock() });
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

  /**
   * Make one admitted call. `release` runs once when it settles; `onStall`, when given, runs once if it is still in
   * flight after {@link backgroundIoStallMilliseconds}, and from then on no interactive call waits behind it.
   */
  private async _run<Result>(
    call: () => Result | Promise<Result>,
    release: () => void,
    onStall?: () => void,
  ): Promise<Awaited<Result>> {
    const ticket = this._nextTicket;
    this._nextTicket += 1;
    this._ranked.add(ticket);
    let released = false;
    const unrank = (): void => {
      this._ranked.delete(ticket);
      for (const wait of this._interactiveWaits) {
        if (wait.ahead.delete(ticket) && wait.ahead.size === 0) {
          this._interactiveWaits.delete(wait);
          this._timings.record('io.wait.interactive', wait.startedAt);
        }
      }
    };
    const stallTimer =
      onStall === undefined
        ? undefined
        : setTimeout(() => {
            if (!released) {
              unrank();
              onStall();
              this._pump();
            }
          }, backgroundIoStallMilliseconds);
    const settle = (): void => {
      if (released) {
        return;
      }
      released = true;
      clearTimeout(stallTimer);
      unrank();
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

  /** Whether a waiter's root may take a slot now: any number while none of its calls is stalled, else one at a time. */
  private _rootAdmits(storageRootKey: string): boolean {
    return (this._stalled.get(storageRootKey) ?? 0) === 0 || (this._backgroundByRoot.get(storageRootKey) ?? 0) === 0;
  }

  private _aged(waiter: Waiter): boolean {
    return this._clock() - waiter.queuedAt >= backgroundIoAgingMilliseconds;
  }

  private async _enqueue(queue: Waiter[], waiter: Omit<Waiter, 'admit'>): Promise<void> {
    const admitted = Promise.withResolvers<void>();
    queue.push({ ...waiter, admit: admitted.resolve });
    this._pump();
    return admitted.promise;
  }

  /** Admit what the rules allow, in issue order, reserving each slot as it admits; arm the aging timer for the head. */
  private _pump(): void {
    while (this._sweepQueue.length > 0 && this._sweep < sweepIoConcurrency) {
      this._sweep += 1;
      this._sweepQueue.shift()!.admit();
    }
    /* In queue order, skipping a waiter whose root is capped: a hung root never holds back another root's calls. */
    let blockedByInteractive: Waiter | undefined;
    for (let index = 0; index < this._backgroundQueue.length && this._background < backgroundIoConcurrency; ) {
      const waiter = this._backgroundQueue[index]!;
      if (!this._rootAdmits(waiter.storageRootKey)) {
        index += 1;
      } else if (this._interactiveTotal > 0 && !this._aged(waiter)) {
        blockedByInteractive ??= waiter;
        index += 1;
      } else {
        this._background += 1;
        adjust(this._backgroundByRoot, waiter.storageRootKey, 1);
        this._backgroundQueue.splice(index, 1);
        waiter.admit();
      }
    }
    clearTimeout(this._agingTimer);
    this._agingTimer = undefined;
    if (blockedByInteractive !== undefined && this._background < backgroundIoConcurrency) {
      /* Blocked only by interactive calls: wake when the first such waiter has aged. A full lane, or a capped root, is
       * woken by a release instead. */
      this._agingTimer = setTimeout(
        () => {
          this._agingTimer = undefined;
          this._pump();
        },
        Math.max(0, blockedByInteractive.queuedAt + backgroundIoAgingMilliseconds - this._clock()),
      );
    }
  }
}

const noop = (): void => undefined;

/** Move one root's count by `delta`, dropping it at zero. */
const adjust = (counts: Map<string, number>, storageRootKey: string, delta: 1 | -1): void => {
  const count = (counts.get(storageRootKey) ?? 0) + delta;
  if (count === 0) {
    counts.delete(storageRootKey);
  } else {
    counts.set(storageRootKey, count);
  }
};
