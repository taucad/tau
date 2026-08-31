// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createInfiniteGridGlMaterial } from '#components/geometry/graphics/three/materials/infinite-grid-material.js';
import {
  infiniteGridFadeEndRatio,
  infiniteGridFadeStartRatio,
} from '#components/geometry/graphics/three/utils/infinite-grid-frame.js';

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
      lineOpacity: 0.7,
      gridDistance: 800,
      planeOffset: -42,
      smallPhase: [0.25, 0.75],
      largePhase: [0.125, 0.625],
    });

    expect(material.uniforms['uSmallSize']!.value).toBe(2);
    expect(material.uniforms['uLargeSize']!.value).toBe(100);
    expect(material.uniforms['uColor']!.value).toBeInstanceOf(THREE.Color);
    expect((material.uniforms['uColor']!.value as THREE.Color).getHex()).toBe(0xaa_bb_cc);
    expect(material.uniforms['uLineOpacity']!.value).toBe(0.7);
    expect(material.uniforms['uGridDistance']!.value).toBe(800);
    expect(material.uniforms['uPlaneOffset']!.value).toBe(-42);
    expect((material.uniforms['uSmallPhase']!.value as THREE.Vector2).toArray()).toEqual([0.25, 0.75]);
    expect((material.uniforms['uLargePhase']!.value as THREE.Vector2).toArray()).toEqual([0.125, 0.625]);
  });

  it('uses backend depth bias instead of displacing the physical plane', () => {
    const { material } = createInfiniteGridGlMaterial();

    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(1);
    expect(material.polygonOffsetUnits).toBe(1);
    expect(material.uniforms).not.toHaveProperty('uNormalOffset');
    expect(material.vertexShader).not.toContain('uNormalOffset');
  });

  it('centres the proxy in one render-world coordinate frame', () => {
    const { material } = createInfiniteGridGlMaterial();

    expect(material.vertexShader).toContain('renderPlanePosition = cameraPlane + position.xy * uGridDistance');
    expect(material.vertexShader).toContain('projectionMatrix * viewMatrix * vec4(renderPosition, 1.0)');
    expect(material.fragmentShader).not.toContain('distance(cameraPlane, renderPlanePosition)');
    expect(material.vertexShader).not.toContain('modelViewMatrix');
    expect(material.fragmentShader).not.toContain('length(cameraPosition)');
  });

  it('fades radially before the camera-sized proxy boundary and renders a double-sided plane in one pass', () => {
    const { material } = createInfiniteGridGlMaterial();

    expect(material.uniforms['uFadeStart']!.value).toBe(infiniteGridFadeStartRatio);
    expect(material.uniforms['uFadeEnd']!.value).toBe(infiniteGridFadeEndRatio);
    expect(material.fragmentShader).toContain('float radialDistanceRatio = length(gridProxyPosition)');
    expect(material.fragmentShader).toContain('1.0 - smoothstep(uFadeStart, uFadeEnd, radialDistanceRatio)');
    expect(material.fragmentShader).toContain('grid * fadeFactor * uLineOpacity');
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.forceSinglePass).toBe(true);
  });

  it('derives the camera-plane footprint once and scales it for both grid levels', () => {
    const { material } = createInfiniteGridGlMaterial();

    expect(material.fragmentShader.match(/dFdx\(renderPlanePosition\)/g)).toHaveLength(1);
    expect(material.fragmentShader.match(/dFdy\(renderPlanePosition\)/g)).toHaveLength(1);
    expect(material.fragmentShader).toContain('planeDeriv / uSmallSize');
    expect(material.fragmentShader).toContain('planeDeriv / uLargeSize');
  });
});
