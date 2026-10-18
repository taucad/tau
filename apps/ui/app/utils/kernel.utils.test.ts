import { describe, expect, it } from 'vitest';
import { opencascadeKernel } from '@taucad/opencascade';
import { replicadKernel } from '@taucad/replicad';
import { jscadKernel } from '@taucad/jscad';
import { manifoldKernel } from '@taucad/manifold';
import { picovoxelKernel } from '@taucad/picovoxel';
import { smlibKernel } from '@taucad/smlib';
import { tscircuitKernel } from '@taucad/tscircuit';
import { kernelLibraries } from '#utils/kernel-libraries.js';
import { getKernelDependencies, kernelsWithLibraries } from '#utils/kernel.utils.js';

describe('getKernelDependencies', () => {
  it.each([
    ['replicad', replicadKernel],
    ['jscad', jscadKernel],
    ['manifold', manifoldKernel],
    ['picovoxel', picovoxelKernel],
    ['tscircuit', tscircuitKernel],
  ] as const)(
    'should keep the dependency-only %s projection equal to the real kernel metadata',
    async (kernelId, factory) => {
      expect(await getKernelDependencies(kernelId)).toEqual(factory().builtinDependencies);
    },
  );

  it('should return independent dependency records without mutating the checked projection', async () => {
    const first = await getKernelDependencies('replicad');
    first['replicad'] = 'caller-edited';
    expect(await getKernelDependencies('replicad')).toEqual(replicadKernel().builtinDependencies);
  });

  it('should match every kernel without loading executable plugins into the renderer', () => {
    expect(kernelLibraries).toEqual({
      replicad: replicadKernel().builtinDependencies,
      opencascadejs: opencascadeKernel().builtinDependencies,
      jscad: jscadKernel().builtinDependencies,
      manifold: manifoldKernel().builtinDependencies,
      picovoxel: picovoxelKernel().builtinDependencies,
      smlib: smlibKernel().builtinDependencies,
      tscircuit: tscircuitKernel().builtinDependencies,
    });
  });

  it('should declare the package the replicad plugin runs, under its import name', async () => {
    const dependencies = await getKernelDependencies('replicad');

    expect(dependencies).toEqual(replicadKernel().builtinDependencies);
    expect(dependencies['replicad']).toMatch(/^npm:@taulabs\/replicad@\d/);
    // Tau-only annotations have no npm identity.
    expect(dependencies).not.toHaveProperty('@taucad/replicad');
  });

  it('should list exactly the kernels whose plugins declare libraries', () => {
    expect(new Set(Object.keys(kernelLibraries))).toEqual(kernelsWithLibraries);
    for (const dependencies of Object.values(kernelLibraries)) {
      expect(Object.keys(dependencies).length).toBeGreaterThan(0);
    }
  });

  it('should declare nothing for a kernel without npm libraries', async () => {
    await expect(getKernelDependencies('openscad')).resolves.toEqual({});
  });
});
