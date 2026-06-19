import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  getControlsDistance,
  getControlsListenerEventNames,
  resolveControlsTarget,
  syncCameraControlsUp,
  syncControlsLookAt,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

describe('camera-controls-adapter', () => {
  it('should resolve CameraControls target from getTarget', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const expectedTarget = new THREE.Vector3(100, 50, -20);
    const controls = {
      getTarget: vi.fn(
        (target: THREE.Vector3, _receiveEndValue?: boolean): THREE.Vector3 => target.copy(expectedTarget),
      ),
    };

    expect(resolveControlsTarget({ camera, controls })).toEqual(expectedTarget);
    expect(controls.getTarget).toHaveBeenCalledOnce();
    expect(controls.getTarget.mock.calls[0]?.[0]).toBeInstanceOf(THREE.Vector3);
    expect(controls.getTarget.mock.calls[0]?.[1]).toBe(false);
  });

  it('should measure classic controls distance relative to target', () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(100, 50, -20);
    camera.position.copy(target).add(new THREE.Vector3(0, 0, 10));
    const controls = {
      target,
      update: vi.fn(),
    };

    expect(getControlsDistance({ camera, controls })).toBeCloseTo(10, 10);
    expect(camera.position.length()).not.toBeCloseTo(10, 10);
  });

  it('should sync CameraControls with setLookAt', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const target = new THREE.Vector3(4, 5, 6);
    const controls = {
      getTarget: vi.fn((nextTarget: THREE.Vector3): THREE.Vector3 => nextTarget.copy(target)),
      setLookAt: vi.fn(),
    };

    syncControlsLookAt({ camera, controls, target, transition: false });

    expect(controls.setLookAt).toHaveBeenCalledWith(1, 2, 3, 4, 5, 6, false);
  });

  it('should call updateCameraUp after assigning camera up', () => {
    const camera = new THREE.PerspectiveCamera();
    const up = new THREE.Vector3(1, 0, 0);
    const controls = {
      getTarget: vi.fn((target: THREE.Vector3): THREE.Vector3 => target),
      updateCameraUp: vi.fn(),
    };

    syncCameraControlsUp({ camera, controls, up });

    expect(camera.up).toEqual(up);
    expect(controls.updateCameraUp).toHaveBeenCalledOnce();
  });

  it('should use CameraControls event names', () => {
    const controls = {
      getTarget: vi.fn((target: THREE.Vector3): THREE.Vector3 => target),
    };

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
    };

    expect(getControlsListenerEventNames(controls)).toEqual({
      start: 'start',
      stateChange: 'change',
      userMove: 'change',
      end: 'end',
    });
  });
});
