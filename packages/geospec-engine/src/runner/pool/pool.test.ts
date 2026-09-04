/* eslint-disable @typescript-eslint/naming-convention -- GeoSpec file paths are object keys here. */
import { describe, expect, it } from 'vitest';
import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunnerEvent,
} from 'geospec/runner/worker';
import { openShardTimings } from '#cache/timings.js';
import { createGeoSpecPoolRunner, mergeShardResults } from '#runner/pool/pool.js';
import { sanitizePoolResult } from '#runner/pool/transport.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const bundle = { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };

const passing = (name: string): GeoSpecRunResult => ({
  success: true,
  passed: true,
  tests: [{ suite: ['s'], name, assertions: [], status: 'passed', diagnostics: [] }],
  bundle,
});

const failing = (name: string): GeoSpecRunResult => ({
  success: true,
  passed: false,
  tests: [{ suite: ['s'], name, assertions: [], status: 'failed', diagnostics: [] }],
  bundle,
});

/**
 * A scripted worker: it answers each host message from a table, so a pool test
 * exercises the real scheduler against a deterministic worker. Real threads
 * are the runtime-e2e backbone's job (D-8: vitest cannot host a `.ts` worker).
 */
const scriptedWorker = (script: {
  onShard?: (file: string, pattern: string | undefined) => GeoSpecPoolWorkerMessage | undefined;
  onList?: (file: string) => string[];
  /** Emit a `file-start` progress message before the settlement. */
  progress?: boolean;
  /** Emit one forensic measurement before a shard settlement. */
  forensic?: boolean;
}): { handle: GeoSpecPoolWorkerHandle; sent: GeoSpecPoolHostMessage[]; terminated: () => boolean } => {
  const sent: GeoSpecPoolHostMessage[] = [];
  let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
  let exit: ((details: { unexpected: boolean; message?: string }) => void) | undefined;
  let terminated = false;
  const handle: GeoSpecPoolWorkerHandle = {
    postMessage(message) {
      sent.push(message);
      if (message.type === 'shutdown') {
        exit?.({ unexpected: false });
        return;
      }
      if (message.type === 'initialize') {
        queueMicrotask(() => listener?.({ type: 'initialized' }));
        return;
      }
      if (message.type === 'list-tests') {
        const names = script.onList?.(message.file) ?? [];
        queueMicrotask(() => listener?.({ type: 'tests-listed', shardId: message.shardId, file: message.file, names }));
        return;
      }
      const reply = script.onShard?.(message.shard.file, message.shard.testNamePattern);
      if (reply === undefined) {
        return;
      }
      if (script.progress === true) {
        queueMicrotask(() => listener?.({ type: 'file-start', shardId: message.shard.id, file: message.shard.file }));
      }
      if (script.forensic === true) {
        queueMicrotask(() =>
          listener?.({
            type: 'forensic',
            shardId: message.shard.id,
            name: 'runner.shard',
            value: 1,
            unit: 'milliseconds',
          }),
        );
      }
      queueMicrotask(() => listener?.(reply));
    },
    onMessage(next) {
      listener = next;
      queueMicrotask(() => {
        next({ type: 'ready' });
      });
    },
    onExit(next) {
      exit = next;
    },
    terminate() {
      terminated = true;
    },
  };
  return { handle, sent, terminated: () => terminated };
};

const complete = (
  shard: { id: number; file: string },
  result: GeoSpecRunResult,
  over: Partial<GeoSpecPoolWorkerMessage> = {},
): GeoSpecPoolWorkerMessage => {
  const message = { type: 'shard-complete', shardId: shard.id, file: shard.file, result, durationMs: 1, ...over };
  return message as GeoSpecPoolWorkerMessage;
};

