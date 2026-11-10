/**
 * The drag adapter and press handler: the DOM side of the kinematics actor's gesture. Rows drive real DOM events into
 * an adapter the real actor started, with time on a `StepClock`.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createActor } from 'xstate';
import type { Actor, SnapshotFrom } from 'xstate';
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Ray, Vector3 } from 'three';
import type { Camera } from 'three';
import { mock } from 'vitest-mock-extended';
import type { ThreeEvent } from '@react-three/fiber';
import type { Mechanism } from '@taucad/kinematics';
import { StepClock } from '@taucad/xstate-testing/clock';
import {
  createKinematicsDragAdapter,
  useKinematicsDragControls,
} from '#graphics/three/react/kinematics-drag-controls-adapter.js';
import type { KinematicsDragAdapterOptions } from '#graphics/three/react/kinematics-drag-controls-adapter.js';
import { setModelComponentOwner } from '#graphics/three/utils/model-component-owner.js';
import { KeyboardProvider, useKeybinding } from '@taucad/ui/components/keyboard';
import { getKinematicsUnitState, kinematicsDragMoveWindow, kinematicsMachine } from '#machines/kinematics.machine.js';
import type { KinematicsEmitted } from '#machines/kinematics.machine.js';

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
    status: 'active' as 'active' | 'stopped',
    send: vi.fn(),
  },
  viewer: undefined as ViewerState | undefined,
  renderFrame: { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
}));

vi.mock('#hooks/use-graphics.jsx', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useGraphics: () => ({
      getSnapshot: () => ({
        status: hooks.graphics.status,
        context: { modelPointerClickSuppressionReasons: hooks.graphics.suppressionReasons },
      }),
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

let clock: StepClock;

/** Let one coalescing window pass on the actor's clock. */
const flushFrame = (): void => {
  clock.advance(kinematicsDragMoveWindow);
};

const unitId = 'file:main.ts';
// The arm hinges about Z at the origin; the base is grounded.
const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: ['component:base'] }, arm: { components: ['component:arm'] } },
  joints: { hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [0, 0, 0], axis: [0, 0, 1] } },
};

