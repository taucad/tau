/** Kernel registration metadata keeps implementation and transport details private. */
import { assertType, describe, it } from 'vitest';
import type { KernelPlugin } from '#plugins/plugin-types.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import type { DescribeResult } from '#types/runtime-kernel-v2.types.js';

const baseKernelDefinition = {
  id: 'x',
  extensions: ['x'],
  name: 'Kernel',
  version: '1.0.0',
  views: {},
  exports: {},
  async initialize() {
    return {};
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return { success: false, issues: [] } satisfies DescribeResult;
  },
  async evaluate() {
    return { handle: {} };
  },
};

describe('KernelPlugin API correctness (C17)', () => {
  it('KernelPlugin must not expose a `worker` field', () => {
    type HasWorker = 'worker' extends keyof KernelPlugin ? true : false;
    assertType<HasWorker>(false);
  });

  it('defineKernelV2 rejects runtime and transport config keys', () => {
    const okFactory = defineKernelV2(baseKernelDefinition);
    assertType<KernelPlugin>(okFactory());

    defineKernelV2({
      ...baseKernelDefinition,
      // @ts-expect-error -- `worker` is not a kernel authoring key.
      worker: () => undefined,
    });
    defineKernelV2({
      ...baseKernelDefinition,
      // @ts-expect-error -- `transport` belongs on createRuntimeClient.
      transport: undefined,
    });
    defineKernelV2({
      ...baseKernelDefinition,
      // @ts-expect-error -- implementation loading details are hidden on plugin registrations.
      implementationHref: 'taucad:test',
    });
  });
});
