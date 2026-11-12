/**
 * The measure session's DOM adapters, driven for real: a measure session around the `follower`, `pointer`, `exact` and
 * `catalog` logic built on a real graphics actor, a fake host and a plain surface. These rows hold the cross-actor
 * orders the session's own tests cannot see with a recording adapter.
 */
import type { GeometryComponentManifest } from '@taucad/types';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { createMeasureToolAdapters, restingPointerOver } from '#graphics/three/react/measure-tool.adapter.js';
import type {
  MeasureCommitOutcome,
  MeasurePointerSnapshot,
  MeasureToolHost,
} from '#graphics/three/react/measure-tool.adapter.js';
import type {
  ExactOccurrenceDistanceRequest,
  ExactOccurrenceDistanceResult,
} from '#graphics/three/react/exact-measurement.jsx';
import type { MeasurementRecord } from '#constants/measurement.types.js';
import { graphicsMachine, selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import { measureSessionMachine } from '#machines/measure-session.machine.js';

const capabilities = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
} satisfies GeometryComponentManifest['capabilities'];
const manifest: GeometryComponentManifest = {
  schemaVersion: 1,
  sourceFile: 'file:main.ts',
  rootId: 'root',
  nodeOrder: ['root'],
  nodesById: {
    root: {
      id: 'root',
      name: 'Model',
      kind: 'model',
      selector: 'root',
      childIds: [],
      depth: 0,
      path: ['Model'],
      meshNodeIndices: [],
      primitiveIndices: [],
      materialIndices: [],
      capabilities,
    },
  },
  capabilities,
};

type Deferred = Readonly<{ promise: Promise<void>; resolve: () => void }>;

const deferred = (): Deferred => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
};

