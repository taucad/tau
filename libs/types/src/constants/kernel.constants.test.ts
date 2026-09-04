import { describe, expect, it } from 'vitest';
import { isKernelId, kernelConfigurations, languageFromKernel } from '#constants/kernel.constants.js';

describe('kernel configuration identity', () => {
  it('should expose PicoGK as a native C# desktop offering', () => {
    const configuration = kernelConfigurations.find(({ id }) => id === 'picogk');
    expect(configuration).toMatchObject({
      language: 'csharp',
      mainFile: 'main.cs',
      requiresRuntimeKernelId: 'picogk',
      requiresNativeCodeTrust: true,
    });
    expect(configuration?.emptyCode).toContain('public static class Params');
    expect(configuration?.emptyCode).toContain('[Range(0.05, 5.0)]');
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
