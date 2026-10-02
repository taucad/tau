import { EXTManifold } from 'manifold-3d/manifold-gltf';
import { EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import { Document, NodeIO } from '@gltf-transform/core';
import type { JSONDocument } from '@gltf-transform/core';
import { it, expect } from 'vitest';
import {
  embedGltfResources,
  normalizeGltfGeometryNames,
  createCoordinateTransform,
  createReverseCoordinateTransform,
  createScalingTransform,
} from '@taucad/geometry-core';
import { gltfEdgeDetection } from '#gltf-edge-detection.middleware.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockRuntime } from '@taucad/runtime-testing';
import type { KernelExportResult, ExportFile } from '@taucad/runtime/types';

const fixture = () => {
  const document = new Document();
  const buffer = document.createBuffer('shared.bin');
  const position = document
    .createAccessor()
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(new Float32Array([1, 2, 3, 4, 2, 3, 1, 6, 3]));
  const normal = document
    .createAccessor()
    .setBuffer(buffer)
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2]));
  const material = document
    .createMaterial('authored red')
    .setBaseColorFactor([1, 0, 0, 1])
    .setExtras({ role: 'surface' });
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(indices)
    .setMaterial(material)
    .setExtras({ faceGroups: [{ name: 'face' }] });
  const mesh = document.createMesh('bolt asset').addPrimitive(primitive).setExtras({ assetId: 'bolt' });
  const parent = document.createNode('assembly').setTranslation([5, 7, 11]);
  parent.addChild(
    document.createNode('left bolt').setMesh(mesh).setTranslation([13, 17, 19]).setExtras({ componentId: 'left' }),
  );
  parent.addChild(
    document.createNode('right bolt').setMesh(mesh).setTranslation([-23, 29, 31]).setExtras({ componentId: 'right' }),
  );
  document.createScene('authored assembly').addChild(parent);
  return { document, mesh, position, normal, indices, primitive, parent };
};

for (const format of ['glb', 'gltf'] as const) {
  it(`preserves authored occurrence and shared asset names in ${format}`, async () => {
    const { document } = fixture();
    const io = new NodeIO();
    const output = await io.writeJSON(document);
    const bytes =
      format === 'glb'
        ? await io.writeBinary(document)
        : new TextEncoder().encode(
            JSON.stringify(embedGltfResources(output.json as unknown as Record<string, unknown>, output.resources)),
          );
    const result = await normalizeGltfGeometryNames(bytes, { format });
    const restored =
      format === 'glb'
        ? await io.readBinary(result)
        : await io.readJSON({
            json: JSON.parse(new TextDecoder().decode(result)) as JSONDocument['json'],
            resources: {},
          });
    const root = restored.getRoot();
    expect(root.listNodes().map((node) => node.getName())).toEqual(['assembly', 'left bolt', 'right bolt']);
    expect(root.listMeshes().map((mesh) => mesh.getName())).toEqual(['bolt asset']);
    expect(root.listNodes()[1]!.getMesh()).toBe(root.listNodes()[2]!.getMesh());
    expect(root.listNodes()[2]!.getTranslation()).toEqual([-23, 29, 31]);
    expect(root.listNodes()[1]!.getExtras()).toEqual({ componentId: 'left' });
    expect(root.listMaterials()[0]!.getName()).toBe('authored red');
  });
}

it('uses the first occurrence as unnamed shared asset fallback and keeps unique legacy parity', async () => {
  const { document, mesh } = fixture();
  mesh.setName('');
  const unique = document.createMesh('old asset').addPrimitive(mesh.listPrimitives()[0]!.clone());
  document.getRoot().listScenes()[0]!.addChild(document.createNode('unique part').setMesh(unique));
  const io = new NodeIO();
  const result = await io.readBinary(
    await normalizeGltfGeometryNames(await io.writeBinary(document), { format: 'glb' }),
  );
  expect(
    result
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.getName()),
  ).toEqual(['left bolt', 'unique part']);
  expect(
    result
      .getRoot()
      .listNodes()
      .map((node) => node.getName()),
  ).toEqual(['assembly', 'left bolt', 'right bolt', 'unique part']);
});

