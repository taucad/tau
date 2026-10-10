import { describe, expect, it } from 'vitest';
import { replicadKernel } from '@taucad/replicad';
import { kernelLibraries } from '#utils/kernel-libraries.js';
import { getKernelDependencies, kernelsWithLibraries } from '#utils/kernel.utils.js';

describe('getKernelDependencies', () => {
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
