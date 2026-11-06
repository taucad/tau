// @vitest-environment node
/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Circle, Spline), as in build123d. */
/**
 * Equality of the batched edge paths with the per-sample paths they replaced (charter invariant I1):
 *
 * - Drawings (blueprint A6, charter B4) read each edge's curve once (`ext.curve_data`) and evaluate
 *   the NURBS in JavaScript. They stay within the 0.01 mm print tolerance of the former sampler,
 *   kept here as {@link pointAtSamples}: the same bisection on `Edge.pointAt`.
 * - Edges the mesh does not bound (A7, B3) take the kernel's polylines from one
 *   `k.tessellate_boundaries` call per body, within the linear tolerance of the curve.
 */
import { describe, expect, it } from 'vitest';
import * as smlib from '@classcad/smlibwasm';
import type { Edge, Part } from '@classcad/smlibwasm';

import { render, sampleDrawing } from '#utils/render-output.js';
import type { NamedInputShape, SmlibLibrary } from '#utils/render-output.js';
import { loadSmlibKernel } from '#utils/smlib-kernel.js';
import type { SmlibKernel } from '#utils/smlib-kernel.js';

const rawKernel = await loadSmlibKernel();

const printTolerance = { linearTolerance: 0.01, angularTolerance: 5 };

/**
 * The drawing sampler before B4: adaptive bisection on the arc-length fraction, one `Edge.pointAt`
 * (six wasm calls) per sample.
 * @param edge - The edge.
 * @returns The polyline's points.
 */
function pointAtSamples(edge: Edge): number[][] {
  const at = (t: number): number[] => edge.pointAt(t).toArray();
  if (edge.geomType === 'line') {
    return [at(0), at(1)];
  }
  const maximumTurn = (printTolerance.angularTolerance * Math.PI) / 180;
  const points: number[][] = [at(0)];
  type Span = { t0: number; p0: number[]; t1: number; p1: number[] };
  const refine = ({ t0, p0, t1, p1 }: Span, depth: number): void => {
    const tm = (t0 + t1) / 2;
    const pm = at(tm);
    const sagitta = distance(pm, [(p0[0]! + p1[0]!) / 2, (p0[1]! + p1[1]!) / 2, (p0[2]! + p1[2]!) / 2]);
    const half = distance(p0, p1) / 2;
    const turn = half > 0 ? 4 * Math.atan2(sagitta, half) : 0;
    if (depth < 10 && (sagitta > printTolerance.linearTolerance || turn > maximumTurn)) {
      refine({ t0, p0, t1: tm, p1: pm }, depth + 1);
      refine({ t0: tm, p0: pm, t1, p1 }, depth + 1);
      return;
    }
    points.push(p1);
  };
  for (let index = 1; index <= 4; index++) {
    refine({ t0: (index - 1) / 4, p0: points.at(-1)!, t1: index / 4, p1: at(index / 4) }, 0);
  }
  return points;
}

const distance = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** The distance from a point to the nearest segment of a polyline. */
function toPolyline(point: number[], polyline: number[][]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index++) {
    const a = polyline[index - 1]!;
    const b = polyline[index]!;
    const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const ap = [point[0]! - a[0]!, point[1]! - a[1]!, point[2]! - a[2]!];
    const length = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = length > 0 ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!));
  }
  return nearest;
}

/** The farthest any sample of one polyline lies from the other, both ways. */
const sampleDistance = (a: number[][], b: number[][]): number =>
  Math.max(...a.map((point) => toPolyline(point, b)), ...b.map((point) => toPolyline(point, a)));

/** The raw kernel layer, counting each call Tau makes through it. */
function countingKernel(): { kernel: SmlibKernel; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const counting = <T extends SmlibKernel['ext'] | SmlibKernel['k']>(target: T, prefix: string): T =>
    new Proxy(target, {
      get(object, name, receiver) {
        const value: unknown = Reflect.get(object, name, receiver);
        if (typeof value !== 'function' || typeof name !== 'string') {
          return value;
        }
        return (...parameters: unknown[]) => {
          calls.set(`${prefix}.${name}`, (calls.get(`${prefix}.${name}`) ?? 0) + 1);
          return (value as (...values: unknown[]) => unknown)(...parameters);
        };
      },
    });
  return { kernel: { ext: counting(rawKernel.ext, 'ext'), k: counting(rawKernel.k, 'k') }, calls };
}

const wheel = (): Part => {
  const outline = Array.from({ length: 72 }, (_, index): [number, number, number] => {
    const angle = (2 * Math.PI * index) / 72;
    const radius = index % 4 < 2 ? 20 : 17;
    return [radius * Math.cos(angle), radius * Math.sin(angle), 0];
  });
  return smlib.fuse(smlib.extrude(smlib.makeFace(smlib.Spline(...outline, outline[0]!)), 6), smlib.Cylinder(6, 14));
};

const plate = (): Part => {
  const box = smlib.Box(80, 60, 10);
  const rounded = box.fillet(box.edges().parallelTo(smlib.Z), 3);
  return rounded.cut(smlib.GridLocations(20, 20, 2, 2).mul(smlib.Cylinder(20 / 6, 20)));
};

