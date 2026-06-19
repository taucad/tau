import { useFrame } from '@react-three/fiber';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ViewportGizmoControlsBinding } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';

type ToneMappingRendererLike = {
  toneMapping?: THREE.ToneMapping;
};

type ViewportGizmoRenderLoopGizmoLike = {
  readonly animating: boolean;
  render: () => void;
};

type ViewportGizmoInvalidationEventType = 'start' | 'end' | 'change' | 'hoverchange';

type ViewportGizmoInvalidationTargetLike = {
  addEventListener: (type: ViewportGizmoInvalidationEventType, listener: ControlEventListener) => void;
  removeEventListener: (type: ViewportGizmoInvalidationEventType, listener: ControlEventListener) => void;
};

export const renderViewportGizmoFrame = ({
  gizmo,
  renderer,
  controlsBinding,
  invalidate,
}: {
  readonly gizmo: ViewportGizmoRenderLoopGizmoLike;
  readonly renderer: ToneMappingRendererLike;
  readonly controlsBinding?: ViewportGizmoControlsBinding;
  readonly invalidate: () => void;
}): void => {
  const previousTone = renderer.toneMapping;
  if (previousTone !== undefined) {
    renderer.toneMapping = THREE.NoToneMapping;
  }

  try {
    gizmo.render();
    controlsBinding?.afterGizmoRender?.();
  } finally {
    if (previousTone !== undefined) {
      renderer.toneMapping = previousTone;
    }
  }

  if (gizmo.animating) {
    invalidate();
  }
};

export const bindViewportGizmoInvalidationEvents = ({
  gizmo,
  invalidate,
}: {
  readonly gizmo: ViewportGizmoInvalidationTargetLike;
  readonly invalidate: () => void;
}): (() => void) => {
  const handleInvalidate: ControlEventListener = () => {
    invalidate();
  };
  const eventTypes = ['start', 'end', 'change', 'hoverchange'] as const;

  for (const eventType of eventTypes) {
    gizmo.addEventListener(eventType, handleInvalidate);
  }

  return () => {
    for (const eventType of eventTypes) {
      gizmo.removeEventListener(eventType, handleInvalidate);
    }
  };
};

export function useViewportGizmoRenderLoop({
  gizmoRef,
  renderer,
  controlsBindingRef,
  invalidate,
}: {
  readonly gizmoRef: RefObject<ViewportGizmoRenderLoopGizmoLike | undefined>;
  readonly renderer: ToneMappingRendererLike;
  readonly controlsBindingRef: RefObject<ViewportGizmoControlsBinding | undefined>;
  readonly invalidate: () => void;
}): void {
  useFrame(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) {
      return;
    }

    renderViewportGizmoFrame({
      gizmo,
      renderer,
      controlsBinding: controlsBindingRef.current,
      invalidate,
    });
  }, 3);
}
