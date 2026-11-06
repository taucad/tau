import type * as SmlibModule from '@classcad/smlibwasm';
import type { GeometrySvg, RuntimeSpanTracer, TessellationReport } from '@taucad/runtime/types';
import { resolveOcctTessellation } from '@taucad/occt-core';
import type { OcctResolvedTessellation, OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import { resolveShapeName, uniqueShapeName } from '@taucad/geometry-core';
import type { GlbMaterial } from '@taucad/geometry-core';

import type { ShapeConfig, SmlibShape } from '#model.js';
import type { GeometrySmlib } from '#smlib.types.js';
import { normalizeColor } from '#utils/normalize-color.js';
import { meshBoundaryPolylines } from '#utils/mesh-edges.js';
import { evaluateNurbs } from '#utils/nurbs.js';
import { boundaryPolylines, brepOf, edgeIndices, edgeNurbs, edgeTopology } from '#utils/smlib-kernel.js';
import type { SmlibKernel } from '#utils/smlib-kernel.js';
import { projectSurfaceCoordinates } from '#utils/surface-coordinates.js';

/** The `@classcad/smlibwasm` module the kernel loaded. */
export type SmlibLibrary = typeof SmlibModule;

type Tessellation = OcctTessellationTolerances;

type RenderOptions = {
  library: SmlibLibrary;
  /** The raw kernel layer, for the whole-body edge calls. */
  kernel: SmlibKernel;
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
 * Sample a curve into a polyline by adaptive bisection on its parameter, until each chord is within
 * the linear tolerance of the curve and turns by less than the angular tolerance.
 * @param evaluate - The curve's point at a parameter.
 * @param range - The parameters of the polyline's first and last point (the first may be the larger).
 * @param tessellation - Linear and angular tolerances.
 * @returns The polyline's points.
 */
export function sampleCurve(
  evaluate: (t: number) => number[],
  range: readonly [number, number],
  tessellation: Tessellation,
): number[][] {
  const [first, last] = range;
  const start = evaluate(first);
  const end = evaluate(last);
  const maximumTurn = (tessellation.angularTolerance * Math.PI) / 180;
  const distance = (a: number[], b: number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  const points: number[][] = [];
  type Span = { t0: number; p0: number[]; t1: number; p1: number[] };
  const refine = ({ t0, p0, t1, p1 }: Span, depth: number): void => {
    const tm = (t0 + t1) / 2;
    const pm = evaluate(tm);
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
  let previous = start;
  let previousT = first;
  for (let index = 1; index <= minimumCurveSegments; index++) {
    const t = index === minimumCurveSegments ? last : first + ((last - first) * index) / minimumCurveSegments;
    const point = index === minimumCurveSegments ? end : evaluate(t);
    refine({ t0: previousT, p0: previous, t1: t, p1: point }, 0);
    previous = point;
    previousT = t;
  }
  return points;
}

/**
 * Sample one edge into a polyline, from start to end: its two ends for a line, otherwise an adaptive
 * bisection ({@link sampleCurve}) of its curve, read once as a NURBS (`ext.curve_data`) and
 * evaluated in JavaScript. One kernel call per edge, however many samples the curve takes.
 * @param kernel - The raw kernel layer.
 * @param edge - The edge to sample.
 * @param tessellation - Linear and angular tolerances.
 * @returns The polyline's points.
 */
export function sampleEdge(kernel: SmlibKernel, edge: SmlibModule.Edge, tessellation: Tessellation): number[][] {
  const { curve, reversed } = edgeNurbs(kernel, edge);
  const [t0, t1] = curve.interval;
  const range: [number, number] = reversed ? [t1, t0] : [t0, t1];
  const evaluate = (t: number): number[] => evaluateNurbs(curve, t);
  if (curve.kind === 'line') {
    return [evaluate(range[0]), evaluate(range[1])];
  }
  return sampleCurve(evaluate, range, tessellation);
}

/** Finest turn per segment of a fallback edge, in degrees: 4,096 segments on a full circle. */
const finestFallbackTurn = 360 / 4096;

/**
 * The largest turn per segment that keeps a circular arc no larger than the body within the linear
 * tolerance, capped by the angular tolerance: `k.tessellate_boundaries` takes only an angle.
 * @param tessellation - Linear and angular tolerances.
 * @param mesh - The body's mesh, whose extent bounds the radius of its arcs.
 * @returns The angle in degrees.
 */
function fallbackTurn(tessellation: Tessellation, mesh: FaceMesh): number {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < mesh.vertices.length; index++) {
    const axis = index % 3;
    low[axis] = Math.min(low[axis]!, mesh.vertices[index]!);
    high[axis] = Math.max(high[axis]!, mesh.vertices[index]!);
  }
  const radius = Math.hypot(high[0]! - low[0]!, high[1]! - low[1]!, high[2]! - low[2]!) / 2;
  const chordTurn =
    radius > tessellation.linearTolerance
      ? (2 * Math.acos(1 - tessellation.linearTolerance / radius) * 180) / Math.PI
      : tessellation.angularTolerance;
  return Math.max(finestFallbackTurn, Math.min(tessellation.angularTolerance, chordTurn));
}

/**
 * Append a body's edges as a segment soup, one scalar range per edge.
 *
 * Each edge is drawn through the face mesh's own samples of it (see {@link meshBoundaryPolylines}),
 * matched by the end vertices that one `ext.brep_dump` of the body records, so the line lies on the
 * triangles' edges at any tessellation. Edges the mesh does not bound (the faces were not told
 * apart) fall back to the kernel's own polylines of every edge, from one `k.tessellate_boundaries`
 * call; a seam (`ext.seam_edges`), which lies inside one face, is left out, as `smlibpy` leaves it out.
 * @param target - The shape's edge buffers.
 * @param shape - The body or face whose edges are drawn.
 * @param surface - The shape's mesh, its triangles' faces, the tolerances it was made with, and the library and kernel layer.
 */
function appendEdges(
  target: GeometrySmlib['edges'],
  shape: SmlibModule.Shape,
  surface: {
    mesh: FaceMesh;
    owners: Int32Array;
    tessellation: Tessellation;
    library: SmlibLibrary;
    kernel: SmlibKernel;
  },
): void {
  const { tessellation, library, kernel } = surface;
  const edges = [...shape.edges()];
  const brep = brepOf(library, shape);
  let fromMesh = new Map<number, number[][][]>();
  try {
    const topology = edgeTopology(kernel, { brep, edges, scope: shape instanceof library.Face ? 'edges' : 'body' });
    fromMesh = meshBoundaryPolylines({
      mesh: surface.mesh,
      owners: surface.owners,
      edges,
      ends: topology.ends,
      vertices: topology.vertices,
      tolerance: tessellation.linearTolerance,
    });
  } catch {
    // A body the kernel cannot measure against: every edge takes the kernel's polyline.
  }
  const kernelPolylines = (): ((edgeId: number) => number[][][]) => {
    const { polylines, seams } = boundaryPolylines(kernel, brep, fallbackTurn(tessellation, surface.mesh));
    const indices = edgeIndices(kernel, brep, edges);
    return (edgeId) => {
      const index = indices[edgeId]!;
      const polyline = polylines[index] ?? [];
      return seams.has(index) || polyline.length < 2 ? [] : [polyline];
    };
  };
  let fallback: ((edgeId: number) => number[][][]) | undefined;
  for (const edgeId of edges.keys()) {
    const polylines = fromMesh.get(edgeId) ?? (fallback ??= kernelPolylines())(edgeId);
    const start = target.lines.length;
    for (const points of polylines) {
      for (let index = 1; index < points.length; index++) {
        target.lines.push(...points[index - 1]!, ...points[index]!);
      }
    }
    if (target.lines.length > start) {
      target.edgeGroups.push({ start, count: target.lines.length - start, edgeId });
    }
  }
}

/**
 * Join face meshes into one mesh of the body, with the face each triangle came from.
 * @param meshes - One mesh per face, in `faces()` order, sharing the points where faces meet.
 * @returns The joined mesh and each triangle's face id.
 */
function joinFaceMeshes(meshes: readonly FaceMesh[]): { mesh: FaceMesh; owners: Int32Array } {
  let vertexCount = 0;
  let cornerCount = 0;
  for (const { vertices, triangles } of meshes) {
    vertexCount += vertices.length;
    cornerCount += triangles.length;
  }
  const vertices = new Float64Array(vertexCount);
  const triangles = new Uint32Array(cornerCount);
  const owners = new Int32Array(cornerCount / 3);
  let vertexOffset = 0;
  let cornerOffset = 0;
  for (const [faceId, face] of meshes.entries()) {
    vertices.set(face.vertices, vertexOffset);
    for (let corner = 0; corner < face.triangles.length; corner++) {
      triangles[cornerOffset + corner] = face.triangles[corner]! + vertexOffset / 3;
    }
    owners.fill(faceId, cornerOffset / 3, (cornerOffset + face.triangles.length) / 3);
    vertexOffset += face.vertices.length;
    cornerOffset += face.triangles.length;
  }
  return { mesh: { vertices, triangles, normals: null }, owners };
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
  const { library, kernel, tessellation, collectBrepEdges = false, tracer } = options;
  const geometry = emptyGeometry(config);
  const { shape } = config;
  const attributes = {
    shapeName: config.name,
    linearTolerance: tessellation.linearTolerance,
    angularToleranceDeg: tessellation.angularTolerance,
    collectBrepEdges,
  };

  let surface: { mesh: FaceMesh; owners: Int32Array } | undefined;
  withSpan({ tracer, name: 'smlib.tessellate.faces', attributes: { ...attributes, output: 'faces' } }, () => {
    if (shape instanceof library.Mesh) {
      appendFaceMesh(geometry.faces, shape, 0);
      return;
    }
    const { linearTolerance, angularTolerance } = tessellation;
    if (!(shape instanceof library.Face)) {
      // One tessellation of the whole body, cut by face with the kernel's own record of which face
      // each triangle came from: faces meshed alone sample their shared edges differently and crack.
      let faceMeshes: FaceMesh[] | undefined;
      try {
        faceMeshes = library.faceMeshes(shape, linearTolerance, angularTolerance);
      } catch {
        faceMeshes = undefined;
      }
      if (faceMeshes) {
        for (const [faceId, faceMesh] of faceMeshes.entries()) {
          if (faceMesh.triangles.length > 0) {
            appendFaceMesh(geometry.faces, faceMesh, faceId);
          }
        }
        surface = joinFaceMeshes(faceMeshes);
        return;
      }
    }
    // A face, or a body the kernel cannot cut by face: one face group.
    const mesh = library.tessellate(shape, linearTolerance, angularTolerance);
    appendFaceMesh(geometry.faces, mesh, 0);
    surface = { mesh, owners: new Int32Array(mesh.triangles.length / 3) };
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

  if (collectBrepEdges && surface && !(shape instanceof library.Mesh)) {
    const faceMesh = surface;
    withSpan({ tracer, name: 'smlib.tessellate.edges', attributes: { ...attributes, output: 'edges' } }, () => {
      appendEdges(geometry.edges, shape, { ...faceMesh, tessellation, library, kernel });
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
 * samples, not the live curves, are retained, so drawings survive a snapshot. Each edge's curve is
 * read from the kernel once and evaluated in JavaScript ({@link sampleEdge}).
 *
 * @param library - Loaded SMLib module.
 * @param kernel - The raw kernel layer.
 * @param config - A drawing entry (an edge or a wire).
 * @returns The entry with its sampled polylines in place of the shape.
 */
export function sampleDrawing(library: SmlibLibrary, kernel: SmlibKernel, config: NamedInputShape): DrawingEntry {
  const { shape, ...metadata } = config;
  const edges = shape instanceof library.Edge ? [shape] : [...(shape as SmlibModule.Wire).edges()];
  return { ...metadata, polylines: edges.map((edge) => sampleEdge(kernel, edge, drawingTessellation)) };
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
// Tessellation
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
function countMesh(geometries: readonly GeometrySmlib[]): { triangles: number; vertices: number } {
  let triangles = 0;
  let vertices = 0;
  for (const geometry of geometries) {
    triangles += geometry.faces.triangles.length / 3;
    vertices += geometry.faces.vertices.length / 3;
  }
  return { triangles, vertices };
}

/** A rendering at the requested tessellation, with its cost report. */
export type TessellatedRender = {
  geometries: GeometrySmlib[];
  tessellation: TessellationReport;
};

/**
 * Render at the requested tessellation, once. The request resolves to absolute tolerances and
 * the mesh is never coarsened; the report carries its triangles, vertices, elapsed time and the
 * tolerances it was produced at.
 *
 * @param shapes - The shapes to render.
 * @param options - Request and the {@link render} options other than tessellation.
 * @returns Geometries and the tessellation report.
 */
export function renderTessellated(
  shapes: readonly NamedInputShape[],
  options: Omit<RenderOptions, 'tessellation'> & { request: SmlibTessellationRequest },
): TessellatedRender {
  const { request, ...renderOptions } = options;
  const started = performance.now();
  const requested = resolveSmlibTessellation(renderOptions.library, shapes, request);
  const geometries = render(shapes, { ...renderOptions, tessellation: requested });
  return {
    geometries,
    tessellation: {
      ...countMesh(geometries),
      elapsed: performance.now() - started,
      requested: requested.requested,
      linearTolerance: requested.linearTolerance,
      angularTolerance: requested.angularTolerance,
    },
  };
}
