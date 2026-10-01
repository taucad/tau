import { Profiler } from 'react';
import { act, waitFor } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ReconcilerRoot, RootState } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { AddSectionCutPayload } from '#machines/graphics.machine.js';
import type { SectionCutPatch } from '#components/geometry/graphics/section-cuts.js';
import { getMeshMeasurementFeatures } from '#components/geometry/graphics/three/utils/measurement-features.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { SectionHandles } from '#components/geometry/graphics/three/react/section-handles.js';
import type { SectionPlanePicker } from '#components/geometry/graphics/three/controls/section-plane-picker.js';
import { hasSceneTag, sceneTag } from '#components/geometry/graphics/three/utils/scene-tags.js';

// The handles draw in their own overlay; a press picks their objects directly, which need no scene.
vi.mock('#components/geometry/graphics/three/scene-overlay.js', () => ({ SceneOverlay: () => null }));

function createStubWebGlRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = Object.create(THREE.WebGLRenderer.prototype) as THREE.WebGLRenderer;
  Object.defineProperties(renderer, {
    compileAsync: { value: vi.fn(async () => undefined) },
    dispose: { value: vi.fn() },
    domElement: { value: canvas },
    render: { value: vi.fn() },
    setPixelRatio: { value: vi.fn() },
    setSize: { value: vi.fn() },
    outputColorSpace: { value: '', writable: true },
    toneMapping: { value: 0, writable: true },
    toneMappingExposure: { value: 1, writable: true },
  });
  return renderer;
}

/** Metres, which are render units here: the cut removes everything above it. */
const cutHeight = -0.05;

