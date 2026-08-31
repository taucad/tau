import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { Mesh, MeshMatcapMaterial, Object3D, PerspectiveCamera, Scene } from 'three';
import {
  TransformControls,
  TransformControlsGizmo,
} from '#components/geometry/graphics/three/controls/transform-controls.js';

type ObjectWithTag = Object3D & { tag?: string };

type GizmoMaps = {
  readonly gizmo: Record<'translate' | 'rotate' | 'scale', Object3D>;
  readonly picker: Record<'translate' | 'rotate' | 'scale', Object3D>;
  readonly helper: Record<'translate' | 'rotate' | 'scale', Object3D>;
};

function getGizmoMaps(gizmo: TransformControlsGizmo): GizmoMaps {
  return gizmo as unknown as GizmoMaps;
}

function collectMeshes(root: Object3D): Array<Mesh<BufferGeometry, MeshMatcapMaterial>> {
  const meshes: Array<Mesh<BufferGeometry, MeshMatcapMaterial>> = [];

  root.traverse((child) => {
    if (child instanceof Mesh && child.material instanceof MeshMatcapMaterial) {
      meshes.push(child as Mesh<BufferGeometry, MeshMatcapMaterial>);
    }
  });

  return meshes;
}

function collectTransformControlBodyMeshes(
  gizmo: TransformControlsGizmo,
): Array<Mesh<BufferGeometry, MeshMatcapMaterial>> {
  const maps = getGizmoMaps(gizmo);
  const meshes = [...collectMeshes(maps.gizmo.translate), ...collectMeshes(maps.gizmo.rotate)];

  return meshes.filter((mesh) => mesh.material.vertexColors);
}

function collectTransformControlBodyMeshesForMode(
  gizmo: TransformControlsGizmo,
  mode: 'translate' | 'rotate',
): Array<Mesh<BufferGeometry, MeshMatcapMaterial>> {
  const maps = getGizmoMaps(gizmo);

  return collectMeshes(maps.gizmo[mode]).filter((mesh) => mesh.material.vertexColors);
}

type AttachedControlsFixture = {
  readonly controls: TransformControls<PerspectiveCamera>;
  readonly camera: PerspectiveCamera;
  readonly domElement: HTMLElement;
};

function createAttachedControlsFixture(cameraDistance = 5): AttachedControlsFixture {
  const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 0, cameraDistance);
  const scene = new Scene();
  const target = new Object3D();
  const domElement = document.createElement('div');
  Object.defineProperty(domElement, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    }),
  });
  const controls = new TransformControls(camera, domElement);

  scene.add(target);
  scene.add(controls);
  controls.attach(target);
  controls.setMode('translate');
  controls.setSpace('world');

  return { controls, camera, domElement };
}

function createAttachedControls(): TransformControls<PerspectiveCamera> {
  const { controls } = createAttachedControlsFixture();

  return controls;
}

function dispatchMousePointerMove(target: EventTarget, clientX: number, clientY: number): void {
  const event = new MouseEvent('pointermove', { clientX, clientY });
  Object.defineProperty(event, 'pointerType', {
    configurable: true,
    value: 'mouse',
  });

  target.dispatchEvent(event);
}

