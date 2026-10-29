import { describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { pixelsToWorldUnits } from '#graphics/three/utils/spatial.utils.js';

describe('CSS pixel radius in render units', () => {
  it.each([
    { height: 384, zoom: 1, expected: 0.25 },
    { height: 768, zoom: 1, expected: 0.125 },
    { height: 384, zoom: 2, expected: 0.125 },
  ])('uses the actual orthographic span at height $height and zoom $zoom', ({ height, zoom, expected }) => {
    const camera = new OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    // R3F assumes a pixel-sized orthographic frustum; Tau owns a world-sized one.
    const getCurrentViewport = vi.fn(() => ({
      width: height / zoom,
      height: height / zoom,
    }));
    expect(
      pixelsToWorldUnits({
        camera,
        viewport: { getCurrentViewport },
        size: { width: height, height },
        at: new Vector3(),
        pixels: 24,
      }),
    ).toBeCloseTo(expected);
    expect(getCurrentViewport).not.toHaveBeenCalled();
  });

  it('preserves the perspective target-depth conversion', () => {
    const camera = new PerspectiveCamera(45, 1, 0.1, 10);
    const at = new Vector3(0, 0, -4);
    const getCurrentViewport = vi.fn(() => ({ width: 4, height: 4 }));
    expect(
      pixelsToWorldUnits({
        camera,
        viewport: { getCurrentViewport },
        size: { width: 384, height: 384 },
        at,
        pixels: 24,
      }),
    ).toBe(0.25);
    expect(getCurrentViewport).toHaveBeenCalledWith(camera, at);
  });
});
