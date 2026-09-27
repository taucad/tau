import { describe, expect, it } from 'vitest';
import { transformNormalArray, transformVertexArray } from '@taucad/geometry-core';
import type { GeometryOutputTransformOptions } from '@taucad/geometry-core';
import { glbToDocument, readGltfNamingSummary } from '@taucad/runtime-testing';

import { picovoxelToGlb } from '#picovoxel.geometry.js';
import type { PicovoxelNativeHandle, PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';

/**
 * The de-indexed render path this module replaced (codex/picovoxel a1a43ec98,
 * `picovoxel.geometry.ts:26-92`), kept verbatim as the byte oracle: per-vertex area-weighted
 * normals, then every triangle corner expanded, then the element-wise transforms.
 */
const legacyExpandedAttributes = (
  shape: PicovoxelShapeSnapshot,
  options: GeometryOutputTransformOptions,
): { positions: Float32Array; normals: Float32Array } => {
  const { vertices, triangles } = shape;
  const normals = new Float32Array(vertices.length);
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3;
    const b = triangles[offset + 1]! * 3;
    const c = triangles[offset + 2]! * 3;
    const abX = vertices[b]! - vertices[a]!;
    const abY = vertices[b + 1]! - vertices[a + 1]!;
    const abZ = vertices[b + 2]! - vertices[a + 2]!;
    const acX = vertices[c]! - vertices[a]!;
    const acY = vertices[c + 1]! - vertices[a + 1]!;
    const acZ = vertices[c + 2]! - vertices[a + 2]!;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    for (const vertexOffset of [a, b, c]) {
      normals[vertexOffset]! += normalX;
      normals[vertexOffset + 1]! += normalY;
      normals[vertexOffset + 2]! += normalZ;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset]!, normals[offset + 1]!, normals[offset + 2]!);
    if (length > 0) {
      normals[offset]! /= length;
      normals[offset + 1]! /= length;
      normals[offset + 2]! /= length;
    }
  }
  const positions = new Float32Array(triangles.length * 3);
  const expandedNormals = new Float32Array(triangles.length * 3);
  for (const [index, triangleIndex] of triangles.entries()) {
    positions.set(vertices.subarray(triangleIndex * 3, triangleIndex * 3 + 3), index * 3);
    expandedNormals.set(normals.subarray(triangleIndex * 3, triangleIndex * 3 + 3), index * 3);
  }
  return {
    positions: transformVertexArray([...positions], options),
    normals: transformNormalArray([...expandedNormals], options),
  };
};

type PrimitiveView = {
  mode: number;
  positions: Float32Array;
  normals: Float32Array | undefined;
  indices: Uint32Array | undefined;
};

const readPrimitives = async (glb: Uint8Array<ArrayBuffer>): Promise<PrimitiveView[]> => {
  const document = await glbToDocument(glb);
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .map((primitive) => ({
      mode: primitive.getMode(),
      positions: primitive.getAttribute('POSITION')!.getArray() as Float32Array,
      normals: primitive.getAttribute('NORMAL')?.getArray() as Float32Array | undefined,
      indices: primitive.getIndices()?.getArray() as Uint32Array | undefined,
    }));
};

const expand = (values: Float32Array, indices: Uint32Array): Float32Array => {
  const expanded = new Float32Array(indices.length * 3);
  for (const [index, vertex] of indices.entries()) {
    expanded.set(values.subarray(vertex * 3, vertex * 3 + 3), index * 3);
  }
  return expanded;
};

const asBytes = (values: Float32Array): Uint8Array<ArrayBuffer> => new Uint8Array(new Float32Array(values).buffer);

/** A welded, jittered sphere-ish mesh: shared vertices, varied triangle areas, all three axes. */
const createWeldedShape = (segments: number, lane: 'exact' | 'fast' = 'exact'): PicovoxelShapeSnapshot => {
  const rings = segments;
  const vertices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const polar = (Math.PI * ring) / rings;
    for (let step = 0; step < segments; step++) {
      const azimuth = (2 * Math.PI * step) / segments;
      const radius = 10 + Math.sin(ring * 1.7 + step * 0.3);
      vertices.push(
        radius * Math.sin(polar) * Math.cos(azimuth) + 3,
        radius * Math.sin(polar) * Math.sin(azimuth) - 2,
        radius * Math.cos(polar) + 0.25,
      );
    }
  }
  const triangles: number[] = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let step = 0; step < segments; step++) {
      const a = ring * segments + step;
      const b = ring * segments + ((step + 1) % segments);
      const c = a + segments;
      const d = b + segments;
      triangles.push(a, c, b, b, c, d);
    }
  }
  return {
    name: 'Shape 1',
    vertices: new Float32Array(vertices),
    triangles: new Uint32Array(triangles),
    lane,
  };
};

