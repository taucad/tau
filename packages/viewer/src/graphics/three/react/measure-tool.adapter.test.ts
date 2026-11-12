/**
 * The measure session's DOM adapters, driven for real: a measure session around `follower` and `pointer` logic built
 * on a real graphics actor, a fake host and a plain surface. These rows hold the cross-actor orders the session's own
 * tests cannot see with a recording adapter.
 */
import type { GeometryComponentManifest } from '@taucad/types';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { createMeasureToolAdapters, restingPointerOver } from '#graphics/three/react/measure-tool.adapter.js';
import type { MeasurePointerSnapshot, MeasureToolHost } from '#graphics/three/react/measure-tool.adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
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

  const host: MeasureToolHost = {
    snapshot: () => {
      calls.push('snapshot');
      return next;
    },
    commit: (snapshot) => {
      calls.push('commit');
      const point = snapshot.point!;
      graphics.send({ type: 'startMeasurement', payload: [point.x, point.y, point.z] });
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

  const startSession = () => {
    const adapters = createMeasureToolAdapters({
      surface,
      get: () => ({
        camera,
        internal: { subscribe: () => () => undefined, lastEvent: { current: lastEvent } },
      }),
      graphics,
      kinematics: graphics.getSnapshot().context.kinematicsRef,
      host: { current: host },
      inputOwner,
    });
    return createActor(
      measureSessionMachine.provide({ actors: { follower: adapters.follower, pointer: adapters.pointer } }),
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
  });

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
});
