/** Compiled Node pool worker: owns one protocol-3 engine per isolate. @module */

import { memoryUsage } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { Engine } from 'geospec-engine/node';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { RuntimeDefinition } from '@taucad/runtime';
import type { PluginInstance } from '@taucad/runtime/plugin';
import type * as NativeKernelRoster from '@taucad/native-kernels/node';
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
 * Every native kernel whose closure the shared payload store holds sealed, loaded through the roster in
 * `@taucad/native-kernels`, an optional peer: without it, or with nothing prepared, the portable defaults run alone.
 * Launch indexes only, so nothing is downloaded.
 * @returns The prepared native kernels' plugins, in roster order.
 */
const preparedNativePlugins = async (): Promise<readonly PluginInstance[]> => {
  let roster: typeof NativeKernelRoster;
  try {
    roster = await import('@taucad/native-kernels/node');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return [];
    }
    throw error;
  }
  const { readManagedPreparation } = await import('@taucad/runtime/preparation/node');
  const { kernels } = await roster.composeNativeKernels({
    store: roster.defaultPayloadStore(),
    managed: readManagedPreparation(process.env),
  });
  return roster.composeNativePlugins(kernels);
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
        const [{ createNodeClient }, { defaultRuntime }, nativePlugins] = await Promise.all([
          import('@taucad/runtime/node'),
          import('#model/default-runtime.js'),
          preparedNativePlugins(),
        ]);
        let runtime: RuntimeDefinition = defaultRuntime;
        if (nativePlugins.length > 0) {
          const { defineRuntime } = await import('@taucad/runtime/worker');
          runtime = defineRuntime({ ...defaultRuntime, plugins: [...nativePlugins] });
        }
        return createNodeClient({ runtime, projectPath: options.projectPath });
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
