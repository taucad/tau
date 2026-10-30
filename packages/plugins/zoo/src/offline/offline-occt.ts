/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* eslint-disable @typescript-eslint/naming-convention -- structural types mirror libcascade method names */
/* oxlint-disable eslint/max-params -- libcascade helpers take the instance followed by their operands */
/**
 * Small libcascade helpers shared by the offline engine: point conversion, list draining, topology maps and
 * shape-level queries.
 */
import type {
  OpenCascadeInstance,
  NCollection_List_TopoDS_Shape,
  TopoDS_Edge,
  TopoDS_Face,
  TopoDS_Shape,
  TopoDS_Vertex,
  gp_Ax1,
  gp_Ax2,
  gp_Dir,
  gp_Pnt,
  gp_Vec,
} from '#offline/offline-libcascade.js';
import type { Frame, Vec3 } from '#offline/offline-math.js';
import { frameFromAxes, vec3 } from '#offline/offline-math.js';
import { helpersFor } from '#offline/offline-helpers.js';

export type Oc = OpenCascadeInstance;
// oxlint-disable-next-line no-barrel-files/no-barrel-files, unicorn-js/prefer-export-from -- one import site for the libcascade shape types
export type { TopoDS_Edge, TopoDS_Face, TopoDS_Shape, TopoDS_Vertex };

/** Shape kinds the engine explores. */
export type ShapeKind =
  | 'TopAbs_FACE'
  | 'TopAbs_EDGE'
  | 'TopAbs_VERTEX'
  | 'TopAbs_SOLID'
  | 'TopAbs_WIRE'
  | 'TopAbs_SHELL';

export const pnt = (oc: Oc, p: Vec3): gp_Pnt => new oc.gp_Pnt(p.x, p.y, p.z);
// oxlint-disable-next-line unicorn-js/prevent-abbreviations -- mirrors gp_Dir
export const dir = (oc: Oc, d: Vec3): gp_Dir => new oc.gp_Dir(d.x, d.y, d.z);
export const gvec = (oc: Oc, d: Vec3): gp_Vec => new oc.gp_Vec(d.x, d.y, d.z);
export const ax1 = (oc: Oc, origin: Vec3, direction: Vec3): gp_Ax1 =>
  new oc.gp_Ax1(pnt(oc, origin), dir(oc, direction));
export const ax2 = (oc: Oc, frame: Frame): gp_Ax2 =>
  new oc.gp_Ax2(pnt(oc, frame.origin), dir(oc, frame.z), dir(oc, frame.x));
export const fromPnt = (p: { X(): number; Y(): number; Z(): number }): Vec3 => vec3(p.X(), p.Y(), p.Z());

/**
 * Copies a shape list into an array without consuming the original.
 *
 * @param oc - libcascade instance
 * @param list - list to read
 * @returns the list's shapes in order
 */
export function listToArray(oc: Oc, list: NCollection_List_TopoDS_Shape): TopoDS_Shape[] {
  const copy = new oc.NCollection_List_TopoDS_Shape(list);
  const out: TopoDS_Shape[] = [];
  while (!copy.IsEmpty()) {
    out.push(copy.First());
    copy.RemoveFirst();
  }

  copy.delete();
  return out;
}

/**
 * Builds a shape list from an array.
 *
 * @param oc - libcascade instance
 * @param shapes - shapes to add
 * @returns a new list
 */
export function arrayToList(oc: Oc, shapes: readonly TopoDS_Shape[]): NCollection_List_TopoDS_Shape {
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const shape of shapes) {
    list.Append(shape);
  }

  return list;
}

/**
 * Unique sub-shapes of one kind, in libcascade's exploration order.
 *
 * @param oc - libcascade instance
 * @param shape - shape to explore
 * @param kind - sub-shape kind
 * @returns sub-shapes, each listed once
 */
export function subShapes(oc: Oc, shape: TopoDS_Shape, kind: ShapeKind): TopoDS_Shape[] {
  const map = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
  oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum[kind], map);
  const out: TopoDS_Shape[] = [];
  const count = map.Extent();
  for (let index = 1; index <= count; index++) {
    out.push(map.FindKey(index));
  }

  map.delete();
  return out;
}

export const faces = (oc: Oc, shape: TopoDS_Shape): TopoDS_Face[] =>
  subShapes(oc, shape, 'TopAbs_FACE').map((s) => oc.TopoDS.Face(s));
export const edges = (oc: Oc, shape: TopoDS_Shape): TopoDS_Edge[] =>
  subShapes(oc, shape, 'TopAbs_EDGE').map((s) => oc.TopoDS.Edge(s));
export const vertices = (oc: Oc, shape: TopoDS_Shape): TopoDS_Vertex[] =>
  subShapes(oc, shape, 'TopAbs_VERTEX').map((s) => oc.TopoDS.Vertex(s));

/**
 * Membership test for sub-shapes of a shape (orientation-insensitive).
 */
export class ShapeIndex {
  private readonly map: InstanceType<Oc['NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher']>;

  public constructor(oc: Oc, shape: TopoDS_Shape, kinds: readonly ShapeKind[]) {
    const map = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    for (const kind of kinds) {
      oc.TopExp.MapShapes(shape, oc.TopAbs_ShapeEnum[kind], map);
    }

    this.map = map;
  }

