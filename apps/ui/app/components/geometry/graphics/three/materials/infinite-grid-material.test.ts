// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createInfiniteGridGlMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';

describe('createInfiniteGridGlMaterial', () => {
  it('includes colorspace_fragment after writing gl_FragColor so WebGL matches WebGPU NodeMaterial output encoding', () => {
    const { material } = createInfiniteGridGlMaterial();
    const fragment = material.fragmentShader;

    expect(fragment).toContain('#include <colorspace_fragment>');

    const colorWriteIndex = fragment.indexOf('gl_FragColor = vec4(uColor.rgb');
    const colorspaceIncludeIndex = fragment.indexOf('#include <colorspace_fragment>');

    expect(colorWriteIndex).toBeGreaterThan(-1);
    expect(colorspaceIncludeIndex).toBeGreaterThan(-1);
    expect(colorspaceIncludeIndex).toBeGreaterThan(colorWriteIndex);
  });

  it('applyVisualOverrides mutates uniforms in place (no material rebuild)', () => {
    const initialColor = new THREE.Color(0x11_22_33);
    const { material, applyVisualOverrides } = createInfiniteGridGlMaterial({
      smallSize: 1,
      largeSize: 50,
      color: initialColor,
    });

    expect(material.uniforms['uSmallSize']!.value).toBe(1);
    expect(material.uniforms['uLargeSize']!.value).toBe(50);
    expect(material.uniforms['uColor']!.value).toBe(initialColor);

    const overrideColor = new THREE.Color(0xaa_bb_cc);
    applyVisualOverrides({
      smallSize: 2,
      largeSize: 100,
      color: overrideColor,
    });

    expect(material.uniforms['uSmallSize']!.value).toBe(2);
    expect(material.uniforms['uLargeSize']!.value).toBe(100);
    expect(material.uniforms['uColor']!.value).toBeInstanceOf(THREE.Color);
    expect((material.uniforms['uColor']!.value as THREE.Color).getHex()).toBe(0xaa_bb_cc);
  });
});
