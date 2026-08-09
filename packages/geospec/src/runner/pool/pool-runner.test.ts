import { describe, expect, it } from 'vitest';
import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
} from '#runner/pool/pool-messages.js';
import { createGeoSpecPoolRunner } from '#runner/pool/pool-runner.js';
import { pickNextShardIndex, planShards, resolveGlbClassCap, resolvePoolSize } from '#runner/pool/shard-planner.js';
import { sanitizeRunResultForTransport } from '#runner/pool/transport.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const passingTest = (name: string): GeoSpecTestCase => ({
  suite: ['suite'],
  name,
  assertions: [],
  status: 'passed',
  diagnostics: [],
  durationMs: 1,
});

const failingTest = (name: string): GeoSpecTestCase => ({
  suite: ['suite'],
  name,
  assertions: [],
  status: 'failed',
  diagnostics: [{ code: 'X', severity: 'error', message: 'red', suggestion: 's' }],
  durationMs: 1,
});

const successResult = (tests: GeoSpecTestCase[]): GeoSpecRunResult => ({
  success: true,
  passed: tests.every((test) => test.status !== 'failed'),
  tests,
  bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
});

type FakeWorkerScript = (options: {
  message: GeoSpecPoolHostMessage;
  post: (message: GeoSpecPoolWorkerMessage) => void;
}) => void;

type FakeWorkerControls = {
  handle: GeoSpecPoolWorkerHandle;
  crash: (message: string) => void;
  terminated: () => boolean;
};

const createFakeWorker = (script: FakeWorkerScript): FakeWorkerControls => {
  const messageListeners: Array<(message: GeoSpecPoolWorkerMessage) => void> = [];
  const exitListeners: Array<(details: { unexpected: boolean; message?: string }) => void> = [];
  let isTerminated = false;
  const post = (message: GeoSpecPoolWorkerMessage): void => {
    if (isTerminated) {
      return;
    }
    for (const listener of messageListeners) {
      listener(message);
    }
  };
  const handle: GeoSpecPoolWorkerHandle = {
    postMessage(message) {
      if (isTerminated) {
        return;
      }
      queueMicrotask(() => {
        script({ message, post });
      });
    },
    onMessage(listener) {
      messageListeners.push(listener);
      queueMicrotask(() => {
        post({ type: 'ready' });
      });
    },
    onExit(listener) {
      exitListeners.push(listener);
    },
    terminate() {
      isTerminated = true;
    },
  };
  return {
    handle,
    crash(message) {
      isTerminated = true;
      for (const listener of exitListeners) {
        listener({ unexpected: true, message });
      }
    },
    terminated: () => isTerminated,
  };
};

/** A worker that completes every shard with the supplied per-file results. */
const completingScript =
  (
    resultsByFile: Record<string, GeoSpecRunResult>,
    options?: { key?: string; memoryBytes?: number },
  ): FakeWorkerScript =>
  ({ message, post }) => {
    if (message.type !== 'run-shard') {
      return;
    }
    const { shard } = message;
    post({ type: 'file-start', shardId: shard.id, file: shard.file });
    post({
      type: 'shard-complete',
      shardId: shard.id,
      file: shard.file,
      result: resultsByFile[shard.file] ?? successResult([passingTest(shard.file)]),
      durationMs: 1,
      ...(options?.key === undefined ? {} : { primaryLoadKey: options.key }),
      ...(options?.memoryBytes === undefined ? {} : { workerMemoryBytes: options.memoryBytes }),
    });
  };

const poolDefaults = {
  availableParallelism: 8,
  availableMemoryBytes: 32 * 1024 ** 3,
  fileLabel: (file: string) => file,
};

/** Build a per-file record without literal dotted property keys (naming-convention). */
const byFile = <T>(...entries: Array<[string, T]>): Record<string, T> => Object.fromEntries(entries);

