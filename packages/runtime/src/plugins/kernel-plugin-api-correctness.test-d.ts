/**
 * Conformance test C17 (v6 Appendix B).
 *
 * Kernel plugin metadata does not carry a `worker` field: executable runtime
 * ownership belongs to the worker/host runtime definition, not to client-side
 * plugin metadata or per-kernel workers.
 */

import { assertType, describe, it } from 'vitest';
import type { GeometryResponse } from '@taucad/types';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';

const testGeometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;

const baseKernelDefinition = {
  id: 'x',
  extensions: ['x'],
  name: 'Kernel',
  version: '1.0.0',
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
    return { geometry: testGeometry, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
};

describe('KernelPlugin API correctness (C17)', () => {
  it('KernelPlugin must not expose a `worker` field', () => {
    type HasWorker = 'worker' extends keyof KernelPlugin ? true : false;
    assertType<HasWorker>(false);
  });

  it('defineKernel rejects extra unknown config keys at compile time', () => {
    const okFactory = defineKernel(baseKernelDefinition);
    assertType<KernelPlugin>(okFactory());

    defineKernel({
      ...baseKernelDefinition,
      // @ts-expect-error -- `worker` is not a valid defineKernel config key.
      worker: () => undefined,
    });

    defineKernel({
      ...baseKernelDefinition,
      // @ts-expect-error -- `transport` belongs on createRuntimeClient, not on a kernel.
      transport: undefined,
    });

    defineKernel({
      ...baseKernelDefinition,
      // @ts-expect-error -- implementation loading details are hidden on the returned plugin factory.
      implementationHref: 'taucad:test',
    });
  });
});
