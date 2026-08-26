// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraView } from '@taucad/camera';
import { createThreeCameraRig } from '@taucad/three/camera';
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

  it('keeps fully opaque on-screen grid samples inside both endpoint camera depth ranges', () => {
    const { material } = createInfiniteGridGlMaterial();
    const distanceMultiplier = Number(material.uniforms['uGridDistanceMultiplier']!.value);
    const fadeStart = Number(material.uniforms['uFadeStart']!.value);
    const rig = createThreeCameraRig({
      initialView: createCameraView({
        requestedVerticalFieldOfView: 60,
        target: [0, 0, 0],
        direction: [1, -1, 0.7],
        up: [0, 0, 1],
        verticalSpan: 600,
        viewport: { width: 1536, height: 900, pixelRatio: 2 },
        bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
      }),
    });
    rig.actorRef.start();
    rig.setClipPlanes({
      near: 1e-3,
      minimumPerspectiveFar: 10_000_000_000,
      orthographicFarMultiplier: 5,
    });

    expect(rig.orthographicCamera.far).toBeLessThan(rig.perspectiveCamera.far);

    for (const camera of [rig.perspectiveCamera, rig.orthographicCamera]) {
      const cameraDistance = camera.position.length();
      const planarCameraDirection = new THREE.Vector3(camera.position.x, camera.position.y, 0).normalize();
      const samples = [
        planarCameraDirection.clone().multiplyScalar(-cameraDistance * distanceMultiplier * fadeStart * 0.7),
        planarCameraDirection.clone().multiplyScalar(cameraDistance * distanceMultiplier * fadeStart * 0.4),
      ];

      for (const sample of samples) {
        const projected = sample.project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
        expect(projected.z).toBeGreaterThanOrEqual(-1);
        expect(projected.z).toBeLessThanOrEqual(1);
      }
    }

    rig.dispose();
    material.dispose();
  });
});
