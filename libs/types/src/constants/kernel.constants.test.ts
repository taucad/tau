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
