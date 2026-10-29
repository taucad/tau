/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * B-rep edge overlay for offline glTF exports, in the layout the Replicad and OpenCascade kernels write.
 *
 * Each solid's edges become one `LINES` primitive on the solid's mesh: de-indexed segments, `tauComponentKind:
 * 'line'`, a `node/<n>/edges` selector and `edgeGroups` counted in XYZ scalars. An edge on a meshed face reads the
 * face's own boundary samples (`PolygonOnTriangulation`), so line vertices coincide with surface vertices; an edge
 * without one is sampled from its curve at the surface's tolerances.
 */
import { formatPrimitiveSelector, transformVertexArray } from '@taucad/geometry-core';
import { cadEdgeOverlayMaterialDefaults } from '@taucad/runtime/types';
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';

/** One B-rep edge's span of the line soup, counted in XYZ scalars like replicad's `xyz-scalars-v1`. */
type EdgeGroup = { start: number; count: number; edgeId: number };

/** A shape's edges as a segment soup in kcl-lib's frame (millimetres, Z-up). */
export type ShapeEdges = { lines: Float64Array; edgeGroups: EdgeGroup[] };

type Deletable = { delete(): void };

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
  sample: { edge: TopoDS_Shape; tolerances: { linear: number; angular: number } },
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
 * Extracts a meshed shape's B-rep edges as line segments, each edge once and degenerate edges skipped. The shape's
 * root location is left out because the glTF writer moves it onto the node.
 *
 * @param oc - libcascade instance
 * @param shape - a shape already meshed at `tolerances`
 * @param tolerances - linear (mm) and angular (rad) deflection
 * @returns the segment soup and one group per edge
 */
export function extractShapeEdges(
  oc: Oc,
  shape: TopoDS_Shape,
  tolerances: { linear: number; angular: number },
): ShapeEdges {
  const owned: Deletable[] = [];
  try {
    const identity = new oc.TopLoc_Location();
    const root = shape.Located(identity, false);
    const edgeMap = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    owned.push(identity, root, edgeMap);
    oc.TopExp.MapShapes(root, oc.TopAbs_ShapeEnum.TopAbs_EDGE, edgeMap);
    const lines: number[] = [];
    const edgeGroups: EdgeGroup[] = [];
    for (let index = 1; index <= edgeMap.Extent(); index++) {
      const edge = edgeMap.FindKey(index);
      owned.push(edge);
      if (oc.BRep_Tool.Degenerated(oc.TopoDS.Edge(edge))) {
        continue;
      }

      const points = polygonPoints(oc, edge, owned) ?? curvePoints(oc, { edge, tolerances }, owned);
      const start = lines.length;
      for (let point = 3; point < points.length; point += 3) {
        lines.push(...points.slice(point - 3, point + 3));
      }

      edgeGroups.push({ start, count: lines.length - start, edgeId: edgeGroups.length });
    }

    return { lines: Float64Array.from(lines), edgeGroups };
  } finally {
    for (const handle of owned) {
      handle.delete();
    }
  }
}

/** The parts of glTF JSON the edge overlay touches. */
export type GltfJson = {
  asset: unknown;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  bufferViews?: Array<Record<string, unknown>>;
  accessors?: Array<Record<string, unknown>>;
  materials?: Array<Record<string, unknown>>;
  meshes?: Array<{ name?: string; primitives: Array<{ [key: string]: unknown; mode?: number }> }>;
  nodes?: Array<{ name?: string; mesh?: number }>;
  extensionsUsed?: string[];
};

const linesMode = 1;
const unlitExtension = 'KHR_materials_unlit';
const align4 = (value: number): number => Math.ceil(value / 4) * 4;

/**
 * Appends each solid's edges to the mesh of the node the writer named after it, replacing the writer's own lines.
 * The glTF is edited in place as JSON plus one binary buffer, so the export stays synchronous.
 *
 * @param json - glTF JSON whose first buffer is `bin`; edited in place
 * @param bin - the first buffer's bytes
 * @param edgesByName - edges per solid id
 * @returns the grown buffer
 */
