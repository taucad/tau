import type * as SmlibModule from '@classcad/smlibwasm';
import type { GeometrySvg, KernelIssue, RuntimeSpanTracer, TessellationReport } from '@taucad/runtime/types';
import {
  createTessellationDowngradedIssue,
  resolveOcctTessellation,
  tessellateWithinOcctBudget,
} from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import { resolveShapeName, uniqueShapeName } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';

import type { ShapeConfig, SmlibShape } from '#model.js';
import type { GeometrySmlib } from '#smlib.types.js';
import { normalizeColor } from '#utils/normalize-color.js';
import { projectSurfaceCoordinates } from '#utils/surface-coordinates.js';

/** The `@classcad/smlibwasm` module the kernel loaded. */
export type SmlibLibrary = typeof SmlibModule;

type Tessellation = OcctTessellationTolerances;

type RenderOptions = {
  library: SmlibLibrary;
  tessellation: Tessellation;
  collectBrepEdges?: boolean;
  tracer?: RuntimeSpanTracer;
};

/** SMLib authoring config used by the meshing adapter. */
export type InputShape = { [Key in keyof ShapeConfig]: ShapeConfig[Key] };

/** An input shape whose display name has been resolved and de-duplicated. @public */
export type NamedInputShape = InputShape & { name: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Whether a value is one of the shapes or meshes the SMLib library constructs.
 * @param library - Loaded SMLib module.
 * @param value - Candidate value.
 * @returns True for any `Shape` or `Mesh` instance.
 */
export const isSmlibShape = (library: SmlibLibrary, value: unknown): value is SmlibShape =>
  value instanceof library.Shape || value instanceof library.Mesh;

/**
 * Whether a retained shape renders as a drawing: curves (edges and wires) have no surface to mesh.
 * @param library - Loaded SMLib module.
 * @param shape - Shape in a live SMLib handle.
 * @returns True for edges and wires.
 */
export const isDrawingShape = (library: SmlibLibrary, shape: unknown): boolean =>
  shape instanceof library.Edge || shape instanceof library.Wire;

const isMeshableShape = (library: SmlibLibrary, shape: unknown): boolean =>
  shape instanceof library.Part ||
  shape instanceof library.Shell ||
  shape instanceof library.Face ||
  shape instanceof library.Mesh;

const isInputShape = (library: SmlibLibrary, value: unknown): value is InputShape =>
  isRecord(value) && !isSmlibShape(library, value) && 'shape' in value && value['shape'] !== undefined;

/**
 * Normalize an SMLib color (`'steelblue'`, `'#4682b4'`, or `[r, g, b]` in 0..1 or 0..255) to CSS.
 * @param color - Color as SMLib accepts it.
 * @returns A CSS color string, or undefined when absent.
 */
export const smlibColorToCss = (color: unknown): string | undefined => {
  if (typeof color === 'string') {
    return color;
  }
  if (Array.isArray(color) && color.length >= 3 && color.every((channel) => typeof channel === 'number')) {
    const channels: number[] = color.slice(0, 3);
    const scale = channels.every((channel) => channel <= 1) ? 255 : 1;
    const [red, green, blue] = channels.map((channel) => Math.round(Math.min(255, Math.max(0, channel * scale))));
    return `rgb(${red}, ${green}, ${blue})`;
  }
  return undefined;
};

const ownName = (shape: unknown): string | undefined => {
  const name = isRecord(shape) ? shape['name'] : undefined;
  return typeof name === 'string' && name.trim() ? name : undefined;
};

const flattenOutput = (library: SmlibLibrary, value: unknown): unknown[] => {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenOutput(library, item));
  }
  return [value];
};

function normalizeAppearance(shape: InputShape): InputShape {
  if (shape.material !== undefined) {
    if (['color', 'opacity', 'metalness', 'roughness'].some((key) => shape[key as keyof InputShape] !== undefined)) {
      throw new TypeError('Use material or legacy color/opacity/metalness/roughness, not both.');
    }
    return shape;
  }
  const { color, opacity, ...rest } = shape;
  const authoredColor = color ?? smlibColorToCss(isRecord(shape.shape) ? shape.shape['color'] : undefined);
  const normalizedColor = authoredColor ? normalizeColor(authoredColor) : undefined;
  let configuredOpacity: undefined | number = opacity;
  if (normalizedColor && normalizedColor.alpha !== 1) {
    configuredOpacity = opacity ?? normalizedColor.alpha;
  }

  const normalized: InputShape = {
    ...rest,
    color: normalizedColor?.color,
    opacity: configuredOpacity,
  };
  return normalized;
}

