import { describe, expect, it } from 'vitest';
import { isKernelId, kernelConfigurations, languageFromKernel } from '#constants/kernel.constants.js';

describe('kernel configuration identity', () => {
  it('should start Zoo projects and files with the latest stable bundled KCL version', () => {
    const zoo = kernelConfigurations.find(({ id }) => id === 'zoo');

    expect(zoo).toMatchObject({
      language: 'kcl',
      mainFile: 'main.kcl',
      emptyCode: '@settings(defaultLengthUnit = mm, kclVersion = 3.0)\n',
    });
  });

  it('should expose PicoGK as a native C# desktop offering', () => {
    const configuration = kernelConfigurations.find(({ id }) => id === 'picogk');
    expect(configuration).toMatchObject({
      language: 'csharp',
      mainFile: 'main.cs',
      requiresRuntimeKernelId: 'picogk',
    });
    expect(configuration?.emptyCode).toContain('public static class Params');
    expect(configuration?.emptyCode).toContain('[Range(0.05, 5.0)]');
  });

  it('should expose tscircuit as a TSX electronics offering', () => {
    const configuration = kernelConfigurations.find(({ id }) => id === 'tscircuit');
    expect(configuration).toMatchObject({
      language: 'tsx',
      mainFile: 'main.tsx',
      backendProvider: 'tscircuit',
    });
    // The browser runtime hosts the kernel, so no native-runtime or trust gate applies.
    expect(configuration).not.toHaveProperty('requiresRuntimeKernelId');
    expect(configuration).not.toHaveProperty('requiresNativeCodeTrust');
    expect(configuration?.emptyCode).toContain('<board width="20mm" height="20mm">');
    expect(configuration?.emptyCode).toContain('<trace name="R1_LED1" from=".R1 > .pin2" to=".LED1 > .anode" />');
  });

  it('starts the native kernels with no geometry', () => {
    const picogk = kernelConfigurations.find(({ id }) => id === 'picogk');
    const build123d = kernelConfigurations.find(({ id }) => id === 'build123d');

    expect(picogk?.emptyCode).toContain('Library.Go(Params.VoxelSizeMm, () => { });');
    expect(picogk?.emptyCode).not.toContain('oViewer');
    expect(build123d?.emptyCode).toContain('return None');
  });

  it('should start PicoVoxel projects with an empty scene', () => {
    const picovoxel = kernelConfigurations.find(({ id }) => id === 'picovoxel');

    expect(picovoxel?.emptyCode).toContain('return [];');
    expect(picovoxel?.emptyCode).toContain('export const defaultParams = { voxelSize: 0.5 };');
  });

  it('should keep PicoGK and PicoVoxel distinct offerings of the same engine', () => {
    const picogk = kernelConfigurations.find(({ id }) => id === 'picogk');
    const picovoxel = kernelConfigurations.find(({ id }) => id === 'picovoxel');
    const ids = kernelConfigurations.map(({ id }) => id);

    // Native C# on the desktop versus TypeScript in the browser; one engine, no conversion between them.
    expect(picogk).toMatchObject({ language: 'csharp', mainFile: 'main.cs', requiresRuntimeKernelId: 'picogk' });
    expect(picovoxel).toMatchObject({ language: 'typescript', mainFile: 'main.ts', backendProvider: 'picogk' });
    expect(picovoxel).not.toHaveProperty('requiresRuntimeKernelId');
    expect(picogk?.description).toBe('Native C# voxel CAD for computational engineering');
    expect(picovoxel?.description).toBe('TypeScript voxel and implicit CAD that runs in the browser');
    expect(ids.indexOf('picovoxel')).toBe(ids.indexOf('picogk') + 1);
  });

  it('should expose SMLib as a browser TypeScript NURBS offering with its own backend', () => {
    const smlib = kernelConfigurations.find(({ id }) => id === 'smlib');

    expect(smlib).toMatchObject({
      name: 'SMLib',
      language: 'typescript',
      mainFile: 'main.ts',
      backendProvider: 'smlib',
    });
    // The browser runtime hosts the kernel, so no native-runtime gate applies.
    expect(smlib).not.toHaveProperty('requiresRuntimeKernelId');
    expect(smlib?.emptyCode).toContain("from '@classcad/smlibwasm'");
    expect(languageFromKernel.smlib).toBe('typescript');
  });

  it('should expose SMLibPy as a native Python NURBS offering after Build123d', () => {
    const smlibpy = kernelConfigurations.find(({ id }) => id === 'smlibpy');
    const ids = kernelConfigurations.map(({ id }) => id);

    expect(smlibpy).toMatchObject({
      name: 'SMLibPy',
      language: 'python',
      mainFile: 'main.py',
      backendProvider: 'smlib',
      requiresRuntimeKernelId: 'smlibpy',
    });
    // The runtime routes a .py entry that imports smlibpy to SMLibPy; the catalog keeps Build123d the first .py row.
    expect(smlibpy?.emptyCode).toContain('import smlibpy');
    expect(ids.indexOf('smlibpy')).toBe(ids.indexOf('build123d') + 1);
    expect(languageFromKernel.smlibpy).toBe('python');
  });

  it('presents exactly one OpenSCAD-language kernel with engine-independent copy', () => {
    const scadKernels = kernelConfigurations.filter(({ language }) => language === 'openscad');

    expect(scadKernels).toHaveLength(1);
    expect(scadKernels[0]?.id).toBe('openscad');
    expect(scadKernels[0]?.name).toBe('OpenSCAD');
    expect(scadKernels[0]?.mainFile).toBe('main.scad');
    expect(languageFromKernel.openscad).toBe('openscad');
  });

  it('gives every offering the package ecosystem its users know, npm only for JavaScript and TypeScript', () => {
    const ecosystems = Object.fromEntries(kernelConfigurations.map(({ id, ecosystem }) => [id, ecosystem]));

    expect(ecosystems).toEqual({
      picogk: 'nuget',
      picovoxel: 'npm',
      build123d: 'pypi',
      smlibpy: 'pypi',
      openscad: 'none',
      replicad: 'npm',
      manifold: 'npm',
      zoo: 'kcl',
      jscad: 'npm',
      opencascadejs: 'npm',
      smlib: 'npm',
      tscircuit: 'npm',
    });
    for (const { language, ecosystem } of kernelConfigurations) {
      expect(ecosystem === 'npm').toBe(['javascript', 'jsx', 'typescript', 'tsx'].includes(language));
    }
  });

  it('rejects engine ids as catalog ids', () => {
    // Engine ids come from `defineKernel({ id })` (e.g. `openrscad` for `.scad`,
    // `opencascade` for the OCCT kernel) and never appear in this catalog.
    expect(isKernelId('openrscad')).toBe(false);
    expect(isKernelId('opencascade')).toBe(false);
    expect(isKernelId('tau')).toBe(false);
  });
});
