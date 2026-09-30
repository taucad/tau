/** Compiled Node pool worker: owns one protocol-3 engine per isolate. @module */

import { memoryUsage } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { Engine } from '@taucad/geospec-engine-native/node';
import { createGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { RuntimeDefinition } from '@taucad/runtime';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from 'geospec/runner/worker';
// oxlint-disable-next-line import/no-unassigned-import -- Worker-host registration is isolate-local.
import '#register-node.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';

export type NativePoolWorkerOptions = { projectPath: string; grant: number };
export type NativePoolPort = {
  postMessage(message: GeoSpecPoolWorkerMessage): void;
  on(event: 'message', listener: (message: GeoSpecPoolHostMessage) => void): void;
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
        const runtime: RuntimeDefinition = defaultRuntime;
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
