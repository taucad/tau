import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';

import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput, GlbPrimitive } from '#utils/glb-writer.js';

const createTrianglePrimitive = (materialName?: string): GlbPrimitive => ({
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
    ...(materialName ? { name: materialName } : {}),
  },
});

const readNames = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{ nodeNames: string[]; meshNames: string[]; materialNames: string[]; sceneNames: string[] }> => {
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
    materialNames: document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName()),
    sceneNames: document
      .getRoot()
      .listScenes()
      .map((scene) => scene.getName()),
  };
};

const withSceneName = async (bytes: Uint8Array<ArrayBuffer>, sceneName: string): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new NodeIO();
  const document = await io.readBinary(bytes);
  document.getRoot().listScenes()[0]!.setName(sceneName);
  return io.writeBinary(document);
};

describe('normalizeGltfGeometryNames', () => {
  it('should enforce node and mesh parity for semantic mesh-bearing nodes', async () => {
    const input: GlbInput = {
      nodes: [{ name: 'Node Label', primitives: [createTrianglePrimitive()] }],
    };
    const io = new NodeIO();
    const document = await io.readBinary(writeGlb(input));
    document.getRoot().listMeshes()[0]!.setName('Mesh Label');

    const normalized = await normalizeGltfGeometryNames(await io.writeBinary(document), { format: 'glb' });
    const names = await readNames(normalized);

    expect(names.nodeNames).toEqual(['Node Label']);
    expect(names.meshNames).toEqual(['Node Label']);
  });

  it('should clear generated material and scene names while filling blank shape names', async () => {
    const generatedMaterialName = ['Material', 'Default'].join('_');
    const input: GlbInput = {
      nodes: [{ primitives: [createTrianglePrimitive(generatedMaterialName)] }],
    };
    const bytes = await withSceneName(writeGlb(input), 'Scene');

    const normalized = await normalizeGltfGeometryNames(bytes, {
      format: 'glb',
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'external-generated',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'external-generated',
    });
    const names = await readNames(normalized);

    expect(names.nodeNames).toEqual(['Shape 1']);
    expect(names.meshNames).toEqual(['Shape 1']);
    expect(names.materialNames).toEqual(['']);
    expect(names.sceneNames).toEqual(['']);
  });

  it('should preserve authored material and scene names', async () => {
    const input: GlbInput = {
      nodes: [{ name: 'Housing', primitives: [createTrianglePrimitive('powder coat')] }],
    };
    const bytes = await withSceneName(writeGlb(input), 'Exploded View');

    const normalized = await normalizeGltfGeometryNames(bytes, {
      format: 'glb',
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'imported',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'imported',
    });
    const names = await readNames(normalized);

    expect(names.materialNames).toEqual(['powder coat']);
    expect(names.sceneNames).toEqual(['Exploded View']);
  });

  it('should clear all material names when the caller knows they are generated', async () => {
    const input: GlbInput = {
      nodes: [{ name: 'Bracket', primitives: [createTrianglePrimitive('Bracket')] }],
    };

    const normalized = await normalizeGltfGeometryNames(writeGlb(input), {
      format: 'glb',
      materialNamePolicy: 'clear-all',
    });
    const names = await readNames(normalized);

    expect(names.nodeNames).toEqual(['Bracket']);
    expect(names.materialNames).toEqual(['']);
  });

  it('should normalize embedded glTF JSON output', async () => {
    const input: GlbInput = {
      nodes: [{ primitives: [createTrianglePrimitive('default')] }],
    };

    const normalizedGltf = await normalizeGltfGeometryNames(writeGltfJson(input), {
      format: 'gltf',
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'generated',
    });
    const json = JSON.parse(new TextDecoder().decode(normalizedGltf)) as JSONDocument['json'];
    const document = await new NodeIO().readJSON({ json, resources: {} });

    expect(document.getRoot().listNodes()[0]!.getName()).toBe('Shape 1');
    expect(document.getRoot().listMeshes()[0]!.getName()).toBe('Shape 1');
    expect(document.getRoot().listMaterials()[0]!.getName()).toBe('');
  });
});
