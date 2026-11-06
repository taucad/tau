// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Call-count regression tests for the offline engine's topology queries
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3).
 *
 * Edge-at-point and adjacency queries run per command, not per render, but they scale with the
 * shape's edge and face counts. The tests spy on the libcascade calls the queries make on shapes
 * of growing size and pin today's counts until the queries are batched.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { loadLibcascade } from '#offline/offline-libcascade.js';
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';
import { compound, edges, pnt } from '#offline/offline-occt.js';
import { closestEdge, idForSubShape } from '#offline/offline-topology.js';

let oc: Oc;

beforeAll(async () => {
  oc = await loadLibcascade();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A compound of `count` parallel unit-length line edges, one millimetre apart.
 * @param count - Number of edges.
 * @returns The compound.
 */
const lineEdges = (count: number): TopoDS_Shape =>
  compound(
    oc,
    Array.from({ length: count }, (_, index) =>
      new oc.BRepBuilderAPI_MakeEdge(pnt(oc, { x: index, y: 0, z: 0 }), pnt(oc, { x: index, y: 1, z: 0 })).Edge(),
    ),
  );

describe('offline topology call counts', () => {
  it('should record one distance computation per edge for an edge-at-point query', () => {
    const count = (edgeCount: number): number => {
      const spy: MockInstance = vi.spyOn(oc.BRepExtrema_DistShapeShape.prototype, 'IsDone');
      try {
        expect(closestEdge(oc, lineEdges(edgeCount), { x: 0, y: 0.5, z: 0 })).toBeDefined();
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    // Blueprint A14 (WP9, charter B8): `closestEdge` builds one `BRepExtrema_DistShapeShape` per
    // edge. B8 measures the probe against the whole shape once and keeps the first-in-order tie rule.
    expect({ few: count(4), many: count(32) }).toEqual({ few: 4, many: 32 });
  });

  it('should record a linear identity scan for a sub-shape id lookup', () => {
    const count = (edgeCount: number): number => {
      const all = edges(oc, lineEdges(edgeCount));
      const table = new Map(all.map((edge, index) => [`edge-${index}`, edge]));
      const spy: MockInstance = vi.spyOn(oc.TopoDS_Shape.prototype, 'IsSame');
      try {
        expect(idForSubShape(table, all.at(-1)!, () => 'unused')).toBe(`edge-${edgeCount - 1}`);
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    // Blueprint A16 (WP9, charter B8): an id lookup compares the shape with every recorded shape
    // until one is the same. B8 looks it up in a `ShapeIndex` instead.
    expect({ few: count(4), many: count(32) }).toEqual({ few: 4, many: 32 });
  });
});
