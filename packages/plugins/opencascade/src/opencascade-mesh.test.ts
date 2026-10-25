// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Primitive } from '@gltf-transform/core';
import type { Document, Mesh } from '@gltf-transform/core';
import { initOcct } from '@taucad/occt-core';
import { cadEdgeOverlayMaterialDefaults } from '@taucad/runtime/types';
import { glbToDocument } from '@taucad/runtime-testing';
import type { OpenCascadeInstance } from 'libcascade/init';
import { extractShapeEdges } from '#opencascade-edges.js';
import { countGlbMesh, countStlTriangles, finishShapesGlb, writeShapesGlb } from '#opencascade-mesh.js';
import type { ShapeEntry } from '#opencascade.types.js';

/** The glTF position attribute, whose name glTF fixes in upper case. */
const position = 'POSITION';

const encodeGlb = (json: unknown): Uint8Array<ArrayBuffer> => {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(text.byteLength / 4) * 4;
  const glb = new Uint8Array(12 + 8 + padded).fill(0x20);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  glb.set(text, 20);
  return glb;
};

describe('countGlbMesh', () => {
  it('counts indexed, non-indexed and explicit triangle primitives and skips other modes', () => {
    const glb = encodeGlb({
      accessors: [{ count: 8 }, { count: 36 }, { count: 6 }, { count: 4 }],
      meshes: [
        { primitives: [{ attributes: { [position]: 0 }, indices: 1 }] },
        { primitives: [{ attributes: { [position]: 2 }, mode: 4 }] },
        { primitives: [{ attributes: { [position]: 3 }, mode: 1 }] },
        { primitives: [{ attributes: {}, indices: 9 }] },
      ],
    });
    expect(countGlbMesh(glb)).toEqual({ triangles: 12 + 2, vertices: 8 + 6 });
  });

  it('counts nothing in a GLB without meshes or accessors', () => {
    expect(countGlbMesh(encodeGlb({ asset: { version: '2.0' } }))).toEqual({ triangles: 0, vertices: 0 });
    expect(countGlbMesh(encodeGlb({ meshes: [{ primitives: [{ attributes: { [position]: 0 } }] }] }))).toEqual({
      triangles: 0,
      vertices: 0,
    });
  });
});

describe('countStlTriangles', () => {
  it('reads the triangle count of a binary STL from its header', () => {
    const stl = new Uint8Array(84 + 2 * 50);
    new DataView(stl.buffer).setUint32(80, 2, true);
    expect(countStlTriangles(stl)).toBe(2);
  });

  it('counts the facets of an ASCII STL', () => {
    const facet =
      'facet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\n';
    const ascii = `solid shape\n${facet.repeat(3)}endsolid shape\n`;
    expect(countStlTriangles(new TextEncoder().encode(ascii))).toBe(3);
    expect(countStlTriangles(new TextEncoder().encode('solid empty\nendsolid empty\n'))).toBe(0);
    expect(countStlTriangles(new Uint8Array())).toBe(0);
  });
});

