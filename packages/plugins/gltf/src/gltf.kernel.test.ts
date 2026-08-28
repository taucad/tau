/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { gltfKernel } from '#gltf.kernel.js';

const definition = await resolveRuntimePluginDefinition<AnyKernelDefinition>('kernel', gltfKernel());
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
  it.each(['cube.glb', 'cube-draco.glb'])('imports %s', async (name) => {
    const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
    stage({ [name]: bytes });
    const result = await definition.createGeometry({ entryPath: name, parameters: {} }, runtime, context);
    expect(result.geometry?.format).toBe('gltf');
    if (result.geometry?.format === 'gltf') {
      validateGlbData(result.geometry.content);
    }
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
    const result = await definition.createGeometry({ entryPath: name, parameters: {} }, runtime, context);
    expect(result.geometry?.format).toBe('gltf');
    if (result.geometry?.format === 'gltf') {
      validateGlbData(result.geometry.content);
    }
  });
});
