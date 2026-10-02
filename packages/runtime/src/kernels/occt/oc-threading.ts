/**
 * Shared OCCT multi-threading helpers.
 *
 * Both OC-based kernels (Replicad and OpenCascade) ship a single-threaded and a
 * pthread (multi-threaded) OCJS WASM build. The logic for (1) detecting whether
 * the host can run the pthread build and (2) activating OCCT's global parallel
 * defaults once a multi-threaded instance is live is identical across kernels,
 * so it lives here and is consumed by both — there is no per-kernel threading
 * setup.
 *
 * The activation helper is structurally typed (`object`) so neither kernel has
 * to import the other's WASM bindings; each keeps its concrete `oc` type at the
 * call site.
 */

import type { RuntimeLogger } from '#types/runtime-kernel.types.js';

/** Result of probing the host for multi-threaded (pthread) WASM support. */
export type MultiThreadSupport = {
  /** Whether the pthread build can run in this environment. */
  supported: boolean;
  /** Human-readable reason for the decision (used in auto-selection logs). */
  reason: string;
};

/**
 * Detect whether the runtime can host the multi-threaded (pthread) build.
 *
 * Pthread WASM requires `SharedArrayBuffer`. Browsers gate `SharedArrayBuffer`
 * behind cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` +
 * `Cross-Origin-Embedder-Policy: require-corp`). Node 22+ exposes SAB
 * unconditionally — no headers needed.
 *
 * @returns flag plus a human-readable reason for the chosen variant.
 * @see https://github.com/taucad/opencascade.js/blob/main/docs-site/content/docs/package/guides/multi-threading.mdx
 * @public
 */
export function detectMultiThreadSupport(): MultiThreadSupport {
  if (typeof SharedArrayBuffer === 'undefined') {
    return { supported: false, reason: 'SharedArrayBuffer unavailable' };
  }

  // Browsers expose `crossOriginIsolated` as a boolean. Node and most non-browser
  // runtimes do not define it — treat the missing flag as "not gated" (Node 22+
  // ships SAB unconditionally).
  if (typeof globalThis.crossOriginIsolated === 'boolean' && !globalThis.crossOriginIsolated) {
    return { supported: false, reason: 'crossOriginIsolated=false (missing COOP/COEP headers)' };
  }

  return { supported: true, reason: 'SAB available' };
}

/**
 * Activate OCCT-wide parallel defaults so subsequent boolean and mesh calls
 * fan out across the pthread pool without per-call arguments.
 *
 * Mirrors the canonical recipe in OCJS' multi-threading guide. Sizing the
 * launcher cap to `pool.NbThreads()` is required: skipping it leaves OCCT's
 * lazy default smaller than the pre-spawned worker count baked into the
 * binary (`PTHREAD_POOL_SIZE=navigator.hardwareConcurrency`) and caps speedup.
 *
 * The instance is accepted as `unknown` so this helper does not depend on
 * either kernel's WASM-binding type (an `OpenCascadeInstance` interface has no
 * index signature, so it is not assignable to `Record<string, unknown>`); the
 * OCCT static classes accessed here (`BOPAlgo_Options`,
 * `BRepMesh_IncrementalMesh`, `OSD_ThreadPool`) are not declared on the
 * permissive shape, so member access goes through a narrowed record view.
 *
 * @param oc - the freshly-initialised OpenCascade instance
 * @param logger - kernel logger
 * @returns the number of threads in the OCCT default pool, or `undefined` when
 *   the build trims `OSD_ThreadPool` from its bindings
 * @see https://github.com/taucad/opencascade.js/blob/main/docs-site/content/docs/package/guides/multi-threading.mdx#global-activation--call-once-at-startup
 * @public
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
      'OCCT parallel partially activated: BOPAlgo + BRepMesh defaults ON; OSD_ThreadPool missing from bindings (full speedup gated until rebuild)',
    );
    return undefined;
  }

  const pool = threadPool['DefaultPool'](-1);
  const threads = pool['NbThreads']() as number;
  pool['SetNbDefaultThreadsToLaunch'](threads);
  // oxlint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  // oxlint-enable new-cap

  logger.log(`OCCT parallel activated: ${threads} threads (BOPAlgo + BRepMesh defaults ON)`);
  return threads;
}
