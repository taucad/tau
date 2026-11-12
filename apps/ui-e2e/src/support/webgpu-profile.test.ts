import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { classifyWebGpuAdapter, resolveRequiredWebGpuProfile, webGpuLaunchArguments } from './webgpu-profile.ts';

describe('WebGPU E2E profiles', () => {
  it('defaults local execution to required hardware WebGPU', () => {
    expect(resolveRequiredWebGpuProfile(undefined)).toBe('hardware');
  });

  it('accepts only the required software and hardware profiles', () => {
    expect(resolveRequiredWebGpuProfile('software')).toBe('software');
    expect(resolveRequiredWebGpuProfile('hardware')).toBe('hardware');
    expect(() => resolveRequiredWebGpuProfile('metal')).toThrow(
      "TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'",
    );
    expect(() => resolveRequiredWebGpuProfile('disabled')).toThrow(
      "TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'",
    );
  });

  it('maps every profile to the exact minimal managed-Chromium arguments', () => {
    expect(webGpuLaunchArguments('software')).toEqual(['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader']);
    expect(webGpuLaunchArguments('hardware')).toEqual(['--enable-unsafe-webgpu']);
    expect(webGpuLaunchArguments('disabled')).toEqual(['--disable-features=WebGPUService']);
  });

  it('classifies software, hardware, and ambiguous adapters from explicit fields', () => {
    expect(
      classifyWebGpuAdapter({
        architecture: 'swiftshader',
        description: '',
        device: '',
        fallback: undefined,
        vendor: 'google',
      }),
    ).toBe('software');
    expect(
      classifyWebGpuAdapter({
        architecture: 'metal-3',
        description: '',
        device: '',
        fallback: undefined,
        vendor: 'apple',
      }),
    ).toBe('hardware');
    expect(
      classifyWebGpuAdapter({ architecture: '', description: '', device: '', fallback: undefined, vendor: '' }),
    ).toBe('ambiguous');
  });
});
