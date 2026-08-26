import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { bindViewportGizmoControls } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { Mock } from 'vitest';

class FakeGizmo {
  public readonly target = new THREE.Vector3();

  public animating = false;

  public readonly update = vi.fn();

  public readonly attachControls = vi.fn();

  public readonly detachControls = vi.fn();

  private readonly listeners = new Map<string, Set<ControlEventListener>>();

  public addEventListener(type: string, listener: ControlEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<ControlEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: ControlEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type });
    }
  }
}

class FakeCameraControls {
  public enabled = true;

  public readonly target: THREE.Vector3;

  public readonly setPosition = vi.fn();

  public readonly setLookAt = vi.fn();

  private readonly listeners = new Map<string, Set<ControlEventListener>>();

  public constructor(target = new THREE.Vector3()) {
    this.target = target;
  }

  public getTarget(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.target);
  }

  public addEventListener(type: string, listener: ControlEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<ControlEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: ControlEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type });
    }
  }
}

type TestInteractionLock = ViewportGizmoInteractionLock & {
  readonly begin: Mock<(source?: string) => () => void>;
  readonly isActive: Mock<() => boolean>;
  readonly releaseLock: Mock<() => void>;
};

const createInteractionLock = (): TestInteractionLock => {
  const activeRef = { current: false };
  const releaseLock = vi.fn<() => void>(() => {
    activeRef.current = false;
  });

  return {
    activeRef,
    begin: vi.fn<(source?: string) => () => void>(() => {
      activeRef.current = true;
      return releaseLock;
    }),
    isActive: vi.fn<() => boolean>(() => activeRef.current),
    releaseLock,
  };
};

