// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/**
 * Call-count regression tests for the offline engine's topology queries
 * (cad-performance-policy Rule 3; wasm-kernel-call-batching-policy-blueprint P3).
 *
 * Edge-at-point and adjacency queries run per command, not per render, but they would scale with
 * the shape's edge and face counts if they compared sub-shapes one by one. The tests spy on the
 * libcascade calls the queries make on shapes of growing size and pin counts that stay flat.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { loadLibcascade } from '#offline/offline-libcascade.js';
import type { Oc, TopoDS_Shape } from '#offline/offline-occt.js';
import { compound, edges, pnt } from '#offline/offline-occt.js';
import { closestEdge, facesOfEdge, idForSubShape } from '#offline/offline-topology.js';

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

/**
 * A prism over a regular polygon with `sides` sides: `sides + 2` faces and `3 * sides` edges.
 * @param sides - Number of polygon sides.
 * @returns The prism.
 */
const polygonPrism = (sides: number): TopoDS_Shape => {
  const wire = new oc.BRepBuilderAPI_MakeWire();
  const corner = (index: number) => {
    const angle = (2 * Math.PI * index) / sides;
    return pnt(oc, { x: 10 * Math.cos(angle), y: 10 * Math.sin(angle), z: 0 });
  };
  for (let index = 0; index < sides; index++) {
    wire.Add(new oc.BRepBuilderAPI_MakeEdge(corner(index), corner(index + 1)).Edge());
  }
  const face = new oc.BRepBuilderAPI_MakeFace(wire.Wire(), true).Face();
  return new oc.BRepPrimAPI_MakePrism(face, new oc.gp_Vec(0, 0, 5), false, true).Shape();
};

describe('offline topology call counts', () => {
  it('should make one distance computation for an edge-at-point query, however many edges there are', () => {
    const count = (edgeCount: number): number => {
      const spy: MockInstance = vi.spyOn(oc.BRepExtrema_DistShapeShape.prototype, 'IsDone');
      try {
        expect(closestEdge(oc, lineEdges(edgeCount), { x: 0, y: 0.5, z: 0 })).toBeDefined();
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    // Blueprint A14 (WP9, charter B8): `closestEdge` measures the probe against a compound of the
    // shape's edges with one `BRepExtrema_DistShapeShape` and keeps the first-in-order tie rule.
    expect({ few: count(4), many: count(32) }).toEqual({ few: 1, many: 1 });
  });

  it('should look a sub-shape id up with one hash probe once its table is indexed', () => {
    const count = (edgeCount: number) => {
      const all = edges(oc, lineEdges(edgeCount));
      const table = new Map(all.map((edge, index) => [`edge-${index}`, edge]));
      const map = oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher.prototype;
      const spies: Record<string, MockInstance> = {
        'TopoDS_Shape.IsSame': vi.spyOn(oc.TopoDS_Shape.prototype, 'IsSame'),
        'IndexedMap.Add': vi.spyOn(map, 'Add'),
        'IndexedMap.FindIndex': vi.spyOn(map, 'FindIndex'),
      };
      const read = () => Object.fromEntries(Object.entries(spies).map(([name, spy]) => [name, spy.mock.calls.length]));
      try {
        expect(idForSubShape(oc, table, all.at(-1)!, () => 'unused')).toBe(`edge-${edgeCount - 1}`);
        const first = read();
        vi.clearAllMocks();
        expect(idForSubShape(oc, table, all[0]!, () => 'unused')).toBe('edge-0');
        return { first, again: read() };
      } finally {
        vi.restoreAllMocks();
      }
    };

    // Blueprint A16 (WP9, charter B8): an id lookup compared the shape with every recorded shape
    // until one was the same (`IsSame` 4 and 32). The table's shapes now go in one indexed map, once
    // per table, and a lookup on an unchanged table is one `FindIndex`.
    expect({ few: count(4), many: count(32) }).toEqual({
      few: {
        first: { 'TopoDS_Shape.IsSame': 0, 'IndexedMap.Add': 4, 'IndexedMap.FindIndex': 1 },
        again: { 'TopoDS_Shape.IsSame': 0, 'IndexedMap.Add': 0, 'IndexedMap.FindIndex': 1 },
      },
      many: {
        first: { 'TopoDS_Shape.IsSame': 0, 'IndexedMap.Add': 32, 'IndexedMap.FindIndex': 1 },
        again: { 'TopoDS_Shape.IsSame': 0, 'IndexedMap.Add': 0, 'IndexedMap.FindIndex': 1 },
      },
    });
  });

  it('should find the faces of an edge with one ancestor map', () => {
    const count = (edgeCount: number): number => {
      const shape = polygonPrism(edgeCount);
      const edge = edges(oc, shape).at(-1)!;
      const spy: MockInstance = vi.spyOn(oc.TopoDS_Shape.prototype, 'IsSame');
      const ancestors = vi.spyOn(oc.TopExp, 'MapShapesAndUniqueAncestors');
      try {
        expect(facesOfEdge(oc, shape, edge)).toHaveLength(2);
        return spy.mock.calls.length + ancestors.mock.calls.length;
      } finally {
        vi.restoreAllMocks();
      }
    };

    // Blueprint A15 (WP9, charter B8): one `TopExp.MapShapesAndUniqueAncestors` pass and no `IsSame`
    // scan, where the faces' edge lists were compared pair by pair.
    expect({ few: count(4), many: count(32) }).toEqual({ few: 1, many: 1 });
  });
});
