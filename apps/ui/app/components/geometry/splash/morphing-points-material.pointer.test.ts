// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createMorphingPointsMaterial,
  updateMorphPointer,
} from '#components/geometry/splash/morphing-points-material.js';
import { createMorphingPointsNodeMaterial } from '#components/geometry/splash/morphing-points-material.node.js';

describe('morphing points pointer uniforms', () => {
  it('should default the WebGL material to an inert pointer (strength 0)', () => {
    const material = createMorphingPointsMaterial();

    expect(material.uniforms['uPointerStrength']?.value).toBe(0);
    expect(material.uniforms['uPointer']?.value).toBeInstanceOf(THREE.Vector3);
    expect(material.uniforms['uPointerRadius']?.value).toBeGreaterThan(0);
  });

  it('should copy the pointer position and strength into the WebGL uniforms', () => {
    const material = createMorphingPointsMaterial();

    updateMorphPointer(material, new THREE.Vector3(1, 2, 3), 5);

    const pointer = material.uniforms['uPointer']?.value as THREE.Vector3;
    expect([pointer.x, pointer.y, pointer.z]).toEqual([1, 2, 3]);
    expect(material.uniforms['uPointerStrength']?.value).toBe(5);
  });

  it('should expose pointer uniform handles on the WebGPU node material', () => {
    const { handles } = createMorphingPointsNodeMaterial();

    expect(handles.uPointer).toBeDefined();
    expect(handles.uPointerStrength).toBeDefined();
    expect(handles.uPointerRadius).toBeDefined();
    expect(handles.uPointerStrength.value).toBe(0);
  });
});
