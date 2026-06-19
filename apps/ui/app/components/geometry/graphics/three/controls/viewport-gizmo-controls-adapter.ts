import type * as THREE from 'three';
import {
  isCameraControls,
  isClassicTargetControls,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type {
  CameraControlsLike,
  ClassicTargetControlsLike,
  ControlEventListener,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';

type ViewportGizmoLike = {
  target: THREE.Vector3;
  readonly animating?: boolean;
  update(controls?: boolean): unknown;
  detachControls?(): unknown;
  addEventListener(type: string, listener: ControlEventListener): void;
  removeEventListener(type: string, listener: ControlEventListener): void;
};

type ViewportGizmoAttachable = {
  attachControls(controls: ClassicTargetControlsLike): unknown;
};

export type ViewportGizmoControlsBinding = {
  detach: () => void;
  afterGizmoRender?: () => void;
};

export type ViewportGizmoModelPointerInteraction = {
  readonly onStart?: () => void;
  readonly onMove?: () => void;
  readonly onEnd?: () => void;
};

const hasAttachControls = (gizmo: ViewportGizmoLike): gizmo is ViewportGizmoLike & ViewportGizmoAttachable => {
  return typeof (gizmo as { attachControls?: unknown }).attachControls === 'function';
};

const bindClassicTargetControls = ({
  gizmo,
  controls,
}: {
  readonly gizmo: ViewportGizmoLike;
  readonly controls: unknown;
}): ViewportGizmoControlsBinding | undefined => {
  if (!isClassicTargetControls(controls) || !hasAttachControls(gizmo)) {
    return undefined;
  }

  gizmo.attachControls(controls);

  return {
    detach: () => {
      gizmo.detachControls?.();
    },
  };
};

const bindCameraControls = ({
  camera,
  gizmo,
  controls,
  interactionLock,
  modelPointerInteraction,
}: {
  readonly camera: THREE.Camera;
  readonly gizmo: ViewportGizmoLike;
  readonly controls: CameraControlsLike;
  readonly interactionLock?: ViewportGizmoInteractionLock;
  readonly modelPointerInteraction?: ViewportGizmoModelPointerInteraction;
}): ViewportGizmoControlsBinding => {
  let controlsEnabledBeforeGizmo = controls.enabled ?? true;
  let isGizmoInteractionActive = false;
  let hasGizmoChangeDuringInteraction = false;
  let endGizmoInteraction: (() => void) | undefined;
  let idleStartReleaseTimer: ReturnType<typeof setTimeout> | undefined;

  const syncControlsFromCamera = (): void => {
    if (typeof controls.setPosition === 'function') {
      void controls.setPosition(camera.position.x, camera.position.y, camera.position.z, false);
      return;
    }

    if (typeof controls.setLookAt === 'function') {
      void controls.setLookAt(
        camera.position.x,
        camera.position.y,
        camera.position.z,
        gizmo.target.x,
        gizmo.target.y,
        gizmo.target.z,
        false,
      );
    }
  };

  const clearIdleStartReleaseTimer = (): void => {
    if (idleStartReleaseTimer === undefined) {
      return;
    }

    clearTimeout(idleStartReleaseTimer);
    idleStartReleaseTimer = undefined;
  };

  const releaseGizmoInteraction = ({ syncControls }: { readonly syncControls: boolean }): void => {
    if (!isGizmoInteractionActive) {
      return;
    }

    if (syncControls) {
      syncControlsFromCamera();
    }

    clearIdleStartReleaseTimer();
    isGizmoInteractionActive = false;
    hasGizmoChangeDuringInteraction = false;
    endGizmoInteraction?.();
    endGizmoInteraction = undefined;
    modelPointerInteraction?.onEnd?.();
    controls.enabled = controlsEnabledBeforeGizmo;
  };

  const scheduleIdleStartRelease = (): void => {
    clearIdleStartReleaseTimer();
    idleStartReleaseTimer = setTimeout(() => {
      idleStartReleaseTimer = undefined;
      if (!isGizmoInteractionActive || hasGizmoChangeDuringInteraction || gizmo.animating === true) {
        return;
      }

      releaseGizmoInteraction({ syncControls: false });
    }, 0);
  };

  const beginGizmoInteraction = (): void => {
    if (isGizmoInteractionActive) {
      return;
    }

    controlsEnabledBeforeGizmo = controls.enabled ?? true;
    isGizmoInteractionActive = true;
    hasGizmoChangeDuringInteraction = false;
    endGizmoInteraction = interactionLock?.begin('viewport-gizmo');
    modelPointerInteraction?.onStart?.();
    controls.enabled = false;
    scheduleIdleStartRelease();
  };

  const handleGizmoStart = (): void => {
    beginGizmoInteraction();
  };

  const handleGizmoEnd = (): void => {
    releaseGizmoInteraction({ syncControls: true });
  };

  const handleGizmoChange = (): void => {
    if (isGizmoInteractionActive) {
      hasGizmoChangeDuringInteraction = true;
      clearIdleStartReleaseTimer();
      modelPointerInteraction?.onMove?.();
    }

    syncControlsFromCamera();
  };

  const handleControlsUpdate = (): void => {
    if (isGizmoInteractionActive || gizmo.animating === true) {
      return;
    }

    controls.getTarget(gizmo.target, false);
    gizmo.update(false);
  };

  controls.getTarget(gizmo.target, false);
  gizmo.update(false);

  gizmo.addEventListener('start', handleGizmoStart);
  gizmo.addEventListener('end', handleGizmoEnd);
  gizmo.addEventListener('change', handleGizmoChange);
  controls.addEventListener?.('update', handleControlsUpdate);

  return {
    afterGizmoRender: () => {
      if (!isGizmoInteractionActive && gizmo.animating !== true) {
        return;
      }

      syncControlsFromCamera();
    },
    detach: () => {
      gizmo.removeEventListener('start', handleGizmoStart);
      gizmo.removeEventListener('end', handleGizmoEnd);
      gizmo.removeEventListener('change', handleGizmoChange);
      controls.removeEventListener?.('update', handleControlsUpdate);
      releaseGizmoInteraction({ syncControls: false });
      clearIdleStartReleaseTimer();
    },
  };
};

export const bindViewportGizmoControls = ({
  camera,
  controls,
  gizmo,
  interactionLock,
  modelPointerInteraction,
}: {
  readonly camera: THREE.Camera;
  readonly controls: unknown;
  readonly gizmo: ViewportGizmoLike;
  readonly interactionLock?: ViewportGizmoInteractionLock;
  readonly modelPointerInteraction?: ViewportGizmoModelPointerInteraction;
}): ViewportGizmoControlsBinding | undefined => {
  const classicBinding = bindClassicTargetControls({ gizmo, controls });
  if (classicBinding) {
    return classicBinding;
  }

  if (isCameraControls(controls)) {
    return bindCameraControls({ camera, controls, gizmo, interactionLock, modelPointerInteraction });
  }

  return undefined;
};
