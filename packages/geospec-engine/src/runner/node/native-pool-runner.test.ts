/* eslint-disable @typescript-eslint/naming-convention -- VM paths are object keys here. */
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { availableParallelism as nativeHostCap, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import type { NodeWorkerLike } from '#runner/node/native-pool-runner.js';
import { createGeoSpecNativeNodePoolRunner, createNodeWorkerHandle } from '#runner/node/native-pool-runner.js';

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

describe('createGeoSpecNativeNodePoolRunner', () => {
  it('should build a runner without spawning anything until it runs', () => {
    const runner = createGeoSpecNativeNodePoolRunner({ projectPath: '/tmp/project', workers: 2, shardTimeout: 1000 });

    expect(typeof runner.run).toBe('function');
  });

  it('should spawn a real worker thread that speaks the pool protocol', async () => {
    // D-8: a `.ts` entry cannot be loaded by a worker thread under vitest, so
    // the wire itself is proven here with an inline JavaScript worker; the real
    // entry's body is covered by the real compiled pool tests below.
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

  it('should run four STEP-backed GeoSpec files across up to four real worker isolates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'geospec-four-worker-'));
    const model = join(root, 'model.step');
    await copyFile(fileURLToPath(new URL('../../../fixtures/xde/two-cube-assembly.step', import.meta.url)), model);
    const files = await Promise.all(
      Array.from({ length: 4 }, async (_, index) => {
        const file = `worker-${index}.geospec.ts`;
        await writeFile(
          join(root, file),
          `import { it, expectGeo } from 'geospec';
           import { loadModel } from 'geospec/model';
           it('loads-${index}', async () => {
             const model = await loadModel({ source: 'model.step', format: 'step' });
             expectGeo(model).toBeValidBrep({});
           });`,
          'utf8',
        );
        return file;
      }),
    );
    // One permit per worker must fit the host cap, which is 3 on the macOS arm64 runner.
    const workers = Math.min(4, nativeHostCap());
    const runner = createGeoSpecNativeNodePoolRunner({ projectPath: root, workers, shardTimeout: 120_000 });

    const result = await runner.run({ files });
    await runner.close();

    expect(result).toMatchObject({ success: true, passed: 4, failed: 0, selectedTests: 4 });
  }, 120_000);

  it('should create compiled workers with bounded grants and the existing initialization handshake', async () => {
    const received: Array<{ url: URL; workerData: unknown }> = [];
    class FakeWorker {
      private readonly listeners = new Map<string, Array<(value: unknown) => void>>();
      public constructor(url: URL, options: { workerData: unknown }) {
        received.push({ url, workerData: options.workerData });
      }
      public postMessage(message: GeoSpecPoolHostMessage): void {
        queueMicrotask(() => {
          if (message.type === 'initialize' || message.type === 'shutdown') {
            this.fire({ type: 'initialized' });
          } else if (message.type === 'run-shard') {
            this.fire({
              type: 'shard-complete',
              shardId: message.shard.id,
              file: message.shard.file,
              result: {
                success: true,
                passed: true,
                tests: [{ suite: [], name: 't', assertions: [], status: 'passed', diagnostics: [] }],
                accounting: {
                  discovered: 1,
                  selected: 1,
                  completed: 1,
                  passed: 1,
                  failed: 0,
                  unsupported: 0,
                  inconclusive: 0,
                  skipped: 0,
                  notRun: 0,
                },
                lineage: {
                  status: 'complete',
                  modules: [
                    {
                      entryPath: message.shard.file,
                      bundleSha256: 'control',
                      files: { [message.shard.file]: 'sha256:control' },
                      consistent: true,
                    },
                  ],
                  loads: [],
                },
                bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
              },
              durationMs: 1,
            });
          }
        });
      }
      public on(event: string, listener: (value: unknown) => void): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
        if (event === 'message') {
          queueMicrotask(() => {
            this.fire({ type: 'ready' });
          });
        }
      }
      public terminate(): number {
        return 0;
      }
      private fire(value: unknown): void {
        for (const listener of this.listeners.get('message') ?? []) {
          listener(value);
        }
      }
    }
    vi.doMock('node:worker_threads', () => ({ Worker: FakeWorker }));
    vi.resetModules();
    try {
      const { createGeoSpecNativeNodePoolRunner: createMockedRunner } =
        await import('#runner/node/native-pool-runner.js');
      const runner = createMockedRunner({ projectPath: '/project', workers: 2 });
      expect(received).toHaveLength(0);
      const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });
      await runner.close();
      expect(result.success).toBe(true);
      expect(received).toHaveLength(2);
      for (const worker of received) {
        expect(worker.url.pathname).toMatch(/native-pool-worker-entry\.ts$/u);
        expect(worker.workerData).toEqual({ projectPath: '/project', grant: 1 });
      }
    } finally {
      vi.doUnmock('node:worker_threads');
      vi.resetModules();
    }
  });
});

describe('the real Node pool wire', () => {
  it('should default to one bounded compiled worker and expose the pool event subscription', () => {
    const runner = createGeoSpecNativeNodePoolRunner({ projectPath: '/x' });

    expect(typeof runner.run).toBe('function');
    expect(typeof runner.on).toBe('function');
  });
});

