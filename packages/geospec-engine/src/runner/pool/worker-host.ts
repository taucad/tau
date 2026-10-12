/**
 * The code that runs INSIDE a pool worker.
 *
 * Authored model loads are never memoized across shards: every load retains
 * its own fresh source, variant and opaque subject through the native model
 * loader. Every shard and collection pass releases those subjects before it
 * settles (per-load freshness), because the engine retains at most 32 subjects
 * and one large STEP subject holds hundreds of megabytes.
 *
 * @module
 */

import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage, GeoSpecRunnerOptions } from 'geospec/runner/worker';
import type { GeoSpecModuleBundleCache } from 'geospec/runner';
import type { ManagedGeoSpecNativeModelLoader } from 'geospec/runner/native';
import { forensicSpanAsync } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { sanitizePoolResult } from '#runner/pool/transport.js';
import { executeGeoSpecFile } from '#runner/serial.js';
import type { GeoSpecRunResult } from '#runner/types.js';

/**
 * Options accepted by {@link startGeoSpecPoolWorkerHost}.
 *
 * @public
 */
export type GeoSpecPoolWorkerHostOptions = {
  /** Filesystem containing the project and test modules. */
  filesystem: GeoSpecRunnerOptions['filesystem'];
  /** Native assertion client shared with this worker's model admissions. */
  nativeAssertions: GeoSpecRunnerOptions['nativeAssertions'];
  /** Managed native admissions, released after every shard and collection pass and before shutdown. */
  nativeModelLoader: ManagedGeoSpecNativeModelLoader;
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: GeoSpecRunnerOptions['builtinModules'];
  /** Post a message to the pool host. */
  postMessage: (message: GeoSpecPoolWorkerMessage) => void;
  /** Subscribe to pool-host messages. */
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void;
  /** Sample this worker's resident memory in bytes (R15 telemetry); optional. */
  measureMemoryBytes?: () => number | undefined;
  /** Release platform resources on shutdown, after the native subjects are released. */
  onShutdown?: () => Promise<void> | void;
};

/** One place where an unknown throw becomes a message the host can read. */
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const collectedNames = (result: GeoSpecRunResult): string[] =>
  result.success ? result.tests.map((test) => [...test.suite, test.name].join(' > ')) : [];

/**
 * Serve shards until the host says shutdown.
 *
 * @param options - Worker filesystem, native engine, and message plumbing.
 * @public
 */
export const startGeoSpecPoolWorkerHost = (options: GeoSpecPoolWorkerHostOptions): void => {
  const runner: GeoSpecRunnerOptions = {
    filesystem: options.filesystem,
    nativeAssertions: options.nativeAssertions,
    nativeModelLoader: options.nativeModelLoader,
    ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
  };
  const bundleCache: GeoSpecModuleBundleCache = new Map();
  const releaseNativeSubjects = async (): Promise<void> => {
    await options.nativeModelLoader.releaseAll();
  };
  /**
   * Release a pass's native subjects, then post its one settlement. Released after the settlement, a
   * failure could only surface as an initialization-error, which retires a worker whose pass had settled.
   *
   * @param reply - The pass's settlement before release.
   * @param failed - Builds the pass's error settlement.
   */
  const releaseAndSettle = async (
    reply: GeoSpecPoolWorkerMessage,
    failed: (error: unknown) => GeoSpecPoolWorkerMessage,
  ): Promise<void> => {
    let settlement = reply;
    try {
      await releaseNativeSubjects();
    } catch (error) {
      // A pass that already failed keeps reporting its own failure.
      if (reply.type !== 'shard-error' && reply.type !== 'list-error') {
        settlement = failed(error);
      }
    }
    try {
      options.postMessage(settlement);
    } catch (error) {
      // A reply the host cannot structured-clone must still settle its pass.
      options.postMessage(failed(error));
    }
  };

  // Shards arrive one at a time, but the host may post the next one before the
  // previous reply is observed; the chain keeps execution strictly serial
  // inside the worker (the worker owns one native engine).
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): void => {
    const predecessor = chain;
    chain = (async () => {
      try {
        await predecessor;
      } catch {
        // A rejected predecessor must not stall shutdown behind it.
      }
      try {
        await work();
      } catch (error) {
        try {
          options.postMessage({ type: 'initialization-error', message: errorMessage(error) });
        } catch {
          // A closed message port has no remaining receiver; do not leak a
          // rejected queue promise after its worker has been torn down.
        }
      }
    })();
  };

  const handle = async (message: GeoSpecPoolHostMessage): Promise<void> => {
    if (message.type === 'initialize') {
      options.postMessage({ type: 'initialized' });
      return;
    }
    if (message.type === 'shutdown') {
      bundleCache.clear();
      let failed = false;
      let failure: unknown;
      try {
        await releaseNativeSubjects();
      } catch (error) {
        failed = true;
        failure = error;
      }
      try {
        await options.onShutdown?.();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
      if (failed) {
        options.postMessage({ type: 'initialization-error', message: errorMessage(failure) });
        return;
      }
      // Cleanup acknowledgement over the existing worker wire.
      options.postMessage({ type: 'initialized' });
      return;
    }

    if (message.type === 'list-tests') {
      const listFailed = (error: unknown): GeoSpecPoolWorkerMessage => ({
        type: 'list-error',
        shardId: message.shardId,
        file: message.file,
        message: errorMessage(error),
      });
      let reply: GeoSpecPoolWorkerMessage;
      try {
        const result = await executeGeoSpecFile({
          runner,
          file: message.file,
          collectOnly: true,
          bundleCache,
          ...(message.testTimeout === undefined ? {} : { testTimeout: message.testTimeout }),
          ...(message.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: message.matcherWallBackstop }),
          ...(message.forensic === undefined ? {} : { forensic: message.forensic }),
        });
        reply = { type: 'tests-listed', shardId: message.shardId, file: message.file, names: collectedNames(result) };
      } catch (error) {
        reply = listFailed(error);
      }
      await releaseAndSettle(reply, listFailed);
      return;
    }

    const { shard } = message;
    options.postMessage({ type: 'file-start', shardId: shard.id, file: shard.file });
    const forensicSink: ForensicSink | undefined =
      message.forensic === true
        ? ({ name, value, unit }) => {
            options.postMessage({ type: 'forensic', shardId: shard.id, name, value, unit });
          }
        : undefined;
    const startedAt = performance.now();
    const shardFailed = (error: unknown): GeoSpecPoolWorkerMessage => ({
      type: 'shard-error',
      shardId: shard.id,
      file: shard.file,
      message: errorMessage(error),
    });
    let reply: GeoSpecPoolWorkerMessage;
    try {
      const result = await forensicSpanAsync(
        'runner.shard',
        async () =>
          executeGeoSpecFile({
            runner,
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
      const workerMemoryBytes = options.measureMemoryBytes?.();
      reply = {
        type: 'shard-complete',
        shardId: shard.id,
        file: shard.file,
        result: sanitizePoolResult(result),
        durationMs: performance.now() - startedAt,
        ...(workerMemoryBytes === undefined ? {} : { workerMemoryBytes }),
      };
    } catch (error) {
      reply = shardFailed(error);
    }
    await releaseAndSettle(reply, shardFailed);
  };

  options.onHostMessage((message) => {
    enqueue(async () => handle(message));
  });
  options.postMessage({ type: 'ready' });
};
