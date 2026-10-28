import { act } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { createRoot, events as createPointerEvents, extend } from '@react-three/fiber';
import type { ConstructorRepresentation, ReconcilerRoot, RootState } from '@react-three/fiber';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { GraphicsProvider, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { MeasureTool, restingPointerOver } from '#graphics/three/react/measure-tool.jsx';
import { hasSceneTag, sceneTag } from '#graphics/three/utils/scene-tags.js';
import {
  getCachedMeshMeasurementFeatures,
  getMeshMeasurementFeatures,
} from '#graphics/three/utils/measurement-features.js';
import type { MeasurementFeatureWorkerClient } from '#graphics/three/utils/measurement-features-worker-client.js';

const worker = vi.hoisted(() => ({
  /** Feature graph requests the worker has not answered yet; a test answers them. */
  pending: [] as Array<Readonly<{ mesh: unknown; answer: () => void; fail: () => void }>>,
  /** Every feature graph request it received. */
  requests: 0,
  /** The meshes the tool asked it to prepare ahead of its queue, in order. */
  prioritized: [] as unknown[],
  /** Whether it fails every request at once, as a worker that cannot start does. */
  failing: false,
  /** Whether it answers every request at once with no graph, as a client whose mesh went stale does. */
  empty: false,
}));

// The worker answers when the test says, with the graph it would have built.
vi.mock('#graphics/three/utils/measurement-features-worker-client.js', () => ({
  createMeasurementFeatureWorkerClient: (): MeasurementFeatureWorkerClient => ({
    ready: getCachedMeshMeasurementFeatures,
    prepare: async (mesh) => {
      worker.requests++;
      if (worker.failing) {
        throw new Error('Measurement feature worker failed.');
      }
      if (worker.empty) {
        return undefined;
      }
      return (
        getCachedMeshMeasurementFeatures(mesh) ??
        new Promise((resolve, reject) => {
          worker.pending.push({
            mesh,
            fail: () => {
              reject(new Error('Measurement feature worker failed.'));
            },
            answer: () => {
              resolve(getMeshMeasurementFeatures(mesh));
            },
          });
        })
      );
    },
    prioritize: (mesh) => {
      worker.prioritized.push(mesh);
    },
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

/**
 * Mounts the tool as the viewer's controls do: while Measure is on or a pinned measurement shows (it loads lazily on
 * first use).
 */
function MeasureWhileActive(): React.ReactNode {
  const shouldMount = useGraphicsSelector(
    (state) => state.context.isMeasureActive || state.context.measurements.some((measurement) => measurement.isPinned),
  );
  return shouldMount ? <MeasureTool /> : null;
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
    // Three's constructors: the catalogue R3F renders intrinsic elements from.
    extend(
      Object.fromEntries(
        Object.entries(THREE).filter(
          (entry): entry is [string, ConstructorRepresentation] => typeof entry[1] === 'function',
        ),
      ),
    );
  });

  let getState: () => RootState;

  /** Measurement marks in the scene: snap indicators, points and lines. */
  const measurementMarks = (): number => {
    let count = 0;
    getState().scene.traverse((object) => {
      if (object instanceof THREE.Mesh && hasSceneTag(object, sceneTag.measurementUi)) {
        count++;
      }
    });
    return count;
  };

  beforeEach(async () => {
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
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
      const store = root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <primitive object={sideMesh} />
          <MeasureWhileActive />
        </GraphicsProvider>,
      );
      getState = store.getState;
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
    worker.requests = 0;
    worker.prioritized.length = 0;
    worker.failing = false;
    worker.empty = false;
    vi.restoreAllMocks();
  });

  /** Answers every feature graph request the worker holds, and lets what waited on them run. */
  const answerWorker = async (only?: THREE.Mesh): Promise<void> => {
    await act(async () => {
      for (const request of worker.pending.splice(0)) {
        if (only === undefined || request.mesh === only) {
          request.answer();
        } else {
          worker.pending.push(request);
        }
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  };

  it('should remain unready across a delayed tool load and cancellation, then accept a press before graphs are ready', async () => {
    const loading = Promise.withResolvers<{ default: typeof MeasureTool }>();
    const DeferredMeasureTool = lazy(async () => loading.promise);
    function DeferredWhileActive(): React.ReactNode {
      const active = useGraphicsSelector((state) => state.context.isMeasureActive);
      return <Suspense fallback={null}>{active ? <DeferredMeasureTool /> : null}</Suspense>;
    }
    await act(async () => {
      root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <primitive object={sideMesh} />
          <DeferredWhileActive />
        </GraphicsProvider>,
      );
    });
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    expect(actor.getSnapshot().context.isMeasureInputReady).toBe(false);
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    expect(actor.getSnapshot().context.measurements).toHaveLength(0);
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: false });
    });
    await act(async () => {
      loading.resolve({ default: MeasureTool });
    });
    expect(actor.getSnapshot().context.isMeasureInputReady).toBe(false);

    await act(async () => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    expect(actor.getSnapshot().context.isMeasureInputReady).toBe(true);
    expect(getCachedMeshMeasurementFeatures(model)).toBeUndefined();
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
    expect(actor.getSnapshot().context.measurements).toHaveLength(0);
    await answerWorker();
    expect(actor.getSnapshot().context.measurements).toHaveLength(1);
    expect(actor.getSnapshot().context.measurements[0]).toMatchObject({ operation: 'edge-length', distance: 2 });
    await act(async () => {
      root.render(
        <GraphicsProvider graphicsRef={actor}>
          <primitive object={model} />
          <primitive object={sideMesh} />
        </GraphicsProvider>,
      );
    });
    expect(actor.getSnapshot().context.isMeasureActive).toBe(true);
    expect(actor.getSnapshot().context.isMeasureInputReady).toBe(false);
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: false });
    });
    expect(actor.getSnapshot().context.isMeasureInputReady).toBe(false);
  });

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

  it('has the worker prepare the mesh under a waiting click ahead of the others it queued', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    // The face just inside the front top edge, so the ray hits the model while both meshes' graphs are queued.
    dispatch('pointerdown', pixelOf(0, -0.9, 1));
    dispatch('pointerup', pixelOf(0, -0.9, 1));
    expect(worker.pending.map(({ mesh }) => mesh)).toEqual(expect.arrayContaining([model, sideMesh]));

    expect(worker.prioritized).toContain(model);
    expect(worker.prioritized).not.toContain(sideMesh);
    await answerWorker(model);
    expect(actor.getSnapshot().context.measurements).toMatchObject([{ status: 'current' }]);
  });

  it('should retain a waiting click when an unrelated active graph fails before its prioritized graph succeeds', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointermove', pixelOf(5, 3, 0.5));
    runFrames();
    dispatch('pointerdown', pixelOf(0, -0.9, 1));
    dispatch('pointerup', pixelOf(0, -0.9, 1));
    expect(worker.prioritized).toContain(model);
    const failed = worker.pending.find((request) => request.mesh === sideMesh);
    expect(failed).toBeDefined();
    await act(async () => {
      failed!.fail();
    });
    expect(actor.getSnapshot().context.measurements).toEqual([]);

    await answerWorker(model);

    expect(actor.getSnapshot().context.measurements).toMatchObject([
      { operation: 'edge-length', status: 'current', distance: 2 },
    ]);
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

  /** Turns Measure on and clicks the model's front top edge before the worker has answered for it. */
  const clickWhilePreparing = (): void => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    dispatch('pointerup', pixelOf(0, -1, 1));
  };

  it('drops a waiting click when Measure turns off and on while a pinned measurement keeps the tool mounted', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({
        type: 'completeFeatureMeasurement',
        record: { frameId: 'tau:root', startPoint: [5, 3, 0], endPoint: [5, 4, 0], distance: 1, status: 'current' },
      });
    });
    const [pinned] = actor.getSnapshot().context.measurements;
    act(() => {
      actor.send({ type: 'toggleMeasurementPinned', id: pinned!.id });
    });
    clickWhilePreparing();
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: false });
    });
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements.map(({ id }) => id)).toEqual([pinned!.id]);
  });

  it('should drop a waiting click when visibility exposes a different body', async () => {
    clickWhilePreparing();
    act(() => {
      model.visible = false;
      sideMesh.position.set(0, -0.5, 0.5);
      sideMesh.updateMatrixWorld();
      actor.send({ type: 'setSurfaceVisibility', payload: false });
    });
    await answerWorker();
    await answerWorker();
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('should drop a waiting click when component display changes', async () => {
    clickWhilePreparing();
    act(() => {
      actor.getSnapshot().context.modelInteractionRef.send({
        type: 'restoreComponentDisplay',
        componentDisplay: { schemaVersion: 1, unitsById: { model: { hiddenComponentIds: ['body'] } } },
      });
    });
    await answerWorker();
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('should drop a waiting click when a pose changes before its graph arrives', async () => {
    clickWhilePreparing();
    act(() => {
      actor.getSnapshot().context.kinematicsRef.send({
        type: 'loadMechanism',
        unitId: 'model',
        mechanism: {
          schemaVersion: 1,
          units: { length: 'mm', angle: 'deg' },
          root: 'base',
          links: { base: { components: ['body'] } },
          joints: {},
        },
      });
    });
    await answerWorker();
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('should drop a waiting click when a committed cut changes before its graph arrives', async () => {
    clickWhilePreparing();
    act(() => {
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      const [cut] = actor.getSnapshot().context.sectionCuts;
      actor.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 2 } } });
      actor.send({ type: 'commitSectionCuts', payload: actor.getSnapshot().context.sectionCuts });
    });
    await answerWorker();
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('drops a waiting click when the model is replaced', async () => {
    clickWhilePreparing();
    act(() => {
      actor.send({
        type: 'updateArtifact',
        artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array([1]) },
        hash: 'replacement',
      });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('drops a waiting click when its start is cancelled', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'setMeasureMode', mode: 'point' });
    });
    // After the tool mounted, which cancels any start left from another source.
    act(() => {
      actor.send({ type: 'startMeasurement', payload: [5, 3, 0] });
    });
    expect(actor.getSnapshot().context.currentMeasurementStart).toEqual([5, 3, 0]);
    dispatch('pointerdown', pixelOf(-0.98, -0.98, 1));
    dispatch('pointerup', pixelOf(-0.98, -0.98, 1));
    // Escape cancels the start the click would have completed.
    act(() => {
      actor.send({ type: 'cancelCurrentMeasurement' });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
    expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
  });

  it('never lands an orbit that started on the model as a click', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    // The camera controls report the drag before the tool has re-rendered with it.
    actor.send({ type: 'controlsInteractionStart' });
    actor.send({ type: 'controlsInteractionMoved' });
    dispatch('pointerup', pixelOf(0, -1, 1));

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('never lands a press that went down while the camera was still moving', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    act(() => {
      actor.send({ type: 'controlsInteractionStart' });
      actor.send({ type: 'controlsInteractionMoved' });
    });
    dispatch('pointerdown', pixelOf(0, -1, 1));
    // The drag ends and its click guard is cleared before the release, so only the press's own record says it moved.
    act(() => {
      actor.send({ type: 'controlsInteractionEnd' });
      actor.send({ type: 'clearModelPointerClickGuard' });
    });
    dispatch('pointerup', pixelOf(0, -1, 1));

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('never lands a press that dragged away from where it went down', async () => {
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    const [x, y] = pixelOf(0, -1, 1);
    dispatch('pointerdown', [x - 30, y]);
    dispatch('pointerup', [x, y]);

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('drops a waiting click when the camera changes before its targets are ready', async () => {
    clickWhilePreparing();
    // A wheel zoom or a view-cube turn moves the camera without a press of its own.
    camera.position.set(0, 0, 6);
    camera.updateMatrixWorld();

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('stops waiting once the worker fails, asking it a bounded number of times', async () => {
    worker.failing = true;
    clickWhilePreparing();
    await answerWorker();
    const requestsAfterFailure = worker.requests;
    await answerWorker();

    expect(worker.requests).toBe(requestsAfterFailure);
    expect(worker.requests).toBeLessThanOrEqual(6);
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('stops waiting after a bounded number of steps when the worker never answers with a graph', async () => {
    worker.empty = true;
    clickWhilePreparing();
    await answerWorker();
    await answerWorker();
    const requestsAfterSettling = worker.requests;
    await answerWorker();

    expect(worker.requests).toBe(requestsAfterSettling);
    expect(worker.requests).toBeLessThanOrEqual(2 * 66);
    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('drops a waiting click when a camera drag starts while it waits', async () => {
    clickWhilePreparing();
    act(() => {
      actor.send({ type: 'controlsInteractionStart' });
      actor.send({ type: 'controlsInteractionMoved' });
    });

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toEqual([]);
  });

  it('clears the hover a landed click drew when the pointer left while it waited', async () => {
    clickWhilePreparing();
    dispatch('pointerleave', pixelOf(0, -1, 1));

    await answerWorker();

    expect(actor.getSnapshot().context.measurements).toHaveLength(1);
    runFrames();
    const marksAfterLanding = measurementMarks();
    // Leaving again clears any hover; the landed measurement's own marks stay.
    dispatch('pointerleave', pixelOf(0, -1, 1));
    runFrames();
    expect(measurementMarks()).toBe(marksAfterLanding);
  });

  it('does not bring a hover back after a window blur when the tool rebinds', () => {
    getMeshMeasurementFeatures(model);
    dispatch('pointermove', pixelOf(0, -1, 1));
    act(() => {
      actor.send({ type: 'setMeasureActive', payload: true });
    });
    runFrames();
    expect(measurementMarks()).toBeGreaterThan(0);
    act(() => {
      globalThis.dispatchEvent(new Event('blur'));
    });
    expect(measurementMarks()).toEqual(0);
    // A camera drag starts: the tool rebinds its listeners.
    act(() => {
      actor.send({ type: 'controlsInteractionStart' });
      actor.send({ type: 'controlsInteractionMoved' });
    });
    runFrames();

    expect(measurementMarks()).toEqual(0);
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
    // A leave carries the last in-bounds position: only the region's hover state says the pointer is gone.
    dispatch('pointerleave', pixelOf(0, -1, 1));
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
