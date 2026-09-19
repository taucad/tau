import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import type {
  CameraOwnedSettings,
  GraphicsViewSettings,
  PersistedCameraView,
  PersistedSectionDisplay,
  PersistedSectionView,
  PinnedMeasurement,
} from '#constants/editor.constants.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { useViewCameraSession } from '#hooks/use-graphics.js';

/** Milliseconds. Quiet period after the last camera emission before the settled pose is persisted. */
const cameraSettle = 250;

const vector3Equal = (left: readonly [number, number, number], right: readonly [number, number, number]): boolean =>
  left[0] === right[0] && left[1] === right[1] && left[2] === right[2];

const cameraViewEqual = (left: PersistedCameraView, right: PersistedCameraView): boolean =>
  left.frameId === right.frameId &&
  vector3Equal(left.target, right.target) &&
  vector3Equal(left.direction, right.direction) &&
  vector3Equal(left.up, right.up) &&
  left.verticalSpan === right.verticalSpan &&
  left.perspectiveZoom === right.perspectiveZoom;

/* The pivot and rotation are rebuilt on every assign, so a drag hands this hook a new array per
 * pointer move. Comparing by value is what keeps a drag from fanning an editor event out per frame. */
const sectionViewEqual = (left: PersistedSectionView, right: PersistedSectionView): boolean =>
  left.active === right.active &&
  left.plane === right.plane &&
  left.direction === right.direction &&
  vector3Equal(left.pivot, right.pivot) &&
  vector3Equal(left.rotation, right.rotation);

/**
 * Synchronises a view's persistable settings from its owners back to the EditorMachine's
 * `viewSettings` store, and the entry's render timeout to its `unitSettings` record.
 * Changes flow through the existing `updateViewSettings` event which debounces
 * writes to IndexedDB.
 *
 * Run by `ViewSettingsSyncHost` once per live view, outside the viewer tree: a pane that is closed,
 * unfocused or being dragged is not the owner of what its view persists (R6).
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
}: {
  viewId: string;
  /** Entry path this view renders; the key of the per-file durable record. */
  entryPath?: string;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine> | undefined;
  editorRef: ActorRefFrom<typeof editorMachine>;
}): void {
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
  /* The camera's owner is the session, not this hook's host: a view with no mounted canvas has no
   * live camera, and its persisted pose is left alone rather than overwritten from a default rig. */
  const session = useViewCameraSession(graphicsRef);
  const cameraFovAngle = useSelector(session?.rig.actorRef, (s) => s?.context.view.requestedVerticalFieldOfView);
  /* A viewer that is not rendering glTF has no pose to persist, so it clears the stale one. */
  const geometryFormat = useSelector(cadRef, (s) => s?.context.geometry?.format);
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
      /* The seed is consumed when the first geometry has been framed. Publishing before that would
       * write the rig's opening pose over the record the session was seeded from (Law 2). */
      const camera = ((): Partial<CameraOwnedSettings> => {
        if (!session) {
          return {};
        }
        if (geometryFormat !== undefined && geometryFormat !== 'gltf') {
          return { cameraFovAngle, cameraView: undefined };
        }
        if (!session.framing.initialized) {
          return {};
        }
        const { view } = session.rig.actorRef.getSnapshot().context;
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
        return {
          cameraFovAngle,
          cameraView: previous?.cameraView && cameraViewEqual(previous.cameraView, next) ? previous.cameraView : next,
        };
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
        ...camera,
        graphicsBackend: graphicsBackendPreference,
        pinnedMeasurements,
        sectionView:
          previous?.sectionView && sectionViewEqual(previous.sectionView, sectionView)
            ? previous.sectionView
            : sectionView,
        sectionDisplay,
        schemaVersion: 11,
      };

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
    persist();
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
    session,
    geometryFormat,
    graphicsBackendPreference,
    pinnedMeasurements,
    sectionView,
    sectionDisplay,
  ]);

  /* The entry's CAD actor owns its render timeout, so only a change the person makes while this
   * pane is open is written back. The value observed at mount is the seed, not an edit. */
  const observedRenderTimeoutRef = useRef<
    { cadRef: ActorRefFrom<typeof cadMachine>; renderTimeout: number } | undefined
  >(undefined);
  useEffect(() => {
    if (entryPath === undefined || !cadRef) {
      return;
    }
    const observed = observedRenderTimeoutRef.current;
    observedRenderTimeoutRef.current = { cadRef, renderTimeout };
    /* Keyed by the actor: a file switch hands this hook another entry's unit, whose first reading is
     * that unit's seed. Comparing it with the previous entry's value would write one file's timeout
     * into another file's record. */
    if (observed?.cadRef !== cadRef || observed.renderTimeout === renderTimeout) {
      return;
    }
    editorRef.send({ type: 'setUnitSettings', entryPath, settings: { renderTimeout } });
  }, [cadRef, editorRef, entryPath, renderTimeout]);

  // Persist the camera pose once it has settled instead of once per frame.
  useEffect(() => {
    if (!session) {
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = session.rig.actorRef.subscribe(() => {
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
  }, [session]);
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
