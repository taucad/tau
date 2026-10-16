import { describe, expect, it } from 'vitest';
import { countGlbMesh, countStlTriangles } from '#opencascade-mesh.js';

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
