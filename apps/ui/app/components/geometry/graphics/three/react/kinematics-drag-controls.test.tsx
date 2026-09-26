import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ReactNode } from 'react';
import { createActor } from 'xstate';
import type { Actor, SnapshotFrom } from 'xstate';
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Ray, Vector3 } from 'three';
import type { Camera } from 'three';
import { mock } from 'vitest-mock-extended';
import type { ThreeEvent } from '@react-three/fiber';
import type { Mechanism } from '@taucad/kinematics';
import {
  beginKinematicsDragGesture,
  useKinematicsDragControls,
} from '#components/geometry/graphics/three/react/kinematics-drag-controls.js';
import type { KinematicsDragGestureOptions } from '#components/geometry/graphics/three/react/kinematics-drag-controls.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { KeyboardProvider, useKeybinding } from '#hooks/use-keyboard.js';
import { getKinematicsUnitState, kinematicsMachine } from '#machines/kinematics.machine.js';

type ViewerState = Readonly<{
  camera: Camera;
  gl: { domElement: HTMLElement };
  controls: { enabled: boolean };
  events: { connected: HTMLElement };
}>;

const hooks = vi.hoisted(() => ({
  kinematics: undefined as Actor<typeof kinematicsMachine> | undefined,
  graphics: {
    suppressionReasons: [] as string[],
    send: vi.fn(),
  },
  viewer: undefined as ViewerState | undefined,
  renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
}));

vi.mock('#hooks/use-graphics.js', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useGraphics: () => ({
      getSnapshot: () => ({ context: { modelPointerClickSuppressionReasons: hooks.graphics.suppressionReasons } }),
      send: hooks.graphics.send,
    }),
    useKinematicsRef: () => hooks.kinematics,
    useKinematicsSelector: <T,>(selector: (snapshot: SnapshotFrom<typeof kinematicsMachine>) => T) =>
      useSelector(hooks.kinematics!, selector),
    useRenderFrame: () => hooks.renderFrame,
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: <T,>(selector: (state: { get: () => ViewerState | undefined }) => T) =>
    selector({ get: () => hooks.viewer }),
}));

// The jsdom environment has no PointerEvent: a MouseEvent carrying a pointer id exercises the same listeners.
const pointer = (
  type: string,
  [clientX, clientY]: readonly [number, number],
  { pointerId = 7, buttons = 1 }: Readonly<{ pointerId?: number; buttons?: number }> = {},
): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY, buttons });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
};

const escapeKeydown = (): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

let frames: FrameRequestCallback[];

const flushFrame = (): void => {
  for (const frame of frames.splice(0)) {
    frame(0);
  }
};

const createViewerElement = (): HTMLDivElement => {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 200 });
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);
  element.releasePointerCapture = vi.fn();
  document.body.append(element);
  return element;
};

// Camera 10 units in front of the origin with a 90° field of view: NDC 0.5 is 5 units at the origin's depth.
const createCamera = (): PerspectiveCamera => {
  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
};

