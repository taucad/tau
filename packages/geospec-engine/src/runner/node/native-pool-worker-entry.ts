/** Compiled Node pool worker: owns one protocol-3 engine per isolate. @module */

import { memoryUsage } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { Engine } from 'geospec-engine/node';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { RuntimeDefinition } from '@taucad/runtime';
import type * as NativeStore from '@taucad/native-process-core/store';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';

/** Rooted project and assigned caller-inclusive native CPU grant. @public */
export type NativePoolWorkerOptions = { projectPath: string; grant: number };
/** Parent-owned message boundary for the native worker. @public */
export type NativePoolPort = {
  postMessage(message: GeoSpecPoolWorkerMessage): void;
  on(event: 'message', listener: (message: GeoSpecPoolHostMessage) => void): void;
};

/**
 * Bind the native kernels a runtime lists to this machine's payload store: each one reads its sealed closure from a
 * launch index when it initialises (nothing is downloaded) and refuses with `KERNEL_NOT_PREPARED` until
 * `tau prepare <kernel>` seals it. The managed profile is read here, so a malformed one refuses the whole runtime
 * rather than each native kernel. Without `@taucad/native-process-core`, an optional peer, nothing native is listed.
 * @param runtime - The runtime the worker serves.
 */
const bindNativeKernelsToStore = async (runtime: RuntimeDefinition): Promise<void> => {
  const { readManagedPreparation } = await import('@taucad/runtime/preparation/node');
  const managed = readManagedPreparation(process.env);
  let store: typeof NativeStore;
  try {
    store = await import('@taucad/native-process-core/store');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return;
    }
    throw error;
  }
  const { resolveRuntimeDefinition } = await import('@taucad/runtime/worker');
  if (store.nativeDeploymentsOf(await resolveRuntimeDefinition(runtime, undefined)).length > 0) {
    store.installNativeClosureResolver(store.storeClosureResolver({ managed }));
  }
};

/**
 * Construct, serve, and clean up a native engine entirely inside this worker.
 * @param port - Parent message port.
 * @param options - Project and assigned caller-inclusive grant.
 * @public
 */
export const startNativePoolWorker = (port: NativePoolPort, options: NativePoolWorkerOptions): void => {
  const engine = new Engine(undefined, options.grant);
  try {
    const filesystem = createNodeVmFileSystem(options.projectPath);
    const nativeModelLoader = createGeoSpecNativeModelLoader({
      engine,
      projectPath: options.projectPath,
      runtime: async () => {
        const [{ createNodeClient }, { defaultRuntime }] = await Promise.all([
          import('@taucad/runtime/node'),
          import('#model/default-runtime.js'),
        ]);
        await bindNativeKernelsToStore(defaultRuntime);
        return createNodeClient({ runtime: defaultRuntime, projectPath: options.projectPath });
      },
      readSource: async (source) => {
        if (typeof source !== 'string') {
          throw new TypeError('Native Node pool direct sources must be project-rooted paths or bytes.');
        }
        return filesystem.readFile(source);
      },
    });
    startGeoSpecPoolWorkerHost({
      filesystem,
      nativeAssertions: { engine },
      nativeModelLoader,
      postMessage: (message) => {
        port.postMessage(message);
      },
      onHostMessage: (listener) => {
        port.on('message', listener);
      },
      measureMemoryBytes: () => {
        const usage = memoryUsage();
        return usage.heapUsed + usage.external;
      },
      onShutdown: () => {
        engine.close();
      },
    });
  } catch (error) {
    engine.close();
    throw error;
  }
};

if (parentPort !== null) {
  try {
    startNativePoolWorker(parentPort, workerData as NativePoolWorkerOptions);
  } catch (error) {
    parentPort.postMessage({
      type: 'initialization-error',
      message: error instanceof Error ? error.message : String(error),
    });
    parentPort.close();
  }
}
