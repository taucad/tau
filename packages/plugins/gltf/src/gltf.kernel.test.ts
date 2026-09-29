/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
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
    const { json } = await new NodeIO().binaryToJSON(artifact.content as Uint8Array<ArrayBuffer>);
    expect(json.extensionsUsed?.includes(dracoExtensionName)).not.toBe(true);
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
