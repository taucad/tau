import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { defaultRenderTimeout } from '#constants/editor.constants.js';
import type {
  CameraOwnedSettings,
  GraphicsViewSettings,
  PersistedCameraView,
  PersistedSectionCut,
  PersistedSectionView,
  PinnedMeasurement,
} from '#constants/editor.constants.js';
import { areSectionCutsEqual } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut } from '#components/geometry/graphics/section-cuts.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { useViewCameraSession } from '#hooks/use-graphics.js';

/** Milliseconds. Quiet period after the last camera emission or section-cut change before the pose is persisted. */
const poseSettle = 250;

const vector3Equal = (left: readonly [number, number, number], right: readonly [number, number, number]): boolean =>
  left[0] === right[0] && left[1] === right[1] && left[2] === right[2];

const cameraViewEqual = (left: PersistedCameraView, right: PersistedCameraView): boolean =>
  left.frameId === right.frameId &&
  vector3Equal(left.target, right.target) &&
  vector3Equal(left.direction, right.direction) &&
  vector3Equal(left.up, right.up) &&
  left.verticalSpan === right.verticalSpan &&
  left.perspectiveZoom === right.perspectiveZoom;

/* A drag can settle where it started, and removing a cut then adding it back rebuilds equal values under a new id.
 * Comparing by value keeps either from sending an editor event, which every editor subscriber would re-render for. */
const sectionViewEqual = (left: PersistedSectionView, right: PersistedSectionView): boolean =>
  left.active === right.active && areSectionCutsEqual(left.cuts, right.cuts);

/** A cut's values without its id, which is made anew at every load. */
const toPersistedSectionCut = (cut: SectionCut): PersistedSectionCut =>
  cut.kind === 'plane'
    ? { kind: 'plane', plane: cut.plane, offset: cut.offset, isFlipped: cut.isFlipped }
    : { kind: 'revolution', axis: cut.axis, origin: cut.origin, start: cut.start, sweep: cut.sweep };

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
 * The camera pose and the section cuts are deliberately NOT selected: they change
 * every frame during an orbit or a drag, so subscribing to them would re-render the
 * calling viewer (and fan a machine event out to every editor subscriber) once per
 * frame. They are read imperatively once they have settled.
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

  // Section view: the cuts are entry-scoped and read when they settle.
  const isSectionViewActive = useSelector(graphicsRef, (s) => s.context.isSectionViewActive);

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
          frameBasis: m.frameBasis,
          startPoint: m.startPoint,
          endPoint: m.endPoint,
          distance: m.distance,
          name: m.name,
          operation: m.operation,
          quality: m.quality,
          anchors: m.anchors,
          geometryKey: m.geometryKey,
          poseRevision: m.poseRevision,
          status: m.status,
          unavailableReason: m.unavailableReason,
          evidenceDetails: m.evidenceDetails,
        })),
    [measurements],
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

      const sectionView: PersistedSectionView = {
        active: isSectionViewActive,
        cuts: graphicsRef.getSnapshot().context.sectionCuts.map((cut) => toPersistedSectionCut(cut)),
      };

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
        schemaVersion: 12,
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
    graphicsRef,
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
    isSectionViewActive,
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

  // Persist the camera pose and the section cuts once they have settled instead of once per frame or step.
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const restartSettle = (): void => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        persistRef.current();
      }, poseSettle);
    };
    const cameraSubscription = session?.rig.actorRef.subscribe(restartSettle);
    /* The graphics actor emits for every event it handles; only a new cut list is a change. An edit that
     * changes no value keeps the list, so comparing references is enough. */
    let { sectionCuts } = graphicsRef.getSnapshot().context;
    const sectionSubscription = graphicsRef.subscribe(({ context }) => {
      if (context.sectionCuts === sectionCuts) {
        return;
      }
      ({ sectionCuts } = context);
      restartSettle();
    });

    return () => {
      cameraSubscription?.unsubscribe();
      sectionSubscription.unsubscribe();
      if (settleTimer === undefined) {
        return;
      }
      /* The pane can close, the file can change or the route can leave inside the settle window.
       * Cancelling the timer there would throw away the pose or cut the user just set, so the teardown is
       * the flush. `persist` only sends when the settings actually changed. */
      clearTimeout(settleTimer);
      persistRef.current();
    };
  }, [graphicsRef, session]);
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
