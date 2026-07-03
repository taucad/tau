import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { IndexedPolyhedron } from '#framework/common.js';
import { createGlb, createGltf } from '#utils/export-glb.js';

// ===================================================================
// Fixtures
// ===================================================================

const triangle: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [1000, 0, 0],
    [0, 0, 1000],
  ],
  faces: [[0, 1, 2]],
  colors: [[1, 0, 0, 1]],
};

const twoColorMesh: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [1000, 0, 0],
    [0, 0, 1000],
    [2000, 0, 0],
    [2000, 0, 1000],
    [1000, 0, 1000],
  ],
  faces: [
    [0, 1, 2],
    [3, 4, 5],
  ],
  colors: [
    [1, 0, 0, 1],
    [0, 0, 1, 0.5],
  ],
};

const quad: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [1000, 0, 0],
    [1000, 0, 1000],
    [0, 0, 1000],
  ],
  faces: [[0, 1, 2, 3]],
  colors: [[0, 1, 0, 1]],
};

const emptyMesh: IndexedPolyhedron = {
  vertices: [],
  faces: [],
  colors: [],
};

const degenerateTriangle: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  faces: [[0, 1, 2]],
  colors: [[1, 1, 1, 1]],
};

const meshWithLines: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [1000, 0, 0],
    [0, 0, 1000],
  ],
  faces: [[0, 1, 2]],
  colors: [[1, 1, 1, 1]],
  lines: {
    positions: [0, 0, 0, 1000, 0, 0, 1000, 0, 0, 0, 0, 1000],
  },
};

const meshWithInvalidFace: IndexedPolyhedron = {
  vertices: [
    [0, 0, 0],
    [1000, 0, 0],
    [0, 0, 1000],
  ],
  faces: [
    [0, 1],
    [0, 1, 2],
  ],
  colors: [
    [1, 0, 0, 1],
    [0, 1, 0, 1],
  ],
};

// ===================================================================
// Tests
// ===================================================================

