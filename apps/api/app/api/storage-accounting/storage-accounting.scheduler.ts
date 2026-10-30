import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { MetricsService, StorageAccountingTask } from '#telemetry/metrics.js';
import { accountingGauges } from '#api/storage-accounting/accounting-figures.js';
import type {
  AccountingFigures,
  AccountingGauge,
  AccountingSnapshot,
  AccountingTask,
} from '#api/storage-accounting/accounting-figures.js';

/** How often each Machine checks whether a task is due and refreshes the figures it exports. */
export const accountingTickMilliseconds = 15_000;

/** The longest a pass holds its task's lock; a failed hourly pass is retried by some Machine after it. */
const maximumLockMilliseconds = 10 * 60 * 1000;

/** A pass is abandoned this long before its lock lapses, so no second Machine starts one alongside it. */
const deadlineMarginMilliseconds = 5000;

/** Figures older than this many intervals are no longer exported; their `last_success` still is, and alerts. */
export const staleIntervals = 3;

/** Shared figures outlive any interval, so a stalled task keeps exporting an old `last_success` that alerts. */
const snapshotTtlMilliseconds = 7 * 24 * 60 * 60 * 1000;

/** Where the pass holder leaves each task's figures for every Machine, and the lock that elects it. */
export type SnapshotStore = {
  read(task: StorageAccountingTask): Promise<AccountingSnapshot | undefined>;
  write(task: StorageAccountingTask, snapshot: AccountingSnapshot): Promise<void>;
  /** Takes the task's lock for `milliseconds` unless another Machine holds it. */
  claim(task: StorageAccountingTask, milliseconds: number): Promise<boolean>;
};

const snapshotKey = (task: StorageAccountingTask): string => `storage-accounting:v1:snapshot:${task}`;
const lockKey = (task: StorageAccountingTask): string => `storage-accounting:v1:lock:${task}`;

const isSnapshot = (value: unknown): value is AccountingSnapshot =>
  typeof value === 'object' &&
  value !== null &&
  Number.isFinite((value as { computedAt?: unknown }).computedAt) &&
  typeof (value as { figures?: unknown }).figures === 'object';

/**
 * The API's Redis as the snapshot store: one `SET NX PX` lock per task (the derive scheduler's
 * pattern) and one JSON value per task.
 *
 * @param client - The API's shared Redis client.
 * @returns The store.
 */
export const redisSnapshotStore = (client: Redis): SnapshotStore => ({
  async read(task) {
    const raw = await client.get(snapshotKey(task));
    if (raw === null) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : undefined;
  },
  async write(task, snapshot) {
    await client.set(snapshotKey(task), JSON.stringify(snapshot), 'PX', snapshotTtlMilliseconds);
  },
  async claim(task, milliseconds) {
    return (await client.set(lockKey(task), '1', 'PX', milliseconds, 'NX')) === 'OK';
  },
});

/**
 * A process-local store with the same lock semantics, for tests: share one between two schedulers to
 * stand for two Machines.
 *
 * @param now - The clock lock expiry is judged against.
 * @returns The store.
 */
export const memorySnapshotStore = (now: () => number = Date.now): SnapshotStore => {
  const snapshots = new Map<StorageAccountingTask, AccountingSnapshot>();
  const locks = new Map<StorageAccountingTask, number>();
  return {
    async read(task) {
      return snapshots.get(task);
    },
    async write(task, snapshot) {
      snapshots.set(task, snapshot);
    },
    async claim(task, milliseconds) {
      if ((locks.get(task) ?? 0) > now()) {
        return false;
      }
      locks.set(task, now() + milliseconds);
      return true;
    },
  };
};

export type StorageAccountingMetrics = Pick<
  MetricsService,
  AccountingGauge | 'storageAccountingPasses' | 'storageAccountingLastSuccess'
>;

type ObservableResult = {
  observe(value: number, attributes?: Readonly<Record<string, string>>): void;
};

/**
 * Runs a pass until it settles or `signal` aborts, whichever is first. A pass that ignores the signal
 * is left to finish in the background; its result and error are dropped.
 *
 * @param run - The task's pass.
 * @param signal - The pass's deadline and shutdown.
 * @returns The pass's figures.
 */
