/**
 * Shared OCCT multi-threading helpers.
 *
 * Both OC-based kernels (Replicad and OpenCascade) ship a single-threaded and a
 * pthread (multi-threaded) OCJS WASM build. Runtime-owned feature detection
 * lives in `@taucad/runtime/cross-origin-isolation`; this module owns only the
 * OCCT-specific activation performed after a multi-threaded instance is live.
 *
 * The activation helper is structurally typed (`object`) so neither kernel has
 * to import the other's WASM bindings; each keeps its concrete `oc` type at the
 * call site.
 */

import type { RuntimeLogger } from '@taucad/runtime/kernel';

/**
 * Activate OCCT-wide parallel defaults for APIs that consult OCCT's global
 * flags.
 *
 * Mirrors the canonical recipe in OCJS' multi-threading guide. Sizing the
 * launcher cap to `pool.NbThreads()` is required: skipping it leaves OCCT's
 * lazy default smaller than the pre-spawned worker count baked into the
 * binary (`PTHREAD_POOL_SIZE=navigator.hardwareConcurrency`) and caps speedup.
 *
 * Replicad's custom mesh extractors and direct STL meshing pass explicit
 * per-call flags from `ReplicadRuntimeInfo`. This helper remains the shared
 * activation path for boolean defaults and the OpenCascade kernel's
 * global-default users.
 *
 * The instance is accepted as `unknown` so this helper does not depend on either
 * kernel's WASM-binding type (an `OpenCascadeInstance` interface has no index
 * signature, so it is not assignable to `Record<string, unknown>`); the OCCT
 * static classes accessed here (`BOPAlgo_Options`, `BRepMesh_IncrementalMesh`,
 * `OSD_ThreadPool`) are not declared on the permissive shape, so member access
 * goes through a narrowed record view.
 *
 * @param oc - the freshly-initialised OpenCascade instance
 * @param logger - kernel logger
 * @returns the number of threads in the OCCT default pool, or `undefined` when
 *   the build trims `OSD_ThreadPool` from its bindings
 * @public
 * @see https://github.com/taucad/opencascade.js/blob/main/docs-site/content/docs/package/guides/multi-threading.mdx#global-activation--call-once-at-startup
 */
export function activateOccParallelism(oc: unknown, logger: RuntimeLogger): number | undefined {
  // oxlint-disable new-cap -- C++-style PascalCase method names from OCCT bindings (BOPAlgo_Options, SetParallelMode, etc.)
  // oxlint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- OCJS .d.ts does not declare OSD_ThreadPool / BOPAlgo_Options statics; bracket access on a permissive shape
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- permissive view onto OCJS bindings
  const ocAny = oc as Record<string, any>;
  ocAny['BOPAlgo_Options']['SetParallelMode'](true);
  ocAny['BRepMesh_IncrementalMesh']['SetParallelDefault'](true);

  // OSD_ThreadPool right-sizes OCCT's lazy default pool to the pre-spawned worker
  // count. Some custom OCJS builds (e.g. older replicad-opencascadejs) trim the
  // symbol from bindings; degrade gracefully and log a warning.
  const threadPool = ocAny['OSD_ThreadPool'];
  if (!threadPool || typeof threadPool['DefaultPool'] !== 'function') {
    logger.warn(
      'OCCT parallel defaults partially activated: BOPAlgo + BRepMesh defaults ON; OSD_ThreadPool missing from bindings (explicit meshing call sites must still choose per-call flags)',
    );
    return undefined;
  }

  const pool = threadPool['DefaultPool'](-1);
  const threads = pool['NbThreads']() as number;
  pool['SetNbDefaultThreadsToLaunch'](threads);
  // oxlint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  // oxlint-enable new-cap

  logger.log(
    `OCCT parallel defaults activated: ${threads} threads (BOPAlgo default + BRepMesh global default; explicit meshing call sites choose per-call flags)`,
  );
  return threads;
}