describe('createGeoSpecPoolRunner', () => {
  it('should forward worker forensic events with their shard identity', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const worker = scriptedWorker({
      forensic: true,
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });
    runner.on('forensic', (event) => events.push(event));

    await runner.run({ files: ['a.geospec.ts'], forensic: true });
    await runner.close();

    expect(events).toContainEqual({
      type: 'forensic',
      shardId: 0,
      name: 'runner.shard',
      value: 1,
      unit: 'milliseconds',
    });
  });

  it('should run every shard and report files in DECLARED order', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });
    for (const type of ['run-start', 'file-start', 'file-complete', 'run-complete', 'close'] as const) {
      runner.on(type, (event) => events.push(event));
    }

    const result = await runner.run({ files: ['b.geospec.ts', 'a.geospec.ts'] });
    await runner.close();

    expect(result.files.map((file) => file.file)).toStrictEqual(['b.geospec.ts', 'a.geospec.ts']);
    expect({ success: result.success, passed: result.passed, selected: result.selectedTests }).toStrictEqual({
      success: true,
      passed: 2,
      selected: 2,
    });
    expect(events.at(-1)?.type).toBe('close');
  });

  it('should NEVER retry a failed shard', async () => {
    let shardMessages = 0;
    const worker = scriptedWorker({
      onShard: (file) => {
        shardMessages += 1;
        return { type: 'shard-error', shardId: 0, file, message: 'the worker blew up' };
      },
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(shardMessages).toBe(1);
    expect(result.success).toBe(false);
    expect(result.files[0]?.result.success).toBe(false);
  });

  it('should split an over-threshold file per test and merge the shards back', async () => {
    const timings = openShardTimings(undefined);
    timings.record('slow.geospec.ts', { durationMs: 600_000, peakRssBytes: 0 });
    const patterns: Array<string | undefined> = [];
    const worker = scriptedWorker({
      onList: () => ['s > one', 's > two'],
      onShard: (file, pattern) => {
        patterns.push(pattern);
        return complete({ id: 0, file }, passing(pattern ?? 'whole'));
      },
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, timings });

    const result = await runner.run({ files: ['slow.geospec.ts'] });
    await runner.close();

    expect(patterns).toStrictEqual(['^s > one$', '^s > two$']);
    expect(result.files).toHaveLength(1);
    expect(result.selectedTests).toBe(2);
  });

  it('should split one file across requested workers without timing history', async () => {
    const patterns: string[] = [];
    const scripted = Array.from({ length: 2 }, () =>
      scriptedWorker({
        onList: () => ['s > one', 's > two'],
        onShard: (file, pattern) => {
          patterns.push(pattern!);
          return complete({ id: 0, file }, passing(pattern!));
        },
      }),
    );
    let created = 0;
    const runner = createGeoSpecPoolRunner({
      createWorker: () => scripted[created++]!.handle,
      workers: 2,
    });

    const result = await runner.run({ files: ['suite.geospec.ts'] });
    await runner.close();

    expect(created).toBe(2);
    expect(patterns.sort()).toStrictEqual(['^s > one$', '^s > two$']);
    expect(result.selectedTests).toBe(2);
  });

  it('should run a file whole when its collection pass fails', async () => {
    const timings = openShardTimings(undefined);
    timings.record('slow.geospec.ts', { durationMs: 600_000, peakRssBytes: 0 });
    const patterns: Array<string | undefined> = [];
    const worker = scriptedWorker({
      onList: () => [],
      onShard: (file, pattern) => {
        patterns.push(pattern);
        return complete({ id: 0, file }, passing('whole'));
      },
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, timings });

    await runner.run({ files: ['slow.geospec.ts'] });
    await runner.close();

    expect(patterns).toStrictEqual([undefined]);
  });

  it('should record shard timings so the next run schedules on them', async () => {
    const timings = openShardTimings(undefined);
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file), { durationMs: 4321, workerMemoryBytes: 99 }),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, timings });

    await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(timings.read('a.geospec.ts')).toStrictEqual({ durationMs: 4321, peakRssBytes: 99 });
  });

  it('should follow affinity: a warm worker gets the shard it already loaded', async () => {
    const timings = openShardTimings(undefined);
    const runs: string[] = [];
    const worker = scriptedWorker({
      onShard: (file) => {
        runs.push(file);
        return complete({ id: 0, file }, passing(file), { primaryLoadKey: 'shared-key' });
      },
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, timings });

    await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await runner.close();

    expect(runs).toStrictEqual(['a.geospec.ts', 'b.geospec.ts']);
  });

  it('should fail the shard when the worker exits unexpectedly', async () => {
    let notifyExit: ((details: { unexpected: boolean; message?: string }) => void) | undefined;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'run-shard') {
          queueMicrotask(() => notifyExit?.({ unexpected: true, message: 'out of memory' }));
        }
      },
      onMessage(listener) {
        queueMicrotask(() => {
          listener({ type: 'ready' });
        });
      },
      onExit(listener) {
        notifyExit = listener;
      },
      terminate() {
        // The pool never terminates a healthy worker mid-run.
      },
    };
    const runner = createGeoSpecPoolRunner({ createWorker: () => handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.files[0]?.result)).toContain('out of memory');
  });

  it('should terminate a worker that misses the shard watchdog', async () => {
    const worker = scriptedWorker({ onShard: () => undefined });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, shardTimeout: 10 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(worker.terminated()).toBe(true);
    expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_SHARD_TIMEOUT')).toBe(true);
  });

  it('should stop dispatching under bail', async () => {
    const seen: string[] = [];
    const worker = scriptedWorker({
      onShard: (file) => {
        seen.push(file);
        return complete({ id: 0, file }, failing(file));
      },
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'], bail: true });
    await runner.close();

    expect(seen).toStrictEqual(['a.geospec.ts']);
  });

  it('should report an abort requested mid-run', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the script closes over the runner it creates.
    let runner: ReturnType<typeof createGeoSpecPoolRunner>;
    const worker = scriptedWorker({
      onShard: (file) => {
        runner.abort('operator');
        return complete({ id: 0, file }, passing(file));
      },
    });
    runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await runner.close();

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_ABORTED');
    expect(result.files).toHaveLength(1);
  });

  it('should fail an empty selection rather than reporting success', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, { success: true, passed: true, tests: [], bundle }),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
  });

  it('should refuse to run once closed', async () => {
    const worker = scriptedWorker({});
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });
    await runner.close();
    await runner.close();

    const result = await runner.run({ files: ['a.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_CLOSED');
  });

  it('should pass the run-wide test-name pattern to every shard', async () => {
    const worker = scriptedWorker({ onShard: (file) => complete({ id: 0, file }, passing(file)) });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    await runner.run({ files: ['a.geospec.ts'], testNamePattern: /volume/u, testTimeout: 1234 });
    await runner.close();

    const dispatched = worker.sent.find((message) => message.type === 'run-shard');
    expect(dispatched).toMatchObject({ testNamePattern: '/volume/u', testTimeout: 1234 });
  });
});

