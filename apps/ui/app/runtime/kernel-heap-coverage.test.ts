import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { runtime } from '#runtime/ui-runtime.definition.js';

/** The memory hooks of `KernelDefinitionV2`, in the order the runtime's `heapFacts` prefers them. */
const heapHooks = ['observedHeapBytes', 'heapBytes', 'observedChildResidentBytes'] as const;

/*
 * T26 (PR-1b, AR-W15-01): every kernel the browser editor routes to, with the memory hooks it implements. A kernel with
 * none reports `tau.runtime.heap_source` `none` on every operation, so it is a named blind spot (B18) rather than an
 * unmeasured one: a new kernel fails here until it gets a hook or is listed with none.
 */
const expectedHeapHooks: Record<string, ReadonlyArray<(typeof heapHooks)[number]>> = {
  // WebAssembly linear memory through the observation-only hook.
  brep: ['observedHeapBytes'],
  gltf: ['observedHeapBytes'],
  picovoxel: ['observedHeapBytes'],
  zoo: ['observedHeapBytes'],
  // The browser .NET worker's heap; the child-tree hook is shared with the native kernel and answers undefined here.
  picogk: ['observedHeapBytes', 'observedChildResidentBytes'],
  // The observation hook beside the recycling hook, which stays as it was.
  opencascade: ['observedHeapBytes', 'heapBytes'],
  replicad: ['observedHeapBytes', 'heapBytes'],
  // B18: no hook.
  assimp: [],
  jscad: [],
  manifold: [],
  openrscad: [],
  rhino: [],
  smlib: [],
  tscircuit: [],
};

describe('browser kernel heap coverage', () => {
  it('should pin which kernels report a heap and which are named blind spots', async () => {
    const { kernels } = await resolveRuntimeDefinition(runtime, {
      tauApiUrl: 'https://api.tau.test',
      tauWebSocketUrl: 'wss://api.tau.test',
    });
    const actual: Record<string, ReadonlyArray<(typeof heapHooks)[number]>> = {};
    for (const kernel of kernels) {
      // oxlint-disable-next-line no-await-in-loop -- resolve each kernel's worker-owned definition in roster order.
      const definition = await resolveRuntimePluginDefinition<Partial<Record<(typeof heapHooks)[number], unknown>>>(
        'kernel',
        kernel,
      );
      actual[kernel.id] = heapHooks.filter((hook) => typeof definition[hook] === 'function');
    }

    expect(actual).toEqual(expectedHeapHooks);
  });
});
