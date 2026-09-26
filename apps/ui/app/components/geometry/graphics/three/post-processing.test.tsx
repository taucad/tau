import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NeutralToneMapping, NoToneMapping } from 'three';
import { resolveAoRadiusCssPixels } from '#components/geometry/graphics/three/post-processing-settings.js';

const mocks = vi.hoisted(() => ({ enabled: true, invalidate: vi.fn(), frame: vi.fn(), gl: { toneMapping: 0 } }));

vi.mock('@react-three/fiber', () => ({
  useFrame: mocks.frame,
  useThree: () => ({ invalidate: mocks.invalidate, gl: mocks.gl }),
}));
vi.mock('#hooks/use-graphics.js', () => ({ useGraphicsSelector: () => mocks.enabled }));
vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));
vi.mock('#components/geometry/graphics/three/post-processing-webgl.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- existing component export.
  PostProcessingWebGL: () => undefined,
}));
vi.mock('#components/geometry/graphics/three/post-processing-webgpu.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- existing component export.
  PostProcessingWebGPU: () => undefined,
}));

it('requests a fresh demand frame when disabling AO without moving the camera', async () => {
  const { PostProcessing } = await import('#components/geometry/graphics/three/post-processing.js');
  const view = render(<PostProcessing />);
  mocks.invalidate.mockClear();

  mocks.enabled = false;
  view.rerender(<PostProcessing />);

  expect(mocks.invalidate).toHaveBeenCalledOnce();
  expect(mocks.frame).toHaveBeenCalledWith(expect.any(Function), 1);
});

it('keeps the chosen display transform when AO is disabled', async () => {
  const { PostProcessing } = await import('#components/geometry/graphics/three/post-processing.js');
  mocks.enabled = true;
  const view = render(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
  expect(mocks.gl.toneMapping).toBe(NeutralToneMapping);
  mocks.enabled = false;
  view.rerender(<PostProcessing settings={{ toneMapping: 'neutral' }} />);
  expect(mocks.gl.toneMapping).toBe(NeutralToneMapping);
  view.rerender(<PostProcessing settings={{ toneMapping: 'none' }} />);
  expect(mocks.gl.toneMapping).toBe(NoToneMapping);
});

it('should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum', () => {
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 1 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 800, height: 600, dpr: 2 })).toBe(10);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 1 })).toBe(4);
  expect(resolveAoRadiusCssPixels('viewport', { width: 80, height: 60, dpr: 2 })).toBe(2);
  expect(resolveAoRadiusCssPixels(12, { width: 80, height: 60, dpr: 2 })).toBe(12);
});