describe('shard planner (R3/R9/R15)', () => {
  it('sizes the pool container-correctly: min(shards, cpus − 2, memory / 3.5 GiB)', () => {
    expect(
      resolvePoolSize({
        shardCount: 9,
        availableParallelism: 12,
        availableMemoryBytes: 32 * 1024 ** 3,
      }),
    ).toBe(9);
    expect(
      resolvePoolSize({
        shardCount: 9,
        availableParallelism: 4,
        availableMemoryBytes: 32 * 1024 ** 3,
      }),
    ).toBe(2);
    expect(
      resolvePoolSize({
        shardCount: 9,
        availableParallelism: 12,
        availableMemoryBytes: 8 * 1024 ** 3,
      }),
    ).toBe(2);
    expect(
      resolvePoolSize({
        shardCount: 9,
        requestedWorkers: 3,
        availableParallelism: 12,
        availableMemoryBytes: 32 * 1024 ** 3,
      }),
    ).toBe(3);
    // Degenerate hosts still get one worker.
    expect(resolvePoolSize({ shardCount: 4, availableParallelism: 1, availableMemoryBytes: 1024 ** 3 })).toBe(1);
  });

  it('caps concurrent GLB-class shards by the memory budget', () => {
    expect(resolveGlbClassCap({ poolSize: 9, availableMemoryBytes: 32 * 1024 ** 3 })).toBe(9);
    expect(resolveGlbClassCap({ poolSize: 9, availableMemoryBytes: 8 * 1024 ** 3 })).toBe(2);
    expect(resolveGlbClassCap({ poolSize: 2, availableMemoryBytes: 1024 ** 3 })).toBe(1);
  });

  it('plans longest-first with unknown durations first and conservative memory classes', () => {
    const plan = planShards(
      ['a.geospec.ts', 'b.geospec.ts', 'c.geospec.ts'],
      byFile(
        ['a.geospec.ts', { durationMs: 100, workerMemoryBytes: 1024 ** 3, updatedAt: 'x' }],
        ['b.geospec.ts', { durationMs: 900, workerMemoryBytes: 3 * 1024 ** 3, updatedAt: 'x' }],
      ),
      (file) => file,
    );
    expect(plan.map((entry) => entry.file)).toEqual(['c.geospec.ts', 'b.geospec.ts', 'a.geospec.ts']);
    expect(plan.map((entry) => entry.memoryClass)).toEqual(['glb', 'glb', 'brep']);
  });

  it('prefers pending shards whose load key the worker already holds (R9)', () => {
    const pending = planShards(
      ['x.geospec.ts', 'y.geospec.ts'],
      byFile(
        ['x.geospec.ts', { durationMs: 900, primaryLoadKey: 'other', workerMemoryBytes: 1, updatedAt: 'x' }],
        ['y.geospec.ts', { durationMs: 100, primaryLoadKey: 'assembly', workerMemoryBytes: 1, updatedAt: 'x' }],
      ),
      (file) => file,
    );
    const index = pickNextShardIndex({
      pending,
      workerSeenKeys: new Set(['assembly']),
      runningGlbShards: 0,
      glbClassCap: 9,
    });
    expect(pending[index]?.file).toBe('y.geospec.ts');
  });

  it('blocks GLB-class shards at the cap and falls back to BRep-class work', () => {
    const pending = planShards(
      ['glb.geospec.ts', 'brep.geospec.ts'],
      byFile(
        ['glb.geospec.ts', { durationMs: 900, workerMemoryBytes: 3 * 1024 ** 3, updatedAt: 'x' }],
        ['brep.geospec.ts', { durationMs: 100, workerMemoryBytes: 1024 ** 3, updatedAt: 'x' }],
      ),
      (file) => file,
    );
    const index = pickNextShardIndex({
      pending,
      workerSeenKeys: new Set(),
      runningGlbShards: 1,
      glbClassCap: 1,
    });
    expect(pending[index]?.file).toBe('brep.geospec.ts');
  });
});

