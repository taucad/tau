/**
 * Two I/O lanes for the authority's provider calls (project-library fast path FW4, invariant S10).
 *
 * - **Interactive**: every call a person or a session is waiting on. Never queued; counted while in flight, until it
 *   settles or {@link ioStallMilliseconds} pass.
 * - **Background**: bulk reads nobody waits on call by call (a cold root's full read, a validation, a snapshot poll,
 *   the audit, an orphan sweep, a Project Index compare, a connection that declared itself background). A provider
 *   call is admitted only while no interactive call is counted, and at most {@link backgroundIoConcurrency} are counted
 *   across all roots. Aging is per operation ({@link IoOperation}): once an operation has waited
 *   {@link backgroundIoAgingMilliseconds} behind interactive calls, it and every later call of it are admitted
 *   anyway, within the same limit, so a busy session neither starves a validation nor charges each serial step of a
 *   walk the wait again.
 * - **Sweep**: an identity sweep a person is waiting on (a sole copy's permanent delete, an adopt that restores an id).
 *   Bulk work behind an interactive request: admitted within its own window of {@link sweepIoConcurrency} calls, never
 *   as unranked chains, and counted as interactive while in flight so background work yields to it.
 *
 * Every admitted call has a deadline. An interactive or sweep call in flight past {@link ioStallMilliseconds}, or a
 * background call past its root's deadline, stops counting: its slot and its interactive count are released for
 * accounting, the call runs on, and its late settle releases nothing twice. A root whose background calls stall is
 * admitted one call at a time, none while {@link backgroundIoConcurrency} of its calls are stalled, and its deadline
 * doubles while it keeps stalling ({@link ioMaxStallMilliseconds} at most), so a hung or slow root holds at most four
 * counted and four stalled calls, and never the lane.
 *
 * Admission sits at the provider call, below every lock: a lane never decides whether an operation may start, only
 * when each of its provider calls is issued. Nothing admitted waits on the scheduler again (a gated call runs the
 * provider's own method, whose calls on itself are neither gated nor counted), so the only waits on the scheduler are
 * a queued call's, for a slot an admitted call frees when it settles or stalls, or for time. No interactive call ever
 * waits on the scheduler, so no cycle through a lock can close. An operation that holds a lock other work waits on is
 * promoted ({@link IoScheduler.operation}): it never waits on aging, only for the lane's slots, so the lock is held
 * for its own I/O and no longer.
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

/** Background provider calls counted in flight at once, across all roots (FW4; tune from FW0's field capture). @public */
export const backgroundIoConcurrency = 4;

/** How long a background operation waits behind interactive calls before it is admitted anyway (aging). @public */
export const backgroundIoAgingMilliseconds = 250;

/**
 * Provider calls a sweep a person is waiting on keeps in flight: its own bounded window, in place of the 64 read chains
 * the sweep issued unranked before FW4 (tune from FW0's field capture).
 *
 * @public
 */
export const sweepIoConcurrency = 16;

/**
 * How long an admitted call counts (the coordinator's ruling on a hung root): an interactive or sweep call, and a
 * background call on a root that has not stalled. The same 5 s as a root other than Home is given to answer its
 * admission (blueprint D1), applied to every root, Home included: a background call is a listing or a small record
 * read, so one that runs 5 s is behind a hung mount or a saturated backend, and releasing its slot costs concurrency,
 * never correctness.
 *
 * @public
 */
export const ioStallMilliseconds = 5000;

/** The longest a root's background deadline grows to while its calls keep stalling. @public */
export const ioMaxStallMilliseconds = 60_000;

/**
 * One background operation's admission state: when it first had to wait, whether it is promoted, and the signal that
 * cancels its queued calls. Calls of one operation share it, so it ages once.
 *
 * @public
 */
export type IoOperation = {
  /** When a call of the operation was first left queued behind interactive calls. */
  blockedSince: number | undefined;
  /** Admitted without aging: the operation holds a lock other work waits on. */
  readonly promoted: boolean;
  /** Aborted when nobody can use the operation's answers any more (its connection closed). */
  readonly signal: AbortSignal | undefined;
};

/** One counted interactive or sweep call. */
type InteractiveEntry = { readonly storageRootKey: string; readonly startedAt: number; counted: boolean };

/** One queued call. */
type Waiter = {
  readonly storageRootKey: string;
  readonly queuedAt: number;
  readonly operation: IoOperation | undefined;
  readonly admit: () => void;
  readonly reject: (error: unknown) => void;
  admitted: boolean;
};

/** A root's background accounting. */
type RootLane = { counted: number; stalled: number; deadline: number };

const abortError = (): DOMException => new DOMException('The background call was cancelled.', 'AbortError');

