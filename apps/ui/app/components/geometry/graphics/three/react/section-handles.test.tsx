import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { SpatialBounds } from '@taucad/spatial';
import * as handleOwners from '#components/geometry/graphics/three/controls/section-handles.js';
import type { SectionPlanePicker } from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import { SectionHandles } from '#components/geometry/graphics/three/react/section-handles.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { AddSectionCutPayload } from '#machines/graphics.machine.js';

type FrameCallback = (state: Readonly<{ camera: THREE.Camera; size: Readonly<{ height: number }> }>) => void;

type CompileAsync = (scene: THREE.Object3D, camera: THREE.Camera) => Promise<THREE.Object3D>;

const mocks = vi.hoisted(() => {
  const bounds: SpatialBounds = { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] };
  return {
    actor: undefined as unknown,
    state: undefined as unknown,
    frame: undefined as FrameCallback | undefined,
    bounds,
    cameraRig: undefined as unknown,
  };
});

vi.mock('#hooks/use-graphics.js', async () => {
  const { useSelector } = await import('@xstate/react');
  return {
    useGraphics: () => mocks.actor,
    useGraphicsSelector: (selector: (snapshot: unknown) => unknown) =>
      useSelector(mocks.actor as Parameters<typeof useSelector>[0], selector),
    useCameraRig: () => mocks.cameraRig,
    useCameraSelector: (selector: (snapshot: unknown) => unknown) =>
      selector({ context: { view: { bounds: mocks.bounds } } }),
    useRenderFrame: () => ({ anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 0.001 }),
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(mocks.state),
  useFrame: (callback: FrameCallback) => {
    mocks.frame = callback;
  },
}));

vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({ SceneOverlay: () => null }));

const createGraphicsActor = () =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }), {
    input: {},
  });

type GraphicsActor = ReturnType<typeof createGraphicsActor>;

type Point = Readonly<{ x: number; y: number }>;

type HarnessOptions = Readonly<{
  planePicker?: SectionPlanePicker;
  /** Cuts added in order, so the last is selected. One XY plane by default. */
  cuts?: readonly AddSectionCutPayload[];
  /** Where the camera stands, looking at the origin, and its up. Below the model and a little above by default. */
  eye?: readonly [number, number, number];
  up?: readonly [number, number, number];
  compileAsync?: CompileAsync;
  /**
   * Mount as the chat viewer does: R3F's `eventSource` is an element covering the canvas, which takes every pointer
   * event. Otherwise R3F listens on the canvas's parent, and presses land on the canvas.
   */
  hasEventSource?: boolean;
}>;

type Harness = Readonly<{
  actor: GraphicsActor;
  canvas: HTMLCanvasElement;
  /** R3F's `events.connected`: the element the tools listen on, capture the pointer on and show cursors on. */
  surface: HTMLElement;
  controls: { enabled: boolean };
  compileAsync: Mock<CompileAsync>;
  perspectiveCamera: THREE.PerspectiveCamera;
  orthographicCamera: THREE.OrthographicCamera;
  /** Every pointer and click event that reached a listener on the surface added before the handles mounted. */
  toolEvents: string[];
  runFrame: () => void;
  /** Dispatched on the surface under an event source, else on the canvas, or on `target`. */
  pointer: (type: string, at: Point & Readonly<{ buttons?: number; target?: HTMLElement }>) => void;
  send: (event: Parameters<GraphicsActor['send']>[0]) => void;
  cuts: () => ReturnType<GraphicsActor['getSnapshot']>['context']['sectionCuts'];
}>;