describe('result transport (R3)', () => {
  it('strips live subjects and preserves the reporting surface', () => {
    const nativeHandle = { classifyPoints: () => 'native' };
    // REQ-V8R2-005's recorded witness: must survive transport bit-identically.
    const witnessValue = Number('0.02499999999999858');
    const result: GeoSpecRunResult = {
      success: true,
      passed: false,
      tests: [
        {
          suite: ['s'],
          name: 't',
          assertions: [
            {
              kind: 'volume',
              subject: nativeHandle,
              expected: { value: 1 },
              passed: false,
              diagnostics: [
                {
                  code: 'GEOSPEC_VOLUME_MISMATCH',
                  severity: 'error',
                  message: 'expected 1',
                  suggestion: 'fix',
                  details: { witness: witnessValue, callback: () => 'dropped' },
                },
              ],
              durationMs: 5,
            },
          ],
          status: 'failed',
          diagnostics: [],
          durationMs: 6,
        },
      ],
      bundle: { code: 'x'.repeat(1024), issues: [], success: true, dependencies: [], unresolvedPaths: [] },
    };
    const sanitized = sanitizeRunResultForTransport(result);
    expect(sanitized.success).toBe(true);
    if (!sanitized.success) {
      return;
    }
    const assertion = sanitized.tests[0]?.assertions[0];
    expect(assertion?.subject).toBeUndefined();
    expect(assertion?.durationMs).toBe(5);
    // The exact witness value survives transport bit-identically.
    const details = assertion?.diagnostics?.[0]?.details as { witness: number } | undefined;
    expect(details?.witness).toBe(witnessValue);
    expect(sanitized.bundle.code).toBe('');
    // The sanitized payload is structured-clone-safe.
    expect(() => structuredClone(sanitized)).not.toThrow();
  });
});

