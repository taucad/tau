import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { RuntimeClient } from '#index.js';
import type { FileExtension } from '#types/index.js';
import { createNodeClient } from '#node.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const kernel = defineKernel({
  id: 'typed-kernel',
  extensions: ['typed'],
  name: 'TypedKernel',
  version: '1.0.0',
  exportFormats: {
    glb: { optionsSchema: z.object({ binary: z.boolean().default(true) }), content: ['includeEdges'] },
    stl: { optionsSchema: z.object({ tolerance: z.number().optional() }) },
  },
  async initialize() {
    return {};
  },
  async getDependencies({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { geometry: { format: 'gltf', content: new Uint8Array() }, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});

const imageTranscoder = defineTranscoder({
  id: 'typed-image',
  name: 'TypedImage',
  version: '1.0.0',
  edges: [
    {
      from: 'glb',
      to: 'webp',
      fidelity: 'mesh',
      optionsSchema: z.object({ width: z.number().default(768), height: z.number().default(432), quality: z.number() }),
      content: ['includeEdges'],
    },
  ] as const,
  async initialize() {
    return {};
  },
  async transcode(input) {
    return { success: true, data: input.files, issues: [] };
  },
});

const runtime = defineRuntime({ kernels: [kernel()] });
const richRuntime = defineRuntime({ kernels: [kernel()], transcoders: [imageTranscoder()] });

describe('createNodeClient configured type inference', () => {
  it('can widen to the public client contract at a dynamic consumer boundary', async () => {
    const configuredClient = await createNodeClient(undefined, { runtime });
    const client: RuntimeClient = configuredClient;
    const format = 'glb' as FileExtension;
    void client.export(format, { source: { files: { 'main.typed': 'fixture' } } });
  });

  it('keeps explicitly supplied kernel export typing', async () => {
    const client = await createNodeClient(undefined, { runtime });
    void client.export('glb', { source: { files: { 'main.typed': 'fixture' } } });
    void client.export('stl', { exportOptions: { tolerance: 0.01 } });
    // @ts-expect-error -- no image transcoder is registered.
    void client.export('webp');
  });

  it('preserves explicitly supplied transcoder options and content declarations', async () => {
    const client = await createNodeClient(undefined, { runtime: richRuntime });
    const result = client.export('webp', {
      source: { files: { 'main.typed': 'fixture' } },
      content: { includeEdges: true },
      exportOptions: { width: 768, height: 432, quality: 0.8 },
    });
    expectTypeOf(result).toEqualTypeOf<ReturnType<typeof client.export>>();
  });
});
