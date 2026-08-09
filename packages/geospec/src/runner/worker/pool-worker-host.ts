/**
 * Platform-neutral pool-worker host (R3): the code that runs INSIDE each pool
 * worker. The Node entry (`runner/node/pool-worker-entry.ts`) and a browser
 * worker script both call this with their own filesystem/loaders and message
 * plumbing — one contract, two carriers (cross-platform matrix).
 *
 * The host keeps one resource scope and one cached model loader for the
 * worker's lifetime, so every shard scheduled onto this worker reuses loaded
 * subjects, ledgers, and proof contexts (the R9 affinity payoff).
 */

import { createCachedModelLoader } from '#runner/model-load-cache.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';
import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import { sanitizeRunResultForTransport } from '#runner/pool/transport.js';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import { setForensicShardPrefix } from '#runner/forensic.js';
import type { RunGeoSpecModuleOptions } from '#runner/types.js';

export type GeoSpecPoolWorkerHostOptions = {
  /** Filesystem containing the project and test modules. */
  filesystem: RunGeoSpecModuleOptions['filesystem'];
  /** Absolute project root path. */
  projectPath: string;
  /** Model loader exposed to authored tests through `geospec/model`. */
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  /** STEP loader exposed to authored tests through `geospec/step`. */
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
  /** Additional in-memory modules made available to the VM. */
  builtinModules?: RunGeoSpecModuleOptions['builtinModules'];
  /** Post a message to the pool host. */
  postMessage: (message: GeoSpecPoolWorkerMessage) => void;
  /** Subscribe to pool-host messages. */
  onHostMessage: (listener: (message: GeoSpecPoolHostMessage) => void) => void;
  /** Sample this worker's resident memory in bytes (R15 telemetry); optional. */
  measureMemoryBytes?: () => number | undefined;
  /** Release platform resources on shutdown (after the shared scope disposes). */
  onShutdown?: () => Promise<void> | void;
};

/** Start serving shards. Resolves when the host sends `shutdown`. */
export const startGeoSpecPoolWorkerHost = (options: GeoSpecPoolWorkerHostOptions): void => {
  const resourceScope = createGeoSpecResourceScope({});
  // Read through an accessor so control-flow analysis does not narrow the
  // closure-written value.
  let currentShardLoadKey: string | undefined;
  const takeShardLoadKey = (): string | undefined => currentShardLoadKey;
  const modelLoader = createCachedModelLoader(options.modelLoader, {
    onLoadResolved: (subject) => {
      resourceScope.trackSubject(subject);
    },
    onCacheKey: (key) => {
      currentShardLoadKey ??= key;
    },
  });

  // The pool dispatches at most one shard per worker, but chain anyway so a
  // straggling message can never interleave two module executions.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): void => {
    const previous = queue;
    queue = (async () => {
      await previous;
      await work();
    })();
  };

  options.onHostMessage((message) => {
    if (message.type === 'shutdown') {
      enqueue(async () => {
        await resourceScope.dispose();
        await options.onShutdown?.();
      });
      return;
    }
    if (message.type === 'list-tests') {
      enqueue(async () => {
        try {
          const listed = await runGeoSpecModule({
            filesystem: options.filesystem,
            projectPath: options.projectPath,
            entryPath: message.file,
            testTimeout: message.testTimeout,
            ...(modelLoader ? { modelLoader } : {}),
            ...(options.stepLoader ? { stepLoader: options.stepLoader } : {}),
            ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
            resourceScope,
            collectOnly: true,
          });
          if (!listed.success) {
            options.postMessage({
              type: 'list-error',
              shardId: message.shardId,
              file: message.file,
              message: listed.issues.map((issue) => issue.message).join('\n'),
            });
            return;
          }
          options.postMessage({
            type: 'tests-listed',
            shardId: message.shardId,
            file: message.file,
            names: listed.tests.map((test) => [...test.suite, test.name].join(' > ')),
          });
        } catch (error) {
          options.postMessage({
            type: 'list-error',
            shardId: message.shardId,
            file: message.file,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
      return;
    }
    const { shard, testNamePattern, testTimeout } = message;
    enqueue(async () => {
      setForensicShardPrefix(`s${shard.id}`);
      currentShardLoadKey = undefined;
      options.postMessage({ type: 'file-start', shardId: shard.id, file: shard.file });
      const startedAt = performance.now();
      try {
        const result = await runGeoSpecModule({
          filesystem: options.filesystem,
          projectPath: options.projectPath,
          entryPath: shard.file,
          testNamePattern: shard.testNamePattern ?? testNamePattern,
          testTimeout,
          ...(modelLoader ? { modelLoader } : {}),
          ...(options.stepLoader ? { stepLoader: options.stepLoader } : {}),
          ...(options.builtinModules ? { builtinModules: options.builtinModules } : {}),
          resourceScope,
        });
        const memory = options.measureMemoryBytes?.();
        const primaryLoadKey = takeShardLoadKey();
        options.postMessage({
          type: 'shard-complete',
          shardId: shard.id,
          file: shard.file,
          result: sanitizeRunResultForTransport(result),
          durationMs: performance.now() - startedAt,
          ...(primaryLoadKey === undefined ? {} : { primaryLoadKey }),
          ...(memory === undefined ? {} : { workerMemoryBytes: memory }),
        });
      } catch (error) {
        options.postMessage({
          type: 'shard-error',
          shardId: shard.id,
          file: shard.file,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  options.postMessage({ type: 'ready' });
};
