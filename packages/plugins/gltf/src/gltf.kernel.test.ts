/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createMockKernelRuntime, expectKernelProjectionOrder, validateGlbData } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { gltfKernel } from '#gltf.kernel.js';

import { dracoExtensionName } from '#draco-backend.js';

const definition = await resolveRuntimePluginDefinition('kernel', gltfKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

const stage = (files: Readonly<Record<string, Uint8Array<ArrayBuffer>>>) => {
  runtime.filesystem.mocks.readdir.mockResolvedValueOnce(Object.keys(files));
  runtime.filesystem.mocks.stat.mockImplementation(async (path) => ({
    type: 'file',
    size: files[String(path)]?.length ?? 0,
    mtimeMs: 0,
  }));
  runtime.filesystem.mocks.readFile.mockImplementation(async (path) => files[String(path)]!);
};

describe('gltfKernel', () => {
  it('retains the GLB view and export declarations', () => {
    const registration = gltfKernel();
    expectTypeOf<keyof typeof registration.views>().toEqualTypeOf<'model'>();
    expectTypeOf<keyof typeof registration.exports>().toEqualTypeOf<'glb'>();
    expect(registration).toMatchObject({
      views: { model: { mimeType: 'model/gltf-binary' } },
      exports: { glb: { extension: 'glb', mimeType: 'model/gltf-binary' } },
    });
  });

  it.each(['cube.glb', 'cube-draco.glb'])('imports %s', async (name) => {
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
    stage({ [name]: bytes });
    const result = await definition.evaluate({ entryPath: name, parameters: {}, options: {} }, runtime, context);
    const artifact = await definition.render!({ handle: result.handle, view: 'model', options: {} }, runtime, context);
    validateGlbData(artifact.content as Uint8Array<ArrayBuffer>);
    const freshSnapshot = definition.serializeHandle!({ handle: result.handle }, runtime, context);
    const render = async (handle: typeof result.handle) => {
      const projected = await definition.render!({ handle, view: 'model', options: {} }, runtime, context);
      return projected.content;
    };
    const exportModel = async (
      handle: typeof result.handle,
      coordinateSystem: 'y-up' | 'z-up',
      length: 'meter' | 'millimeter',
    ) => {
      const projected = await definition.export!(
        { exportId: 'glb', handle, options: { coordinateSystem, unit: { length } } },
        runtime,
        context,
      );
      return projected.files[0].bytes;
    };
    const ordered = await expectKernelProjectionOrder({
      renderA: async () => render(result.handle),
      renderB: async () => exportModel(result.handle, 'y-up', 'meter'),
      export: async () => exportModel(result.handle, 'z-up', 'millimeter'),
      freshB: async () => {
        const fresh = definition.deserializeHandle!({ serialized: freshSnapshot }, runtime, context);
        return exportModel(fresh, 'y-up', 'meter');
      },
    });
    expect(ordered.first).toEqual(artifact.content);
    const { json } = await new NodeIO().binaryToJSON(artifact.content as Uint8Array<ArrayBuffer>);
    expect(json.extensionsUsed?.includes(dracoExtensionName)).not.toBe(true);
  });

  it('gives triangles without normals flat normals and leaves authored normals indexed', async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (type: 'VEC3' | 'SCALAR', array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>) =>
      document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    // A unit square as two indexed triangles in the XY plane, facing +Z.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const bare = document
      .createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', positions))
      .setIndices(accessor('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])));
    const authored = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        accessor(
          'VEC3',
          positions.map((value, index) => (index % 3 === 2 ? 1 : value)),
        ),
      )
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
      .setIndices(accessor('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])));
    const scene = document.createScene();
    for (const primitive of [bare, authored]) {
      scene.addChild(document.createNode().setMesh(document.createMesh().addPrimitive(primitive)));
    }
    stage({ 'bare.glb': await new NodeIO().writeBinary(document) });

    const result = await definition.evaluate({ entryPath: 'bare.glb', parameters: {}, options: {} }, runtime, context);
    const artifact = await definition.render!({ handle: result.handle, view: 'model', options: {} }, runtime, context);
    const imported = await new NodeIO().readBinary(artifact.content as Uint8Array<ArrayBuffer>);
    const [flat, kept] = imported
      .getRoot()
      .listMeshes()
      .map((mesh) => mesh.listPrimitives()[0]!);

    expect(flat!.getIndices()).toBeNull();
    expect(flat!.getAttribute('POSITION')!.getCount()).toBe(6);
    expect([...flat!.getAttribute('NORMAL')!.getArray()!]).toEqual(Array.from({ length: 6 }, () => [0, 0, 1]).flat());
    expect(kept!.getIndices()!.getCount()).toBe(6);
    expect(kept!.getAttribute('POSITION')!.getCount()).toBe(4);
  });

  it.each([
    ['cube-bin.gltf', 'cube-bin.bin'],
    ['cube-draco.gltf', 'cube-draco-bin.bin'],
  ])('imports %s with its external buffer', async (name, resourceName) => {
    const files = Object.fromEntries(
      [name, resourceName].map((file) => [
        file,
        new Uint8Array(readFileSync(new URL(`fixtures/${file}`, import.meta.url))),
      ]),
    );
    stage(files);
    const result = await definition.evaluate({ entryPath: name, parameters: {}, options: {} }, runtime, context);
    const artifact = await definition.render!({ handle: result.handle, view: 'model', options: {} }, runtime, context);
    validateGlbData(artifact.content as Uint8Array<ArrayBuffer>);
    const { json } = await new NodeIO().binaryToJSON(artifact.content as Uint8Array<ArrayBuffer>);
    expect(json.extensionsUsed?.includes(dracoExtensionName)).not.toBe(true);
  });
});
