import * as React from 'react';
import { act } from '@testing-library/react';
import { createRoot, extend, useThree } from '@react-three/fiber';
import { describe, expect, it, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { TransformControls as TransformControlsImpl } from '#components/geometry/graphics/three/controls/transform-controls.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import { sceneTag, hasSceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';

const cameraMocks = vi.hoisted(() => ({
  rig: undefined as unknown as {
    activeCamera: THREE.Camera;
    perspectiveCamera: THREE.PerspectiveCamera;
    orthographicCamera: THREE.OrthographicCamera;
  },
  retargeters: new Set<(camera: THREE.Camera) => void>(),
}));

vi.mock('#hooks/use-graphics.js', async () => {
  const three = await import('three');
  const perspectiveCamera = new three.PerspectiveCamera();
  cameraMocks.rig = {
    activeCamera: perspectiveCamera,
    perspectiveCamera,
    orthographicCamera: new three.OrthographicCamera(),
  };
  return {
    useCameraRig: () => cameraMocks.rig,
    useCameraRetarget: (retarget: (camera: THREE.Camera) => void) => {
      React.useLayoutEffect(() => {
        cameraMocks.retargeters.add(retarget);
        retarget(cameraMocks.rig.activeCamera);
        return () => {
          cameraMocks.retargeters.delete(retarget);
        };
      }, [retarget]);
    },
  };
});

vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({
  SceneOverlay: ({ children }: { readonly children: React.ReactNode }): React.ReactElement =>
    React.createElement(React.Fragment, null, children),
}));

function createStubWebGlRenderer(): WebGLRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;

  return {
    dispose: vi.fn(),
    domElement: canvas,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
  } as unknown as WebGLRenderer;
}

function SceneProbe({ onScene }: { readonly onScene: (scene: THREE.Scene) => void }): undefined {
  const scene = useThree((state) => state.scene);

  React.useLayoutEffect(() => {
    onScene(scene);
  }, [onScene, scene]);

  return undefined;
}

async function renderSectionViewControls(
  element: React.ReactElement,
): Promise<{ readonly scene: THREE.Scene; readonly cleanup: () => void }> {
  const stubGl = createStubWebGlRenderer();
  const canvas = stubGl.domElement;
  document.body.append(canvas);
  const root = createRoot(canvas);
  let scene: THREE.Scene | undefined;

  await act(async () => {
    await root.configure({
      camera: new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
      gl: stubGl,
      size: { height: 600, left: 0, top: 0, width: 800 },
    });

    root.render(
      <>
        {element}
        <SceneProbe
          onScene={(nextScene) => {
            scene = nextScene;
          }}
        />
      </>,
    );
  });

  if (!scene) {
    throw new Error('section-view-controls test did not capture a scene.');
  }

  return {
    scene,
    cleanup: (): void => {
      act(() => {
        root.unmount();
        canvas.remove();
      });
    },
  };
}

function baseProperties(): React.ComponentProps<typeof SectionViewControls> {
  return {
    isActive: true,
    selectedPlaneId: undefined,
    availablePlanes: [],
    rotation: [0, 0, 0],
    planeName: 'face',
    hoveredSectionViewId: undefined,
    upDirection: 'z',
    onSelectPlane: vi.fn(),
    onHover: vi.fn(),
    onSetRotation: vi.fn(),
  };
}

