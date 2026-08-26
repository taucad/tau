/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { assimpKernel } from '#assimp.kernel.js';

const definition = await resolveRuntimePluginDefinition<AnyKernelDefinition>('kernel', assimpKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

afterAll(async () => {
  await definition.cleanup?.(context);
});

describe('assimpKernel', () => {
  it.each(['cube.obj', 'cube-ascii.stl', 'cube-ascii.ply', 'cube.dae', 'cube-ascii.fbx'])(
    'imports %s through the worker context backend',
    async (name) => {
      const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
      runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
      runtime.filesystem.mocks.stat.mockResolvedValueOnce({ type: 'file', size: bytes.length, mtimeMs: 0 });
      runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);

      const result = await definition.createGeometry({ entryPath: `/${name}`, parameters: {} }, runtime, context);
      expect(result.geometry?.format).toBe('gltf');
      if (result.geometry?.format === 'gltf') {
        validateGlbData(result.geometry.content);
      }
    },
  );
});