describe('picovoxelToGlb', () => {
  const conventions: ReadonlyArray<readonly [string, GeometryOutputTransformOptions]> = [
    ['the default y-up metre convention', {}],
    ['z-up millimetres', { coordinateSystem: 'z-up', unit: { length: 'millimeter' } }],
  ];

  it.each(conventions)(
    'should reproduce the de-indexed path positions and normals byte for byte in %s',
    async (_name, options) => {
      const shape = createWeldedShape(24);
      const [primitive] = await readPrimitives(picovoxelToGlb({ shapes: [shape] }, options));
      const legacy = legacyExpandedAttributes(shape, options);

      expect(primitive!.indices).toBeDefined();
      expect(asBytes(expand(primitive!.positions, primitive!.indices!))).toEqual(asBytes(legacy.positions));
      expect(asBytes(expand(primitive!.normals!, primitive!.indices!))).toEqual(asBytes(legacy.normals));
    },
  );

  it('should write one indexed triangle primitive per shape with welded vertices and no edge lines', async () => {
    const shape = createWeldedShape(16);
    const primitives = await readPrimitives(picovoxelToGlb({ shapes: [shape] }));

    expect(primitives).toHaveLength(1);
    expect(primitives[0]!.mode).toBe(4);
    expect(primitives[0]!.positions).toHaveLength(shape.vertices.length);
    expect(primitives[0]!.normals).toHaveLength(shape.vertices.length);
    expect([...primitives[0]!.indices!]).toEqual([...shape.triangles]);
    // Not the identity permutation a de-indexed soup would carry.
    expect(primitives[0]!.indices!.some((vertex, index) => vertex !== index)).toBe(true);
  });

  it('should name nodes and meshes after their shapes and leave materials unnamed', async () => {
    const handle: PicovoxelNativeHandle = {
      shapes: [createWeldedShape(8), { ...createWeldedShape(8), name: 'Shape 2' }],
    };
    const summary = await readGltfNamingSummary(picovoxelToGlb(handle));

    expect(summary.nodeNames).toEqual(['Shape 1', 'Shape 2']);
    expect(summary.meshNames).toEqual(['Shape 1', 'Shape 2']);
    expect(summary.materialNames).toEqual(['']);
  });

  it('should write the canonical empty scene for an empty handle', async () => {
    const document = await glbToDocument(picovoxelToGlb({ shapes: [] }));

    expect(document.getRoot().listMeshes()).toHaveLength(0);
    expect(document.getRoot().listNodes()).toHaveLength(0);
  });

  it('should leave an isolated vertex with a zero normal', async () => {
    const shape: PicovoxelShapeSnapshot = {
      name: 'Shape 1',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]),
      triangles: new Uint32Array([0, 1, 2]),
      lane: 'exact',
    };
    const [primitive] = await readPrimitives(picovoxelToGlb({ shapes: [shape] }, { coordinateSystem: 'z-up' }));

    expect([...primitive!.normals!.subarray(0, 3)]).toEqual([0, 0, 1]);
    expect([...primitive!.normals!.subarray(9, 12)]).toEqual([0, 0, 0]);
  });

  it('should reject a non-finite vertex at the writer boundary', () => {
    const shape: PicovoxelShapeSnapshot = {
      name: 'Shape 1',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, Number.NaN, 0]),
      triangles: new Uint32Array([0, 1, 2]),
      lane: 'exact',
    };

    expect(() => picovoxelToGlb({ shapes: [shape] })).toThrow('PicoVoxel Shape 1 contains a non-finite vertex.');
  });

  it('should write a one-million-triangle mesh at about 24 bytes per triangle', () => {
    // 708 × 708 segments ≈ 1.0 M triangles; the de-indexed path wrote 84 bytes per triangle.
    const shape = createWeldedShape(708);
    const triangleCount = shape.triangles.length / 3;
    const glb = picovoxelToGlb({ shapes: [shape] });

    expect(triangleCount).toBeGreaterThan(1_000_000);
    expect(glb.byteLength / triangleCount).toBeLessThan(26);
  }, 60_000);
});
