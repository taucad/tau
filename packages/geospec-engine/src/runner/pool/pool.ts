/**
 * The host-agnostic worker pool (R3).
 *
 * The pool owns scheduling and nothing else: it never executes geometry, never
 * inspects a verdict, and never decides anything a serial run would decide
 * differently. Its contract with correctness is one sentence — **a pooled run
 * and a serial run produce the same results outside durations** — and three
 * rules keep it true:
 *
 * - **A failed shard is never retried** (A11). Retrying is how a reward
 *   function learns to hide nondeterminism: the second attempt passes, the
 *   suite goes green, and the flake becomes invisible. A shard that fails,
 *   fails.
 * - **Telemetry is a hint.** Every scheduling input (durations, memory class,
 *   affinity) has a defined answer when it is missing, and the missing answer
 *   is a correct run in declared order.
 * - **The wire is data.** Live subjects and code strings are elided by
 *   {@link import('#runner/pool/transport.js').sanitizePoolResult} before a
 *   result is posted; workers share warm evidence through the
 *   content-addressed cache, never through messages.
 *
 * A worker that dies mid-shard fails that shard (an infrastructure failure is
 * still a failure) and is not respawned: the remaining workers drain the queue.
 *
 * @module
 */

import type {
  GeoSpecPoolShard,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunner,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from 'geospec/runner/worker';
import { createNoMatchingGeoSpecTestsIssue } from 'geospec/runner/worker';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type { ShardTimings } from '#cache/timings.js';
import type { GeoSpecRunResult } from '#runner/types.js';
import { accumulateFileResult } from '#runner/serial.js';
import { createRunnerEventChannel } from '#runner/events.js';
import type { RunnerIssue } from '#runner/serial.js';
import type { PlannedShard } from '#runner/pool/shard-planner.js';
import { filesToSplit, planShards, selectShard } from '#runner/pool/shard-planner.js';

/**
 * Everything the pool needs that differs between Node and the browser.
 *
 * @public
 */
export type GeoSpecPoolOptions = {
  /** Spawn one worker running `startGeoSpecPoolWorkerHost`. */
  createWorker: () => GeoSpecPoolWorkerHandle | Promise<GeoSpecPoolWorkerHandle>;
  /** Optional one-time worker initialization performed after its ready signal. */
  initializeWorker?: (worker: GeoSpecPoolWorkerHandle) => Promise<void> | void;
  /** Worker count. Omit to let the caller's host auto-size before calling. */
  workers: number;
  /** Optional scheduling telemetry. Absent = declared order, no memory class. */
  timings?: ShardTimings;
  /** Per-shard non-verdict watchdog, milliseconds (R11). */
  shardTimeout?: number;
  /** Split files whose recorded duration exceeds this. Milliseconds. */
  splitThreshold?: number;
};

const shardTimeoutIssue = (file: string, shardWatchdog: number): RunnerIssue => ({
  code: 'GEOSPEC_SHARD_TIMEOUT',
  message: `GeoSpec shard '${file}' exceeded the ${shardWatchdog} ms non-verdict watchdog and its worker was terminated: infrastructure failure, not a geometry verdict.`,
  severity: 'error',
  type: 'runtime',
});

const shardErrorResult = (message: string): GeoSpecRunResult => ({
  success: false,
  issues: [{ code: 'GEOSPEC_SHARD_FAILED', message, severity: 'error', type: 'runtime' }],
});

type PoolWorker = {
  handle: GeoSpecPoolWorkerHandle;
  /** The last deterministic model-load key this worker resolved (R9). */
  loadKey?: string;
  busy: boolean;
  dead: boolean;
  initialized: boolean;
};

/**
 * One worker's message stream reduced to the settlements the pool waits on.
 * A worker exits mid-shard exactly as often as an OCCT module runs out of
 * memory, so the exit listener is a real path, not a defensive one.
 */
type ShardSettlement =
  | { type: 'complete'; message: Extract<GeoSpecPoolWorkerMessage, { type: 'shard-complete' }> }
  | { type: 'listed'; names: string[] }
  | { type: 'error'; message: string }
  /** The non-verdict watchdog fired and the worker was terminated (R11). */
  | { type: 'timeout'; message: string };

const createWorkerChannel = (
  handle: GeoSpecPoolWorkerHandle,
  emitForensic: (event: Extract<GeoSpecPoolWorkerMessage, { type: 'forensic' }>) => void,
): { settle: (shardId: number) => Promise<ShardSettlement>; ready: Promise<void>; initialized: Promise<void> } => {
  let pending: ((settlement: ShardSettlement) => void) | undefined;
  let exited: string | undefined;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let resolveInitialized: (() => void) | undefined;
  let rejectInitialized: ((error: Error) => void) | undefined;
  const initialized = new Promise<void>((resolve, reject) => {
    resolveInitialized = resolve;
    rejectInitialized = reject;
  });

  const deliver = (settlement: ShardSettlement): void => {
    const resolve = pending;
    pending = undefined;
    resolve?.(settlement);
  };

  handle.onMessage((message) => {
    switch (message.type) {
      case 'ready': {
        resolveReady?.();
        break;
      }
      case 'initialized': {
        resolveInitialized?.();
        break;
      }
      case 'initialization-error': {
        rejectInitialized?.(new Error(message.message));
        break;
      }
      case 'shard-complete': {
        deliver({ type: 'complete', message });
        break;
      }
      case 'tests-listed': {
        deliver({ type: 'listed', names: message.names });
        break;
      }
      case 'shard-error':
      case 'list-error': {
        deliver({ type: 'error', message: message.message });
        break;
      }
      case 'forensic': {
        emitForensic(message);
        break;
      }
      // `file-start` is progress, not a settlement.
      default:
    }
  });

  handle.onExit((details) => {
    exited = details.message ?? 'the pool worker exited unexpectedly';
    resolveReady?.();
    if (details.unexpected) {
      deliver({ type: 'error', message: exited });
    }
  });

  return {
    ready,
    initialized,
    settle: async (_shardId: number) =>
      exited === undefined
        ? new Promise<ShardSettlement>((resolve) => {
            pending = resolve;
          })
        : { type: 'error', message: exited },
  };
};

/**
 * Create the host-agnostic pool runner.
 *
 * @param options - Worker factory, worker count, telemetry and event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecPoolRunner = (options: GeoSpecPoolOptions): GeoSpecRunner => {
  const state: { closed: boolean; aborted?: string } = { closed: false };
  // Read through an accessor: control-flow analysis would otherwise narrow the
  // closure-written field to `undefined` after the `delete` in `run`.
  const abortedReason = (): string | undefined => state.aborted;
  const workers: PoolWorker[] = [];
  const channels = new WeakMap<GeoSpecPoolWorkerHandle, ReturnType<typeof createWorkerChannel>>();
  const events = createRunnerEventChannel();

  const spawn = async (count: number): Promise<void> => {
    while (workers.length < count) {
      // oxlint-disable-next-line no-await-in-loop -- Workers are spawned one at a time so a failure to spawn the third does not orphan the first two.
      const handle = await options.createWorker();
      channels.set(
        handle,
        createWorkerChannel(handle, ({ shardId, name, value, unit }) => {
          events.emit({ type: 'forensic', shardId, name, value, unit });
        }),
      );
      workers.push({ handle, busy: false, dead: false, initialized: false });
    }
  };

  /**
   * Run one message round-trip under the non-verdict watchdog (R11).
   *
   * @param worker - The worker to drive.
   * @param send - Posts the host message.
   * @param shard - The shard the message is about.
   * @returns How the round-trip settled.
   */
  const roundTrip = async (worker: PoolWorker, send: () => void, shard: GeoSpecPoolShard): Promise<ShardSettlement> => {
    const channel = channels.get(worker.handle)!;
    const settlement = channel.settle(shard.id);
    send();
    if (options.shardTimeout === undefined) {
      return settlement;
    }
    const shardWatchdog = options.shardTimeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdogExpiry = new Promise<ShardSettlement>((resolve) => {
      timer = setTimeout(() => {
        resolve({ type: 'timeout', message: shardTimeoutIssue(shard.file, shardWatchdog).message });
      }, shardWatchdog);
    });
    try {
      const settled = await Promise.race([settlement, watchdogExpiry]);
      if (settled.type === 'timeout') {
        // A worker that missed the watchdog is not trusted with another shard.
        worker.dead = true;
        await worker.handle.terminate();
      }
      return settled;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      if (state.closed) {
        return {
          success: false,
          passed: 0,
          failed: 1,
          selectedTests: 0,
          files: [],
          issues: [
            { code: 'GEOSPEC_RUNNER_CLOSED', message: 'GeoSpec runner is closed.', severity: 'error', type: 'runtime' },
          ],
        };
      }
      delete state.aborted;

      const files = runOptions.files.map(assertRootedPath);
      const runStartedAt = performance.now();
      events.emit({ type: 'run-start', files });

      await spawn(Math.max(1, options.workers));
      await Promise.all(workers.map(async (worker) => channels.get(worker.handle)!.ready));
      if (options.initializeWorker) {
        await Promise.all(
          workers.map(async (worker) => {
            if (worker.initialized) {
              return;
            }
            const channel = channels.get(worker.handle)!;
            await options.initializeWorker!(worker.handle);
            await channel.initialized;
            worker.initialized = true;
          }),
        );
      }

      const totals = { passed: 0, failed: 0, selectedTests: 0 };
      const fileResults: GeoSpecRunnerResult['files'] = [];
      const issues: RunnerIssue[] = [];

      // R3 splitting: only a file that telemetry says is long enough to be the
      // critical path pays the extra list-only pass.
      const splitTests = new Map<string, readonly string[]>();
      const candidates =
        files.length < workers.length
          ? [...new Set([...files, ...filesToSplit(files, options.timings, options.splitThreshold)])]
          : filesToSplit(files, options.timings, options.splitThreshold);
      for (const [index, file] of candidates.entries()) {
        const worker = workers[index % workers.length]!;
        const shard: GeoSpecPoolShard = { id: -1 - index, file };
        // oxlint-disable-next-line no-await-in-loop -- The collection pass is cheap and its results decide the plan; running it serially keeps the plan deterministic.
        const settled = await roundTrip(
          worker,
          () => {
            worker.handle.postMessage({
              type: 'list-tests',
              shardId: shard.id,
              file,
              ...(runOptions.testTimeout === undefined ? {} : { testTimeout: runOptions.testTimeout }),
              ...(runOptions.matcherWallBackstop === undefined
                ? {}
                : { matcherWallBackstop: runOptions.matcherWallBackstop }),
              ...(runOptions.forensic === undefined ? {} : { forensic: runOptions.forensic }),
            });
          },
          shard,
        );
        if (settled.type === 'listed' && settled.names.length > 1) {
          splitTests.set(file, settled.names);
        }
        // A failed collection pass is not a failure: the file simply runs whole.
      }

      const pending = planShards({
        files,
        splitTests,
        ...(options.timings ? { timings: options.timings } : {}),
      });
      const perFile = new Map<string, { result: GeoSpecRunResult; durationMs: number }>();
      let heavyRunning = 0;

      const drain = async (worker: PoolWorker): Promise<void> => {
        while (!worker.dead) {
          if (abortedReason() !== undefined) {
            return;
          }
          const index = selectShard({ pending, workerLoadKey: worker.loadKey, heavyRunning });
          if (index === undefined) {
            return;
          }
          const [shard] = pending.splice(index, 1) as [PlannedShard];
          if (shard.memoryClass === 'heavy') {
            heavyRunning += 1;
          }
          worker.busy = true;
          events.emit({ type: 'file-start', file: shard.file });
          const startedAt = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- One worker runs one shard at a time by construction; concurrency is across workers.
          const settled = await roundTrip(
            worker,
            () => {
              worker.handle.postMessage({
                type: 'run-shard',
                shard: {
                  id: shard.id,
                  file: shard.file,
                  ...(shard.testNamePattern === undefined ? {} : { testNamePattern: shard.testNamePattern }),
                },
                ...(runOptions.testNamePattern === undefined
                  ? {}
                  : { testNamePattern: String(runOptions.testNamePattern) }),
                ...(runOptions.testTimeout === undefined ? {} : { testTimeout: runOptions.testTimeout }),
                ...(runOptions.matcherWallBackstop === undefined
                  ? {}
                  : { matcherWallBackstop: runOptions.matcherWallBackstop }),
                ...(runOptions.forensic === undefined ? {} : { forensic: runOptions.forensic }),
              });
            },
            shard,
          );
          const durationMs = performance.now() - startedAt;
          worker.busy = false;
          if (shard.memoryClass === 'heavy') {
            heavyRunning -= 1;
          }

          // FAILED SHARDS ARE NEVER RETRIED (A11).
          const result =
            settled.type === 'complete'
              ? settled.message.result
              : shardErrorResult(
                  settled.type === 'listed' ? 'the pool worker answered a shard with a test list' : settled.message,
                );
          if (settled.type === 'complete') {
            worker.loadKey = settled.message.primaryLoadKey ?? worker.loadKey;
            options.timings?.record(shard.timingKey, {
              durationMs: settled.message.durationMs,
              peakRssBytes: settled.message.workerMemoryBytes ?? 0,
            });
          }
          if (settled.type === 'timeout') {
            issues.push({
              code: 'GEOSPEC_SHARD_TIMEOUT',
              message: settled.message,
              severity: 'error',
              type: 'runtime',
            });
          }

          const previous = perFile.get(shard.file);
          perFile.set(shard.file, {
            result: previous === undefined ? result : mergeShardResults(previous.result, result),
            durationMs: (previous?.durationMs ?? 0) + durationMs,
          });
          events.emit({
            type: 'file-complete',
            file: shard.file,
            result,
            durationMs,
            ...(settled.type === 'complete' && settled.message.primaryLoadKey !== undefined
              ? { primaryLoadKey: settled.message.primaryLoadKey }
              : {}),
            ...(settled.type === 'complete' && settled.message.workerMemoryBytes !== undefined
              ? { workerMemoryBytes: settled.message.workerMemoryBytes }
              : {}),
          });

          // Bail means "stop at the first RED", and a file that executed
          // cleanly with a failing test inside it is red — the same reading
          // the serial shell uses.
          const shardFailed = result.success ? result.tests.some((test) => test.status === 'failed') : true;
          if (runOptions.bail === true && shardFailed) {
            pending.length = 0;
            return;
          }
        }
      };

      await Promise.all(workers.map(async (worker) => drain(worker)));
      options.timings?.save();

      const abortReason = abortedReason();
      if (abortReason !== undefined) {
        issues.push({
          code: 'GEOSPEC_RUNNER_ABORTED',
          message: abortReason.length > 0 ? `GeoSpec run aborted: ${abortReason}` : 'GeoSpec run aborted.',
          severity: 'error',
          type: 'runtime',
        });
        totals.failed += 1;
        events.emit({ type: 'abort', reason: abortReason });
      }

      // Results are reported in DECLARED file order, never completion order:
      // the schedule must not be visible in the output.
      for (const file of files) {
        const entry = perFile.get(file);
        if (entry === undefined) {
          continue;
        }
        fileResults.push({ file, result: entry.result, durationMs: entry.durationMs });
        accumulateFileResult(totals, entry.result);
      }

      if (totals.selectedTests === 0 && totals.failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        totals.failed += 1;
      }

      const aggregate: GeoSpecRunnerResult = {
        success: totals.failed === 0 && issues.length === 0,
        passed: totals.passed,
        failed: totals.failed,
        selectedTests: totals.selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
      };
      events.emit({ type: 'run-complete', result: aggregate });
      return aggregate;
    },

    on: events.on,

    abort(reason?: string): void {
      state.aborted = reason ?? 'requested';
    },

    async close(): Promise<void> {
      if (state.closed) {
        return;
      }
      state.closed = true;
      for (const worker of workers) {
        worker.handle.postMessage({ type: 'shutdown' });
      }
      await Promise.all(workers.map(async (worker) => worker.handle.terminate()));
      workers.length = 0;
      events.emit({ type: 'close' });
      events.clear();
    },
  };
};

/**
 * Fold a split file's per-test shard results back into one file result.
 *
 * Concatenating the test lists is what makes a split file byte-comparable to
 * the same file run whole: the tests keep their own recorded order, and a
 * shard that failed to execute keeps the whole file failed.
 *
 * @param left - The file result so far.
 * @param right - The next shard's result.
 * @returns The merged result.
 * @public
 */
export const mergeShardResults = (left: GeoSpecRunResult, right: GeoSpecRunResult): GeoSpecRunResult => {
  if (!left.success) {
    return left;
  }
  if (!right.success) {
    return right;
  }
  return {
    success: true,
    passed: left.passed && right.passed,
    tests: [...left.tests, ...right.tests],
    bundle: left.bundle,
  };
};
