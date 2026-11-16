import { describe, expect, it } from 'vitest';

import { deriveExportTargets, deriveImportExtensions, deriveTranscodeSources } from '#plugins/plugin-derivation.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const kernel = defineKernelV2({
  id: 'fixture',
  extensions: ['step', '*', 'stp'],
  name: 'Fixture',
  version: '1.0.0',
  views: {},
  exports: { native: { title: 'Native', mimeType: 'model/gltf-binary', extension: 'glb' } },
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
    return { handle: {}, views: [] as const, exports: ['native'] as const };
  },
  async export() {
    return { files: [{ name: 'model.glb', mimeType: 'model/gltf-binary', bytes: new Uint8Array([1]) }] as const };
  },
});

const transcoder = defineTranscoder({
  id: 'fixture-transcoder',
  name: 'Fixture',
  version: '1.0.0',
  edges: [
    { from: 'glb', to: 'obj' },
    { from: 'step', to: 'stl' },
  ],
  async initialize() {
    return {};
  },
  async transcode() {
    return { success: true, data: [], issues: [] };
  },
});

const imageTranscoder = defineTranscoder({
  id: 'fixture-image',
  name: 'FixtureImage',
  version: '1.0.0',
  edges: [
    { from: 'png', to: 'jpeg' },
    { from: 'webp', to: 'jpeg' },
    { from: 'png', to: 'webp' },
  ],
  async initialize() {
    return {};
  },
  async transcode() {
    return { success: true, data: [], issues: [] };
  },
});

const extraImageTranscoder = defineTranscoder({
  id: 'fixture-image-extra',
  name: 'FixtureImageExtra',
  version: '1.0.0',
  edges: [
    { from: 'heic', to: 'jpeg' },
    { from: 'png', to: 'jpeg' },
  ],
  async initialize() {
    return {};
  },
  async transcode() {
    return { success: true, data: [], issues: [] };
  },
});

describe('runtime capability derivation', () => {
  it('derives the direct sources of one target in registration order without duplicates', () => {
    const runtime = defineRuntime({
      kernels: [kernel()],
      transcoders: [transcoder(), imageTranscoder(), extraImageTranscoder()],
    });
    expect(deriveTranscodeSources(runtime, 'jpeg')).toEqual(['png', 'webp', 'heic']);
    expect(deriveTranscodeSources(runtime, 'webp')).toEqual(['png']);
    expect(deriveTranscodeSources(runtime, 'obj')).toEqual(['glb']);
  });

  it('derives no sources for a target without edges', () => {
    const runtime = defineRuntime({ kernels: [kernel()], transcoders: [transcoder()] });
    const transcoders: Parameters<typeof deriveTranscodeSources>[0]['transcoders'] = runtime.transcoders;
    expect(deriveTranscodeSources({ transcoders }, 'jpeg')).toEqual([]);
  });

  it('rejects a target no registered transcoder produces at compile time', () => {
    const runtime = defineRuntime({ kernels: [kernel()], transcoders: [transcoder()] });
    // @ts-expect-error -- no registered edge targets jpeg.
    expect(deriveTranscodeSources(runtime, 'jpeg')).toEqual([]);
  });

  it('derives explicit imports and reachable single-hop exports', () => {
    const runtime = defineRuntime({ kernels: [kernel()], transcoders: [transcoder()] });
    expect(deriveImportExtensions(runtime)).toEqual(['step', 'stp']);
    expect(deriveExportTargets(runtime)).toEqual(['glb', 'obj']);
  });

  it('derives declared extensions per kernel id', () => {
    const runtime = defineRuntime({ kernels: [kernel()], transcoders: [transcoder()] });
    expect(Object.fromEntries(runtime.kernels.map((entry) => [entry.id, entry.extensions]))).toEqual({
      fixture: ['step', '*', 'stp'],
    });
  });

  it('reads serialisable V2 export declarations from a real registration', () => {
    const modern = defineKernelV2({
      id: 'modern',
      name: 'Modern',
      version: '1.0.0',
      extensions: ['modern'],
      views: {},
      exports: { native: { title: 'Native', mimeType: 'application/x-modern', extension: 'x-modern' } },
      async initialize() {
        return {};
      },
      async resolve() {
        return { resolved: [], unresolved: [] };
      },
      async describe() {
        return { success: false, issues: [] };
      },
      async evaluate() {
        return { handle: {}, views: [] as const, exports: ['native'] as const };
      },
      async export() {
        return {
          files: [{ name: 'model.x-modern', mimeType: 'application/x-modern', bytes: new Uint8Array([1]) }] as const,
        };
      },
    })();
    const runtime = defineRuntime({ kernels: [modern] });
    expect(deriveExportTargets(runtime)).toEqual(['x-modern']);
  });
});
