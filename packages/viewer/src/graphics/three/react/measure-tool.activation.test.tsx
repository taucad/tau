import { act } from '@testing-library/react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ReconcilerRoot } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { GraphicsProvider, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { MeasureTool, restingPointerOver } from '#graphics/three/react/measure-tool.jsx';
import {
  getCachedMeshMeasurementFeatures,
  getMeshMeasurementFeatures,
} from '#graphics/three/utils/measurement-features.js';
import type { MeasurementFeatureWorkerClient } from '#graphics/three/utils/measurement-features-worker-client.js';

const worker = vi.hoisted(() => ({
  /** Feature graph requests the worker has not answered yet; a test answers them. */
  pending: [] as Array<Readonly<{ mesh: unknown; answer: () => void }>>,
}));

// The worker answers when the test says, with the graph it would have built.
vi.mock('#graphics/three/utils/measurement-features-worker-client.js', () => ({
  createMeasurementFeatureWorkerClient: (): MeasurementFeatureWorkerClient => ({
    ready: getCachedMeshMeasurementFeatures,
    prepare: async (mesh) =>
      getCachedMeshMeasurementFeatures(mesh) ??
      new Promise((resolve) => {
        worker.pending.push({
          mesh,
          answer: () => {
            resolve(getMeshMeasurementFeatures(mesh));
          },
        });
      }),
    dispose: () => undefined,
  }),
}));

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

/** Mounts the tool only while Measure is on, as the viewer's controls do (it loads lazily on first use). */
function MeasureWhileActive(): React.ReactNode {
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);
  return isMeasureActive ? <MeasureTool /> : null;
}

