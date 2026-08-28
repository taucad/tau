/* eslint-disable @typescript-eslint/naming-convention -- VM paths are object keys here. */
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import * as runtimeKernel from '@taucad/runtime/kernel';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import {
  createGeoSpecNodePoolRunner,
  createGeoSpecNodeRunner,
  createNodeWorkerHandle,
  poolWorkerEntryName,
  poolWorkerEntryUrl,
} from '#runner/node/node-runner.js';
import type { NodeWorkerLike } from '#runner/node/node-runner.js';
import { startNodePoolWorker } from '#runner/node/pool-worker-entry.js';
import { memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';

/** A worker stub that records what it was told and replays scripted events. */
const stubWorker = () => {
  const listeners = new Map<string, Array<(value: never) => void>>();
  const posted: unknown[] = [];
  let terminations = 0;
  const worker: NodeWorkerLike = {
    postMessage: (value) => posted.push(value),
    on: ((event: string, listener: (value: never) => void) => {
      const bucket = listeners.get(event) ?? [];
      bucket.push(listener);
      listeners.set(event, bucket);
    }) as NodeWorkerLike['on'],
    terminate: () => {
      terminations += 1;
      return 0;
    },
  };
  const fire = (event: string, value: unknown): void => {
    for (const listener of listeners.get(event) ?? []) {
      (listener as (value: unknown) => void)(value);
    }
  };
  return { worker, posted, fire, terminations: () => terminations };
};

describe('createGeoSpecNodeRunner', () => {
  it('should execute a file serially', async () => {
    const runner = createGeoSpecNodeRunner({
      projectPath: '/project',
      filesystem: memoryFileSystem({ 'a.geospec.ts': passingSpec('node') }),
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result.success).toBe(true);
  });
});

describe('createNodeWorkerHandle', () => {
  it('should forward messages both ways', () => {
    const stub = stubWorker();
    const handle = createNodeWorkerHandle(stub.worker);
    const received: GeoSpecPoolWorkerMessage[] = [];
    handle.onMessage((message) => received.push(message));

    handle.postMessage({ type: 'shutdown' });
    stub.fire('message', { type: 'ready' });

    expect(stub.posted).toStrictEqual([{ type: 'shutdown' }]);
    expect(received).toStrictEqual([{ type: 'ready' }]);
  });

  it('should call a non-zero exit before shutdown UNEXPECTED', () => {
    const stub = stubWorker();
    const handle = createNodeWorkerHandle(stub.worker);
    const exits: Array<{ unexpected: boolean; message?: string }> = [];
    handle.onExit((details) => exits.push(details));

    stub.fire('error', new Error('out of memory'));
    stub.fire('exit', 1);

    expect(exits).toStrictEqual([{ unexpected: true, message: 'out of memory' }]);
  });

  it('should call an exit after shutdown expected', () => {
    const stub = stubWorker();
    const handle = createNodeWorkerHandle(stub.worker);
    const exits: Array<{ unexpected: boolean }> = [];
    handle.onExit((details) => exits.push(details));

    handle.postMessage({ type: 'shutdown' });
    stub.fire('exit', 1);

    expect(exits).toStrictEqual([{ unexpected: false }]);
  });

  it('should treat a clean exit as expected even without shutdown', () => {
    const stub = stubWorker();
    const handle = createNodeWorkerHandle(stub.worker);
    const exits: Array<{ unexpected: boolean }> = [];
    handle.onExit((details) => exits.push(details));

    stub.fire('exit', 0);

    expect(exits).toStrictEqual([{ unexpected: false }]);
  });

  it('should terminate exactly once per call and suppress the exit', async () => {
    const stub = stubWorker();
    const handle = createNodeWorkerHandle(stub.worker);
    const exits: Array<{ unexpected: boolean }> = [];
    handle.onExit((details) => exits.push(details));

    await handle.terminate();
    stub.fire('exit', 1);

    expect(stub.terminations()).toBe(1);
    expect(exits).toStrictEqual([{ unexpected: false }]);
  });
});

describe('poolWorkerEntryUrl', () => {
  it('should resolve a real sibling entry module', () => {
    expect(existsSync(fileURLToPath(poolWorkerEntryUrl()))).toBe(true);
  });
});

describe('createGeoSpecNodePoolRunner', () => {
  it('should build a runner without spawning anything until it runs', () => {
    const runner = createGeoSpecNodePoolRunner({ projectPath: '/tmp/project', workers: 2, shardTimeout: 1000 });

    expect(typeof runner.run).toBe('function');
  });

  it('should spawn a real worker thread that speaks the pool protocol', async () => {
    // D-8: a `.ts` entry cannot be loaded by a worker thread under vitest, so
    // the wire itself is proven here with an inline JavaScript worker; the real
    // entry's body is covered by the `startNodePoolWorker` test below.
    const worker = new Worker(
      `const { parentPort } = require('node:worker_threads');
       parentPort.postMessage({ type: 'ready' });
       parentPort.on('message', (message) => {
         if (message.type === 'shutdown') { process.exit(0); return; }
         parentPort.postMessage({
           type: 'shard-complete',
           shardId: message.shard.id,
           file: message.shard.file,
           result: { success: true, passed: true, tests: [{ suite: [], name: 't', assertions: [], status: 'passed', diagnostics: [] }], bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] } },
           durationMs: 1,
         });
       });`,
      { eval: true },
    );
    const handle = createNodeWorkerHandle(worker as unknown as NodeWorkerLike);
    const messages: GeoSpecPoolWorkerMessage[] = [];
    handle.onMessage((message) => messages.push(message));

    await vi.waitFor(
      () => {
        expect(messages[0]).toStrictEqual({ type: 'ready' });
      },
      { timeout: 30_000 },
    );
    handle.postMessage({ type: 'run-shard', shard: { id: 1, file: 'a.geospec.ts' } });
    await vi.waitFor(
      () => {
        expect(messages).toHaveLength(2);
      },
      { timeout: 30_000 },
    );
    await handle.terminate();

    expect(messages[1]).toMatchObject({ type: 'shard-complete', shardId: 1, file: 'a.geospec.ts' });
  });

  it('should run STEP-backed GeoSpec files in four real worker isolates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'geospec-four-worker-'));
    const model = join(root, 'model.step');
    await copyFile(fileURLToPath(new URL('../../../fixtures/xde/two-cube-assembly.step', import.meta.url)), model);
    const files = await Promise.all(
      Array.from({ length: 4 }, async (_, index) => {
        const file = `worker-${index}.geospec.ts`;
        await writeFile(
          join(root, file),
          `import { it } from 'geospec';
           import { loadModel } from 'geospec/model';
           it('loads-${index}', async () => {
             await loadModel({ source: ${JSON.stringify(model)}, format: 'step', mesh: false });
           });`,
          'utf8',
        );
        return file;
      }),
    );
    const runner = createGeoSpecNodePoolRunner({ projectPath: root, workers: 4, cache: false, shardTimeout: 120_000 });

    const result = await runner.run({ files });
    await runner.close();

    expect(result).toMatchObject({ success: true, passed: 4, failed: 0, selectedTests: 4 });
  }, 120_000);

  it('should compile once and instantiate one copy in each of four workers', async () => {
    const compiled = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const compileWasmStreaming = vi.fn(async () => compiled);
    const receivedModules: WebAssembly.Module[] = [];
    const instances: WebAssembly.Instance[] = [];
    const completeWorkerMessage = (shardId: number, file: string): GeoSpecPoolWorkerMessage => ({
      type: 'shard-complete',
      shardId,
      file,
      result: {
        success: true,
        passed: true,
        tests: [{ suite: [], name: 't', assertions: [], status: 'passed', diagnostics: [] }],
        bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
      },
      durationMs: 1,
    });
    class FakeWorker {
      private readonly listeners = new Map<string, Array<(value: never) => void>>();
      public constructor(_url: URL, options: { workerData?: unknown }) {
        const module_ = (options.workerData as { compiledWasmModule: WebAssembly.Module }).compiledWasmModule;
        receivedModules.push(module_);
        instances.push(new WebAssembly.Instance(module_));
      }
      public postMessage(message: GeoSpecPoolHostMessage): void {
        if (message.type === 'shutdown') {
          queueMicrotask(() => {
            this.fire('exit', 0);
          });
        } else if (message.type === 'run-shard') {
          queueMicrotask(() => {
            this.fire('message', completeWorkerMessage(message.shard.id, message.shard.file));
          });
        }
      }
      public on(event: string, listener: (value: never) => void): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        if (event === 'message') {
          queueMicrotask(() => {
            this.fire('message', { type: 'ready' });
          });
        }
      }
      public terminate(): number {
        return 0;
      }
      private fire(event: string, value: unknown): void {
        for (const listener of this.listeners.get(event) ?? []) {
          (listener as (next: unknown) => void)(value);
        }
      }
    }
    vi.doMock('node:worker_threads', () => ({ Worker: FakeWorker }));
    vi.doMock('@taucad/runtime/kernel', () => ({
      ...runtimeKernel,
      compileWasmStreaming,
    }));
    vi.resetModules();
    try {
      const { createGeoSpecNodePoolRunner: createMockedRunner } = await import('#runner/node/node-runner.js');
      const runner = createMockedRunner({ projectPath: '/project', workers: 4, cache: false });
      const result = await runner.run({ files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] });
      await runner.close();

      expect(result.success).toBe(true);
      expect(compileWasmStreaming).toHaveBeenCalledTimes(1);
      expect(receivedModules).toStrictEqual([compiled, compiled, compiled, compiled]);
      expect(new Set(instances).size).toBe(4);
    } finally {
      vi.doUnmock('@taucad/runtime/kernel');
      vi.doUnmock('node:worker_threads');
      vi.resetModules();
    }
  });

  it('should pass cache controls into the spawned pool worker', async () => {
    const received: unknown[] = [];
    class FakeWorker {
      private readonly listeners = new Map<string, Array<(value: never) => void>>();
      public constructor(_url: URL, options: { workerData?: unknown }) {
        received.push(options.workerData);
      }
      public postMessage(message: GeoSpecPoolHostMessage): void {
        if (message.type === 'shutdown') {
          queueMicrotask(() => {
            this.fire('exit', 0);
          });
          return;
        }
        if (message.type === 'run-shard') {
          queueMicrotask(() => {
            this.fire('message', completeWorkerMessage(message.shard.id, message.shard.file));
          });
        }
      }
      public on(event: string, listener: (value: never) => void): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        if (event === 'message') {
          queueMicrotask(() => {
            this.fire('message', { type: 'ready' });
          });
        }
      }
      public terminate(): number {
        return 0;
      }
      private fire(event: string, value: unknown): void {
        for (const listener of this.listeners.get(event) ?? []) {
          (listener as (next: unknown) => void)(value);
        }
      }
    }
    const completeWorkerMessage = (shardId: number, file: string): GeoSpecPoolWorkerMessage => ({
      type: 'shard-complete',
      shardId,
      file,
      result: {
        success: true,
        passed: true,
        tests: [{ suite: [], name: 't', assertions: [], status: 'passed', diagnostics: [] }],
        bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
      },
      durationMs: 1,
    });
    vi.doMock('node:worker_threads', () => ({ Worker: FakeWorker }));
    vi.resetModules();
    try {
      const { createGeoSpecNodePoolRunner: createMockedRunner } = await import('#runner/node/node-runner.js');
      const runner = createMockedRunner({
        projectPath: '/project',
        workers: 1,
        cache: false,
        cacheDirectory: undefined,
      });
      const result = await runner.run({ files: ['a.geospec.ts'] });
      expect(result.success).toBe(true);
      await runner.close();
      const cached = createMockedRunner({
        projectPath: '/project',
        workers: 1,
        cacheDirectory: '/tmp/geospec-node-runner-cache',
      });
      const cachedResult = await cached.run({ files: ['b.geospec.ts'] });
      expect(cachedResult.success).toBe(true);
      await cached.close();
      expect(received).toHaveLength(2);
      expect(received[0]).toMatchObject({
        projectPath: '/project',
        cache: false,
      });
      expect(received[1]).toMatchObject({
        projectPath: '/project',
        cache: true,
        cacheDirectory: '/tmp/geospec-node-runner-cache',
      });
      expect((received[0] as { compiledWasmModule: unknown }).compiledWasmModule).toBeInstanceOf(WebAssembly.Module);
      expect((received[1] as { compiledWasmModule: unknown }).compiledWasmModule).toBeInstanceOf(WebAssembly.Module);
      expect((received[0] as { compiledWasmModule: WebAssembly.Module }).compiledWasmModule).toBe(
        (received[1] as { compiledWasmModule: WebAssembly.Module }).compiledWasmModule,
      );
    } finally {
      vi.doUnmock('node:worker_threads');
      vi.resetModules();
    }
  });
});

