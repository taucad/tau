/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { loadDracoDecoder } from '#draco-backend.js';
import { gltfKernel } from '#gltf.kernel.js';

const definition = await resolveRuntimePluginDefinition('kernel', gltfKernel());
const runtime = createMockKernelRuntime();

const importFixture = async (context: Awaited<ReturnType<typeof definition.initialize>>, name: string) => {
  const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
  runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
  runtime.filesystem.mocks.stat.mockResolvedValue({ type: 'file', size: bytes.length, mtimeMs: 0 });
  runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);
  await definition.evaluate({ entryPath: name, parameters: {}, options: {} }, runtime, context);
};

// T26 (PR-1b, AR-W15-01): the kernel's only WebAssembly heap is the worker's Draco decoder, loaded on demand.
describe('gltfKernel observed heap', () => {
  it("has none until a Draco import loads the decoder, then observes the decoder's memory", async () => {
    const context = await definition.initialize({}, runtime);

    expect(definition.observedHeapBytes?.(context)).toBeUndefined();
    await importFixture(context, 'cube.glb');
    expect(definition.observedHeapBytes?.(context)).toBeUndefined();

    await importFixture(context, 'cube-draco.glb');
    const observed = definition.observedHeapBytes?.(context);
    const decoder = await loadDracoDecoder();

    expect(Number.isSafeInteger(observed)).toBe(true);
    expect(observed).toBeGreaterThan(0);
    expect(observed).toBe(decoder.HEAPU8.buffer.byteLength);
    expect(definition.heapBytes).toBeUndefined();
  });
});