describe('MeasureTool with section cuts', () => {
  let actor: Actor<typeof graphicsMachine>;
  let canvas: HTMLCanvasElement;
  let root: ReconcilerRoot<HTMLCanvasElement>;
  let getState: () => RootState;
  let model: THREE.Mesh;
  let measureCommits = 0;
  // Beside the view cube in the viewer; here only its picks matter, and it picks nothing unless a test says so.
  let planePicker: MockProxy<SectionPlanePicker>;
  // Looking along +Y at the -Y face of a 2 m cube about the origin, which the cut crosses near its middle.
  const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
  camera.position.set(0, -10, 0);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const certify = (): void => {
    actor.send({
      type: 'setSectionCertification',
      payload: { status: 'certified', cuts: actor.getSnapshot().context.sectionCuts },
    });
  };

  const pixelOf = (x: number, y: number, z: number): readonly [number, number] => {
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    return [((ndc.x + 1) / 2) * 800, ((1 - ndc.y) / 2) * 600];
  };

  const dispatch = (type: string, [x, y]: readonly [number, number]): void => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, { pointerId: { value: 1 }, offsetX: { value: x }, offsetY: { value: y } });
    act(() => {
      canvas.dispatchEvent(event);
    });
  };

  const click = (at: readonly [number, number]): void => {
    dispatch('pointerdown', at);
    dispatch('pointerup', at);
    dispatch('click', at);
  };

  /** Moves the first cut to `offset` and lets the caps commit it, as a drag step does. */
  const moveFirstCut = (offset: number): void => {
    const [cut] = actor.getSnapshot().context.sectionCuts;
    act(() => {
      actor.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset } } });
      certify();
    });
  };

  /** Holds animation frames until `run`, so a test decides when a coalesced pointer step lands. */
  const holdFrames = (): Readonly<{ run: () => void }> => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    return {
      run: () => {
        const callbacks = [...frames.values()];
        frames.clear();
        act(() => {
          for (const callback of callbacks) {
            callback(0);
          }
        });
      },
    };
  };

  /** Heights of the measurement marks drawn: snap indicators, the start point and the preview line. */
  const measurementMarkHeights = (): number[] => {
    const heights: number[] = [];
    const { scene } = getState();
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && hasSceneTag(object, sceneTag.measurementUi)) {
        heights.push(object.getWorldPosition(new THREE.Vector3()).z);
      }
    });
    return heights;
  };

  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(async () => {
    measureCommits = 0;
    camera.position.set(0, -10, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    planePicker = mock<SectionPlanePicker>();
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    const [cut] = actor.getSnapshot().context.sectionCuts;
    actor.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: cutHeight } } });
    certify();
    actor.send({ type: 'setMeasureActive', payload: true });
    actor.send({ type: 'setMeasureMode', mode: 'point' });

    const parent = document.createElement('div');
    canvas = document.createElement('canvas');
    parent.append(canvas);
    document.body.append(parent);
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
    // The handles capture the pointer where R3F listens.
    let captured: number | undefined;
    parent.setPointerCapture = (pointerId) => {
      captured = pointerId;
    };
    parent.hasPointerCapture = (pointerId) => captured === pointerId;
    parent.releasePointerCapture = () => {
      captured = undefined;
    };

    root = createRoot(canvas);
    await act(async () => {
      await root.configure({
        camera,
        events: createPointerEvents,
        frameloop: 'never',
        gl: createStubWebGlRenderer(canvas),
        size: { height: 600, left: 0, top: 0, width: 800 },
        // As the viewer's canvas does: pointer events bind to the region around the canvas, not the canvas.
        onCreated: (state) => {
          state.events.connect?.(parent);
        },
      });
      model = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
      // These checks isolate cut/pointer behavior; cold worker preparation has its own suite.
      getMeshMeasurementFeatures(model);
      const store = root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <Profiler
            id='measure'
            onRender={() => {
              measureCommits += 1;
            }}
          >
            <MeasureTool />
          </Profiler>
          <SectionHandles planePicker={planePicker} />
        </GraphicsProvider>,
      );
      getState = store.getState;
    });
    // One frame lays the handles out for the camera.
    act(() => {
      getState().advance(0);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    actor.stop();
    canvas.parentElement?.remove();
    vi.restoreAllMocks();
  });

  it('should measure only what the cut leaves, never snapping to a point it removes', () => {
    // Just under the cut, beside the face's side edge, whose midpoint on z = 0 the cut removes.
    click(pixelOf(0.9, -1, -0.1));

    const start = actor.getSnapshot().context.currentMeasurementStart;
    expect(start?.[2]).toBeLessThan(cutHeight);
    const marks = measurementMarkHeights();
    expect(marks.filter((height) => height >= cutHeight)).toEqual([]);
  });

  it('should leave a press on a section handle to the handle while Measure is on', () => {
    const [cut] = actor.getSnapshot().context.sectionCuts;

    // The selected plane's push-pull arrow stands on the bounds centre, upright in the middle of the view. Its lower
    // half lies over what the cut leaves of the face, which Measure would pick if it saw the press.
    dispatch('pointerdown', [400, 330]);
    dispatch('pointermove', [400, 336]);
    dispatch('pointerup', [400, 336]);
    dispatch('click', [400, 336]);

    const [dragged] = actor.getSnapshot().context.sectionCuts;
    expect(dragged?.id).toBe(cut?.id);
    expect(dragged?.kind === 'plane' ? dragged.offset : Number.NaN).toBeLessThan(cutHeight);
    expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();

    // Off the handles, the same tools measure the model.
    click(pixelOf(0.9, -1, -0.1));
    expect(actor.getSnapshot().context.currentMeasurementStart).toBeDefined();
  });

  it('should not re-render while a cut moves, and measure against the cut committed last', () => {
    const settled = measureCommits;
    expect(settled).toBeGreaterThan(0);
    const [cut] = actor.getSnapshot().context.sectionCuts;
    const step = (offset: number): void => {
      act(() => {
        actor.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset } } });
        certify();
      });
    };

    step(0.1);
    step(0.3);
    step(0.5);
    expect(measureCommits).toBe(settled);

    // Only the moved cut leaves this part of the face: under the first one the ray passed through to nothing.
    click(pixelOf(0.9, -1, 0.3));
    expect(actor.getSnapshot().context.currentMeasurementStart?.[2]).toBeGreaterThan(cutHeight);
  });

  it("should drop a resting pointer's snap marker when a cut removes its point, rendering nothing more", () => {
    const frames = holdFrames();
    // The first cut leaves the top front corner, which the later cut removes while the pointer rests.
    moveFirstCut(1.5);
    dispatch('pointermove', pixelOf(1, -1, 1));
    frames.run();
    expect(measurementMarkHeights().filter((height) => height >= cutHeight).length).toBeGreaterThan(0);

    // The cut comes down past them while the pointer rests: no pointer event.
    moveFirstCut(cutHeight);
    frames.run();
    const marks = measurementMarkHeights();
    expect(marks.filter((height) => height >= cutHeight)).toEqual([]);

    // A cut step that leaves the pointer's snaps as they were renders nothing.
    const settled = measureCommits;
    moveFirstCut(cutHeight - 0.01);
    frames.run();
    expect(measureCommits).toBe(settled);
    expect(measurementMarkHeights()).toEqual(marks);
  });

  it('should retain chosen catalog targets across unchanged frames and invalidate them when the camera changes', async () => {
    act(() => {
      actor.send({ type: 'requestMeasureCatalog' });
    });
    await waitFor(() => {
      expect(actor.getSnapshot().context.measureCandidates.length).toBeGreaterThan(0);
    });
    const { measureCandidates, measureCatalogRequest } = actor.getSnapshot().context;
    expect(measureCandidates.length).toBeGreaterThan(0);
    const chosenId = measureCandidates[0]!.id;
    act(() => {
      actor.send({ type: 'chooseMeasureCandidate', id: chosenId });
      actor.send({ type: 'setMeasureLockedTarget', id: chosenId });
      getState().advance(0);
    });
    expect(actor.getSnapshot().context.measureCandidates).toEqual(measureCandidates);
    expect(actor.getSnapshot().context.measureChosenCandidateId).toBe(chosenId);
    expect(actor.getSnapshot().context.measureLockedTargetId).toBe(chosenId);

    // A new camera matrix invalidates the retained world targets without another catalog request.
    act(() => {
      camera.position.set(10, 0, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      getState().advance(0);
    });
    const afterMove = actor.getSnapshot().context;
    expect(afterMove.measureCandidates).toEqual([]);
    expect(afterMove.measureChosenCandidateId).toBeUndefined();
    expect(afterMove.measureLockedTargetId).toBeUndefined();
    expect(afterMove.measureCatalogRequest).toBe(measureCatalogRequest);
  });

  it('should clear a surviving actor selection as soon as active Measure remounts', async () => {
    act(() => {
      actor.send({ type: 'requestMeasureCatalog' });
    });
    await waitFor(() => {
      expect(actor.getSnapshot().context.measureCandidates.length).toBeGreaterThan(0);
    });
    const { measureCandidates, measureCatalogRequest } = actor.getSnapshot().context;
    expect(measureCandidates.length).toBeGreaterThan(0);
    const chosenId = measureCandidates[0]!.id;
    act(() => {
      actor.send({ type: 'chooseMeasureCandidate', id: chosenId });
      actor.send({ type: 'setMeasureLockedTarget', id: chosenId });
    });
    expect(actor.getSnapshot().context.measureChosenCandidateId).toBe(chosenId);
    expect(actor.getSnapshot().context.measureLockedTargetId).toBe(chosenId);

    // The R3F canvas can remount below GraphicsProvider while its actor survives. No frame advances here.
    await act(async () => {
      root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <MeasureTool key='remounted' />
        </GraphicsProvider>,
      );
    });
    const afterRemount = actor.getSnapshot().context;
    expect(afterRemount.measureCandidates).toEqual([]);
    expect(afterRemount.measureChosenCandidateId).toBeUndefined();
    expect(afterRemount.measureLockedTargetId).toBeUndefined();
    expect(afterRemount.measureCatalogRequest).toBe(measureCatalogRequest);
  });

  it('should refresh a resting pointer after camera motion, then stay settled on an unchanged frame', () => {
    const frames = holdFrames();
    dispatch('pointermove', pixelOf(0.8, -1, -0.6));
    frames.run();
    expect(measurementMarkHeights().length).toBeGreaterThan(0);

    act(() => {
      camera.lookAt(0, -20, 0);
      camera.updateMatrixWorld();
      getState().advance(0);
    });
    expect(measurementMarkHeights()).toEqual([]);

    const settled = measureCommits;
    act(() => {
      getState().advance(0);
    });
    expect(measureCommits).toBe(settled);
    expect(measurementMarkHeights()).toEqual([]);
  });

  it('should leave a press on a dimmed plane picker tile to the picker while Measure is on', () => {
    const add = (payload: AddSectionCutPayload, patch: SectionCutPatch): void => {
      actor.send({ type: 'addSectionCut', payload });
      const id = actor.getSnapshot().context.selectedSectionCutId!;
      actor.send({ type: 'updateSectionCut', payload: { id, patch } });
    };
    // Four cuts, none of them a selected plane, so the picker is dimmed. The three new ones stand clear of the face.
    act(() => {
      add({ kind: 'plane', plane: 'yz' }, { offset: 1.5, isFlipped: false });
      add({ kind: 'plane', plane: 'xz' }, { offset: 1.5, isFlipped: false });
      add({ kind: 'revolution', axis: 'z' }, { start: 45, sweep: 5 });
      actor.send({ type: 'selectSectionCut', payload: undefined });
      certify();
    });
    const cuts = actor.getSnapshot().context.sectionCuts;
    const controls = Object.assign(new THREE.EventDispatcher(), { enabled: true });
    act(() => {
      getState().set({ controls });
    });
    // The tile covers part of the face the cuts leave, which Measure picks when the press is its own.
    const tile = pixelOf(0.8, -1, -0.6);
    planePicker.pick.mockReturnValue('yz');

    dispatch('pointerdown', tile);
    expect(controls.enabled).toBe(false);
    dispatch('pointerup', tile);
    dispatch('click', tile);

    expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
    expect(actor.getSnapshot().context.sectionCuts).toBe(cuts);
    expect(controls.enabled).toBe(true);

    // Without the picker there, the same press measures the model.
    planePicker.pick.mockReturnValue(undefined);
    click(tile);
    expect(actor.getSnapshot().context.currentMeasurementStart).toBeDefined();
  });
});
