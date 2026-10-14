// @vitest-environment node
/**
 * Replicad — a kernel whose initialisation fails after taking its realm hold.
 *
 * The kernel never reaches `onDispose`, so `initialize` itself must release the
 * hold; otherwise the realm keeps the OpenCASCADE instance forever and refuses
 * every other build (kernel-realm-shared-state blueprint, I5).
 */
import { describe, expect, it, vi } from 'vitest';
import type * as OcctCore from '@taucad/occt-core';
import type * as RuntimeKernel from '@taucad/runtime/kernel';
import { defineRuntime } from '@taucad/runtime/worker';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '#replicad.kernel.js';

const state = vi.hoisted(() => ({ instances: 0, failRegistration: false }));

vi.mock('@taucad/occt-core', async (importOriginal) => {
  const actual = await importOriginal<typeof OcctCore>();
  const initOcct: typeof actual.initOcct = async (...arguments_) => {
    state.instances += 1;
    return actual.initOcct(...arguments_);
  };
  return { ...actual, initOcct };
});

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeKernel>();
  const registerKernelModule: typeof actual.registerKernelModule = (...arguments_) => {
    if (state.failRegistration) {
      throw new Error('registration failed');
    }
    actual.registerKernelModule(...arguments_);
  };
  return { ...actual, registerKernelModule };
});

const files = {
  'main.ts': `import { makeBaseBox } from 'replicad';
export default function main() {
  return makeBaseBox(10, 20, 30);
}
`,
};

const render = async () => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] }),
    files,
  });
  const document = client.open({ source: { path: 'main.ts' } });
  const view = document.view();
  try {
    const outcome = await view.rendering();
    return outcome.superseded ? undefined : outcome.rendering;
  } finally {
    view.close();
    document.close();
    await client.shutdown();
  }
};

describe('Replicad — initialisation failing after the realm hold', { timeout: 120_000 }, () => {
  it('should release the hold so the next client creates a fresh OpenCASCADE instance', async () => {
    state.failRegistration = true;
    const failed = await render();
    state.failRegistration = false;
    expect(failed?.issues.map((issue) => issue.message)).toEqual(['registration failed']);
    const instancesAfterFailure = state.instances;

    const recovered = await render();

    expect(recovered?.success).toBe(true);
    expect(state.instances).toBe(instancesAfterFailure + 1);
  });
});
