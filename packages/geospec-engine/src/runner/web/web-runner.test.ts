/* eslint-disable @typescript-eslint/naming-convention -- VM paths are object keys here. */
import { describe, expect, it, vi } from 'vitest';
import type { GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import {
  createGeoSpecWebPoolRunner,
  createGeoSpecWebRunner,
  createWebWorkerHandle,
  webWorkerCount,
} from '#runner/web/web-runner.js';
import type { WebWorkerLike } from '#runner/web/web-runner.js';
import { memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';

/** A browser-worker stub that answers every shard with a canned result. */
const stubWebWorker = (): { worker: WebWorkerLike; posted: unknown[]; terminated: () => number } => {
  let listener: ((event: { data: GeoSpecPoolWorkerMessage }) => void) | undefined;
  const posted: unknown[] = [];
  let terminated = 0;
  return {
    posted,
    terminated: () => terminated,
    worker: {
      postMessage(message) {
        posted.push(message);
        const typed = message as { type: string; shard?: { id: number; file: string } };
        if (typed.type !== 'run-shard' || !typed.shard) {
          return;
        }
        const { id, file } = typed.shard;
        queueMicrotask(() => {
          listener?.({
            data: {
              type: 'shard-complete',
              shardId: id,
              file,
              durationMs: 1,
              result: {
                success: true,
                passed: true,
                tests: [{ suite: [], name: 't', assertions: [], status: 'passed', diagnostics: [] }],
                bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
              },
            },
          });
        });
      },
      addEventListener(_type, next) {
        listener = next;
        queueMicrotask(() => {
          next({ data: { type: 'ready' } });
        });
      },
      terminate() {
        terminated += 1;
      },
    },
  };
};

describe('createGeoSpecWebRunner', () => {
  it('should execute a file serially, exactly like the Node host', async () => {
    const runner = createGeoSpecWebRunner({
      filesystem: memoryFileSystem({ '/a.geospec.ts': passingSpec('web') }),
      projectPath: '/',
    });

    const result = await runner.run({ files: ['/a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
  });
});

describe('createWebWorkerHandle', () => {
  it('should unwrap the message event', async () => {
    const stub = stubWebWorker();
    const handle = createWebWorkerHandle(stub.worker);
    const received: GeoSpecPoolWorkerMessage[] = [];
    handle.onMessage((message) => received.push(message));

    await vi.waitFor(
      () => {
        expect(received).toStrictEqual([{ type: 'ready' }]);
      },
      { timeout: 30_000 },
    );
  });

  it('should report an expected exit when terminated', () => {
    const stub = stubWebWorker();
    const handle = createWebWorkerHandle(stub.worker);
    const exits: Array<{ unexpected: boolean }> = [];
    handle.onExit((details) => exits.push(details));

    handle.postMessage({ type: 'shutdown' });
    void handle.terminate();

    expect(stub.posted).toStrictEqual([{ type: 'shutdown' }]);
    expect(stub.terminated()).toBe(1);
    expect(exits).toStrictEqual([{ unexpected: false }]);
  });

  it('should tolerate a terminate with no exit listener', () => {
    const stub = stubWebWorker();

    void createWebWorkerHandle(stub.worker).terminate();

    expect(stub.terminated()).toBe(1);
  });
});

describe('webWorkerCount', () => {
  it('should leave two cores for the UI thread', () => {
    expect(webWorkerCount(8)).toBe(4);
    expect(webWorkerCount(5)).toBe(3);
  });

  it('should never fall below one', () => {
    expect(webWorkerCount(1)).toBe(1);
  });

  it('should assume four cores when the browser does not say', () => {
    expect(webWorkerCount(undefined)).toBe(2);
  });
});

describe('createGeoSpecWebPoolRunner', () => {
  it('should run shards through the supplied worker factory', async () => {
    const stub = stubWebWorker();
    const runner = createGeoSpecWebPoolRunner({ createWorker: () => stub.worker, workers: 1 });

    const result = await runner.run({ files: ['/a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
    expect(result.selectedTests).toBe(1);
  });

  it('should auto-size when the caller declares no worker count', async () => {
    const stub = stubWebWorker();
    const runner = createGeoSpecWebPoolRunner({ createWorker: async () => stub.worker, shardTimeout: 5000 });

    const result = await runner.run({ files: ['/a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
  });
});

describe('the web pool event hook', () => {
  it('should forward lifecycle events to the caller', async () => {
    const stub = stubWebWorker();
    const types: string[] = [];
    const runner = createGeoSpecWebPoolRunner({
      createWorker: () => stub.worker,
      workers: 1,
    });
    for (const type of ['run-start', 'file-start', 'file-complete', 'run-complete', 'close'] as const) {
      runner.on(type, (event) => types.push(event.type));
    }

    await runner.run({ files: ['/a.geospec.ts'] });
    await runner.close();

    expect(types).toStrictEqual(['run-start', 'file-start', 'file-complete', 'run-complete', 'close']);
  });
});
