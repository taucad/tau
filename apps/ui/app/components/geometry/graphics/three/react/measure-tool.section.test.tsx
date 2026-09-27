import { Profiler } from 'react';
import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ReconcilerRoot, RootState } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { MeasureTool } from '#components/geometry/graphics/three/react/measure-tool.js';
import { SectionHandles } from '#components/geometry/graphics/three/react/section-handles.js';
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
  let measureCommits = 0;
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

    const parent = document.createElement('div');
    canvas = document.createElement('canvas');
    parent.append(canvas);
    document.body.append(parent);
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
    let captured: number | undefined;
    canvas.setPointerCapture = (pointerId) => {
      captured = pointerId;
    };
    canvas.hasPointerCapture = (pointerId) => captured === pointerId;
    canvas.releasePointerCapture = () => {
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
      const store = root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())} />
          <Profiler
            id='measure'
            onRender={() => {
              measureCommits += 1;
            }}
          >
            <MeasureTool />
          </Profiler>
          <SectionHandles />
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
  });

  it('should measure only what the cut leaves, never snapping to a point it removes', () => {
    // Just under the cut, beside the face's side edge, whose midpoint on z = 0 the cut removes.
    click(pixelOf(0.9, -1, -0.1));

    const start = actor.getSnapshot().context.currentMeasurementStart;
    expect(start?.[2]).toBeLessThan(cutHeight);
    const marks = measurementMarkHeights();
    expect(marks.length).toBeGreaterThan(0);
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
});