it('transforms shared accessors once across material variants and preserves hierarchy', async () => {
  const { document, mesh, position, normal, indices, primitive, parent } = fixture();
  const variant = document
    .createMesh('blue bolt asset')
    .addPrimitive(primitive.clone().setMaterial(document.createMaterial('blue').setBaseColorFactor([0, 0, 1, 1])));
  document.getRoot().listScenes()[0]!.addChild(document.createNode('blue bolt').setMesh(variant));
  await document.transform(createCoordinateTransform(), createScalingTransform());
  expect([...position.getArray()!]).toEqual([1000, -3000, 2000, 4000, -3000, 2000, 1000, -3000, 6000]);
  for (const [index, value] of parent.getTranslation().entries()) {
    expect(value).toBeCloseTo([5e3, -11e3, 7e3][index]!, 9);
  }
  expect(mesh.listPrimitives()[0]!.getAttribute('POSITION')).toBe(position);
  expect(variant.listPrimitives()[0]!.getAttribute('POSITION')).toBe(position);
  expect(variant.listPrimitives()[0]!.getIndices()).toBe(indices);
  expect([...normal.getArray()!]).toEqual([0, -1, 0, 0, -1, 0, 0, -1, 0]);
  await document.transform(createReverseCoordinateTransform());
  expect([...position.getArray()!]).toEqual([1000, 2000, 3000, 4000, 2000, 3000, 1000, 6000, 3000]);
});

it('generates JSON glTF edges with external buffers and keeps JSON output and ownership', async () => {
  const { document } = fixture();
  const io = new NodeIO();
  const output = await io.writeJSON(document);
  const input = {
    success: true,
    issues: [],
    data: [
      {
        name: 'assembly.gltf',
        mimeType: 'model/gltf+json',
        bytes: new TextEncoder().encode(JSON.stringify(output.json)),
      },
      ...Object.entries(output.resources).map(
        ([name, bytes]): ExportFile => ({ name, mimeType: 'application/octet-stream', bytes }),
      ),
    ],
  } satisfies KernelExportResult;
  const definition = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  const result = await definition.wrapExport!(
    { exportId: 'gltf', extension: 'gltf', mimeType: 'model/gltf+json', options: {}, content: { includeEdges: true } },
    async () => input,
    createMockRuntime<Record<string, never>, { thresholdDegrees: number }>({ options: { thresholdDegrees: 30 } }),
  );
  expect(result.success).toBe(true);
  if (!result.success) {
    return;
  }
  const json = JSON.parse(new TextDecoder().decode(result.data[0].bytes)) as JSONDocument['json'];
  const restored = await io.readJSON({
    json,
    resources: Object.fromEntries(result.data.slice(1).map((file) => [file.name, file.bytes])),
  });
  const root = restored.getRoot();
  expect(root.listMeshes()).toHaveLength(1);
  expect(
    root
      .listMeshes()[0]!
      .listPrimitives()
      .map((primitive) => primitive.getMode()),
  ).toEqual([4, 1]);
  expect(root.listNodes()[1]!.getMesh()).toBe(root.listNodes()[2]!.getMesh());
  expect(root.listNodes()[1]!.getTranslation()).toEqual([13, 17, 19]);
  expect(root.listMeshes()[0]!.listPrimitives()[0]!.getExtras()).toEqual({ faceGroups: [{ name: 'face' }] });
  expect(root.listMaterials()[0]!.getExtras()).toEqual({ role: 'surface' });
});

