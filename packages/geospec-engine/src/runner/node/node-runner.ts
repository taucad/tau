/**
 * The Node runner hosts.
 *
 * `createGeoSpecNodeRunner` is the serial shell with nothing added: the CLI,
 * an embedded harness and a pool worker all execute the same way, and the only
 * thing that differs between them is who owns the isolate.
 *
 * The pool binding lives here too because spawning is the only Node-specific
 * part of it — scheduling is host-agnostic
 * ({@link import('#runner/pool/pool.js').createGeoSpecPoolRunner}).
 *
 * @module
 */

import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { GeoSpecNodePoolRunnerOptions, GeoSpecNodeRunnerOptions } from 'geospec/runner/node';
import { installNodeEvidenceStore } from '#cache/node-evidence-store.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';
import { createGeoSpecNativeNodePoolRunner } from '#runner/node/native-pool-runner.js';

/**
 * Create a serial GeoSpec runner for Node.
 *
 * @param options - Filesystem, project root, loaders, and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecNodeRunner = (options: GeoSpecNodeRunnerOptions): GeoSpecRunner => {
  installNodeEvidenceStore(options);
  return createSerialGeoSpecRunner(options);
};

/**
 * Where the pool worker's entry module lives.
 *
 * A worker thread loads a URL, not a module graph, so the entry must be a real
 * sibling file. In the published package that is `native-pool-worker-entry.mjs`; in
 * the source tree it is the `.ts` beside this module, which only a host with a
 * TypeScript loader can run.
 *
 * @returns The worker entry URL.
 * @public
 */
export const poolWorkerEntryUrl = (): URL => new URL(poolWorkerEntryName(import.meta.url), import.meta.url);

/**
 * The entry's filename beside a given module.
 *
 * Pure, and separate from {@link poolWorkerEntryUrl}, because the two cases it
 * distinguishes — running from source and running from the published package —
 * cannot both exist in one process.
 *
 * @param moduleUrl - The importing module's own URL.
 * @returns The sibling filename to load.
 * @public
 */
export const poolWorkerEntryName = (moduleUrl: string): string =>
  moduleUrl.endsWith('.ts') ? './native-pool-worker-entry.ts' : './native-pool-worker-entry.mjs';

/**
 * Create a worker-pool GeoSpec runner for Node.
 *
 * @param options - Project root, worker count, watchdog and the event hook.
 * @returns The runner lifecycle surface.
 * @public
 */
export const createGeoSpecNodePoolRunner = (options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner => {
  if (options.cache === true || options.cacheDirectory !== undefined) {
    throw new TypeError('Persistent reference-engine evidence caching is not supported by the compiled GeoSpec pool.');
  }
  if (options.runtimeFactoryModule !== undefined) {
    throw new TypeError('Custom reference-engine runtime factories are not supported by the compiled GeoSpec pool.');
  }
  return createGeoSpecNativeNodePoolRunner({
    projectPath: options.projectPath,
    ...(options.workers === undefined ? {} : { workers: options.workers }),
    ...(options.shardTimeout === undefined ? {} : { shardTimeout: options.shardTimeout }),
  });
};