describe('createGlb', () => {
  it('should produce valid GLB with correct triangle count for a single-triangle mesh', async () => {
    const glb = createGlb(triangle);
    const document = await new NodeIO().readBinary(glb);
    const meshes = document.getRoot().listMeshes();

    expect(meshes).toHaveLength(1);
    expect(document.getRoot().listNodes()[0]!.getName()).toBe('Shape 1');
    expect(meshes[0]!.getName()).toBe('Shape 1');
    expect(
      document
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['']);
    const primitives = meshes[0]!.listPrimitives();
    expect(primitives).toHaveLength(1);

    const indices = primitives[0]!.getIndices()!;
    expect(indices.getCount()).toBe(3);
  });

  it('should group faces by color into separate primitives', async () => {
    const glb = createGlb(twoColorMesh);
    const document = await new NodeIO().readBinary(glb);
    const meshes = document.getRoot().listMeshes();
    const primitives = meshes[0]!.listPrimitives();

    expect(primitives).toHaveLength(2);
  });

  it('should set BLEND alphaMode for transparent colors and OPAQUE for opaque', async () => {
    const glb = createGlb(twoColorMesh);
    const document = await new NodeIO().readBinary(glb);
    const materials = document.getRoot().listMaterials();
    expect(materials.map((material) => material.getName())).toEqual(['', '']);

    const alphaModes = materials.map((m) => m.getAlphaMode());
    expect(alphaModes).toContain('OPAQUE');
    expect(alphaModes).toContain('BLEND');
  });

  it('should fan-triangulate quad faces into two triangles', async () => {
    const glb = createGlb(quad);
    const document = await new NodeIO().readBinary(glb);
    const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();
    const indices = primitives[0]!.getIndices()!;

    expect(indices.getCount()).toBe(6);
  });

  it('should produce valid empty geometry when mesh has no faces', async () => {
    const glb = createGlb(emptyMesh);
    const document = await new NodeIO().readBinary(glb);

    expect(document.getRoot().listMeshes()).toHaveLength(0);
    expect(document.getRoot().listNodes()).toHaveLength(0);
  });

  it('should skip faces with fewer than 3 vertices', async () => {
    const glb = createGlb(meshWithInvalidFace);
    const document = await new NodeIO().readBinary(glb);
    const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();

    let totalIndices = 0;
    for (const primitive of primitives) {
      totalIndices += primitive.getIndices()!.getCount();
    }
    expect(totalIndices).toBe(3);
  });

  it('should transform coordinates from Z-up/mm to Y-up/meters', async () => {
    const unitMesh: IndexedPolyhedron = {
      vertices: [
        [1000, 2000, 3000],
        [0, 0, 0],
        [1000, 0, 0],
      ],
      faces: [[0, 1, 2]],
      colors: [[1, 1, 1, 1]],
    };
    const glb = createGlb(unitMesh);
    const document = await new NodeIO().readBinary(glb);
    const positions = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    const v0 = [
      positions.getElement(0, [0, 0, 0])[0],
      positions.getElement(0, [0, 0, 0])[1],
      positions.getElement(0, [0, 0, 0])[2],
    ];
    expect(v0[0]).toBeCloseTo(1, 4);
    expect(v0[1]).toBeCloseTo(3, 4);
    expect(v0[2]).toBeCloseTo(-2, 4);
  });

  it('should handle degenerate triangles with zero-area normal', async () => {
    const glb = createGlb(degenerateTriangle);
    const document = await new NodeIO().readBinary(glb);
    const primitives = document.getRoot().listMeshes()[0]!.listPrimitives();
    const normals = primitives[0]!.getAttribute('NORMAL')!;
    const normal = normals.getElement(0, [0, 0, 0]);

    expect(normal[0]).toBe(0);
    expect(normal[1]).toBe(0);
    expect(normal[2]).toBe(1);
  });

  it('should include line primitives when meshData.lines is provided', async () => {
    const glb = createGlb(meshWithLines);
    const document = await new NodeIO().readBinary(glb);
    const meshes = document.getRoot().listMeshes();

    expect(
      document
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['Shape 1']);
    expect(meshes).toHaveLength(1);

    const primitives = meshes[0]!.listPrimitives();
    expect(primitives.map((primitive) => primitive.getMode())).toEqual([4, 1]);
    expect(
      document
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['', '']);
    const linePrimitive = primitives[1]!;
    expect(linePrimitive.getMode()).toBe(1);
  });

  it('should return a Uint8Array', async () => {
    const result = createGlb(triangle);
    expect(result).toBeInstanceOf(Uint8Array);
  });
});

describe('createGltf', () => {
  it('should produce JSON glTF with zero meshes when mesh has no faces', () => {
    const gltfBytes = createGltf(emptyMesh);
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as { meshes: unknown[]; nodes: unknown[] };

    expect(json.meshes).toEqual([]);
    expect(json.nodes).toEqual([]);
  });

  it('should produce valid JSON glTF with embedded base64 buffer URIs', async () => {
    const gltfBytes = createGltf(triangle);
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      asset: unknown;
      meshes: unknown[];
      buffers: Array<{ uri: string }>;
    };

    expect(json.asset).toBeDefined();
    expect(json.meshes).toBeDefined();
    expect(json.buffers).toBeDefined();
    expect(json.buffers.length).toBeGreaterThan(0);
    expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/);
  });

  it('should produce geometry matching createGlb output for the same input', async () => {
    const glb = createGlb(triangle);
    const gltfBytes = createGltf(triangle);

    const glbDocument = await new NodeIO().readBinary(glb);
    const gltfJson = JSON.parse(new TextDecoder().decode(gltfBytes)) as { meshes: unknown[] };

    const glbMeshCount = glbDocument.getRoot().listMeshes().length;
    expect(gltfJson.meshes).toHaveLength(glbMeshCount);
  });
});