const runUntilAborted = async (
  run: (signal: AbortSignal) => Promise<AccountingFigures>,
  signal: AbortSignal,
): Promise<AccountingFigures> => {
  signal.throwIfAborted();
  /* Settles either way, so a pass abandoned after an abort never surfaces as an unhandled rejection. */
  const pass = (async (): Promise<{ figures: AccountingFigures } | { error: unknown }> => {
    try {
      return { figures: await run(signal) };
    } catch (error) {
      return { error };
    }
  })();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new Error('The storage accounting pass was aborted', { cause: signal.reason }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const outcome = await Promise.race([pass, aborted]);
    if ('error' in outcome) {
      throw outcome.error;
    }
    return outcome.figures;
  } finally {
    signal.removeEventListener('abort', onAbort!);
  }
};

/**
 * The storage accounting scheduler (W14 OB3, Finding 6).
 *
 * Every API Machine runs it, and one runs each pass: whichever first finds a task's shared figures older
 * than the task's interval takes the task's Redis lock, computes, and writes the figures back. Every
 * Machine then exports the same figures from its local copy, refreshed each tick, so panels and rules
 * read the gauges with `max` and a Machine's restart loses nothing.
 *
 * Liveness (the billing-worker pattern): the Machine that ran a pass counts it in
 * `tau.storage.accounting.passes` as `ok` or `error`; a task its configuration leaves off counts
 * `skipped` once per interval on each Machine. `tau.storage.accounting.last_success` is the time the
 * exported figures were computed, so a task that keeps failing keeps an old value and
 * `storage-accounting-stale` fires; a task that never ran exports none. Figures older than
 * {@link staleIntervals} intervals stop being exported, so a stalled task never reads as current.
 *
 * Each task runs on its own: the one-minute `db` pass is never queued behind an hourly one. A pass gets a
 * signal that aborts shortly before its lock lapses and on shutdown; the scheduler stops waiting for it
 * then, and the task's reads carry their own statement timeout.
 */