/**
 * The admission rule, one per authority (its provider registry owns it).
 *
 * @public
 */
export class IoScheduler {
  /** Counted interactive and sweep calls, oldest first, so the ones past the deadline are a prefix. */
  private readonly _interactive = new Set<InteractiveEntry>();
  private readonly _interactiveByRoot = new Map<string, number>();
  /** Background calls counted toward the limit. */
  private _background = 0;
  private readonly _roots = new Map<string, RootLane>();
  /** Sweep calls counted toward the window. */
  private _sweep = 0;
  private readonly _backgroundQueue: Waiter[] = [];
  private readonly _sweepQueue: Waiter[] = [];
  /** Background and sweep calls counted in flight, by ticket, so an interactive call's wait can end when they have. */
  private readonly _ranked = new Set<number>();
  private _nextTicket = 0;
  /** Interactive calls waiting for the ranked calls in flight when they were issued: their `io.wait.interactive`. */
  private readonly _interactiveWaits = new Set<{ readonly startedAt: number; readonly ahead: Set<number> }>();
  private _agingTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _stallTimers = new Set<ReturnType<typeof setTimeout>>();
  private _disposed = false;
  private readonly _timings: WorkerTimings;
  private readonly _clock: () => number;

  /**
   * Create a scheduler.
   *
   * @param options - The timing recorder (spans `io.wait.interactive` and `io.wait.background`) and the clock aging and
   *   deadlines are measured on; default the worker's recorder and `Date.now`, which fake timers control.
   */
  public constructor(options?: Readonly<{ timings?: WorkerTimings; now?: () => number }>) {
    this._timings = options?.timings ?? defaultWorkerTimings;
    this._clock = options?.now ?? (() => Date.now());
  }

  /**
   * Interactive calls counted in flight, sweep calls included: one root's, or every root's.
   *
   * @param storageRootKey - The root; every root when omitted.
   * @returns The count.
   */
  public interactiveInFlight(storageRootKey?: string): number {
    this._expireInteractive();
    return storageRootKey === undefined ? this._interactive.size : (this._interactiveByRoot.get(storageRootKey) ?? 0);
  }

  /**
   * Background calls counted toward the limit of four: admitted, not settled and not stalled.
   *
   * @returns The count.
   */
  public backgroundInFlight(): number {
    return this._background;
  }

  /**
   * Background calls in flight past their deadline: one root's, or every root's.
   *
   * @param storageRootKey - The root; every root when omitted.
   * @returns The count.
   */
  public backgroundStalled(storageRootKey?: string): number {
    return storageRootKey === undefined
      ? [...this._roots.values()].reduce((sum, root) => sum + root.stalled, 0)
      : (this._roots.get(storageRootKey)?.stalled ?? 0);
  }

  /**
   * How long a background call on a root counts before it stalls.
   *
   * @param storageRootKey - The root.
   * @returns The deadline in milliseconds.
   */
  public backgroundDeadline(storageRootKey: string): number {
    return this._roots.get(storageRootKey)?.deadline ?? ioStallMilliseconds;
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
   * Sweep calls counted toward the window.
   *
   * @returns The count.
   */
  public sweepInFlight(): number {
    return this._sweep;
  }

  /**
   * Start one background operation: its calls age together, and a promoted one never waits on aging.
   *
   * @param options - `promoted` for an operation that holds a lock other work waits on; `signal` to cancel its queued
   *   calls.
   * @returns The operation, to pass with each of its calls.
   */
  public operation(options?: Readonly<{ promoted?: boolean; signal?: AbortSignal }>): IoOperation {
    return { blockedSince: undefined, promoted: options?.promoted === true, signal: options?.signal };
  }

  /**
   * Count one interactive call from now until the returned function is called, or until {@link ioStallMilliseconds}
   * pass, whichever is first.
   *
   * @param storageRootKey - The root the call is on.
   * @returns Call it when the call settles, resolved or rejected; a second call does nothing.
   */
  public beginInteractive(storageRootKey: string): () => void {
    this._expireInteractive();
    const entry = this._count(storageRootKey);
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
      this._uncount(entry);
      this._pump();
    };
  }

