import { describe, expect, it } from 'vitest';
import type { JSONDocument } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { normalizeGltfShapeNames } from '#utils/gltf-shape-name-normalizer.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput, GlbPrimitive } from '#utils/glb-writer.js';

const createTrianglePrimitive = (): GlbPrimitive => ({
  mode: 4,
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  material: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 1,
    doubleSided: true,
    alphaMode: 'OPAQUE',
  },
});

const createLinePrimitive = (): GlbPrimitive => ({
  mode: 1,
  positions: new Float32Array([0, 0, 0, 1, 0, 0]),
  indices: new Uint32Array([0, 1]),
  material: {
    baseColorFactor: [0, 0, 0, 1],
    metallicFactor: 0,
    roughnessFactor: 1,
    doubleSided: true,
    alphaMode: 'OPAQUE',
  },
});

const readNodeMeshNames = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[] }> => {
  const document = await new NodeIO().readBinary(bytes);
  return {
    nodeNames: document
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
    meshNames: document
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  };
};

describe('normalizeGltfShapeNames', () => {
  it('should fill blank semantic node and mesh names with canonical shape names', async () => {
    const input: GlbInput = {
      nodes: [{ primitives: [createTrianglePrimitive()] }, { primitives: [createTrianglePrimitive()] }],
    };

    const normalized = await normalizeGltfShapeNames(writeGlb(input), { format: 'glb' });
    const { nodeNames, meshNames } = await readNodeMeshNames(normalized);

    expect(nodeNames).toEqual(['Shape 1', 'Shape 2']);
    expect(meshNames).toEqual(['Shape 1', 'Shape 2']);
  });

  it('should preserve authored node and mesh names', async () => {
    const input: GlbInput = {
      nodes: [{ name: 'Housing', primitives: [createTrianglePrimitive()] }],
    };

    const normalized = await normalizeGltfShapeNames(writeGlb(input), {
      format: 'glb',
      rewriteLegacyGeneratedNames: true,
    });
    const { nodeNames, meshNames } = await readNodeMeshNames(normalized);

    expect(nodeNames).toEqual(['Housing']);
    expect(meshNames).toEqual(['Housing']);
  });

  it('should rewrite legacy generated names when requested', async () => {
    const input: GlbInput = {
      nodes: [
        { name: 'Shape_0', primitives: [createTrianglePrimitive()] },
        { name: 'Geometry', primitives: [createTrianglePrimitive()] },
        { name: 'Mesh', primitives: [createTrianglePrimitive()] },
      ],
    };

    const normalized = await normalizeGltfShapeNames(writeGlb(input), {
      format: 'glb',
      rewriteLegacyGeneratedNames: true,
    });
    const { nodeNames, meshNames } = await readNodeMeshNames(normalized);

    expect(nodeNames).toEqual(['Shape 1', 'Shape 2', 'Shape 3']);
    expect(meshNames).toEqual(['Shape 1', 'Shape 2', 'Shape 3']);
  });

  it('should not rewrite legacy-looking authored names unless requested', async () => {
    const input: GlbInput = {
      nodes: [{ name: 'Shape_0', primitives: [createTrianglePrimitive()] }],
    };

    const normalized = await normalizeGltfShapeNames(writeGlb(input), { format: 'glb' });
    const { nodeNames, meshNames } = await readNodeMeshNames(normalized);

    expect(nodeNames).toEqual(['Shape_0']);
    expect(meshNames).toEqual(['Shape_0']);
  });

  it('should leave line-only helper nodes out of shape ordinal assignment', async () => {
    const input: GlbInput = {
      nodes: [
        { primitives: [createLinePrimitive()] },
        { primitives: [createTrianglePrimitive()] },
        { primitives: [createTrianglePrimitive()] },
      ],
    };

    const normalized = await normalizeGltfShapeNames(writeGlb(input), { format: 'glb' });
    const { nodeNames } = await readNodeMeshNames(normalized);

    expect(nodeNames).toEqual(['', 'Shape 1', 'Shape 2']);
  });

  it('should normalize embedded glTF JSON output', async () => {
    const input: GlbInput = {
      nodes: [{ primitives: [createTrianglePrimitive()] }],
    };

    const normalizedGltf = await normalizeGltfShapeNames(writeGltfJson(input), { format: 'gltf' });
    const json = JSON.parse(new TextDecoder().decode(normalizedGltf)) as JSONDocument['json'];
    const document = await new NodeIO().readJSON({
      json,
      resources: {},
    });

    expect(document.getRoot().listNodes()[0]!.getName()).toBe('Shape 1');
    expect(document.getRoot().listMeshes()[0]!.getName()).toBe('Shape 1');
  });
});
