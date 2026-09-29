/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { brepKernel } from '#brep.kernel.js';

const definition = await resolveRuntimePluginDefinition('kernel', brepKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

describe('brepKernel', () => {
  it('keeps the stable brep capability id', () => {
    expect(brepKernel().id).toBe('brep');
    expect(brepKernel()).toMatchObject({
      views: { model: { mimeType: 'model/gltf-binary' } },
      exports: { glb: { extension: 'glb', mimeType: 'model/gltf-binary' } },
    });
  });

  it.each(['cube.step', 'cube-brep.iges', 'cube.brep'])('imports %s', async (name) => {
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
    runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
    runtime.filesystem.mocks.stat.mockResolvedValueOnce({ type: 'file', size: bytes.length, mtimeMs: 0 });
    runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);

    const result = await definition.evaluate({ entryPath: name, parameters: {}, options: {} }, runtime, context);
    const artifact = await definition.render!({ handle: result.handle, view: 'model', options: {} }, runtime, context);
    validateGlbData(artifact.content as Uint8Array<ArrayBuffer>);
  });
});