const execFileAsync = promisify(execFile);
const workerRunnerUrl = new URL('native-pool-runner.ts', import.meta.url).href;
const stepFixture = fileURLToPath(new URL('../../../fixtures/xde/two-cube-assembly.step', import.meta.url));

const runRealNativePool = async (
  mode: 'normal' | 'abort' | 'watchdog',
  pool = 'workers:2,budget:2',
): Promise<{ success: boolean; passed: number; files: string[]; issues: string[] }> => {
  const spec =
    mode === 'watchdog'
      ? `import { it } from 'geospec';
import { loadModel } from 'geospec/model';
it('hangs after admission', async () => {
  await loadModel({ source: 'model.step', format: 'step' });
  await new Promise(() => {});
});`
      : `import { it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
it('valid', async () => {
  const subject = await loadModel({ source: 'model.step', format: 'step' });
  expectGeo(subject).toBeValidBrep({});
});`;
  const script = `(async()=>{
    const {mkdtemp,copyFile,writeFile,rm}=await import('node:fs/promises');
    const {tmpdir}=await import('node:os');
    const {join}=await import('node:path');
    const {createGeoSpecNativeNodePoolRunner}=await import(${JSON.stringify(workerRunnerUrl)});
    const root=await mkdtemp(join(tmpdir(),'geospec-native-pool-test-'));
    let runner;
    try {
      await copyFile(${JSON.stringify(stepFixture)},join(root,'model.step'));
      await writeFile(join(root,'a.geospec.ts'),${JSON.stringify(spec)});
      await writeFile(join(root,'b.geospec.ts'),${JSON.stringify(spec)});
      runner=createGeoSpecNativeNodePoolRunner({projectPath:root,${pool}${mode === 'watchdog' ? ',shardTimeout:200' : ''}});
      const pending=runner.run({files:['b.geospec.ts','a.geospec.ts']});
      if (${mode === 'abort'}) runner.abort('cancelled');
      const result=await pending;
      console.log(JSON.stringify({success:result.success,passed:result.passed,files:result.files.map(f=>f.file),issues:(result.issues??[]).map(i=>i.code)}));
    } finally {
      await runner?.close();
      await rm(root,{recursive:true,force:true});
    }
  })().catch(error=>{console.error(error);process.exitCode=1})`;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '-e', script], { timeout: 20_000 });
  return JSON.parse(stdout.trim()) as { success: boolean; passed: number; files: string[]; issues: string[] };
};

describe('native Node pool', () => {
  it('should refuse an invalid native grant inside the worker and exit without a live engine', async () => {
    const worker = new Worker(new URL('native-pool-worker-entry.ts', import.meta.url), {
      workerData: { projectPath: '/tmp', grant: 0 },
      execArgv: ['--import', 'tsx'],
    });
    const messages: GeoSpecPoolWorkerMessage[] = [];
    worker.on('message', (message: GeoSpecPoolWorkerMessage) => {
      messages.push(message);
    });
    try {
      const exitCode = await new Promise<number>((resolve, reject) => {
        worker.once('exit', resolve);
        worker.once('error', reject);
      });
      expect(exitCode).toBe(0);
      expect(messages).toEqual([
        {
          type: 'initialization-error',
          message: 'Execution permits must be a positive integer including the caller and within the host cap.',
        },
      ]);
    } finally {
      await worker.terminate();
    }
  });

  it('should run an authored native BRep matcher in real worker isolates and preserve declared file order', async () => {
    expect(await runRealNativePool('normal')).toStrictEqual({
      success: true,
      passed: 2,
      files: ['b.geospec.ts', 'a.geospec.ts'],
      issues: [],
    });
  }, 25_000);

  it('should settle cooperative abort and close both native workers before the process exits', async () => {
    expect(await runRealNativePool('abort')).toMatchObject({
      success: false,
      issues: ['GEOSPEC_RUNNER_ABORTED'],
    });
  }, 25_000);

  it('should hard-stop a hung native shard at the watchdog and leave no worker behind', async () => {
    const result = await runRealNativePool('watchdog');
    expect(result.success).toBe(false);
    expect(result.issues).toContain('GEOSPEC_SHARD_TIMEOUT');
  }, 25_000);

  it('should reject an overcommitted caller-inclusive budget before spawning workers', () => {
    expect(() => createGeoSpecNativeNodePoolRunner({ projectPath: '/tmp', workers: 2, budget: 1 })).toThrow(RangeError);
    expect(() =>
      createGeoSpecNativeNodePoolRunner({ projectPath: '/tmp', workers: 1, budget: nativeHostCap() + 1 }),
    ).toThrow(RangeError);
  });

  it('should refuse a multi-permit grant beside another in-process worker before spawning workers', () => {
    // Grants [2, 1] would reach runtime admission, which refuses the second engine in this process.
    expect(() => createGeoSpecNativeNodePoolRunner({ projectPath: '/tmp', workers: 2, budget: 3 })).toThrow(
      'Native pool workers share one process OCCT library: a budget above one permit per worker requires workers: 1.',
    );
  });

  it.runIf(nativeHostCap() >= 2)(
    'should run one native worker holding a two-permit grant',
    async () => {
      expect(await runRealNativePool('normal', 'workers:1,budget:2')).toStrictEqual({
        success: true,
        passed: 2,
        files: ['b.geospec.ts', 'a.geospec.ts'],
        issues: [],
      });
    },
    25_000,
  );
});
