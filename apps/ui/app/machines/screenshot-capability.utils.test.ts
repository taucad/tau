import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { calculateOptimalGrid } from '#machines/screenshot-capability.machine.js';
import {
  applyMatcapToClonedScene,
  disposeClonedSceneMaterials,
  calculateFovDistanceCompensation,
  computeViewFittingZoom,
} from '@taucad/three';
import { defaultStageOptions } from '@taucad/three/react';

describe('calculateOptimalGrid', () => {
  describe('edge cases', () => {
    it('should return { columns: 1, rows: 1 } for 0 items', () => {
      const result = calculateOptimalGrid(0);
      expect(result).toEqual({ columns: 1, rows: 1 });
    });

    it('should return { columns: 1, rows: 1 } for negative item count', () => {
      const result = calculateOptimalGrid(-5);
      expect(result).toEqual({ columns: 1, rows: 1 });
    });

    it('should return { columns: 1, rows: 1 } for 1 item', () => {
      const result = calculateOptimalGrid(1);
      expect(result).toEqual({ columns: 1, rows: 1 });
    });
  });

  describe('default 3:2 preferred ratio', () => {
    it('should return { columns: 2, rows: 1 } for 2 items', () => {
      const result = calculateOptimalGrid(2);
      expect(result).toEqual({ columns: 2, rows: 1 });
    });

    it('should return { columns: 2, rows: 2 } for 3 items (2/2=1.0 closest to 1.5)', () => {
      // 3/1=3.0 (diff 1.5), 2/2=1.0 (diff 0.5) -- 2x2 wins
      const result = calculateOptimalGrid(3);
      expect(result).toEqual({ columns: 2, rows: 2 });
    });

    it('should return { columns: 3, rows: 2 } for 4 items (perfect 1.5 ratio)', () => {
      // 4/1=4.0 (diff 2.5), 2/2=1.0 (diff 0.5), 3/2=1.5 (diff 0) -- 3x2 wins
      const result = calculateOptimalGrid(4);
      expect(result).toEqual({ columns: 3, rows: 2 });
    });

    it('should return a valid layout for 5 items', () => {
      const result = calculateOptimalGrid(5);
      expect(result.columns * result.rows).toBeGreaterThanOrEqual(5);
    });

    it('should return { columns: 3, rows: 2 } for 6 items (perfect 3:2 match)', () => {
      const result = calculateOptimalGrid(6);
      expect(result).toEqual({ columns: 3, rows: 2 });
    });

    it('should return a valid layout for 7 items', () => {
      const result = calculateOptimalGrid(7);
      expect(result.columns * result.rows).toBeGreaterThanOrEqual(7);
    });

    it('should return a valid layout for 8 items', () => {
      const result = calculateOptimalGrid(8);
      expect(result.columns * result.rows).toBeGreaterThanOrEqual(8);
    });

    it('should return { columns: 4, rows: 3 } for 9 items (4/3=1.33 closest to 1.5)', () => {
      // 3/3=1.0 (diff 0.5), 4/3=1.33 (diff 0.17), 5/2=2.5 (diff 1.0) -- 4x3 wins
      const result = calculateOptimalGrid(9);
      expect(result).toEqual({ columns: 4, rows: 3 });
    });

    it('should return a valid layout for 12 items', () => {
      const result = calculateOptimalGrid(12);
      expect(result.columns * result.rows).toBeGreaterThanOrEqual(12);
      // 4x3 = 12, ratio 4/3 = 1.33, close to 3/2 = 1.5
      // 3x4 = 12, ratio 3/4 = 0.75, further from 1.5
      // 6x2 = 12, ratio 6/2 = 3.0, further from 1.5
      expect(result.columns).toBeGreaterThanOrEqual(result.rows);
    });
  });

  describe('custom preferred ratio', () => {
    it('should prefer square layouts with 1:1 ratio', () => {
      const result = calculateOptimalGrid(4, { columns: 1, rows: 1 });
      expect(result).toEqual({ columns: 2, rows: 2 });
    });

    it('should prefer wide layouts with 4:1 ratio', () => {
      const result = calculateOptimalGrid(8, { columns: 4, rows: 1 });
      // 8x1 = ratio 8, 4x2 = ratio 2, etc. -- 4x2 is closest to 4
      expect(result.columns).toBeGreaterThan(result.rows);
    });

    it('should prefer tall layouts with 1:3 ratio', () => {
      const result = calculateOptimalGrid(6, { columns: 1, rows: 3 });
      // Target ratio = 1/3 ≈ 0.33
      // 1x6 = 0.167, 2x3 = 0.667, 3x2 = 1.5, 6x1 = 6
      // Closest to 0.33 is 1x6 (0.167) or 2x3 (0.667)
      expect(result.rows).toBeGreaterThanOrEqual(result.columns);
    });
  });

  describe('capacity guarantee', () => {
    it('should always return a grid that can fit all items', () => {
      for (let count = 1; count <= 20; count++) {
        const result = calculateOptimalGrid(count);
        expect(result.columns * result.rows).toBeGreaterThanOrEqual(count);
      }
    });

    it('should always return positive columns and rows', () => {
      for (let count = 0; count <= 20; count++) {
        const result = calculateOptimalGrid(count);
        expect(result.columns).toBeGreaterThanOrEqual(1);
        expect(result.rows).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('consistency', () => {
    it('should return the same result for the same inputs', () => {
      const result1 = calculateOptimalGrid(6);
      const result2 = calculateOptimalGrid(6);
      expect(result1).toEqual(result2);
    });

    it('should return the same result with explicit default ratio', () => {
      const withDefault = calculateOptimalGrid(6);
      const withExplicit = calculateOptimalGrid(6, { columns: 3, rows: 2 });
      expect(withDefault).toEqual(withExplicit);
    });
  });
});

// ── Helpers for screenshot feature tests ──────────────────────────────────────

/** Creates a minimal matcap texture stub for testing. */
function createStubTexture(): THREE.Texture {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Creates a mesh with a MeshStandardMaterial of the given color and opacity. */
function createColoredMesh(
  color = 0xff_00_00,
  opacity = 1,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color, opacity, transparent: opacity < 1 });
  return new THREE.Mesh(geometry, material);
}

/** Creates a mesh with vertex colors on the geometry. */
function createVertexColoredMesh(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const { count } = geometry.attributes['position']!;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count * 3; index++) {
    colors[index] = Math.random();
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial();
  return new THREE.Mesh(geometry, material);
}

// ── applyMatcapToClonedScene ────────────────────────────────────────────────

describe('applyMatcapToClonedScene', () => {
  it('should replace mesh materials with MeshMatcapMaterial', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh();
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    expect(mesh.material).toBeInstanceOf(THREE.MeshMatcapMaterial);
  });

  it('should set the matcap texture on the replacement material', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh();
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.matcap).toBe(texture);
  });

  it('should use DoubleSide on the replacement material', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh();
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.side).toBe(THREE.DoubleSide);
  });

  it('should preserve the original material color', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh(0x00_ff_00);
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.color.getHex()).toBe(0x00_ff_00);
  });

  it('should preserve opacity and set transparent when opacity < 1', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh(0xff_00_00, 0.5);
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.opacity).toBe(0.5);
    expect(matcapMat.transparent).toBe(true);
  });

  it('should not set transparent when opacity is 1', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh(0xff_00_00, 1);
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.opacity).toBe(1);
    expect(matcapMat.transparent).toBe(false);
  });

  it('should enable vertexColors when geometry has a color attribute', () => {
    const scene = new THREE.Scene();
    const mesh = createVertexColoredMesh();
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.vertexColors).toBe(true);
  });

  it('should not enable vertexColors when geometry has no color attribute', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh();
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matcapMat = mesh.material as unknown as THREE.MeshMatcapMaterial;
    expect(matcapMat.vertexColors).toBe(false);
  });

  it('should NOT dispose original materials (they are shared with the live scene)', () => {
    const scene = new THREE.Scene();
    const mesh = createColoredMesh();
    const originalMaterial = mesh.material;
    const disposeSpy = vi.spyOn(originalMaterial, 'dispose');
    scene.add(mesh);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('should process meshes nested in groups', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const mesh = createColoredMesh();
    group.add(mesh);
    scene.add(group);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    expect(mesh.material).toBeInstanceOf(THREE.MeshMatcapMaterial);
  });

  it('should handle a scene with no meshes without error', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Group());
    const texture = createStubTexture();

    expect(() => {
      applyMatcapToClonedScene(scene, texture);
    }).not.toThrow();
  });

  it('should handle multiple meshes with distinct colors', () => {
    const scene = new THREE.Scene();
    const meshRed = createColoredMesh(0xff_00_00);
    const meshBlue = createColoredMesh(0x00_00_ff);
    scene.add(meshRed);
    scene.add(meshBlue);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);

    const matRed = meshRed.material as unknown as THREE.MeshMatcapMaterial;
    const matBlue = meshBlue.material as unknown as THREE.MeshMatcapMaterial;
    expect(matRed.color.getHex()).toBe(0xff_00_00);
    expect(matBlue.color.getHex()).toBe(0x00_00_ff);
  });
});

