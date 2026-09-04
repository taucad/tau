import { describe, expect, it } from 'vitest';
import { Accessor, Document, NodeIO, Primitive } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';
import { EXTManifold } from 'manifold-3d/manifold-gltf';

import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';
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

const createManifoldGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor('positions')
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  const primitive = document
    .createPrimitive()
    .setMode(Primitive.Mode['TRIANGLES']!)
    .setAttribute('POSITION', positions)
    .setIndices(
      document
        .createAccessor('render indices')
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3])),
    );
  const secondPrimitive = document
    .createPrimitive()
    .setMode(Primitive.Mode['TRIANGLES']!)
    .setAttribute('POSITION', positions)
    .setIndices(
      document
        .createAccessor('second render indices')
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([1, 2, 3, 2, 0, 3])),
    );
  primitive.getIndices()!.setArray(new Uint32Array([0, 2, 1, 0, 1, 3]));
  const mesh = document.createMesh('Tetrahedron').addPrimitive(primitive).addPrimitive(secondPrimitive);
  const manifold = document.createExtension(EXTManifold).createManifoldPrimitive();
  manifold
    .setIndices(
      document
        .createAccessor('manifold indices')
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3])),
    )
    .setRunIndex([0, 6, 12]);
  mesh.setExtension(EXTManifold.EXTENSION_NAME, manifold);
  document.createScene().addChild(document.createNode('Tetrahedron').setMesh(mesh));
  return new NodeIO().registerExtensions([EXTManifold]).writeBinary(document);
};

const readGlbJson = (bytes: Uint8Array<ArrayBuffer>): JSONDocument['json'] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as JSONDocument['json'];
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

  it('should preserve EXT_mesh_manifold while normalizing names', async () => {
    const normalized = await normalizeGltfGeometryNames(await createManifoldGlb(), { format: 'glb' });
    const json = readGlbJson(normalized);

    expect(json.extensionsUsed).toContain('EXT_mesh_manifold');
    expect(json.meshes?.[0]?.extensions?.['EXT_mesh_manifold']).toMatchObject({
      manifoldPrimitive: { mode: Primitive.Mode['TRIANGLES'] },
    });
  });

  it('should preserve EXT_mesh_manifold while transforming an export', async () => {
    const transformed = await transformGltfExportBytes(await createManifoldGlb(), {
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });
    const json = readGlbJson(transformed);

    expect(json.extensionsUsed).toContain('EXT_mesh_manifold');
    expect(json.meshes?.[0]?.extensions?.['EXT_mesh_manifold']).toMatchObject({
      manifoldPrimitive: { mode: Primitive.Mode['TRIANGLES'] },
    });
    const document = await new NodeIO().registerExtensions([EXTManifold]).readBinary(transformed);
    for (const primitive of document.getRoot().listMeshes()[0]!.listPrimitives()) {
      const vertexCount = primitive.getAttribute('POSITION')!.getCount();
      expect([...(primitive.getIndices()!.getArray() ?? [])].every((index) => index < vertexCount)).toBe(true);
    }
  });
});