/**
 * Normalize a model's main-function output into named, color-normalized shape configs. Arrays and
 * `ShapeList`s are flattened in order; each body's own `named()` and `colored()` values fill the
 * fields its config leaves out.
 *
 * @param library - Loaded SMLib module.
 * @param output - Raw main() return value (or a Model's `shapes`).
 * @param defaultName - Optional model-declared default shape name.
 * @returns Named input shape configs with normalized color/opacity.
 */
export function normalizeRenderShapes(library: SmlibLibrary, output: unknown, defaultName?: string): NamedInputShape[] {
  const usedNames = new Map<string, number>();
  return flattenOutput(library, output).map((item, index) => {
    let config: InputShape;
    if (isInputShape(library, item)) {
      config = item;
    } else if (isSmlibShape(library, item)) {
      config = { shape: item };
    } else {
      throw new TypeError(
        `SMLib main() returned an unsupported value at index ${index}: expected a Part, Shell, Sketch, Face, Mesh, Edge or Wire, a ShapeConfig, or an array of them.`,
      );
    }
    if (!isSmlibShape(library, config.shape)) {
      throw new TypeError(`SMLib ShapeConfig at index ${index} has a shape that is not an SMLib shape or mesh.`);
    }
    if (!isMeshableShape(library, config.shape) && !isDrawingShape(library, config.shape)) {
      throw new TypeError(
        `SMLib cannot display a ${config.shape.constructor.name} (index ${index}); return a body, face, mesh, edge or wire.`,
      );
    }
    const normalized = normalizeAppearance(config);
    const name = uniqueShapeName(
      resolveShapeName({ index, name: config.name ?? ownName(config.shape) ?? defaultName, source: 'authored' }),
      usedNames,
    );
    return { ...normalized, name };
  });
}

type SpanRequest = {
  tracer: RuntimeSpanTracer | undefined;
  name: string;
  attributes: Record<string, string | number | boolean>;
};

function withSpan<T>({ tracer, name, attributes }: SpanRequest, operation: () => T): T {
  const span = tracer?.startSpan(name, attributes);
  try {
    return operation();
  } finally {
    span?.end();
  }
}

const needsSurfaceCoordinates = (material: GlbMaterial | undefined): boolean =>
  material !== undefined &&
  (material.extensions?.KHR_materials_anisotropy !== undefined || JSON.stringify(material).includes('Texture'));

type NumberArray = ArrayLike<number> & Iterable<number>;
// oxlint-disable-next-line typescript/no-restricted-types -- `Mesh.normals` is null when the mesh has none.
type FaceMesh = { vertices: NumberArray; triangles: NumberArray; normals: NumberArray | null };

/**
 * Append one face's mesh to the shape's buffers, averaging the face's corner normals per vertex.
 * Within one face the surface is smooth, so the average is the surface normal; across faces the
 * vertices are separate, which keeps CAD edges crisp.
 * @param target - The shape's face buffers.
 * @param mesh - One face's mesh, with corner normals when the kernel gave them.
 * @param faceId - The face's index in its body.
 */
