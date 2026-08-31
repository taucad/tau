import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { KernelDefinition } from '@taucad/runtime/kernel';
import { assimpKernel } from '@taucad/assimp';
import { brepKernel } from '@taucad/brep';
import { gltfKernel } from '@taucad/gltf';
import { jscadKernel } from '@taucad/jscad';
import { manifoldKernel } from '@taucad/manifold';
import { opencascadeKernel } from '@taucad/opencascade';
import { openrscadKernel } from '@taucad/openrscad';
import { replicadKernel } from '@taucad/replicad';
import { rhinoKernel } from '@taucad/rhino';
import { zooKernel } from '@taucad/zoo';

describe('portable source snapshot kernel conformance', () => {
  it('keeps dependency discovery on every first-party UI kernel', async () => {
    const kernels = [
      assimpKernel(),
      brepKernel(),
      gltfKernel(),
      jscadKernel(),
      manifoldKernel(),
      opencascadeKernel(),
      openrscadKernel(),
      replicadKernel(),
      rhinoKernel(),
      zooKernel(),
    ];

    for (const kernel of kernels) {
      // oxlint-disable-next-line no-await-in-loop -- one assertion reports the exact first-party kernel that violates the contract.
      const definition = await resolveRuntimePluginDefinition<KernelDefinition>('kernel', kernel);
      expect(definition.getDependencies, kernel.id).toBeTypeOf('function');
    }
  });
});
