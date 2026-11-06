/* eslint-disable @typescript-eslint/naming-convention -- the kernel layer's functions and options are snake_case, as in Python's `smlibpy._core`. */
import type * as SmlibModule from '@classcad/smlibwasm';

/** A list of numbers as the kernel layer returns it: an array or a Float64Array. */
type NumberList = ArrayLike<number> & Iterable<number>;

/** What `ext.brep_dump(brep, false)` records of a Brep's topology, as far as Tau reads it. */
type BrepDump = {
  /** Vertex positions, `[x, y, z]`, by Brep vertex index. */
  vertices: ReadonlyArray<ArrayLike<number> & Iterable<number>>;
  /** Each edge's start (`v0`) and end (`v1`) vertex, by Brep edge index. */
  edges: ReadonlyArray<{ v0: number; v1: number }>;
};

/** A curve as a NURBS, as `ext.curve_data(curve, true)` gives it. */
export type NurbsCurve = {
  /** `'line'`, `'circle'`, `'ellipse'`, `'bspline'` or another kind; the NURBS is exact unless `approximated`. */
  kind: string;
  /** The parameter range of the edge. */
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- the kernel's field: a parameter range, not a time.
  interval: readonly [number, number];
  /** The polynomial degree of the curve. */
  degree: number;
  /** Control points, `[x, y, z]`. */
  poles: ReadonlyArray<ArrayLike<number>>;
  /** The full knot vector, degree + 1 longer than the poles. */
  knots: ArrayLike<number>;
  /** One weight per pole, or null for a non-rational curve. */
  // oxlint-disable-next-line typescript/no-restricted-types -- `curve_data` gives null for a non-rational curve.
  weights: ArrayLike<number> | null;
};

/**
 * The calls Tau makes into the raw kernel layer of `@classcad/smlibwasm`
 * (`@classcad/smlibwasm/kernel`, Python's `smlibpy._core`): whole-body reads the shape API has no
 * batch form of. That layer is no stable API and is declared `any`, so the calls are typed here and
 * `smlibwasm-raw-api.test.ts` pins each one; it fails when one disappears or changes shape.
 */
export type SmlibKernel = {
  ext: {
    brep_dump: (brep: number, geometry: boolean) => BrepDump;
    edge_indices: (brep: number, edges: readonly number[]) => NumberList;
    seam_edges: (brep: number) => NumberList;
    curve_data: (curve: number, nurbs: boolean) => NurbsCurve;
  };
  k: {
    tessellate_boundaries: (brep: number, options: { angle_tolerance_deg: number }) => [NumberList, NumberList];
  };
};

/**
 * Load the raw kernel layer. The library's own import has already instantiated the module, so this
 * shares its WebAssembly instance.
 * @returns The kernel's `ext` and `k` namespaces.
 */
export async function loadSmlibKernel(): Promise<SmlibKernel> {
  const kernel: unknown = await import('@classcad/smlibwasm/kernel');
  return kernel as SmlibKernel;
}

/** The fields of smlibwasm's shapes that hold their kernel objects (not in its declarations). */
type KernelBody = { _brep: number };
type KernelFace = { _owner: KernelBody };
type KernelEdge = { _e: number; _rev: boolean; _curve: () => number };

/**
 * The kernel Brep a body or face belongs to.
 * @param library - Loaded SMLib module.
 * @param shape - A body (Part, Shell, Sketch) or a face of one.
 * @returns The Brep's kernel address.
 */
export function brepOf(library: typeof SmlibModule, shape: SmlibModule.Shape): number {
  const body =
    shape instanceof library.Face ? (shape as unknown as KernelFace)._owner : (shape as unknown as KernelBody);
  return body._brep;
}

/** The B-rep vertices of a set of edges, and which of them each edge runs between. */
export type EdgeTopology = {
  /** Vertex positions, `[x, y, z]`. */
  vertices: number[][];
  /** For each edge, the index into `vertices` of its start and its end. */
  ends: Array<readonly [number, number]>;
};

