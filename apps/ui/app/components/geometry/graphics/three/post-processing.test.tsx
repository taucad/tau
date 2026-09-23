import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ enabled: true, invalidate: vi.fn(), frame: vi.fn() }));

vi.mock('@react-three/fiber', () => ({
  useFrame: mocks.frame,
  useThree: () => ({ invalidate: mocks.invalidate }),
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
  expect(mocks.invalidate).not.toHaveBeenCalled();

  mocks.enabled = false;
  view.rerender(<PostProcessing />);

  expect(mocks.invalidate).toHaveBeenCalledOnce();
  expect(mocks.frame).toHaveBeenCalledWith(expect.any(Function), 1);
});
