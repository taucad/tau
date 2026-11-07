// @vitest-environment node
/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Circle), as in build123d. */
/**
 * Contract tests for the raw `@classcad/smlibwasm/kernel` calls Tau makes (charter invariant I5).
 * That layer is no stable API (it follows SmPyLib's bindings), so each call Tau's render, edge and
 * drawing code makes through `utils/smlib-kernel.ts` is pinned here by name and by the shape of its
 * result, together with the shapes' private fields Tau reads to reach the kernel objects. An upgrade
 * that drops or reshapes one fails here, not in a user's render.
 */
import { describe, expect, it } from 'vitest';
import * as smlib from '@classcad/smlibwasm';
import type { Part } from '@classcad/smlibwasm';

import { evaluateNurbs } from '#utils/nurbs.js';
import {
  boundaryPolylines,
  brepOf,
  edgeIndices,
  edgeNurbs,
  edgeTopology,
  loadSmlibKernel,
} from '#utils/smlib-kernel.js';

const kernel = await loadSmlibKernel();

/** A plate with rounded corners and a through hole: lines, arcs, a full circle and a seam. */
const plate = (): Part => {
  const box = smlib.Box(20, 10, 5);
  return box.fillet(box.edges().parallelTo(smlib.Z), 2).cut(smlib.Cylinder(2, 20));
};

