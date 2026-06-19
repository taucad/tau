import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';

function createTriangleMesh(z: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, z, 1, -1, z, 0, 1, z]), 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function createDoubleTriangleMesh(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, -2, 1, -1, -2, 0, 1, -2]), 3),
  );
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

describe('raycastFirstVisibleMeshHit', () => {
  it('should return the closest visible mesh hit in world distance order', () => {
    const nearMesh = createTriangleMesh(-1);
    const farMesh = createTriangleMesh(-2);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [farMesh, nearMesh],
    });

    expect(hit?.object).toBe(nearMesh);
    expect(hit?.distance).toBeCloseTo(1);
  });

  it('should skip hidden meshes', () => {
    const nearMesh = createTriangleMesh(-1);
    nearMesh.visible = false;
    const farMesh = createTriangleMesh(-2);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [nearMesh, farMesh],
    });

    expect(hit?.object).toBe(farMesh);
    expect(hit?.distance).toBeCloseTo(2);
  });

  it('should skip clipped front hits and return the nearest visible hit behind them', () => {
    const mesh = createDoubleTriangleMesh();
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [mesh],
      clipping: {
        enabled: true,
        planes: [new THREE.Plane(new THREE.Vector3(0, 0, -1), -1.5)],
      },
    });

    expect(hit?.object).toBe(mesh);
    expect(hit?.distance).toBeCloseTo(2);
    expect(hit?.point.z).toBeCloseTo(-2);
  });

  it('should preserve first-hit behavior when clipping is disabled', () => {
    const mesh = createDoubleTriangleMesh();
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [mesh],
      clipping: {
        enabled: false,
        planes: [new THREE.Plane(new THREE.Vector3(0, 0, -1), -1.5)],
      },
    });

    expect(hit?.object).toBe(mesh);
    expect(hit?.distance).toBeCloseTo(1);
    expect(hit?.point.z).toBeCloseTo(-1);
  });
});
