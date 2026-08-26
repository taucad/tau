import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { createActor, fromPromise } from 'xstate';
import { controlsListenerMachine, getControlsListenerEventNames } from '#machines/controls-listener.machine.js';
import type { CameraControlsAdapter } from '#machines/controls-listener.machine.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = () =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: {},
  }).start();

describe('controls-listener machine', () => {
  it('uses the installed controls event vocabulary', () => {
    const cameraControls = {
      getTarget: (target: Vector3): Vector3 => target,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const orbitControls = {
      target: new Vector3(),
      update: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    expect(getControlsListenerEventNames(cameraControls)).toEqual({
      start: 'controlstart',
      stateChange: 'update',
      userMove: 'control',
      end: 'controlend',
    });
    expect(getControlsListenerEventNames(orbitControls)).toEqual({
      start: 'start',
      stateChange: 'change',
      userMove: 'change',
      end: 'end',
    });
  });

  it('forwards one movement signal per CameraControls gesture and removes its listeners', async () => {
    const listeners = new Map<string, ControlEventListener>();
    const controls = {
      getTarget: (target: Vector3): Vector3 => target,
      addEventListener: vi.fn((type: string, listener: ControlEventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } satisfies CameraControlsAdapter;
    const graphicsActorRef = createGraphicsActor();
    const actor = createActor(controlsListenerMachine, { input: { graphicsActorRef, controls } }).start();

    await expect.poll(() => [...listeners.keys()]).toEqual(['controlstart', 'control', 'controlend']);
    listeners.get('controlstart')?.({ type: 'controlstart' });
    listeners.get('control')?.({ type: 'control' });
    await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);

    graphicsActorRef.send({ type: 'clearModelPointerClickGuard' });
    listeners.get('control')?.({ type: 'control' });
    expect(graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(false);

    listeners.get('controlend')?.({ type: 'controlend' });
    await expect.poll(() => graphicsActorRef.getSnapshot().context.cameraInteracting).toBe(false);
    listeners.get('controlstart')?.({ type: 'controlstart' });
    listeners.get('control')?.({ type: 'control' });
    await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);

    actor.stop();
    expect(listeners.size).toBe(0);
    graphicsActorRef.stop();
  });

  it('treats OrbitControls change as user movement', async () => {
    const listeners = new Map<string, ControlEventListener>();
    const controls = {
      target: new Vector3(),
      update: vi.fn(),
      addEventListener: vi.fn((type: string, listener: ControlEventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } satisfies CameraControlsAdapter & { target: Vector3; update: () => void };
    const graphicsActorRef = createGraphicsActor();
    const actor = createActor(controlsListenerMachine, { input: { graphicsActorRef, controls } }).start();

    await expect.poll(() => [...listeners.keys()]).toEqual(['start', 'change', 'end']);
    listeners.get('start')?.({ type: 'start' });
    listeners.get('change')?.({ type: 'change' });
    await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);

    actor.stop();
    graphicsActorRef.stop();
  });
});
