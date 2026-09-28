import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { isSectionRemoved, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import * as bvhCache from '#components/geometry/graphics/three/utils/bvh-cache.js';
import { raycastFirstVisibleMeshHit } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#components/geometry/graphics/three/utils/bvh-raycast.js';

function createTriangleMesh(z: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, z, 1, -1, z, 0, 1, z]), 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

/** One triangle per corner list, double-sided. */
function createTrianglesMesh(triangles: ReadonlyArray<readonly number[]>): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triangles.flat()), 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

/** The clip of `cuts`, with metres as render units. */
const clipOf = (...cuts: SectionCut[]): RaycastClipState => ({ enabled: true, pieces: resolveSectionPieces(cuts) });

/** Removes everything above z = -1.5. */
const aboveMinusOnePointFive: SectionCut = { id: 'xy', kind: 'plane', plane: 'xy', offset: -1.5, isFlipped: false };

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
      clipping: clipOf(aboveMinusOnePointFive),
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
      clipping: { ...clipOf(aboveMinusOnePointFive), enabled: false },
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
      clipping: clipOf(aboveMinusOnePointFive),
    });

    expect(hit?.distance).toBeCloseTo(2);
    expect(hit?.point.z).toBeCloseTo(-2);
  });

  it('should keep the hit between two narrow cutaways and reject the hits inside them', () => {
    // Triangles across the ray x = 0.5, z = 0 at y = 2 (75° about Z), 0.2 (22°) and -2 (284°).
    const mesh = createTrianglesMesh([2, 0.2, -2].map((y) => [0, y, -1, 1, y, -1, 0.5, y, 1]));
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0.5, 10, 0), new THREE.Vector3(0, -1, 0));
    const wedge = (id: string, start: number): SectionCut => ({
      id,
      kind: 'revolution',
      axis: 'z',
      origin: [0, 0, 0],
      start,
      sweep: 60,
    });

    const hit = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: [mesh],
      clipping: clipOf(wedge('around +y', 60), wedge('around -y', 240)),
    });

    expect(hit?.point.y).toBeCloseTo(0.2);
  });

  it('should keep a hit on a cut face', () => {
    const mesh = createTrianglesMesh([
      [-1, -1, -1.5, 1, -1, -1.5, 0, 1, -1.5],
      [-1, -1, -2, 1, -1, -2, 0, 1, -2],
    ]);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));

    const hit = raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh], clipping: clipOf(aboveMinusOnePointFive) });

    expect(hit?.point.z).toBeCloseTo(-1.5);
  });

  it('should keep a hit on an oblique cut face that rounding puts a hair past it', () => {
    // The start face of a 45° to 135° cutaway about X lies on z = y. cos 45° and sin 45° round an ulp apart, so
    // (0, 0.5, 0.5), exactly on the face, tests 6e-17 past it: removed with no margin, and kept with the +ε one.
    const cutaway: SectionCut = {
      id: 'oblique',
      kind: 'revolution',
      axis: 'x',
      origin: [0, 0, 0],
      start: 45,
      sweep: 90,
    };
    const clipping = clipOf(cutaway);
    expect(isSectionRemoved([0, 0.5, 0.5], clipping.pieces)).toBe(true);
    const mesh = createTrianglesMesh([[-1, 0.25, 0.25, 1, 0.25, 0.25, 0, 1, 1]]);
    // Up from the kept side under the face, onto an exact point of it.
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1));

    const hit = raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh], clipping });

    expect(hit?.point.toArray()).toEqual([0, 0.5, 0.5]);
  });

  it('should reject a hit on the plane the halves of a cutaway wider than 180° share', () => {
    // 45° to 315° about Z: the halves meet on the -X half of y = 0, inside the removed wedge.
    const mesh = createTrianglesMesh([[-1, 0, -1, -3, 0, -1, -2, 0, 1]]);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(-2, 5, 0), new THREE.Vector3(0, -1, 0));
    const cutaway: SectionCut = { id: 'wide', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 45, sweep: 270 };

    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh] })?.point.y).toBeCloseTo(0);
    expect(raycastFirstVisibleMeshHit({ raycaster, meshes: [mesh], clipping: clipOf(cutaway) })).toBeUndefined();
  });
});
