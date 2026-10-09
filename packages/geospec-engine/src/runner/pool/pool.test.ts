import { describe, expect, it, vi } from 'vitest';
import type {
  GeoSpecPoolHostMessage,
  GeoSpecPoolWorkerHandle,
  GeoSpecPoolWorkerMessage,
  GeoSpecRunnerEvent,
} from 'geospec/runner/worker';
import { openShardTimings } from '#runner/pool/timings.js';
import { createGeoSpecPoolRunner, mergeShardResults } from '#runner/pool/pool.js';
import { sanitizePoolResult } from '#runner/pool/transport.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const bundle = {
  code: '',
  issues: [],
  success: true,
  dependencies: [],
  unresolvedPaths: [],
};

// Synthetic scheduler controls carry explicit metadata; they do not qualify a native producer.
const passing = (name: string, ordinal = 0, discovered = 1): Extract<GeoSpecRunResult, { success: true }> => ({
  success: true,
  passed: true,
  tests: [{ suite: ['s'], name, ordinal, assertions: [], status: 'passed', diagnostics: [] }],
  accounting: {
    discovered,
    selected: 1,
    completed: 1,
    passed: 1,
    failed: 0,
    unsupported: 0,
    inconclusive: 0,
    skipped: 0,
    notRun: discovered - 1,
  },
  lineage: {
    status: 'complete',
    modules: [
      {
        entryPath: 'control.geospec.ts',
        bundleSha256: 'control',
        files: { 'control.geospec.ts': 'sha256:control' },
        consistent: true,
      },
    ],
    loads: [],
  },
  bundle,
});

const failing = (name: string, ordinal = 0): Extract<GeoSpecRunResult, { success: true }> => ({
  ...passing(name, ordinal),
  success: true,
  passed: false,
  tests: [{ suite: ['s'], name, ordinal, assertions: [], status: 'failed', diagnostics: [] }],
  accounting: {
    discovered: 1,
    selected: 1,
    completed: 1,
    passed: 0,
    failed: 1,
    unsupported: 0,
    inconclusive: 0,
    skipped: 0,
    notRun: 0,
  },
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
}): {
  handle: GeoSpecPoolWorkerHandle;
  sent: GeoSpecPoolHostMessage[];
  terminated: () => boolean;
} => {
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
        queueMicrotask(() =>
          listener?.({
            type: 'tests-listed',
            shardId: message.shardId,
            file: message.file,
            names,
          }),
        );
        return;
      }
      const reply = script.onShard?.(message.shard.file, message.shard.testNamePattern);
      if (reply === undefined) {
        return;
      }
      if (script.progress === true) {
        queueMicrotask(() =>
          listener?.({
            type: 'file-start',
            shardId: message.shard.id,
            file: message.shard.file,
          }),
        );
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
  const message = {
    type: 'shard-complete',
    shardId: shard.id,
    file: shard.file,
    result,
    durationMs: 1,
    ...over,
  };
  return message as GeoSpecPoolWorkerMessage;
};