/** An armed kinematics actor on its own clock, recording `poseSettled`. */
const startKinematics = () => {
  clock = new StepClock();
  const actor = createActor(kinematicsMachine, { input: {}, clock }).start();
  const settled: KinematicsEmitted[] = [];
  actor.on('poseSettled', (event) => {
    settled.push(event);
  });
  actor.send({ type: 'loadMechanism', unitId, mechanism });
  actor.send({ type: 'setDragEnabled', unitId, enabled: true });
  return { actor, settled };
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

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('createKinematicsDragAdapter', () => {
  let element: HTMLDivElement;
  let controls: { enabled: boolean };
  let graphicsSend: Mock<(event: { type: string }) => void>;
  let graphicsStatus: 'active' | 'stopped';
  let options: KinematicsDragAdapterOptions;
  let kinematics: Actor<typeof kinematicsMachine>;
  let settled: KinematicsEmitted[];

  const unit = () => getKinematicsUnitState(kinematics.getSnapshot().context, unitId);
  const graphicsEvents = (): string[] => graphicsSend.mock.calls.map(([event]) => event.type);
  const drag = () => unit().drag;

  /** The press as the handler sends it: the arm grabbed at the world origin, which is −1 in X in the GLB frame. */
  const pressArm = (): void => {
    kinematics.send({
      type: 'pressPart',
      unitId,
      componentId: 'component:arm',
      pointerId: 7,
      clientX: 100,
      clientY: 100,
      point: [-1, 0, 0],
      adapter: createKinematicsDragAdapter(options),
    });
  };

  beforeEach(() => {
    element = createViewerElement();
    // The GLB frame sits 1 unit along +X in the world, so world points map back by −1 in X.
    const root = new Group();
    root.position.set(1, 0, 0);
    root.updateMatrixWorld();

    controls = { enabled: true };
    graphicsSend = vi.fn();
    graphicsStatus = 'active';
    ({ actor: kinematics, settled } = startKinematics());
    options = {
      unitId,
      componentId: 'component:arm',
      pointerId: 7,
      grabPoint: new Vector3(0, 0, 0),
      element,
      canvas: element,
      camera: createCamera(),
      root,
      controls,
      graphics: {
        send: graphicsSend,
        getSnapshot: () => ({ status: graphicsStatus }),
      } as unknown as KinematicsDragAdapterOptions['graphics'],
    };
  });

  afterEach(() => {
    kinematics.stop();
  });

  describe('threshold', () => {
    it('should suspend the camera while pressed and leave a press under 4 px to the click', () => {
      pressArm();
      expect(controls.enabled).toBe(false);

      element.dispatchEvent(pointer('pointermove', [102, 102]));
      element.dispatchEvent(pointer('pointerup', [102, 102]));

      expect(drag()).toBeUndefined();
      expect(graphicsEvents()).toEqual([]);
      expect(element.setPointerCapture).not.toHaveBeenCalled();
      expect(controls.enabled).toBe(true);
      expect(kinematics.getSnapshot().value).toBe('idle');
    });

    it('should ignore other pointers', () => {
      pressArm();

      element.dispatchEvent(pointer('pointermove', [150, 100], { pointerId: 8 }));
      element.dispatchEvent(pointer('pointerup', [150, 100], { pointerId: 8 }));

      expect(drag()).toBeUndefined();
      expect(controls.enabled).toBe(false);
      expect(kinematics.getSnapshot().value).toBe('pressed');
    });
  });

  describe('drag', () => {
    it('should start after 4 px with capture, map the pointer onto the drag plane and coalesce moves per window', () => {
      pressArm();

      element.dispatchEvent(pointer('pointermove', [104, 100]));
      element.dispatchEvent(pointer('pointermove', [130, 100]));
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      expect(element.setPointerCapture).toHaveBeenCalledWith(7);
      expect(drag()).toMatchObject({ componentId: 'component:arm', link: 'arm', target: [-1, 0, 0] });
      expect(graphicsEvents()).toEqual(['beginViewerModelHoverSuppression', 'setHoveredModelComponent']);
      expect(element.style.cursor).toBe('grabbing');

      flushFrame();

      // 50 px right of centre is NDC 0.5, 5 units at the grab depth, 4 in the GLB frame.
      const [x, y, z] = drag()!.target;
      expect(x).toBeCloseTo(4);
      expect(y).toBeCloseTo(0);
      expect(z).toBeCloseTo(0);

      element.dispatchEvent(pointer('pointerup', [150, 100]));

      expect(drag()).toBeUndefined();
      expect(settled).toHaveLength(1);
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

    it('should solve the move still waiting for its window before ending the drag on release', () => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();
      const before = unit().coordinates['hinge'];

      element.dispatchEvent(pointer('pointermove', [190, 100]));
      element.dispatchEvent(pointer('pointerup', [190, 100]));
      flushFrame();

      expect(drag()).toBeUndefined();
      expect(unit().coordinates['hinge']).not.toBe(before);
      expect(settled).toHaveLength(1);
    });
  });

  describe('cancellation', () => {
    it('should cancel on Escape, ignore moves until release and then restore the camera', () => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();

      kinematics.send({ type: 'cancelGesture' });
      element.dispatchEvent(pointer('pointermove', [180, 100]));
      flushFrame();

      expect(drag()).toBeUndefined();
      expect(unit().coordinates).toEqual({ hinge: 0 });
      expect(controls.enabled).toBe(false);

      element.dispatchEvent(pointer('pointerup', [180, 100]));

      expect(unit().coordinates).toEqual({ hinge: 0 });
      expect(controls.enabled).toBe(true);
      expect(graphicsEvents()).toContain('markModelPointerGestureMoved');
      expect(settled).toHaveLength(1);
    });

    it.each(['pointercancel', 'lostpointercapture'])('should cancel and restore on %s', (type) => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();

      element.dispatchEvent(pointer(type, [150, 100]));

      expect(unit()).toMatchObject({ drag: undefined, coordinates: { hinge: 0 } });
      expect(controls.enabled).toBe(true);
      expect(kinematics.getSnapshot().value).toBe('idle');
    });

    it('should cancel an active drag and stop listening when the actor stops', () => {
      const removed = vi.spyOn(document, 'removeEventListener');
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      graphicsStatus = 'stopped';
      kinematics.stop();

      expect(removed.mock.calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'visibilitychange']),
      );
      expect(controls.enabled).toBe(true);
      expect(element.style.cursor).toBe('');
      // A view that is going away is not sent the hover release.
      expect(graphicsEvents()).toEqual(['beginViewerModelHoverSuppression', 'setHoveredModelComponent']);
    });

    it('should cancel the drag and restore the camera when the window loses focus', () => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));
      flushFrame();

      globalThis.dispatchEvent(new Event('blur'));
      element.dispatchEvent(pointer('pointermove', [170, 120], { buttons: 0 }));
      element.dispatchEvent(pointer('pointermove', [170, 120]));
      flushFrame();

      expect(unit()).toMatchObject({ drag: undefined, coordinates: { hinge: 0 } });
      expect(controls.enabled).toBe(true);
      expect(settled).toHaveLength(1);
    });

    it('should cancel the drag when the tab is hidden and ignore a visibility change that keeps it shown', () => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      document.dispatchEvent(new Event('visibilitychange'));
      expect(drag()).toBeDefined();

      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      try {
        document.dispatchEvent(new Event('visibilitychange'));
      } finally {
        Reflect.deleteProperty(document, 'visibilityState');
      }

      expect(drag()).toBeUndefined();
      expect(controls.enabled).toBe(true);
    });

    it('should end the drag where the pointer was when a move arrives without the primary button', () => {
      pressArm();
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      // The release happened outside the page; the next move reports no button held.
      element.dispatchEvent(pointer('pointermove', [170, 120], { buttons: 0 }));
      const kept = unit().coordinates['hinge'];
      element.dispatchEvent(pointer('pointermove', [190, 140]));
      flushFrame();

      expect(drag()).toBeUndefined();
      expect(Math.abs(kept ?? 0)).toBeGreaterThan(0.1);
      expect(unit().coordinates['hinge']).toBe(kept);
      expect(controls.enabled).toBe(true);
      expect(settled).toHaveLength(1);
    });

    it('should end a pending press on window blur without starting a drag', () => {
      pressArm();

      globalThis.dispatchEvent(new Event('blur'));
      element.dispatchEvent(pointer('pointermove', [150, 100]));

      expect(drag()).toBeUndefined();
      expect(controls.enabled).toBe(true);
      expect(kinematics.getSnapshot().value).toBe('idle');
    });
  });
});