const mountHandles = ({
  planePicker,
  cuts = [{ kind: 'plane', plane: 'xy' }],
  eye = [0, -1000, 300],
  up = [0, 0, 1],
  compileAsync = async (scene) => scene,
  hasEventSource = false,
}: HarnessOptions = {}): Harness => {
  const actor = createGraphicsActor();
  actor.start();
  for (const payload of cuts) {
    actor.send({ type: 'addSectionCut', payload });
  }
  mocks.actor = actor;

  const parent = document.createElement('div');
  const canvas = document.createElement('canvas');
  parent.append(canvas);
  const eventSource = hasEventSource ? document.createElement('div') : undefined;
  if (eventSource) {
    parent.append(eventSource);
  }
  const surface = eventSource ?? parent;
  document.body.append(parent);
  let captured: number | undefined;
  surface.setPointerCapture = (pointerId) => {
    captured = pointerId;
  };
  surface.hasPointerCapture = (pointerId) => captured === pointerId;
  surface.releasePointerCapture = () => {
    captured = undefined;
  };
  // As the camera controls, R3F and Measure do: on the surface, in the bubble phase, before the handles mount.
  const toolEvents: string[] = [];
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mousemove', 'click']) {
    surface.addEventListener(type, () => toolEvents.push(type));
  }

  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100_000);
  camera.position.set(...eye);
  camera.up.set(...up);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const perspectiveCamera = new THREE.PerspectiveCamera();
  const orthographicCamera = new THREE.OrthographicCamera();
  mocks.cameraRig = {
    actorRef: { getSnapshot: () => ({ context: { view: { direction: [0.6, -0.6, 0.5] } } }) },
    perspectiveCamera,
    orthographicCamera,
  };
  const compile = vi.fn(compileAsync);
  const controls = { enabled: true };
  const state = {
    gl: { domElement: canvas, compileAsync: compile },
    camera,
    size: { width: 800, height: 600 },
    controls,
    events: { connected: surface },
    invalidate: vi.fn(),
    get: () => state,
  };
  mocks.state = state;

  render(<SectionHandles planePicker={planePicker} />);
  act(() => {
    mocks.frame?.({ camera, size: state.size });
  });

  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    nextFrame++;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });

  return {
    actor,
    canvas,
    surface,
    controls,
    compileAsync: compile,
    perspectiveCamera,
    orthographicCamera,
    toolEvents,
    runFrame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => {
        for (const callback of callbacks) {
          callback(0);
        }
      });
    },
    pointer: (type, { x, y, buttons = type === 'pointerup' || type === 'click' ? 0 : 1, target }) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'offsetX', { value: x });
      Object.defineProperty(event, 'offsetY', { value: y });
      act(() => {
        (target ?? eventSource ?? canvas).dispatchEvent(event);
      });
    },
    send: (event) => {
      act(() => {
        actor.send(event);
      });
    },
    cuts: () => actor.getSnapshot().context.sectionCuts,
  };
};

const isHoverSuppressed = (harness: Harness): boolean =>
  harness.actor.getSnapshot().context.viewerHoverSuppressionReasons.includes('sectionViewTransform');

const selectedCutId = (harness: Harness): string => harness.actor.getSnapshot().context.selectedSectionCutId ?? '';

