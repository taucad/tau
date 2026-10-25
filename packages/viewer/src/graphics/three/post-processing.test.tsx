import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NeutralToneMapping, NoToneMapping } from 'three';
import { resolveAoRadiusCssPixels } from '#graphics/three/post-processing-settings.js';

type MockBackend = {
  device: { adapterInfo: Record<string, unknown> | undefined } | undefined;
  gl: { getExtension: (name: string) => unknown; getParameter: (parameter: number) => unknown } | undefined;
};

const mocks = vi.hoisted(() => {
  const backend: MockBackend = { device: { adapterInfo: undefined }, gl: undefined };
  return {
    backend: 'webgl' as 'webgl' | 'webgpu',
    enabled: true,
    invalidate: vi.fn(),
    frame: vi.fn(),
    gl: { toneMapping: 0, backend },
    webGpuProperties: vi.fn(),
  };
});

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
  mocks.gl.backend.device!.adapterInfo = { vendor: 'apple', architecture: 'metal-3', isFallbackAdapter: false };
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
  mocks.gl.backend.device!.adapterInfo = undefined;
});

it('composes with AO and camera preparation on a hardware WebGPU adapter', async () => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.frame.mockClear();
  mocks.webGpuProperties.mockClear();
  mocks.gl.backend.device!.adapterInfo = { vendor: 'nvidia', architecture: 'ampere', isFallbackAdapter: false };
  try {
    render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aoAllowed: true,
        speculativePreparation: true,
        antialiasAllowed: true,
        toneMapping: NeutralToneMapping,
      }),
    );
    expect(mocks.gl.toneMapping).toBe(NoToneMapping);
    expect(mocks.frame).not.toHaveBeenCalled();
  } finally {
    mocks.backend = 'webgl';
    mocks.gl.backend.device!.adapterInfo = undefined;
  }
});

it('composes with AO and camera preparation when the device reports no adapter identity', async () => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.webGpuProperties.mockClear();
  mocks.gl.backend.device!.adapterInfo = undefined;
  try {
    render(<PostProcessing />);
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({ aoAllowed: true, speculativePreparation: true }),
    );
  } finally {
    mocks.backend = 'webgl';
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
  mocks.gl.backend.device!.adapterInfo = adapterInfo;
  try {
    render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
    // The composition still owns tone mapping and the canvas's depth; the AO graph, speculation and FXAA go.
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aoAllowed: false,
        speculativePreparation: false,
        antialiasAllowed: false,
        toneMapping: NeutralToneMapping,
      }),
    );
    expect(mocks.gl.toneMapping).toBe(NoToneMapping);
    expect(mocks.frame).not.toHaveBeenCalled();
  } finally {
    mocks.backend = 'webgl';
    mocks.gl.backend.device!.adapterInfo = undefined;
  }
});

it.each([
  {
    rasterizer: 'SwiftShader WebGL',
    renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    software: true,
  },
  { rasterizer: 'Mesa llvmpipe', renderer: 'llvmpipe (LLVM 17.0.6, 256 bits)', software: true },
  { rasterizer: 'a hardware GPU', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11)', software: false },
])('composes for $rasterizer on the node renderer WebGL 2 backend', async ({ renderer, software }) => {
  const { PostProcessing } = await import('#graphics/three/post-processing.jsx');
  mocks.backend = 'webgpu';
  mocks.webGpuProperties.mockClear();
  const { device } = mocks.gl.backend;
  mocks.gl.backend.device = undefined;
  mocks.gl.backend.gl = {
    getExtension: () => ({ UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 }),
    getParameter: (parameter) => (parameter === 1 ? 'Google Inc.' : renderer),
  };
  try {
    render(<PostProcessing />);
    expect(mocks.webGpuProperties).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aoAllowed: !software,
        speculativePreparation: !software,
        antialiasAllowed: !software,
      }),
    );
  } finally {
    mocks.backend = 'webgl';
    mocks.gl.backend.device = device;
    mocks.gl.backend.gl = undefined;
  }
});

it('should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum', () => {
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 1 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 2 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 1 })).toBe(4);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 2 })).toBe(2);
  expect(resolveAoRadiusCssPixels(12, { width: 80, height: 60, dpr: 2 })).toBe(12);
});