  public has(shape: TopoDS_Shape): boolean {
    return this.map.Contains(shape);
  }

  /**
   * The indexed shape's own instance of a sub-shape, carrying the orientation it has inside the indexed shape.
   *
   * @param shape - sub-shape, in any orientation
   * @returns the indexed instance, or undefined when absent
   */
  public canonical(shape: TopoDS_Shape): TopoDS_Shape | undefined {
    const index = this.map.FindIndex(shape);
    return index > 0 ? this.map.FindKey(index) : undefined;
  }

  public delete(): void {
    this.map.delete();
  }
}

/**
 * Point on an edge at a normalised parameter.
 *
 * @param oc - libcascade instance
 * @param edge - edge
 * @param t - 0 at the first vertex, 1 at the last
 * @returns point and tangent at that parameter
 */
export function edgePoint(oc: Oc, edge: TopoDS_Edge, t: number): { point: Vec3; tangent: Vec3 } {
  const curve = new oc.BRepAdaptor_Curve(edge);
  const u = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * t;
  const p = new oc.gp_Pnt();
  const v = new oc.gp_Vec();
  curve.D1(u, p, v);
  const result = { point: fromPnt(p), tangent: vec3(v.X(), v.Y(), v.Z()) };
  p.delete();
  v.delete();
  curve.delete();
  return result;
}

/**
 * Axis-aligned bounding box of a shape.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @returns min and max corners, or undefined for a void box
 */
export function boundingBox(oc: Oc, shape: TopoDS_Shape): { min: Vec3; max: Vec3 } | undefined {
  const bounds = helpersFor(oc).bounds(shape);
  return bounds && { min: vec3(...bounds.min), max: vec3(...bounds.max) };
}

/**
 * Plane frame of a planar face, with z along the face's outward normal.
 *
 * @param oc - libcascade instance
 * @param face - face
 * @returns frame, or undefined when the face is not planar
 */
export function planarFaceFrame(oc: Oc, face: TopoDS_Face): Frame | undefined {
  const surface = new oc.BRepAdaptor_Surface(face, true);
  try {
    if (surface.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      return undefined;
    }

    const position = surface.Plane().Position();
    const origin = fromPnt(position.Location());
    const x = fromPnt(position.XDirection());
    let y = fromPnt(position.YDirection());
    let z = fromPnt(position.Direction());
    const reversed = face.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED;
    if (reversed) {
      z = vec3(-z.x, -z.y, -z.z);
    }

    // Keep the frame right-handed with z outward.
    const cz = { x: x.y * y.z - x.z * y.y, y: x.z * y.x - x.x * y.z, z: x.x * y.y - x.y * y.x };
    if (cz.x * z.x + cz.y * z.y + cz.z * z.z < 0) {
      y = vec3(-y.x, -y.y, -y.z);
    }

    return frameFromAxes(origin, x, y);
  } finally {
    surface.delete();
  }
}

/**
 * Area-weighted centre and outward normal of a face.
 *
 * @param oc - libcascade instance
 * @param face - face
 * @returns centre of mass and unit normal at that point
 */
export function faceCentroid(oc: Oc, face: TopoDS_Face): { center: Vec3; area: number } {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(face, props, false, false);
  const center = fromPnt(props.CentreOfMass());
  const area = props.Mass();
  props.delete();
  return { center, area };
}

/**
 * Volume and area of a shape.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @returns volume (mm³) and surface area (mm²)
 */
export function massProperties(oc: Oc, shape: TopoDS_Shape): { volume: number; area: number } {
  const helpers = helpersFor(oc);
  return { volume: helpers.volume(shape), area: helpers.area(shape) };
}

/**
 * Volume enclosed by a shape's solids; open surface bodies count as zero. Cheaper than `massProperties` when the
 * area is not needed.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @returns volume (mm³)
 */
export function volumeOf(oc: Oc, shape: TopoDS_Shape): number {
  return helpersFor(oc).volume(shape);
}

/**
 * Surface area of a shape.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @returns area (mm²)
 */
export function areaOf(oc: Oc, shape: TopoDS_Shape): number {
  return helpersFor(oc).area(shape);
}

/**
 * Builds a compound of shapes.
 *
 * @param oc - libcascade instance
 * @param shapes - children
 * @returns compound
 */
export function compound(oc: Oc, shapes: readonly TopoDS_Shape[]): TopoDS_Shape {
  const builder = new oc.BRep_Builder();
  const result = new oc.TopoDS_Compound();
  builder.MakeCompound(result);
  for (const shape of shapes) {
    builder.Add(result, shape);
  }

  builder.delete();
  return result;
}

/**
 * Solids of a shape; a bare shell or face yields the shape itself.
 *
 * @param oc - libcascade instance
 * @param shape - shape
 * @returns solids, or `[shape]` when it has none
 */
export function solidsOf(oc: Oc, shape: TopoDS_Shape): TopoDS_Shape[] {
  const solids = subShapes(oc, shape, 'TopAbs_SOLID');
  return solids.length > 0 ? solids : [shape];
}

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- one import site for libcascade types
export { type gp_Trsf } from '#offline/offline-libcascade.js';