  /**
   * Run one background provider call once it is admitted. Admitted, it counts toward the limit until it settles or its
   * root's deadline passes, whichever is first.
   *
   * @param storageRootKey - The root the call is on.
   * @param call - The call.
   * @param operation - The operation it belongs to; a call of its own when omitted.
   * @returns What the call answers.
   */
  public async runBackground<Result>(
    storageRootKey: string,
    call: () => Result | Promise<Result>,
    operation?: IoOperation,
  ): Promise<Awaited<Result>> {
    const issuedAt = this._timings.now();
    await this._enqueue(this._backgroundQueue, { storageRootKey, operation });
    this._timings.record('io.wait.background', issuedAt);
    const root = this._root(storageRootKey);
    let stalled = false;
    return this._run(call, {
      deadline: root.deadline,
      release: () => {
        if (stalled) {
          root.stalled -= 1;
        } else {
          this._background -= 1;
          root.counted -= 1;
          /* Settled within its deadline: the root answers again. */
          root.deadline = ioStallMilliseconds;
        }
        this._dropRoot(storageRootKey, root);
      },
      stall: () => {
        stalled = true;
        this._background -= 1;
        root.counted -= 1;
        root.stalled += 1;
        root.deadline = Math.min(root.deadline * 2, ioMaxStallMilliseconds);
        this._timings.count('io.background.stalled');
      },
    });
  }

  /**
   * Run one call of a sweep a person is waiting on once its window has room. It counts as interactive while in flight,
   * so background calls yield to it, and as ranked work an interactive call issued meanwhile may wait behind. Past
   * {@link ioStallMilliseconds} it releases its window slot and its interactive count.
   *
   * @param storageRootKey - The root the call is on.
   * @param call - The call.
   * @returns What the call answers.
   */
  public async runSweep<Result>(
    storageRootKey: string,
    call: () => Result | Promise<Result>,
  ): Promise<Awaited<Result>> {
    let entry: InteractiveEntry | undefined;
    /* A sweep call reserves its window slot and its interactive count in the same step. */
    await this._enqueue(this._sweepQueue, {
      storageRootKey,
      onAdmitted: () => {
        entry = this._count(storageRootKey);
      },
    });
    let stalled = false;
    return this._run(call, {
      deadline: ioStallMilliseconds,
      release: () => {
        if (!stalled) {
          this._sweep -= 1;
          this._uncount(entry!);
        }
      },
      stall: () => {
        stalled = true;
        this._sweep -= 1;
        this._uncount(entry!);
      },
    });
  }

  /**
   * Stop every timer this scheduler set: stall deadlines are no longer watched and aging is never armed again. Queued
   * calls are admitted only by the slots and interactive settles that remain. For the end of the authority's life.
   */
  public dispose(): void {
    this._disposed = true;
    clearTimeout(this._agingTimer);
    this._agingTimer = undefined;
    for (const timer of this._stallTimers) {
      clearTimeout(timer);
    }
    this._stallTimers.clear();
  }

  private _count(storageRootKey: string): InteractiveEntry {
    const entry: InteractiveEntry = { storageRootKey, startedAt: this._clock(), counted: true };
    this._interactive.add(entry);
    this._interactiveByRoot.set(storageRootKey, (this._interactiveByRoot.get(storageRootKey) ?? 0) + 1);
    return entry;
  }

  /** Stop counting one entry, once: at its settle, or when it passed the deadline. */
  private _uncount(entry: InteractiveEntry): void {
    if (!entry.counted) {
      return;
    }
    entry.counted = false;
    this._interactive.delete(entry);
    const count = (this._interactiveByRoot.get(entry.storageRootKey) ?? 1) - 1;
    if (count === 0) {
      this._interactiveByRoot.delete(entry.storageRootKey);
    } else {
      this._interactiveByRoot.set(entry.storageRootKey, count);
    }
  }

  /** Stop counting the interactive calls in flight past the deadline: the oldest ones. Sweep calls stall by timer. */
  private _expireInteractive(): void {
    const expired = this._clock() - ioStallMilliseconds;
    for (const entry of this._interactive) {
      if (entry.startedAt > expired) {
        return;
      }
      this._uncount(entry);
    }
  }

  private _root(storageRootKey: string): RootLane {
    let root = this._roots.get(storageRootKey);
    if (root === undefined) {
      root = { counted: 0, stalled: 0, deadline: ioStallMilliseconds };
      this._roots.set(storageRootKey, root);
    }
    return root;
  }

  private _dropRoot(storageRootKey: string, root: RootLane): void {
    if (root.counted === 0 && root.stalled === 0 && root.deadline === ioStallMilliseconds) {
      this._roots.delete(storageRootKey);
    }
  }

