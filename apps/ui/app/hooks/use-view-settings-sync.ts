import { useEffect, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { GraphicsViewSettings, PinnedMeasurement } from '#constants/editor.constants.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
/**
 * Synchronises persistable graphics settings from the per-view GraphicsMachine
 * (and render timeout from the CadMachine) back to the EditorMachine's
 * `viewSettings` store.
 * Changes flow through the existing `updateViewSettings` event which debounces
 * writes to IndexedDB.
 *
 * The first emission is skipped so that the restored state is not immediately
 * overwritten by the initial selector values.
 *
 * IMPORTANT: Each graphics field is selected individually to produce stable
 * primitive references. Selecting into a combined object (`{ ...fields }`)
 * creates a new reference on every emission, which triggers the `useEffect`
 * on every render and causes an infinite update loop.
 */
export function useViewSettingsSync({
  viewId,
  graphicsRef,
  cadRef,
  editorRef,
}: {
  viewId: string;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine> | undefined;
  editorRef: ActorRefFrom<typeof editorMachine>;
}): void {
  // Track whether we've emitted at least once (skip the first emission)
  const hasEmittedRef = useRef(false);
  const previousSettingsRef = useRef<Partial<GraphicsViewSettings> | undefined>(undefined);

  // Select each persistable field individually so that each selector returns
  // a stable primitive/reference value and only triggers re-renders when it
  // actually changes.
  const enableSurfaces = useSelector(graphicsRef, (s) => s.context.enableSurfaces);
  const enableLines = useSelector(graphicsRef, (s) => s.context.enableLines);
  const enableGizmo = useSelector(graphicsRef, (s) => s.context.enableGizmo);
  const enableGrid = useSelector(graphicsRef, (s) => s.context.enableGrid);
  const enableAxes = useSelector(graphicsRef, (s) => s.context.enableAxes);
  const enableMatcap = useSelector(graphicsRef, (s) => s.context.enableMatcap);
  const enablePostProcessing = useSelector(graphicsRef, (s) => s.context.enablePostProcessing);
  const upDirection = useSelector(graphicsRef, (s) => s.context.upDirection);
  const cameraFovAngle = useSelector(graphicsRef, (s) => s.context.cameraFovAngle);
  const environmentPreset = useSelector(graphicsRef, (s) => s.context.environmentPreset);
  const graphicsBackendPreference = useSelector(graphicsRef, (s) => s.context.graphicsBackendPreference);

  // Pinned measurements for persistence
  const measurements = useSelector(graphicsRef, (s) => s.context.measurements);

  // Render timeout lives on the cad machine (per-file), not the graphics machine (per-view)
  const renderTimeout = useSelector(cadRef, (s) => s?.context.renderTimeout ?? 30_000);

  useEffect(() => {
    // Extract pinned measurements for persistence
    const pinnedMeasurements: PinnedMeasurement[] = measurements
      .filter((m) => m.isPinned)
      .map((m) => ({
        id: m.id,
        startPoint: m.startPoint,
        endPoint: m.endPoint,
        distance: m.distance,
        name: m.name,
      }));

    const newSettings: Partial<GraphicsViewSettings> = {
      enableSurfaces,
      enableLines,
      enableGizmo,
      enableGrid,
      enableAxes,
      enableMatcap,
      enablePostProcessing,
      upDirection,
      cameraFovAngle,
      environmentPreset,
      graphicsBackend: graphicsBackendPreference,
      pinnedMeasurements,
      renderTimeout,
      schemaVersion: 4,
    };

    // Skip the very first emission to avoid overwriting restored state
    if (hasEmittedRef.current) {
      // Already emitted, continue to comparison logic below
    } else {
      hasEmittedRef.current = true;
      previousSettingsRef.current = newSettings;
      return;
    }

    // Shallow comparison to avoid unnecessary writes
    if (previousSettingsRef.current && shallowEqual(previousSettingsRef.current, newSettings)) {
      return;
    }

    previousSettingsRef.current = newSettings;

    editorRef.send({
      type: 'updateViewSettings',
      viewId,
      settings: newSettings,
    });
  }, [
    viewId,
    editorRef,
    enableSurfaces,
    enableLines,
    enableGizmo,
    enableGrid,
    enableAxes,
    enableMatcap,
    enablePostProcessing,
    upDirection,
    cameraFovAngle,
    environmentPreset,
    graphicsBackendPreference,
    measurements,
    renderTimeout,
  ]);
}

/**
 * Shallow equality check for settings objects. Handles arrays (like
 * pinnedMeasurements and cameraState tuples) by reference comparison --
 * this is fine because XState context updates create new references when
 * values actually change.
 */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}
