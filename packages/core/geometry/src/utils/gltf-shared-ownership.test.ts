import { describe, expect, it } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import type { GLTF } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, KHRMaterialsVolume } from '@gltf-transform/extensions';
import {
  createCoordinateTransform,
  createReverseCoordinateTransform,
  createScalingTransform,
  embedGltfResources,
  normalizeGltfGeometryNames,
  writeGlb,
} from '#index.js';
import type { GlbPrimitive } from '#index.js';

const surface = (): GlbPrimitive => ({
  mode: 4,
  positions: new Float32Array([1, 2, 3, 4, 2, 3, 1, 6, 3]),
  material: {},
});
const decodeJson = (bytes: Uint8Array<ArrayBuffer>): GLTF.IGLTF =>
  JSON.parse(new TextDecoder().decode(bytes)) as GLTF.IGLTF;

const readSerializedJson = async (bytes: Uint8Array<ArrayBuffer>, format: 'glb' | 'gltf'): Promise<GLTF.IGLTF> => {
  if (format === 'glb') {
    const { json } = await new NodeIO().binaryToJSON(bytes);
    return json;
  }
  return decodeJson(bytes);
};

it('should embed exact buffer and image bytes while retaining unresolved and malformed resource records', () => {
  const buffer: Record<string, unknown> = { uri: 'shape.bin' };
  const image: Record<string, unknown> = { uri: 'image.png', mimeType: 'image/png' };
  const fallback: Record<string, unknown> = { uri: 'raw-image' };
  const json = {
    buffers: [buffer, null, 1, {}, { uri: 7 }, { uri: 'absent' }],
    images: [image, fallback, null, false, {}, { uri: 3 }, { uri: 'absent' }],
  };
  const resources = {
    'shape.bin': new Uint8Array([0, 1, 255]),
    'image.png': new Uint8Array([2, 3]).buffer,
    'raw-image': new Uint8Array([4]),
  };
  expect(embedGltfResources(json, resources)).toBe(json);
  expect(buffer['uri']).toBe('data:application/octet-stream;base64,AAH/');
  expect(image['uri']).toBe('data:image/png;base64,AgM=');
  expect(fallback['uri']).toBe('data:application/octet-stream;base64,BA==');
  expect(json.buffers.slice(1)).toEqual([null, 1, {}, { uri: 7 }, { uri: 'absent' }]);
  expect(json.images.slice(2)).toEqual([null, false, {}, { uri: 3 }, { uri: 'absent' }]);
  expect(embedGltfResources({ buffers: null, images: {} }, resources)).toEqual({ buffers: null, images: {} });
  const arrayBuffer = { buffers: [{ uri: 'extra.bin' }] };
  expect(embedGltfResources(arrayBuffer, { 'extra.bin': new Uint8Array([8, 9]).buffer })).toBe(arrayBuffer);
  expect(arrayBuffer.buffers[0]!.uri).toBe('data:application/octet-stream;base64,CAk=');
});