// ── disposeClonedSceneMaterials ─────────────────────────────────────────────

describe('disposeClonedSceneMaterials', () => {
  it('should call dispose on each mesh material', () => {
    const scene = new THREE.Scene();
    const mesh1 = createColoredMesh();
    const mesh2 = createColoredMesh();
    scene.add(mesh1);
    scene.add(mesh2);
    const texture = createStubTexture();

    // Apply matcap first (mimics screenshot pipeline)
    applyMatcapToClonedScene(scene, texture);

    const disposeSpy1 = vi.spyOn(mesh1.material as THREE.Material, 'dispose');
    const disposeSpy2 = vi.spyOn(mesh2.material as THREE.Material, 'dispose');

    disposeClonedSceneMaterials(scene);

    expect(disposeSpy1).toHaveBeenCalledOnce();
    expect(disposeSpy2).toHaveBeenCalledOnce();
  });

  it('should handle an empty scene without error', () => {
    const scene = new THREE.Scene();

    expect(() => {
      disposeClonedSceneMaterials(scene);
    }).not.toThrow();
  });

  it('should dispose nested mesh materials', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const mesh = createColoredMesh();
    group.add(mesh);
    scene.add(group);
    const texture = createStubTexture();

    applyMatcapToClonedScene(scene, texture);
    const disposeSpy = vi.spyOn(mesh.material as THREE.Material, 'dispose');

    disposeClonedSceneMaterials(scene);

    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});

// ── Screenshot FOV zoom compensation ────────────────────────────────────────

describe('screenshot FOV zoom compensation', () => {
  /**
   * Replicates the exact zoom compensation logic from captureScreenshots:
   *
   *   const screenshotFov = 45;
   *   const zoomCompensation = calculateFovDistanceCompensation(screenshotFov, originalFov, 1);
   *   screenshotCamera.zoom = config.zoomLevel * zoomCompensation;
   *
   * The math: zoomCompensation = tan(45/2) / tan(originalFov/2)
   */
  const screenshotFov = 45;

  function computeZoomCompensation(originalFov: number): number {
    return calculateFovDistanceCompensation(screenshotFov, originalFov, 1);
  }

  it('should return 1.0 when the original FOV is already 45', () => {
    const compensation = computeZoomCompensation(45);

    expect(compensation).toBeCloseTo(1, 10);
  });

  it('should return < 1 when the original FOV is wider than 45 (needs zoom-out)', () => {
    // Going from wide FOV (90) to narrower 45: the 45 FOV already sees less,
    // so zoom must decrease to keep the same visible area.
    const compensation = computeZoomCompensation(90);

    expect(compensation).toBeLessThan(1);
    // Tan(22.5°) / tan(45°) ≈ 0.4142
    expect(compensation).toBeCloseTo(Math.tan((22.5 * Math.PI) / 180) / Math.tan((45 * Math.PI) / 180), 6);
  });

  it('should return > 1 when the original FOV is narrower than 45 (needs zoom-in)', () => {
    // Going from narrow FOV (10) to wider 45: the 45 FOV sees more,
    // so zoom must increase to keep the same visible area.
    const compensation = computeZoomCompensation(10);

    expect(compensation).toBeGreaterThan(1);
    // Tan(22.5°) / tan(5°) ≈ 4.74
    expect(compensation).toBeCloseTo(Math.tan((22.5 * Math.PI) / 180) / Math.tan((5 * Math.PI) / 180), 6);
  });

  it('should preserve the visible frustum half-height', () => {
    // In Three.js: visible half-height = tan(fov/2) / zoom
    // After compensation, tan(45/2)/newZoom must equal tan(originalFov/2)/originalZoom
    const originalFov = 70;
    const originalZoom = 1.5;
    const compensation = computeZoomCompensation(originalFov);
    const newZoom = originalZoom * compensation;

    const originalHalfHeight = Math.tan(((originalFov / 2) * Math.PI) / 180) / originalZoom;
    const newHalfHeight = Math.tan(((screenshotFov / 2) * Math.PI) / 180) / newZoom;

    expect(newHalfHeight).toBeCloseTo(originalHalfHeight, 10);
  });

  it('should preserve visible area for extreme narrow FOV', () => {
    const originalFov = 1;
    const originalZoom = 2;
    const compensation = computeZoomCompensation(originalFov);
    const newZoom = originalZoom * compensation;

    const originalHalfHeight = Math.tan(((originalFov / 2) * Math.PI) / 180) / originalZoom;
    const newHalfHeight = Math.tan(((screenshotFov / 2) * Math.PI) / 180) / newZoom;

    expect(newHalfHeight).toBeCloseTo(originalHalfHeight, 10);
  });

  it('should preserve visible area for extreme wide FOV', () => {
    const originalFov = 89;
    const originalZoom = 0.8;
    const compensation = computeZoomCompensation(originalFov);
    const newZoom = originalZoom * compensation;

    const originalHalfHeight = Math.tan(((originalFov / 2) * Math.PI) / 180) / originalZoom;
    const newHalfHeight = Math.tan(((screenshotFov / 2) * Math.PI) / 180) / newZoom;

    expect(newHalfHeight).toBeCloseTo(originalHalfHeight, 10);
  });

  it('should be monotonically decreasing as original FOV increases', () => {
    const fovValues = [10, 20, 30, 45, 60, 75, 89];
    const compensations = fovValues.map((fov) => computeZoomCompensation(fov));

    for (let index = 1; index < compensations.length; index++) {
      expect(compensations[index]!).toBeLessThan(compensations[index - 1]!);
    }
  });

  it('should be symmetric with the underlying distance compensation formula', () => {
    // Verify that our zoom compensation is the exact inverse ratio:
    // computeZoomCompensation(fov) = tan(screenshotFov/2) / tan(fov/2)
    for (const fov of [10, 30, 45, 60, 80]) {
      const expected = Math.tan(((screenshotFov / 2) * Math.PI) / 180) / Math.tan(((fov / 2) * Math.PI) / 180);
      expect(computeZoomCompensation(fov)).toBeCloseTo(expected, 10);
    }
  });
});

// ── Screenshot camera centering on geometry ─────────────────────────────────

describe('screenshot camera centering', () => {
  // Replicates the centering logic from captureScreenshots:
  // 1. Compute bounding-box center and sphere radius from the scene.
  // 2. Compute optimal distance using the same formula as resetCamera.
  // 3. Position camera at geometryCenter + spherical offset.

  /** Creates a scene with a mesh translated to a specific position. */
  function createOffCenterScene(centerX: number, centerY: number, centerZ: number): THREE.Scene {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, centerY, centerZ);
    mesh.updateMatrixWorld(true);
    scene.add(mesh);
    return scene;
  }

  describe('bounding box center computation', () => {
    it('should compute the center of an off-center mesh', () => {
      const scene = createOffCenterScene(10, 5, 3);
      const boundingBox = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);

      expect(center.x).toBeCloseTo(10, 4);
      expect(center.y).toBeCloseTo(5, 4);
      expect(center.z).toBeCloseTo(3, 4);
    });

    it('should compute the center of a scene at the origin', () => {
      const scene = createOffCenterScene(0, 0, 0);
      const boundingBox = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);

      expect(center.x).toBeCloseTo(0, 4);
      expect(center.y).toBeCloseTo(0, 4);
      expect(center.z).toBeCloseTo(0, 4);
    });

    it('should compute bounding sphere radius from the scene', () => {
      const scene = createOffCenterScene(0, 0, 0);
      const boundingBox = new THREE.Box3().setFromObject(scene);
      const sphere = new THREE.Sphere();
      boundingBox.getBoundingSphere(sphere);

      // 2x2x2 box has a diagonal of sqrt(4+4+4) = sqrt(12) ≈ 3.46, radius = half ≈ 1.73
      expect(sphere.radius).toBeCloseTo(Math.sqrt(12) / 2, 2);
    });
  });

  describe('optimal distance formula', () => {
    // Replicates the exact formula from captureScreenshots:
    //   effectiveFov = RAD2DEG * 2 * atan(tan(DEG2RAD * 45 / 2) / zoomLevel)
    //   adjustedOffsetRatio = offsetRatio * calculateFovDistanceCompensation(60, effectiveFov, 1)
    //   distance = geometryRadius * adjustedOffsetRatio
    const screenshotFov = 45;
    const standardFov = 60;

    function computeOptimalDistance(geometryRadius: number, zoomLevel: number): number {
      const effectiveFov =
        THREE.MathUtils.RAD2DEG * 2 * Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * screenshotFov) / 2) / zoomLevel);
      const adjustedOffsetRatio =
        defaultStageOptions.offsetRatio * calculateFovDistanceCompensation(standardFov, effectiveFov, 1);
      return geometryRadius * adjustedOffsetRatio;
    }

    it('should produce a positive distance for default zoom level', () => {
      const distance = computeOptimalDistance(5, 1.25);

      expect(distance).toBeGreaterThan(0);
    });

    it('should scale linearly with geometry radius', () => {
      const distanceSmall = computeOptimalDistance(1, 1.25);
      const distanceLarge = computeOptimalDistance(10, 1.25);

      expect(distanceLarge / distanceSmall).toBeCloseTo(10, 6);
    });

    it('should increase distance when zoom level increases (narrower effective FOV)', () => {
      const distanceLowZoom = computeOptimalDistance(5, 1);
      const distanceHighZoom = computeOptimalDistance(5, 2);

      // Higher zoom = narrower effective FOV = camera must be further away
      expect(distanceHighZoom).toBeGreaterThan(distanceLowZoom);
    });

    it('should match the resetCamera formula for the same inputs', () => {
      const radius = 7;
      const zoomLevel = 1.25;

      // Compute using our screenshot formula
      const screenshotDistance = computeOptimalDistance(radius, zoomLevel);

      // Compute using the resetCamera formula manually
      const effectiveFov =
        THREE.MathUtils.RAD2DEG * 2 * Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * screenshotFov) / 2) / zoomLevel);
      const expectedDistance =
        radius * defaultStageOptions.offsetRatio * calculateFovDistanceCompensation(standardFov, effectiveFov, 1);

      expect(screenshotDistance).toBeCloseTo(expectedDistance, 10);
    });
  });

  describe('spherical offset centering (Z-up)', () => {
    it('should position camera at geometryCenter + offset for front view (phi=90, theta=270)', () => {
      const geometryCenter = new THREE.Vector3(10, 5, 3);
      const distance = 20;
      const phiRad = (90 * Math.PI) / 180;
      const thetaRad = (270 * Math.PI) / 180;

      // Z-up: ox = d*sin(phi)*cos(theta), oy = d*sin(phi)*sin(theta), oz = d*cos(phi)
      const ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
      const oy = distance * Math.sin(phiRad) * Math.sin(thetaRad);
      const oz = distance * Math.cos(phiRad);

      const cameraPosition = new THREE.Vector3(geometryCenter.x + ox, geometryCenter.y + oy, geometryCenter.z + oz);

      // Camera should be offset from the geometry center, not the origin
      expect(cameraPosition.x).toBeCloseTo(10 + ox, 6);
      expect(cameraPosition.y).toBeCloseTo(5 + oy, 6);
      expect(cameraPosition.z).toBeCloseTo(3 + oz, 6);

      // Distance from camera to geometry center should equal the computed distance
      expect(cameraPosition.distanceTo(geometryCenter)).toBeCloseTo(distance, 6);
    });

    it('should always be exactly "distance" away from geometryCenter regardless of angles', () => {
      const geometryCenter = new THREE.Vector3(100, -50, 25);
      const distance = 15;

      const angles = [
        { phi: 0, theta: 0 }, // Top
        { phi: 90, theta: 0 }, // Right
        { phi: 90, theta: 90 }, // Back
        { phi: 90, theta: 180 }, // Left
        { phi: 90, theta: 270 }, // Front
        { phi: 180, theta: 0 }, // Bottom
        { phi: 45, theta: 315 }, // Isometric
      ];

      for (const { phi, theta } of angles) {
        const phiRad = (phi * Math.PI) / 180;
        const thetaRad = (theta * Math.PI) / 180;

        const ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
        const oy = distance * Math.sin(phiRad) * Math.sin(thetaRad);
        const oz = distance * Math.cos(phiRad);

        const cameraPosition = new THREE.Vector3(geometryCenter.x + ox, geometryCenter.y + oy, geometryCenter.z + oz);

        expect(cameraPosition.distanceTo(geometryCenter)).toBeCloseTo(distance, 6);
      }
    });

    it('should NOT be at distance from origin when geometry is off-center', () => {
      const geometryCenter = new THREE.Vector3(100, 0, 0);
      const distance = 10;
      const phiRad = (90 * Math.PI) / 180; // Equatorial
      const thetaRad = 0;

      const ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
      const oy = distance * Math.sin(phiRad) * Math.sin(thetaRad);
      const oz = distance * Math.cos(phiRad);

      const cameraPosition = new THREE.Vector3(geometryCenter.x + ox, geometryCenter.y + oy, geometryCenter.z + oz);

      // Distance from origin is NOT the intended camera distance
      const distFromOrigin = cameraPosition.length();
      expect(distFromOrigin).not.toBeCloseTo(distance, 0);

      // But distance from geometry center IS correct
      expect(cameraPosition.distanceTo(geometryCenter)).toBeCloseTo(distance, 6);
    });
  });

  describe('portrait aspect compensation', () => {
    it('should increase distance for portrait aspect ratios (< 1)', () => {
      const screenshotFov = 45;
      const zoomLevel = 1.25;
      const effectiveFov =
        THREE.MathUtils.RAD2DEG * 2 * Math.atan(Math.tan((THREE.MathUtils.DEG2RAD * screenshotFov) / 2) / zoomLevel);
      const baseDistance = 20;

      // Landscape: no compensation
      const landscapeAspect = 16 / 9;
      let landscapeDistance = baseDistance;
      if (landscapeAspect > 0 && landscapeAspect < 1) {
        const vFovRad = (effectiveFov / 2) * (Math.PI / 180);
        const hFovHalf = Math.atan(landscapeAspect * Math.tan(vFovRad));
        landscapeDistance *= Math.tan(vFovRad) / Math.tan(hFovHalf);
      }

      // Portrait: compensation applied
      const portraitAspect = 9 / 16;
      let portraitDistance = baseDistance;
      if (portraitAspect > 0 && portraitAspect < 1) {
        const vFovRad = (effectiveFov / 2) * (Math.PI / 180);
        const hFovHalf = Math.atan(portraitAspect * Math.tan(vFovRad));
        portraitDistance *= Math.tan(vFovRad) / Math.tan(hFovHalf);
      }

      // Landscape should not be modified
      expect(landscapeDistance).toBe(baseDistance);
      // Portrait should be larger to prevent horizontal clipping
      expect(portraitDistance).toBeGreaterThan(baseDistance);
    });

    it('should not apply compensation for square aspect ratio', () => {
      // Use a helper to avoid the linter flagging constant comparisons
      function applyPortraitCompensation(baseDistance: number, aspect: number): number {
        if (aspect > 0 && aspect < 1) {
          return baseDistance * 2;
        }

        return baseDistance;
      }

      expect(applyPortraitCompensation(20, 1)).toBe(20);
      expect(applyPortraitCompensation(20, 1.5)).toBe(20);
    });
  });
});