beforeEach(() => {
  frames = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.splice(id - 1, 1);
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('beginKinematicsDragGesture', () => {
  let element: HTMLDivElement;
  let controls: { enabled: boolean };
  let sendKinematics: Mock<KinematicsDragGestureOptions['sendKinematics']>;
  let sendGraphics: Mock<KinematicsDragGestureOptions['sendGraphics']>;
  let onFinish: Mock<KinematicsDragGestureOptions['onFinish']>;
  let options: KinematicsDragGestureOptions;

  const kinematicsEvents = (): string[] => sendKinematics.mock.calls.map(([event]) => event.type);
  const graphicsEvents = (): string[] => sendGraphics.mock.calls.map(([event]) => event.type);
  const moveTargets = (): number[][] =>
    sendKinematics.mock.calls.flatMap(([event]) => (event.type === 'dragMove' ? [[...event.target]] : []));

  beforeEach(() => {
    element = createViewerElement();
    // The GLB frame sits 1 unit along +X in the world, so world points map back by −1 in X.
    const root = new Group();
    root.position.set(1, 0, 0);
    root.updateMatrixWorld();

    controls = { enabled: true };
    sendKinematics = vi.fn();
    sendGraphics = vi.fn();
    onFinish = vi.fn();
    options = {
      unitId: 'file:main.ts',
      componentId: 'component:planet-1',
      pointerId: 7,
      start: { clientX: 100, clientY: 100 },
      grabPoint: new Vector3(0, 0, 0),
      element,
      canvas: element,
      camera: createCamera(),
      root,
      controls,
      sendKinematics,
      sendGraphics,
      onFinish,
    };
  });

  describe('threshold', () => {
    it('should suspend the camera while pressed and leave a press under 4 px to the click', () => {
      beginKinematicsDragGesture(options);
      expect(controls.enabled).toBe(false);

      element.dispatchEvent(pointer('pointermove', [102, 102]));
      element.dispatchEvent(pointer('pointerup', [102, 102]));

      expect(kinematicsEvents()).toEqual([]);
      expect(graphicsEvents()).toEqual([]);
      expect(element.setPointerCapture).not.toHaveBeenCalled();
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should ignore other pointers', () => {
      beginKinematicsDragGesture(options);

      element.dispatchEvent(pointer('pointermove', [150, 100], { pointerId: 8 }));
      element.dispatchEvent(pointer('pointerup', [150, 100], { pointerId: 8 }));

      expect(kinematicsEvents()).toEqual([]);
      expect(controls.enabled).toBe(false);
    });
  });

  describe('drag', () => {
    it('should start after 4 px with capture, map the pointer onto the drag plane and coalesce moves per frame', () => {
      beginKinematicsDragGesture(options);

      element.dispatchEvent(pointer('pointermove', [104, 100]));
      element.dispatchEvent(pointer('pointermove', [130, 100]));
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      expect(element.setPointerCapture).toHaveBeenCalledWith(7);
      expect(sendKinematics).toHaveBeenCalledWith({
        type: 'dragStart',
        unitId: 'file:main.ts',
        componentId: 'component:planet-1',
        point: [-1, 0, 0],
      });
      expect(graphicsEvents()).toEqual(['beginViewerModelHoverSuppression', 'setHoveredModelComponent']);
      expect(element.style.cursor).toBe('grabbing');

      flushFrame();

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragMove']);
      const [target] = moveTargets();
      expect(target?.[0]).toBeCloseTo(4);
      expect(target?.[1]).toBeCloseTo(0);
      expect(target?.[2]).toBeCloseTo(0);

      element.dispatchEvent(pointer('pointerup', [150, 100]));

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragMove', 'dragEnd']);
      expect(graphicsEvents()).toEqual([
        'beginViewerModelHoverSuppression',
        'setHoveredModelComponent',
        'endViewerModelHoverSuppression',
        'markModelPointerGestureMoved',
      ]);
      expect(element.releasePointerCapture).toHaveBeenCalledWith(7);
      expect(controls.enabled).toBe(true);
      expect(element.style.cursor).toBe('');
    });

    it('should send the move still waiting for its frame before ending the drag on release', () => {
      beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();

      element.dispatchEvent(pointer('pointermove', [190, 100]));
      element.dispatchEvent(pointer('pointerup', [190, 100]));
      flushFrame();

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragMove', 'dragMove', 'dragEnd']);
      // 90 px right of centre is NDC 0.9, 9 units at the grab depth, 8 in the GLB frame.
      expect(moveTargets()[1]?.[0]).toBeCloseTo(8);
    });
  });

  describe('cancellation', () => {
    it('should cancel on request, ignore moves until release and then restore the camera', () => {
      const gesture = beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      expect(gesture.isDragging()).toBe(true);

      gesture.cancel();
      element.dispatchEvent(pointer('pointermove', [180, 100]));
      flushFrame();

      expect(gesture.isDragging()).toBe(false);
      expect(kinematicsEvents()).toEqual(['dragStart', 'dragCancel']);
      expect(controls.enabled).toBe(false);

      element.dispatchEvent(pointer('pointerup', [180, 100]));

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragCancel']);
      expect(controls.enabled).toBe(true);
      expect(graphicsEvents()).toContain('markModelPointerGestureMoved');
    });

    it.each(['pointercancel', 'lostpointercapture'])('should cancel and restore on %s', (type) => {
      beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      element.dispatchEvent(pointer(type, [150, 100]));

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragCancel']);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should cancel an active drag when disposed and stop listening', () => {
      const gesture = beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      gesture.dispose();
      element.dispatchEvent(pointer('pointermove', [180, 100]));
      element.dispatchEvent(pointer('pointerup', [180, 100]));
      flushFrame();

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragCancel']);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should cancel the drag and restore the camera when the window loses focus', () => {
      beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();

      globalThis.dispatchEvent(new Event('blur'));
      element.dispatchEvent(pointer('pointermove', [170, 120], { buttons: 0 }));
      element.dispatchEvent(pointer('pointermove', [170, 120]));
      flushFrame();

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragMove', 'dragCancel']);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should cancel the drag when the tab is hidden and ignore a visibility change that keeps it shown', () => {
      beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      document.dispatchEvent(new Event('visibilitychange'));
      expect(kinematicsEvents()).toEqual(['dragStart']);

      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragCancel']);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should end the drag where the pointer was when a move arrives without the primary button', () => {
      beginKinematicsDragGesture(options);
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      // The release happened outside the page; the next move reports no button held.
      element.dispatchEvent(pointer('pointermove', [170, 120], { buttons: 0 }));
      element.dispatchEvent(pointer('pointermove', [190, 140]));
      flushFrame();

      expect(kinematicsEvents()).toEqual(['dragStart', 'dragMove', 'dragEnd']);
      expect(moveTargets()[0]?.[0]).toBeCloseTo(4);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('should end a pending press on window blur without starting a drag', () => {
      beginKinematicsDragGesture(options);

      globalThis.dispatchEvent(new Event('blur'));
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      expect(kinematicsEvents()).toEqual([]);
      expect(controls.enabled).toBe(true);
      expect(onFinish).toHaveBeenCalledOnce();
    });
  });
});

describe('useKinematicsDragControls', () => {
  const unitId = 'file:main.ts';
  const mechanism: Mechanism = {
    schemaVersion: 1,
    units: { length: 'm', angle: 'rad' },
    root: 'base',
    links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
    joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
  };

  let element: HTMLDivElement;
  let controls: { enabled: boolean };
  let scene: Group;
  let meshes: Mesh[];
  let getPickableMeshes: Mock<() => Mesh[]>;
  let kinematics: Actor<typeof kinematicsMachine>;

  const unit = () => getKinematicsUnitState(kinematics.getSnapshot().context, unitId);
  const setArmed = (enabled: boolean): void => {
    act(() => {
      kinematics.send({ type: 'setDragEnabled', unitId, enabled });
    });
  };

  /** One press as R3F delivers it: a ray from in front of the model straight down −Z at `x`. */
  const press = (x: number, pointerType = 'mouse'): ThreeEvent<PointerEvent> =>
    mock<ThreeEvent<PointerEvent>>({
      nativeEvent: { button: 0, pointerId: 7, pointerType, clientX: 100, clientY: 100 },
      ray: new Ray(new Vector3(x, 0, 10), new Vector3(0, 0, -1)),
    });

  const renderControls = (wrapper = KeyboardProvider) =>
    renderHook(() => useKinematicsDragControls({ unitId, scene, getPickableMeshes }), { wrapper });

  /** Presses the arm and drags it far enough, and for long enough, to change its pose. */
  const dragArm = (handler: (event: ThreeEvent<PointerEvent>) => void): void => {
    act(() => {
      handler(press(4));
      element.dispatchEvent(pointer('pointermove', [100, 60]));
      flushFrame();
    });
  };

  beforeEach(() => {
    element = createViewerElement();
    controls = { enabled: true };
    // The base at the origin and the arm 4 units along +X, hinged about Z at the origin.
    const base = new Mesh(new BoxGeometry(2, 2, 2));
    setModelComponentOwner(base, { unitId, componentId: 'component:base' });
    const arm = new Mesh(new BoxGeometry(2, 2, 2));
    arm.position.set(4, 0, 0);
    setModelComponentOwner(arm, { unitId, componentId: 'component:arm' });
    scene = new Group();
    scene.add(base, arm);
    scene.updateMatrixWorld(true);
    meshes = [base, arm];
    getPickableMeshes = vi.fn(() => meshes);

    kinematics = createActor(kinematicsMachine, { input: {} }).start();
    kinematics.send({ type: 'loadMechanism', unitId, mechanism });
    hooks.kinematics = kinematics;
    hooks.graphics.suppressionReasons = [];
    hooks.graphics.send.mockClear();
    hooks.viewer = {
      camera: createCamera(),
      gl: { domElement: element },
      controls,
      events: { connected: element },
    };
  });

  afterEach(() => {
    // Unmount first: a drag in flight cancels through the actor before it stops.
    cleanup();
    kinematics.stop();
  });

  describe('arming', () => {
    it('should leave every press to the camera while the pane does not arm the unit', () => {
      const { result } = renderControls();

      act(() => {
        result.current(press(4));
        result.current(press(0));
      });
      element.dispatchEvent(pointer('pointermove', [100, 60]));
      flushFrame();

      expect(controls.enabled).toBe(true);
      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates).toEqual({ hinge: 0 });
    });

    it('should leave a touch press to the camera', () => {
      const { result } = renderControls();
      setArmed(true);

      act(() => {
        result.current(press(4, 'touch'));
      });
      element.dispatchEvent(pointer('pointermove', [100, 60]));
      flushFrame();

      expect(controls.enabled).toBe(true);
      expect(unit().drag).toBeUndefined();
    });

    it('should leave presses to the measure tool while it suppresses model clicks', () => {
      hooks.graphics.suppressionReasons = ['measure'];
      const { result } = renderControls();
      setArmed(true);

      act(() => {
        result.current(press(4));
        result.current(press(0));
      });
      element.dispatchEvent(pointer('pointermove', [100, 60]));
      flushFrame();

      expect(controls.enabled).toBe(true);
      expect(unit().drag).toBeUndefined();
    });
  });

  describe('grounded parts', () => {
    it('should leave a press on a grounded part to the camera, handling each press once', () => {
      const { result } = renderControls();
      setArmed(true);
      const grounded = press(0);

      // R3F delivers one press once per intersected object.
      act(() => {
        result.current(grounded);
        result.current(grounded);
        result.current(grounded);
      });

      // Later deliveries of the same press neither raycast again nor stack listeners.
      expect(getPickableMeshes).toHaveBeenCalledOnce();
      expect(controls.enabled).toBe(true);

      element.dispatchEvent(pointer('pointerup', [100, 100]));

      expect(unit().drag).toBeUndefined();
    });
  });

  describe('drag', () => {
    it('should drag the arm while armed and keep the pose on release', () => {
      const { result } = renderControls();
      setArmed(true);

      dragArm(result.current);

      expect(controls.enabled).toBe(false);
      expect(unit().drag).toMatchObject({ componentId: 'component:arm', link: 'arm' });
      const dragged = unit().coordinates['hinge'];
      expect(Math.abs(dragged ?? 0)).toBeGreaterThan(0.1);

      element.dispatchEvent(pointer('pointerup', [100, 60]));

      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates['hinge']).toBe(dragged);
      expect(controls.enabled).toBe(true);
    });

    it('should cancel a drag in flight and restore the camera on unmount', () => {
      const { result, unmount } = renderControls();
      setArmed(true);
      dragArm(result.current);
      expect(unit().coordinates['hinge']).not.toBe(0);

      unmount();

      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates).toEqual({ hinge: 0 });
      expect(controls.enabled).toBe(true);
    });
  });

  describe('Escape', () => {
    const closeSectionView = vi.fn();

    /** The section-view status binds Escape while it is shown (`chat-interface-status.tsx`). */
    function SectionViewStatus(): undefined {
      useKeybinding({ key: 'Escape' }, closeSectionView, { enabled: true, ignoreInputs: true });
      return undefined;
    }

    function WithSectionView({ children }: { readonly children: ReactNode }): React.JSX.Element {
      return (
        <KeyboardProvider>
          <SectionViewStatus />
          {children}
        </KeyboardProvider>
      );
    }

    beforeEach(() => {
      closeSectionView.mockClear();
    });

    it('should cancel the drag ahead of the section view and leave Escape to it once the drag is over', () => {
      const { result } = renderControls(WithSectionView);
      setArmed(true);
      dragArm(result.current);

      const escape = escapeKeydown();
      act(() => {
        document.body.dispatchEvent(escape);
      });

      expect(escape.defaultPrevented).toBe(true);
      expect(unit().drag).toBeUndefined();
      expect(unit().coordinates).toEqual({ hinge: 0 });
      expect(closeSectionView).not.toHaveBeenCalled();
      // The button is still down, so the camera waits for the release.
      expect(controls.enabled).toBe(false);

      element.dispatchEvent(pointer('pointerup', [100, 60]));
      act(() => {
        document.body.dispatchEvent(escapeKeydown());
      });

      expect(controls.enabled).toBe(true);
      expect(closeSectionView).toHaveBeenCalledOnce();
    });
  });
});
