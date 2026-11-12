import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type {
  CameraOwnedSettings,
  GraphicsViewSettings,
  PersistedCameraView,
  PersistedSectionView,
  PinnedMeasurement,
} from '@taucad/viewer/graphics/graphics-settings';
import { areSectionCutsEqual } from '@taucad/viewer/graphics/section-cuts';
import { selectGraphicsFramed, selectGraphicsFramingIdentity } from '@taucad/viewer/machines/graphics.machine';
import type { GraphicsPendingPose, graphicsMachine } from '@taucad/viewer/machines/graphics.machine';

import type { cadMachine } from '#machines/cad.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { useGraphicsCamera } from '@taucad/viewer/hooks/use-graphics';
import { lengthUnits, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import {
  toPersistedSectionCut,
  toViewMeasurements,
  viewCameraOrientation,
} from '@taucad/workbench-panes/records/view-record';
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
/** Whether the view's entry has had its first geometry framed. */
const selectFramed = (graphicsRef: ActorRefFrom<typeof graphicsMachine>): boolean =>
  selectGraphicsFramed(graphicsRef.getSnapshot());

/** The entry the view's framing frames. */
const selectFramingIdentity = (graphicsRef: ActorRefFrom<typeof graphicsMachine>): string | undefined =>
  selectGraphicsFramingIdentity(graphicsRef.getSnapshot());

/** Whether `entryPath` waits for its first frame: framing frames another entry, or none yet. */
const isAwaitingFirstFrame = (graphicsRef: ActorRefFrom<typeof graphicsMachine>, entryPath: string): boolean =>
  !selectFramed(graphicsRef) || selectFramingIdentity(graphicsRef) !== entryPath;

/** The camera's last change: which source made the pose it holds now. */
const selectLastCameraChange = (
  camera: NonNullable<ReturnType<typeof useGraphicsCamera>>,
): ReturnType<NonNullable<ReturnType<typeof useGraphicsCamera>>['getSnapshot']>['context']['lastChange'] =>
  camera.getSnapshot().context.lastChange;

/** The camera's pose now. */
const selectCameraView = (
  camera: NonNullable<ReturnType<typeof useGraphicsCamera>>,
): ReturnType<NonNullable<ReturnType<typeof useGraphicsCamera>>['getSnapshot']>['context']['view'] =>
  camera.getSnapshot().context.view;

/* The changes a first frame makes: the frame itself and the record's pose applied over it. */
const firstFrameSources: ReadonlySet<string> = new Set(['framing', 'persisted', 'bounds', 'viewport']);

/** A record's camera, as the pose framing applies after the entry's first frame. */
const pendingPoseOf = (record: WorkbenchView, requestId: string): GraphicsPendingPose | undefined => {
  if (record.camera.kind === 'pose') {
    return { requestId, pose: record.camera };
  }
  const orientation = viewCameraOrientation(record);
  return orientation === undefined ? undefined : { requestId, orientation };
};

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
  const appliedSessionRef = useRef<ReturnType<typeof useGraphicsCamera>>(undefined);
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
  /* The camera's owner is the graphics actor, not this hook's host. It exists before any canvas mounts, so a pose is
   * persisted only once the view's framing has framed the entry (`framed`), never from the seeded default. The framing
   * state is read when it is needed, not rendered from. */
  const camera = useGraphicsCamera(graphicsRef);
  const session = useMemo(() => (camera ? { rig: { actorRef: camera } } : undefined), [camera]);
  /* The framed entry the first-frame receipt below was taken for; a new entry's first frame takes a new one. */
  const firstFrameEntryRef = useRef<{ identity: string | undefined } | undefined>(undefined);
  /* The framed entry a person last changed the pose of: a pose read after that is the person's, not the first frame. */
  const personChangedEntryRef = useRef<{ identity: string | undefined } | undefined>(undefined);
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
    const previous = appliedSessionRef.current === camera ? appliedRecordRef.current : undefined;
    appliedSessionRef.current = camera;
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
      /* Before the entry's first frame, framing applies the record's camera over that frame. An entry framing has not
       * been told of yet (the provider has not rendered the switch) waits for its first frame too. */
      if (session && entryPath !== undefined && isAwaitingFirstFrame(graphicsRef, entryPath)) {
        const pendingPose = pendingPoseOf(cameraRecord, `record:${viewId}`);
        graphicsRef.send({ type: 'entryChanged', identity: entryPath, ...(pendingPose ? { pendingPose } : {}) });
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
      const adoption =
        entryPath !== undefined && isAwaitingFirstFrame(graphicsRef, entryPath)
          ? pendingPoseOf(latest, `record:${viewId}`)
          : undefined;
      if (adoption) {
        /* Shown before the first frame without starting the camera's settle window, which would drop the adoption
         * that frame sends: the same fields, applied in one automatic change. */
        actor.send({ type: 'adoptPersistedPose', ...adoption, ...(adoption.orientation ? { margin: 0.1 } : {}) });
        adoptedPoseRef.current = latest.camera.kind === 'pose' ? latest.camera : selectCameraView(actor);
      } else if (latest.camera.kind === 'pose') {
        actor.send({ type: 'poseObserved', source: 'input', ...latest.camera });
        adoptedPoseRef.current = latest.camera;
      } else {
        const orientation = viewCameraOrientation(latest)!;
        actor.send({
          type: 'poseObserved',
          source: 'input',
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
  }, [entryPath, graphicsRef, onRecordApplied, record, recordLocalPatch, session, viewId]);

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
        if (!selectFramed(graphicsRef)) {
          firstFrameEntryRef.current = undefined;
          firstFrameReceiptRef.current = undefined;
          personChangedEntryRef.current = undefined;
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
        /* The first read after the entry is framed: a pose the first frame made (no person change since) is the
         * automatic first frame, not a person's pose, until a pose that differs from it consumes the receipt. */
        const framedEntry = selectFramingIdentity(graphicsRef);
        if (!firstFrameEntryRef.current || firstFrameEntryRef.current.identity !== framedEntry) {
          firstFrameEntryRef.current = { identity: framedEntry };
          const personChanged = personChangedEntryRef.current?.identity === framedEntry;
          firstFrameReceiptRef.current =
            !personChanged && firstFrameSources.has(selectLastCameraChange(session.rig.actorRef).source)
              ? { view: next, consumed: false }
              : undefined;
        }
        const firstFrameView = firstFrameReceiptRef.current?.view;
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
        measurements: toViewMeasurements(pinnedMeasurements),
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
    /* The camera actor also emits when its input state changes (dragging, settling, idle); only a new revision is
     * a view change. */
    let cameraRevision = session?.rig.actorRef.getSnapshot().context.revision;
    const cameraSubscription = session?.rig.actorRef.subscribe(({ context }) => {
      if (context.revision === cameraRevision) {
        return;
      }
      cameraRevision = context.revision;
      if (!selectFramed(graphicsRef)) {
        personChangedEntryRef.current = undefined;
      } else if (!firstFrameSources.has(context.lastChange.source)) {
        personChangedEntryRef.current = { identity: selectFramingIdentity(graphicsRef) };
      }
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