describe('SectionViewControls', () => {
  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  it('should render section selector bodies as tagged vertex-colored meshes with flat labels', async () => {
    const { scene, cleanup } = await renderSectionViewControls(<SectionViewControls {...baseProperties()} />);

    try {
      const selectorBodies: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshMatcapMaterial>> = [];
      const selectorLabels: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];

      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !hasSceneTag(child, sceneTag.sectionViewHelper)) {
          return;
        }

        const mesh = child as THREE.Mesh;

        if (mesh.geometry.hasAttribute('color') && mesh.material instanceof THREE.MeshMatcapMaterial) {
          selectorBodies.push(mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshMatcapMaterial>);
        }

        if (mesh.geometry.userData['selectorLabel'] && mesh.material instanceof THREE.MeshBasicMaterial) {
          selectorLabels.push(mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>);
        }
      });

      expect(selectorBodies).toHaveLength(6);
      expect(selectorLabels).toHaveLength(12);
      for (const body of selectorBodies) {
        expect(body.material.vertexColors).toBe(true);
        expect(body.material.transparent).toBe(false);
        expect(body.material.depthTest).toBe(true);
        expect(body.material.depthWrite).toBe(true);
      }

      for (const label of selectorLabels) {
        expect(label.material.transparent).toBe(true);
        expect(label.material.alphaTest).toBe(0);
        expect(label.material.depthTest).toBe(true);
        expect(label.material.depthWrite).toBe(false);
        expect(label.renderOrder).toBe(viewportRenderTiers.sectionControlLabel);
        expect(label.userData['sectionSelectorLabel']).toBe(label.geometry.userData['selectorLabel']);
        expect(label.userData['sectionSelectorPlaneId']).toEqual(expect.any(String));
        const intersections: THREE.Intersection[] = [];
        label.raycast(new THREE.Raycaster(), intersections);
        expect(intersections).toHaveLength(0);
      }

      const labelFacesByText = new Map<string, Array<{ face: unknown; z: number; rotationY: number }>>();
      for (const label of selectorLabels) {
        const geometryUserData = label.geometry.userData as Record<string, unknown>;
        const meshUserData = label.userData as Record<string, unknown>;
        const text = geometryUserData['selectorLabel'] as string;
        const faces = labelFacesByText.get(text) ?? [];

        faces.push({
          face: meshUserData['sectionSelectorLabelFace'],
          z: label.position.z,
          rotationY: label.rotation.y,
        });
        labelFacesByText.set(text, faces);
      }

      expect([...labelFacesByText.keys()].sort()).toEqual(['Back', 'Bottom', 'Front', 'Left', 'Right', 'Top']);
      expect(new Set(selectorBodies.map((body) => body.renderOrder))).toEqual(
        new Set([viewportRenderTiers.sectionControlBody]),
      );

      for (const text of ['Back', 'Bottom', 'Front', 'Left', 'Right', 'Top']) {
        const faces = labelFacesByText.get(text);
        expect(faces).toHaveLength(2);
        expect(faces).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ face: 'front' }),
            expect.objectContaining({ face: 'back' }),
          ]),
        );

        const front = faces?.find((face) => face.face === 'front');
        const back = faces?.find((face) => face.face === 'back');
        expect(front?.z).toBeGreaterThan(0);
        expect(front?.rotationY).toBe(0);
        expect(back?.z).toBeLessThan(0);
        expect(back?.rotationY).toBe(Math.PI);
      }
    } finally {
      cleanup();
    }
  });

  it('should anchor unselected plane selectors at the render-local section pivot', async () => {
    const { scene, cleanup } = await renderSectionViewControls(
      <SectionViewControls {...baseProperties()} renderPivot={[11, 22, 33]} />,
    );

    try {
      const positions: number[][] = [];
      scene.traverse((child) => {
        const mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = child as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material
        >;
        if (
          child instanceof THREE.Mesh &&
          mesh.geometry.hasAttribute('color') &&
          mesh.material instanceof THREE.MeshMatcapMaterial
        ) {
          positions.push(mesh.parent!.position.toArray());
        }
      });

      const anchor = [11, 22, 33];
      const directions = positions.map((position) => {
        const delta = position.map((value, index) => value - anchor[index]!);
        expect(delta.filter((value) => Math.abs(value) < 1e-10)).toHaveLength(2);
        const axis = delta.findIndex((value) => Math.abs(value) >= 1e-10);
        return `${axis}:${Math.sign(delta[axis]!)}`;
      });
      expect(directions.sort()).toEqual(['0:-1', '0:-1', '1:1', '1:1', '2:-1', '2:-1']);
    } finally {
      cleanup();
    }
  });

  it('should mount both selected-plane transform controls as visible tagged section helpers', async () => {
    const { scene, cleanup } = await renderSectionViewControls(
      <SectionViewControls
        {...baseProperties()}
        availablePlanes={[{ id: 'xy', normal: [0, 0, 1], constant: 0 }]}
        renderPivot={[0, 0, 0]}
        selectedPlaneId='xy'
      />,
    );
    try {
      const controls: THREE.Object3D[] = [];

      scene.traverse((child) => {
        if (child instanceof TransformControlsImpl) {
          controls.push(child);
        }
      });

      expect(controls).toHaveLength(2);
      for (const control of controls) {
        expect(control.visible).toBe(true);
        control.traverse((child) => {
          expect(hasSceneTag(child, sceneTag.sectionViewHelper)).toBe(true);
        });
      }
    } finally {
      cleanup();
    }
  });

  it('should retain transform-control identity and attachment across camera endpoint switches', async () => {
    const { scene, cleanup } = await renderSectionViewControls(
      <SectionViewControls
        {...baseProperties()}
        availablePlanes={[{ id: 'xy', normal: [0, 0, 1], constant: 0 }]}
        renderPivot={[0, 0, 0]}
        selectedPlaneId='xy'
      />,
    );
    try {
      const controls: TransformControlsImpl[] = [];
      scene.traverse((child) => {
        if (child instanceof TransformControlsImpl) {
          controls.push(child as TransformControlsImpl);
        }
      });
      const attachments = controls.map((control) => control.object);

      act(() => {
        cameraMocks.rig.activeCamera = cameraMocks.rig.orthographicCamera;
        for (const retarget of cameraMocks.retargeters) {
          retarget(cameraMocks.rig.activeCamera);
        }
      });

      const afterSwitch: TransformControlsImpl[] = [];
      scene.traverse((child) => {
        if (child instanceof TransformControlsImpl) {
          afterSwitch.push(child as TransformControlsImpl);
        }
      });
      expect(afterSwitch).toEqual(controls);
      expect(afterSwitch.map((control) => control.object)).toEqual(attachments);
      expect(afterSwitch.every((control) => control.camera === cameraMocks.rig.orthographicCamera)).toBe(true);
    } finally {
      cleanup();
      cameraMocks.retargeters.clear();
      cameraMocks.rig.activeCamera = cameraMocks.rig.perspectiveCamera;
    }
  });

  it('should clear the shared transform highlight when the active hover owner leaves an arrow', async () => {
    const { scene, cleanup } = await renderSectionViewControls(
      <SectionViewControls
        {...baseProperties()}
        availablePlanes={[{ id: 'xy', normal: [0, 0, 1], constant: 0 }]}
        renderPivot={[0, 0, 0]}
        selectedPlaneId='xy'
      />,
    );

    try {
      const controls: TransformControlsImpl[] = [];

      scene.traverse((child) => {
        if (child instanceof TransformControlsImpl) {
          controls.push(child as unknown as TransformControlsImpl);
        }
      });

      const translateControl = controls.find(
        (control) => (control as unknown as { readonly mode: string }).mode === 'translate',
      );
      const rotateControl = controls.find(
        (control) => (control as unknown as { readonly mode: string }).mode === 'rotate',
      );

      expect(translateControl).toBeDefined();
      expect(rotateControl).toBeDefined();

      const expectSharedHighlight = (axis: string | undefined): void => {
        for (const control of controls) {
          expect((control as unknown as { readonly highlightAxis?: string }).highlightAxis).toBe(axis);
        }
      };

      await act(async () => {
        rotateControl?.dispatchEvent({ type: 'axis-changed', value: 'Y' });
      });
      expectSharedHighlight('Y');

      await act(async () => {
        translateControl?.dispatchEvent({ type: 'axis-changed', value: 'Z' });
      });
      expectSharedHighlight('Z');

      await act(async () => {
        rotateControl?.dispatchEvent({ type: 'axis-changed', value: undefined });
      });
      expectSharedHighlight('Z');

      await act(async () => {
        translateControl?.dispatchEvent({ type: 'axis-changed', value: undefined });
      });
      expectSharedHighlight(undefined);
    } finally {
      cleanup();
    }
  });
});
