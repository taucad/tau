import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
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
import { lengthUnits, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { viewCameraOrientation } from '#workbench-records/projection.js';
import type { ViewRecordPatch } from '#workbench-records/view-store.js';

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
const sameRecordField = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const activeCameraRecord = (record: WorkbenchView): WorkbenchView => {
  const selected = record.selectedKernelView;
  if (!selected) {
    return record;
  }
  return {
    ...record,
    camera: record.kernelViews?.find((view) => view.id === selected)?.camera ?? { kind: 'preset', preset: 'isometric' },
  };
};

/** A cut's values without its id, which is made anew at every load. */
const toPersistedSectionCut = (cut: SectionCut): PersistedSectionCut =>
  cut.kind === 'plane'
    ? {
        kind: 'plane',
        plane: cut.plane,
        offset: cut.offset,
        isFlipped: cut.isFlipped,
      }
    : {
        kind: 'revolution',
        axis: cut.axis,
        origin: cut.origin,
        start: cut.start,
        sweep: cut.sweep,
      };

/**
 * Synchronises a view's persistable settings from its live graphics and camera owners
 * into the checked workbench view record. Shared per-entry settings have their own owner.
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
  editorRef,
  record,
  recordLocalPatch,
  recordReady,
  writeRecord,
  onRecordApplied,
}: {
  viewId: string;
  /** Entry path this view renders; the key of the per-file durable record. */
  entryPath?: string;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine> | undefined;
  editorRef: ActorRefFrom<typeof editorMachine>;
  record: WorkbenchView | undefined;
  /** Exact live-owner fields acknowledged by this checked record write. */
  recordLocalPatch?: ViewRecordPatch;
  recordReady: boolean;
  writeRecord: (next: WorkbenchView) => Promise<boolean>;
  onRecordApplied?: (record: WorkbenchView) => void;
}): void {
  const previousSettingsRef = useRef<Partial<GraphicsViewSettings> | undefined>(undefined);
  const previousGridUnitRef = useRef<string | undefined>(undefined);
  const persistRef = useRef<(includePose: boolean) => void>(() => undefined);
  const adoptedPoseRef = useRef<PersistedCameraView | undefined>(undefined);
  const firstFrameReceiptRef = useRef<{ view: PersistedCameraView; consumed: boolean } | undefined>(undefined);
  const appliedRecordRef = useRef<WorkbenchView | undefined>(undefined);
  const appliedSessionRef = useRef<ReturnType<typeof useViewCameraSession>>(undefined);
  const lastCameraEmissionRef = useRef(0);
  const lastSectionEmissionRef = useRef(0);
  const cameraAdoptionPendingRef = useRef(false);
  const sectionAdoptionPendingRef = useRef(false);
  const pendingCameraRecordRef = useRef<WorkbenchView | undefined>(undefined);
  const pendingSectionRecordRef = useRef<WorkbenchView | undefined>(undefined);

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
  const gridUnit = useSelector(graphicsRef, (s) => s.context.displayUnits.length.symbol);
  const upDirection = useSelector(graphicsRef, (s) => s.context.upDirection);
  /* The camera's owner is the session, not this hook's host: a view with no mounted canvas has no
   * live camera, and its persisted pose is left alone rather than overwritten from a default rig. */
  const session = useViewCameraSession(graphicsRef);
  const cameraFovAngle = useSelector(session?.rig.actorRef, (s) => s?.context.view.requestedVerticalFieldOfView);
  /* A viewer that is not rendering glTF has no pose to persist, so it clears the stale one. */
  const artifactMimeType = useSelector(graphicsRef, (s) => s.context.artifact?.mimeType);
  const graphicsBackendPreference = useSelector(graphicsRef, (s) => s.context.graphicsBackendPreference);

  useEffect(() => {
    if (editorRef.getSnapshot().context.graphicsBackendPreferences[viewId] !== graphicsBackendPreference) {
      editorRef.send({
        type: 'setGraphicsBackendPreference',
        viewId,
        preference: graphicsBackendPreference,
      });
    }
  }, [editorRef, graphicsBackendPreference, viewId]);

  // Section view: the cuts are entry-scoped and read when they settle.
  const isSectionViewActive = useSelector(graphicsRef, (s) => s.context.isSectionViewActive);

  // Pinned measurements for persistence
  const measurements = useSelector(graphicsRef, (s) => s.context.measurements);

  // A watched record applies through the existing owners. The view file remains the only durable copy.
  useEffect(() => {
    if (!record) {
      return;
    }
    const acknowledge = (): void => {
      if (session && !cameraAdoptionPendingRef.current && !sectionAdoptionPendingRef.current) {
        onRecordApplied?.(record);
      }
    };
    const cameraRecord = activeCameraRecord(record);
    const previous = appliedSessionRef.current === session ? appliedRecordRef.current : undefined;
    appliedSessionRef.current = session;
    appliedRecordRef.current = cameraRecord;
    let sectionTimer: ReturnType<typeof setTimeout> | undefined;
    const { context } = graphicsRef.getSnapshot();
    const visibility = [
      ['enableSurfaces', 'surfaces', 'setSurfaceVisibility'],
      ['enableLines', 'lines', 'setLinesVisibility'],
      ['enableGizmo', 'gizmo', 'setGizmoVisibility'],
      ['enableGrid', 'grid', 'setGridVisibility'],
      ['enableAxes', 'axes', 'setAxesVisibility'],
      ['enableMatcap', 'matcap', 'setMatcapVisibility'],
      ['enablePostProcessing', 'postProcessing', 'setPostProcessingVisibility'],
    ] as const;
    for (const [ownerKey, recordKey, type] of visibility) {
      if (
        (!previous ||
          (recordLocalPatch?.display?.[recordKey] === undefined &&
            previous.display[recordKey] !== record.display[recordKey])) &&
        context[ownerKey] !== record.display[recordKey]
      ) {
        graphicsRef.send({ type, payload: record.display[recordKey] });
      }
    }
    if (
      (!previous || (recordLocalPatch?.upDirection === undefined && previous.upDirection !== record.upDirection)) &&
      context.upDirection !== record.upDirection
    ) {
      graphicsRef.send({ type: 'setUpDirection', payload: record.upDirection });
    }
    if (
      (!previous || (recordLocalPatch?.grid?.unit === undefined && previous.grid.unit !== record.grid.unit)) &&
      context.displayUnits.length.symbol !== record.grid.unit
    ) {
      graphicsRef.send({
        type: 'setGridUnit',
        payload: { unit: record.grid.unit },
      });
    }
    if (
      session &&
      (!previous || (recordLocalPatch?.fieldOfView === undefined && previous.fieldOfView !== record.fieldOfView))
    ) {
      session.rig.actorRef.send({
        type: 'setVerticalFieldOfView',
        verticalFieldOfView: record.fieldOfView,
      });
    }
    const selected = cameraRecord.selectedKernelView;
    const selectedPatch =
      selected && recordLocalPatch?.kernelViews && Object.hasOwn(recordLocalPatch.kernelViews, selected)
        ? recordLocalPatch.kernelViews[selected]
        : undefined;
    const localCameraReceipt = selected
      ? selectedPatch !== null && selectedPatch !== undefined && Object.hasOwn(selectedPatch, 'camera')
      : recordLocalPatch?.camera !== undefined;
    const selectedChanged = previous?.selectedKernelView !== cameraRecord.selectedKernelView;
    if (previous && localCameraReceipt && !selectedChanged) {
      pendingCameraRecordRef.current = undefined;
      cameraAdoptionPendingRef.current = false;
    }
    const needsCamera =
      Boolean(session) &&
      (!previous ||
        selectedChanged ||
        (!localCameraReceipt && !sameRecordField(previous.camera, cameraRecord.camera)) ||
        Boolean(pendingCameraRecordRef.current));
    if (needsCamera && (!localCameraReceipt || !previous || selectedChanged)) {
      if (session && !session.framing.initialized) {
        // oxlint-disable-next-line react/immutability -- The session framing record is mutable actor-owned state, not React state.
        session.framing.pendingView = cameraRecord.camera.kind === 'pose' ? cameraRecord.camera : undefined;
        // oxlint-disable-next-line react/immutability -- The first geometry frame consumes this actor-owned marker.
        session.framing.preserveOrientationOnFirstFrame = cameraRecord.camera.kind !== 'pose';
      }
      pendingCameraRecordRef.current = cameraRecord;
      cameraAdoptionPendingRef.current = true;
    }
    if (previous && recordLocalPatch?.section !== undefined) {
      pendingSectionRecordRef.current = undefined;
      sectionAdoptionPendingRef.current = false;
    }
    if (
      !previous ||
      (recordLocalPatch?.section === undefined && !sameRecordField(previous.section, record.section)) ||
      pendingSectionRecordRef.current
    ) {
      if (recordLocalPatch?.section === undefined || !previous) {
        pendingSectionRecordRef.current = record;
      }
      sectionAdoptionPendingRef.current = true;
      const apply = (): void => {
        const wait = poseSettle - (Date.now() - lastSectionEmissionRef.current);
        if (wait > 0) {
          sectionTimer = setTimeout(apply, wait);
          return;
        }
        const latest = pendingSectionRecordRef.current;
        if (latest) {
          graphicsRef.send({
            type: 'adoptSectionView',
            section: latest.section,
          });
        }
        pendingSectionRecordRef.current = undefined;
        sectionAdoptionPendingRef.current = false;
        acknowledge();
      };
      apply();
    }
    if (
      !previous ||
      (recordLocalPatch?.measurements === undefined && !sameRecordField(previous.measurements, record.measurements))
    ) {
      graphicsRef.send({
        type: 'adoptPinnedMeasurements',
        measurements: record.measurements,
      });
    }
    if (!session || !needsCamera) {
      acknowledge();
      return () => {
        if (sectionTimer !== undefined) {
          clearTimeout(sectionTimer);
        }
      };
    }
    const actor = session.rig.actorRef;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = (): void => {
      const remaining = poseSettle - (Date.now() - lastCameraEmissionRef.current);
      if (remaining > 0) {
        timer = setTimeout(apply, remaining);
        return;
      }
      const latest = pendingCameraRecordRef.current;
      if (!latest) {
        return;
      }
      const current = actor.getSnapshot().context.view;
      if (latest.camera.kind === 'pose') {
        actor.send({ type: 'setView', ...latest.camera });
        adoptedPoseRef.current = latest.camera;
      } else {
        const orientation = viewCameraOrientation(latest)!;
        actor.send({
          type: 'setView',
          target: current.target,
          ...orientation,
          verticalSpan: current.verticalSpan,
        });
        actor.send({ type: 'frame', margin: 0.1 });
        adoptedPoseRef.current = actor.getSnapshot().context.view;
      }
      pendingCameraRecordRef.current = undefined;
      cameraAdoptionPendingRef.current = false;
      acknowledge();
    };
    apply();
    acknowledge();
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (sectionTimer !== undefined) {
        clearTimeout(sectionTimer);
      }
    };
  }, [graphicsRef, onRecordApplied, record, recordLocalPatch, session]);

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
    const persist = (includePose: boolean): void => {
      if (!recordReady || !entryPath) {
        return;
      }
      const previous = previousSettingsRef.current;
      /* The seed is consumed when the first geometry has been framed. Publishing before that would
       * write the rig's opening pose over the record the session was seeded from (Law 2). */
      const camera = ((): Partial<CameraOwnedSettings> => {
        if (!session) {
          return {};
        }
        if (artifactMimeType !== undefined && artifactMimeType !== 'model/gltf-binary') {
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
        const { firstFrameView } = session.framing;
        if (firstFrameReceiptRef.current?.view !== firstFrameView) {
          firstFrameReceiptRef.current = firstFrameView ? { view: firstFrameView, consumed: false } : undefined;
        }
        if (includePose && firstFrameView && !cameraViewEqual(firstFrameView, next) && firstFrameReceiptRef.current) {
          firstFrameReceiptRef.current.consumed = true;
        }
        // A setting-only write must not consume the pending pose. The settle callback
        // will compare it against the last pose included in a camera write.
        return {
          cameraFovAngle,
          cameraView: includePose
            ? previous?.cameraView && cameraViewEqual(previous.cameraView, next)
              ? previous.cameraView
              : next
            : previous?.cameraView,
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
        pinnedMeasurements,
        sectionView:
          previous?.sectionView && sectionViewEqual(previous.sectionView, sectionView)
            ? previous.sectionView
            : sectionView,
        schemaVersion: 12,
      };

      // Shallow comparison to avoid unnecessary writes
      if (previous && shallowEqual(previous, newSettings) && previousGridUnitRef.current === gridUnit) {
        return;
      }

      previousSettingsRef.current = newSettings;
      previousGridUnitRef.current = gridUnit;
      // A missing file is not a creation command. Opening the pane creates it explicitly; a
      // later owner edit can recreate a file deleted by another window.
      if (!record && !previous) {
        return;
      }

      const base = record ?? workbenchRecords.view.schema.parse({ version: 1, entryPath });
      const changedCamera: WorkbenchView['camera'] | undefined =
        includePose &&
        !cameraAdoptionPendingRef.current &&
        camera.cameraView &&
        !(adoptedPoseRef.current && cameraViewEqual(adoptedPoseRef.current, camera.cameraView)) &&
        !(
          firstFrameReceiptRef.current &&
          !firstFrameReceiptRef.current.consumed &&
          cameraViewEqual(firstFrameReceiptRef.current.view, camera.cameraView)
        )
          ? {
              kind: 'pose',
              ...camera.cameraView,
              target: [...camera.cameraView.target] as [number, number, number],
              direction: [...camera.cameraView.direction] as [number, number, number],
              up: [...camera.cameraView.up] as [number, number, number],
            }
          : undefined;
      const selected = base.selectedKernelView;
      const next: WorkbenchView = {
        ...base,
        entryPath,
        fieldOfView: cameraFovAngle ?? base.fieldOfView,
        upDirection,
        display: {
          surfaces: enableSurfaces,
          lines: enableLines,
          gizmo: enableGizmo,
          grid: enableGrid,
          axes: enableAxes,
          matcap: enableMatcap,
          postProcessing: enablePostProcessing,
        },
        grid: {
          unit: lengthUnits.includes(gridUnit as WorkbenchView['grid']['unit'])
            ? (gridUnit as WorkbenchView['grid']['unit'])
            : base.grid.unit,
        },
        section: sectionAdoptionPendingRef.current ? base.section : sectionView,
        measurements: pinnedMeasurements.map(({ id, frameId, startPoint, endPoint, distance, name }) => ({
          id,
          frameId,
          startPoint,
          endPoint,
          distance,
          ...(name ? { name } : {}),
        })),
        camera: !selected && changedCamera ? changedCamera : base.camera,
        kernelViews:
          selected && changedCamera
            ? base.kernelViews?.some((view) => view.id === selected)
              ? base.kernelViews.map((view) => (view.id === selected ? { ...view, camera: changedCamera } : view))
              : [...(base.kernelViews ?? []), { id: selected, camera: changedCamera }]
            : base.kernelViews,
      };
      void writeRecord(next);
    };

    persistRef.current = persist;
    persist(false);
  }, [
    graphicsRef,
    enableSurfaces,
    enableLines,
    enableGizmo,
    enableGrid,
    enableAxes,
    enableMatcap,
    enablePostProcessing,
    upDirection,
    gridUnit,
    cameraFovAngle,
    session,
    artifactMimeType,
    pinnedMeasurements,
    isSectionViewActive,
    record,
    recordReady,
    writeRecord,
    entryPath,
  ]);

  // Persist the camera pose and the section cuts once they have settled instead of once per frame or step.
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const restartSettle = (includePose: boolean): void => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        persistRef.current(includePose);
      }, poseSettle);
    };
    const cameraSubscription = session?.rig.actorRef.subscribe(() => {
      lastCameraEmissionRef.current = Date.now();
      restartSettle(true);
    });
    /* The graphics actor emits for every event it handles; only a new cut list is a change. An edit that
     * changes no value keeps the list, so comparing references is enough. */
    let { sectionCuts } = graphicsRef.getSnapshot().context;
    const sectionSubscription = graphicsRef.subscribe(({ context }) => {
      if (context.sectionCuts === sectionCuts) {
        return;
      }
      ({ sectionCuts } = context);
      lastSectionEmissionRef.current = Date.now();
      restartSettle(false);
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
      persistRef.current(true);
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