it('should transform one shared primitive and shared morph accessors once while retaining tangent handedness', async () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: 'VEC3' | 'VEC4', values: number[]) =>
    document.createAccessor().setBuffer(buffer).setType(type).setArray(new Float32Array(values));
  const position = accessor('VEC3', [1, 2, 3, 4, 2, 3, 1, 6, 3]);
  const normal = accessor('VEC3', [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const tangent = accessor('VEC4', [1, 0, 0, -1, 0, 0, 0, 1, 0, 1, 0, -1]);
  const morphNormal = accessor('VEC3', [0, 0, 0.5, 0, 0, 0, 0, -2, 0]);
  const morphTangent = accessor('VEC3', [2, 0, 0, 0, 0, 0, 0, -3, 0]);
  const target = document
    .createPrimitiveTarget()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', morphNormal)
    .setAttribute('TANGENT', morphTangent);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TANGENT', tangent)
    .addTarget(target);
  const first = document.createMesh('first').addPrimitive(primitive);
  const second = document.createMesh('second').addPrimitive(primitive);
  const sharedPosition = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TANGENT', tangent)
    .addTarget(target);
  document.createMesh('variant').addPrimitive(sharedPosition);
  const scene = document.createScene();
  scene.addChild(document.createNode('left').setMesh(first).setTranslation([1, 2, 3]).setScale([-2, 3, 4]));
  scene.addChild(document.createNode('right').setMesh(second));
  const extension = document.createExtension(KHRMaterialsVolume);
  const volume = extension.createVolume().setThicknessFactor(0.5).setAttenuationDistance(2);
  document.createMaterial('volume').setExtension(KHRMaterialsVolume.EXTENSION_NAME, volume);
  document.createMaterial('plain');
  await document.transform(createCoordinateTransform(), createScalingTransform());
  expect(position.getArray()).toEqual(new Float32Array([1000, -3000, 2000, 4000, -3000, 2000, 1000, -3000, 6000]));
  expect(normal.getArray()).toEqual(new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0]));
  expect(tangent.getArray()).toEqual(new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, -1]));
  expect(morphNormal.getArray()).toEqual(new Float32Array([0, -0.5, 0, 0, 0, 0, 0, 0, -2]));
  expect(morphTangent.getArray()).toEqual(new Float32Array([2, 0, 0, 0, 0, 0, 0, 0, -3]));
  expect(morphTangent.getType()).toBe('VEC3');
  expect(primitive.getAttribute('POSITION')).toBe(position);
  expect(sharedPosition.getAttribute('POSITION')).toBe(position);
  expect(target.getAttribute('POSITION')).toBe(position);
  expect(volume.getThicknessFactor()).toBe(500);
  expect(volume.getAttenuationDistance()).toBe(2000);
  expect(document.getRoot().listNodes()[0]!.getScale()).toEqual([-2, 4, 3]);
  await document.transform(
    createReverseCoordinateTransform(),
    createCoordinateTransform(false),
    createScalingTransform(false),
    createReverseCoordinateTransform(false),
  );
  expect(position.getArray()).toEqual(new Float32Array([1000, 2000, 3000, 4000, 2000, 3000, 1000, 6000, 3000]));
});

it('should reject GPU instancing transforms before changing geometry or node placement', async () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document
    .createAccessor()
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(new Float32Array([1, 2, 3]));
  const primitive = document.createPrimitive().setMode(0).setAttribute('POSITION', position);
  const node = document
    .createNode('instance')
    .setMesh(document.createMesh().addPrimitive(primitive))
    .setTranslation([4, 5, 6]);
  node.setExtension(
    EXTMeshGPUInstancing.EXTENSION_NAME,
    document.createExtension(EXTMeshGPUInstancing).createInstancedMesh(),
  );
  document.createScene().addChild(node);
  await expect(document.transform(createScalingTransform())).rejects.toThrow(Error);
  await expect(document.transform(createScalingTransform())).rejects.toThrow(/use core shared mesh nodes/);
  expect(position.getArray()).toEqual(new Float32Array([1, 2, 3]));
  expect(node.getTranslation()).toEqual([4, 5, 6]);
});