describe('SectionHandles', () => {
  let harness: Harness | undefined;

  beforeEach(() => {
    harness = undefined;
  });

  afterEach(() => {
    cleanup();
    harness?.actor.stop();
    harness?.canvas.parentElement?.remove();
    vi.restoreAllMocks();
  });

  it('should drag a plane cut along its axis, holding the pointer from the camera, Measure and the model', () => {
    harness = mountHandles();
    const [cut] = harness.cuts();

    harness.pointer('pointerdown', { x: 400, y: 300 });
    expect(isHoverSuppressed(harness)).toBe(true);
    expect(harness.controls.enabled).toBe(false);

    harness.pointer('pointermove', { x: 400, y: 250 });
    const [moved] = harness.cuts();
    expect(moved?.id).toBe(cut?.id);
    const offset = moved?.kind === 'plane' ? moved.offset : Number.NaN;
    // Up the screen is up the cut's Z axis, in metres to the millimetre.
    expect(offset).toBeGreaterThan(0.05);
    expect(Math.round(offset * 1000) / 1000).toBe(offset);

    harness.pointer('pointerup', { x: 400, y: 250 });
    harness.pointer('click', { x: 400, y: 250 });
    expect(isHoverSuppressed(harness)).toBe(false);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.toolEvents).toEqual([]);
  });

  it('should own a handle press through an event source covering the canvas, whatever listens there first or later', () => {
    harness = mountHandles({ hasEventSource: true });
    const { surface } = harness;
    // Added after the handles mounted, as a tool mounted later would be, and in the capture phase too.
    const lateEvents: string[] = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mousemove', 'click']) {
      surface.addEventListener(type, () => lateEvents.push(type), { capture: true });
    }
    const [cut] = harness.cuts();

    harness.pointer('pointermove', { x: 400, y: 300, buttons: 0 });
    harness.runFrame();
    expect(surface.classList.contains('cursor-grab')).toBe(true);

    harness.pointer('pointerdown', { x: 400, y: 300 });
    expect(surface.hasPointerCapture(1)).toBe(true);
    expect(surface.classList.contains('cursor-grabbing')).toBe(true);
    harness.pointer('pointermove', { x: 400, y: 250 });
    harness.pointer('pointerup', { x: 400, y: 250 });
    harness.pointer('click', { x: 400, y: 250 });

    const [moved] = harness.cuts();
    expect(moved?.id).toBe(cut?.id);
    expect(moved?.kind === 'plane' ? moved.offset : Number.NaN).toBeGreaterThan(0.05);
    // Only the hover move before the press reached the other tools.
    expect(harness.toolEvents).toEqual(['pointermove']);
    expect(lateEvents).toEqual(['pointermove']);

    // A press on DOM laid over the canvas, such as the view cube, or away from every handle is theirs.
    const cube = document.createElement('div');
    surface.append(cube);
    harness.pointer('pointerdown', { x: 400, y: 300, target: cube });
    harness.pointer('pointerup', { x: 400, y: 300, target: cube });
    harness.pointer('pointerdown', { x: 40, y: 40 });
    harness.pointer('click', { x: 40, y: 40 });
    expect(harness.cuts()[0]).toBe(moved);
    expect(harness.toolEvents).toEqual(['pointermove', 'pointerdown', 'pointerup', 'pointerdown', 'click']);
    expect(lateEvents).toEqual(harness.toolEvents);
  });

  it('should keep a dragged plane within the bounds centre ± 2 × radius along its axis', () => {
    harness = mountHandles();
    harness.send({ type: 'sceneRadiusUpdated', radius: 0.01, centerMeters: [0, 0, 0.005] });

    harness.pointer('pointerdown', { x: 400, y: 300 });
    harness.pointer('pointermove', { x: 400, y: 250 });
    harness.pointer('pointerup', { x: 400, y: 250 });

    const [cut] = harness.cuts();
    expect(cut?.kind === 'plane' ? cut.offset : Number.NaN).toBeCloseTo(0.025, 9);
  });

  it.each([
    { view: 'Front', plane: 'xz', eye: [0, -1000, 0], up: [0, 0, 1] },
    { view: 'Top', plane: 'xy', eye: [0, 0, 1000], up: [0, 1, 0] },
    { view: 'Right', plane: 'yz', eye: [1000, 0, 0], up: [0, 0, 1] },
  ] as const)(
    'should hold a $plane plane whose arrow points at the camera in the $view view where it is when dragged',
    ({ plane, eye, up }) => {
      harness = mountHandles({ cuts: [{ kind: 'plane', plane }], eye, up });
      const before = harness.cuts();

      // The press lands on the arrow along the view axis, where the drag has no parameter.
      harness.pointer('pointerdown', { x: 400, y: 300 });
      expect(isHoverSuppressed(harness)).toBe(true);
      harness.pointer('pointermove', { x: 400, y: 290 });
      harness.pointer('pointermove', { x: 412, y: 280 });
      harness.runFrame();
      harness.pointer('pointerup', { x: 412, y: 280 });

      // Every later ray meets the axis at the camera: the plane holds rather than jumping there.
      expect(harness.cuts()).toBe(before);
    },
  );

  it('should leave a press away from every handle to the other tools', () => {
    harness = mountHandles();

    harness.pointer('pointerdown', { x: 40, y: 40 });
    harness.pointer('click', { x: 40, y: 40 });

    expect(isHoverSuppressed(harness)).toBe(false);
    expect(harness.toolEvents).toEqual(['pointerdown', 'click']);
  });

  it('should drop a waiting drag step when the cut loses the selection', () => {
    harness = mountHandles();
    harness.pointer('pointerdown', { x: 400, y: 300 });
    harness.pointer('pointermove', { x: 400, y: 250 });
    const [afterFirstStep] = harness.cuts();

    harness.pointer('pointermove', { x: 400, y: 200 });
    harness.send({ type: 'selectSectionCut', payload: undefined });
    harness.runFrame();

    expect(harness.cuts()[0]).toBe(afterFirstStep);
    expect(isHoverSuppressed(harness)).toBe(false);
    expect(harness.controls.enabled).toBe(true);
  });

  describe('drag exits', () => {
    type DragPath = Readonly<{ options: HarnessOptions; press: Point; steps: readonly [Point, Point, Point] }>;

    // A plane drag, beside a second cut so the dragged one can go while Section stays on.
    const planeDrag: DragPath = {
      options: {
        cuts: [
          { kind: 'plane', plane: 'yz' },
          { kind: 'plane', plane: 'xy' },
        ],
      },
      press: { x: 400, y: 300 },
      steps: [
        { x: 400, y: 250 },
        { x: 400, y: 200 },
        { x: 400, y: 150 },
      ],
    };
    // A revolution seen from above: its end knob stands a quarter turn up from the start knob, right of the centre.
    const sweepDrag: DragPath = {
      options: { cuts: [{ kind: 'revolution', axis: 'z' }], eye: [0, 0, 1000], up: [0, 1, 0] },
      press: { x: 400, y: 280 },
      steps: [
        { x: 380, y: 280 },
        { x: 360, y: 280 },
        { x: 340, y: 280 },
      ],
    };

    type Exit = Readonly<{ exit: string; drag: DragPath; end: (harness: Harness) => void }>;

    it.each<Exit>([
      {
        exit: 'the release',
        drag: planeDrag,
        end: (h) => {
          h.pointer('pointerup', planeDrag.steps[1]);
        },
      },
      {
        exit: 'a pointer cancel',
        drag: planeDrag,
        end: (h) => {
          h.pointer('pointercancel', planeDrag.steps[1]);
        },
      },
      {
        exit: 'a lost pointer capture',
        drag: planeDrag,
        end: (h) => {
          h.pointer('lostpointercapture', planeDrag.steps[1]);
        },
      },
      {
        exit: 'the cut going',
        drag: planeDrag,
        end: (h) => {
          h.send({ type: 'removeSectionCut', payload: selectedCutId(h) });
        },
      },
      {
        exit: 'the cut moving to another plane',
        drag: planeDrag,
        end: (h) => {
          h.send({ type: 'updateSectionCut', payload: { id: selectedCutId(h), patch: { plane: 'xz' } } });
        },
      },
      {
        exit: 'the cut turning to another axis',
        drag: sweepDrag,
        end: (h) => {
          h.send({ type: 'updateSectionCut', payload: { id: selectedCutId(h), patch: { axis: 'x' } } });
        },
      },
      {
        exit: 'Section turning off',
        drag: planeDrag,
        end: (h) => {
          h.send({ type: 'setSectionViewActive', payload: false });
        },
      },
      {
        exit: 'an unmount',
        drag: planeDrag,
        end: () => {
          cleanup();
        },
      },
    ])('should give everything back and land no later step on $exit', ({ drag, end }) => {
      const current = mountHandles(drag.options);
      harness = current;
      const [firstStep, waitingStep, laterStep] = drag.steps;
      const before = current.cuts();
      current.pointer('pointerdown', drag.press);
      current.pointer('pointermove', firstStep);
      expect(current.cuts()).not.toBe(before);
      expect(isHoverSuppressed(current)).toBe(true);
      expect(current.controls.enabled).toBe(false);
      expect(current.surface.hasPointerCapture(1)).toBe(true);
      current.pointer('pointermove', waitingStep);

      end(current);
      const afterExit = current.cuts();

      expect(current.controls.enabled).toBe(true);
      expect(isHoverSuppressed(current)).toBe(false);
      expect(current.surface.hasPointerCapture(1)).toBe(false);
      current.runFrame();
      current.pointer('pointermove', laterStep);
      current.runFrame();
      expect(current.cuts()).toBe(afterExit);
    });
  });

  it('should link a hovered handle with its cut, and skip hover picks while a button is held', () => {
    harness = mountHandles();
    const [cut] = harness.cuts();

    harness.pointer('pointermove', { x: 400, y: 300, buttons: 1 });
    harness.runFrame();
    expect(harness.actor.getSnapshot().context.hoveredSectionCutId).toBeUndefined();

    harness.pointer('pointermove', { x: 400, y: 300, buttons: 0 });
    harness.runFrame();
    expect(harness.actor.getSnapshot().context.hoveredSectionCutId).toBe(cut?.id);

    harness.pointer('pointerleave', { x: 900, y: 300, buttons: 0 });
    expect(harness.actor.getSnapshot().context.hoveredSectionCutId).toBeUndefined();
  });

  describe('plane picker', () => {
    const createPicker = (): SectionPlanePicker => {
      const picker = mock<SectionPlanePicker>();
      picker.pick.mockReturnValue('yz');
      return picker;
    };

    it('should move the selected plane cut to a clicked tile through the centre, removing the side facing the camera', () => {
      // The camera looks from −Y, so the XZ plane is flipped; it looks from +X, so a YZ plane is not.
      harness = mountHandles({
        planePicker: createPicker(),
        cuts: [{ kind: 'plane', plane: 'xz', viewDirection: [0.6, -0.6, 0.5] }],
      });
      const [cut] = harness.cuts();
      expect(cut).toMatchObject({ plane: 'xz', isFlipped: true });

      harness.pointer('pointerdown', { x: 660, y: 60 });
      expect(isHoverSuppressed(harness)).toBe(true);
      harness.pointer('pointerup', { x: 660, y: 60 });

      expect(harness.cuts()).toEqual([{ ...cut, plane: 'yz', offset: 0, isFlipped: false }]);
      expect(isHoverSuppressed(harness)).toBe(false);
      expect(harness.toolEvents).toEqual([]);
    });

    it('should add a clicked tile plane when no plane cut is selected', () => {
      harness = mountHandles({ planePicker: createPicker() });
      harness.send({ type: 'selectSectionCut', payload: undefined });

      harness.pointer('pointerdown', { x: 660, y: 60 });
      harness.pointer('pointerup', { x: 660, y: 60 });

      const cuts = harness.cuts();
      expect(cuts.map((cut) => (cut.kind === 'plane' ? cut.plane : cut.axis))).toEqual(['xy', 'yz']);
      expect(harness.actor.getSnapshot().context.selectedSectionCutId).toBe(cuts[1]?.id);
    });

    it('should leave a tile dragged off without a click', () => {
      harness = mountHandles({ planePicker: createPicker() });
      const before = harness.cuts();

      harness.pointer('pointerdown', { x: 660, y: 60 });
      harness.pointer('pointermove', { x: 700, y: 60 });
      harness.pointer('pointerup', { x: 700, y: 60 });

      expect(harness.cuts()).toBe(before);
    });

    it.each([
      { selection: 'a revolution cut', isDeselected: false },
      { selection: 'no cut', isDeselected: true },
    ])(
      'should dim the picker at the cut limit with $selection selected, and own a press on a tile without acting on it',
      ({ isDeselected }) => {
        const picker = createPicker();
        harness = mountHandles({
          planePicker: picker,
          cuts: [
            { kind: 'plane', plane: 'xy' },
            { kind: 'plane', plane: 'yz' },
            { kind: 'plane', plane: 'xz' },
            { kind: 'revolution', axis: 'z' },
          ],
        });
        if (isDeselected) {
          harness.send({ type: 'selectSectionCut', payload: undefined });
        }
        const before = harness.cuts();
        const isActionCursor = (): boolean => harness?.surface.classList.contains('cursor-action') === true;

        // A dimmed tile takes no hover.
        harness.pointer('pointermove', { x: 660, y: 60, buttons: 0 });
        harness.runFrame();
        expect(isActionCursor()).toBe(false);

        // Its press is held from the camera and stopped before Measure and the model, and then does nothing.
        const received: string[] = [];
        harness.actor.system.inspect((inspection) => {
          if (inspection.type === '@xstate.transition') {
            received.push(inspection.eventType);
          }
        });
        harness.pointer('pointerdown', { x: 660, y: 60 });
        expect(harness.controls.enabled).toBe(false);
        expect(isActionCursor()).toBe(false);
        harness.pointer('pointerup', { x: 660, y: 60 });
        harness.pointer('click', { x: 660, y: 60 });

        expect(picker.paint).toHaveBeenLastCalledWith({
          current: undefined,
          hovered: undefined,
          active: undefined,
          isDimmed: true,
        });
        expect(harness.cuts()).toBe(before);
        // It holds and releases the viewer, and asks for no cut (which the machine would refuse at the limit anyway).
        expect(received).toEqual(['beginViewerModelHoverSuppression', 'endViewerModelHoverSuppression']);
        expect(harness.controls.enabled).toBe(true);
        expect(isHoverSuppressed(harness)).toBe(false);
        // Only the hover move reached the tools behind the picker.
        expect(harness.toolEvents).toEqual(['pointermove']);
      },
    );

    it('should keep the picker live at the cut limit to move a selected plane cut', () => {
      const picker = createPicker();
      harness = mountHandles({
        planePicker: picker,
        cuts: [
          { kind: 'revolution', axis: 'z' },
          { kind: 'revolution', axis: 'x' },
          { kind: 'plane', plane: 'xz' },
          { kind: 'plane', plane: 'xy' },
        ],
      });
      const cuts = harness.cuts();

      harness.pointer('pointerdown', { x: 660, y: 60 });
      harness.pointer('pointerup', { x: 660, y: 60 });

      expect(picker.paint).toHaveBeenLastCalledWith(expect.objectContaining({ current: 'yz', isDimmed: false }));
      expect(harness.cuts()).toEqual([...cuts.slice(0, 3), { ...cuts[3], plane: 'yz', offset: 0 }]);
      expect(harness.toolEvents).toEqual([]);
    });
  });

  it('should prepare only demanded handles without compiling unused projections or picker copies', () => {
    let handles: ReturnType<typeof handleOwners.createSectionHandles> | undefined;
    const originalCreate = handleOwners.createSectionHandles;
    const create = vi.spyOn(handleOwners, 'createSectionHandles').mockImplementation((...args) => {
      handles = originalCreate(...args);
      return handles;
    });
    harness = mountHandles({ planePicker: mock<SectionPlanePicker>() });
    expect(create).toHaveBeenCalledOnce();
    if (!handles) {
      throw new Error('Expected the actual demanded handle owner.');
    }
    const dispose = vi.spyOn(handles, 'dispose');
    harness.send({ type: 'setSectionViewActive', payload: false });
    harness.send({ type: 'setSectionViewActive', payload: true });
    harness.send({ type: 'selectSectionCut', payload: undefined });
    harness.send({ type: 'addSectionCut', payload: { kind: 'revolution', axis: 'z' } });
    expect(harness.compileAsync).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    cleanup();
    expect(dispose).toHaveBeenCalledOnce();
    cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
