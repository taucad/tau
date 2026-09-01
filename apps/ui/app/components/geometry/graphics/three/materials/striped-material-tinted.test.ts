// @vitest-environment node
import { describe, expect, it, afterEach } from 'vitest';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  createTintedStripedMaterial,
  disposeTintedStripedMaterialCache,
} from '#components/geometry/graphics/three/materials/striped-material-tinted.js';

afterEach(() => {
  disposeTintedStripedMaterialCache();
});

describe('createTintedStripedMaterial', () => {
  it('returns the same material instance for a cache hit', () => {
    const parameters = { tintColor: 0xff_33_66, stripeFrequency: 2.5, stripeWidth: 0.15 };
    const first = createTintedStripedMaterial('webgl', parameters);
    const second = createTintedStripedMaterial('webgl', parameters);
    expect(second).toBe(first);
  });

  it('returns a fresh instance after the cache is disposed', () => {
    const parameters = { tintColor: 0x00_aa_ff, stripeFrequency: 1.8, stripeWidth: 0.3 };
    const first = createTintedStripedMaterial('webgl', parameters);
    disposeTintedStripedMaterialCache();
    const second = createTintedStripedMaterial('webgl', parameters);
    expect(second).not.toBe(first);
  });

  it('selects the WebGPU node material when backend is webgpu', () => {
    const material = createTintedStripedMaterial('webgpu', {
      tintColor: 0xcc_cc_cc,
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });
    expect(material).toBeInstanceOf(MeshBasicNodeMaterial);
  });
});
