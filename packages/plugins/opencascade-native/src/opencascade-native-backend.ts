import { createRequire } from 'node:module';

/** Tessellation controls accepted by the native `mesh` and `toGlb` entry points. @public */
export type NativeTessellation = {
  deflectionLinear: number;
  deflectionAngular: number;
  relativeLinear: boolean;
};

/** Measured properties of one solid, returned in a single crossing. @public */
export type NativeMetrics = {
  volume: number;
  area: number;
  center: number[];
  bboxMin: number[];
  bboxMax: number[];
  faces: number;
  edges: number;
};

/** Tessellated batch handed over as typed-array views on the Rust buffers. @public */
export type NativeMesh = {
  positions: Float64Array;
  normals: Float64Array;
  indices: Uint32Array;
  faceIds: BigUint64Array;
  triangles: number;
};

/** A closed planar profile for `extrude`, `loft`, and `sweep`. @public */
export type NativeProfile =
  | { kind: 'circle'; radius: number; axis?: number[]; center?: number[] }
  | { kind: 'polygon'; points: number[][] };

/** An opaque OpenCascade solid handle owned by the native addon. @public */
export type NativeSolid = {
  translate: (offset: number[]) => NativeSolid;
  rotate: (origin: number[], direction: number[], angle: number) => NativeSolid;
  scale: (center: number[], factor: number) => NativeSolid;
  mirror: (origin: number[], normal: number[]) => NativeSolid;
  fillet: (radius: number, edgeIds?: BigUint64Array) => NativeSolid;
  chamfer: (distance: number, edgeIds?: BigUint64Array) => NativeSolid;
  shell: (thickness: number, openFaceIds?: BigUint64Array) => NativeSolid;
  metrics: () => NativeMetrics;
  edgeIds: () => BigUint64Array;
  faceIds: () => BigUint64Array;
};

/** The whole native surface. Few and wide: one crossing per operation. @public */
export type NativeBinding = {
  Solid: {
    createBox: (min: number[], max: number[]) => NativeSolid;
    createCylinder: (radius: number, height: number[]) => NativeSolid;
    createSphere: (radius: number) => NativeSolid;
    createCone: (radiusBottom: number, radiusTop: number, height: number[]) => NativeSolid;
    createTorus: (radius: number, tube: number, axis: number[]) => NativeSolid;
  };
  boolean: (solids: NativeSolid[], clauses: Int32Array) => NativeSolid[];
  fuseAll: (solids: NativeSolid[], route?: 'single' | 'tree') => NativeSolid;
  cutAll: (base: NativeSolid, tools: NativeSolid[]) => NativeSolid;
  commonAll: (solids: NativeSolid[]) => NativeSolid;
  extrude: (profile: NativeProfile, direction: number[]) => NativeSolid;
  loft: (sections: NativeProfile[], ruled?: boolean) => NativeSolid;
  sweep: (profile: NativeProfile, spine: NativeProfile, orientation?: string) => NativeSolid;
  sweepLine: (options: { profile: NativeProfile; start: number[]; end: number[]; orientation?: string }) => NativeSolid;
  mesh: (solids: NativeSolid[], tessellation: NativeTessellation) => NativeMesh;
  toGlb: (solids: NativeSolid[], tessellation: NativeTessellation) => Uint8Array<ArrayBuffer>;
  readStep: (bytes: Uint8Array<ArrayBuffer>) => NativeSolid[];
  writeStep: (solids: NativeSolid[]) => Uint8Array<ArrayBuffer>;
  readBrep: (bytes: Uint8Array<ArrayBuffer>) => NativeSolid[];
  writeBrep: (solids: NativeSolid[]) => Uint8Array<ArrayBuffer>;
  version: () => { backend: string; occt: string; package: string };
};

/**
 * Raised when the native addon cannot be loaded.
 *
 * This package has no WASM implementation and never degrades to one: a silent
 * fallback would turn a benchmark, a parity run, and a support claim into a
 * lie. Hosts that want a fallback register `@taucad/opencascade` themselves.
 * @public
 */
export class OpencascadeNativeUnavailableError extends Error {
  public constructor(cause: unknown) {
    super(
      '@taucad/opencascade-native could not load its native addon. ' +
        'This package is Node-only and has no WASM fallback — register @taucad/opencascade for a browser or WASM host.',
      { cause },
    );
    this.name = 'OpencascadeNativeUnavailableError';
  }
}

/**
 * Load the native addon once for a capability worker context.
 *
 * The artifact is a single colocated `.node` file, so there is no OS/CPU/libc
 * selection logic here; when the NAPI-RS platform matrix lands, this resolves
 * the generated loader instead (`docs/policy/napi-architecture-policy.md`
 * rule 2), and the shape of this function does not change.
 * @returns The initialized native binding.
 * @throws OpencascadeNativeUnavailableError When the addon is missing or fails to load.
 * @public
 */
export const loadNativeBackend = (): NativeBinding => {
  try {
    return createRequire(import.meta.url)('./native/opencascade-native.node') as NativeBinding;
  } catch (error) {
    throw new OpencascadeNativeUnavailableError(error);
  }
};
