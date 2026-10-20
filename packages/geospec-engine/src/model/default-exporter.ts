/**
 * Tau's default exporter for the `geospec` pool, imported by URL inside each worker: it claims the extensions the
 * default runtime's kernels declare and creates its Node client on the first export of a run, binding the native
 * kernels first; the run's release shuts the client down.
 *
 * @module
 */

import type { RuntimeDefinition } from '@taucad/runtime';
import type * as NativeStore from '@taucad/native-process-core/store';
import type { GeoSpecExporterModule } from 'geospec/runner/node';

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
 * Create the worker's exporter over the default runtime.
 * @param context - The project the client is rooted at.
 * @returns The one exporter.
 */
const createDefaultExporters: GeoSpecExporterModule['default'] = async ({ projectPath }) => {
  const [{ tauClientExporter }, { defaultRuntime }, { resolveRuntimeDefinition }] = await Promise.all([
    import('@taucad/agent-tools/geospec/exporter'),
    import('#model/default-runtime.js'),
    import('@taucad/runtime/worker'),
  ]);
  const { kernels } = await resolveRuntimeDefinition(defaultRuntime, undefined);
  return [
    await tauClientExporter({
      async client() {
        const { createNodeClient } = await import('@taucad/runtime/node');
        await bindNativeKernelsToStore(defaultRuntime);
        return createNodeClient({ runtime: defaultRuntime, projectPath });
      },
      extensions: [
        ...new Set(kernels.flatMap(({ extensions = [] }) => extensions).filter((extension) => extension !== '*')),
      ],
    }),
  ];
};

export default createDefaultExporters;

/** This module's URL, for `exporterModules`. */
export const defaultExporterModule = import.meta.url;