describe('createGeoSpecPoolRunner', () => {
  it('should reject duplicate requested files before starting or spawning', async () => {
    const createWorker = vi.fn(
      () => scriptedWorker({ onShard: (file) => complete({ id: 0, file }, passing('one')) }).handle,
    );
    const runner = createGeoSpecPoolRunner({ createWorker, workers: 1 });
    const result = await runner.run({ files: ['a.geospec.ts', 'a.geospec.ts'] });
    expect(createWorker).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: 'GEOSPEC_DUPLICATE_FILES' }],
      accounting: {
        requestedFiles: ['a.geospec.ts', 'a.geospec.ts'],
        notRunFiles: ['a.geospec.ts', 'a.geospec.ts'],
        discoveryComplete: false,
      },
    });
    await runner.close();
  });

  it('should not turn an incomplete module into a passing pool run', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, { ...passing('unsupported'), passed: false }),
    });
    const runner = createGeoSpecPoolRunner({ createWorker: () => worker.handle, workers: 1 });
    const result = await runner.run({ files: ['a.geospec.ts'] });
    expect(result.success).toBe(false);
    await runner.close();
  });

  it('should keep duplicate full test names on the whole-file path', async () => {
    const patterns: Array<string | undefined> = [];
    const createWorker = () =>
      scriptedWorker({
        onList: () => ['s > same', 's > same'],
        onShard: (file, pattern) => {
          patterns.push(pattern);
          return complete({ id: 0, file }, passing('same'));
        },
      }).handle;
    const runner = createGeoSpecPoolRunner({ createWorker, workers: 2 });
    await runner.run({ files: ['a.geospec.ts'] });
    expect(patterns).toEqual([undefined]);
    await runner.close();
  });
  it('should refuse a second run while its worker holds a delayed shard reply', async () => {
    let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
    const sent: GeoSpecPoolHostMessage[] = [];
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        sent.push(message);
      },
      onMessage(next) {
        listener = next;
        queueMicrotask(() => {
          next({ type: 'ready' });
        });
      },
      onExit() {
        /* The test controls shard replies. */
      },
      terminate() {
        /* No live thread in this scripted handle. */
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
    });
    try {
      const first = runner.run({ files: ['a.geospec.ts'] });
      await expect.poll(() => sent.filter((message) => message.type === 'run-shard').length).toBe(1);
      const second = await runner.run({ files: ['b.geospec.ts'] });
      expect(second).toMatchObject({
        success: false,
        failed: 1,
        files: [],
        issues: [
          {
            code: 'GEOSPEC_RUNNER_BUSY',
            message: 'GeoSpec runner already has an active run.',
          },
        ],
      });
      expect(sent.filter((message) => message.type === 'run-shard').map((message) => message.shard.file)).toEqual([
        'a.geospec.ts',
      ]);
      listener?.(complete({ id: 0, file: 'a.geospec.ts' }, passing('a')));
      expect(await first).toMatchObject({
        success: true,
        files: [{ file: 'a.geospec.ts', result: { tests: [{ name: 'a' }] } }],
      });

      const third = runner.run({ files: ['c.geospec.ts'] });
      await expect.poll(() => sent.filter((message) => message.type === 'run-shard').length).toBe(2);
      listener?.(complete({ id: 0, file: 'c.geospec.ts' }, passing('c')));
      expect(await third).toMatchObject({
        success: true,
        files: [{ file: 'c.geospec.ts', result: { tests: [{ name: 'c' }] } }],
      });
    } finally {
      await runner.close();
    }
  });

  it('should release the run reservation when input validation throws', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });
    try {
      await expect(runner.run({ files: ['../outside.geospec.ts'] })).rejects.toThrow();
      expect(await runner.run({ files: ['inside.geospec.ts'] })).toMatchObject({
        success: true,
        files: [{ file: 'inside.geospec.ts' }],
      });
    } finally {
      await runner.close();
    }
  });

  it('should own and terminate a worker returned after close began during spawn', async () => {
    const creation = Promise.withResolvers<GeoSpecPoolWorkerHandle>();
    let terminations = 0;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage() {
        throw new Error('A late worker must not receive work.');
      },
      onMessage() {
        /* The late handle is never admitted to a channel. */
      },
      onExit() {
        /* The late handle is never admitted to a channel. */
      },
      terminate() {
        terminations += 1;
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: async () => creation.promise,
      workers: 1,
    });
    const running = runner.run({ files: ['a.geospec.ts'] });
    const rejectedRun = expect(running).rejects.toThrow('closed during worker creation');
    const closing = runner.close();
    expect(await Promise.race([closing, Promise.resolve('pending')])).toBe('pending');
    creation.resolve(handle);
    await closing;
    await rejectedRun;
    expect(terminations).toBe(1);
  });

  it('should give concurrent close callers the same native cleanup barrier', async () => {
    let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
    let terminations = 0;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'initialize') {
          queueMicrotask(() => {
            listener?.({ type: 'initialized' });
          });
        }
      },
      onMessage(next) {
        listener = next;
        queueMicrotask(() => {
          next({ type: 'ready' });
        });
      },
      onExit() {
        /* This handle exits only when terminated. */
      },
      terminate() {
        terminations += 1;
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
      gracefulShutdown: true,
      initializeWorker: (worker) => {
        worker.postMessage({ type: 'initialize' });
      },
    });
    await runner.run({ files: [] });
    const first = runner.close();
    const second = runner.close();
    expect(second).toBe(first);
    expect(await Promise.race([second, Promise.resolve('pending')])).toBe('pending');
    listener?.({ type: 'initialized' });
    await Promise.all([first, second]);
    expect(terminations).toBe(1);
  });

  it('should not mistake a late initialization reply for native cleanup completion', async () => {
    let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
    let initializationRequested = false;
    let shutdownRequested = false;
    let terminated = false;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'initialize') {
          initializationRequested = true;
        }
        if (message.type === 'shutdown') {
          shutdownRequested = true;
        }
      },
      onMessage(next) {
        listener = next;
        queueMicrotask(() => {
          next({ type: 'ready' });
        });
      },
      onExit() {
        /* The test controls both acknowledgements. */
      },
      terminate() {
        terminated = true;
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
      gracefulShutdown: true,
      initializeWorker: (worker) => {
        worker.postMessage({ type: 'initialize' });
      },
    });
    const running = runner.run({ files: [] });
    const rejectedRun = expect(running).rejects.toThrow('closed during worker initialization');
    await expect.poll(() => initializationRequested).toBe(true);
    const closing = runner.close();
    await expect.poll(() => shutdownRequested).toBe(true);
    listener?.({ type: 'initialized' });
    expect(await Promise.race([closing, Promise.resolve('pending')])).toBe('pending');
    expect(terminated).toBe(false);
    listener?.({ type: 'initialized' });
    await closing;
    await rejectedRun;
    expect(terminated).toBe(true);
  });

  it('should give concurrent close callers the same prompt shutdown error and terminate once', async () => {
    let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
    let terminations = 0;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'initialize') {
          queueMicrotask(() => {
            listener?.({ type: 'initialized' });
          });
        } else if (message.type === 'shutdown') {
          queueMicrotask(() => {
            listener?.({
              type: 'initialization-error',
              message: 'engine close failed',
            });
          });
        }
      },
      onMessage(next) {
        listener = next;
        queueMicrotask(() => {
          next({ type: 'ready' });
        });
      },
      onExit() {
        /* The failed shutdown is followed by explicit termination. */
      },
      terminate() {
        terminations += 1;
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
      gracefulShutdown: true,
      initializeWorker: (worker) => {
        worker.postMessage({ type: 'initialize' });
      },
    });
    await runner.run({ files: [] });
    const first = runner.close();
    const second = runner.close();
    expect(second).toBe(first);
    await Promise.all([
      expect(first).rejects.toThrow('engine close failed'),
      expect(second).rejects.toThrow('engine close failed'),
    ]);
    expect(terminations).toBe(1);
  });

  it.each(['ack', 'forced-exit'] as const)(
    'should settle an active shard when close ends its worker by %s',
    async (mode) => {
      let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
      let onExit: ((details: { unexpected: boolean; message?: string }) => void) | undefined;
      let activeShard: { id: number; file: string } | undefined;
      let terminations = 0;
      const handle: GeoSpecPoolWorkerHandle = {
        postMessage(message) {
          if (message.type === 'initialize') {
            queueMicrotask(() => {
              listener?.({ type: 'initialized' });
            });
          } else if (message.type === 'run-shard') {
            activeShard = message.shard;
          } else if (message.type === 'shutdown' && mode === 'ack') {
            queueMicrotask(() => {
              if (activeShard) {
                listener?.({
                  type: 'shard-complete',
                  shardId: activeShard.id,
                  file: activeShard.file,
                  result: passing('done'),
                  durationMs: 1,
                });
              }
              listener?.({ type: 'initialized' });
            });
          }
        },
        onMessage(next) {
          listener = next;
          queueMicrotask(() => {
            next({ type: 'ready' });
          });
        },
        onExit(next) {
          onExit = next;
        },
        terminate() {
          terminations += 1;
          onExit?.({ unexpected: false, message: 'worker closed' });
        },
      };
      const runner = createGeoSpecPoolRunner({
        createWorker: () => handle,
        workers: 1,
        gracefulShutdown: true,
        initializeWorker: (worker) => {
          worker.postMessage({ type: 'initialize' });
        },
      });
      const running = runner.run({ files: ['a.geospec.ts'] });
      await expect.poll(() => activeShard).toBeDefined();
      if (mode === 'forced-exit') {
        vi.useFakeTimers();
      }
      try {
        const closing = runner.close();
        if (mode === 'forced-exit') {
          const refusedClose = expect(closing).rejects.toThrow('Native pool shutdown timed out.');
          await vi.advanceTimersByTimeAsync(10_001);
          await refusedClose;
        } else {
          await closing;
        }
        const result = await running;
        expect(result.success).toBe(false);
        expect(result.issues?.map((issue) => issue.code)).toContain('GEOSPEC_RUNNER_ABORTED');
        expect(terminations).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('should wait for a native cleanup acknowledgement before terminating the worker', async () => {
    let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
    let shutdownRequested = false;
    let terminated = false;
    const handle: GeoSpecPoolWorkerHandle = {
      postMessage(message) {
        if (message.type === 'initialize') {
          queueMicrotask(() => {
            listener?.({ type: 'initialized' });
          });
        }
        if (message.type === 'shutdown') {
          shutdownRequested = true;
        }
      },
      onMessage(next) {
        listener = next;
        queueMicrotask(() => {
          next({ type: 'ready' });
        });
      },
      onExit() {
        /* The scripted worker stays live until termination. */
      },
      terminate() {
        terminated = true;
      },
    };
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
      gracefulShutdown: true,
      initializeWorker: (worker) => {
        worker.postMessage({ type: 'initialize' });
      },
    });
    await runner.run({ files: [] });
    const closing = runner.close();
    await vi.waitFor(() => {
      expect(shutdownRequested).toBe(true);
    });
    expect(terminated).toBe(false);
    listener?.({ type: 'initialized' });
    await closing;
    expect(terminated).toBe(true);
  });

  it('should close initialized peers when a native worker rejects initialization', async () => {
    const sent: GeoSpecPoolHostMessage[][] = [[], []];
    const terminated = [false, false];
    let created = 0;
    const handles = [0, 1].map((index): GeoSpecPoolWorkerHandle => {
      let listener: ((message: GeoSpecPoolWorkerMessage) => void) | undefined;
      return {
        postMessage(message) {
          sent[index]!.push(message);
          if (message.type === 'initialize') {
            queueMicrotask(() => {
              listener?.(
                index === 0
                  ? { type: 'initialized' }
                  : {
                      type: 'initialization-error',
                      message: 'native unavailable',
                    },
              );
            });
          }
          if (message.type === 'shutdown') {
            queueMicrotask(() => {
              listener?.({ type: 'initialized' });
            });
          }
        },
        onMessage(next) {
          listener = next;
          queueMicrotask(() => {
            next({ type: 'ready' });
          });
        },
        onExit() {
          /* The scripted worker stays live until termination. */
        },
        terminate() {
          terminated[index] = true;
        },
      };
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handles[created++]!,
      workers: 2,
      gracefulShutdown: true,
      initializeWorker: (worker) => {
        worker.postMessage({ type: 'initialize' });
      },
    });
    await expect(runner.run({ files: ['a.geospec.ts'] })).rejects.toThrow('native unavailable');
    expect(sent[0]).toContainEqual({ type: 'shutdown' });
    expect(terminated).toStrictEqual([true, true]);
  });

  it('should forward worker forensic events with their shard identity', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const worker = scriptedWorker({
      forensic: true,
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });
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

    const result = await runner.run({
      files: ['b.geospec.ts', 'a.geospec.ts'],
    });
    await runner.close();

    expect(result.files.map((file) => file.file)).toStrictEqual(['b.geospec.ts', 'a.geospec.ts']);
    expect({
      success: result.success,
      passed: result.passed,
      selected: result.selectedTests,
    }).toStrictEqual({
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
        return {
          type: 'shard-error',
          shardId: 0,
          file,
          message: 'the worker blew up',
        };
      },
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

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
        return complete({ id: 0, file }, passing(pattern ?? 'whole', pattern === '^s > two$' ? 1 : 0, 2));
      },
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      timings,
    });

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
          return complete({ id: 0, file }, passing(pattern!, pattern === '^s > two$' ? 1 : 0, 2));
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
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      timings,
    });

    await runner.run({ files: ['slow.geospec.ts'] });
    await runner.close();

    expect(patterns).toStrictEqual([undefined]);
  });

  it('should record shard timings so the next run schedules on them', async () => {
    const timings = openShardTimings(undefined);
    const worker = scriptedWorker({
      onShard: (file) =>
        complete({ id: 0, file }, passing(file), {
          durationMs: 4321,
          workerMemoryBytes: 99,
        }),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      timings,
    });

    await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(timings.read('a.geospec.ts')).toStrictEqual({
      durationMs: 4321,
      peakRssBytes: 99,
    });
  });

  it('should follow affinity: a warm worker gets the shard it already loaded', async () => {
    const timings = openShardTimings(undefined);
    const runs: string[] = [];
    const worker = scriptedWorker({
      onShard: (file) => {
        runs.push(file);
        return complete({ id: 0, file }, passing(file), {
          primaryLoadKey: 'shared-key',
        });
      },
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      timings,
    });

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
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.files[0]?.result)).toContain('out of memory');
  });

  it('should terminate a worker that misses the shard watchdog', async () => {
    const worker = scriptedWorker({ onShard: () => undefined });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      shardTimeout: 10,
    });

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
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'], bail: true });
    await runner.close();

    expect(seen).toStrictEqual(['a.geospec.ts']);
    expect(result.accounting).toMatchObject({
      requestedFiles: ['a.geospec.ts', 'b.geospec.ts'],
      completedFiles: ['a.geospec.ts'],
      notRunFiles: ['b.geospec.ts'],
      discoveryComplete: false,
      bailed: true,
    });
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
    runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    const result = await runner.run({
      files: ['a.geospec.ts', 'b.geospec.ts'],
    });
    await runner.close();

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_ABORTED');
    expect(result.files).toHaveLength(1);
  });

  it('should fail an empty selection rather than reporting success', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, { success: true, passed: true, tests: [], bundle }),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
  });

  it('should refuse to run once closed', async () => {
    const worker = scriptedWorker({});
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });
    await runner.close();
    await runner.close();

    const result = await runner.run({ files: ['a.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_CLOSED');
  });

  it('should pass the run-wide test-name pattern to every shard', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file)),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    await runner.run({
      files: ['a.geospec.ts'],
      testNamePattern: /volume/u,
      testTimeout: 1234,
    });
    await runner.close();

    const dispatched = worker.sent.find((message) => message.type === 'run-shard');
    expect(dispatched).toMatchObject({
      testNamePattern: '/volume/u',
      testTimeout: 1234,
    });
  });
});