function appendFaceMesh(target: GeometrySmlib['faces'], mesh: FaceMesh, faceId: number): void {
  const base = target.vertices.length / 3;
  const start = target.triangles.length;
  const vertexCount = mesh.vertices.length / 3;
  const sums = new Float64Array(vertexCount * 3);
  // Pushed one by one: spreading a large mesh into `push` overflows the call stack.
  for (const value of mesh.vertices) {
    target.vertices.push(value);
  }
  for (let corner = 0; corner < mesh.triangles.length; corner++) {
    const vertex = mesh.triangles[corner]!;
    target.triangles.push(base + vertex);
    if (mesh.normals) {
      sums[vertex * 3]! += mesh.normals[corner * 3]!;
      sums[vertex * 3 + 1]! += mesh.normals[corner * 3 + 1]!;
      sums[vertex * 3 + 2]! += mesh.normals[corner * 3 + 2]!;
    }
  }
  if (!mesh.normals) {
    for (let corner = 0; corner < mesh.triangles.length; corner += 3) {
      const a = mesh.triangles[corner]! * 3;
      const b = mesh.triangles[corner + 1]! * 3;
      const c = mesh.triangles[corner + 2]! * 3;
      const ab = [0, 1, 2].map((axis) => mesh.vertices[b + axis]! - mesh.vertices[a + axis]!);
      const ac = [0, 1, 2].map((axis) => mesh.vertices[c + axis]! - mesh.vertices[a + axis]!);
      const normal = [
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ];
      for (const vertex of [a, b, c]) {
        for (let axis = 0; axis < 3; axis++) {
          sums[vertex + axis]! += normal[axis]!;
        }
      }
    }
  }
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const x = sums[vertex * 3]!;
    const y = sums[vertex * 3 + 1]!;
    const z = sums[vertex * 3 + 2]!;
    // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- Math.sqrt is correctly rounded; Math.hypot is implementation-approximated.
    const length = Math.sqrt(x * x + y * y + z * z);
    target.normals.push(length > 0 ? x / length : 0, length > 0 ? y / length : 0, length > 0 ? z / length : 1);
  }
  target.faceGroups.push({ start, count: target.triangles.length - start, faceId });
}

const minimumCurveSegments = 4;
const maximumCurveDepth = 10;

/**
 * Sample one edge into a polyline: its two ends for a line, otherwise an adaptive bisection on the
 * curve parameter until each chord is within the linear tolerance of the curve and turns by less
 * than the angular tolerance.
 * @param edge - The edge to sample.
 * @param tessellation - Linear and angular tolerances.
 * @returns The polyline's points.
 */