describe.each(['glb', 'gltf'] as const)('%s occurrence names', (format) => {
  it('should preserve authored shared asset names and use first occurrence as unnamed asset fallback', async () => {
    const primitives = [surface()];
    const input = {
      nodes: [
        { name: 'left bolt', primitives },
        { name: 'right bolt', primitives },
      ],
    };
    const io = new NodeIO();
    const document = await io.readBinary(writeGlb(input));
    document.getRoot().listMeshes()[0]!.setName('bolt asset');
    const output = await io.writeJSON(document);
    const bytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(JSON.stringify(embedGltfResources({ ...output.json }, output.resources)));
    const normalized = await normalizeGltfGeometryNames(bytes, { format });
    const restored =
      format === 'glb'
        ? await io.readBinary(normalized)
        : await io.readJSON({ json: decodeJson(normalized), resources: {} });
    expect(
      restored
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['left bolt', 'right bolt']);
    expect(
      restored
        .getRoot()
        .listMeshes()
        .map((mesh) => mesh.getName()),
    ).toEqual(['bolt asset']);
    expect(restored.getRoot().listNodes()[0]!.getMesh()).toBe(restored.getRoot().listNodes()[1]!.getMesh());
    document.getRoot().listMeshes()[0]!.setName('');
    const unnamedJson = await io.writeJSON(document);
    const unnamedBytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(JSON.stringify(embedGltfResources({ ...unnamedJson.json }, unnamedJson.resources)));
    const result = await normalizeGltfGeometryNames(unnamedBytes, { format, io });
    const json = await readSerializedJson(result, format);
    expect(json).toMatchObject({
      meshes: [{ name: 'left bolt' }],
      nodes: [{ name: 'left bolt' }, { name: 'right bolt' }],
    });
  });

  it('should normalize missing and legacy generated names and material/scene policies', async () => {
    const primitive = surface();
    primitive.material = { name: 'Material_0' };
    const input = {
      nodes: [
        { primitives: [primitive] },
        { name: 'Shape 2', primitives: [surface()] },
        { name: 'Shape_3', primitives: [surface()] },
      ],
    };
    const io = new NodeIO();
    const document = await io.readBinary(writeGlb(input));
    document.getRoot().listScenes()[0]!.setName('Scene');
    const json = await io.writeJSON(document);
    const bytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(JSON.stringify(embedGltfResources({ ...json.json }, json.resources)));
    const normalized = await normalizeGltfGeometryNames(bytes, {
      format,
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-all',
      sceneNamePolicy: 'clear-all',
    });
    const result =
      format === 'glb'
        ? await io.readBinary(normalized)
        : await io.readJSON({ json: decodeJson(normalized), resources: {} });
    expect(
      result
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['', '']);
    expect(
      result
        .getRoot()
        .listScenes()
        .map((scene) => scene.getName()),
    ).toEqual(['']);
    expect(
      result
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['Shape 1', 'Shape 2', 'Shape 3']);
    const generated = await normalizeGltfGeometryNames(bytes, {
      format,
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      sceneNamePolicy: 'clear-generated',
      materialNameSource: 'generated',
      sceneNameSource: 'generated',
    });
    const names =
      format === 'glb'
        ? await io.readBinary(generated)
        : await io.readJSON({ json: decodeJson(generated), resources: {} });
    expect(
      names
        .getRoot()
        .listMaterials()
        .map((material) => material.getName()),
    ).toEqual(['', '']);
    expect(
      names
        .getRoot()
        .listScenes()
        .map((scene) => scene.getName()),
    ).toEqual(['']);
  });
});

const packJsonGlb = (json: Record<string, unknown>, remainder = new Uint8Array()): Uint8Array<ArrayBuffer> => {
  const payload = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(payload.length / 4) * 4;
  const bytes = new Uint8Array(20 + paddedLength + remainder.length);
  bytes.fill(0x20, 20, 20 + paddedLength);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, paddedLength, true);
  header.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(payload, 20);
  bytes.set(remainder, 20 + paddedLength);
  return bytes;
};