export class StorageAccountingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  readonly #logger = new Logger(StorageAccountingScheduler.name);
  readonly #snapshots = new Map<StorageAccountingTask, AccountingSnapshot>();
  readonly #skippedAt = new Map<StorageAccountingTask, number>();
  readonly #inFlight = new Map<StorageAccountingTask, Promise<void>>();
  readonly #shutdown = new AbortController();
  readonly #now: () => number;
  readonly #tickMilliseconds: number;
  #timer: NodeJS.Timeout | undefined;

  readonly #tasks: readonly AccountingTask[];
  readonly #store: SnapshotStore;
  readonly #metrics: StorageAccountingMetrics;

  /**
   * @param args - The tasks, the shared store, this Machine's instruments, and for tests a clock and tick.
   */
  public constructor(args: {
    readonly tasks: readonly AccountingTask[];
    readonly store: SnapshotStore;
    readonly metrics: StorageAccountingMetrics;
    readonly now?: () => number;
    readonly tickMilliseconds?: number;
  }) {
    this.#tasks = args.tasks;
    this.#store = args.store;
    this.#metrics = args.metrics;
    this.#now = args.now ?? Date.now;
    this.#tickMilliseconds = args.tickMilliseconds ?? accountingTickMilliseconds;
    for (const gauge of accountingGauges) {
      this.#metrics[gauge].addCallback((result) => {
        this.#observe(gauge, result as ObservableResult);
      });
    }
    this.#metrics.storageAccountingLastSuccess.addCallback((result) => {
      for (const [task, snapshot] of this.#snapshots) {
        /* Kept when the figures are dropped as stale: an old `last_success` is what fires the rule. */
        result.observe(snapshot.computedAt / 1000, {
          'tau.storage.accounting.task': task,
        });
      }
    });
  }

  public onApplicationBootstrap(): void {
    void this.tick();
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.#tickMilliseconds);
    this.#timer.unref();
  }

  /** Stops ticking and aborts any pass in flight; nothing waits for a pass the API no longer needs. */
  public async onModuleDestroy(): Promise<void> {
    clearInterval(this.#timer);
    this.#shutdown.abort();
    await Promise.allSettled(this.#inFlight.values());
  }

  /**
   * One tick: each task not already in flight refreshes its local figures from the store and, when they
   * are due and this Machine wins the lock, runs its pass. Tasks run independently of one another.
   */
  public async tick(): Promise<void> {
    if (this.#shutdown.signal.aborted) {
      return;
    }
    await Promise.all(
      this.#tasks.map(async (task) => {
        const running = this.#inFlight.get(task.name);
        if (running !== undefined) {
          return;
        }
        const pass = this.#tickTask(task).finally(() => {
          this.#inFlight.delete(task.name);
        });
        this.#inFlight.set(task.name, pass);
        await pass;
      }),
    );
  }

  async #tickTask(task: AccountingTask): Promise<void> {
    const now = this.#now();
    if (task.run === undefined) {
      const skippedAt = this.#skippedAt.get(task.name);
      if (skippedAt === undefined || now - skippedAt >= task.intervalMilliseconds) {
        this.#skippedAt.set(task.name, now);
        this.#metrics.storageAccountingPasses.add(1, {
          'tau.storage.accounting.task': task.name,
          outcome: 'skipped',
        });
      }
      return;
    }
    const lockMilliseconds = Math.min(task.intervalMilliseconds, maximumLockMilliseconds);
    try {
      const shared = await this.#store.read(task.name);
      const local = this.#snapshots.get(task.name);
      /* Never step back: a pass whose figures this Machine could not share is newer than the store's. */
      if (shared !== undefined && (local === undefined || shared.computedAt > local.computedAt)) {
        this.#snapshots.set(task.name, shared);
      }
      const latest = this.#snapshots.get(task.name);
      const due = latest === undefined || now - latest.computedAt >= task.intervalMilliseconds;
      if (!due || !(await this.#store.claim(task.name, lockMilliseconds))) {
        return;
      }
    } catch (error) {
      /* Without the store no Machine can be elected; the local figures stay and age into the stale rule. */
      this.#logger.warn({ err: error, task: task.name }, 'The storage accounting store could not be reached');
      return;
    }
    let figures: AccountingFigures;
    const deadline = new AbortController();
    const deadlineTimer = setTimeout(
      () => {
        deadline.abort(new Error(`The ${task.name} pass passed its deadline`));
      },
      Math.max(lockMilliseconds - deadlineMarginMilliseconds, lockMilliseconds / 2),
    );
    try {
      figures = await runUntilAborted(task.run, AbortSignal.any([this.#shutdown.signal, deadline.signal]));
    } catch (error) {
      if (this.#shutdown.signal.aborted) {
        return;
      }
      this.#metrics.storageAccountingPasses.add(1, {
        'tau.storage.accounting.task': task.name,
        outcome: 'error',
      });
      this.#logger.warn({ err: error, task: task.name }, 'A storage accounting pass failed');
      return;
    } finally {
      clearTimeout(deadlineTimer);
    }
    const snapshot: AccountingSnapshot = { computedAt: this.#now(), figures };
    this.#snapshots.set(task.name, snapshot);
    this.#metrics.storageAccountingPasses.add(1, {
      'tau.storage.accounting.task': task.name,
      outcome: 'ok',
    });
    try {
      await this.#store.write(task.name, snapshot);
    } catch (error) {
      this.#logger.warn({ err: error, task: task.name }, 'A storage accounting pass could not share its figures');
    }
  }

  #observe(gauge: AccountingGauge, result: ObservableResult): void {
    const now = this.#now();
    for (const task of this.#tasks) {
      const snapshot = this.#snapshots.get(task.name);
      if (snapshot === undefined || now - snapshot.computedAt > staleIntervals * task.intervalMilliseconds) {
        continue;
      }
      for (const observation of snapshot.figures[gauge] ?? []) {
        result.observe(observation.value, observation.attributes as Readonly<Record<string, string>>);
      }
    }
  }
}
