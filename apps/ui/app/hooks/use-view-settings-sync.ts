import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import type {
  GraphicsViewSettings,
  PersistedCameraView,
  PersistedSectionDisplay,
  PersistedSectionView,
  PinnedMeasurement,
} from '#constants/editor.constants.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { useCameraRig, useCameraSelector } from '#hooks/use-graphics.js';

/** Milliseconds. Quiet period after the last camera emission before the settled pose is persisted. */
const cameraSettle = 250;

const cameraVectorEqual = (left: PersistedCameraView['target'], right: PersistedCameraView['target']): boolean =>
  left[0] === right[0] && left[1] === right[1] && left[2] === right[2];

const cameraViewEqual = (left: PersistedCameraView, right: PersistedCameraView): boolean =>
  left.frameId === right.frameId &&
  cameraVectorEqual(left.target, right.target) &&
  cameraVectorEqual(left.direction, right.direction) &&
  cameraVectorEqual(left.up, right.up) &&
  left.verticalSpan === right.verticalSpan &&
  left.perspectiveZoom === right.perspectiveZoom;
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
 *
 * The camera pose is deliberately NOT selected: it changes every frame during
 * an orbit, so subscribing to it would re-render the calling viewer (and fan a
 * machine event out to every editor subscriber) once per frame. It is read
 * imperatively once the pose has settled.
 */
