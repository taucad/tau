/**
 * Adaptive display meshing for PicoVoxel views: which requests may run, the typed refusal for those
 * that may not, and what a delivered mesh reports about it.
 */
import type { TessellationReport } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/types';
import type { MeshChunk, Voxels } from 'picovoxel';

import type { PicovoxelLane } from '#picovoxel.schemas.js';

/**
 * Adaptive meshing for one build: OpenVDB adaptivity in (0, 1). OpenVDB's relax pass stays off: the adaptivity
 * sweep measured it moving vertices further from the surface and adding slivers, never improving a mesh.
 */
export type PicovoxelMeshing = { readonly adaptivity: number };

/**
 * PicoVoxel releases whose `Voxels.toMesh()` takes no options. They would ignore `{ adaptivity }`
 * and return the uniform mesh, so Tau refuses an adaptive request under them rather than mislabel it.
 */
const withoutAdaptiveMeshing: ReadonlySet<string> = new Set(['0.1.0']);

/**
 * Balanced adaptivity: what a fast-lane preview of a release that meshes adaptively would mesh at when the
 * view sets no `meshAdaptivity`. An explicit value always wins, and an export meshes at its own value, 0 by default.
 */
export const picovoxelPreviewAdaptivity = 0.25;

/**
 * Whether an unset `meshAdaptivity` takes {@link picovoxelPreviewAdaptivity}: the gate of the preview
 * watertightness obligation of the Balanced-adaptivity ruling. It is on because adaptive previews keep the in-line
 * seam triangles that stitch merged cells (D36, `dropZeroAreaTriangles`), which measured base-box and helix-heat-x
 * at 0.25 with no boundary and no non-manifold edges. Turn it off again if an adaptive preview opens. Under
 * PicoVoxel 0.1.0 it changes nothing: that release resolves every unset view to 0. PicoVoxel 0.2.0, the first
 * release that meshes adaptively, moved the kernel version, the cache key, by itself.
 */
export const picovoxelAdaptivePreviewsWatertight = true;

/**
 * The adaptivity an unset `meshAdaptivity` resolves to: {@link picovoxelPreviewAdaptivity} on the fast lane of a
 * release whose `toMesh()` takes options while `previewDefault` is on, else 0, the uniform mesh. It applies only
 * where an explicit request of the same value would run, so the default never trips a refusal.
 *
 * @param lane - The build's lane.
 * @param version - The installed PicoVoxel version.
 * @param previewDefault - Whether an unset adaptivity may take the preview default; the watertightness gate.
 * @returns The adaptivity in [0, 1) the view meshes at.
 */
export const picovoxelDefaultAdaptivity = (
  lane: PicovoxelLane,
  version: string,
  previewDefault: boolean = picovoxelAdaptivePreviewsWatertight,
): number =>
  previewDefault && lane === 'fast' && !withoutAdaptiveMeshing.has(version) ? picovoxelPreviewAdaptivity : 0;

/**
 * Decide the meshing a build runs with. An unset `meshAdaptivity` takes {@link picovoxelDefaultAdaptivity}; an
 * explicit value is checked as given.
 *
 * @param options - The view's construction options.
 * @param options.meshAdaptivity - Requested adaptivity in [0, 1), 0 for the uniform mesh; absent for the default.
 * @param lane - The build's lane.
 * @param version - The installed PicoVoxel version.
 * @returns The meshing to apply (absent for the uniform mesh), or the issue refusing the request.
 */
export const resolvePicovoxelMeshing = (
  { meshAdaptivity: requested }: { readonly meshAdaptivity?: number | undefined },
  lane: PicovoxelLane,
  version: string,
): { readonly meshing?: PicovoxelMeshing } | { readonly refusal: KernelIssue } => {
  const meshAdaptivity = requested ?? picovoxelDefaultAdaptivity(lane, version);
  if (meshAdaptivity <= 0) {
    return {};
  }
  const details = { producer: { kernelId: 'picovoxel' }, meshAdaptivity, lane, version };
  if (lane === 'exact') {
    return {
      refusal: {
        message: `PicoVoxel meshes the exact lane uniformly: adaptive meshing (meshAdaptivity ${String(meshAdaptivity)}) changes the bytes the exact lane reproduces. Use lane: 'fast' for an adaptive view, or meshAdaptivity: 0.`,
        code: 'REPRESENTATION_UNSUPPORTED',
        type: 'runtime',
        severity: 'error',
        details: { ...details, refusal: 'PICOVOXEL_MESHING_EXACT_LANE' },
      },
    };
  }
  if (withoutAdaptiveMeshing.has(version)) {
    return {
      refusal: {
        message: `PicoVoxel ${version} cannot mesh adaptively (meshAdaptivity ${String(meshAdaptivity)}): its toMesh() takes no options. Use meshAdaptivity: 0 for the uniform mesh.`,
        code: 'KERNEL_CAPABILITY_MISSING',
        type: 'runtime',
        severity: 'error',
        details: { ...details, capability: 'PICOVOXEL_ADAPTIVE_MESHING' },
      },
    };
  }
  return { meshing: { adaptivity: meshAdaptivity } };
};

