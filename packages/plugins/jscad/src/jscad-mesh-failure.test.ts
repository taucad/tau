// @vitest-environment node

/**
 * A mesh phase that cannot convert its shapes must say why.
 *
 * The conversion throw used to be caught and logged, which did not save the
 * render — the finalizer refuses a phase with no artifact — it only replaced
 * the cause ("unsupported polygon") with the finalizer's own
 * `NO_RENDER_GEOMETRY`, in a log line no product surface reads.
 */

import { describe, expect, it, vi } from 'vitest';
import * as jscadModelingImport from '@jscad/modeling';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { resolveJscadModeling } from '#jscad-modeling.js';
import { normalizeJscadParts } from '#jscad-parts.js';

vi.mock('#jscad-to-gltf.js', () => ({
  jscadToGltf: (): never => {
    throw new Error('unsupported polygon');
  },
}));

const { jscadKernel } = await import('#jscad.kernel.js');
const testModeling = resolveJscadModeling(jscadModelingImport);
const testPrimitives = testModeling as unknown as {
  primitives: { cuboid: (options: unknown) => Record<string, unknown> };
};

describe('mesh phase conversion failure', () => {
  it('fails with the conversion error, not with the finalizer standing in for it', async () => {
    const nativeHandle = normalizeJscadParts(testPrimitives.primitives.cuboid({ size: [2, 2, 2] }), testModeling);
    const { meshGeometry } = await resolveRuntimePluginDefinition('kernel', jscadKernel());
    expect(meshGeometry).toBeDefined();

    await expect(
      meshGeometry!({ nativeHandle, options: {}, content: {} }, createMockKernelRuntime(), {
        modulesRegistered: true,
        modeling: testModeling,
      }),
    ).rejects.toThrow('unsupported polygon');
  });
});