describe('useKinematicsDragControls', () => {
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

  const renderControls = (wrapper: (props: { readonly children: ReactNode }) => React.JSX.Element = KeyboardProvider) =>
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

    ({ actor: kinematics } = startKinematics());
    kinematics.send({ type: 'setDragEnabled', unitId, enabled: false });
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

  it('should name the KeyboardProvider subpath when no provider is mounted above the viewer', () => {
    // React reports the render error to the console before rethrowing it; the assertion is the thrown message.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const renderWithoutProvider = (): void => {
      renderHook(() => useKinematicsDragControls({ unitId, scene, getPickableMeshes }));
    };

    expect(renderWithoutProvider).toThrow('@taucad/ui/components/keyboard');
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

    it('should end a press in flight and restore the camera when the viewer clears the unit', () => {
      const { result, unmount } = renderControls();
      setArmed(true);
      dragArm(result.current);
      expect(unit().coordinates['hinge']).not.toBe(0);

      // The kinematics viewer clears the unit as it unmounts it.
      unmount();
      act(() => {
        kinematics.send({ type: 'clearMechanism', unitId });
      });

      expect(unit().drag).toBeUndefined();
      expect(kinematics.getSnapshot().value).toBe('idle');
      expect(controls.enabled).toBe(true);
    });

    it('should register one set of pointer listeners per press under a StrictMode remount', () => {
      const added = vi.spyOn(document, 'addEventListener');
      function StrictKeyboard({ children }: { readonly children: ReactNode }): React.JSX.Element {
        return (
          <StrictMode>
            <KeyboardProvider>{children}</KeyboardProvider>
          </StrictMode>
        );
      }
      const { result } = renderControls(StrictKeyboard);
      setArmed(true);
      const pointerListeners = () => added.mock.calls.filter(([type]) => type === 'pointermove').length;
      const before = pointerListeners();

      dragArm(result.current);
      act(() => {
        result.current(press(4));
      });

      expect(pointerListeners() - before).toBe(1);
      element.dispatchEvent(pointer('pointerup', [100, 60]));
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