describe('measure tool adapters', () => {
  let graphics: Actor<typeof graphicsMachine>;
  let surface: HTMLDivElement;
  let hovered = true;
  let lastEvent: Partial<PointerEvent> | undefined;
  const frames = new Map<number, FrameRequestCallback>();
  const camera = new THREE.PerspectiveCamera();
  const inputOwner: { current: symbol | undefined } = { current: undefined };
  const calls: string[] = [];
  let next: MeasurePointerSnapshot = { hasTarget: false, hasActiveSnapTarget: false };
  /** What Use target commits next. */
  let chosen: MeasureCommitOutcome | undefined;
  /** The exact queries asked, each answered by the test. */
  const queries: Array<
    Readonly<{ request: ExactOccurrenceDistanceRequest; answer: (result: ExactOccurrenceDistanceResult) => void }>
  > = [];
  /** The target list scans run, with the signal each was given. */
  const scans: Array<Readonly<{ append: boolean; signal: AbortSignal }>> = [];

  const host: MeasureToolHost = {
    snapshot: () => {
      calls.push('snapshot');
      return next;
    },
    commit: (snapshot) => {
      calls.push('commit');
      const point = snapshot.point!;
      graphics.send({ type: 'startMeasurement', payload: [point.x, point.y, point.z] });
      return {};
    },
    commitChosen: () => {
      calls.push('commitChosen');
      return chosen;
    },
    measureExact: async (request) =>
      new Promise<ExactOccurrenceDistanceResult>((resolve) => {
        queries.push({ request, answer: resolve });
      }),
    scanCatalog: async ({ append, signal }) => {
      scans.push({ append, signal });
    },
    catalogStopped: () => {
      calls.push('catalogStopped');
    },
    presentGeometry: () => undefined,
    followCatalogSource: () => undefined,
    measureClosed: () => {
      calls.push('measureClosed');
    },
    clearHover: () => {
      calls.push('clearHover');
    },
    releaseChosenCandidate: () => undefined,
    clearSelection: () => undefined,
    prioritize: () => undefined,
    graphFailures: () => 0,
    renderFrame: () => ({ anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 }),
    currentStart: () => graphics.getSnapshot().context.currentMeasurementStart,
    invalidateCandidates: () => undefined,
    poseChanged: () => undefined,
    cutsChanged: () => undefined,
  };

  /** The priorities the follower subscribed to R3F's frame loop at. */
  const framePriorities: number[] = [];

  const startSession = () => {
    const adapters = createMeasureToolAdapters({
      surface,
      get: () => ({
        camera,
        internal: {
          subscribe: (_callback: unknown, priority: number) => {
            framePriorities.push(priority);
            return () => undefined;
          },
          lastEvent: { current: lastEvent },
        },
      }),
      graphics,
      kinematics: graphics.getSnapshot().context.kinematicsRef,
      host: { current: host },
      inputOwner,
    });
    return createActor(
      measureSessionMachine.provide({
        actors: {
          follower: adapters.follower,
          pointer: adapters.pointer,
          exact: adapters.exact,
          catalog: adapters.catalog,
        },
      }),
    ).start();
  };

  const dispatch = (type: string, x = 10, y = 10): void => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'mouse' },
      isPrimary: { value: true },
    });
    surface.dispatchEvent(event);
  };

  const runFrames = (): void => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) {
      callback(0);
    }
  };

  beforeEach(() => {
    let frame = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frame += 1;
      frames.set(frame, callback);
      return frame;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    graphics = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    surface = document.createElement('div');
    surface.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 });
    hovered = true;
    Object.defineProperty(surface, 'matches', { value: (selector: string) => selector === ':hover' && hovered });
    document.body.append(surface);
    lastEvent = undefined;
    inputOwner.current = undefined;
    calls.length = 0;
    next = { hasTarget: false, hasActiveSnapTarget: false };
    chosen = undefined;
    framePriorities.length = 0;
    queries.length = 0;
    scans.length = 0;
  });

  /** Adds a pending minimum distance, as a body-to-body commit does, and has Use target ask for its exact distance. */
  const pendingExact = (id: string): void => {
    const geometryKey = selectPresentedGeometryKey(graphics.getSnapshot());
    const record: MeasurementRecord = {
      id,
      frameId: 'tau:root',
      startPoint: [0, 0, 0],
      endPoint: [1, 0, 0],
      distance: 0,
      isPinned: false,
      operation: 'minimum-distance',
      geometryKey,
      poseRevision: 0,
      status: 'pending',
    };
    graphics.send({ type: 'addMeasurementRecord', record });
    chosen = {
      exact: { id, manifest, geometryKey, occurrenceA: 'a', occurrenceB: 'b', poseRevision: 0 },
    };
    graphics.send({ type: 'requestMeasureCandidateCommit' });
  };

  const recordOf = (id: string): MeasurementRecord | undefined =>
    graphics.getSnapshot().context.measurements.find((measurement) => measurement.id === id);

  const cadAnswer: ExactOccurrenceDistanceResult = {
    status: 'cad-geometry',
    distanceMeters: 2,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- The exact answer's own field names.
    pointAMeters: [0, 0, 0],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- The exact answer's own field names.
    pointBMeters: [2, 0, 0],
    source: 'ap242',
  };

  afterEach(() => {
    graphics.stop();
    surface.remove();
    frames.clear();
    vi.restoreAllMocks();
  });

  it('should clear the hover a landed press drew after its commit placed a start and the pointer left', async () => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    const ready = deferred();
    next = { hasTarget: false, hasActiveSnapTarget: false, whenReady: ready.promise };
    dispatch('pointerdown');
    dispatch('pointerup');
    dispatch('pointerleave');
    calls.length = 0;

    next = { hasTarget: true, hasActiveSnapTarget: true, point: new THREE.Vector3(1, 2, 3) };
    ready.resolve();
    await vi.waitFor(() => {
      expect(calls).toContain('commit');
    });

    // The commit's start reached the session before the landing settled; the hover is cleared all the same.
    expect(graphics.getSnapshot().context.currentMeasurementStart).toEqual([1, 2, 3]);
    expect(calls).toEqual(['snapshot', 'commit', 'clearHover']);
    session.stop();
  });

  it('should leave the input ready and the hover drawn when a rebuilt session starts before the old one stops', () => {
    const old = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    const rebuilt = startSession();
    calls.length = 0;

    old.stop();

    expect(graphics.getSnapshot().context.isMeasureInputReady).toBe(true);
    expect(calls).toEqual([]);
    rebuilt.stop();
    expect(graphics.getSnapshot().context.isMeasureInputReady).toBe(false);
    expect(calls).toEqual(['clearHover']);
  });

  it('should hover on the next frame from where the pointer rests when Measure turns on', () => {
    lastEvent = { type: 'pointermove', pointerType: 'mouse', clientX: 40, clientY: 50 };
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    expect(calls).toEqual([]);

    runFrames();

    expect(calls).toEqual(['snapshot']);
    expect(session.getSnapshot().context.hover).toEqual({ clientX: 40, clientY: 50 });
    session.stop();
  });

  it('should hover again on the next frame when the unit manifest that names the candidates arrives', () => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    dispatch('pointermove');
    runFrames();
    calls.length = 0;

    graphics.send({ type: 'loadModelComponentManifest', unitId: 'file:main.ts', manifest });
    expect(calls).toEqual([]);
    runFrames();

    expect(calls).toEqual(['snapshot']);
    session.stop();
  });

  it('should not hover when the pointer left before Measure turned on', () => {
    hovered = false;
    lastEvent = { type: 'pointermove', pointerType: 'mouse', clientX: 40, clientY: 50 };
    expect(restingPointerOver(lastEvent, surface)).toBeUndefined();
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    runFrames();

    expect(calls).toEqual([]);
    session.stop();
  });

  it('should commit the chosen candidate once per Use target while Measure is on, and not while it is off', () => {
    const session = startSession();
    graphics.send({ type: 'requestMeasureCandidateCommit' });
    expect(calls).toEqual([]);

    graphics.send({ type: 'setMeasureActive', payload: true });
    graphics.send({ type: 'requestMeasureCandidateCommit' });
    expect(calls.filter((call) => call === 'commitChosen')).toEqual(['commitChosen']);
    session.stop();
  });

  it('should resolve an exact query with its answer', async () => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    pendingExact('exact:1');
    expect(queries.map(({ request }) => request.occurrenceA)).toEqual(['a']);

    queries[0]!.answer(cadAnswer);
    await vi.waitFor(() => {
      expect(recordOf('exact:1')).toMatchObject({ status: 'current', quality: 'cad', distance: 2 });
    });
    session.stop();
  });

  it('should resolve an exact query when the cuts changed while Measure was off before it ran', async () => {
    const session = startSession();
    // The cuts change while Measure is off; the query reads the cuts it is taken against when it starts.
    graphics.send({ type: 'commitSectionCuts', payload: [] });
    graphics.send({ type: 'setMeasureActive', payload: true });
    pendingExact('exact:1');

    queries[0]!.answer(cadAnswer);
    await vi.waitFor(() => {
      expect(recordOf('exact:1')?.status).toBe('current');
    });
    session.stop();
  });

  it('should cancel a running exact query, and abort it, when a new commit replaces it', async () => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    pendingExact('exact:1');
    pendingExact('exact:2');

    expect(queries[0]!.request.signal?.aborted).toBe(true);
    expect(recordOf('exact:1')).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'The exact query was replaced by a new selection.',
    });
    expect(recordOf('exact:2')?.status).toBe('pending');

    // The replaced query's late answer changes nothing; the current one's resolves its own record.
    queries[0]!.answer(cadAnswer);
    queries[1]!.answer({ status: 'unavailable', reason: 'No CAD source.' });
    await vi.waitFor(() => {
      expect(recordOf('exact:2')).toMatchObject({ status: 'unavailable', unavailableReason: 'No CAD source.' });
    });
    expect(recordOf('exact:1')?.unavailableReason).toBe('The exact query was replaced by a new selection.');
    session.stop();
  });

  it.each([
    ['Measure turns off', 'Measurement closed before the exact query finished.'],
    ['the measuring view closes', 'The measuring view closed before the exact query finished.'],
  ] as const)('should cancel a running exact query when %s', (change, reason) => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    pendingExact('exact:1');

    if (change === 'Measure turns off') {
      graphics.send({ type: 'setMeasureActive', payload: false });
    } else {
      session.stop();
    }

    expect(queries[0]!.request.signal?.aborted).toBe(true);
    expect(recordOf('exact:1')).toMatchObject({ status: 'unavailable', unavailableReason: reason });
    session.stop();
  });

  it('should stop an exact query when the pose moves, leaving its record to graphics', async () => {
    const session = startSession();
    graphics.send({ type: 'setMeasureActive', payload: true });
    pendingExact('exact:1');

    graphics.send({ type: 'measurementPoseChanged', revision: 1 });
    session.send({ type: 'poseChanged', revision: 1 });

    expect(queries[0]!.request.signal?.aborted).toBe(true);
    expect(recordOf('exact:1')?.status).toBe('out-of-date');
    queries[0]!.answer(cadAnswer);
    await Promise.resolve();
    expect(recordOf('exact:1')?.status).toBe('out-of-date');
    session.stop();
    expect(recordOf('exact:1')?.status).toBe('out-of-date');
  });

  it('should run one target list scan at a time, and stop it when Measure turns off', () => {
    const session = startSession();
    graphics.send({ type: 'requestMeasureCatalog' });
    expect(scans).toEqual([]);

    graphics.send({ type: 'setMeasureActive', payload: true });
    graphics.send({ type: 'requestMeasureCatalog' });
    graphics.send({ type: 'requestMeasureCatalog', append: true });
    expect(scans.map(({ append }) => append)).toEqual([false, true]);
    expect(scans.map(({ signal }) => signal.aborted)).toEqual([true, false]);

    calls.length = 0;
    graphics.send({ type: 'setMeasureActive', payload: false });
    expect(scans[1]!.signal.aborted).toBe(true);
    expect(calls.filter((call) => call !== 'clearHover')).toEqual(['measureClosed', 'catalogStopped']);
    session.stop();
  });

  it('should follow the presented camera after the camera controls step it and before the default frame callbacks', () => {
    const session = startSession();
    // The controls step the camera at -1; between by number, the order holds whichever mounts first.
    expect(framePriorities).toHaveLength(1);
    expect(framePriorities[0]).toBeGreaterThan(-1);
    expect(framePriorities[0]).toBeLessThan(0);
    session.stop();
  });
});