describe('mergeShardResults', () => {
  it('should retain both module identities, order claims by definition and not sum repeated discovery', () => {
    const left = passing('two', 1, 2);
    const right = passing('one', 0, 2);
    const merged = mergeShardResults(left, right);
    expect(merged.tests?.map((test) => test.name)).toEqual(['one', 'two']);
    expect(merged.lineage?.modules).toHaveLength(2);
    expect(merged.accounting).toMatchObject({ discovered: 2, selected: 2, completed: 2, passed: 2, notRun: 0 });
  });

  it('should reject mixed consumed file graphs even when every shard passes', () => {
    const left = passing('one', 0, 2);
    const right: GeoSpecRunResult = {
      ...passing('two', 1, 2),
      lineage: {
        status: 'complete',
        modules: [
          {
            entryPath: 'control.geospec.ts',
            bundleSha256: 'other-run-token',
            files: { 'control.geospec.ts': 'sha256:changed' },
            consistent: true,
          },
        ],
        loads: [],
      },
    };
    expect(mergeShardResults(left, right)).toMatchObject({
      success: true,
      passed: false,
      lineage: { status: 'mixed' },
    });
  });

  it('should reject mixed actual resource locators despite equal artifact aliases', () => {
    const withResource = (sha256: string): GeoSpecRunResult => ({
      ...passing('one', 0, 2),
      lineage: {
        status: 'complete',
        modules: [],
        loads: [
          {
            loadId: 'resource-load',
            status: 'complete',
            evidence: {
              loadId: 'resource-load',
              status: 'complete',
              format: 'gltf',
              parameters: {},
              ingestOptions: {},
              artifacts: [{ name: 'alias.bin', sourcePath: 'textures/data.bin', sha256, byteLength: 1 }],
            },
          },
        ],
      },
    });
    expect(mergeShardResults(withResource('a'.repeat(64)), withResource('b'.repeat(64)))).toMatchObject({
      passed: false,
      lineage: { status: 'mixed' },
    });
  });

  it('should preserve ambiguous overlapping claims without inventing complete discovery', () => {
    const merged = mergeShardResults(passing('one'), passing('also ordinal zero'));
    expect(merged.tests).toHaveLength(2);
    expect(merged.accounting).toBeUndefined();
    expect(merged.success && merged.passed).toBe(false);
  });
  it('should concatenate tests and AND the pass flag', () => {
    const merged = mergeShardResults(passing('one'), failing('two', 1));

    expect(merged.success && merged.passed).toBe(false);
    expect(merged.success && merged.tests.map((test) => test.name)).toStrictEqual(['one', 'two']);
  });

  it('should keep the whole file failed when either shard could not execute', () => {
    const broken: GeoSpecRunResult = { success: false, issues: [] };

    expect(mergeShardResults(broken, passing('one')).success).toBe(false);
    expect(mergeShardResults(passing('one'), broken).success).toBe(false);
    expect(mergeShardResults(passing('one'), broken).tests?.map((test) => test.name)).toEqual(['one']);
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

  it('should sanitize retained claims when a later module failure prevents success', () => {
    const live = {
      kind: 'geometry-subject',
      provenance: { contentHash: 'sha256:abc' },
      nativeXde: { delete: () => undefined },
    };
    const test = subjectTest(live);
    const canonical = new Uint8Array([1, 2, 3]);
    test.assertions[0]!.report = {
      canonicalClaim: canonical,
      canonicalPlan: canonical,
      canonicalResult: canonical,
      claim: {},
      claimId: 'control',
      diagnostics: [],
      polarity: 'negative',
      result: {},
      status: 'passed',
    };
    const sanitized = sanitizePoolResult({ success: false, issues: [], tests: [test] });
    expect(sanitized.tests?.[0]?.assertions[0]?.subject).toEqual({
      kind: 'geometry-subject-ref',
      contentHash: 'sha256:abc',
    });
    expect(() => structuredClone(sanitized)).not.toThrow();
    expect(sanitized.tests?.[0]?.assertions[0]?.report?.canonicalResult).toBe(canonical);
    expect(sanitized.tests?.[0]?.assertions[0]?.report?.polarity).toBe('negative');
  });

  it('should replace a live subject with its content-addressed identity', () => {
    const live = {
      kind: 'geometry-subject',
      provenance: { contentHash: 'sha256:abc', source: { format: 'step' } },
      nativeXde: { delete: () => undefined },
    };

    const sanitized = sanitizePoolResult({
      success: true,
      passed: true,
      tests: [subjectTest(live)],
      bundle,
    });

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
    const sanitized = sanitizePoolResult({
      success: true,
      passed: true,
      tests: [subjectTest(42)],
      bundle,
    });

    expect(sanitized.success && sanitized.tests[0]?.assertions[0]?.subject).toBe(42);
  });

  it('should elide the compiled module and its source map', () => {
    const sanitized = sanitizePoolResult({
      success: true,
      passed: true,
      tests: [],
      bundle: {
        ...bundle,
        code: 'export const x = 1;',
        sourceMap: '{"version":3}',
      },
    });

    expect(sanitized.bundle).toMatchObject({ code: '', sourceMap: '' });
  });

  it('should elide the bundle of a failed run and tolerate its absence', () => {
    expect(
      sanitizePoolResult({
        success: false,
        issues: [],
        bundle: { ...bundle, code: 'x' },
      }).bundle?.code,
    ).toBe('');
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
    const runner = createGeoSpecPoolRunner({
      createWorker: makeWorker,
      workers: 2,
      timings,
    });

    const result = await runner.run({
      files: ['heavy-a.geospec.ts', 'heavy-b.geospec.ts'],
    });
    await runner.close();

    expect(result.success).toBe(true);
    expect(peak).toBe(1);
  });
});

describe('the remaining refusal legs', () => {
  it('should fail a shard whose worker answered with a test list', async () => {
    const worker = scriptedWorker({
      onShard: (file) => ({
        type: 'tests-listed',
        shardId: 0,
        file,
        names: ['s > one'],
      }),
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

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
    runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    const result = await runner.run({
      files: ['a.geospec.ts', 'b.geospec.ts'],
    });
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
    runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

    const result = await runner.run({
      files: ['a.geospec.ts', 'b.geospec.ts'],
    });
    await runner.close();

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted.');
    expect(result.accounting).toMatchObject({
      completedFiles: ['a.geospec.ts'],
      notRunFiles: ['b.geospec.ts'],
      discoveryComplete: false,
      cancelled: true,
    });
  });
});

describe('the worker channel', () => {
  it('should ignore progress messages that are not settlements', async () => {
    const worker = scriptedWorker({
      onShard: (file) => complete({ id: 0, file }, passing(file)),
      progress: true,
    });
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
    });

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
    const runner = createGeoSpecPoolRunner({
      createWorker: () => handle,
      workers: 1,
    });

    const result = await runner.run({
      files: ['a.geospec.ts', 'b.geospec.ts'],
    });
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
    const runner = createGeoSpecPoolRunner({
      createWorker: () => worker.handle,
      workers: 1,
      timings,
    });

    await runner.run({
      files: ['slow.geospec.ts'],
      testTimeout: 7000,
      matcherWallBackstop: 9000,
      forensic: true,
    });
    await runner.close();

    expect(worker.sent.filter((message) => message.type !== 'shutdown')).toMatchObject([
      {
        type: 'list-tests',
        testTimeout: 7000,
        matcherWallBackstop: 9000,
        forensic: true,
      },
      {
        type: 'run-shard',
        testTimeout: 7000,
        matcherWallBackstop: 9000,
        forensic: true,
      },
    ]);
  });
});