describe('bindViewportGizmoControls', () => {
  it('should attach classic target controls directly to the gizmo', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
    };

    const binding = bindViewportGizmoControls({ camera, controls, gizmo });

    expect(binding).toBeDefined();
    expect(gizmo.attachControls).toHaveBeenCalledWith(controls);

    binding?.detach();
    expect(gizmo.detachControls).toHaveBeenCalledOnce();
  });

  it('should sync CameraControls position from the camera during gizmo change', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls(new THREE.Vector3(10, 20, 30));
    const interactionLock = createInteractionLock();

    bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });
    gizmo.emit('change');

    expect(gizmo.attachControls).not.toHaveBeenCalled();
    expect(interactionLock.begin).not.toHaveBeenCalled();
    expect(interactionLock.activeRef.current).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(controls.setPosition).toHaveBeenCalledWith(1, 2, 3, false);
    expect(controls.setLookAt).not.toHaveBeenCalled();
  });

  it('should forward model pointer suppression callbacks during CameraControls gizmo interaction', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const modelPointerInteraction = {
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd: vi.fn(),
    };
    const binding = bindViewportGizmoControls({
      camera,
      controls,
      gizmo,
      modelPointerInteraction,
    });

    gizmo.emit('start');
    gizmo.emit('change');
    gizmo.emit('end');
    binding?.detach();

    expect(modelPointerInteraction.onStart).toHaveBeenCalledOnce();
    expect(modelPointerInteraction.onMove).toHaveBeenCalledOnce();
    expect(modelPointerInteraction.onEnd).toHaveBeenCalledOnce();
  });

  it('should keep the gizmo target synchronized from CameraControls update events', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls(new THREE.Vector3(4, 5, 6));

    bindViewportGizmoControls({ camera, controls, gizmo });
    controls.target.set(7, 8, 9);
    controls.emit('update');

    expect(gizmo.target).toEqual(new THREE.Vector3(7, 8, 9));
    expect(gizmo.update).toHaveBeenLastCalledWith(false);
  });

  it('should ignore CameraControls update events while the gizmo owns camera animation', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls(new THREE.Vector3(1, 2, 3));

    bindViewportGizmoControls({ camera, controls, gizmo });
    controls.target.set(7, 8, 9);
    gizmo.emit('start');
    controls.emit('update');

    expect(gizmo.target).toEqual(new THREE.Vector3(1, 2, 3));
    expect(gizmo.update).toHaveBeenCalledTimes(1);

    gizmo.emit('end');
    controls.emit('update');

    expect(gizmo.target).toEqual(new THREE.Vector3(7, 8, 9));
    expect(gizmo.update).toHaveBeenCalledTimes(2);
  });

  it('should sync CameraControls immediately after a gizmo render frame', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const binding = bindViewportGizmoControls({ camera, controls, gizmo });

    camera.position.set(11, 12, 13);
    gizmo.emit('start');
    binding?.afterGizmoRender?.();

    expect(controls.setPosition).toHaveBeenCalledWith(11, 12, 13, false);
  });

  it('should sync CameraControls after render when upstream marks the gizmo animating before start dispatch', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(21, 22, 23);
    const gizmo = new FakeGizmo();
    gizmo.animating = true;
    const controls = new FakeCameraControls();
    const binding = bindViewportGizmoControls({ camera, controls, gizmo });

    binding?.afterGizmoRender?.();

    expect(controls.setPosition).toHaveBeenCalledWith(21, 22, 23, false);
  });

  it('should release the interaction lock on end and detach', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const activeRef = { current: false };
    const interactionLock = {
      activeRef,
      begin: vi.fn(() => {
        activeRef.current = true;
        return () => {
          activeRef.current = false;
        };
      }),
      isActive: vi.fn(() => activeRef.current),
    };

    const binding = bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

    gizmo.emit('start');
    expect(interactionLock.begin).toHaveBeenCalledOnce();
    expect(interactionLock.activeRef.current).toBe(true);

    binding?.detach();

    expect(interactionLock.activeRef.current).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('should restore initially enabled CameraControls after a repeated gizmo start', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();

    bindViewportGizmoControls({ camera, controls, gizmo });

    gizmo.emit('start');
    expect(controls.enabled).toBe(false);

    gizmo.emit('start');
    gizmo.emit('end');

    expect(controls.enabled).toBe(true);
  });

  it('should preserve initially disabled CameraControls after a repeated gizmo start', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    controls.enabled = false;

    bindViewportGizmoControls({ camera, controls, gizmo });

    gizmo.emit('start');
    gizmo.emit('start');
    gizmo.emit('end');

    expect(controls.enabled).toBe(false);
  });

  it('should keep the same interaction lock token across repeated gizmo starts', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const releaseLock = vi.fn();
    const interactionLock = {
      activeRef: { current: false },
      begin: vi.fn(() => releaseLock),
      isActive: vi.fn(() => false),
    };

    bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

    gizmo.emit('start');
    gizmo.emit('start');

    expect(interactionLock.begin).toHaveBeenCalledOnce();
    expect(releaseLock).not.toHaveBeenCalled();

    gizmo.emit('end');

    expect(releaseLock).toHaveBeenCalledOnce();
    expect(controls.enabled).toBe(true);
  });

  it('should ignore a delayed animation change after the gizmo has ended', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const interactionLock = createInteractionLock();

    bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

    gizmo.emit('start');
    gizmo.emit('start');
    camera.position.set(1, 2, 3);
    gizmo.emit('change');

    expect(interactionLock.begin).toHaveBeenCalledOnce();
    expect(interactionLock.activeRef.current).toBe(true);
    expect(controls.enabled).toBe(false);

    gizmo.emit('end');

    expect(interactionLock.releaseLock).toHaveBeenCalledOnce();
    expect(interactionLock.activeRef.current).toBe(false);
    expect(controls.enabled).toBe(true);

    camera.position.set(4, 5, 6);
    gizmo.emit('change');

    expect(interactionLock.begin).toHaveBeenCalledOnce();
    expect(interactionLock.releaseLock).toHaveBeenCalledOnce();
    expect(interactionLock.activeRef.current).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(controls.setPosition).toHaveBeenLastCalledWith(4, 5, 6, false);
  });

  it('should release a repeated-start interaction once on detach', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const releaseLock = vi.fn();
    const interactionLock = {
      activeRef: { current: false },
      begin: vi.fn(() => releaseLock),
      isActive: vi.fn(() => false),
    };
    const binding = bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

    gizmo.emit('start');
    gizmo.emit('start');
    binding?.detach();

    expect(interactionLock.begin).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(controls.enabled).toBe(true);
  });

  it('should release an idle gizmo start that never changes or ends', () => {
    vi.useFakeTimers();
    try {
      const camera = new THREE.PerspectiveCamera();
      const gizmo = new FakeGizmo();
      const controls = new FakeCameraControls();
      const releaseLock = vi.fn();
      const interactionLock = {
        activeRef: { current: false },
        begin: vi.fn(() => releaseLock),
        isActive: vi.fn(() => false),
      };

      bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

      gizmo.emit('start');
      expect(controls.enabled).toBe(false);

      vi.runOnlyPendingTimers();

      expect(releaseLock).toHaveBeenCalledOnce();
      expect(controls.enabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should keep change sync-only after an idle-start release', () => {
    vi.useFakeTimers();
    try {
      const camera = new THREE.PerspectiveCamera();
      const gizmo = new FakeGizmo();
      const controls = new FakeCameraControls();
      const interactionLock = createInteractionLock();

      bindViewportGizmoControls({ camera, controls, gizmo, interactionLock });

      gizmo.emit('start');
      vi.runOnlyPendingTimers();
      expect(interactionLock.releaseLock).toHaveBeenCalledOnce();
      expect(controls.enabled).toBe(true);
      expect(interactionLock.activeRef.current).toBe(false);

      camera.position.set(31, 32, 33);
      gizmo.emit('change');

      expect(interactionLock.begin).toHaveBeenCalledOnce();
      expect(interactionLock.releaseLock).toHaveBeenCalledOnce();
      expect(interactionLock.activeRef.current).toBe(false);
      expect(controls.enabled).toBe(true);
      expect(controls.setPosition).toHaveBeenCalledWith(31, 32, 33, false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not call setLookAt as an animation-end correction path', () => {
    const camera = new THREE.PerspectiveCamera();
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();

    bindViewportGizmoControls({ camera, controls, gizmo });
    gizmo.emit('end');

    expect(controls.setLookAt).not.toHaveBeenCalled();
  });

  it('should clean up CameraControls and gizmo listeners', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const gizmo = new FakeGizmo();
    const controls = new FakeCameraControls();
    const binding = bindViewportGizmoControls({ camera, controls, gizmo });

    binding?.detach();
    gizmo.emit('change');
    controls.emit('update');

    expect(controls.setPosition).not.toHaveBeenCalled();
    expect(gizmo.update).toHaveBeenCalledTimes(1);
  });
});