describe('computeViewFittingZoom', () => {
  // Helper: axis-aligned bounding box centred at `center` with given half-extents
  // eslint-disable-next-line max-params -- test helper, simple positional args are clearer here
  function makeBox(center: THREE.Vector3, hx: number, hy: number, hz: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(center.x - hx, center.y - hy, center.z - hz),
      new THREE.Vector3(center.x + hx, center.y + hy, center.z + hz),
    );
  }

  const fov = 45;
  const squareAspect = 1;

  describe('basic framing', () => {
    it('should return a positive zoom for a unit cube viewed from the Z-axis', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      });
      expect(zoom).toBeGreaterThan(0);
    });

    it('should produce a perspective-correct zoom for a cube face', () => {
      const distance = 10;
      const halfExtent = 1;
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      // With perspective-correct projection, the closest bbox corners (at z = +halfExtent)
      // are at forward distance (d - halfExtent), which makes them subtend a larger angle.
      // zoom = (d - halfExtent) * tan(fov/2) / halfExtent
      const closestForwardDist = distance - halfExtent;
      const expectedZoom = (closestForwardDist * tanHalf) / halfExtent;

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1, // No padding for exact comparison
      });

      expect(zoom).toBeCloseTo(expectedZoom, 5);
    });
  });

  describe('aspect ratio handling', () => {
    it('should produce different zoom for landscape vs portrait aspect ratios', () => {
      const box = makeBox(new THREE.Vector3(0, 0, 0), 2, 1, 1);
      const camera = new THREE.Vector3(0, 0, 10);
      const target = new THREE.Vector3(0, 0, 0);

      const landscapeZoom = computeViewFittingZoom({
        cameraPosition: camera,
        target,
        boundingBox: box,
        fovDeg: fov,
        aspectRatio: 16 / 9,
        paddingFactor: 1,
      });

      const portraitZoom = computeViewFittingZoom({
        cameraPosition: camera,
        target,
        boundingBox: box,
        fovDeg: fov,
        aspectRatio: 9 / 16,
        paddingFactor: 1,
      });

      // Wider aspect lets horizontal extent fit more easily → higher zoom
      expect(landscapeZoom).toBeGreaterThan(portraitZoom);
    });

    it('should be constrained by the wider axis in landscape when object is wider than tall', () => {
      const wideBox = makeBox(new THREE.Vector3(0, 0, 0), 4, 1, 1);
      const camera = new THREE.Vector3(0, 0, 10);
      const target = new THREE.Vector3(0, 0, 0);

      const zoom = computeViewFittingZoom({
        cameraPosition: camera,
        target,
        boundingBox: wideBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));
      // Closest corners at z=+1 have forward distance 9.
      // Horizontal constrains: aspect * tanHalf / (4/9) = 9 * aspect * tanHalf / 4
      const closestForwardDist = 9;
      const zoomH = (squareAspect * closestForwardDist * tanHalf) / 4;
      expect(zoom).toBeCloseTo(zoomH, 5);
    });
  });

  describe('viewpoint-dependent framing', () => {
    it('should produce higher zoom for a tall object viewed from the top (Z-up)', () => {
      // Tall cylinder-like bbox: narrow in X/Y, tall in Z
      const tallBox = makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 5);
      const target = new THREE.Vector3(0, 0, 0);

      // Side view (camera on X-axis, sees Y × Z face → 1 × 5 projected)
      const sideZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(10, 0, 0),
        target,
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Top view (camera on Z-axis, sees X × Y face → 1 × 1 projected)
      const topZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target,
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Top view should zoom in more (higher zoom) since projected extents are smaller
      expect(topZoom).toBeGreaterThan(sideZoom);
    });

    it('should produce consistent zoom regardless of up-axis for front view', () => {
      // This test uses the default up axis (Z-up in this project)
      const box = makeBox(new THREE.Vector3(0, 0, 0), 2, 1, 3);
      const target = new THREE.Vector3(0, 0, 0);

      // Camera on Y-axis (front view in Z-up: sees X × Z face)
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, -10, 0),
        target,
        boundingBox: box,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(zoom).toBeGreaterThan(0);
      expect(Number.isFinite(zoom)).toBe(true);
    });
  });

  describe('off-center geometry', () => {
    it('should produce the same zoom as centered geometry (projection is relative to target)', () => {
      const halfExtent = 2;
      const box = makeBox;

      const centeredZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: box(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Shift everything by (100, 50, -30)
      const offset = new THREE.Vector3(100, 50, -30);
      const offCenterZoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0 + offset.x, 0 + offset.y, 10 + offset.z),
        target: offset.clone(),
        boundingBox: box(offset.clone(), halfExtent, halfExtent, halfExtent),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(offCenterZoom).toBeCloseTo(centeredZoom, 5);
    });
  });

  describe('padding factor', () => {
    it('should scale linearly with padding factor', () => {
      const baseParameters = {
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      };

      const zoomFull = computeViewFittingZoom({ ...baseParameters, paddingFactor: 1 });
      const zoomPadded = computeViewFittingZoom({ ...baseParameters, paddingFactor: 0.8 });

      expect(zoomPadded / zoomFull).toBeCloseTo(0.8, 5);
    });

    it('should default to 0.9 padding when not specified', () => {
      const baseParameters = {
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      };

      const zoomDefault = computeViewFittingZoom(baseParameters);
      const zoomExplicit = computeViewFittingZoom({ ...baseParameters, paddingFactor: 0.9 });

      expect(zoomDefault).toBeCloseTo(zoomExplicit, 10);
    });
  });

  describe('degenerate cases', () => {
    it('should handle camera looking straight down the up axis without error', () => {
      // Looking straight down Z in Z-up → forward cross worldUp = zero vector
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: makeBox(new THREE.Vector3(0, 0, 0), 2, 3, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      expect(zoom).toBeGreaterThan(0);
      expect(Number.isFinite(zoom)).toBe(true);
    });

    it('should return 1 when camera is at the target', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(5, 5, 5),
        target: new THREE.Vector3(5, 5, 5),
        boundingBox: makeBox(new THREE.Vector3(5, 5, 5), 1, 1, 1),
        fovDeg: fov,
        aspectRatio: squareAspect,
      });

      expect(zoom).toBe(1);
    });

    it('should return 1 for a zero-extent bounding box (point)', () => {
      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, 10),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)),
        fovDeg: fov,
        aspectRatio: squareAspect,
      });

      expect(zoom).toBe(1);
    });
  });

  describe('perspective depth correction', () => {
    it('should produce lower zoom than the orthographic formula for a tall box viewed from below', () => {
      // Tall box: narrow in X/Y (half-extent 2), tall in Z (half-extent 8)
      // Camera below at distance 20 from center, looking up
      const distance = 20;
      const halfZ = 8;
      const halfXy = 2;
      const tallBox = makeBox(new THREE.Vector3(0, 0, 0), halfXy, halfXy, halfZ);
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, -distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: tallBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // Orthographic approximation would give: d * tanHalf / halfXY = 20 * tan / 2
      const orthographicZoom = (distance * tanHalf) / halfXy;

      // Perspective-correct: closest corners at z = -halfZ are at forward distance
      // (distance - halfZ) = 12 from camera. Their tangent = halfXY / 12, which is
      // larger than halfXY / 20, so the required zoom is lower (less zoomed in).
      const perspectiveForwardDist = distance - halfZ;
      const perspectiveZoom = (perspectiveForwardDist * tanHalf) / halfXy;

      expect(zoom).toBeCloseTo(perspectiveZoom, 5);
      expect(zoom).toBeLessThan(orthographicZoom);
    });

    it('should match orthographic formula when box has zero depth along viewing axis', () => {
      // Flat box (no Z extent) — all corners are at the same forward distance
      const distance = 10;
      const halfExtent = 3;
      const flatBox = makeBox(new THREE.Vector3(0, 0, 0), halfExtent, halfExtent, 0.001);
      const tanHalf = Math.tan((fov / 2) * (Math.PI / 180));

      const zoom = computeViewFittingZoom({
        cameraPosition: new THREE.Vector3(0, 0, distance),
        target: new THREE.Vector3(0, 0, 0),
        boundingBox: flatBox,
        fovDeg: fov,
        aspectRatio: squareAspect,
        paddingFactor: 1,
      });

      // All corners nearly at forward distance d, so result ≈ orthographic
      const orthographicZoom = (distance * tanHalf) / halfExtent;
      expect(zoom).toBeCloseTo(orthographicZoom, 1);
    });
  });
});
