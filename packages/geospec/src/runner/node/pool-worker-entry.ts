/** Node pool worker: owns one GeoSpec engine per isolate and the exporters its config declares. @module */

import { memoryUsage } from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import { loadGeoSpecConfig } from '#config/node/load.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecModelExporter } from '#model/types.js';
import type { GeoSpecPoolHostMessage, GeoSpecPoolWorkerMessage } from '#runner/pool/pool-messages.js';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';
import { createNodeGeoSpecEngine } from '#runner/node/engine.js';
import { createNodeVmFileSystem, withInMemorySources } from '#runner/node/node-vm-filesystem.js';
import type { GeoSpecModuleVmModule } from '#vm/types.js';

/**
 * A module whose default export creates exporters for one worker. The pool imports it inside each worker, because
 * exporters are live objects that cannot cross a thread boundary.
 *
 * @public
 */
export type GeoSpecExporterModule = {
  default: (context: { readonly projectPath: string }) => Promise<readonly GeoSpecModelExporter[]>;
};

/**
 * What a Node pool worker receives: strings and numbers only, so each worker rebuilds its exporters itself.
 *
 * @public
 */
export type GeoSpecNodePoolWorkerOptions = {
  /** Absolute project root. */
  readonly projectPath: string;
  /** The `geospec.config.*` the run selected; absent to discover one in `projectPath`. */
  readonly configPath?: string;
  /** URLs of {@link GeoSpecExporterModule}s whose exporters precede the config's. */
  readonly exporterModules?: readonly string[];
  /** URL of a {@link GeoSpecModuleVmModule} whose default export creates this worker's module VM; absent for the plain VM. */
  readonly moduleVmModule?: string;
  /** This worker's caller-inclusive CPU grant for the native addon; absent for one permit. */
  readonly grant?: number;
  /** Spec sources served from memory, keyed by project-rooted path (see `GeoSpecNodePoolOptions.sources`). */
  readonly sources?: Readonly<Record<string, string>>;
};

/** Parent-owned message boundary for the worker. @public */
export type GeoSpecNodePoolPort = {
  postMessage(message: GeoSpecPoolWorkerMessage): void;
  on(event: 'message', listener: (message: GeoSpecPoolHostMessage) => void): void;
};

/**
 * Create this worker's exporters: each exporter module's, in order, then the config's.
 * @param options - The worker's project, config and exporter modules.
 * @returns The exporters, first match first.
 */
const workerExporters = async (options: GeoSpecNodePoolWorkerOptions): Promise<GeoSpecModelExporter[]> => {
  const [config, ...modules] = await Promise.all([
    loadGeoSpecConfig({
      projectPath: options.projectPath,
      ...(options.configPath === undefined ? {} : { configPath: options.configPath }),
    }),
    ...(options.exporterModules ?? []).map(async (url) => (await import(url)) as GeoSpecExporterModule),
  ]);
  const preset = await Promise.all(modules.map(async (module) => module.default({ projectPath: options.projectPath })));
  return [...preset.flat(), ...(config.options.exporters ?? [])];
};

/**
 * Construct, serve, and clean up one engine entirely inside this worker.
 * @param port - Parent message port.
 * @param options - Project, config, exporter modules and the assigned grant.
 * @public
 */
export const startGeoSpecNodePoolWorker = async (
  port: GeoSpecNodePoolPort,
  options: GeoSpecNodePoolWorkerOptions,
): Promise<void> => {
  const { engine } = await createNodeGeoSpecEngine(
    options.grant === undefined ? {} : { executionPermits: options.grant },
  );
  try {
    const disk = createNodeVmFileSystem(options.projectPath);
    const filesystem =
      options.sources === undefined ? disk : withInMemorySources(options.projectPath, disk, options.sources);
    let createModuleVm: GeoSpecModuleVmModule['default'] | undefined;
    if (options.moduleVmModule !== undefined) {
      const loaded = (await import(options.moduleVmModule)) as Partial<GeoSpecModuleVmModule>;
      // A configured module without a factory would silently fall back to the plain VM and hide the cause.
      if (typeof loaded.default !== 'function') {
        throw new TypeError(`The module VM module '${options.moduleVmModule}' must default-export a CreateModuleVm.`);
      }
      createModuleVm = loaded.default;
    }
    const nativeModelLoader = createGeoSpecNativeModelLoader({
      engine,
      projectPath: options.projectPath,
      exporters: await workerExporters(options),
      readSource: async (source) => {
        if (typeof source !== 'string') {
          throw new TypeError('Node pool direct sources must be project-rooted paths or bytes.');
        }
        return filesystem.readFile(source);
      },
    });
    startGeoSpecPoolWorkerHost({
      filesystem,
      nativeAssertions: { engine },
      nativeModelLoader,
      ...(createModuleVm === undefined ? {} : { createModuleVm }),
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
    await startGeoSpecNodePoolWorker(parentPort, workerData as GeoSpecNodePoolWorkerOptions);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    parentPort.postMessage({
      type: 'initialization-error',
      message: error instanceof Error ? error.message : String(error),
      ...(typeof code === 'string' ? { code } : {}),
    });
    parentPort.close();
  }
}