describe('finishShapesGlb edge lines', () => {
  let oc: OpenCascadeInstance;
  const owned: Array<{ delete(): void }> = [];
  const own = <T extends { delete(): void }>(value: T): T => {
    owned.push(value);
    return value;
  };
  const mesh = { linearTolerance: 0.05, angularTolerance: (12 * Math.PI) / 180 };

  beforeAll(async () => {
    const bindings = await import('libcascade/single/init');
    oc = await initOcct(new URL(import.meta.resolve('libcascade/wasm')).href, bindings.default);
  });

  afterAll(() => {
    for (const value of owned.reverse()) {
      value.delete();
    }
  });

  /** A plain box, a translated box and a rotated, translated cylinder. */
  const entries = (): ShapeEntry[] => {
    const box = own(own(new oc.BRepPrimAPI_MakeBox(10, 20, 30)).Shape());
    const shift = own(new oc.gp_Trsf());
    shift.SetTranslation(own(new oc.gp_Vec(40, -5, 3)));
    const turn = own(new oc.gp_Trsf());
    turn.SetRotation(own(new oc.gp_Ax1(own(new oc.gp_Pnt(0, 0, 0)), own(new oc.gp_Dir(1, 1, 0)))), 0.7);
    const placed = own(turn.Multiplied(shift));
    const cylinder = own(own(new oc.BRepPrimAPI_MakeCylinder(6, 18)).Shape());
    return [
      { name: 'Box', shape: box },
      { name: 'Moved box', shape: own(box.Moved(own(new oc.TopLoc_Location(shift)), false)) },
      { name: 'Cylinder', shape: own(cylinder.Moved(own(new oc.TopLoc_Location(placed)), false)) },
    ];
  };

  const write = async (
    shapes: ShapeEntry[],
    output: { coordinateSystem?: 'y-up' | 'z-up'; unit?: { length?: 'meter' | 'millimeter' } } = {},
  ): Promise<{ raw: Uint8Array<ArrayBuffer>; finished: Uint8Array<ArrayBuffer> }> => {
    const raw = writeShapesGlb(oc, shapes, { ...mesh, ...output });
    const edges = shapes.map((entry) => extractShapeEdges(oc, entry.shape, mesh));
    return { raw, finished: await finishShapesGlb(raw, shapes, { edges, ...output }) };
  };

  const lineModes = (document: Document): Array<[string, number]> =>
    document
      .getRoot()
      .listMeshes()
      .flatMap((entry) =>
        entry
          .listPrimitives()
          .filter((primitive) => primitive.getMode() === Primitive.Mode['LINES'])
          .map((primitive): [string, number] => [entry.getName(), primitive.getAttribute('POSITION')!.getCount()]),
      );

  const surfacePoints = (entry: Mesh): number[][] =>
    entry
      .listPrimitives()
      .filter((primitive) => primitive.getMode() === Primitive.Mode['TRIANGLES'])
      .flatMap((primitive) => {
        const positions = primitive.getAttribute('POSITION')!;
        return Array.from({ length: positions.getCount() }, (_, index) => positions.getElement(index, []));
      });

  it('should write one LINES primitive per shape mesh in the replicad layout', async () => {
    const { finished } = await write(entries());
    const document = await glbToDocument(finished);
    const nodes = document.getRoot().listNodes();

    expect(lineModes(document).map(([name]) => name)).toEqual(['Box', 'Moved box', 'Cylinder']);
    for (const [nodeIndex, node] of nodes.entries()) {
      const line = node
        .getMesh()!
        .listPrimitives()
        .find((primitive) => primitive.getMode() === Primitive.Mode['LINES'])!;
      const groups = line.getExtras()['edgeGroups'] as Array<{ start: number; count: number; edgeId: number }>;

      expect(line.getIndices()).toBeNull();
      expect(line.getExtras()).toMatchObject({
        tauComponentKind: 'line',
        tauComponentSelector: `node/${String(nodeIndex)}/edges`,
        tauEdgeGroupUnit: 'xyz-scalars-v1',
      });
      expect(groups.map((group) => group.edgeId)).toEqual(groups.map((_, index) => index));
      expect(groups.reduce((total, group) => total + group.count, 0)).toBe(
        line.getAttribute('POSITION')!.getCount() * 3,
      );
      expect(groups).toHaveLength(node.getName() === 'Cylinder' ? 3 : 12);
      const material = line.getMaterial()!;
      expect(material.getExtension('KHR_materials_unlit')).not.toBeNull();
      expect(material.getBaseColorFactor()).toEqual([...cadEdgeOverlayMaterialDefaults.baseColorFactor]);
    }
  });

  it.each([
    ['y-up metres', {}, 1e-3],
    ['z-up millimetres', { coordinateSystem: 'z-up', unit: { length: 'millimeter' } }, 1],
  ] as const)('should put every line vertex on a vertex of its own mesh in %s', async (_label, output, scale) => {
    const { finished } = await write(entries(), output);
    const document = await glbToDocument(finished);

    for (const entry of document.getRoot().listMeshes()) {
      const surface = surfacePoints(entry);
      const line = entry.listPrimitives().find((primitive) => primitive.getMode() === Primitive.Mode['LINES'])!;
      const positions = line.getAttribute('POSITION')!;
      for (let index = 0; index < positions.getCount(); index++) {
        const [x = 0, y = 0, z = 0] = positions.getElement(index, []);
        const nearest = Math.min(...surface.map(([u = 0, v = 0, w = 0]) => Math.hypot(x - u, y - v, z - w)));
        expect(nearest).toBeLessThan(1e-6 * scale);
      }
    }
  });

  it('should leave triangle counts and the GLB without edges unchanged', async () => {
    const shapes = entries();
    const { raw, finished } = await write(shapes);

    expect(countGlbMesh(finished)).toEqual(countGlbMesh(raw));
    expect(Buffer.from(await finishShapesGlb(raw, shapes, {}))).toEqual(
      Buffer.from(await finishShapesGlb(raw, shapes)),
    );
    expect(lineModes(await glbToDocument(await finishShapesGlb(raw, shapes)))).toEqual([]);
  });

  it("should replace the writer's free-edge lines with the edge set", async () => {
    const axis = own(new oc.gp_Ax2());
    const circle = own(own(new oc.BRepBuilderAPI_MakeEdge(own(new oc.gp_Circ(axis, 15)))).Edge());
    const shapes = [{ name: 'Circle', shape: circle }];
    const { raw, finished } = await write(shapes);
    const [written] = lineModes(await glbToDocument(await finishShapesGlb(raw, shapes)));
    const finishedDocument = await glbToDocument(finished);
    const [line] = finishedDocument.getRoot().listMeshes()[0]!.listPrimitives();

    expect(written?.[0]).toBe('Circle');
    expect(lineModes(finishedDocument).map(([name]) => name)).toEqual(['Circle']);
    expect(line!.getExtras()).toMatchObject({ tauComponentKind: 'line', tauComponentSelector: 'node/0/edges' });
  });

  it('should skip an entry the writer drew no mesh for and an entry without edges', async () => {
    const box = own(own(new oc.BRepPrimAPI_MakeBox(10, 10, 10)).Shape());
    const shapes = [
      { name: 'Box', shape: box },
      { name: 'Empty', shape: own(new oc.TopoDS_Shape()) },
      { name: 'Plain', shape: own(own(new oc.BRepPrimAPI_MakeBox(5, 5, 5)).Shape()) },
    ];
    const raw = writeShapesGlb(oc, shapes, mesh);
    const edges = extractShapeEdges(oc, box, mesh);
    const document = await glbToDocument(await finishShapesGlb(raw, shapes, { edges: [edges, edges, undefined] }));
    const names = document
      .getRoot()
      .listNodes()
      .map((node) => node.getName());

    expect(lineModes(document).map(([name]) => name)).toEqual(['Box']);
    expect(names).toEqual(['Box', 'Plain']);
  });
});
