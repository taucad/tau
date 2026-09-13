import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import {
  applyMeshClipping,
  collectClippableTargets,
  enforceMaterialClipping,
} from '#components/geometry/graphics/three/react/section-view.utils.js';
import { sceneTag, setSceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

const testPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

function createDoubleSidedMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

function createFrontSidedMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ side: THREE.FrontSide });
  return new THREE.Mesh(geometry, material);
}

describe('applyMeshClipping', () => {
  it('should set clippingPlanes when enabled', () => {
    const mesh = createDoubleSidedMesh();

    applyMeshClipping(mesh, { enable: true, plane: testPlane });

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.clippingPlanes).toHaveLength(1);
    expect(mat.clippingPlanes![0]).toBe(testPlane);
  });

  it('should preserve DoubleSide on materials when enabled', () => {
    const mesh = createDoubleSidedMesh();

    applyMeshClipping(mesh, { enable: true, plane: testPlane });

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
  });

  it('should preserve FrontSide on materials when enabled', () => {
    const mesh = createFrontSidedMesh();

    applyMeshClipping(mesh, { enable: true, plane: testPlane });

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.side).toBe(THREE.FrontSide);
  });

  it('should clear clippingPlanes when disabled', () => {
    const mesh = createDoubleSidedMesh();

    applyMeshClipping(mesh, { enable: true, plane: testPlane });
    applyMeshClipping(mesh, { enable: false, plane: testPlane });

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.clippingPlanes).toHaveLength(0);
  });

  it('should handle mesh with material array', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    ];
    const mesh = new THREE.Mesh(geometry, materials);

    applyMeshClipping(mesh, { enable: true, plane: testPlane });

    expect(materials[0]!.side).toBe(THREE.DoubleSide);
    expect(materials[0]!.clippingPlanes).toHaveLength(1);
    expect(materials[1]!.side).toBe(THREE.FrontSide);
    expect(materials[1]!.clippingPlanes).toHaveLength(1);
  });
});

describe('collectClippableTargets', () => {
  function createTestSceneGraph(): {
    rootGroup: THREE.Group;
    mesh1: THREE.Mesh;
    mesh2: THREE.Mesh;
    lineSegments: THREE.LineSegments;
  } {
    const rootGroup = new THREE.Group();

    const mesh1 = createDoubleSidedMesh();
    const mesh2 = createDoubleSidedMesh();
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1),
    ]);
    const lineSegments = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial());

    rootGroup.add(mesh1);
    rootGroup.add(mesh2);
    rootGroup.add(lineSegments);

    return { rootGroup, mesh1, mesh2, lineSegments };
  }

  it('should collect meshes and lines separately', () => {
    const { rootGroup, mesh1, mesh2, lineSegments } = createTestSceneGraph();

    const result = collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    expect(result.meshes).toHaveLength(2);
    expect(result.meshes).toContain(mesh1);
    expect(result.meshes).toContain(mesh2);
    expect(result.lines).toEqual([lineSegments]);
  });

  it('should apply clippingPlanes to all mesh materials when enableMesh is true', () => {
    const { rootGroup } = createTestSceneGraph();

    const result = collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    for (const mesh of result.meshes) {
      const mat = mesh.material as THREE.Material;
      expect(mat.clippingPlanes).toHaveLength(1);
      expect(mat.clippingPlanes![0]).toBe(testPlane);
    }
  });

  it('should clear mesh clippingPlanes when enableMesh is false but still return meshes', () => {
    const { rootGroup } = createTestSceneGraph();

    const result = collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: false,
      plane: testPlane,
    });

    expect(result.meshes).toHaveLength(2);
    for (const mesh of result.meshes) {
      const mat = mesh.material as THREE.Material;
      expect(mat.clippingPlanes).toHaveLength(0);
    }
  });

  it('should apply clippingPlanes to LineSegments when enableLines is true', () => {
    const { rootGroup, lineSegments } = createTestSceneGraph();

    collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    const mat = lineSegments.material as THREE.Material;
    expect(mat.clippingPlanes).toHaveLength(1);
  });

  it('should clear LineSegments clippingPlanes when enableLines is false', () => {
    const { rootGroup, lineSegments } = createTestSceneGraph();

    collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: false,
      enableMesh: true,
      plane: testPlane,
    });

    const mat = lineSegments.material as THREE.Material;
    expect(mat.clippingPlanes).toHaveLength(0);
  });

  it('should clear all clipping when enableSection is false', () => {
    const { rootGroup, mesh1, mesh2, lineSegments } = createTestSceneGraph();

    collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    const result = collectClippableTargets(rootGroup, {
      enableSection: false,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    expect(result.meshes).toHaveLength(0);
    expect(result.lines).toHaveLength(0);

    for (const mesh of [mesh1, mesh2]) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.clippingPlanes).toHaveLength(0);
      expect(mat.side).toBe(THREE.DoubleSide);
    }

    expect((lineSegments.material as THREE.Material).clippingPlanes).toHaveLength(0);
  });

  it('should set matrixAutoUpdate to false on collected meshes', () => {
    const { rootGroup, mesh1, mesh2 } = createTestSceneGraph();

    collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    expect(mesh1.matrixAutoUpdate).toBe(false);
    expect(mesh2.matrixAutoUpdate).toBe(false);
  });

  it('should not mutate or collect meshes tagged as sectionViewHelper', () => {
    const rootGroup = new THREE.Group();
    const userMesh = createDoubleSidedMesh();
    const helperMesh = createDoubleSidedMesh();
    setSceneTag(helperMesh, sceneTag.sectionViewHelper);

    rootGroup.add(userMesh);
    rootGroup.add(helperMesh);

    const result = collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    expect(result.meshes).toEqual([userMesh]);
    expect((helperMesh.material as THREE.MeshStandardMaterial).clippingPlanes).toBeNull();
  });

  it('should include LineSegments2 in lines array', () => {
    const rootGroup = new THREE.Group();
    const mesh = createDoubleSidedMesh();
    const fatLine = new LineSegments2();

    rootGroup.add(mesh);
    rootGroup.add(fatLine);

    const result = collectClippableTargets(rootGroup, {
      enableSection: true,
      enableLines: true,
      enableMesh: true,
      plane: testPlane,
    });

    expect(result.lines).toContain(fatLine);
    expect(fatLine.material.clippingPlanes).toHaveLength(1);
  });
});

