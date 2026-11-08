// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Handle-leak regression tests for the offline engine's topology queries (cad-performance-policy Rule 3,
 * wasm-kernel-call-batching-policy-blueprint B10 leak checklist).
 *
 * Every libcascade wrapper a query creates holds a TShape handle until it is deleted. The tests record each
 * sub-shape wrapper the queries create and assert that every one the caller does not receive has been freed,
 * on the success path and when a constructor throws.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadLibcascade } from '#offline/offline-libcascade.js';
import type { Oc, TopoDS_Edge, TopoDS_Face, TopoDS_Shape } from '#offline/offline-occt.js';
import { edges, faces, pnt, vertices } from '#offline/offline-occt.js';
import { vec3 } from '#offline/offline-math.js';
import { adjacentEdge, closestEdge, edgesBetween, oppositeEdge } from '#offline/offline-topology.js';

type Handle = { isDeleted(): boolean };

let oc: Oc;

beforeAll(async () => {
  oc = await loadLibcascade();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Records every wrapper returned by the sub-shape producers the topology queries use.
 * @returns The live wrappers the caller was not handed.
 */
const trackSubShapes = (): { leaked: (kept: readonly unknown[]) => number } => {
  const created: Handle[] = [];
  type Producers = Record<string, (...args: unknown[]) => Handle>;
  const record = (owner: unknown, method: string): void => {
    const producers = owner as Producers;
    const original = producers[method]!;
    vi.spyOn(producers, method).mockImplementation(function (this: unknown, ...args: unknown[]) {
      const result = original.apply(this, args);
      created.push(result);
      return result;
    });
  };
  record(oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.prototype, 'FindKey');
  record(oc.TopoDS, 'Edge');
  record(oc.TopoDS, 'Face');
  record(oc.TopoDS, 'Vertex');
  record(oc.TopExp, 'FirstVertex');
  record(oc.TopExp, 'LastVertex');
  return {
    leaked: (kept) => created.filter((handle) => !kept.includes(handle) && !handle.isDeleted()).length,
  };
};

/**
 * A box: a square extruded 5 mm (6 faces, 12 edges, 8 vertices).
 * @returns The box.
 */
const box = (): TopoDS_Shape => {
  const wire = new oc.BRepBuilderAPI_MakeWire();
  const corners = [pnt(oc, vec3(0, 0, 0)), pnt(oc, vec3(10, 0, 0)), pnt(oc, vec3(10, 10, 0)), pnt(oc, vec3(0, 10, 0))];
  for (const [index, corner] of corners.entries()) {
    wire.Add(new oc.BRepBuilderAPI_MakeEdge(corner, corners[(index + 1) % corners.length]!).Edge());
  }
  const face = new oc.BRepBuilderAPI_MakeFace(wire.Wire(), true).Face();
  return new oc.BRepPrimAPI_MakePrism(face, new oc.gp_Vec(0, 0, 5), false, true).Shape();
};

/** The box's faces and an edge of its first face, created before tracking starts. */
const boxParts = (): { shape: TopoDS_Shape; face: TopoDS_Face; edge: TopoDS_Edge; all: TopoDS_Face[] } => {
  const shape = box();
  const all = faces(oc, shape);
  const face = all[0]!;
  const edge = edges(oc, face)[0]!;
  return { shape, face, edge, all };
};

describe('offline topology handle leaks', () => {
  it('should free the raw sub-shape wrapper behind every typed face, edge and vertex', () => {
    const shape = box();
    const tracker = trackSubShapes();
    const kept = [...faces(oc, shape), ...edges(oc, shape), ...vertices(oc, shape)];

    expect(kept).toHaveLength(6 + 12 + 8);
    expect(tracker.leaked(kept)).toBe(0);
  });

  it('should free every edge and vertex an opposite-edge query does not return', () => {
    const { face, edge } = boxParts();
    const tracker = trackSubShapes();
    const found = oppositeEdge(oc, face, edge);

    expect(found.IsSame(edge)).toBe(false);
    expect(tracker.leaked([found])).toBe(0);
  });

  it('should free every edge and vertex an adjacent-edge query does not return', () => {
    const { face, edge } = boxParts();
    const tracker = trackSubShapes();
    const next = adjacentEdge(oc, face, edge, 'next');
    const previous = adjacentEdge(oc, face, edge, 'previous');

    expect(next).toBeDefined();
    expect(previous).toBeDefined();
    expect(tracker.leaked([next, previous])).toBe(0);
  });

  it('should free every edge and vertex an edges-between query does not return', () => {
    const { all } = boxParts();
    // Two adjacent box faces share one edge; a third face meets it at one end.
    const [first, ...rest] = all;
    const side = rest.find((candidate) => edgesBetween(oc, [first!, candidate], []).length > 0)!;
    const end = rest.find(
      (candidate) => candidate !== side && edgesBetween(oc, [first!, side], [candidate]).length > 0,
    )!;
    const tracker = trackSubShapes();
    const shared = edgesBetween(oc, [first!, side], []);
    const bounded = edgesBetween(oc, [first!, side], [end]);

    expect(shared).toHaveLength(1);
    expect(bounded).toHaveLength(1);
    expect(tracker.leaked([...shared, ...bounded])).toBe(0);
  });

  it('should free its probe and edge compound when the distance computation cannot be built', () => {
    const shape = box();
    const created: Handle[] = [];
    const vertexBuilder = oc.BRepBuilderAPI_MakeVertex.prototype;
    const original = vertexBuilder.Vertex;
    vi.spyOn(vertexBuilder, 'Vertex').mockImplementation(function (this: typeof vertexBuilder) {
      const vertex = original.call(this);
      created.push(vertex as unknown as Handle, this as unknown as Handle);
      return vertex;
    });
    vi.spyOn(oc as unknown as Record<string, () => unknown>, 'BRepExtrema_DistShapeShape').mockImplementation(() => {
      throw new Error('extrema failed');
    });

    expect(() => closestEdge(oc, shape, { x: 0, y: 0, z: 0 })).toThrow('extrema failed');
    expect(created).toHaveLength(2);
    expect(created.filter((handle) => !handle.isDeleted())).toHaveLength(0);
  });
});
