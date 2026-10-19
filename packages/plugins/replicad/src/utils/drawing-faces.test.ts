import { describe, expect, it, vi } from 'vitest';
import { drawingFaces, isClosedDrawing } from '#utils/drawing-faces.js';

const closedLeaf = { curves: [], isClosed: () => true };

describe('drawingFaces', () => {
  it('should take the face of a compound sketch, which has no faces method, and delete the sketch', () => {
    const face = { kind: 'face' };
    const sketch = { face: vi.fn(() => face), delete: vi.fn() };
    const compound = { blueprints: [closedLeaf, closedLeaf], sketchOnPlane: () => sketch };

    expect(isClosedDrawing(compound)).toBe(true);
    expect(drawingFaces(compound)).toBe(face);
    expect(sketch.delete).toHaveBeenCalledOnce();
  });

  it('should prefer faces when a sketch has both', () => {
    const faces = { kind: 'faces' };
    const sketch = { faces: () => faces, face: vi.fn(), delete: vi.fn() };
    expect(drawingFaces({ ...closedLeaf, sketchOnPlane: () => sketch })).toBe(faces);
    expect(sketch.face).not.toHaveBeenCalled();
  });
});
