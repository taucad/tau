/**
 * Host-agnostic GeoSpec worker-pool runner (R3).
 *
 * Implements the public `GeoSpecRunner` contract over a set of pool workers,
 * each hosting today's serial engine unchanged. Shards are
 * `(file, testNamePattern?)` work units: default one per file; a file whose
 * recorded wall exceeds the split threshold is split per test via a list-only
 * collection pass (flow-paths' independent 120 s floods spread across the
 * pool — R6 move 1). Scheduling is longest-first with subject affinity (R9)
 * and memory-class caps (R15). Results are reassembled and reported in the
 * caller's file order with tests in registration order — byte-comparable to
 * the serial runner outside duration fields: verdicts are
 * scheduling-independent by construction (R13 work-unit budgets).
 *
 * Failure containment (R11): each shard runs under a non-verdict wall
 * watchdog; on expiry (or a worker crash) the worker is thread-terminated,
 * the shard fails with a structured infrastructure issue, a fresh worker is
 * spawned, and the run continues. Failed shards are never retried — a reward
 * function must not mask nondeterminism (A11).
 */

import type { GeoSpecFileTiming } from '#cache/timings.js';
import type {
  GeoSpecPoolShard,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
} from '#runner/pool/pool-messages.js';
import { pickNextShardIndex, planShards, resolveGlbClassCap, resolvePoolSize } from '#runner/pool/shard-planner.js';
import type { GeoSpecShardPlanEntry } from '#runner/pool/shard-planner.js';
import { countRunnerTests } from '#runner/worker/serial-runner.js';
import { createNoMatchingGeoSpecTestsIssue } from '#runner/worker/no-matching-tests-issue.js';
import type {
  GeoSpecRunner,
  GeoSpecRunnerEvent,
  GeoSpecRunnerFileResult,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from '#runner/worker/runner-types.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';
import type { VmIssue } from '@taucad/vm';

/** Non-verdict per-shard wall watchdog (R11). Generous: infrastructure bound, never a proof verdict. */
const defaultShardTimeout = 900_000;

/** Recorded wall above which a file is split into per-test shards (OQ1). */
const defaultSplitThreshold = 60_000;

export type CreateGeoSpecPoolRunnerOptions = {
  /**
   * Read recorded per-file telemetry for the scheduler (platform-injected:
   * Node reads the cache root; browser hosts may omit it — the planner
   * degrades to static heuristics).
   */
  readTimings?: () => Promise<Record<string, GeoSpecFileTiming>>;
  /** Spawn one pool worker; called for initial fill and R11 respawns. */
  spawnWorker: () => Promise<GeoSpecPoolWorkerHandle> | GeoSpecPoolWorkerHandle;
  /** Explicit worker count; undefined = R15 auto-sizing. */
  workers?: number;
  /** Host CPU capacity (Node: `process.availableParallelism()`; browser: `hardwareConcurrency`). */
  availableParallelism: number;
  /** Host memory budget in bytes (Node: `constrainedMemory() || totalmem()`). */
  availableMemoryBytes: number;
  /** Project-relative label used as the telemetry key (matches the CLI's). */
  fileLabel: (file: string) => string;
  /** Observe lifecycle events (streamed as shards progress). */
  onEvent?: (event: GeoSpecRunnerEvent) => void;
  /** Per-shard wall watchdog override, milliseconds. */
  shardTimeout?: number;
  /** Per-test split threshold override, milliseconds. */
  splitThreshold?: number;
};

const shardTimeoutIssue = (file: string, budget: number): VmIssue => ({
  code: 'GEOSPEC_SHARD_TIMEOUT',
  message: `GeoSpec pool shard for ${file} exceeded the ${budget} ms non-verdict watchdog and its worker was terminated (infrastructure failure, not a geometry verdict).`,
  severity: 'error',
  type: 'runtime',
});

const shardCrashIssue = (file: string, detail: string | undefined): VmIssue => ({
  code: 'GEOSPEC_SHARD_CRASHED',
  message: `GeoSpec pool worker crashed while running ${file}${detail ? `: ${detail}` : ''}. The shard failed and the pool continued on a fresh worker.`,
  severity: 'error',
  type: 'runtime',
});

const shardAbortedIssue = (file: string, reason: string | undefined): VmIssue => ({
  code: 'GEOSPEC_RUNNER_ABORTED',
  message: `GeoSpec pool shard for ${file} was aborted${reason ? `: ${reason}` : ''}.`,
  severity: 'error',
  type: 'runtime',
});

const runnerClosedIssue = (): VmIssue => ({
  code: 'GEOSPEC_RUNNER_CLOSED',
  message: 'GeoSpec runner is closed.',
  severity: 'error',
  type: 'runtime',
});

const bailIssue = (file: string): VmIssue => ({
  code: 'GEOSPEC_RUNNER_BAILED',
  message: `GeoSpec run stopped after first failure (--bail): ${file}. Remaining files were not executed.`,
  severity: 'error',
  type: 'runtime',
});

type ShardOutcome = {
  entry: GeoSpecShardPlanEntry;
  result: GeoSpecRunResult;
  durationMs?: number;
  primaryLoadKey?: string;
  workerMemoryBytes?: number;
};

type PoolWorkerState = {
  handle: GeoSpecPoolWorkerHandle;
  seenKeys: Set<string>;
  busyWith?: {
    shard: GeoSpecPoolShard;
    entry: GeoSpecShardPlanEntry;
    watchdog: ReturnType<typeof setTimeout>;
    startedAt: number;
  };
  closed: boolean;
};

const readPositiveEnvironmentNumber = (name: string): number | undefined => {
  if (typeof process === 'undefined' || typeof process.env !== 'object') {
    return undefined;
  }
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
};

const escapeRegExp = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const outcomeHasFailure = (outcome: ShardOutcome): boolean =>
  !outcome.result.success || outcome.result.tests.some((test) => test.status === 'failed');

/**
 * Reassemble one file's result from its (possibly split) shard outcomes:
 * tests in registration order, durations summed, worst memory reading kept.
 */
const assembleFileResult = (
  file: string,
  parts: readonly ShardOutcome[],
  listedOrder: readonly string[] | undefined,
): GeoSpecRunnerFileResult => {
  if (parts.length === 1 && parts[0] && listedOrder === undefined) {
    const only = parts[0];
    return {
      file,
      result: only.result,
      ...(only.durationMs === undefined ? {} : { durationMs: only.durationMs }),
      ...(only.primaryLoadKey === undefined ? {} : { primaryLoadKey: only.primaryLoadKey }),
      ...(only.workerMemoryBytes === undefined ? {} : { workerMemoryBytes: only.workerMemoryBytes }),
    };
  }
  const failed = parts.filter((part) => !part.result.success);
  let durationMs = 0;
  let workerMemoryBytes: number | undefined;
  for (const part of parts) {
    durationMs += part.durationMs ?? 0;
    if (part.workerMemoryBytes !== undefined) {
      workerMemoryBytes = Math.max(workerMemoryBytes ?? 0, part.workerMemoryBytes);
    }
  }
  const primaryLoadKey = parts.find((part) => part.primaryLoadKey !== undefined)?.primaryLoadKey;
  if (failed.length > 0) {
    return {
      file,
      result: {
        success: false,
        issues: failed.flatMap((part) => (part.result.success ? [] : part.result.issues)),
      },
      durationMs,
      ...(primaryLoadKey === undefined ? {} : { primaryLoadKey }),
      ...(workerMemoryBytes === undefined ? {} : { workerMemoryBytes }),
    };
  }
  const byFullName = new Map<string, GeoSpecTestCase>();
  const unordered: GeoSpecTestCase[] = [];
  for (const part of parts) {
    if (!part.result.success) {
      continue;
    }
    for (const test of part.result.tests) {
      const fullName = [...test.suite, test.name].join(' > ');
      if (byFullName.has(fullName)) {
        unordered.push(test);
      } else {
        byFullName.set(fullName, test);
      }
    }
  }
  const ordered: GeoSpecTestCase[] = [];
  for (const name of listedOrder ?? [...byFullName.keys()]) {
    const test = byFullName.get(name);
    if (test) {
      ordered.push(test);
      byFullName.delete(name);
    }
  }
  ordered.push(...byFullName.values(), ...unordered);
  const bundle = parts.find((part) => part.result.success)?.result;
  return {
    file,
    result: {
      success: true,
      passed: ordered.every((test) => test.status !== 'failed'),
      tests: ordered,
      bundle:
        bundle?.success === true
          ? bundle.bundle
          : { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
    },
    durationMs,
    ...(primaryLoadKey === undefined ? {} : { primaryLoadKey }),
    ...(workerMemoryBytes === undefined ? {} : { workerMemoryBytes }),
  };
};

/**
 * Create a pool runner. The serial runner remains the intra-worker engine and
 * the `--workers 1` path — this host only schedules, contains, and merges.
 *
 * @internal
 */
export const createGeoSpecPoolRunner = (options: CreateGeoSpecPoolRunnerOptions): GeoSpecRunner => {
  const state: { closed: boolean; aborted?: string } = { closed: false };
  const emit = (event: GeoSpecRunnerEvent): void => {
    options.onEvent?.(event);
  };

  return {
    async run(runOptions: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> {
      if (state.closed) {
        return { success: false, passed: 0, failed: 1, selectedTests: 0, files: [], issues: [runnerClosedIssue()] };
      }
      delete state.aborted;
      const runStartedAt = performance.now();
      const files = [...runOptions.files];
      emit({ type: 'run-start', files });

      const timings = (await options.readTimings?.()) ?? {};
      const basePlan = planShards(files, timings, options.fileLabel);
      // The pool is sized on the FINAL shard count (after per-test splitting),
      // so a single heavy file still spreads; set after the list pass below.
      let glbClassCap = 1;
      const shardTimeout =
        options.shardTimeout ?? readPositiveEnvironmentNumber('GEOSPEC_SHARD_TIMEOUT_MS') ?? defaultShardTimeout;
      const splitThreshold =
        options.splitThreshold ?? readPositiveEnvironmentNumber('GEOSPEC_SHARD_SPLIT_MS') ?? defaultSplitThreshold;
      const testNamePattern =
        runOptions.testNamePattern instanceof RegExp ? runOptions.testNamePattern.source : runOptions.testNamePattern;

      const workers: PoolWorkerState[] = [];
      const pendingListResolvers = new Map<number, (result: { names: string[] } | { error: string }) => void>();
      let nextShardId = 0;
      let runningGlbShards = 0;
      let bailed = false;
      // Accessors so control-flow analysis never narrows closure-written state
      // at the post-run read sites.
      const abortedReason = (): string | undefined => state.aborted;
      const isBailed = (): boolean => bailed;

      // Populated by the dispatch phase below.
      const pending: GeoSpecShardPlanEntry[] = [];
      const outcomes: ShardOutcome[] = [];
      /** Registration-ordered test names per split file. */
      const listedOrderByFile = new Map<string, string[]>();
      /** Remaining shard count per file (event coalescing for split files). */
      const remainingPartsByFile = new Map<string, number>();
      const startedFiles = new Set<string>();

      let settleRun: () => void = () => undefined;
      const runDone = new Promise<void>((resolve) => {
        settleRun = resolve;
      });
      // Guards the setup window: workers report ready (and could observe an
      // empty queue) before the split pass finishes populating the plan.
      let planReady = false;

      const maybeSettle = (): void => {
        if (!planReady) {
          return;
        }
        const anyBusy = workers.some((worker) => worker.busyWith !== undefined);
        if (!anyBusy && (pending.length === 0 || bailed || state.aborted !== undefined)) {
          settleRun();
        }
      };

      const emitFileCompleteIfAssembled = (file: string): void => {
        const remaining = remainingPartsByFile.get(file);
        if (remaining === undefined || remaining > 0) {
          return;
        }
        remainingPartsByFile.delete(file);
        const parts = outcomes.filter((outcome) => outcome.entry.file === file);
        const assembled = assembleFileResult(file, parts, listedOrderByFile.get(file));
        emit({
          type: 'file-complete',
          file,
          result: assembled.result,
          ...(assembled.durationMs === undefined ? {} : { durationMs: assembled.durationMs }),
          ...(assembled.primaryLoadKey === undefined ? {} : { primaryLoadKey: assembled.primaryLoadKey }),
          ...(assembled.workerMemoryBytes === undefined ? {} : { workerMemoryBytes: assembled.workerMemoryBytes }),
        });
      };

      const completeShard = (worker: PoolWorkerState, outcome: ShardOutcome): void => {
        if (!worker.busyWith) {
          return;
        }
        const { entry, watchdog } = worker.busyWith;
        clearTimeout(watchdog);
        worker.busyWith = undefined;
        if (entry.memoryClass === 'glb') {
          runningGlbShards -= 1;
        }
        if (outcome.primaryLoadKey !== undefined) {
          worker.seenKeys.add(outcome.primaryLoadKey);
        }
        outcomes.push(outcome);
        remainingPartsByFile.set(entry.file, (remainingPartsByFile.get(entry.file) ?? 1) - 1);
        emitFileCompleteIfAssembled(entry.file);
        if (runOptions.bail === true && outcomes.some((candidate) => outcomeHasFailure(candidate))) {
          bailed = true;
        }
        dispatch(worker);
        for (const idle of workers) {
          if (!idle.closed && idle.busyWith === undefined && idle !== worker) {
            dispatch(idle);
          }
        }
        maybeSettle();
      };

      const failShard = (worker: PoolWorkerState, issue: VmIssue): void => {
        if (!worker.busyWith) {
          return;
        }
        const { entry, startedAt } = worker.busyWith;
        // Record the elapsed wall on infrastructure failures too — the next
        // run's planner needs the true cost to split a watchdogged file per
        // test instead of re-timing-out forever.
        completeShard(worker, {
          entry,
          result: { success: false, issues: [issue] },
          durationMs: performance.now() - startedAt,
        });
      };

      const attachWorker = (worker: PoolWorkerState): void => {
        worker.handle.onMessage((message: GeoSpecPoolWorkerMessage) => {
          switch (message.type) {
            case 'ready': {
              dispatch(worker);
              break;
            }
            case 'file-start': {
              if (!startedFiles.has(message.file)) {
                startedFiles.add(message.file);
                emit({ type: 'file-start', file: message.file });
              }
              break;
            }
            case 'tests-listed': {
              pendingListResolvers.get(message.shardId)?.({ names: message.names });
              pendingListResolvers.delete(message.shardId);
              break;
            }
            case 'list-error': {
              pendingListResolvers.get(message.shardId)?.({ error: message.message });
              pendingListResolvers.delete(message.shardId);
              break;
            }
            case 'shard-complete': {
              if (!worker.busyWith) {
                break;
              }
              completeShard(worker, {
                entry: worker.busyWith.entry,
                result: message.result,
                durationMs: message.durationMs,
                ...(message.primaryLoadKey === undefined ? {} : { primaryLoadKey: message.primaryLoadKey }),
                ...(message.workerMemoryBytes === undefined ? {} : { workerMemoryBytes: message.workerMemoryBytes }),
              });
              break;
            }
            case 'shard-error': {
              failShard(worker, shardCrashIssue(message.file, message.message));
              break;
            }
          }
        });
        worker.handle.onExit(({ unexpected, message }) => {
          if (worker.closed || !unexpected) {
            return;
          }
          worker.closed = true;
          const hadShard = worker.busyWith !== undefined;
          failShard(worker, shardCrashIssue(worker.busyWith?.shard.file ?? 'unknown', message));
          if (hadShard && pending.length > 0 && state.aborted === undefined && !bailed) {
            // R11: respawn so remaining shards keep a full pool.
            void spawnIntoPool();
          }
          maybeSettle();
        });
      };

      const spawnIntoPool = async (): Promise<PoolWorkerState | undefined> => {
        try {
          const handle = await options.spawnWorker();
          const worker: PoolWorkerState = { handle, seenKeys: new Set(), closed: false };
          workers.push(worker);
          attachWorker(worker);
          return worker;
        } catch (error) {
          if (workers.every((worker) => worker.closed)) {
            for (const entry of pending.splice(0)) {
              outcomes.push({
                entry,
                result: {
                  success: false,
                  issues: [shardCrashIssue(entry.file, error instanceof Error ? error.message : String(error))],
                },
              });
              remainingPartsByFile.set(entry.file, (remainingPartsByFile.get(entry.file) ?? 1) - 1);
            }
            maybeSettle();
          }
          return undefined;
        }
      };

      const dispatch = (worker: PoolWorkerState): void => {
        if (worker.closed || worker.busyWith !== undefined || state.aborted !== undefined || bailed) {
          maybeSettle();
          return;
        }
        const index = pickNextShardIndex({
          pending,
          workerSeenKeys: worker.seenKeys,
          runningGlbShards,
          glbClassCap,
        });
        if (index === -1) {
          maybeSettle();
          return;
        }
        const [entry] = pending.splice(index, 1);
        if (!entry) {
          maybeSettle();
          return;
        }
        if (entry.memoryClass === 'glb') {
          runningGlbShards += 1;
        }
        const shard: GeoSpecPoolShard = {
          id: nextShardId,
          file: entry.file,
          ...(entry.testNamePattern === undefined ? {} : { testNamePattern: entry.testNamePattern }),
        };
        nextShardId += 1;
        const watchdog = setTimeout(() => {
          // R11: hard preemption — nothing else can stop a monolithic native call.
          worker.closed = true;
          void worker.handle.terminate();
          failShard(worker, shardTimeoutIssue(entry.file, shardTimeout));
          if (pending.length > 0 && state.aborted === undefined && !bailed) {
            void spawnIntoPool();
          }
          maybeSettle();
        }, shardTimeout);
        // Node timers hold the loop open without unref; browser timers have none.
        (watchdog as { unref?: () => void }).unref?.();
        worker.busyWith = { shard, entry, watchdog, startedAt: performance.now() };
        worker.handle.postMessage({
          type: 'run-shard',
          shard,
          ...(testNamePattern === undefined ? {} : { testNamePattern }),
          ...(runOptions.testTimeout === undefined ? {} : { testTimeout: runOptions.testTimeout }),
        });
      };

      // Bootstrap one worker for the list pass; the rest spawn once the final
      // shard count is known.
      await spawnIntoPool();

      // R6 move 1 / OQ1: split heavy files into per-test shards via a
      // list-only collection pass, unless a user pattern already narrows the run.
      const splitCandidates =
        testNamePattern === undefined ? basePlan.filter((entry) => (entry.durationMs ?? 0) > splitThreshold) : [];
      const listedNames = new Map<string, string[]>();
      if (splitCandidates.length > 0 && workers.length > 0) {
        await Promise.all(
          splitCandidates.map(async (entry, position) => {
            const worker = workers[position % workers.length];
            if (!worker || worker.closed) {
              return;
            }
            const listShardId = nextShardId;
            nextShardId += 1;
            const listed = await new Promise<{ names: string[] } | { error: string }>((resolve) => {
              pendingListResolvers.set(listShardId, resolve);
              worker.handle.postMessage({
                type: 'list-tests',
                shardId: listShardId,
                file: entry.file,
                ...(runOptions.testTimeout === undefined ? {} : { testTimeout: runOptions.testTimeout }),
              });
            });
            if ('names' in listed && listed.names.length > 1) {
              listedNames.set(entry.file, listed.names);
            }
            // A list failure is not a verdict: the file simply runs unsplit.
          }),
        );
      }
      for (const entry of basePlan) {
        const names = listedNames.get(entry.file);
        if (!names) {
          pending.push(entry);
          remainingPartsByFile.set(entry.file, 1);
          continue;
        }
        listedOrderByFile.set(entry.file, names);
        remainingPartsByFile.set(entry.file, names.length);
        for (const name of names) {
          pending.push({
            ...entry,
            durationMs: entry.durationMs === undefined ? undefined : entry.durationMs / names.length,
            testNamePattern: `^${escapeRegExp(name)}$`,
          });
        }
      }
      // Longest-first over the final shard list (split parts share the mean).
      pending.sort((left, right) => (right.durationMs ?? Infinity) - (left.durationMs ?? Infinity));

      // Container-correct sizing over the FINAL shard count (R15).
      const poolSize = resolvePoolSize({
        shardCount: pending.length,
        requestedWorkers: options.workers,
        availableParallelism: options.availableParallelism,
        availableMemoryBytes: options.availableMemoryBytes,
      });
      glbClassCap = resolveGlbClassCap({ poolSize, availableMemoryBytes: options.availableMemoryBytes });
      await Promise.all(Array.from({ length: Math.max(0, poolSize - workers.length) }, async () => spawnIntoPool()));

      planReady = true;
      for (const worker of workers) {
        dispatch(worker);
      }
      maybeSettle();
      await runDone;

      // Terminate workers (each holds a runtime worker + wasm heaps).
      for (const worker of workers) {
        worker.closed = true;
        clearTimeout(worker.busyWith?.watchdog);
        void worker.handle.terminate();
      }

      // Merge: aggregate in the caller's file order for a byte-stable report.
      const issues: VmIssue[] = [];
      let passed = 0;
      let failed = 0;
      let selectedTests = 0;
      const fileResults: GeoSpecRunnerResult['files'] = [];
      for (const file of files) {
        const parts = outcomes.filter((outcome) => outcome.entry.file === file);
        if (parts.length === 0) {
          const abortReason = abortedReason();
          if (abortReason !== undefined) {
            issues.push(shardAbortedIssue(file, abortReason));
            failed += 1;
          }
          // Bail: undispatched files are intentionally absent, like the serial runner.
          continue;
        }
        const assembled = assembleFileResult(file, parts, listedOrderByFile.get(file));
        fileResults.push(assembled);
        if (!assembled.result.success) {
          failed += 1;
          continue;
        }
        selectedTests += assembled.result.tests.length;
        const counts = countRunnerTests(assembled.result.tests);
        passed += counts.passed;
        failed += counts.failed;
      }
      if (isBailed()) {
        const failedFile = fileResults.find(
          (entry) => !entry.result.success || entry.result.tests.some((test) => test.status === 'failed'),
        );
        issues.push(bailIssue(failedFile?.file ?? files[0] ?? 'unknown'));
      }
      if (selectedTests === 0 && failed === 0) {
        issues.push(createNoMatchingGeoSpecTestsIssue());
        failed += 1;
      }

      const aggregate: GeoSpecRunnerResult = {
        success: failed === 0 && issues.length === 0,
        passed,
        failed,
        selectedTests,
        files: fileResults,
        ...(issues.length > 0 ? { issues } : {}),
        durationMs: performance.now() - runStartedAt,
      };
      emit({ type: 'run-complete', result: aggregate });
      return aggregate;
    },

    abort(reason?: string): void {
      state.aborted = reason ?? 'requested';
      emit({ type: 'abort', reason: state.aborted });
    },

    async close(): Promise<void> {
      if (state.closed) {
        return;
      }
      state.closed = true;
      emit({ type: 'close' });
    },
  };
};