/** A field's mesh as JavaScript-owned arrays (no wasm views), with its provenance. */
export type PicovoxelMeshArrays = Readonly<{
  vertices: Float32Array;
  triangles: Uint32Array;
  lane: 'exact' | 'fast';
}>;

/**
 * The chunk sink a uniform mesh streams into: each chunk is a view into wasm memory that is valid only while the
 * callback runs, so it is copied out at once, and the copies are joined when the stream ends.
 *
 * @returns The sink, and `finish`, which joins what it received.
 */
export const createPicovoxelMeshSink = (): {
  readonly write: (chunk: MeshChunk) => void;
  readonly finish: () => { readonly vertices: Float32Array<ArrayBuffer>; readonly triangles: Uint32Array<ArrayBuffer> };
} => {
  const vertexChunks: Array<Float32Array<ArrayBuffer>> = [];
  const triangleChunks: Array<Uint32Array<ArrayBuffer>> = [];
  const join = <Words extends Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>>(
    chunks: Words[],
    create: (length: number) => Words,
  ): Words => {
    const joined = create(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    // The copies are garbage now; drop them before the caller allocates anything else.
    chunks.length = 0;
    return joined;
  };
  return {
    write({ vertices, triangles }) {
      vertexChunks.push(new Float32Array(vertices));
      triangleChunks.push(new Uint32Array(triangles));
    },
    finish: () => ({
      vertices: join(vertexChunks, (length) => new Float32Array(length)),
      triangles: join(triangleChunks, (length) => new Uint32Array(length)),
    }),
  };
};

/**
 * Mesh a Voxels field with the build's meshing, into JavaScript-owned arrays.
 *
 * The uniform mesh streams (`voxels.streamMesh`): the grid is meshed in batches of 128³-voxel nodes and each batch is
 * copied out of the heap, so no whole `Mesh` is ever held in WebAssembly memory beside the grid. The joined arrays are
 * exactly `toMesh()`'s, element for element, which keeps every exact byte. The adaptive mesh has no streamed form, so
 * it is built whole with `toMesh(meshing)`, read once and freed at once.
 *
 * @param field - The field to mesh.
 * @param meshing - The build's adaptive meshing, when it has one.
 * @returns The field's mesh arrays and lane.
 */
export const meshPicovoxelField = (field: Voxels, meshing: PicovoxelMeshing | undefined): PicovoxelMeshArrays => {
  if (meshing === undefined) {
    const sink = createPicovoxelMeshSink();
    field.streamMesh(sink.write);
    return { ...sink.finish(), lane: field.lane };
  }
  const mesh = field.toMesh(meshing);
  try {
    // The facade's arrays are fresh JavaScript copies of the native mesh, so freeing it leaves them intact.
    return { vertices: mesh.vertices, triangles: mesh.triangles, lane: mesh.lane };
  } finally {
    mesh.dispose();
  }
};

/**
 * The tessellation field an adaptive mesh adds; none for the uniform mesh.
 *
 * @param meshing - The build's adaptive meshing, when it has one.
 * @returns `adaptivity`, or nothing.
 */
export const picovoxelMeshingReport = (meshing: PicovoxelMeshing | undefined): Pick<TessellationReport, 'adaptivity'> =>
  meshing === undefined ? {} : { adaptivity: meshing.adaptivity };

/**
 * Restore the meshing field of a serialized tessellation report at the snapshot trust boundary. A snapshot written
 * before the relax option was removed also carries a boolean `relax` beside `adaptivity`; it is accepted and dropped.
 *
 * @param value - The serialized report.
 * @returns `adaptivity` when present and valid, nothing when absent.
 */
export const snapshotPicovoxelMeshingReport = (value: unknown): Pick<TessellationReport, 'adaptivity'> => {
  const read = (key: string): unknown =>
    typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
  const adaptivity = read('adaptivity');
  const relax = read('relax');
  if (adaptivity === undefined && relax === undefined) {
    return {};
  }
  if (
    typeof adaptivity !== 'number' ||
    !(adaptivity > 0 && adaptivity < 1) ||
    !(relax === undefined || typeof relax === 'boolean')
  ) {
    throw new TypeError(
      'Invalid PicoVoxel serialized tessellation: adaptivity must be in (0, 1), and a stored relax must be a boolean beside it.',
    );
  }
  return { adaptivity };
};
