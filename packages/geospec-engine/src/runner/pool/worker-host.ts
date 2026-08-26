/**
 * The code that runs INSIDE a pool worker.
 *
 * One resource scope and one cached model loader per **worker lifetime**, not
 * per shard — that is the entire payoff of affinity scheduling. A worker that
 * already loaded `housing.step` for shard 3 answers shard 11's identical
 * `loadModel(...)` from memory; the pool sends it shard 11 precisely because
 * it reported that load key.
 *
 * The scope disposes once, on shutdown. Disposing per shard would delete an
 * Emscripten handle the very next shard is about to reuse through the loader
 * cache — the D-10 double-delete that aborts the whole wasm instance.
 *
 * @module
 */

import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerHostOptions } from 'geospec/runner/worker';
import type { GeoSpecModuleBundleCache } from 'geospec/runner';
import { getGeoSpecEngineProtocol } from 'geospec/engine';
import { forensicSpanAsync, forwardProtocolForensicMeasurement } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { sanitizePoolResult } from '#runner/pool/transport.js';
import { createSerialRunContext, executeGeoSpecFile } from '#runner/serial.js';
import type { GeoSpecRunResult } from '#runner/types.js';
import { setOpenCascadeCompiledModule } from '#native/opencascade-module.js';

/** One place where an unknown throw becomes a message the host can read. */
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const collectedNames = (result: GeoSpecRunResult): string[] =>
  result.success ? result.tests.map((test) => [...test.suite, test.name].join(' > ')) : [];

/**
 * Serve shards until the host says shutdown.
 *
 * @param options - Worker filesystem, loaders, and message plumbing.
 * @public
 */
export const startGeoSpecPoolWorkerHost = (options: GeoSpecPoolWorkerHostOptions): void => {
  const runner = {
    filesystem: options.filesystem,
    ...(options.modelLoader ? { modelLoader: options.modelLoader } : {}),
    ...(options.stepLoader ? { stepLoader: options.stepLoader } : {}),
    ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
  };
  const context = createSerialRunContext(runner);
  const bundleCache: GeoSpecModuleBundleCache = new Map();

  // Shards arrive one at a time, but the host may post the next one before the
  // previous reply is observed; the chain keeps execution strictly serial
  // inside the worker (the OCCT heap is shared).
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): void => {
    // Settled either way: a rejected predecessor must not stall the queue.
    chain = (async () => {
      try {
        await chain;
      } finally {
        await work();
      }
    })();
  };

  const handle = async (message: GeoSpecPoolHostMessage): Promise<void> => {
    if (message.type === 'initialize') {
      try {
        if (message.compiledWasmModule) {
          setOpenCascadeCompiledModule(message.compiledWasmModule);
        }
        options.postMessage({ type: 'initialized' });
      } catch (error) {
        options.postMessage({ type: 'initialization-error', message: errorMessage(error) });
      }
      return;
    }
    if (message.type === 'shutdown') {
      bundleCache.clear();
      await context.resourceScope.dispose();
      await options.onShutdown?.();
      return;
    }

    if (message.type === 'list-tests') {
      try {
        const result = await executeGeoSpecFile({
          runner,
          context,
          file: message.file,
          collectOnly: true,
          bundleCache,
          ...(message.testTimeout === undefined ? {} : { testTimeout: message.testTimeout }),
          ...(message.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: message.matcherWallBackstop }),
          ...(message.forensic === undefined ? {} : { forensic: message.forensic }),
        });
        options.postMessage({
          type: 'tests-listed',
          shardId: message.shardId,
          file: message.file,
          names: collectedNames(result),
        });
      } catch (error) {
        options.postMessage({
          type: 'list-error',
          shardId: message.shardId,
          file: message.file,
          message: errorMessage(error),
        });
      }
      return;
    }

    const { shard } = message;
    options.postMessage({ type: 'file-start', shardId: shard.id, file: shard.file });
    context.beginFile();
    const forensicSink: ForensicSink | undefined =
      message.forensic === true
        ? ({ name, value, unit }) => {
            options.postMessage({ type: 'forensic', shardId: shard.id, name, value, unit });
          }
        : undefined;
    context.setForensicSink(forensicSink);
    const startedAt = performance.now();
    const unsubscribe =
      message.forensic === true
        ? getGeoSpecEngineProtocol()?.on('forensic-span', (event) => {
            forwardProtocolForensicMeasurement(event.payload, ({ name, value, unit }) => {
              options.postMessage({ type: 'forensic', shardId: shard.id, name, value, unit });
            });
          })
        : undefined;
    try {
      const result = await forensicSpanAsync(
        'runner.shard',
        async () =>
          executeGeoSpecFile({
            runner,
            context,
            file: shard.file,
            bundleCache,
            // A split shard's own pattern wins: it names exactly one test.
            ...(shard.testNamePattern === undefined
              ? message.testNamePattern === undefined
                ? {}
                : { testNamePattern: message.testNamePattern }
              : { testNamePattern: shard.testNamePattern }),
            ...(message.testTimeout === undefined ? {} : { testTimeout: message.testTimeout }),
            ...(message.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: message.matcherWallBackstop }),
            ...(message.forensic === undefined ? {} : { forensic: message.forensic }),
            ...(forensicSink === undefined ? {} : { forensicSink }),
          }),
        forensicSink,
      );
      const primaryLoadKey = context.fileLoadKey();
      const workerMemoryBytes = options.measureMemoryBytes?.();
      options.postMessage({
        type: 'shard-complete',
        shardId: shard.id,
        file: shard.file,
        result: sanitizePoolResult(result),
        durationMs: performance.now() - startedAt,
        ...(primaryLoadKey === undefined ? {} : { primaryLoadKey }),
        ...(workerMemoryBytes === undefined ? {} : { workerMemoryBytes }),
      });
    } catch (error) {
      options.postMessage({
        type: 'shard-error',
        shardId: shard.id,
        file: shard.file,
        message: errorMessage(error),
      });
    } finally {
      unsubscribe?.();
      context.setForensicSink();
    }
  };

  options.onHostMessage((message) => {
    enqueue(async () => handle(message));
  });
  options.postMessage({ type: 'ready' });
};
