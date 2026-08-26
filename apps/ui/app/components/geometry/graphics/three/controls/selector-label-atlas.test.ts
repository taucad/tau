import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BufferAttribute, Intersection } from 'three';
import { LinearMipmapLinearFilter, Mesh, Raycaster, Vector3 } from 'three';
import {
  __resetSelectorLabelAtlasForTests,
  createSelectorLabelGeometry,
  disabledSelectorLabelRaycast,
  ensureSelectorLabelAtlasReady,
  getSelectorLabelAtlasMaterial,
  getSelectorLabelAtlasTexture,
  isSelectorLabelAtlasLabel,
  selectorLabelAtlasLabels,
} from '#components/geometry/graphics/three/controls/selector-label-atlas.js';

const originalFontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');

function installFakeDocumentFonts(): void {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: vi.fn().mockResolvedValue([]),
    },
  });
}

function restoreDocumentFonts(): void {
  if (originalFontsDescriptor) {
    Object.defineProperty(document, 'fonts', originalFontsDescriptor);
    return;
  }

  Reflect.deleteProperty(document, 'fonts');
}

describe('selector-label-atlas', () => {
  beforeEach(() => {
    __resetSelectorLabelAtlasForTests();
    installFakeDocumentFonts();
  });

  afterEach(() => {
    restoreDocumentFonts();
    vi.restoreAllMocks();
  });

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

  it('should reuse one high-density atlas texture and one blended depth-compatible material', () => {
    const texture = getSelectorLabelAtlasTexture();
    const material = getSelectorLabelAtlasMaterial();

    expect(getSelectorLabelAtlasTexture()).toBe(texture);
    expect(getSelectorLabelAtlasMaterial()).toBe(material);
    expect(material.map).toBe(texture);
    expect(texture.image).toMatchObject({ width: 2048, height: 1024 });
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.anisotropy).toBe(4);
    expect(material.transparent).toBe(true);
    expect(material.alphaTest).toBe(0);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('should load Geist Mono once and redraw the shared atlas texture', async () => {
    const texture = getSelectorLabelAtlasTexture();
    const firstVersion = texture.version;
    const loadSpy = vi.spyOn(document.fonts, 'load').mockResolvedValue([]);

    await ensureSelectorLabelAtlasReady();
    await ensureSelectorLabelAtlasReady();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy.mock.calls[0]?.[0]).toContain('Geist Mono');
    expect(texture.version).toBeGreaterThan(firstVersion);
    expect(getSelectorLabelAtlasTexture()).toBe(texture);
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
    const intersections: Intersection[] = [];

    disabledSelectorLabelRaycast.call(mesh, new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1)), intersections);

    expect(intersections).toEqual([]);
  });
});
