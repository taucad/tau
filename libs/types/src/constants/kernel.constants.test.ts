import { describe, expect, it } from 'vitest';
import { isKernelId, kernelConfigurations, kernelProviders, languageFromKernel } from '#constants/kernel.constants.js';

describe('kernel configuration identity', () => {
  it('routes the OpenSCAD language through exactly one OpenRSCAD engine', () => {
    const scadKernels = kernelConfigurations.filter(({ language }) => language === 'openscad');

    expect(scadKernels.map(({ id }) => id)).toEqual(['openrscad']);
    expect(languageFromKernel.openrscad).toBe('openscad');
    expect(kernelProviders).not.toContain('openscad');
    expect(isKernelId('openscad')).toBe(false);
  });
});
