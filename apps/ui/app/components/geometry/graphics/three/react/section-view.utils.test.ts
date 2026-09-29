import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegments2 as WebGpuLineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { collectClippableTargets } from '#components/geometry/graphics/three/react/section-view.utils.js';
import { sceneTag, sceneTagData } from '#components/geometry/graphics/three/utils/scene-tags.js';

function createMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
}

describe('collectClippableTargets', () => {
  function createTestSceneGraph(): {
    rootGroup: THREE.Group;
    mesh1: THREE.Mesh;
    mesh2: THREE.Mesh;
    lineSegments: THREE.LineSegments;
  } {
    const rootGroup = new THREE.Group();

    const mesh1 = createMesh();
    const mesh2 = createMesh();
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

    const result = collectClippableTargets(rootGroup);

    expect(result.meshes).toHaveLength(2);
    expect(result.meshes).toContain(mesh1);
    expect(result.meshes).toContain(mesh2);
    expect(result.lines).toEqual([lineSegments]);
  });

  it('should list line strips, line loops and points, and keep their transforms updating', () => {
    const rootGroup = new THREE.Group();
    const mesh = createMesh();
    const strip = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const loop = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    rootGroup.add(mesh, strip, loop, points);

    const result = collectClippableTargets(rootGroup);

    expect(result).toEqual({ meshes: [mesh], lines: [strip, loop], points: [points] });
    expect([strip, loop, points].map((object) => object.matrixAutoUpdate)).toEqual([true, true, true]);
  });

  it('should leave materials untouched', () => {
    const { rootGroup, mesh1, lineSegments } = createTestSceneGraph();

    collectClippableTargets(rootGroup);

    const material = mesh1.material as THREE.MeshStandardMaterial;
    expect(material.clippingPlanes).toBeNull();
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.version).toBe(0);
    expect((lineSegments.material as THREE.Material).clippingPlanes).toBeNull();
  });

  it('should set matrixAutoUpdate to false on collected meshes', () => {
    const { rootGroup, mesh1, mesh2 } = createTestSceneGraph();

    collectClippableTargets(rootGroup);

    expect(mesh1.matrixAutoUpdate).toBe(false);
    expect(mesh2.matrixAutoUpdate).toBe(false);
  });

  it('should not collect or touch meshes tagged as sectionViewHelper', () => {
    const rootGroup = new THREE.Group();
    const userMesh = createMesh();
    const helperMesh = createMesh();
    helperMesh.userData = sceneTagData(sceneTag.sectionViewHelper);

    rootGroup.add(userMesh);
    rootGroup.add(helperMesh);

    const result = collectClippableTargets(rootGroup);

    expect(result.meshes).toEqual([userMesh]);
    expect(helperMesh.matrixAutoUpdate).toBe(true);
  });

  it.each([
    ['WebGL', (): THREE.Mesh => new LineSegments2()],
    ['WebGPU', (): THREE.Mesh => new WebGpuLineSegments2()],
  ])('should list %s fat lines as lines and keep their transforms updating', (_backend, createFatLine) => {
    const rootGroup = new THREE.Group();
    const mesh = createMesh();
    const fatLine = createFatLine();

    rootGroup.add(mesh);
    rootGroup.add(fatLine);

    const result = collectClippableTargets(rootGroup);

    expect(result.lines).toEqual([fatLine]);
    expect(result.meshes).toEqual([mesh]);
    expect(fatLine.matrixAutoUpdate).toBe(true);
  });
});