const distance = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('raw smlibwasm kernel calls', () => {
  it('should reach the Brep of a body and of a face through their private fields', () => {
    const body = plate();
    const brep = brepOf(smlib, body);
    expect(brep).toBeTypeOf('number');
    expect(brep).toBeGreaterThan(0);
    expect(brepOf(smlib, body.faces()[0]!)).toBe(brep);
  });

  it('should dump every vertex position and every edge end with ext.brep_dump(brep, false)', () => {
    const body = plate();
    const dump = kernel.ext.brep_dump(brepOf(smlib, body), false);
    const vertices = body.vertices();
    const edges = body.edges({ seams: true });
    expect(dump.vertices).toHaveLength(vertices.length);
    for (const [index, vertex] of vertices.entries()) {
      expect([...dump.vertices[index]!]).toEqual([vertex.x, vertex.y, vertex.z]);
    }
    expect(dump.edges).toHaveLength(edges.length);
    for (const [index, edge] of edges.entries()) {
      const { v0, v1 } = dump.edges[index]!;
      expect(distance(dump.vertices[v0]!, edge.start.toArray())).toBeLessThan(1e-9);
      expect(distance(dump.vertices[v1]!, edge.end.toArray())).toBeLessThan(1e-9);
    }
  });

  it('should number edges in their Brep with ext.edge_indices and list seams with ext.seam_edges', () => {
    const body = plate();
    const brep = brepOf(smlib, body);
    const all = body.edges({ seams: true });
    const seams = [...kernel.ext.seam_edges(brep)];
    // The hole's cylinder has one seam; `edges()` leaves it out.
    expect(seams).toHaveLength(1);
    expect(all.length - body.edges().length).toBe(1);
    expect(edgeIndices(kernel, brep, all)).toEqual(all.map((_, index) => index));
    expect(edgeIndices(kernel, brep, body.edges())).toEqual(
      all.map((_, index) => index).filter((index) => !seams.includes(index)),
    );
    // A face's edges are numbered in the body's Brep.
    const faceEdges = body.faces()[0]!.edges();
    const faceIndices = edgeIndices(kernel, brep, faceEdges);
    for (const [index, edge] of faceEdges.entries()) {
      expect(all[faceIndices[index]!]!.equals(edge)).toBe(true);
    }
  });

  it('should give each edge the vertices it ends at, for a body and for a face', () => {
    const body = plate();
    const brep = brepOf(smlib, body);
    const edges = body.edges();
    const topology = edgeTopology(kernel, { brep, edges, scope: 'body' });
    expect(topology.vertices).toHaveLength(body.vertices().length);
    for (const [index, edge] of edges.entries()) {
      const [start, end] = topology.ends[index]!;
      expect(distance(topology.vertices[start]!, edge.start.toArray())).toBeLessThan(1e-9);
      expect(distance(topology.vertices[end]!, edge.end.toArray())).toBeLessThan(1e-9);
    }
    const face = body.faces()[0]!;
    const faceTopology = edgeTopology(kernel, { brep, edges: face.edges(), scope: 'edges' });
    expect(faceTopology.vertices).toHaveLength(face.vertices().length);
  });

  it('should tessellate every edge of a Brep in one k.tessellate_boundaries call', () => {
    const body = plate();
    const brep = brepOf(smlib, body);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the kernel layer's option name, as in Python.
    const [flat, counts] = kernel.k.tessellate_boundaries(brep, { angle_tolerance_deg: 5 });
    expect(flat).toBeInstanceOf(Float64Array);
    const all = body.edges({ seams: true });
    expect(counts).toHaveLength(all.length);
    expect(flat.length).toBe([...counts].reduce((sum, count) => sum + count, 0) * 3);
    const { polylines, seams } = boundaryPolylines(kernel, brep, 5);
    expect([...seams]).toEqual([...kernel.ext.seam_edges(brep)]);
    for (const [index, edge] of all.entries()) {
      const polyline = polylines[index]!;
      expect(polyline.length).toBeGreaterThanOrEqual(2);
      // The polyline runs between the edge's ends and every point lies on the edge.
      const ends = [polyline[0]!, polyline.at(-1)!];
      expect(Math.min(...ends.map((point) => distance(point, edge.start.toArray())))).toBeLessThan(1e-9);
      expect(Math.min(...ends.map((point) => distance(point, edge.end.toArray())))).toBeLessThan(1e-9);
      for (const point of polyline) {
        expect(edge.distanceTo(point)).toBeLessThan(1e-6);
      }
    }
  });

  it('should read an edge curve as a NURBS with ext.curve_data(curve, true) that evaluates onto the edge', () => {
    const body = plate();
    const edges = [
      ...body.edges({ seams: true }),
      ...body.faces().flatMap((face) => face.wires().flatMap((wire) => [...wire.edges()])),
      smlib.Circle(10).edges()[0]!,
      smlib.CenterArc([0, 0, 0], 5, 30, 120),
      smlib.Spline([0, 0, 0], [5, 3, 0], [10, -2, 0], [15, 0, 0]),
      smlib.Line([0, 0, 0], [20, 10, 0]),
    ];
    const kinds = new Set<string>();
    let reversed = 0;
    for (const edge of edges) {
      const nurbs = edgeNurbs(kernel, edge);
      const { curve } = nurbs;
      kinds.add(curve.kind);
      reversed += nurbs.reversed ? 1 : 0;
      expect(curve.interval).toHaveLength(2);
      expect(curve.degree).toBeGreaterThanOrEqual(1);
      expect(curve.knots).toHaveLength(curve.poles.length + curve.degree + 1);
      expect(curve.weights === null || curve.weights.length === curve.poles.length).toBe(true);
      // The interval is the edge's own range: its ends are the edge's ends, in the edge's direction.
      const [t0, t1] = nurbs.reversed ? [curve.interval[1], curve.interval[0]] : curve.interval;
      expect(distance(evaluateNurbs(curve, t0), edge.start.toArray())).toBeLessThan(1e-9);
      expect(distance(evaluateNurbs(curve, t1), edge.end.toArray())).toBeLessThan(1e-9);
      for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        expect(edge.distanceTo(evaluateNurbs(curve, t0 + (t1 - t0) * fraction))).toBeLessThan(1e-9);
      }
    }
    expect([...kinds].sort()).toEqual(['bspline', 'circle', 'line']);
    // Face loops hold edges that run against their curve.
    expect(reversed).toBeGreaterThan(0);
  });
});
