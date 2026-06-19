import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createActor, fromPromise } from 'xstate';
import {
  getControlsListenerDistance,
  getControlsListenerEventNames,
  controlsListenerMachine,
} from '#machines/controls-listener.machine.js';
import type { CameraControlsAdapter } from '#machines/controls-listener.machine.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

describe('controls-listener machine helpers', () => {
  it('should report CameraControls distance relative to target', () => {
    const target = new THREE.Vector3(100, 50, -20);
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(target).add(new THREE.Vector3(0, 0, 10));
    const controls = {
      camera,
      getTarget: (nextTarget: THREE.Vector3): THREE.Vector3 => nextTarget.copy(target),
      getDistance: () => 10,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies CameraControlsAdapter;

    expect(getControlsListenerDistance(controls)).toBeCloseTo(10, 10);
    expect(camera.position.length()).not.toBeCloseTo(10, 10);
  });

  it('should report classic controls distance relative to target', () => {
    const target = new THREE.Vector3(100, 50, -20);
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(target).add(new THREE.Vector3(0, 0, 10));
    const controls = {
      object: camera,
      target,
      update: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies CameraControlsAdapter & { target: THREE.Vector3; update: () => void };

    expect(getControlsListenerDistance(controls)).toBeCloseTo(10, 10);
    expect(camera.position.length()).not.toBeCloseTo(10, 10);
  });

  it('should use CameraControls event names for CameraControls', () => {
    const controls = {
      getTarget: (target: THREE.Vector3): THREE.Vector3 => target,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies CameraControlsAdapter;

    expect(getControlsListenerEventNames(controls)).toEqual({
      start: 'controlstart',
      stateChange: 'update',
      userMove: 'control',
      end: 'controlend',
    });
  });

  it('should use OrbitControls event names for classic target controls', () => {
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } satisfies CameraControlsAdapter & { target: THREE.Vector3; update: () => void };

    expect(getControlsListenerEventNames(controls)).toEqual({
      start: 'start',
      stateChange: 'change',
      userMove: 'change',
      end: 'end',
    });
  });

  it('should forward one unthrottled movement signal per controls gesture', async () => {
    const listeners = new Map<string, ControlEventListener>();
    const graphicsActorRef = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: fromPromise(async () => false),
        },
      }),
      { input: {} },
    );
    const controls = {
      camera: new THREE.PerspectiveCamera(),
      getTarget: (target: THREE.Vector3): THREE.Vector3 => target,
      getDistance: () => 10,
      addEventListener: vi.fn((type: string, listener: ControlEventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    } satisfies CameraControlsAdapter;
    graphicsActorRef.start();
    const actor = createActor(controlsListenerMachine, {
      input: { graphicsActorRef, controls },
    });
    actor.start();

    try {
      await expect.poll(() => listeners.has('controlstart')).toBe(true);
      await expect.poll(() => listeners.has('update')).toBe(true);
      await expect.poll(() => listeners.has('control')).toBe(true);
      await expect.poll(() => listeners.has('controlend')).toBe(true);

      listeners.get('update')?.({ type: 'update' });
      expect(graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(false);

      listeners.get('controlstart')?.({ type: 'controlstart' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.cameraInteracting).toBe(true);

      listeners.get('update')?.({ type: 'update' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(false);

      listeners.get('control')?.({ type: 'control' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);

      graphicsActorRef.send({ type: 'clearModelPointerClickGuard' });
      listeners.get('update')?.({ type: 'update' });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(false);

      listeners.get('controlend')?.({ type: 'controlend' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.cameraInteracting).toBe(false);
      expect(graphicsActorRef.getSnapshot().context.currentZoom).toBe(1);

      listeners.get('controlstart')?.({ type: 'controlstart' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.cameraInteracting).toBe(true);
      listeners.get('control')?.({ type: 'control' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);
    } finally {
      actor.stop();
      graphicsActorRef.stop();
    }
  });

  it('should treat OrbitControls change as both state change and user movement', async () => {
    const listeners = new Map<string, ControlEventListener>();
    const graphicsActorRef = createActor(
      graphicsMachine.provide({
        actors: {
          probeWebGpu: fromPromise(async () => false),
        },
      }),
      { input: {} },
    );
    const controls = {
      object: new THREE.PerspectiveCamera(),
      target: new THREE.Vector3(),
      update: vi.fn(),
      addEventListener: vi.fn((type: string, listener: ControlEventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    } satisfies CameraControlsAdapter & { target: THREE.Vector3; update: () => void };
    graphicsActorRef.start();
    const actor = createActor(controlsListenerMachine, {
      input: { graphicsActorRef, controls },
    });
    actor.start();

    try {
      await expect.poll(() => listeners.has('start')).toBe(true);
      await expect.poll(() => listeners.has('change')).toBe(true);
      await expect.poll(() => listeners.has('end')).toBe(true);

      listeners.get('start')?.({ type: 'start' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.cameraInteracting).toBe(true);

      listeners.get('change')?.({ type: 'change' });
      await expect.poll(() => graphicsActorRef.getSnapshot().context.suppressNextModelPointerClick).toBe(true);
    } finally {
      actor.stop();
      graphicsActorRef.stop();
    }
  });
});
