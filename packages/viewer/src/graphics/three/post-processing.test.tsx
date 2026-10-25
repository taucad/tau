import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NeutralToneMapping, NoToneMapping } from 'three';
import { resolveAoRadiusCssPixels } from '#graphics/three/post-processing-settings.js';

const mocks = vi.hoisted(() => ({
  backend: 'webgl' as 'webgl' | 'webgpu',
  enabled: true,
  invalidate: vi.fn(),
  frame: vi.fn(),
  gl: {
    toneMapping: 0,
    backend: { device: { adapterInfo: undefined as Record<string, unknown> | undefined } },
  },
  webGpuProperties: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: mocks.frame,
  useThree: () => ({ invalidate: mocks.invalidate, gl: mocks.gl }),
}));
vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphicsSelector: () => mocks.enabled,
}));
vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => mocks.backend,
}));
vi.mock('#graphics/three/post-processing-webgl.jsx', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- existing component export.
  PostProcessingWebGL: () => undefined,
}));
vi.mock('#graphics/three/post-processing-webgpu.jsx', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- existing component export.
  PostProcessingWebGPU: (properties: unknown) => {
    mocks.webGpuProperties(properties);
    return undefined;
  },
}));

it('keeps the chosen display transform despite a legacy disabled post-processing setting', async () => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.enabled = true;
  const view = render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
  expect(mocks.gl.toneMapping).toBe(NeutralToneMapping);
  mocks.enabled = false;
  view.rerender(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
  expect(mocks.gl.toneMapping).toBe(NeutralToneMapping);
  view.rerender(<PostProcessing settings={{ toneMapping: 'none' }} />);
  expect(mocks.gl.toneMapping).toBe(NoToneMapping);
});

it('tone-maps inside the WebGPU scene pass and keeps it mounted despite a legacy disabled post-processing setting', async () => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.enabled = false;
  mocks.frame.mockClear();
  mocks.gl.backend.device.adapterInfo = { vendor: 'apple', architecture: 'metal-3', isFallbackAdapter: false };
  render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
  // The output pass only encodes sRGB, so overlays drawn after the scene stay untone-mapped.
  expect(mocks.gl.toneMapping).toBe(NoToneMapping);
  expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
    expect.objectContaining({
      aoAllowed: true,
      toneMapping: NeutralToneMapping,
    }),
  );
  expect(mocks.frame).not.toHaveBeenCalled();
  mocks.backend = 'webgl';
  mocks.gl.backend.device.adapterInfo = undefined;
});

it('composes with AO and camera preparation on a hardware WebGPU adapter', async () => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.frame.mockClear();
  mocks.webGpuProperties.mockClear();
  mocks.gl.backend.device.adapterInfo = { vendor: 'nvidia', architecture: 'ampere', isFallbackAdapter: false };
  try {
    render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ aoAllowed: true, speculativePreparation: true, toneMapping: NeutralToneMapping }),
    );
    expect(mocks.gl.toneMapping).toBe(NoToneMapping);
    expect(mocks.frame).not.toHaveBeenCalled();
  } finally {
    mocks.backend = 'webgl';
    mocks.gl.backend.device.adapterInfo = undefined;
  }
});

it.each([
  { adapter: 'the fallback adapter', adapterInfo: { vendor: 'google', architecture: '', isFallbackAdapter: true } },
  { adapter: 'SwiftShader', adapterInfo: { vendor: 'google', architecture: 'swiftshader' } },
])('keeps a beauty-only composition with no AO or camera preparation on $adapter', async ({ adapterInfo }) => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.frame.mockClear();
  mocks.webGpuProperties.mockClear();
  mocks.gl.backend.device.adapterInfo = adapterInfo;
  try {
    render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
    // The composition still owns tone mapping and the canvas's depth; only the AO graph and speculation go.
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ aoAllowed: false, speculativePreparation: false, toneMapping: NeutralToneMapping }),
    );
    expect(mocks.gl.toneMapping).toBe(NoToneMapping);
    expect(mocks.frame).not.toHaveBeenCalled();
  } finally {
    mocks.backend = 'webgl';
    mocks.gl.backend.device.adapterInfo = undefined;
  }
});

it('should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum', () => {
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 1 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 2 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 1 })).toBe(4);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 2 })).toBe(2);
  expect(resolveAoRadiusCssPixels(12, { width: 80, height: 60, dpr: 2 })).toBe(12);
});
