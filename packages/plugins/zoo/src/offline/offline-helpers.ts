/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Hot-path helpers with two implementations: the `TauOffline` native class that the engine's own libcascade build
 * compiles in (`libcascade/libcascade-kcl.yml`), and the same work over the stock bindings when a host loads the
 * published libcascade package instead.
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
  /** Whether the engine's own build with native helpers is loaded. */
  readonly native: boolean;
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

type Deletable = { delete(): void };

const subShapes = (oc: Oc, shape: TopoDS_Shape, kind: 'TopAbs_EDGE' | 'TopAbs_SOLID'): TopoDS_Shape[] => {
  const map = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum[kind], map);
  const out: TopoDS_Shape[] = [];
  for (let index = 1; index <= map.Extent(); index++) {
    out.push(map.FindKey(index));
  }

  map.delete();
  return out;
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
    native: true,
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

/**
 * The edge's samples on a face triangulation, or undefined when no meshed face keeps a polygon for it.
 *
 * @param oc - libcascade instance
 * @param edge - the edge
 * @param owned - collects handles to free
 * @returns flat XYZ samples
 */
const polygonPoints = (oc: Oc, edge: TopoDS_Shape, owned: Deletable[]): number[] | undefined => {
  const location = new oc.TopLoc_Location();
  owned.push(location);
  // Embind returns a missing OCCT handle as `null`, which the generated declarations do not express.
  const found = oc.BRep_Tool.PolygonOnTriangulation(oc.TopoDS.Edge(edge), location) as Partial<{
    P: InstanceType<Oc['Poly_PolygonOnTriangulation']>;
    T: InstanceType<Oc['Poly_Triangulation']>;
  }>;
  if (!found.P || !found.T) {
    return undefined;
  }

  const { P: polygon, T: triangulation } = found;
  const trsf = location.Transformation();
  owned.push(polygon, triangulation, trsf);
  const points: number[] = [];
  for (let index = 1; index <= polygon.NbNodes(); index++) {
    const node = triangulation.Node(polygon.Node(index));
    node.Transform(trsf);
    points.push(node.X(), node.Y(), node.Z());
    node.delete();
  }

  return points;
};

/**
 * The edge sampled from its curve with OCCT's angular-and-chordal discretizer.
 *
 * @param oc - libcascade instance
 * @param sample - the edge, and the linear (mm) and angular (rad) deflection to sample it at
 * @param owned - collects handles to free
 * @returns flat XYZ samples, at least two points
 */
const curvePoints = (
  oc: Oc,
  sample: {
    edge: TopoDS_Shape;
    tolerances: { linear: number; angular: number };
  },
  owned: Deletable[],
): number[] => {
  const { edge, tolerances } = sample;
  const curve = new oc.BRepAdaptor_Curve(oc.TopoDS.Edge(edge));
  // The eight-argument overload: the six-argument one is ambiguous with the parameter-range form.
  const sampler = new oc.GCPnts_TangentialDeflection(
    curve,
    curve.FirstParameter(),
    curve.LastParameter(),
    tolerances.angular,
    tolerances.linear,
    2,
    1e-9,
    1e-7,
  );
  owned.push(curve, sampler);
  const points: number[] = [];
  for (let index = 1; index <= sampler.NbPoints(); index++) {
    const point = sampler.Value(index);
    points.push(point.X(), point.Y(), point.Z());
    point.delete();
  }

  return points;
};

/**
 * Helpers over the stock libcascade bindings.
 *
 * @param oc - libcascade instance
 * @returns binding-level helpers
 */
