import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { deriveExportTargets, deriveImportExtensions } from '#plugins/plugin-derivation.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const kernel = defineKernel({
  id: 'fixture',
  extensions: ['step', '*', 'stp'],
  name: 'Fixture',
  version: '1.0.0',
  exportFormats: { glb: { optionsSchema: z.object({}) } },
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { nativeHandle: undefined };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});

const transcoder = defineTranscoder({
  id: 'fixture-transcoder',
  name: 'Fixture',
  version: '1.0.0',
  edges: [
    { from: 'glb', to: 'obj', fidelity: 'mesh' },
    { from: 'step', to: 'stl', fidelity: 'mesh' },
  ],
  async initialize() {
    return {};
  },
  async transcode() {
    return { success: true, data: [], issues: [] };
  },
});

describe('runtime capability derivation', () => {
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
});