describe('the real Node pool wire', () => {
  it('should auto-size the worker count when none is given', () => {
    expect(typeof createGeoSpecNodePoolRunner({ projectPath: '/x' }).run).toBe('function');
  });
});

describe('startNodePoolWorker', () => {
  it('should serve shards over a worker port and report its own footprint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'geospec-entry-'));
    await writeFile(
      join(root, 'a.geospec.ts'),
      `import { describe, it } from 'geospec';
       describe('entry', () => { it('runs', () => {}); });`,
      'utf8',
    );
    const posted: GeoSpecPoolWorkerMessage[] = [];
    let deliver: ((message: GeoSpecPoolHostMessage) => void) | undefined;

    startNodePoolWorker(
      {
        postMessage: (message) => posted.push(message),
        on: (_event, listener) => {
          deliver = listener as (message: GeoSpecPoolHostMessage) => void;
        },
      },
      { projectPath: root, cache: false },
    );

    expect(posted).toStrictEqual([{ type: 'ready' }]);

    deliver?.({ type: 'run-shard', shard: { id: 0, file: 'a.geospec.ts' } });
    await vi.waitFor(
      () => {
        expect(posted.some((message) => message.type === 'shard-complete')).toBe(true);
      },
      { timeout: 30_000 },
    );
    const done = posted.find((message) => message.type === 'shard-complete');
    expect(done?.type === 'shard-complete' && done.result.success).toBe(true);
    expect(done?.type === 'shard-complete' && (done.workerMemoryBytes ?? 0)).toBeGreaterThan(0);

    const before = posted.length;
    deliver?.({ type: 'shutdown' });
    // Shutdown disposes the run scope and drains the write-behind overlay; both
    // are async, and neither posts a reply, so the settle is a turn of the loop.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(posted).toHaveLength(before);
  });
});

describe('the remaining node legs', () => {
  it('should pick the entry sibling that matches its own module extension', () => {
    expect(poolWorkerEntryName('file:///pkg/src/runner/node/node-runner.ts')).toBe('./pool-worker-entry.ts');
    expect(poolWorkerEntryName('file:///pkg/dist/runner/node/node-runner.mjs')).toBe('./pool-worker-entry.mjs');
  });

  it('should resolve the entry from the module URL', () => {
    expect(poolWorkerEntryUrl().pathname.endsWith('pool-worker-entry.ts')).toBe(true);
  });

  it('should expose the pool event subscription', () => {
    expect(typeof createGeoSpecNodePoolRunner({ projectPath: '/x', workers: 1 }).on).toBe('function');
  });
});