  /** Make one admitted call: `release` once when it settles, `stall` once if it is in flight past `deadline`. */
  private async _run<Result>(
    call: () => Result | Promise<Result>,
    lifecycle: Readonly<{ deadline: number; release: () => void; stall: () => void }>,
  ): Promise<Awaited<Result>> {
    const ticket = this._nextTicket;
    this._nextTicket += 1;
    this._ranked.add(ticket);
    let done = false;
    const unrank = (): void => {
      this._ranked.delete(ticket);
      for (const wait of this._interactiveWaits) {
        if (wait.ahead.delete(ticket) && wait.ahead.size === 0) {
          this._interactiveWaits.delete(wait);
          this._timings.record('io.wait.interactive', wait.startedAt);
        }
      }
    };
    const timer = this._disposed
      ? undefined
      : setTimeout(() => {
          this._stallTimers.delete(timer!);
          if (!done) {
            done = true;
            unrank();
            lifecycle.stall();
            this._pump();
          }
        }, lifecycle.deadline);
    if (timer !== undefined) {
      this._stallTimers.add(timer);
    }
    let settled = false;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        this._stallTimers.delete(timer);
      }
      if (!done) {
        done = true;
        unrank();
      }
      lifecycle.release();
      this._pump();
    };
    let result: Result | Promise<Result>;
    try {
      result = call();
    } catch (error) {
      settle();
      throw error;
    }
    try {
      return await result;
    } finally {
      settle();
    }
  }

  /** Whether the root of a queued background call may take a slot now. */
  private _rootAdmits(storageRootKey: string): boolean {
    const root = this._roots.get(storageRootKey);
    return root === undefined || root.stalled === 0 || (root.stalled < backgroundIoConcurrency && root.counted === 0);
  }

  /** Whether a queued background call has waited out aging: its operation's first wait, or its own. */
  private _aged(waiter: Waiter): boolean {
    if (waiter.operation?.promoted === true) {
      return true;
    }
    return this._clock() - (waiter.operation?.blockedSince ?? waiter.queuedAt) >= backgroundIoAgingMilliseconds;
  }

  /** The time a queued background call ages at. */
  private _agesAt(waiter: Waiter): number {
    return (waiter.operation?.blockedSince ?? waiter.queuedAt) + backgroundIoAgingMilliseconds;
  }

  /**
   * Queue one call and let the pump admit it, at once when the rules allow. A background call left queued starts its
   * operation's aging, once; `onAdmitted` reserves what the call holds in the same step as its slot.
   */
  private async _enqueue(
    queue: Waiter[],
    call: Readonly<{ storageRootKey: string; operation?: IoOperation | undefined; onAdmitted?: () => void }>,
  ): Promise<void> {
    const { storageRootKey, operation, onAdmitted } = call;
    const signal = operation?.signal;
    if (signal?.aborted === true) {
      throw abortError();
    }
    const admitted = Promise.withResolvers<void>();
    const cancel = (): void => {
      const index = queue.indexOf(waiter);
      if (index !== -1) {
        queue.splice(index, 1);
        admitted.reject(abortError());
        this._pump();
      }
    };
    const waiter: Waiter = {
      storageRootKey,
      queuedAt: this._clock(),
      operation,
      admit: () => {
        waiter.admitted = true;
        signal?.removeEventListener('abort', cancel);
        onAdmitted?.();
        admitted.resolve();
      },
      reject: admitted.reject,
      admitted: false,
    };
    signal?.addEventListener('abort', cancel, { once: true });
    queue.push(waiter);
    this._pump();
    if (!waiter.admitted && operation !== undefined) {
      operation.blockedSince ??= waiter.queuedAt;
    }
    return admitted.promise;
  }

  /**
   * Admit what the rules allow, in issue order, reserving each slot as it admits, and skipping a background call
   * whose root is capped; arm the aging timer for the first call held back by interactive calls alone.
   */
  private _pump(): void {
    this._expireInteractive();
    while (this._sweepQueue.length > 0 && this._sweep < sweepIoConcurrency) {
      this._sweep += 1;
      this._sweepQueue.shift()!.admit();
    }
    let agesAt = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this._backgroundQueue.length && this._background < backgroundIoConcurrency; ) {
      const waiter = this._backgroundQueue[index]!;
      if (!this._rootAdmits(waiter.storageRootKey)) {
        index += 1;
      } else if (this._interactive.size > 0 && !this._aged(waiter)) {
        agesAt = Math.min(agesAt, this._agesAt(waiter));
        index += 1;
      } else {
        this._background += 1;
        this._root(waiter.storageRootKey).counted += 1;
        this._backgroundQueue.splice(index, 1);
        waiter.admit();
      }
    }
    clearTimeout(this._agingTimer);
    this._agingTimer = undefined;
    if (!this._disposed && Number.isFinite(agesAt) && this._background < backgroundIoConcurrency) {
      /* Held back only by interactive calls: wake when the first such call has aged. A full lane, or a capped root, is
       * woken by a release instead. */
      this._agingTimer = setTimeout(
        () => {
          this._agingTimer = undefined;
          this._pump();
        },
        Math.max(0, agesAt - this._clock()),
      );
    }
  }
}