describe('mergeShardResults', () => {
  it('should concatenate tests and AND the pass flag', () => {
    const merged = mergeShardResults(passing('one'), failing('two'));

    expect(merged.success && merged.passed).toBe(false);
    expect(merged.success && merged.tests.map((test) => test.name)).toStrictEqual(['one', 'two']);
  });

  it('should keep the whole file failed when either shard could not execute', () => {
    const broken: GeoSpecRunResult = { success: false, issues: [] };

    expect(mergeShardResults(broken, passing('one')).success).toBe(false);
    expect(mergeShardResults(passing('one'), broken).success).toBe(false);
  });
});

describe('sanitizePoolResult', () => {
  const subjectTest = (subject: unknown): GeoSpecTestCase => ({
    suite: ['s'],
    name: 'n',
    assertions: [{ kind: 'volume', subject, expected: { value: 1 } }],
    status: 'passed',
    diagnostics: [],
  });

  it('should replace a live subject with its content-addressed identity', () => {
    const live = {
      kind: 'geometry-subject',
      provenance: { contentHash: 'sha256:abc', source: { format: 'step' } },
      nativeXde: { delete: () => undefined },
    };

    const sanitized = sanitizePoolResult({ success: true, passed: true, tests: [subjectTest(live)], bundle });

    expect(sanitized.success && sanitized.tests[0]?.assertions[0]?.subject).toStrictEqual({
      kind: 'geometry-subject-ref',
      contentHash: 'sha256:abc',
      format: 'step',
    });
  });

  it('should keep a subject reference minimal when provenance is thin', () => {
    const sanitized = sanitizePoolResult({
      success: true,
      passed: true,
      tests: [subjectTest({ kind: 'geometry-subject' })],
      bundle,
    });

    expect(sanitized.success && sanitized.tests[0]?.assertions[0]?.subject).toStrictEqual({
      kind: 'geometry-subject-ref',
    });
  });

  it('should carry a non-subject value across unchanged', () => {
    const sanitized = sanitizePoolResult({ success: true, passed: true, tests: [subjectTest(42)], bundle });

    expect(sanitized.success && sanitized.tests[0]?.assertions[0]?.subject).toBe(42);
  });

  it('should elide the compiled module and its source map', () => {
    const sanitized = sanitizePoolResult({
      success: true,
      passed: true,
      tests: [],
      bundle: { ...bundle, code: 'export const x = 1;', sourceMap: '{"version":3}' },
    });

    expect(sanitized.bundle).toMatchObject({ code: '', sourceMap: '' });
  });

  it('should elide the bundle of a failed run and tolerate its absence', () => {
    expect(sanitizePoolResult({ success: false, issues: [], bundle: { ...bundle, code: 'x' } }).bundle?.code).toBe('');
    expect(sanitizePoolResult({ success: false, issues: [] }).bundle).toBeUndefined();
  });
});

