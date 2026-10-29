/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Hot-path helpers over the `TauOffline` native class that the engine's own libcascade build compiles in
 * (`libcascade/libcascade-kcl.yml`).
 *
 * The native class leaves array results in a static buffer that is read straight from `wasmMemory`, so one call
 * replaces thousands of per-node and per-edge binding crossings.
 */
import type { OpenCascadeInstance as Oc, TopoDS_Shape } from '#offline/offline-libcascade.js';

/** The `TauOffline` class from `libcascade/tau-offline.cpp`. */
type TauOfflineClass = {
  mesh(shape: TopoDS_Shape, linear: number, angular: number, parallel: boolean): boolean;
  edges(shape: TopoDS_Shape, linear: number, angular: number): number;
  topology(shape: TopoDS_Shape): number;
  volume(shape: TopoDS_Shape): number;
  area(shape: TopoDS_Shape): number;
  bounds(shape: TopoDS_Shape): boolean;
  isValid(shape: TopoDS_Shape): boolean;
  doubles(): number;
  doubleCount(): number;
  ints(): number;
  intCount(): number;
};

type NativeOc = Oc & { TauOffline?: TauOfflineClass };

/**
 * One B-rep edge's span of the line soup, counted in XYZ scalars like replicad's `xyz-scalars-v1`. `edgeId` is the
 * edge's index among the shape's edges, the same index `NativeHelpers.topology` uses.
 */
export type EdgeGroup = { start: number; count: number; edgeId: number };

/** A solid's shells, each a list of faces, each a list of loops of edge indices; faces in glTF primitive order. */
export type SolidTopology = number[][][][];

/** A shape's edges as a segment soup in kcl-lib's frame (millimetres, Z-up). */
export type ShapeEdges = { lines: Float64Array; edgeGroups: EdgeGroup[] };

/** Axis-aligned box in millimetres. */
export type Bounds = {
  min: [number, number, number];
  max: [number, number, number];
};

/** The helpers the engine calls on hot paths. */
export type NativeHelpers = {
  /** Meshes a shape in OCCT's absolute mode; faces already meshed at least as finely keep their triangulation. */
  mesh(shape: TopoDS_Shape, tolerances: { linear: number; angular: number }): void;
  /** B-rep edges of a meshed shape, in the shape's root frame. */
  edges(shape: TopoDS_Shape, tolerances: { linear: number; angular: number }): ShapeEdges;
  /** Shell, face and loop structure of a meshed shape; faces without triangles are left out, as glTF writers do. */
  topology(shape: TopoDS_Shape): SolidTopology;
  /** Volume enclosed by the shape's solids; open surface bodies count as zero. */
  volume(shape: TopoDS_Shape): number;
  /** Surface area. */
  area(shape: TopoDS_Shape): number;
  /** OCCT's cheap bounding box, or undefined when the shape has no extent. */
  bounds(shape: TopoDS_Shape): Bounds | undefined;
  /** `BRepCheck_Analyzer` validity of a result. */
  isValid(shape: TopoDS_Shape): boolean;
};

const groupsFrom = (flat: Int32Array): EdgeGroup[] => {
  const groups: EdgeGroup[] = [];
  for (let index = 0; index + 2 < flat.length; index += 3) {
    groups.push({
      start: flat[index]!,
      count: flat[index + 1]!,
      edgeId: flat[index + 2]!,
    });
  }

  return groups;
};

/**
 * Reads `TauOffline.topology`'s `[shells, (faces, (loops, (edges, edge...)...)...)...]` layout.
 *
 * @param flat - the int buffer
 * @returns the nested structure
 */
const topologyFrom = (flat: Int32Array): SolidTopology => {
  let cursor = 0;
  const next = (): number => flat[cursor++] ?? 0;
  const repeat = <T>(read: () => T): T[] => Array.from({ length: next() }, read);
  return repeat(() => repeat(() => repeat(() => repeat(next))));
};

/**
 * Helpers over the `TauOffline` native class.
 *
 * @param tau - the `TauOffline` class of a libcascade instance built from `libcascade-kcl.yml`
 * @param memory - its `wasmMemory`
 * @returns native helpers
 */
function nativeHelpers(tau: TauOfflineClass, memory: WebAssembly.Memory): NativeHelpers {
  const doubles = (): Float64Array => {
    const count = tau.doubleCount();
    return count === 0 ? new Float64Array() : new Float64Array(memory.buffer, tau.doubles(), count).slice();
  };

  const ints = (): Int32Array => {
    const count = tau.intCount();
    return count === 0 ? new Int32Array() : new Int32Array(memory.buffer, tau.ints(), count).slice();
  };

  return {
    mesh(shape, tolerances) {
      tau.mesh(shape, tolerances.linear, tolerances.angular, false);
    },
    edges(shape, tolerances) {
      tau.edges(shape, tolerances.linear, tolerances.angular);
      return { lines: doubles(), edgeGroups: groupsFrom(ints()) };
    },
    topology(shape) {
      tau.topology(shape);
      return topologyFrom(ints());
    },
    volume: (shape) => tau.volume(shape),
    area: (shape) => tau.area(shape),
    bounds(shape) {
      if (!tau.bounds(shape)) {
        return undefined;
      }

      const [x0, y0, z0, x1, y1, z1] = doubles();
      return { min: [x0!, y0!, z0!], max: [x1!, y1!, z1!] };
    },
    isValid: (shape) => tau.isValid(shape),
  };
}

const cache = new WeakMap<Oc, NativeHelpers>();

/**
 * The hot-path helpers for a libcascade instance.
 *
 * @param oc - libcascade instance built from `libcascade-kcl.yml`
 * @returns helpers, created once per instance
 * @throws Error when the instance lacks the `TauOffline` class, as stock libcascade builds do
 */
export function helpersFor(oc: Oc): NativeHelpers {
  let helpers = cache.get(oc);
  if (!helpers) {
    const { TauOffline: tau } = oc as NativeOc;
    if (!tau) {
      throw new Error(
        'The offline engine needs its own libcascade build (libcascade/build.sh), which carries TauOffline',
      );
    }

    helpers = nativeHelpers(tau, oc.wasmMemory);
    cache.set(oc, helpers);
  }

  return helpers;
}