function bindingHelpers(oc: Oc): NativeHelpers {
  const area = (shape: TopoDS_Shape): number => {
    const props = new oc.GProp_GProps();
    oc.BRepGProp.SurfaceProperties(shape, props, false, false);
    const mass = props.Mass();
    props.delete();
    return mass;
  };

  return {
    native: false,
    mesh(shape, tolerances) {
      new oc.BRepMesh_IncrementalMesh(shape, tolerances.linear, false, tolerances.angular, false).delete();
    },
    edges(shape, tolerances) {
      const owned: Deletable[] = [];
      try {
        const identity = new oc.TopLoc_Location();
        const root = shape.Located(identity, false);
        owned.push(identity, root);
        const lines: number[] = [];
        const edgeGroups: EdgeGroup[] = [];
        for (const [edgeId, edge] of subShapes(oc, root, 'TopAbs_EDGE').entries()) {
          owned.push(edge);
          if (oc.BRep_Tool.Degenerated(oc.TopoDS.Edge(edge))) {
            continue;
          }

          const points = polygonPoints(oc, edge, owned) ?? curvePoints(oc, { edge, tolerances }, owned);
          const start = lines.length;
          for (let point = 3; point < points.length; point += 3) {
            lines.push(...points.slice(point - 3, point + 3));
          }

          edgeGroups.push({ start, count: lines.length - start, edgeId });
        }

        return { lines: Float64Array.from(lines), edgeGroups };
      } finally {
        for (const handle of owned) {
          handle.delete();
        }
      }
    },
    topology(shape) {
      const owned: Deletable[] = [];
      const explore = (parent: TopoDS_Shape, kind: 'TopAbs_SHELL' | 'TopAbs_FACE' | 'TopAbs_WIRE' | 'TopAbs_EDGE') => {
        const found: TopoDS_Shape[] = [];
        const explorer = new oc.TopExp_Explorer(parent, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        owned.push(explorer);
        // oxlint-disable-next-line typescript/no-confusing-void-expression -- libcascade iterator idiom
        for (; explorer.More(); explorer.Next()) {
          found.push(explorer.Current());
        }

        owned.push(...found);
        return found;
      };

      try {
        const edgeMap = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
        owned.push(edgeMap);
        oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, edgeMap);
        const shells = explore(shape, 'TopAbs_SHELL');
        return (shells.length > 0 ? shells : [shape]).map((shell) =>
          explore(shell, 'TopAbs_FACE')
            .filter((face) => {
              const location = new oc.TopLoc_Location();
              owned.push(location);
              // Embind returns a missing triangulation handle as `null`, which the declarations do not express.
              const triangulation = oc.BRep_Tool.Triangulation(oc.TopoDS.Face(face), location, 0) as
                | InstanceType<Oc['Poly_Triangulation']>
                | undefined;
              if (!triangulation) {
                return false;
              }

              owned.push(triangulation);
              return triangulation.NbTriangles() > 0;
            })
            .map((face) =>
              explore(face, 'TopAbs_WIRE').map((wire) =>
                explore(wire, 'TopAbs_EDGE').map((edge) => edgeMap.FindIndex(edge) - 1),
              ),
            ),
        );
      } finally {
        for (const handle of owned) {
          handle.delete();
        }
      }
    },
    volume(shape) {
      let volume = 0;
      for (const solid of subShapes(oc, shape, 'TopAbs_SOLID')) {
        const props = new oc.GProp_GProps();
        oc.BRepGProp.VolumeProperties(solid, props, false, false, false);
        volume += props.Mass();
        props.delete();
      }

      return volume;
    },
    area,
    bounds(shape) {
      const box = new oc.Bnd_Box();
      oc.BRepBndLib.Add(shape, box, false);
      try {
        if (box.IsVoid()) {
          return undefined;
        }

        const min = box.CornerMin();
        const max = box.CornerMax();
        return {
          min: [min.X(), min.Y(), min.Z()],
          max: [max.X(), max.Y(), max.Z()],
        };
      } finally {
        box.delete();
      }
    },
    isValid(shape) {
      if (shape.IsNull()) {
        return false;
      }

      const analyzer = new oc.BRepCheck_Analyzer(shape, false, false);
      // The no-argument overload is not bound; asking about the analysed shape itself is equivalent.
      const valid = analyzer.IsValid(shape);
      analyzer.delete();
      return valid;
    },
  };
}

const cache = new WeakMap<Oc, NativeHelpers>();

/**
 * The hot-path helpers for a libcascade instance: native when it carries the `TauOffline` class, binding-level
 * otherwise.
 *
 * @param oc - libcascade instance
 * @returns helpers, created once per instance
 */
export function helpersFor(oc: Oc): NativeHelpers {
  let helpers = cache.get(oc);
  if (!helpers) {
    const { TauOffline: tau } = oc as NativeOc;
    helpers = tau ? nativeHelpers(tau, oc.wasmMemory) : bindingHelpers(oc);
    cache.set(oc, helpers);
  }

  return helpers;
}
