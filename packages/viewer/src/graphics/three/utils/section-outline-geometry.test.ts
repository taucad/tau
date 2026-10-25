import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import {
  createSectionOutlineGeometry,
  createSectionOutlineGeometryCache,
} from '#graphics/three/utils/section-outline-geometry.js';

const sourceGeometry = (): BufferGeometry =>
  new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2], 3))
    .setAttribute(
      'normal',
      new Float32BufferAttribute(
        Array.from({ length: 12 }, () => 0.5),
        3,
      ),
    )
    .setIndex([0, 1, 2, 0, 3, 1]);

describe('section outline triangle geometry', () => {
  it('should preserve every triangle position and winding with constant geometric normals', () => {
    const source = sourceGeometry();
    const original = source.toJSON();
    const geometry = createSectionOutlineGeometry(source);
    try {
      expect(geometry.index).toBeNull();
      expect(Object.keys(geometry.attributes)).toEqual(['position', 'normal']);
      for (let triangle = 0; triangle < 2; triangle++) {
        for (let corner = 0; corner < 3; corner++) {
          const vertex = triangle * 3 + corner;
          expect(new Vector3().fromBufferAttribute(geometry.getAttribute('position'), vertex)).toEqual(
            new Vector3().fromBufferAttribute(source.getAttribute('position'), source.index!.getX(vertex)),
          );
          expect(new Vector3().fromBufferAttribute(geometry.getAttribute('normal'), vertex).toArray()).toEqual(
            triangle === 0 ? [0, 0, 1] : [0, 1, 0],
          );
        }
      }
      expect(source.toJSON()).toEqual(original);
    } finally {
      geometry.dispose();
      source.dispose();
    }
  });
  it('should reuse buffers for transforms and draw ranges and retire only owned revisions', () => {
    const source = sourceGeometry();
    const sourceDispose = vi.spyOn(source, 'dispose');
    const cache = createSectionOutlineGeometryCache();
    const initial = cache.get(source);
    const firstDispose = vi.spyOn(initial, 'dispose');
    cache.retireUnused();
    source.setDrawRange(3, 3);
    expect(cache.get(source)).toBe(initial);
    expect(initial.drawRange).toEqual({ start: 3, count: 3 });
    cache.retireUnused();
    source.getAttribute('position').setZ(3, 3);
    source.getAttribute('position').needsUpdate = true;
    const revised = cache.get(source);
    expect(revised).not.toBe(initial);
    expect(firstDispose).toHaveBeenCalledOnce();
    const revisedDispose = vi.spyOn(revised, 'dispose');
    cache.retireUnused();
    expect(revisedDispose).not.toHaveBeenCalled();
    cache.retireUnused();
    expect(revisedDispose).toHaveBeenCalledOnce();
    cache.dispose();
    expect(revisedDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    source.dispose();
  });
});
