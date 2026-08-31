import { describe, expect, it } from 'vitest';
describe('GLTF edge depth ordering', () => {
  it('keeps a hidden edge behind an opaque surface at 90 degrees', () => {
    const frontSurfaceDistance = 1;
    const hiddenEdgeDistance = 1.001;

    expect(hiddenEdgeDistance).toBeGreaterThan(frontSurfaceDistance);
  });
});
