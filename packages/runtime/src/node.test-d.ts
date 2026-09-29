import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ExportResult, RuntimeClient } from '#index.js';
import type { FileExtension } from '#types/index.js';
import { createNodeClient } from '#node.js';
import { defineKernelV2 as defineKernel, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const kernel = defineKernel({
  id: 'typed-kernel',
  extensions: ['typed'],
  name: 'TypedKernel',
  version: '1.0.0',
  views: {},
  exports: {
    glb: {
      title: 'GLB',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: z.object({ binary: z.boolean().default(true) }),
      content: ['includeEdges'],
    },
    stl: {
      title: 'STL',
      mimeType: 'model/stl',
      extension: 'stl',
      optionsSchema: z.object({ tolerance: z.number().optional() }),
    },
  },
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    return { success: false, issues: [] };
  },
  async evaluate() {
    return { handle: {}, views: [] as const, exports: ['glb', 'stl'] as const };
  },
  async write() {
    return {
      files: nonemptyExportFiles([{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: new Uint8Array([1]) }]),
    };
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
    const configuredClient = await createNodeClient({ runtime });
    const client: RuntimeClient = configuredClient;
    const format = 'glb' as FileExtension;
    const document = client.open({ source: { files: { 'main.typed': 'fixture' } } });
    void document.export(format);
  });

  it('keeps explicitly supplied kernel export typing', async () => {
    const client = await createNodeClient({ runtime });
    const document = client.open({ source: { files: { 'main.typed': 'fixture' } } });
    void document.export('glb', { options: { binary: true } });
    void document.export('stl', { options: { tolerance: 0.01 } });
    // @ts-expect-error -- no image transcoder is registered.
    void document.export('webp');
  });

  it('preserves explicitly supplied transcoder options and content declarations', async () => {
    const client = await createNodeClient({ runtime: richRuntime });
    const document = client.open({ source: { files: { 'main.typed': 'fixture' } } });
    const result = document.export('webp', {
      content: { includeEdges: true },
      options: { width: 768, height: 432, quality: 0.8 },
    });
    expectTypeOf(result).toEqualTypeOf<Promise<ExportResult<'glb'>>>();
  });
});