it('embeds rewritten texture bytes and authored metadata through JSON naming and edges', async () => {
  const { document } = fixture();
  const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 11, 12, 13]);
  const texture = document
    .createTexture('authored texture')
    .setMimeType('image/png')
    .setImage(image)
    .setExtras({ source: 'authored' });
  document.getRoot().listMaterials()[0]!.setBaseColorTexture(texture);
  const io = new NodeIO();
  const output = await io.writeJSON(document);
  const bytes = new TextEncoder().encode(
    JSON.stringify(embedGltfResources(output.json as unknown as Record<string, unknown>, output.resources)),
  );
  const normalized = await normalizeGltfGeometryNames(bytes, { format: 'gltf' });
  const input = {
    success: true,
    issues: [],
    data: [{ name: 'textured.gltf', mimeType: 'model/gltf+json', bytes: normalized }],
  } satisfies KernelExportResult;
  const definition = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  const result = await definition.wrapExport!(
    { exportId: 'gltf', extension: 'gltf', mimeType: 'model/gltf+json', options: {}, content: { includeEdges: true } },
    async () => input,
    createMockRuntime<Record<string, never>, { thresholdDegrees: number }>({ options: { thresholdDegrees: 30 } }),
  );
  expect(result.success).toBe(true);
  if (!result.success) {
    return;
  }
  const json = JSON.parse(new TextDecoder().decode(result.data[0].bytes)) as JSONDocument['json'];
  expect(json.images![0]!.uri).toMatch(/^data:image\/png;base64,/);
  const restored = await io.readJSON({ json, resources: {} });
  expect([...restored.getRoot().listTextures()[0]!.getImage()!]).toEqual([...image]);
  expect(restored.getRoot().listTextures()[0]!.getName()).toBe('authored texture');
  expect(restored.getRoot().listTextures()[0]!.getExtras()).toEqual({ source: 'authored' });
  expect(
    restored
      .getRoot()
      .listMeshes()[0]!
      .listPrimitives()
      .map((primitive) => primitive.getMode()),
  ).toEqual([4, 1]);
});

it('rotates shared tangent directions once without changing handedness', async () => {
  const { document, primitive } = fixture();
  const tangent = document
    .createAccessor()
    .setBuffer(document.getRoot().listBuffers()[0]!)
    .setType('VEC4')
    .setArray(new Float32Array([0, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1]));
  primitive.setAttribute('TANGENT', tangent);
  document.createMesh('variant').addPrimitive(primitive.clone());
  await document.transform(createCoordinateTransform());
  expect([...tangent.getArray()!]).toEqual([0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1, -1]);
  expect(primitive.getAttribute('TANGENT')).toBe(tangent);
});

it('retains one manifold surface and shared owner-local edges for both placements', async () => {
  const { document, mesh, indices } = fixture();
  const extension = document.createExtension(EXTManifold);
  mesh.setExtension(
    EXTManifold.EXTENSION_NAME,
    extension.createManifoldPrimitive().setIndices(indices).setRunIndex([0, 3]),
  );
  const io = new NodeIO().registerExtensions([EXTManifold]);
  const output = await io.writeJSON(document);
  const input = {
    success: true,
    issues: [],
    data: [
      {
        name: 'manifold.gltf',
        mimeType: 'model/gltf+json',
        bytes: new TextEncoder().encode(JSON.stringify(output.json)),
      },
      ...Object.entries(output.resources).map(
        ([name, bytes]): ExportFile => ({ name, mimeType: 'application/octet-stream', bytes }),
      ),
    ],
  } satisfies KernelExportResult;
  const definition = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  const result = await definition.wrapExport!(
    { exportId: 'gltf', extension: 'gltf', mimeType: 'model/gltf+json', options: {}, content: { includeEdges: true } },
    async () => input,
    createMockRuntime<Record<string, never>, { thresholdDegrees: number }>({ options: { thresholdDegrees: 30 } }),
  );
  expect(result.success).toBe(true);
  if (!result.success) {
    return;
  }
  const restored = await io.readJSON({
    json: JSON.parse(new TextDecoder().decode(result.data[0].bytes)) as JSONDocument['json'],
    resources: {},
  });
  const root = restored.getRoot();
  const surface = root.listMeshes()[0]!;
  expect(surface.listPrimitives().map((primitive) => primitive.getMode())).toEqual([4]);
  expect(surface.getExtension(EXTManifold.EXTENSION_NAME)).not.toBeNull();
  const [left, right] = root.listNodes().filter((node) => node.getMesh() === surface);
  expect(left!.listChildren()[0]!.getMesh()).toBe(right!.listChildren()[0]!.getMesh());
  expect(left!.listChildren()[0]!.getTranslation()).toEqual([0, 0, 0]);
  expect(right!.getTranslation()).toEqual([-23, 29, 31]);
});