describe('pool runner (R3/R9/R11/R15)', () => {
  it('merges out-of-order shard completions into the caller file order with serial-identical counts', async () => {
    const files = ['a.geospec.ts', 'b.geospec.ts', 'c.geospec.ts'];
    const results: Record<string, GeoSpecRunResult> = byFile(
      ['a.geospec.ts', successResult([passingTest('one'), failingTest('two')])],
      ['b.geospec.ts', successResult([passingTest('three')])],
      ['c.geospec.ts', successResult([passingTest('four'), passingTest('five')])],
    );
    const events: string[] = [];
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 2,
      spawnWorker: () => createFakeWorker(completingScript(results)).handle,
      onEvent: (event) => {
        events.push(event.type);
      },
    });
    const aggregate = await runner.run({ files });
    expect(aggregate.files.map((entry) => entry.file)).toEqual(files);
    expect(aggregate.passed).toBe(4);
    expect(aggregate.failed).toBe(1);
    expect(aggregate.selectedTests).toBe(5);
    expect(aggregate.success).toBe(false);
    expect(aggregate.durationMs).toBeGreaterThanOrEqual(0);
    expect(events[0]).toBe('run-start');
    expect(events.at(-1)).toBe('run-complete');
    expect(events.filter((type) => type === 'file-complete')).toHaveLength(3);
    await runner.close();
  });

  it('terminates a hung shard at the watchdog, fails it as infrastructure, respawns, and continues (R11)', async () => {
    const hangs = new Set(['hang.geospec.ts']);
    const spawned: FakeWorkerControls[] = [];
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 1,
      shardTimeout: 40,
      spawnWorker: () => {
        const worker = createFakeWorker(({ message, post }) => {
          if (message.type !== 'run-shard') {
            return;
          }
          if (hangs.has(message.shard.file)) {
            post({ type: 'file-start', shardId: message.shard.id, file: message.shard.file });
            return; // Never completes: a monolithic native call nothing can preempt.
          }
          completingScript({})({ message, post });
        });
        spawned.push(worker);
        return worker.handle;
      },
    });
    const aggregate = await runner.run({ files: ['hang.geospec.ts', 'ok.geospec.ts'] });
    const hung = aggregate.files.find((entry) => entry.file === 'hang.geospec.ts');
    expect(hung?.result.success).toBe(false);
    if (hung && !hung.result.success) {
      expect(hung.result.issues[0]?.code).toBe('GEOSPEC_SHARD_TIMEOUT');
      expect(hung.result.issues[0]?.message).toContain('infrastructure failure');
    }
    const ok = aggregate.files.find((entry) => entry.file === 'ok.geospec.ts');
    expect(ok?.result.success).toBe(true);
    expect(spawned.length).toBeGreaterThanOrEqual(2); // R11 respawn happened.
    expect(spawned[0]?.terminated()).toBe(true); // Hard thread-terminate, not cooperation.
    expect(aggregate.failed).toBeGreaterThanOrEqual(1);
    await runner.close();
  });

  it('fails the in-flight shard and continues on a fresh worker after a crash', async () => {
    let crashed = false;
    const spawned: FakeWorkerControls[] = [];
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 1,
      spawnWorker: () => {
        const worker = createFakeWorker(({ message, post }) => {
          if (message.type !== 'run-shard') {
            return;
          }
          if (!crashed && message.shard.file === 'boom.geospec.ts') {
            crashed = true;
            worker.crash('wasm heap OOM');
            return;
          }
          completingScript({})({ message, post });
        });
        spawned.push(worker);
        return worker.handle;
      },
    });
    const aggregate = await runner.run({ files: ['boom.geospec.ts', 'ok.geospec.ts'] });
    const boom = aggregate.files.find((entry) => entry.file === 'boom.geospec.ts');
    expect(boom?.result.success).toBe(false);
    if (boom && !boom.result.success) {
      expect(boom.result.issues[0]?.code).toBe('GEOSPEC_SHARD_CRASHED');
      expect(boom.result.issues[0]?.message).toContain('wasm heap OOM');
    }
    expect(aggregate.files.find((entry) => entry.file === 'ok.geospec.ts')?.result.success).toBe(true);
    expect(spawned.length).toBe(2);
    await runner.close();
  });

  it('stops dispatching after the first failure with bail and reports the bail issue', async () => {
    const results: Record<string, GeoSpecRunResult> = byFile(['a.geospec.ts', successResult([failingTest('red')])]);
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 1,
      spawnWorker: () => createFakeWorker(completingScript(results)).handle,
    });
    const aggregate = await runner.run({ files: ['a.geospec.ts', 'z.geospec.ts'], bail: true });
    expect(aggregate.files.map((entry) => entry.file)).toEqual(['a.geospec.ts']);
    expect(aggregate.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED')).toBe(true);
    await runner.close();
  });

  it('reports undispatched shards as aborted after abort()', async () => {
    let firstDispatched: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      firstDispatched = resolve;
    });
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 1,
      spawnWorker: () =>
        createFakeWorker(({ message, post }) => {
          if (message.type !== 'run-shard') {
            return;
          }
          firstDispatched?.();
          firstDispatched = undefined;
          setTimeout(() => {
            completingScript({})({ message, post });
          }, 10);
        }).handle,
    });
    const runPromise = runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await gate;
    runner.abort('user request');
    const aggregate = await runPromise;
    expect(aggregate.success).toBe(false);
    expect(aggregate.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_ABORTED')).toBe(true);
    await runner.close();
  });

  it('routes same-key shards to the worker that already loaded that subject (R9)', async () => {
    const dispatchLog: Array<{ worker: number; file: string }> = [];
    let workerOrdinal = 0;
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 2,
      readTimings: async () =>
        byFile(
          [
            'shared-1.geospec.ts',
            { durationMs: 300, primaryLoadKey: 'assembly', workerMemoryBytes: 1, updatedAt: 'x' },
          ],
          ['other.geospec.ts', { durationMs: 200, primaryLoadKey: 'part', workerMemoryBytes: 1, updatedAt: 'x' }],
          [
            'shared-2.geospec.ts',
            { durationMs: 100, primaryLoadKey: 'assembly', workerMemoryBytes: 1, updatedAt: 'x' },
          ],
        ),
      spawnWorker: () => {
        const ordinal = workerOrdinal;
        workerOrdinal += 1;
        return createFakeWorker(({ message, post }) => {
          if (message.type !== 'run-shard') {
            return;
          }
          dispatchLog.push({ worker: ordinal, file: message.shard.file });
          const key = message.shard.file.startsWith('shared') ? 'assembly' : 'part';
          setTimeout(() => {
            completingScript({}, { key })({ message, post });
          }, 5);
        }).handle;
      },
    });
    const aggregate = await runner.run({
      files: ['shared-1.geospec.ts', 'other.geospec.ts', 'shared-2.geospec.ts'],
    });
    expect(aggregate.success).toBe(true);
    const sharedWorkers = new Set(
      dispatchLog.filter((entry) => entry.file.startsWith('shared')).map((entry) => entry.worker),
    );
    // Both assembly-key shards ran on the same worker (subject/ledger reuse).
    expect(sharedWorkers.size).toBe(1);
    await runner.close();
  });

  it('splits a heavy file into per-test shards and reassembles tests in registration order (R6 move 1)', async () => {
    const listedNames = ['floods > tract A', 'floods > tract B', 'floods > tract C'];
    const shardPatterns: string[] = [];
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 2,
      splitThreshold: 100,
      readTimings: async () =>
        byFile(['flow-paths.geospec.ts', { durationMs: 900_000, workerMemoryBytes: 1, updatedAt: 'x' }]),
      spawnWorker: () =>
        createFakeWorker(({ message, post }) => {
          if (message.type === 'list-tests') {
            post({ type: 'tests-listed', shardId: message.shardId, file: message.file, names: listedNames });
            return;
          }
          if (message.type !== 'run-shard') {
            return;
          }
          const pattern = message.shard.testNamePattern;
          if (pattern !== undefined) {
            shardPatterns.push(pattern);
          }
          const matched = listedNames.filter((name) => new RegExp(pattern ?? '.', 'u').test(name));
          post({ type: 'file-start', shardId: message.shard.id, file: message.shard.file });
          post({
            type: 'shard-complete',
            shardId: message.shard.id,
            file: message.shard.file,
            result: successResult(
              matched
                .map((name) => passingTest(name.split(' > ')[1] ?? name))
                .map((test, index) => ({
                  ...test,
                  suite: ['floods'],
                  name: matched[index]!.split(' > ')[1]!,
                })),
            ),
            durationMs: 1,
          });
        }).handle,
    });
    const aggregate = await runner.run({ files: ['flow-paths.geospec.ts'] });
    expect(aggregate.success).toBe(true);
    expect(shardPatterns).toHaveLength(3); // One exact-pattern shard per test.
    expect(aggregate.files).toHaveLength(1);
    const { result } = aggregate.files[0]!;
    expect(result.success).toBe(true);
    if (result.success) {
      // Registration order preserved across out-of-order shard completion.
      expect(result.tests.map((test) => test.name)).toEqual(['tract A', 'tract B', 'tract C']);
    }
    expect(aggregate.passed).toBe(3);
    await runner.close();
  });

  it('fails the whole run with the no-matching-tests issue when zero tests were selected', async () => {
    const runner = createGeoSpecPoolRunner({
      ...poolDefaults,
      workers: 1,
      spawnWorker: () => createFakeWorker(completingScript(byFile(['a.geospec.ts', successResult([])]))).handle,
    });
    const aggregate = await runner.run({ files: ['a.geospec.ts'] });
    expect(aggregate.success).toBe(false);
    expect(aggregate.issues?.some((issue) => issue.code === 'NO_MATCHING_GEOSPEC_TESTS')).toBe(true);
    await runner.close();
  });
});
