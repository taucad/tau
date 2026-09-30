/**
 * PicoVoxel kernel Zod schemas — single source of truth for the dual path.
 *
 * `lane` is a construction option: the viewer renders in the `'fast'` lane by default, and every
 * native export defaults to `'exact'`, so the runtime's native-build replay rebuilds an exact
 * handle whenever an export follows a fast render. `wasm` picks the artifact the fast lane runs
 * on; the exact lane always runs on the serial artifact.
 *
 * @public
 */

import { z } from 'zod';
import { gltfExportConventionSchema } from '@taucad/runtime/kernel';
import { getIsolationStatus } from '@taucad/runtime/cross-origin-isolation';

/** The two lanes Tau exposes. `'open'` and `'auto'` stay out of Tau: every Tau session claims a lane. @public */
export const picovoxelLanes = ['fast', 'exact'] as const;

/** A PicoVoxel session lane. @public */
export type PicovoxelLane = (typeof picovoxelLanes)[number];

/** A PicoVoxel WebAssembly artifact. @public */
export type PicovoxelArtifact = 'serial' | 'multi';

const laneSchema = z.enum(picovoxelLanes);

/**
 * The multi-threaded build's linear memory (`INITIAL_MEMORY=256MB`, `MAXIMUM_MEMORY=4GB`, shared), in
 * 64 KiB pages. A shared memory reserves its maximum up front.
 */
const multiMemoryPages = { initial: 4096, maximum: 65_536 } as const;

let sharedMemoryProbe: { readonly reason: string | undefined } | undefined;

/**
 * Probe once per realm whether the multi build's shared memory can be reserved at all (D21).
 *
 * Cross-origin isolation is necessary but not sufficient: a device short of address space refuses
 * the 4 GiB reservation, and the multi build would then fail to start on every render.
 *
 * @returns The refusal reason, or `undefined` when the reservation succeeds.
 */
const probeSharedMemory = (): string | undefined => {
  if (!sharedMemoryProbe) {
    try {
      // Dropped at once; only whether the engine grants the reservation matters.
      void new WebAssembly.Memory({ ...multiMemoryPages, shared: true });
      sharedMemoryProbe = { reason: undefined };
    } catch (error) {
      sharedMemoryProbe = {
        reason: `shared-memory-reservation-failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return sharedMemoryProbe.reason;
};

/**
 * Why the multi-threaded build cannot run in this realm: not cross-origin isolated, or its shared
 * memory cannot be reserved. A capability probe before admission, never a verdict retry.
 *
 * @returns The reason, or `undefined` when the multi build can run.
 * @public
 */
export const multiUnavailableReason = (): string | undefined => {
  const isolation = getIsolationStatus();
  return isolation.crossOriginIsolated ? probeSharedMemory() : isolation.reason;
};

/**
 * Resolve the host's `wasm` option to the artifact the fast lane uses.
 *
 * Runs where `optionsSchema` is parsed — inside the kernel worker — so the validated option, and
 * with it the cache key, carries the artifact the realm can actually run. An unresolved `'auto'`
 * would key identically while resolving differently.
 *
 * @param wasm - The host's requested artifact.
 * @returns The concrete artifact.
 */
const resolveWasmArtifact = (wasm: 'auto' | PicovoxelArtifact): PicovoxelArtifact =>
  wasm === 'auto' ? (multiUnavailableReason() === undefined ? 'multi' : 'serial') : wasm;

/**
 * PicoVoxel kernel initialization options.
 *
 * `wasm` selects the fast lane's artifact: `'auto'` (default) takes the multi-threaded build when
 * the kernel worker is cross-origin isolated and the serial build otherwise; `'multi'` pins the
 * multi-threaded build and fails fast renders visibly where it cannot run; `'serial'` pins the
 * single-threaded build.
 *
 * ponytail: the resolved artifact is keyed for exact renders too, although they always run serial;
 * the only cost is cache misses between isolated and non-isolated realms. Key per lane if that
 * ever matters.
 *
 * @public
 */
export const picovoxelOptionsSchema = z.object({
  wasm: z
    .enum(['auto', 'serial', 'multi'])
    .default('auto')
    .describe(
      'Artifact for the fast lane. "auto" (default) uses the multi-threaded build in a cross-origin isolated worker and the serial build otherwise; "multi" and "serial" pin one build. Exact renders and exports always use the serial build.',
    )
    .transform(resolveWasmArtifact),
});

/** Validated PicoVoxel kernel options, with `wasm` resolved to a concrete artifact. @public */
export type PicovoxelOptions = z.output<typeof picovoxelOptionsSchema>;

/** Host-facing PicoVoxel kernel options, as passed to `picovoxel({ kernels: { default } })`. @public */
export type PicovoxelOptionsInput = z.input<typeof picovoxelOptionsSchema>;

/**
 * Construction options for renders. The viewer never sends render options, so this default decides
 * its lane: `'fast'`.
 *
 * @public
 */
export const picovoxelRenderSchema = z.object({
  lane: laneSchema
    .default('fast')
    .describe(
      "'fast' (default) builds with the lane's Class-2 accelerations for the viewer. 'exact' builds the byte-reproducible model; exports replay it automatically.",
    ),
});

const exportLaneSchema = z.object({
  lane: laneSchema
    .default('exact')
    .describe(
      "'exact' (default) replays the model in a deterministic session. 'fast' exports fast-lane geometry: STL is stamped LANE=fast, GLB and glTF are refused.",
    ),
});

const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Per-format PicoVoxel export schemas. Each carries `lane`, defaulting to `'exact'`.
 * @public
 */
export const picovoxelExportSchemas = {
  glb: exportLaneSchema.extend(gltfExportConventionSchema.shape),
  gltf: exportLaneSchema.extend(gltfExportConventionSchema.shape),
  stl: exportLaneSchema.extend({
    unit: z.enum(['mm', 'cm', 'm', 'ft', 'in']).default('mm'),
    scale: z.number().positive().default(1),
    offset: vector3Schema.default([0, 0, 0]),
  }),
} as const satisfies Record<string, z.ZodType>;
