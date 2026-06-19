import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import { LinearMipmapLinearFilter, Mesh, Raycaster, Vector3 } from 'three';
import {
  createSelectorLabelGeometry,
  disabledSelectorLabelRaycast,
  getSelectorLabelAtlasMaterial,
  getSelectorLabelAtlasTexture,
  isSelectorLabelAtlasLabel,
  selectorLabelAtlasLabels,
} from '#components/geometry/graphics/three/controls/selector-label-atlas.js';

describe('selector-label-atlas', () => {
  it('should cover every finite section selector label', () => {
    expect(selectorLabelAtlasLabels).toEqual([
      'Top',
      'Bottom',
      'Front',
      'Back',
      'Left',
      'Right',
      'XY',
      'YX',
      'XZ',
      'ZX',
      'YZ',
      'ZY',
    ]);
    expect(isSelectorLabelAtlasLabel('Top')).toBe(true);
    expect(isSelectorLabelAtlasLabel('Side')).toBe(false);
  });

  it('should reuse one high-density atlas texture and one opaque alpha-tested depth-compatible material', () => {
    const texture = getSelectorLabelAtlasTexture();
    const material = getSelectorLabelAtlasMaterial();

    expect(getSelectorLabelAtlasTexture()).toBe(texture);
    expect(getSelectorLabelAtlasMaterial()).toBe(material);
    expect(material.map).toBe(texture);
    expect(texture.image).toMatchObject({ width: 2048, height: 1024 });
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.anisotropy).toBe(4);
    expect(material.transparent).toBe(false);
    expect(material.alphaTest).toBeGreaterThan(0);
    expect(material.alphaTest).toBeLessThanOrEqual(0.001);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('should assign stable per-label UV ranges', () => {
    const topGeometry = createSelectorLabelGeometry('Top');
    const bottomGeometry = createSelectorLabelGeometry('Bottom');
    const topUv = topGeometry.getAttribute('uv') as BufferAttribute;
    const bottomUv = bottomGeometry.getAttribute('uv') as BufferAttribute;

    expect(topGeometry.userData['selectorLabel']).toBe('Top');
    expect(bottomGeometry.userData['selectorLabel']).toBe('Bottom');
    expect(topUv.getX(0)).toBe(0);
    expect(bottomUv.getX(0)).toBeGreaterThan(topUv.getX(0));
  });

  it('should create a large enough decal footprint to match the former vector label readability', () => {
    const geometry = createSelectorLabelGeometry('Front');

    geometry.computeBoundingBox();

    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.41);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(0.41);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-0.26);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(0.26);
  });

  it('should expose a non-raycastable label behavior', () => {
    const mesh = new Mesh(createSelectorLabelGeometry('XY'), getSelectorLabelAtlasMaterial());
    const intersections: unknown[] = [];

    disabledSelectorLabelRaycast.call(mesh, new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1)), intersections);

    expect(intersections).toEqual([]);
  });
});