export function useViewSettingsSync({
  viewId,
  entryPath,
  graphicsRef,
  cadRef,
  editorRef,
  persistCameraView = true,
  enabled = true,
}: {
  viewId: string;
  /** Entry path this view renders; the key of the per-file durable record. */
  entryPath?: string;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine> | undefined;
  editorRef: ActorRefFrom<typeof editorMachine>;
  /** `pending` defers the first emission until the renderer format is known. */
  persistCameraView?: boolean | 'pending';
  /** False while a live Dockview preview owns the graphics actor. */
  enabled?: boolean;
}): void {
  // Track whether we've emitted at least once (skip the first emission)
  const hasEmittedRef = useRef(false);
  const previousSettingsRef = useRef<Partial<GraphicsViewSettings> | undefined>(undefined);
  const persistRef = useRef<() => void>(() => undefined);

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
  const cameraFovAngle = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);
  const cameraRig = useCameraRig();
  const graphicsBackendPreference = useSelector(graphicsRef, (s) => s.context.graphicsBackendPreference);

  // Section view: the cut is entry-scoped, its display preferences are pane-scoped (E2)
  const isSectionViewActive = useSelector(graphicsRef, (s) => s.context.isSectionViewActive);
  const selectedSectionViewId = useSelector(graphicsRef, (s) => s.context.selectedSectionViewId);
  const sectionViewPivot = useSelector(graphicsRef, (s) => s.context.sectionViewPivot);
  const sectionViewRotation = useSelector(graphicsRef, (s) => s.context.sectionViewRotation);
  const sectionViewDirection = useSelector(graphicsRef, (s) => s.context.sectionViewDirection);
  const enableClippingLines = useSelector(graphicsRef, (s) => s.context.enableClippingLines);
  const enableClippingMesh = useSelector(graphicsRef, (s) => s.context.enableClippingMesh);
  const planeName = useSelector(graphicsRef, (s) => s.context.planeName);

  // Pinned measurements for persistence
  const measurements = useSelector(graphicsRef, (s) => s.context.measurements);

  // Render timeout lives on the cad machine (per-file), so it is written to the per-entry record
  const renderTimeout = useSelector(cadRef, (s) => s?.context.renderTimeout ?? defaultRenderTimeout);

  // Rebuilt only when the measurements themselves change, so the shallow
  // comparison below can bail out on an unchanged settings object.
  const pinnedMeasurements = useMemo<PinnedMeasurement[]>(
    () =>
      measurements
        .filter((m) => m.isPinned)
        .map((m) => ({
          id: m.id,
          frameId: m.frameId,
          startPoint: m.startPoint,
          endPoint: m.endPoint,
          distance: m.distance,
          name: m.name,
        })),
    [measurements],
  );

  const sectionView = useMemo<PersistedSectionView>(
    () => ({
      active: isSectionViewActive,
      plane: selectedSectionViewId,
      pivot: sectionViewPivot,
      rotation: sectionViewRotation,
      direction: sectionViewDirection,
    }),
    [isSectionViewActive, selectedSectionViewId, sectionViewPivot, sectionViewRotation, sectionViewDirection],
  );

  const sectionDisplay = useMemo<PersistedSectionDisplay>(
    () => ({ clipLines: enableClippingLines, clipMesh: enableClippingMesh, planeName }),
    [enableClippingLines, enableClippingMesh, planeName],
  );

  useEffect(() => {
    const persist = (): void => {
      const previous = previousSettingsRef.current;
      const currentCameraView = ((): PersistedCameraView | undefined => {
        if (!persistCameraView) {
          return undefined;
        }
        const { view } = cameraRig.actorRef.getSnapshot().context;
        const next: PersistedCameraView = {
          frameId: view.frameId,
          target: view.target,
          direction: view.direction,
          up: view.up,
          verticalSpan: view.verticalSpan,
          perspectiveZoom: view.perspectiveZoom,
        };
        // Reuse the previous reference for an unchanged pose so the shallow
        // comparison below still recognises "nothing to write".
        return previous?.cameraView && cameraViewEqual(previous.cameraView, next) ? previous.cameraView : next;
      })();

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
        cameraView: currentCameraView,
        graphicsBackend: graphicsBackendPreference,
        pinnedMeasurements,
        sectionView,
        sectionDisplay,
        schemaVersion: 11,
      };

      // Skip the first 3D emission to avoid overwriting restored state. A
      // non-3D viewer may clear stale camera state immediately.
      if (hasEmittedRef.current || !persistCameraView) {
        // Already emitted, continue to comparison logic below
      } else {
        hasEmittedRef.current = true;
        previousSettingsRef.current = newSettings;
        return;
      }

      // Shallow comparison to avoid unnecessary writes
      if (previous && shallowEqual(previous, newSettings)) {
        return;
      }

      previousSettingsRef.current = newSettings;

      editorRef.send({
        type: 'updateViewSettings',
        viewId,
        settings: newSettings,
      });
    };

    persistRef.current = persist;

    if (!enabled || persistCameraView === 'pending') {
      return;
    }

    persist();
  }, [
    viewId,
    editorRef,
    enabled,
    enableSurfaces,
    enableLines,
    enableGizmo,
    enableGrid,
    enableAxes,
    enableMatcap,
    enablePostProcessing,
    upDirection,
    cameraFovAngle,
    cameraRig,
    persistCameraView,
    graphicsBackendPreference,
    pinnedMeasurements,
    sectionView,
    sectionDisplay,
  ]);

  /* The entry's CAD actor owns its render timeout, so only a change the person makes while this
   * pane is open is written back. The value observed at mount is the seed, not an edit. */
  const observedRenderTimeoutRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled || entryPath === undefined || !cadRef) {
      return;
    }
    const observed = observedRenderTimeoutRef.current;
    observedRenderTimeoutRef.current = renderTimeout;
    if (observed === undefined || observed === renderTimeout) {
      return;
    }
    editorRef.send({ type: 'setUnitSettings', entryPath, settings: { renderTimeout } });
  }, [cadRef, editorRef, enabled, entryPath, renderTimeout]);

  // Persist the camera pose once it has settled instead of once per frame.
  useEffect(() => {
    if (!enabled || persistCameraView !== true) {
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = cameraRig.actorRef.subscribe(() => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        persistRef.current();
      }, cameraSettle);
    });

    return () => {
      subscription.unsubscribe();
      if (settleTimer === undefined) {
        return;
      }
      /* The pane can close, the file can change or the route can leave inside the settle window.
       * Cancelling the timer there would throw away the pose the user just set, so the teardown is
       * the flush. `persist` only sends when the settings actually changed. */
      clearTimeout(settleTimer);
      persistRef.current();
    };
  }, [cameraRig, enabled, persistCameraView]);
}

/**
 * Shallow equality check for settings objects. Handles arrays such as
 * pinnedMeasurements by reference comparison --
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
