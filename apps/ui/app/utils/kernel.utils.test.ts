import { describe, expect, it } from 'vitest';
import { opencascadeKernel } from '@taucad/opencascade';
import { replicadKernel } from '@taucad/replicad';
import { jscadKernel } from '@taucad/jscad';
import { manifoldKernel } from '@taucad/manifold';
import { picovoxelKernel } from '@taucad/picovoxel';
import { smlibKernel } from '@taucad/smlib';
import { tscircuitKernel } from '@taucad/tscircuit';
import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelEcosystem } from '@taucad/types/constants';
import { kernelLibraries } from '#utils/kernel-libraries.js';
import { getKernelDependencies, getKernelProjectTemplate, kernelsWithLibraries } from '#utils/kernel.utils.js';

describe('getKernelDependencies', () => {
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

/** The files a new project of each ecosystem starts from its kernel's template; Tau writes the others itself. */
const templateFiles: Readonly<Record<KernelEcosystem, readonly string[] | undefined>> = {
  pypi: ['pyproject.toml', 'pylock.toml', 'uv.lock'],
  nuget: ['project.csproj', 'packages.lock.json'],
  npm: undefined,
  kcl: undefined,
  none: undefined,
};

describe('getKernelProjectTemplate', () => {
  it.each(kernelConfigurations.map(({ id, ecosystem }) => [id, ecosystem] as const))(
    'should give %s the %s template files, each non-empty',
    async (id, ecosystem) => {
      const template = await getKernelProjectTemplate(id);
      const expected = templateFiles[ecosystem];

      expect(template === undefined ? undefined : Object.keys(template).toSorted()).toEqual(
        expected === undefined ? undefined : [...expected].toSorted(),
      );
      expect(Object.values(template ?? {}).filter((text) => text.length === 0)).toEqual([]);
    },
  );
});