describe('memory-class scheduling', () => {
  it('should never run two heavy shards at once', async () => {
    const timings = openShardTimings(undefined);
    for (const file of ['heavy-a.geospec.ts', 'heavy-b.geospec.ts']) {
      timings.record(file, { durationMs: 10, peakRssBytes: 4 * 1024 ** 3 });
    }
    let concurrent = 0;
    let peak = 0;
    const settle = new Map<number, () => void>();
    const makeWorker = (): GeoSpecPoolWorkerHandle => {
      let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
      return {
        postMessage(message) {
          if (message.type !== 'run-shard') {
            return;
          }
          const { id, file } = message.shard;
          concurrent += 1;
          peak = Math.max(peak, concurrent);
          settle.set(id, () => {
            concurrent -= 1;
            listener?.(complete({ id, file }, passing(file)));
          });
          // Settle on a later turn so both workers can be in flight at once if
          // the scheduler lets them.
          setTimeout(() => settle.get(id)?.(), 5);
        },
        onMessage(next) {
          listener = next;
          queueMicrotask(() => {
            next({ type: 'ready' });
          });
        },
        onExit() {
          // A scripted worker never exits on its own.
        },
        terminate() {
          // Nothing to release.
        },
      };
    };
    const runner = createGeoSpecPoolRunner({ createWorker: makeWorker, workers: 2, timings });

    const result = await runner.run({ files: ['heavy-a.geospec.ts', 'heavy-b.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
    expect(peak).toBe(1);
  });
});

describe('the remaining refusal legs', () => {
  it('should fail a shard whose worker answered with a test list', async () => {
    const worker = scriptedWorker({
      onShard: (file) => ({ type: 'tests-listed', shardId: 0, file, names: ['s > one'] }),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(JSON.stringify(result.files[0]?.result)).toContain('answered a shard with a test list');
  });

  it('should record an abort with no reason', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the script closes over the runner it creates.
    let runner: ReturnType<typeof createGeoSpecPoolRunner>;
    const worker = scriptedWorker({
      onShard: (file) => {
        runner.abort();
        return complete({ id: 0, file }, passing(file));
      },
    });
    runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await runner.close();

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted: requested');
  });

  it('should record an abort whose reason is empty', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the script closes over the runner it creates.
    let runner: ReturnType<typeof createGeoSpecPoolRunner>;
    const worker = scriptedWorker({
      onShard: (file) => {
        runner.abort('');
        return complete({ id: 0, file }, passing(file));
      },
    });
    runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await runner.close();

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted.');
  });
});

describe('the worker channel', () => {
  it('should ignore progress messages that are not settlements', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file)),
      progress: true,
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
  });

  it('should fail every remaining shard once the worker has exited', async () => {
    let notifyExit: ((details: { unexpected: boolean; message?: string }) => void) | undefined;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'run-shard') {
          queueMicrotask(() => notifyExit?.({ unexpected: true }));
        }
      },
      onMessage(listener) {
        queueMicrotask(() => {
          listener({ type: 'ready' });
        });
      },
      onExit(listener) {
        notifyExit = listener;
      },
      terminate() {
        // The worker is already gone.
      },
    };
    const runner = createGeoSpecPoolRunner({ createWorker: () => handle, workers: 1 });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
    await runner.close();

    expect(result.files).toHaveLength(2);
    expect(JSON.stringify(result.files[1]?.result)).toContain('exited unexpectedly');
  });

  it('should pass a run-wide test timeout to the collection pass and the shard', async () => {
    const timings = openShardTimings(undefined);
    timings.record('slow.geospec.ts', { durationMs: 600_000, peakRssBytes: 0 });
    const worker = scriptedWorker({
      onList: () => ['s > one'],
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1, timings });

    await runner.run({
      files: ['slow.geospec.ts'],
      testTimeout: 7000,
      matcherWallBackstop: 9000,
      forensic: true,
    });
    await runner.close();

    expect(worker.sent.filter((message) => message.type !== 'shutdown')).toMatchObject([
      { type: 'list-tests', testTimeout: 7000, matcherWallBackstop: 9000, forensic: true },
      { type: 'run-shard', testTimeout: 7000, matcherWallBackstop: 9000, forensic: true },
    ]);
  });
});