describe('MeasureTool activation', () => {
  let actor: Actor<typeof graphicsMachine>;
  let canvas: HTMLCanvasElement;
  let parent: HTMLDivElement;
  let root: ReconcilerRoot<HTMLCanvasElement>;
  let hovered = false;
  let model: THREE.Mesh;
  /** A second body, off to the side of every press. */
  let sideMesh: THREE.Mesh;
  const frames = new Map<number, FrameRequestCallback>();
  // Looking down -Z onto the top face of a 2 m cube about the origin.
  const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const pixelOf = (x: number, y: number, z: number): readonly [number, number] => {
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    return [((ndc.x + 1) / 2) * 800, ((1 - ndc.y) / 2) * 600];
  };

  const dispatch = (type: string, [x, y]: readonly [number, number], pointerType = 'mouse'): void => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: pointerType },
      isPrimary: { value: true },
      offsetX: { value: x },
      offsetY: { value: y },
    });
    act(() => {
      canvas.dispatchEvent(event);
    });
  };

  const runFrames = (): void => {
    const callbacks = [...frames.values()];
    frames.clear();
    act(() => {
      for (const callback of callbacks) {
        callback(0);
      }
    });
  };

  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  beforeEach(async () => {
    let nextFrame = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 1, centerMeters: [0, 0, 0] });

    parent = document.createElement('div');
    canvas = document.createElement('canvas');
    parent.append(canvas);
    document.body.append(parent);
    canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
    parent.getBoundingClientRect = canvas.getBoundingClientRect;
    // The DOM here keeps no hover state: the region is hovered from a pointer's first event until it leaves.
    hovered = false;
    const matches = parent.matches.bind(parent);
    Object.defineProperty(parent, 'matches', {
      value: (selector: string) => (selector === ':hover' ? hovered : matches(selector)),
    });
    parent.addEventListener('pointermove', () => {
      hovered = true;
    });
    parent.addEventListener('pointerleave', () => {
      hovered = false;
    });

    root = createRoot(canvas);
    model = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    sideMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sideMesh.position.set(5, 3, 0);
    await act(async () => {
      await root.configure({
        camera,
        events: createPointerEvents,
        frameloop: 'never',
        gl: createStubWebGlRenderer(canvas),
        size: { height: 600, left: 0, top: 0, width: 800 },
        // As the viewer's canvas does: pointer events bind to the region around the canvas.
        onCreated: (state) => {
          state.events.connect?.(parent);
        },
      });
      root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <primitive object={sideMesh} />
          <MeasureWhileActive />
        </GraphicsProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    actor.stop();
    parent.remove();
    frames.clear();
    worker.pending.length = 0;
    vi.restoreAllMocks();
  });

  /** Answers every feature graph request the worker holds, and lets what waited on them run. */
  const answerWorker = async (only?: THREE.Mesh): Promise<void> => {
    await act(async () => {
      for (const { mesh, answer } of worker.pending.splice(0)) {
        if (only === undefined || mesh === only) {
          answer();
        }
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  it('hovers from where the pointer rests when Measure turns on after the pointer moved over the model', () => {
    // A ready feature graph, as after the worker prepared the mesh: only the tool's mount timing is under test.
    getMeshMeasurementFeatures(model);
    // The pointer reaches the top face's front edge before the tool has mounted, then holds still.
    dispatch('pointermove', pixelOf(0, -1, 1));
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    runFrames();

    expect(actor.getSnapshot().context.measureActiveCandidateId).toBeDefined();
  });

  it('lands a click made while the feature graph is still being prepared once the graph is ready', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    // The first click on the model's front top edge; the worker has not answered for the model yet.
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    expect(worker.pending.length).toBeGreaterThan(0);
    expect(actor.getSnapshot().context.measurements).toEqual([]);

    await answerWorker();

    const [measurement] = actor.getSnapshot().context.measurements;
    expect(measurement).toMatchObject({ operation: 'edge-length', status: 'current' });
    expect(measurement!.distance).toBeCloseTo(2, 6);
  });

  it('lands a waiting click once the mesh under it is ready, while another mesh is still being prepared', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    expect(worker.pending.map(({ mesh }) => mesh)).toEqual(expect.arrayContaining([model, sideMesh]));

    // The side body's graph never arrives here, as a large mesh's can take far longer than the one clicked.
    await answerWorker(model);

    expect(actor.getSnapshot().context.measurements).toMatchObject([{ operation: 'edge-length', status: 'current' }]);
  });

  it('keeps a waiting click through a re-render of the tool', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    // A settings change while the worker prepares the graph re-renders the tool and rebinds its listeners.
    act(() => {
      actor.send({ type: 'setMeasureFrame', frame: 'selected-local' });
    });
    act(() => {
      actor.send({ type: 'setMeasureFrame', frame: 'tau:root' });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toMatchObject([{ operation: 'edge-length', status: 'current' }]);
  });

  it('drops a waiting click when Measure turns off', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: false });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('previews a tap made while the feature graph is still being prepared once the graph is ready', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'setMeasureMode', mode: 'point' });
    });
    dispatch('pointerdown', pixelOf(-0.98, -0.98, 1), 'touch');
    dispatch('pointerup', pixelOf(-0.98, -0.98, 1), 'touch');
    expect(actor.getSnapshot().context.measureChosenCandidateId).toBeUndefined();

    await answerWorker();

    const { context } = actor.getSnapshot();
    expect(context.measureChosenCandidateId).toBeDefined();
    expect(context.currentMeasurementStart).toBeUndefined();
    expect(context.measurements).toEqual([]);
  });

  it('drops a waiting click when a newer press follows it', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    // A press off the model, as a camera drag starts: the click before it no longer applies.
    dispatch('pointerdown', [10, 10]);

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
    expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
  });

  it('does not hover after the pointer left the model before Measure turned on', () => {
    dispatch('pointermove', pixelOf(0, -1, 1));
    dispatch('pointerleave', [900, 300]);
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    runFrames();

    expect(actor.getSnapshot().context.measureActiveCandidateId).toBeUndefined();
  });
});

describe('restingPointerOver', () => {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 50 });
  let hovered = true;
  Object.defineProperty(element, 'matches', { value: (selector: string) => selector === ':hover' && hovered });

  it('answers nothing once the element is no longer hovered', () => {
    hovered = false;
    expect(restingPointerOver({ type: 'pointermove', pointerType: 'mouse', clientX: 50, clientY: 40 }, element)).toBe(
      undefined,
    );
    hovered = true;
  });

  it.each([
    [
      'a move inside',
      { type: 'pointermove', pointerType: 'mouse', clientX: 50, clientY: 40 },
      { clientX: 50, clientY: 40 },
    ],
    [
      'a release inside',
      { type: 'pointerup', pointerType: 'pen', clientX: 10, clientY: 70 },
      { clientX: 10, clientY: 70 },
    ],
    ['a move outside', { type: 'pointermove', pointerType: 'mouse', clientX: 5, clientY: 40 }, undefined],
    ['a leave', { type: 'pointerleave', pointerType: 'mouse', clientX: 50, clientY: 40 }, undefined],
    ['a cancel', { type: 'pointercancel', pointerType: 'mouse', clientX: 50, clientY: 40 }, undefined],
    ['a lifted touch', { type: 'pointerup', pointerType: 'touch', clientX: 50, clientY: 40 }, undefined],
    ['no event', undefined, undefined],
  ] as const)('answers for %s', (_name, event, expected) => {
    expect(restingPointerOver(event, element)).toEqual(expected);
  });
});
