import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createRenderer: vi.fn(async (): Promise<never> => {
    throw new Error('The WebGPU canvas could not present a frame: Device was destroyed.');
  }),
}));

vi.mock('@taucad/viewer/graphics/three/renderer', () => ({ createRenderer: hoisted.createRenderer }));

const { createMetalMorphLoader } = await import('#components/geometry/loader/metal-morph-controller.js');
const { createGlassPrismLoader } = await import('#components/geometry/loader/glass-prism-controller.js');

describe('showcase loader controllers', () => {
  it.each([
    ['metal morph', createMetalMorphLoader],
    ['glass prism', createGlassPrismLoader],
  ] as const)(
    'should ask the %s renderer for a presented canvas, so a WebGPU canvas that cannot present fails its start',
    async (_name, create) => {
      hoisted.createRenderer.mockClear();
      const canvas = document.createElement('canvas');

      const controller = create({ canvas, backend: 'webgpu', theme: 'dark' });

      await expect(controller.ready).rejects.toThrow('could not present a frame');
      expect(hoisted.createRenderer).toHaveBeenCalledWith(
        'showcase',
        'webgpu',
        expect.objectContaining({ canvas, presented: true }),
      );
      controller.dispose();
    },
  );
});
