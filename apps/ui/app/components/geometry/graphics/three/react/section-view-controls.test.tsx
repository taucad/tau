import * as React from 'react';
import { act } from '@testing-library/react';
import { createRoot, extend, useThree } from '@react-three/fiber';
import { describe, expect, it, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { TransformControls as TransformControlsImpl } from '#components/geometry/graphics/three/controls/transform-controls.js';
import { SectionViewControls } from '#components/geometry/graphics/three/react/section-view-controls.js';
import type { AvailablePlane } from '#components/geometry/graphics/three/react/section-view-controls.js';
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
  frameloop: 'never' | 'demand' = 'never',
): Promise<{
  readonly scene: THREE.Scene;
  readonly gl: WebGLRenderer;
  readonly rerender: (next: React.ReactElement) => Promise<void>;
  readonly cleanup: () => void;
}> {
  const stubGl = createStubWebGlRenderer();
  const canvas = stubGl.domElement;
  document.body.append(canvas);
  const root = createRoot(canvas);
  let scene: THREE.Scene | undefined;

  await act(async () => {
    await root.configure({
      camera: new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 100_000),
      gl: stubGl,
      frameloop,
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
    gl: stubGl,
    rerender: async (next): Promise<void> => {
      await act(async () => {
        root.render(
          <>
            {next}
            <SceneProbe
              onScene={(nextScene) => {
                scene = nextScene;
              }}
            />
          </>,
        );
      });
    },
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

/** Holds animation-frame callbacks, in request order, until the test runs the frame. */
function queueAnimationFrames(): {
  readonly runFrame: () => void;
  readonly pendingCount: () => number;
  readonly restore: () => void;
} {
  const callbacks = new Map<number, FrameRequestCallback>();
  let lastId = 0;
  const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    lastId += 1;
    callbacks.set(lastId, callback);
    return lastId;
  });
  const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    runFrame(): void {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) {
        callback(performance.now());
      }
    },
    pendingCount: () => callbacks.size,
    restore(): void {
      request.mockRestore();
      cancel.mockRestore();
    },
  };
}

function findTransformGizmo(scene: THREE.Scene): {
  readonly translate: TransformControlsImpl;
  readonly rotate: TransformControlsImpl;
  readonly object: THREE.Object3D;
} {
  let translate: TransformControlsImpl | undefined;
  let rotate: TransformControlsImpl | undefined;
  let object: THREE.Object3D | undefined;
  scene.traverse((child) => {
    if (child instanceof TransformControlsImpl) {
      if (child.mode === 'translate') {
        translate = child;
      } else if (child.mode === 'rotate') {
        rotate = child;
      }
    } else if (
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.BoxGeometry &&
      child.material instanceof THREE.MeshBasicMaterial &&
      !child.material.visible
    ) {
      object = child;
    }
  });

  if (!translate || !rotate || !object) {
    throw new Error('section-view-controls test did not find the transform gizmo.');
  }

  return { translate, rotate, object };
}

