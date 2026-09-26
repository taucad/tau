import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as bvhCache from '#components/geometry/graphics/three/utils/bvh-cache.js';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject missed mesh bounds before constructing any BVH', () => {
    const build = vi.spyOn(bvhCache, 'getOrBuildBvh');
    const meshes = Array.from({ length: 20 }, (_, index) => {
      const mesh = createTriangleMesh(-1);
      mesh.position.x = 10 + index * 3;
      return mesh;
    });
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes })).toBeUndefined();
    expect(build).not.toHaveBeenCalled();
  });

  it('should refresh stale bounds when missed vertices move into the ray', () => {
    const build = vi.spyOn(bvhCache, 'getOrBuildBvh');
    const mesh = createTriangleMesh(-1);
    mesh.geometry.translate(10, 0, 0);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })).toBeUndefined();
    expect(build).not.toHaveBeenCalled();

    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      position.setX(index, position.getX(index) - 10);
    }
    position.needsUpdate = true;

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.distance).toBeCloseTo(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('should test bounds in local space under translated, rotated and nonuniformly scaled parents', () => {
    const parent = new THREE.Group();
    parent.position.set(3, 2, -5);
    parent.rotation.set(0.3, Math.PI / 3, 0.1);
    parent.scale.set(2, 0.5, 3);
    const mesh = createTriangleMesh(-1);
    parent.add(mesh);
    parent.updateWorldMatrix(true, true);
    const origin = parent.localToWorld(new THREE.Vector3());
    const target = parent.localToWorld(new THREE.Vector3(0, 0, -1));
    const direction = target.clone().sub(origin).normalize();
    const raycaster = new THREE.Raycaster(origin, direction);

    const hit = raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] });
    expect(hit?.object).toBe(mesh);
    expect(hit?.distance).toBeCloseTo(3);
    expect(hit?.point.distanceTo(target)).toBeCloseTo(0);
  });

  it('should refresh both bounds and BVH when the position attribute is replaced at the same version', () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial());
    mesh.position.z = -2;
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.distance).toBeCloseTo(1);

    const position = mesh.geometry.getAttribute('position').clone();
    for (let index = 0; index < position.count; index++) {
      position.setX(index, position.getX(index) + 10);
    }
    mesh.geometry.setAttribute('position', position);
    raycaster.ray.origin.x = 10;

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.distance).toBeCloseTo(1);
  });

  it.each(['version', 'replacement'] as const)('should refresh the BVH after an index %s change', (change) => {
    const mesh = createTriangleMesh(-1);
    const positions = new Float32Array(32 * 9);
    for (let index = 0; index < 32; index++) {
      const x = index < 16 ? index * 4 : 100 + (index - 16) * 4;
      const z = index < 16 ? -1 : -2;
      positions.set([x - 1, -1, z, x + 1, -1, z, x, 1, z], index * 9);
    }
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const indices = new THREE.Uint16BufferAttribute(
      Array.from({ length: 48 }, (_, index) => index),
      1,
    );
    mesh.geometry.setIndex(indices);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.distance).toBeCloseTo(1);

    const replacementIndices = Array.from({ length: 48 }, (_, index) => index + 48);
    if (change === 'replacement') {
      mesh.geometry.setIndex(new THREE.Uint16BufferAttribute(replacementIndices, 1));
    } else {
      indices.set(replacementIndices);
      indices.needsUpdate = true;
    }
    raycaster.ray.origin.x = 100;

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.distance).toBeCloseTo(2);
  });

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

  it('should skip meshes outside the raycaster layers', () => {
    const nearMesh = createTriangleMesh(-1);
    nearMesh.layers.set(1);
    const farMesh = createTriangleMesh(-2);
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [nearMesh, farMesh] })?.object).toBe(farMesh);

    raycaster.layers.enable(1);
    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [nearMesh, farMesh] })?.object).toBe(nearMesh);
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

  it('should find the nearest visible hit after more than 1024 unsorted intersections', () => {
    const positions = new Float32Array(2048 * 9);
    for (let index = 0; index < 2048; index++) {
      const z = -index - 1;
      positions.set([-1, -1, z, 1, -1, z, 0, 1, z], index * 9);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const raycaster = new THREE.Raycaster();
    raycaster.ray.set(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [mesh],
      clipping: { enabled: true, planes: [new THREE.Plane(new THREE.Vector3(0, 0, -1), -1.5)] },
    });

    expect(hit?.distance).toBeCloseTo(2);
    expect(hit?.point.z).toBeCloseTo(-2);
  });
});
