// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { AnyRuntimeDefinition } from '#worker/runtime-definition.js';

const heapKernel = (heap: { bytes: number | undefined }) =>
  defineKernel({
    id: 'heap-report',
    name: 'Heap report',
    version: '1.0.0',
    extensions: ['heap'],
    views: { drawing: { title: 'Drawing', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return { heap };
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({
        parameters: {
          schema: {
            $schema: 'https://json-structure.org/meta/extended/v0/#',
            $id: 'urn:taucad:test:heap-report',
            $uses: ['JSONSchemaUnits'],
            name: 'HeapReportParameters',
            type: 'object',
          },
          defaults: {},
        },
      });
    },
    async evaluate() {
      return { handle: {}, views: ['drawing'] };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    heapBytes: (context) => context.heap.bytes,
  })();

const clients: Array<ReturnType<typeof createRuntimeClient>> = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map(async (client) => client.shutdown()));
});

const renderOnce = async (heap: { bytes: number | undefined }) => {
  const runtime: AnyRuntimeDefinition = defineRuntime({ kernels: [heapKernel(heap)] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ 'main.heap': '' }),
    }),
  });
  clients.push(client);
  await client.connect();
  const outcome = await client
    .open({ source: { path: 'main.heap' } })
    .view()
    .rendering();
  if (outcome.superseded) {
    throw new Error('The only rendering was superseded.');
  }
  return outcome.rendering;
};

// D-RT-03: nothing read a kernel's WebAssembly heap after an operation, so no host could recycle a worker whose
// linear memory (which never shrinks) had grown past what the device survives.
describe('kernel heap report', () => {
  it("carries the producing kernel's WebAssembly heap on each rendering", async () => {
    const rendering = await renderOnce({ bytes: 600 * 2 ** 20 });

    expect(rendering.success).toBe(true);
    expect(rendering).toMatchObject({ heapBytes: 600 * 2 ** 20 });
  });

  it('leaves the field out for a kernel that reports no heap', async () => {
    const rendering = await renderOnce({ bytes: undefined });

    expect(rendering.success).toBe(true);
    expect(rendering).not.toHaveProperty('heapBytes');
  });
});
