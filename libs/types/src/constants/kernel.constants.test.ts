import { describe, expect, it } from 'vitest';
import { isKernelId, kernelConfigurations, languageFromKernel } from '#constants/kernel.constants.js';

describe('kernel configuration identity', () => {
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

  it('presents exactly one OpenSCAD-language kernel with engine-independent copy', () => {
    const scadKernels = kernelConfigurations.filter(({ language }) => language === 'openscad');

    expect(scadKernels).toHaveLength(1);
    expect(scadKernels[0]?.id).toBe('openscad');
    expect(scadKernels[0]?.name).toBe('OpenSCAD');
    expect(scadKernels[0]?.mainFile).toBe('main.scad');
    expect(languageFromKernel.openscad).toBe('openscad');
  });

  it('rejects engine ids as catalog ids', () => {
    // Engine ids come from `defineKernel({ id })` (e.g. `openrscad` for `.scad`,
    // `opencascade` for the OCCT kernel) and never appear in this catalog.
    expect(isKernelId('openrscad')).toBe(false);
    expect(isKernelId('opencascade')).toBe(false);
    expect(isKernelId('tau')).toBe(false);
  });
});
