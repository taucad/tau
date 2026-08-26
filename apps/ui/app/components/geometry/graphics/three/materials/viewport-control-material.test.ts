import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import {
  createViewportControlBodyMaterial,
  createViewportControlLabelMaterial,
  createViewportControlSelfOccludingBodyMaterial,
  createViewportControlSelectorLabelMaterial,
  setViewportControlMaterialOpacity,
} from '#components/geometry/graphics/three/materials/viewport-control-material.js';

describe('viewport-control-material', () => {
  it('should create opaque vertex-colored matcap material for control bodies', () => {
    const material = createViewportControlBodyMaterial({ matcap: new Texture() });

    expect(material.vertexColors).toBe(true);
    expect(material.color.getHexString()).toBe('ffffff');
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
  });

  it('should create self-occluding opaque vertex-colored matcap material for selector bodies', () => {
    const material = createViewportControlSelfOccludingBodyMaterial({ matcap: new Texture() });

    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(material.toneMapped).toBe(false);
  });

  it('should only enter the transparent render path below full opacity', () => {
    const material = createViewportControlBodyMaterial({ matcap: new Texture() });

    setViewportControlMaterialOpacity(material, 0.25);
    expect(material.opacity).toBe(0.25);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);

    setViewportControlMaterialOpacity(material, 1);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(false);
  });

  it('should create transparent depth-disabled basic material for overlay labels', () => {
    const material = createViewportControlLabelMaterial({ map: new Texture() });

    expect(material.transparent).toBe(true);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
  });

  it('should create blended depth-compatible basic material for selector labels', () => {
    const material = createViewportControlSelectorLabelMaterial({ map: new Texture() });

    expect(material.transparent).toBe(true);
    expect(material.alphaTest).toBe(0);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
  });
});