export function appendEdgesToGltf(
  json: GltfJson,
  bin: Uint8Array<ArrayBuffer>,
  edgesByName: ReadonlyMap<string, ShapeEdges>,
): Uint8Array<ArrayBuffer> {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [bin];
  let { byteLength } = bin;
  let materialIndex: number | undefined;
  for (const [nodeIndex, node] of (json.nodes ?? []).entries()) {
    const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
    const edges = edgesByName.get(node.name ?? '') ?? edgesByName.get(mesh?.name ?? '');
    if (!mesh || !edges?.edgeGroups.length) {
      continue;
    }

    if (materialIndex === undefined) {
      json.materials ??= [];
      materialIndex = json.materials.length;
      json.materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
          metallicFactor: cadEdgeOverlayMaterialDefaults.metallicFactor,
          roughnessFactor: cadEdgeOverlayMaterialDefaults.roughnessFactor,
        },
        doubleSided: cadEdgeOverlayMaterialDefaults.doubleSided,
        extensions: { [unlitExtension]: {} },
      });
      json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), unlitExtension])];
    }

    const positions = transformVertexArray(edges.lines, { coordinateSystem: 'y-up', unit: { length: 'meter' } });
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const [index, value] of positions.entries()) {
      min[index % 3] = Math.min(min[index % 3]!, value);
      max[index % 3] = Math.max(max[index % 3]!, value);
    }

    const offset = align4(byteLength);
    chunks.push(new Uint8Array(offset - byteLength), new Uint8Array(positions.buffer));
    byteLength = offset + positions.byteLength;
    json.bufferViews ??= [];
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: positions.byteLength, target: 34_962 });
    json.accessors ??= [];
    json.accessors.push({
      bufferView: json.bufferViews.length - 1,
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      min,
      max,
    });
    mesh.primitives = mesh.primitives.filter((primitive) => primitive.mode !== linesMode);
    mesh.primitives.push({
      mode: linesMode,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantic
      attributes: { POSITION: json.accessors.length - 1 },
      material: materialIndex,
      extras: {
        tauComponentKind: 'line',
        tauComponentSelector: formatPrimitiveSelector(nodeIndex, 'edges'),
        edgeGroups: edges.edgeGroups,
        tauEdgeGroupUnit: 'xyz-scalars-v1',
      },
    });
  }

  const grown = new Uint8Array(align4(byteLength));
  let cursor = 0;
  for (const chunk of chunks) {
    grown.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  json.buffers ??= [{ byteLength: 0 }];
  json.buffers[0]!.byteLength = grown.byteLength;
  return grown;
}

/**
 * Adds the edge overlay to a GLB written by `RWGltf_CafWriter`.
 *
 * @param glb - the GLB bytes
 * @param edgesByName - edges per solid id
 * @returns the GLB with one `LINES` primitive per solid mesh
 */
export function appendEdgesToGlb(
  glb: Uint8Array<ArrayBuffer>,
  edgesByName: ReadonlyMap<string, ShapeEdges>,
): Uint8Array<ArrayBuffer> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GltfJson;
  const binStart = 20 + jsonLength;
  const bin =
    binStart + 8 <= glb.byteLength
      ? glb.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true))
      : new Uint8Array();
  const grown = appendEdgesToGltf(json, bin, edgesByName);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = align4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonPadded + 8 + grown.byteLength;
  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, 0x46_54_6c_67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, jsonPadded, true);
  outView.setUint32(16, 0x4e_4f_53_4a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  outView.setUint32(20 + jsonPadded, grown.byteLength, true);
  outView.setUint32(24 + jsonPadded, 0x00_4e_49_42, true);
  out.set(grown, 28 + jsonPadded);
  return out;
}