const top = (part: Part) => part.faces().sortBy(smlib.Z).at(-1)!;

/** Drawing fixtures: lines, arcs, full circles, splines, glyph outlines and face loops (edges that run against their curve). */
const drawings: Record<string, () => NamedInputShape['shape']> = {
  'circle r = 10': () => smlib.Circle(10).edges()[0]!,
  'circle r = 50': () => smlib.Circle(50).edges()[0]!,
  arc: () => smlib.CenterArc([0, 0, 0], 5, 30, 120),
  spline: () => smlib.Spline([0, 0, 0], [5, 3, 0], [10, -2, 0], [15, 0, 0]),
  polyline: () => smlib.Polyline([0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0], [0, 0, 0]),
  line: () => smlib.Line([0, 0, 0], [20, 10, 0]),
  'plate outline': () => top(plate()).outerWire(),
  'plate hole': () => top(plate()).innerWires()[0]!,
  'wheel outline': () => top(wheel()).outerWire(),
  'glyph outline': () => smlib.Text('8', 10).faces()[0]!.outerWire(),
  'glyph counter': () => smlib.Text('8', 10).faces()[0]!.innerWires()[0]!,
};

describe('drawing samples from one curve read per edge', () => {
  it.each(Object.keys(drawings))('should stay within the print tolerance of the pointAt sampler for %s', (name) => {
    const shape = drawings[name]!();
    const { kernel, calls } = countingKernel();
    const { polylines } = sampleDrawing(smlib, kernel, { shape, name });
    const edges = shape instanceof smlib.Edge ? [shape] : [...(shape as smlib.Wire).edges()];

    expect(polylines).toHaveLength(edges.length);
    for (const [index, edge] of edges.entries()) {
      const before = pointAtSamples(edge);
      const after = polylines[index]!;
      expect(distance(after[0]!, before[0]!)).toBeLessThan(1e-9);
      expect(distance(after.at(-1)!, before.at(-1)!)).toBeLessThan(1e-9);
      expect(sampleDistance(after, before)).toBeLessThanOrEqual(printTolerance.linearTolerance);
    }
    // One kernel call per edge, however many samples the curve takes.
    expect(Object.fromEntries(calls)).toEqual({ 'ext.curve_data': edges.length });
  });
});

describe('edges the mesh does not bound', () => {
  const tessellation = { linearTolerance: 0.2, angularTolerance: 20 };
  /** A library whose bodies cannot be cut by face, so no edge is bounded by the mesh. */
  const uncut: SmlibLibrary = {
    ...smlib,
    faceMeshes: () => {
      throw new Error('no face meshes');
    },
  };

  it.each([
    ['wheel', wheel],
    ['plate', plate],
  ] as const)('should draw the %s edges from one kernel tessellation, within the linear tolerance', (_, make) => {
    const shape = make();
    const edges = shape.edges();
    const { kernel, calls } = countingKernel();
    const [fallback] = render([{ shape, name: 'part' }], {
      library: uncut,
      kernel,
      tessellation,
      collectBrepEdges: true,
    });
    const [meshed] = render([{ shape, name: 'part' }], {
      library: smlib,
      kernel: rawKernel,
      tessellation,
      collectBrepEdges: true,
    });

    const { lines, edgeGroups } = fallback!.edges;
    expect(edgeGroups.map(({ edgeId }) => edgeId)).toEqual(meshed!.edges.edgeGroups.map(({ edgeId }) => edgeId));
    for (const { start, count, edgeId } of edgeGroups) {
      const edge = edges[edgeId]!;
      // Every drawn point lies on its edge, and the line follows the curve within the tolerance.
      for (let index = start; index < start + count; index += 3) {
        expect(edge.distanceTo([lines[index]!, lines[index + 1]!, lines[index + 2]!])).toBeLessThan(1e-6);
      }
      const segments: number[][] = [];
      for (let index = start; index < start + count; index += 6) {
        segments.push([lines[index]!, lines[index + 1]!, lines[index + 2]!]);
      }
      segments.push([lines[start + count - 3]!, lines[start + count - 2]!, lines[start + count - 1]!]);
      const curve = Array.from({ length: 201 }, (__, index) => edge.pointAt(index / 200).toArray());
      expect(Math.max(...curve.map((point) => toPolyline(point, segments)))).toBeLessThanOrEqual(
        tessellation.linearTolerance,
      );
    }
    // Whole-body calls only: the topology for the (empty) mesh match, then one tessellation of every edge.
    expect(Object.fromEntries(calls)).toEqual({
      'ext.brep_dump': 1,
      'ext.edge_indices': 2,
      'k.tessellate_boundaries': 1,
      'ext.seam_edges': 1,
    });
  });

  it('should match mesh chains to edges from one topology read per body', () => {
    const { kernel, calls } = countingKernel();
    render([{ shape: plate(), name: 'plate' }], { library: smlib, kernel, tessellation, collectBrepEdges: true });
    expect(Object.fromEntries(calls)).toEqual({ 'ext.brep_dump': 1, 'ext.edge_indices': 1 });
  });
});