function sampleEdge(edge: SmlibModule.Edge, tessellation: Tessellation): number[][] {
  const start = edge.pointAt(0).toArray();
  const end = edge.pointAt(1).toArray();
  if (edge.geomType === 'line') {
    return [start, end];
  }
  const maximumTurn = (tessellation.angularTolerance * Math.PI) / 180;
  const distance = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  const points: number[][] = [];
  type Span = { t0: number; p0: number[]; t1: number; p1: number[] };
  const refine = ({ t0, p0, t1, p1 }: Span, depth: number): void => {
    const tm = (t0 + t1) / 2;
    const pm = edge.pointAt(tm).toArray();
    const chordMid = [(p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2, (p0[2]! + p1[2]!) / 2];
    const sagitta = distance(pm, chordMid);
    const half = distance(p0, p1) / 2;
    const turn = half > 0 ? 4 * Math.atan2(sagitta, half) : 0;
    if (depth < maximumCurveDepth && (sagitta > tessellation.linearTolerance || turn > maximumTurn)) {
      refine({ t0, p0, t1: tm, p1: pm }, depth + 1);
      refine({ t0: tm, p0: pm, t1, p1 }, depth + 1);
      return;
    }
    points.push(p1);
  };
  points.push(start);
  const seeds = Array.from({ length: minimumCurveSegments + 1 }, (_, index) => index / minimumCurveSegments);
  let previous = start;
  for (let index = 1; index < seeds.length; index++) {
    const t = seeds[index]!;
    const point = index === seeds.length - 1 ? end : edge.pointAt(t).toArray();
    refine({ t0: seeds[index - 1]!, p0: previous, t1: t, p1: point }, 0);
    previous = point;
  }
  return points;
}

/**
 * Append edges as a segment soup, one scalar range per edge.
 * @param target - The shape's edge buffers.
 * @param edges - The body's edges, in order.
 * @param tessellation - Linear and angular tolerances.
 */
function appendEdges(
  target: GeometrySmlib['edges'],
  edges: readonly SmlibModule.Edge[],
  tessellation: Tessellation,
): void {
  for (const [edgeId, edge] of edges.entries()) {
    const points = sampleEdge(edge, tessellation);
    const start = target.lines.length;
    for (let index = 1; index < points.length; index++) {
      target.lines.push(...points[index - 1]!, ...points[index]!);
    }
    if (target.lines.length > start) {
      target.edgeGroups.push({ start, count: target.lines.length - start, edgeId });
    }
  }
}

/** One face's triangles in a whole-body mesh: the half-open range `[start, end)` of triangle indices. */
type FaceRun = { faceId: number; start: number; end: number };

/**
 * Which face each triangle of a whole-body mesh came from. SMLib meshes a body in one pass, so faces
 * share their boundary samples and the mesh is watertight, but the public mesh does not say which
 * face a triangle belongs to. The kernel emits each face's triangles as one contiguous run, so the
 * runs are found by bisection: a triangle is classified by the face nearest its centroid (among the
 * faces whose box holds it), and a range whose two ends share a face is that face throughout.
 *
 * @param faces - The body's faces, in `faces()` order.
 * @param mesh - The body's mesh.
 * @param tolerance - The mesh's chord tolerance, which bounds a centroid's distance from its face.
 * @returns The face runs in mesh order.
 */
function findFaceRuns(faces: readonly SmlibModule.Face[], mesh: FaceMesh, tolerance: number): FaceRun[] {
  const triangleCount = mesh.triangles.length / 3;
  if (faces.length <= 1 || triangleCount === 0) {
    return [{ faceId: 0, start: 0, end: triangleCount }];
  }
  const margin = Math.max(tolerance * 4, 1e-6);
  const boxes = faces.map((face) => {
    const box = face.bbox();
    return {
      low: box.min.toArray().map((value) => value - margin),
      high: box.max.toArray().map((value) => value + margin),
    };
  });
  const owners = new Map<number, number>();
  const classify = (triangle: number): number => {
    const known = owners.get(triangle);
    if (known !== undefined) {
      return known;
    }
    const centroid = [0, 1, 2].map(
      (axis) =>
        (mesh.vertices[mesh.triangles[triangle * 3]! * 3 + axis]! +
          mesh.vertices[mesh.triangles[triangle * 3 + 1]! * 3 + axis]! +
          mesh.vertices[mesh.triangles[triangle * 3 + 2]! * 3 + axis]!) /
        3,
    );
    const inside = boxes.flatMap(({ low, high }, faceId) =>
      centroid.every((value, axis) => value >= low[axis]! && value <= high[axis]!) ? [faceId] : [],
    );
    const candidates = inside.length > 0 ? inside : faces.map((_, faceId) => faceId);
    let owner = candidates[0]!;
    let nearest = Number.POSITIVE_INFINITY;
    for (const faceId of candidates) {
      const distance = candidates.length === 1 ? 0 : faces[faceId]!.distanceTo(centroid);
      if (distance < nearest) {
        nearest = distance;
        owner = faceId;
      }
    }
    owners.set(triangle, owner);
    return owner;
  };
  const runs: FaceRun[] = [];
  const append = (faceId: number, start: number, end: number): void => {
    const last = runs.at(-1);
    if (last?.faceId === faceId && last.end === start) {
      last.end = end;
    } else {
      runs.push({ faceId, start, end });
    }
  };
  // Ranges are visited left to right, so runs come out in mesh order.
  const split = (low: number, high: number): void => {
    const first = classify(low);
    if (first === classify(high)) {
      append(first, low, high + 1);
      return;
    }
    if (high - low === 1) {
      append(first, low, low + 1);
      append(classify(high), high, high + 1);
      return;
    }
    const middle = Math.floor((low + high) / 2);
    split(low, middle);
    split(middle + 1, high);
  };
  split(0, triangleCount - 1);
  return runs;
}

/**
 * One run of a whole-body mesh as a face mesh of its own: the run's triangles with their corner
 * normals, and the vertices they use, which keep their exact positions so neighbouring faces meet.
 * @param mesh - The mesh SMLib made of the whole body.
 * @param run - Which triangles belong to the face.
 * @returns The face's mesh.
 */
function sliceFaceMesh(mesh: FaceMesh, { start, end }: FaceRun): FaceMesh {
  const local = new Map<number, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  for (let corner = start * 3; corner < end * 3; corner++) {
    const vertex = mesh.triangles[corner]!;
    let index = local.get(vertex);
    if (index === undefined) {
      index = local.size;
      local.set(vertex, index);
      vertices.push(mesh.vertices[vertex * 3]!, mesh.vertices[vertex * 3 + 1]!, mesh.vertices[vertex * 3 + 2]!);
    }
    triangles.push(index);
  }
  if (!mesh.normals) {
    return { vertices, triangles, normals: null };
  }
  const normals: number[] = [];
  for (let index = start * 9; index < end * 9; index++) {
    normals.push(mesh.normals[index]!);
  }
  return { vertices, triangles, normals };
}

/**
 * Edges used by other than two triangles once the meshes' coincident positions are joined.
 * @param meshes - Meshes that together should close a solid.
 * @returns How many edges are open or non-manifold; zero for a watertight solid.
 */
function countOpenEdges(meshes: readonly FaceMesh[]): number {
  const edges = new Map<string, number>();
  for (const { vertices, triangles } of meshes) {
    const key = (vertex: number): string =>
      `${vertices[vertex * 3]!.toFixed(6)},${vertices[vertex * 3 + 1]!.toFixed(6)},${vertices[vertex * 3 + 2]!.toFixed(6)}`;
    for (let corner = 0; corner < triangles.length; corner += 3) {
      const corners = [key(triangles[corner]!), key(triangles[corner + 1]!), key(triangles[corner + 2]!)];
      for (let side = 0; side < 3; side++) {
        const a = corners[side]!;
        const b = corners[(side + 1) % 3]!;
        const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
  }
  let open = 0;
  for (const count of edges.values()) {
    if (count !== 2) {
      open++;
    }
  }
  return open;
}

function emptyGeometry(config: NamedInputShape): GeometrySmlib {
  const { name, color, opacity, metalness, roughness, material } = config;
  return {
    format: 'smlib',
    name,
    color,
    opacity,
    metalness,
    roughness,
    material,
    faces: { triangles: [], vertices: [], normals: [], faceGroups: [] },
    edges: { lines: [], edgeGroups: [] },
  };
}

/**
 * Tessellate one body, face or mesh into face-grouped triangles and edge-grouped lines.
 *
 * Each B-rep face is meshed on its own so every triangle carries its face id; a body whose faces
 * the kernel cannot mesh alone (some imported bodies) falls back to one mesh of the whole body as a
 * single face group.
 * @param config - The named shape and its appearance.
 * @param options - Library, tessellation, edge and telemetry options.
 * @returns The shape's grouped geometry.
 */
function renderMesh(config: NamedInputShape, options: RenderOptions): GeometrySmlib {
  const { library, tessellation, collectBrepEdges = false, tracer } = options;
  const geometry = emptyGeometry(config);
  const { shape } = config;
  const attributes = {
    shapeName: config.name,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  };

  withSpan({ tracer, name: 'smlib.tessellate.faces', attributes: { ...attributes, output: 'faces' } }, () => {
    if (shape instanceof library.Mesh) {
      appendFaceMesh(geometry.faces, shape, 0);
      return;
    }
    // One mesh of the whole body: faces meshed alone sample their shared edges differently and crack.
    const mesh = library.tessellate(shape, tessellation.linearTolerance, tessellation.angularTolerance);
    if (shape instanceof library.Part && !mesh.isClosed()) {
      // SMLib 0.3.4 leaves a moved torus's seam open in a body mesh, though the face alone meshes
      // closed: keep whichever mesh has fewer open edges.
      const faceMeshes = [...shape.faces()].map((face) =>
        library.tessellate(face, tessellation.linearTolerance, tessellation.angularTolerance),
      );
      if (countOpenEdges(faceMeshes) < countOpenEdges([mesh])) {
        for (const [faceId, faceMesh] of faceMeshes.entries()) {
          appendFaceMesh(geometry.faces, faceMesh, faceId);
        }
        return;
      }
    }
    let runs: FaceRun[];
    try {
      runs = shape instanceof library.Face ? [] : findFaceRuns([...shape.faces()], mesh, tessellation.linearTolerance);
    } catch {
      runs = [];
    }
    if (runs.length === 0) {
      appendFaceMesh(geometry.faces, mesh, 0);
      return;
    }
    for (const run of runs) {
      appendFaceMesh(geometry.faces, sliceFaceMesh(mesh, run), run.faceId);
    }
  });

  if (needsSurfaceCoordinates(config.material) && geometry.faces.triangles.length > 0) {
    const projected = projectSurfaceCoordinates({
      positions: geometry.faces.vertices,
      normals: geometry.faces.normals,
      indices: geometry.faces.triangles,
    });
    geometry.faces = {
      ...geometry.faces,
      vertices: projected.positions,
      normals: projected.normals,
      triangles: projected.indices,
      texCoords: projected.texCoords,
      tangents: projected.tangents,
    };
  }

  if (collectBrepEdges && !(shape instanceof library.Mesh)) {
    withSpan({ tracer, name: 'smlib.tessellate.edges', attributes: { ...attributes, output: 'edges' } }, () => {
      appendEdges(geometry.edges, [...shape.edges()], tessellation);
    });
  }

  return geometry;
}

// =============================================================================
// Drawings
// =============================================================================

const escapeSvgAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

const strokeDashArray = (strokeType: string | undefined): string | undefined => {
  if (strokeType === 'dots') {
    return '1 3';
  }
  if (strokeType === 'dashes') {
    return '8 4';
  }
  return undefined;
};

const formatSvgNumber = (value: number): string => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/** Drawing tolerance for curves: fine enough for print, independent of model tessellation. */
const drawingTessellation: Tessellation = { linearTolerance: 0.01, angularTolerance: 5 };

/** A drawing retained by a handle: its curves sampled once, in model millimetres. */
export type DrawingEntry = Omit<NamedInputShape, 'shape'> & {
  /** One polyline per B-rep edge, each a list of `[x, y, z]` points. */
  polylines: number[][][];
};

/**
 * Sample a drawing's edges once, at a print tolerance independent of model tessellation. The
 * samples, not the live curves, are retained, so drawings survive a snapshot.
 *
 * @param library - Loaded SMLib module.
 * @param config - A drawing entry (an edge or a wire).
 * @returns The entry with its sampled polylines in place of the shape.
 */
export function sampleDrawing(library: SmlibLibrary, config: NamedInputShape): DrawingEntry {
  const { shape, ...metadata } = config;
  const edges = shape instanceof library.Edge ? [shape] : [...(shape as SmlibModule.Wire).edges()];
  return { ...metadata, polylines: edges.map((edge) => sampleEdge(edge, drawingTessellation)) };
}

/**
 * Render drawings as one SVG of the model's XY plane (Y up, as on paper).
 *
 * @param entries - Sampled drawing entries.
 * @returns The SVG drawing, in millimetres.
 */
export function renderDrawing(entries: readonly DrawingEntry[]): GeometrySvg {
  if (entries.length === 0) {
    throw new TypeError('SMLib SVG render requires at least one edge or wire.');
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const paths = entries.map((entry) => {
    const segments = entry.polylines.map((polyline) =>
      polyline
        .map(([x = 0, y = 0], index) => {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, -y);
          maxY = Math.max(maxY, -y);
          return `${index === 0 ? 'M' : 'L'}${formatSvgNumber(x)} ${formatSvgNumber(-y)}`;
        })
        .join(' '),
    );
    const stroke = escapeSvgAttribute(entry.color ?? 'currentColor');
    const opacity = entry.opacity === undefined ? '' : ` opacity="${entry.opacity}"`;
    const dashArray = strokeDashArray(entry.strokeType);
    const dash = dashArray === undefined ? '' : ` stroke-dasharray="${dashArray}"`;
    return `<path d="${escapeSvgAttribute(segments.join(' '))}" fill="none" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"${opacity}${dash}/>`;
  });
  const margin = Math.max(maxX - minX, maxY - minY, 1) * 0.02;
  const viewBox = [minX - margin, minY - margin, maxX - minX + 2 * margin, maxY - minY + 2 * margin]
    .map((value) => formatSvgNumber(value))
    .join(' ');
  return {
    format: 'svg',
    units: { length: 'mm' },
    ...(entries.length === 1 ? { name: entries[0]!.name } : {}),
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${paths.join('')}</svg>`,
  };
}

// =============================================================================
// Tessellation within budgets
// =============================================================================

/**
 * Renders the meshable input shapes into face- and edge-grouped geometry; drawings are skipped.
 *
 * @param shapes - The shapes to render with optional color/name metadata.
 * @param options - Library, tessellation, BRep edge, and telemetry options.
 * @returns One geometry per meshable shape.
 */
export function render(shapes: readonly NamedInputShape[], options: RenderOptions): GeometrySmlib[] {
  return shapes
    .filter((config) => isMeshableShape(options.library, config.shape))
    .map((config) => renderMesh(config, options));
}

/** A tessellation request: a preset or explicit tolerances, and the field values an explicit request omits. */
export type SmlibTessellationRequest = Readonly<{
  tessellation: OcctTessellation;
  explicitDefaults: OcctTessellationTolerances;
}>;

/**
 * Bounding-box diagonal of every meshable shape together, in model millimetres.
 *
 * @param library - Loaded SMLib module.
 * @param shapes - Shapes about to be meshed; drawings are ignored.
 * @returns The diagonal, or `NaN` when no meshable shape has extent.
 */
export function measureShapesDiagonal(library: SmlibLibrary, shapes: readonly InputShape[]): number {
  let minimum: number[] | undefined;
  let maximum: number[] | undefined;
  for (const { shape } of shapes) {
    if (!isMeshableShape(library, shape)) {
      continue;
    }
    try {
      const box = shape.bbox();
      const low = box.min.toArray();
      const high = box.max.toArray();
      minimum = minimum ? minimum.map((value, axis) => Math.min(value, low[axis]!)) : low;
      maximum = maximum ? maximum.map((value, axis) => Math.max(value, high[axis]!)) : high;
    } catch {
      // An empty body has no box.
    }
  }
  if (!minimum || !maximum) {
    return Number.NaN;
  }
  return Math.hypot(maximum[0]! - minimum[0]!, maximum[1]! - minimum[1]!, maximum[2]! - minimum[2]!);
}

/**
 * Resolve a request into absolute tolerances. Explicit tolerances never measure the shapes.
 *
 * @param library - Loaded SMLib module.
 * @param shapes - Shapes about to be meshed.
 * @param request - The preset or explicit tolerances.
 * @returns Absolute tolerances and the requested form.
 */
export function resolveSmlibTessellation(
  library: SmlibLibrary,
  shapes: readonly InputShape[],
  request: SmlibTessellationRequest,
): OcctResolvedTessellation {
  return resolveOcctTessellation({ ...request, measureDiagonal: () => measureShapesDiagonal(library, shapes) });
}

/**
 * Triangles and vertices of rendered geometries, summed over every delivered part.
 *
 * @param geometries - Rendered geometries.
 * @returns Triangle and vertex counts.
 */
export function countMesh(geometries: readonly GeometrySmlib[]): { triangles: number; vertices: number } {
  let triangles = 0;
  let vertices = 0;
  for (const geometry of geometries) {
    triangles += geometry.faces.triangles.length / 3;
    vertices += geometry.faces.vertices.length / 3;
  }
  return { triangles, vertices };
}

/** A rendering within a triangle budget, with its cost report and any downgrade warning. */
export type BudgetedRender = {
  geometries: GeometrySmlib[];
  tessellation: TessellationReport;
  issues: KernelIssue[];
};

/**
 * Render a preview within a triangle budget. The request resolves to absolute tolerances; while
 * the mesh exceeds the budget it is re-tessellated one step coarser, at most three times, and a
 * `TESSELLATION_DOWNGRADED` warning names the requested and effective tolerances.
 *
 * @param shapes - The shapes to render.
 * @param options - Request, budget, and the {@link render} options other than tessellation.
 * @returns Geometries, the tessellation report and the downgrade warning when one was taken.
 */
export function renderWithinBudget(
  shapes: readonly NamedInputShape[],
  options: Omit<RenderOptions, 'tessellation'> & { request: SmlibTessellationRequest; budget: number },
): BudgetedRender {
  const { request, budget, ...renderOptions } = options;
  const started = performance.now();
  const requested = resolveSmlibTessellation(renderOptions.library, shapes, request);
  const { result, effective, downgraded } = tessellateWithinOcctBudget({
    tolerances: requested,
    budget,
    tessellate(tolerances) {
      const geometries = render(shapes, { ...renderOptions, tessellation: tolerances });
      return { geometries, ...countMesh(geometries) };
    },
  });
  return {
    geometries: result.geometries,
    tessellation: {
      triangles: result.triangles,
      vertices: result.vertices,
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: effective.linearTolerance,
      angularTolerance: effective.angularTolerance,
      downgraded,
    },
    issues:
      downgraded === 0
        ? []
        : [
            createTessellationDowngradedIssue({
              producer: 'smlib',
              requested,
              effective,
              downgraded,
              triangles: result.triangles,
              budget,
            }),
          ],
  };
}