const xyPlane: AvailablePlane = { id: 'xy', normal: [0, 0, 1], constant: 0 };
const xzPlane: AvailablePlane = { id: 'xz', normal: [0, 1, 0], constant: 0 };

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

  it('should apply controlled transform changes in the demand frame', async () => {
    const properties: React.ComponentProps<typeof SectionViewControls> = {
      ...baseProperties(),
      availablePlanes: [{ id: 'xy', normal: [0, 0, 1], constant: 0 }],
      selectedPlaneId: 'xy',
    };
    const { scene, rerender, cleanup } = await renderSectionViewControls(
      <SectionViewControls {...properties} renderPivot={[1, 2, 3]} />,
    );
    try {
      let controlledObject: THREE.Mesh | undefined;
      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.geometry instanceof THREE.BoxGeometry &&
          child.material instanceof THREE.MeshBasicMaterial &&
          !child.material.visible
        ) {
          controlledObject = child;
        }
      });
      expect(controlledObject).toBeDefined();

      controlledObject?.position.set(1, 2, 3);
      expect(controlledObject?.position.toArray()).toEqual([1, 2, 3]);

      await rerender(<SectionViewControls {...properties} renderPivot={[4, 5, 6]} />);
      expect(controlledObject?.position.toArray()).toEqual([1, 2, 3]);
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

  it('should send the first drag step of a frame at once, then only the latest step when the frame runs', async () => {
    const onSetRenderPivot = vi.fn<(value: [number, number, number]) => void>();
    const onTransformDragEnd = vi.fn<() => void>();
    const { scene, cleanup } = await renderSectionViewControls(
      <SectionViewControls
        {...baseProperties()}
        availablePlanes={[xyPlane]}
        renderPivot={[0, 0, 0]}
        selectedPlaneId='xy'
        onSetRenderPivot={onSetRenderPivot}
        onTransformDragEnd={onTransformDragEnd}
      />,
    );
    const frames = queueAnimationFrames();

    try {
      const { translate, object } = findTransformGizmo(scene);
      const dragTo = (x: number): void => {
        object.position.set(x, 0, 0);
        translate.dispatchEvent({ type: 'change' });
      };

      translate.dispatchEvent({ type: 'pointerDown', mode: 'translate' });
      dragTo(1);
      dragTo(2);
      dragTo(3);
      expect(onSetRenderPivot.mock.calls).toEqual([[[1, 0, 0]]]);

      frames.runFrame();
      expect(onSetRenderPivot.mock.calls).toEqual([[[1, 0, 0]], [[3, 0, 0]]]);

      dragTo(4);
      dragTo(5);
      expect(onSetRenderPivot).toHaveBeenLastCalledWith([4, 0, 0]);

      // Releasing applies the waiting step before announcing the end, and leaves no frame behind.
      translate.dispatchEvent({ type: 'pointerUp', mode: 'translate' });
      expect(onSetRenderPivot).toHaveBeenLastCalledWith([5, 0, 0]);
      expect(onTransformDragEnd).toHaveBeenCalledOnce();
      expect(onSetRenderPivot.mock.invocationCallOrder.at(-1)).toBeLessThan(
        onTransformDragEnd.mock.invocationCallOrder[0]!,
      );
      expect(frames.pendingCount()).toBe(0);
      expect(onSetRenderPivot).toHaveBeenCalledTimes(4);
    } finally {
      frames.restore();
      cleanup();
    }
  });

  it('should send the latest rotate step of a frame and drop a waiting one when the plane changes', async () => {
    const onSetRotation = vi.fn<(rotation: THREE.Euler) => void>();
    const onTransformDragEnd = vi.fn<() => void>();
    const origin: [number, number, number] = [0, 0, 0];
    const renderControls = (selectedPlaneId: 'xy' | 'xz'): React.ReactElement => (
      <SectionViewControls
        {...baseProperties()}
        availablePlanes={[xyPlane, xzPlane]}
        renderPivot={origin}
        selectedPlaneId={selectedPlaneId}
        onSetRotation={onSetRotation}
        onTransformDragEnd={onTransformDragEnd}
      />
    );
    const { scene, rerender, cleanup } = await renderSectionViewControls(renderControls('xy'));
    const frames = queueAnimationFrames();

    try {
      const { rotate, object } = findTransformGizmo(scene);
      const rotateTo = (angle: number): void => {
        object.rotation.set(angle, 0, 0);
        rotate.dispatchEvent({ type: 'change' });
      };
      const sentAngles = (): number[] => onSetRotation.mock.calls.map(([rotation]) => rotation.x);

      rotate.dispatchEvent({ type: 'pointerDown', mode: 'rotate' });
      rotateTo(0.1);
      rotateTo(0.2);
      rotateTo(0.3);
      frames.runFrame();
      expect(sentAngles()).toEqual([0.1, 0.3]);

      // The new plane resets its pivot and rotation, so the old plane's waiting step must not follow it.
      rotateTo(0.4);
      rotateTo(0.5);
      await rerender(renderControls('xz'));
      frames.runFrame();
      expect(sentAngles()).toEqual([0.1, 0.3, 0.4]);
      expect(onTransformDragEnd).toHaveBeenCalledOnce();
    } finally {
      frames.restore();
      cleanup();
    }
  });

  it('should apply a waiting drag step when the section view deactivates mid-drag', async () => {
    const onSetRenderPivot = vi.fn<(value: [number, number, number]) => void>();
    const onTransformDragEnd = vi.fn<() => void>();
    const origin: [number, number, number] = [0, 0, 0];
    const renderControls = (isActive: boolean): React.ReactElement => (
      <SectionViewControls
        {...baseProperties()}
        isActive={isActive}
        availablePlanes={[xyPlane]}
        renderPivot={origin}
        selectedPlaneId='xy'
        onSetRenderPivot={onSetRenderPivot}
        onTransformDragEnd={onTransformDragEnd}
      />
    );
    const { scene, rerender, cleanup } = await renderSectionViewControls(renderControls(true));
    const frames = queueAnimationFrames();

    try {
      const { translate, object } = findTransformGizmo(scene);
      translate.dispatchEvent({ type: 'pointerDown', mode: 'translate' });
      object.position.set(1, 0, 0);
      translate.dispatchEvent({ type: 'change' });
      object.position.set(2, 0, 0);
      translate.dispatchEvent({ type: 'change' });

      // Deactivating unmounts the gizmo, and React clears its mesh ref, before the drag ends.
      await rerender(renderControls(false));
      expect(onSetRenderPivot).toHaveBeenLastCalledWith([2, 0, 0]);
      expect(onTransformDragEnd).toHaveBeenCalledOnce();
      expect(frames.pendingCount()).toBe(0);
    } finally {
      frames.restore();
      cleanup();
    }
  });

  it("should land a frame's waiting drag step before R3F renders that frame", async () => {
    // Installed before mount so R3F's demand frames queue here too.
    const frames = queueAnimationFrames();
    const rendersAtStep: number[] = [];
    let countRenders = (): number => 0;
    const onSetRenderPivot = vi.fn<(value: [number, number, number]) => void>(() => {
      rendersAtStep.push(countRenders());
    });
    let cleanup: (() => void) | undefined;

    try {
      const rendered = await renderSectionViewControls(
        <SectionViewControls
          {...baseProperties()}
          availablePlanes={[xyPlane]}
          renderPivot={[0, 0, 0]}
          selectedPlaneId='xy'
          onSetRenderPivot={onSetRenderPivot}
        />,
        'demand',
      );
      cleanup = rendered.cleanup;
      for (let frame = 0; frame < 10 && frames.pendingCount() > 0; frame += 1) {
        frames.runFrame();
      }

      expect(frames.pendingCount()).toBe(0);
      const render = vi.mocked(rendered.gl.render);
      render.mockClear();
      countRenders = (): number => render.mock.calls.length;
      const { translate, object } = findTransformGizmo(rendered.scene);

      translate.dispatchEvent({ type: 'pointerDown', mode: 'translate' });
      object.position.set(1, 0, 0);
      translate.dispatchEvent({ type: 'change' });
      object.position.set(2, 0, 0);
      translate.dispatchEvent({ type: 'change' });
      frames.runFrame();

      expect(onSetRenderPivot).toHaveBeenLastCalledWith([2, 0, 0]);
      expect(rendersAtStep).toEqual([0, 0]);
      expect(render).toHaveBeenCalledOnce();
    } finally {
      cleanup?.();
      frames.restore();
    }
  });
});
