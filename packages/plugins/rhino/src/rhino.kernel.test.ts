/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMockKernelRuntime, expectKernelProjectionOrder, validateGlbData } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { rhinoKernel } from '#rhino.kernel.js';

const definition = await resolveRuntimePluginDefinition('kernel', rhinoKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

describe('rhinoKernel', () => {
  it('retains the GLB view and export declarations', () => {
    expect(rhinoKernel()).toMatchObject({
      views: { model: { mimeType: 'model/gltf-binary' } },
      exports: { glb: { extension: 'glb', mimeType: 'model/gltf-binary' } },
    });
  });

  it('imports a 3dm mesh', async () => {
    const name = 'cube-mesh.3dm';
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
    runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
    runtime.filesystem.mocks.stat.mockResolvedValueOnce({ type: 'file', size: bytes.length, mtimeMs: 0 });
    runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);

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
  });
});