/** The edges whose topology is read, and which vertices to list. */
export type EdgeTopologyRequest = {
  /** The Brep the edges belong to. */
  brep: number;
  /** The edges, as the shape API lists them. */
  edges: readonly SmlibModule.Edge[];
  /** `'body'` lists every vertex of the Brep (as `body.vertices()`); `'edges'` only those the edges end at (a face's). */
  scope: 'body' | 'edges';
};

/**
 * Every edge's end vertices and every vertex's position, from one `ext.brep_dump` and one
 * `ext.edge_indices` call per body, in place of `edge.start` and `edge.end` per edge and a
 * `vertex_point` per vertex.
 * @param kernel - The raw kernel layer.
 * @param request - The Brep, its edges and which vertices to list.
 * @returns The vertices and each edge's two ends.
 */
export function edgeTopology(kernel: SmlibKernel, { brep, edges, scope }: EdgeTopologyRequest): EdgeTopology {
  const dump = kernel.ext.brep_dump(brep, false);
  const indices = edgeIndices(kernel, brep, edges);
  const used = new Map<number, number>();
  const take = (vertex: number): number => {
    let local = used.get(vertex);
    if (local === undefined) {
      local = used.size;
      used.set(vertex, local);
    }
    return local;
  };
  if (scope === 'body') {
    for (const vertex of dump.vertices.keys()) {
      take(vertex);
    }
  }
  const ends = indices.map((index): readonly [number, number] => {
    const { v0, v1 } = dump.edges[index]!;
    return [take(v0), take(v1)];
  });
  const vertices = [...used.keys()].map((vertex) => [...dump.vertices[vertex]!]);
  return { vertices, ends };
}

/**
 * Each edge's index in its Brep, the index `ext.brep_dump`, `ext.seam_edges` and
 * `k.tessellate_boundaries` number edges by.
 * @param kernel - The raw kernel layer.
 * @param brep - The Brep the edges belong to.
 * @param edges - Edges of that Brep, as the shape API lists them.
 * @returns One index per edge, in order.
 */
export function edgeIndices(kernel: SmlibKernel, brep: number, edges: readonly SmlibModule.Edge[]): number[] {
  const handles = edges.map((edge) => (edge as unknown as KernelEdge)._e);
  return [...kernel.ext.edge_indices(brep, handles)];
}

/** The kernel's own polylines of a Brep's edges, and which edges are seams. */
export type BoundaryPolylines = {
  /** One polyline per Brep edge, by Brep edge index. */
  polylines: number[][][];
  /** The Brep indices of the seams of periodic faces. */
  seams: Set<number>;
};

/**
 * Polylines of every edge of a Brep from one `k.tessellate_boundaries` call, and its seams from one
 * `ext.seam_edges` call, as the library's own glTF exporter draws edges.
 * @param kernel - The raw kernel layer.
 * @param brep - The Brep whose edges are drawn, seams included.
 * @param angleToleranceDeg - The largest turn of the curve along one segment, in degrees.
 * @returns The polylines and the seams.
 */
export function boundaryPolylines(kernel: SmlibKernel, brep: number, angleToleranceDeg: number): BoundaryPolylines {
  const [flat, counts] = kernel.k.tessellate_boundaries(brep, { angle_tolerance_deg: angleToleranceDeg });
  const seams = new Set(kernel.ext.seam_edges(brep));
  const polylines: number[][][] = [];
  let point = 0;
  for (const count of counts) {
    const polyline: number[][] = [];
    for (let index = point; index < point + count; index++) {
      polyline.push([flat[index * 3]!, flat[index * 3 + 1]!, flat[index * 3 + 2]!]);
    }
    polylines.push(polyline);
    point += count;
  }
  return { polylines, seams };
}

/**
 * An edge's curve as a NURBS over the edge's own parameter range, from one
 * `ext.curve_data(curve, true)` call, and whether the edge runs against the curve's parameter.
 * @param kernel - The raw kernel layer.
 * @param edge - A body's edge, or a standalone one (`Line`, `Spline`, ...).
 * @returns The curve and the edge's direction.
 */
export function edgeNurbs(kernel: SmlibKernel, edge: SmlibModule.Edge): { curve: NurbsCurve; reversed: boolean } {
  const handle = edge as unknown as KernelEdge;
  return { curve: kernel.ext.curve_data(handle._curve(), true), reversed: handle._rev };
}
