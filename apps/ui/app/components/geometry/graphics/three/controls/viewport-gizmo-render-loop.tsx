import { useFrame } from '@react-three/fiber';
import { createContext, useContext } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ViewportGizmoControlsBinding } from '#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js';
import type {
  SectionPlanePicker,
  SectionPlanePickerRenderer,
} from '#components/geometry/graphics/three/controls/section-plane-picker.js';

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

/** The section plane picker the view cube's loop draws beside the cube; provided only while Section is on. */
export const SectionPlanePickerContext = createContext<SectionPlanePicker | undefined>(undefined);

/**
 * The view cube's viewport `[x, y, width, height]` in CSS pixels, as the gizmo last placed it, in the renderer's
 * convention (`y` from the bottom on WebGL, from the top on WebGPU). `three-viewport-gizmo` keeps it private; a
 * changed shape reads as none, and the picker then skips its draw.
 */
export const readGizmoViewport = (
  gizmo: Readonly<Record<string, unknown>>,
): readonly [number, number, number, number] | undefined => {
  const viewport = gizmo['_viewport'];
  if (!Array.isArray(viewport)) {
    return undefined;
  }
  const values: readonly unknown[] = viewport;
  const [x, y, width, height] = values;
  return typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
    ? [x, y, width, height]
    : undefined;
};

export const renderViewportGizmoFrame = ({
  gizmo,
  renderer,
  controlsBinding,
  invalidate,
  planePicker,
}: {
  readonly gizmo: ViewportGizmoRenderLoopGizmoLike;
  readonly renderer: ToneMappingRendererLike;
  readonly controlsBinding?: ViewportGizmoControlsBinding;
  readonly invalidate: () => void;
  /** Drawn first, beside the cube, with the view camera it turns with. */
  readonly planePicker?: Readonly<{
    picker: SectionPlanePicker;
    renderer: SectionPlanePickerRenderer;
    camera: THREE.Camera;
  }>;
}): void => {
  const previousTone = renderer.toneMapping;
  if (previousTone !== undefined) {
    renderer.toneMapping = THREE.NoToneMapping;
  }

  try {
    const cubeViewport = planePicker ? readGizmoViewport(gizmo) : undefined;
    if (planePicker && cubeViewport) {
      planePicker.picker.render({ renderer: planePicker.renderer, camera: planePicker.camera, cubeViewport });
    }
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
  const planePicker = useContext(SectionPlanePickerContext);
  useFrame((state) => {
    const gizmo = gizmoRef.current;
    if (!gizmo) {
      return;
    }

    renderViewportGizmoFrame({
      gizmo,
      renderer,
      controlsBinding: controlsBindingRef.current,
      invalidate,
      planePicker: planePicker ? { picker: planePicker, renderer: state.gl, camera: state.camera } : undefined,
    });
  }, 3);
}