describe('enforceMaterialClipping', () => {
  it('should set clippingPlanes when material has none (post-applyMatcap scenario)', () => {
    const mesh = createDoubleSidedMesh();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.clippingPlanes).toBeNull();

    enforceMaterialClipping([mesh], testPlane, true);

    expect(mat.clippingPlanes).toHaveLength(1);
    expect(mat.clippingPlanes![0]).toBe(testPlane);
  });

  it('should be a no-op when clippingPlanes already reference the correct plane', () => {
    const mesh = createDoubleSidedMesh();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const existingPlanes = [testPlane];
    mat.clippingPlanes = existingPlanes;

    enforceMaterialClipping([mesh], testPlane, true);

    expect(mat.clippingPlanes).toBe(existingPlanes);
  });

  it('should replace clippingPlanes when they reference a different plane', () => {
    const mesh = createDoubleSidedMesh();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const stalePlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 5);
    mat.clippingPlanes = [stalePlane];

    enforceMaterialClipping([mesh], testPlane, true);

    expect(mat.clippingPlanes).toHaveLength(1);
    expect(mat.clippingPlanes[0]).toBe(testPlane);
  });

  it('should clear clippingPlanes when enableMesh is false', () => {
    const mesh = createDoubleSidedMesh();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.clippingPlanes = [testPlane];

    enforceMaterialClipping([mesh], testPlane, false);

    expect(mat.clippingPlanes).toHaveLength(0);
  });

  it('should be a no-op when enableMesh is false and clippingPlanes already empty', () => {
    const mesh = createDoubleSidedMesh();
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.clippingPlanes = [];

    enforceMaterialClipping([mesh], testPlane, false);

    expect(mat.clippingPlanes).toHaveLength(0);
  });

  it('should handle mesh with material array', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    ];
    const mesh = new THREE.Mesh(geometry, materials);

    enforceMaterialClipping([mesh], testPlane, true);

    expect(materials[0]!.clippingPlanes).toHaveLength(1);
    expect(materials[0]!.clippingPlanes![0]).toBe(testPlane);
    expect(materials[1]!.clippingPlanes).toHaveLength(1);
    expect(materials[1]!.clippingPlanes![0]).toBe(testPlane);
  });

  it('should handle multiple meshes', () => {
    const mesh1 = createDoubleSidedMesh();
    const mesh2 = createFrontSidedMesh();

    enforceMaterialClipping([mesh1, mesh2], testPlane, true);

    const mat1 = mesh1.material as THREE.MeshStandardMaterial;
    const mat2 = mesh2.material as THREE.MeshStandardMaterial;
    expect(mat1.clippingPlanes).toHaveLength(1);
    expect(mat2.clippingPlanes).toHaveLength(1);
  });
});