it.each(['short', 'magic', 'version', 'length', 'chunk-type', 'truncated-json'] as const)(
  'should diagnose %s binary headers before rewriting names',
  async (malformed) => {
    let bytes = packJsonGlb({ asset: { version: '2.0' } });
    const header = new DataView(bytes.buffer);
    if (malformed === 'short') {
      bytes = bytes.slice(0, 19);
    }
    if (malformed === 'magic') {
      header.setUint32(0, 0, true);
    }
    if (malformed === 'version') {
      header.setUint32(4, 1, true);
    }
    if (malformed === 'length') {
      header.setUint32(8, bytes.length - 4, true);
    }
    if (malformed === 'chunk-type') {
      header.setUint32(16, 0, true);
    }
    if (malformed === 'truncated-json') {
      header.setUint32(12, bytes.length, true);
    }
    const original = new Uint8Array(bytes);
    await expect(normalizeGltfGeometryNames(bytes, { format: 'glb' })).rejects.toThrow(Error);
    await expect(normalizeGltfGeometryNames(bytes, { format: 'glb' })).rejects.toThrow('Invalid glTF 2.0 binary');
    expect(bytes).toEqual(original);
  },
);

it('should preserve valid minimal GLB and nodes without geometry', async () => {
  const io = new NodeIO();
  const minimal = await normalizeGltfGeometryNames(packJsonGlb({ asset: { version: '2.0' } }), { format: 'glb' });
  const minimalJson = await io.binaryToJSON(minimal);
  expect(minimalJson.json).toEqual({ asset: { version: '2.0' } });
  const group = { asset: { version: '2.0' }, nodes: [{ name: 'assembly group' }] };
  const result = await normalizeGltfGeometryNames(packJsonGlb(group), { format: 'glb' });
  const groupJson = await io.binaryToJSON(result);
  expect(groupJson.json).toEqual(group);
});

it.each(['glb', 'gltf'] as const)(
  'should preserve %s line-only groups without assigning surface ordinals',
  async (format) => {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
      .createAccessor()
      .setBuffer(buffer)
      .setType('VEC3')
      .setArray(new Float32Array([1, 2, 3, 4, 5, 6]));
    const primitive = document.createPrimitive().setMode(1).setAttribute('POSITION', position);
    const mesh = document.createMesh('edge asset').addPrimitive(primitive);
    const parent = document.createNode('assembly group').addChild(document.createNode('edge occurrence').setMesh(mesh));
    document.createScene().addChild(parent);
    const io = new NodeIO();
    const json = await io.writeJSON(document);
    const bytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(JSON.stringify(embedGltfResources({ ...json.json }, json.resources)));
    const result = await normalizeGltfGeometryNames(bytes, { format });
    const restored =
      format === 'glb' ? await io.readBinary(result) : await io.readJSON({ json: decodeJson(result), resources: {} });
    expect(
      restored
        .getRoot()
        .listNodes()
        .map((node) => node.getName()),
    ).toEqual(['assembly group', 'edge occurrence']);
    expect(restored.getRoot().listMeshes()[0]!.getName()).toBe('edge asset');
    expect(restored.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getMode()).toBe(1);
  },
);

it('should recognize a default triangle mode and preserve authored clear-generated labels', async () => {
  const primitive = surface();
  primitive.material = { name: 'semantic steel' };
  const bytes = writeGlb({ nodes: [{ primitives: [primitive] }] });
  const io = new NodeIO();
  const { json } = await io.binaryToJSON(bytes);
  Reflect.deleteProperty(json.meshes![0]!.primitives[0]!, 'mode');
  json.scenes![0]!.name = 'authored assembly';
  const view = new DataView(bytes.buffer);
  const remainder = bytes.slice(20 + view.getUint32(12, true));
  const updated = packJsonGlb({ ...json }, remainder);
  const normalized = await normalizeGltfGeometryNames(updated, {
    format: 'glb',
    materialNamePolicy: 'clear-generated',
    sceneNamePolicy: 'clear-generated',
  });
  const result = await io.readBinary(normalized);
  expect(result.getRoot().listNodes()[0]!.getName()).toBe('Shape 1');
  expect(result.getRoot().listMaterials()[0]!.getName()).toBe('semantic steel');
  expect(result.getRoot().listScenes()[0]!.getName()).toBe('authored assembly');
  expect(result.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getMode()).toBe(4);
});