it('rejects compact EXT coordinate transforms explicitly while no-op is supported', async () => {
  const { document } = fixture();
  const instances = document.createExtension(EXTMeshGPUInstancing).createInstancedMesh();
  const translations = document
    .createAccessor()
    .setBuffer(document.getRoot().listBuffers()[0]!)
    .setType('VEC3')
    .setArray(new Float32Array([1, 2, 3]));
  instances.setAttribute('TRANSLATION', translations);
  document.getRoot().listNodes()[1]!.setExtension(EXTMeshGPUInstancing.EXTENSION_NAME, instances);
  await document.transform(createCoordinateTransform(false), createScalingTransform(false));
  await expect(document.transform(createCoordinateTransform())).rejects.toThrow(
    'do not support EXT_mesh_gpu_instancing',
  );
  expect([...translations.getArray()!]).toEqual([1, 2, 3]);
});

it('preserves reflected nonuniform node scale through coordinate roundtrip', async () => {
  const { document, parent } = fixture();
  parent.setScale([2, -3, 4]);
  await document.transform(createCoordinateTransform());
  expect(parent.getScale()).toEqual([2, 4, -3]);
  await document.transform(createReverseCoordinateTransform());
  expect(parent.getScale()).toEqual([2, -3, 4]);
});

it('preserves existing embedded and bufferView image metadata', () => {
  const json = {
    buffers: [{ uri: 'data:application/octet-stream;base64,AQID', byteLength: 3 }],
    images: [
      { uri: 'data:image/png;base64,AQID', extras: { name: 'authored' } },
      { bufferView: 0, mimeType: 'image/png' },
    ],
  };
  const before = structuredClone(json);
  expect(embedGltfResources(json, {})).toEqual(before);
});

it('rejects unsupported required compact EXT before losing per-instance placements', async () => {
  const { document, mesh, indices } = fixture();
  mesh.setExtension(
    EXTManifold.EXTENSION_NAME,
    document.createExtension(EXTManifold).createManifoldPrimitive().setIndices(indices).setRunIndex([0, 3]),
  );
  const translations = document
    .createAccessor()
    .setBuffer(document.getRoot().listBuffers()[0]!)
    .setType('VEC3')
    .setArray(new Float32Array([1, 2, 3, 4, 5, 6]));
  document
    .getRoot()
    .listNodes()[1]!
    .setExtension(
      EXTMeshGPUInstancing.EXTENSION_NAME,
      document
        .createExtension(EXTMeshGPUInstancing)
        .setRequired(true)
        .createInstancedMesh()
        .setAttribute('TRANSLATION', translations),
    );
  const io = new NodeIO().registerExtensions([EXTManifold, EXTMeshGPUInstancing]);
  const input = {
    success: true,
    issues: [],
    data: [{ name: 'compact.glb', mimeType: 'model/gltf-binary', bytes: await io.writeBinary(document) }],
  } satisfies KernelExportResult;
  const definition = await resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  await expect(
    definition.wrapExport!(
      {
        exportId: 'glb',
        extension: 'glb',
        mimeType: 'model/gltf-binary',
        options: {},
        content: { includeEdges: true },
      },
      async () => input,
      createMockRuntime<Record<string, never>, { thresholdDegrees: number }>({ options: { thresholdDegrees: 30 } }),
    ),
  ).rejects.toThrow('Missing required extension, "EXT_mesh_gpu_instancing".');
});
