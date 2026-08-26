// @vitest-environment node
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { openCascadeWasmUrl } from '#native/opencascade-wasm.js';

const workerCount = 4;
const workerSource = `
  const { parentPort } = require('node:worker_threads');
  parentPort.on('message', async ({ kind, value }) => {
    try {
      if (kind === 'compile') await WebAssembly.compile(value);
      else WebAssembly.Module.exports(value);
      parentPort.postMessage({ ok: true });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error) });
    }
  });
`;

const sendAll = async (workers: readonly Worker[], message: unknown): Promise<void> => {
  const replies = workers.map(async (worker) => {
    const reply = new Promise<unknown>((resolve, reject) => {
      const onMessage = (value: unknown): void => {
        worker.off('error', onError);
        resolve(value);
      };
      const onError = (error: Error): void => {
        worker.off('message', onMessage);
        reject(error);
      };
      worker.once('message', onMessage);
      worker.once('error', onError);
    });
    worker.postMessage(message);
    expect(await reply).toEqual({ ok: true });
  });
  await Promise.all(replies);
};

describe('GeoSpec compiled-module fan-out benchmark', () => {
  it('retains the measured compile-once direction on the pinned runner', async () => {
    const bytes = Uint8Array.from(await readFile(new URL(openCascadeWasmUrl)));
    const workers = Array.from({ length: workerCount }, () => new Worker(workerSource, { eval: true }));
    await Promise.all(
      workers.map(async (worker) => {
        await once(worker, 'online');
      }),
    );

    try {
      const eachWorkerStarted = performance.now();
      await sendAll(workers, { kind: 'compile', value: bytes });
      /** Milliseconds. */
      const eachWorker = performance.now() - eachWorkerStarted;

      const hostCompileStarted = performance.now();
      const compiledModule = await WebAssembly.compile(bytes);
      /** Milliseconds. Reported separately because the fan-out comparison is O(N) compilation versus module delivery. */
      const hostCompile = performance.now() - hostCompileStarted;
      const sharedStarted = performance.now();
      await sendAll(workers, { kind: 'module', value: compiledModule });
      /** Milliseconds. */
      const sharedModule = performance.now() - sharedStarted;
      const speedup = eachWorker / sharedModule;

      console.log(
        JSON.stringify({
          case: 'geospec-occt-four-worker-compiled-module-fanout-v1',
          wasmSha256: createHash('sha256').update(bytes).digest('hex'),
          workerCount,
          warmups: 0,
          samples: 1,
          eachWorkerMilliseconds: eachWorker,
          hostCompileMilliseconds: hostCompile,
          sharedModuleMilliseconds: sharedModule,
          speedup,
        }),
      );
      expect(Number.isFinite(speedup)).toBe(true);
      if (Reflect.get(process.env, 'TAU_BENCHMARK_GATE') === '1') {
        expect(speedup).toBeGreaterThanOrEqual(5);
      }
    } finally {
      await Promise.all(workers.map(async (worker) => worker.terminate()));
    }
  }, 120_000);
});