describe('TransformControlsGizmo section controls rendering contract', () => {
  it('should use single vertex-colored meshes for visible translate and rotate arrow bodies', () => {
    const gizmo = new TransformControlsGizmo();
    const bodyMeshes = collectTransformControlBodyMeshes(gizmo);

    expect(bodyMeshes).toHaveLength(9);
    for (const mesh of bodyMeshes) {
      expect(mesh.geometry.getAttribute('color')).toBeDefined();
      expect(mesh.geometry.groups).toHaveLength(0);
      expect(mesh.material.color.getHexString()).toBe('ffffff');
      expect(mesh.material.transparent).toBe(false);
    }
  });

  it('should not construct hidden transform label geometry by default', () => {
    const gizmo = new TransformControlsGizmo();
    const maps = getGizmoMaps(gizmo);
    const taggedObjects: ObjectWithTag[] = [];

    maps.gizmo.translate.traverse((child) => taggedObjects.push(child as ObjectWithTag));
    maps.gizmo.rotate.traverse((child) => taggedObjects.push(child as ObjectWithTag));

    expect(taggedObjects.some((child) => child.tag?.includes('label'))).toBe(false);
  });

  it('should keep translate and rotate picker meshes invisible-only', () => {
    const gizmo = new TransformControlsGizmo();
    const maps = getGizmoMaps(gizmo);
    const pickerMeshes = [...collectMeshes(maps.picker.translate), ...collectMeshes(maps.picker.rotate)];

    expect(maps.picker.translate.visible).toBe(false);
    expect(maps.picker.rotate.visible).toBe(false);
    expect(pickerMeshes.length).toBeGreaterThan(0);
    for (const mesh of pickerMeshes) {
      expect(mesh.material.opacity).toBe(0.15);
      expect(mesh.material.color.getHexString()).toBe('ffffff');
    }
  });

  it('should preserve vertex colors and diffuse color while highlighting by opacity', () => {
    const controls = createAttachedControls();
    const { gizmo } = controls as unknown as { readonly gizmo: TransformControlsGizmo };
    const bodyMeshes = collectTransformControlBodyMeshes(gizmo);
    const initialColors = bodyMeshes.map((mesh) => mesh.material.color.getHexString());

    controls.axis = 'X';
    controls.updateMatrixWorld();

    expect(bodyMeshes.map((mesh) => mesh.material.color.getHexString())).toEqual(initialColors);
    expect(bodyMeshes.some((mesh) => mesh.material.opacity < 1)).toBe(true);
  });

  it('sizes the active-axis helper only from the native camera scale', () => {
    const ordinary = createAttachedControlsFixture(5);
    const microscopic = createAttachedControlsFixture(5e-6);

    ordinary.controls.setMode('rotate');
    microscopic.controls.setMode('rotate');
    ordinary.controls.axis = 'X';
    microscopic.controls.axis = 'X';
    ordinary.controls.updateMatrixWorld();
    microscopic.controls.updateMatrixWorld();

    const ordinaryAxis = getGizmoMaps(
      (ordinary.controls as unknown as { readonly gizmo: TransformControlsGizmo }).gizmo,
    ).helper.rotate.getObjectByName('AXIS');
    const microscopicAxis = getGizmoMaps(
      (microscopic.controls as unknown as { readonly gizmo: TransformControlsGizmo }).gizmo,
    ).helper.rotate.getObjectByName('AXIS');

    expect(ordinaryAxis).toBeDefined();
    expect(microscopicAxis).toBeDefined();
    expect(ordinaryAxis!.scale.x / microscopicAxis!.scale.x).toBeCloseTo(1e6, 6);
    expect(microscopicAxis!.scale.x).toBeLessThan(0.001);
  });

  it('should dim non-highlighted arrow axes from a visual-only shared highlight axis', () => {
    const translateControls = createAttachedControls();
    const rotateControls = createAttachedControls();
    const { gizmo: translateGizmo } = translateControls as unknown as { readonly gizmo: TransformControlsGizmo };
    const { gizmo: rotateGizmo } = rotateControls as unknown as { readonly gizmo: TransformControlsGizmo };

    translateControls.setMode('translate');
    rotateControls.setMode('rotate');
    translateControls.highlightAxis = 'Z';
    rotateControls.highlightAxis = 'Z';
    translateControls.updateMatrixWorld();
    rotateControls.updateMatrixWorld();

    const translateMeshes = collectTransformControlBodyMeshesForMode(translateGizmo, 'translate');
    const rotateMeshes = collectTransformControlBodyMeshesForMode(rotateGizmo, 'rotate');

    expect(translateControls.axis).toBeUndefined();
    expect(rotateControls.axis).toBeUndefined();
    expect(translateMeshes.filter((mesh) => mesh.name === 'Y').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(translateMeshes.filter((mesh) => mesh.name === 'Z').every((mesh) => mesh.material.opacity === 1)).toBe(true);
    expect(rotateMeshes.filter((mesh) => mesh.name === 'X').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(rotateMeshes.filter((mesh) => mesh.name === 'Y').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(rotateMeshes.filter((mesh) => mesh.name === 'Z').every((mesh) => mesh.material.opacity === 1)).toBe(true);
  });

  it('should restore dimmed arrow axes when hover leaves the viewport control element', () => {
    const { controls, domElement } = createAttachedControlsFixture();
    const { gizmo } = controls as unknown as { readonly gizmo: TransformControlsGizmo };
    const translateMeshes = collectTransformControlBodyMeshesForMode(gizmo, 'translate');

    controls.axis = 'Z';
    controls.updateMatrixWorld();

    expect(translateMeshes.filter((mesh) => mesh.name === 'X').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(translateMeshes.filter((mesh) => mesh.name === 'Y').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(translateMeshes.filter((mesh) => mesh.name === 'Z').every((mesh) => mesh.material.opacity === 1)).toBe(true);

    domElement.dispatchEvent(new Event('pointerleave'));
    controls.updateMatrixWorld();

    expect(controls.axis).toBeUndefined();
    expect(translateMeshes.every((mesh) => mesh.material.opacity === 1)).toBe(true);
    expect(translateMeshes.every((mesh) => !mesh.material.transparent)).toBe(true);
  });

  it('should restore dimmed arrow axes when pointer movement leaves the viewport bounds', () => {
    const { controls, domElement } = createAttachedControlsFixture();
    const { gizmo } = controls as unknown as { readonly gizmo: TransformControlsGizmo };
    const translateMeshes = collectTransformControlBodyMeshesForMode(gizmo, 'translate');

    controls.axis = 'Z';
    controls.updateMatrixWorld();

    expect(translateMeshes.filter((mesh) => mesh.name === 'X').every((mesh) => mesh.material.opacity < 1)).toBe(true);
    expect(translateMeshes.filter((mesh) => mesh.name === 'Z').every((mesh) => mesh.material.opacity === 1)).toBe(true);

    dispatchMousePointerMove(domElement.ownerDocument, 150, 50);
    controls.updateMatrixWorld();

    expect(controls.axis).toBeUndefined();
    expect(translateMeshes.every((mesh) => mesh.material.opacity === 1)).toBe(true);
  });

  it('should keep the active drag axis when the pointer leaves the viewport control element mid-drag', () => {
    const { controls, domElement } = createAttachedControlsFixture();

    controls.axis = 'Z';
    controls.dragging = true;

    domElement.dispatchEvent(new Event('pointerleave'));

    expect(controls.axis).toBe('Z');
  });
});
