/**
 * One view's record session (graphics event-driven state charter G6b): the view record's store and its watch, the
 * view's `viewRecordBinding`, and the host glue between the binding and the view's live owners. The project machine runs
 * one per view as a callback actor beside the view's graphics actor (`createViewGraphics`), so the session lives as
 * long as the view's owners do, not as long as a React mount.
 *
 * Everything here is a port or a forwarder (D4): the store and the binding hold every fact. The glue only turns what
 * an owner did into the binding's events:
 *
 * - a camera revision becomes `cameraChanged`, with the change's source, pose and field of view;
 * - the camera's adoption answers are forwarded;
 * - framing's entry and state become `framingChanged`;
 * - graphics' settings become `ownersChanged`, with the changed fields only;
 * - graphics' section quiet gate becomes `sectionEdited` and `sectionSettled`;
 * - the store's publications become `recordPublished`, with their origin and the patch an own write carried.
 *
 * The session publishes the record's issue itself (`publishRecordIssue`) and registers its flush with the project's
 * ports, which the host flushes on close.
 *
 * @module
 */
/* oxlint-disable typescript/no-restricted-types -- Refused record bytes may be absent (null), as the store reports them. */
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationLease, ObservationWatch } from '@taucad/fs-client/observation-service';
import type { WatchEvent } from '@taucad/filesystem';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { toPersistedSectionCut, toViewMeasurements } from '@taucad/workbench-panes/records/view-record';
import type { PersistedSectionView, PinnedMeasurement } from '@taucad/viewer/graphics/graphics-settings';
import type { GraphicsContext, graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { digestBytes } from '@taucad/ui-core/utils/crypto.utils';
import type { ActorOptions, ActorRefFrom, AnyActorLogic, Subscription } from 'xstate';
import { confirmFlush } from '#workbench-records/record-health.js';
import type { RecordHealth } from '#workbench-records/record-health.js';
import { publishRecordIssue, recordIssueState } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
import { createViewRecordBindingActor } from '#workbench-records/view-record-binding.js';
import type {
  ViewOwnerChange,
  ViewBindingCameraRef,
  ViewBindingFramingRef,
  ViewBindingGraphicsRef,
} from '#workbench-records/view-record-binding.machine.js';
import type { ViewOwners } from '#workbench-records/view-record-binding-changes.js';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';

/** Milliseconds a person's edit waits for a later one before the view record is written. */
export const viewRecordEditDebounce = 500;

/** The record files a view store reads and writes. */
export type ViewRecordFiles = Parameters<typeof createWorkbenchViewStore>[0]['files'];

/** Watch one record file. */
export type ViewRecordWatch = (absolutePath: string, listener: (event: WatchEvent) => void) => ObservationWatch;

/** What the project's host gives every view's session. */
export type ViewRecordHost = Readonly<{
  files: ViewRecordFiles;
  watch: ViewRecordWatch;
}>;

/**
 * The ports every view record session of one project shares. The host (`ProjectProvider`) makes them once and
 * replaces the file ports when the filesystem's connections are replaced; each session then reopens its store and its
 * watch on the new ones.
 */
export type ViewRecordPorts = Readonly<{
  projectId: string;
  /** The project's root directory, for example `/projects/<id>`. */
  root: string;
  /** The file ports now. */
  host: () => ViewRecordHost;
  /** Hear of a replaced host. */
  onHostReplaced: (listener: () => void) => () => void;
  /** The project's view of what each view's record holds (the provider's mirrors). */
  setViewRecord: (viewId: string, record: WorkbenchView | undefined) => void;
  setViewEntryPath: (viewId: string, path: string | null | undefined) => void;
  setAppliedWorkbenchRevision: (path: string, digest: `sha256:${string}` | undefined) => void;
  /** Register a session's flush; returns its removal. */
  addFlush: (flush: () => Promise<void>) => () => void;
}>;

/** The ports and the host's commands over them. */
export type ViewRecordPortsHandle = ViewRecordPorts &
  Readonly<{
    /** The filesystem's connections were replaced: sessions reopen their stores on `host`. */
    replaceHost: (host: ViewRecordHost) => void;
    /** Flush every session's record; rejects with what is not confirmed saved. */
    flush: () => Promise<void>;
  }>;

/**
 * The view record ports of one project.
 *
 * @param input - The project, its root, the first file ports and the provider's mirrors.
 * @returns The ports, with the host's commands.
 */
export function createViewRecordPorts(
  input: Readonly<{ projectId: string; root: string; host: ViewRecordHost }> &
    Pick<ViewRecordPorts, 'setViewRecord' | 'setViewEntryPath' | 'setAppliedWorkbenchRevision'>,
): ViewRecordPortsHandle {
  let { host } = input;
  const replaced = new Set<() => void>();
  const flushes = new Set<() => Promise<void>>();
  return {
    projectId: input.projectId,
    root: input.root,
    host: () => host,
    onHostReplaced: (listener) => {
      replaced.add(listener);
      return () => replaced.delete(listener);
    },
    setViewRecord: input.setViewRecord,
    setViewEntryPath: input.setViewEntryPath,
    setAppliedWorkbenchRevision: input.setAppliedWorkbenchRevision,
    addFlush: (flush) => {
      flushes.add(flush);
      return () => flushes.delete(flush);
    },
    replaceHost: (next) => {
      if (next.files === host.files && next.watch === host.watch) {
        return;
      }
      host = next;
      for (const listener of replaced) {
        listener();
      }
    },
    flush: async () => {
      const outcomes = await Promise.allSettled([...flushes].map(async (flush) => flush()));
      const reasons = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason as unknown] : []));
      if (reasons.length > 0) {
        throw new AggregateError(
          reasons,
          reasons.map((reason) => (reason instanceof Error ? reason.message : String(reason))).join(' '),
        );
      }
    },
  };
}

type GraphicsRef = ActorRefFrom<typeof graphicsMachine>;
type CameraRef = GraphicsContext['cameraRef'];
type FramingRef = GraphicsContext['framingRef'];

/** Graphics' context now. */
const selectGraphicsContext = (graphics: GraphicsRef): GraphicsContext => graphics.getSnapshot().context;

/** Whether graphics holds an edited section inside its quiet gate. */
const selectSectionEditing = (graphics: GraphicsRef): boolean =>
  graphics.getSnapshot().matches({ operational: { section: { on: 'editing' } } });

/** The camera's revision now. */
const selectCameraRevision = (camera: CameraRef): number => camera.getSnapshot().context.revision;

/** Framing's snapshot now. */
const selectFraming = (framing: FramingRef): ReturnType<FramingRef['getSnapshot']> => framing.getSnapshot();

/** The record watch's error, if it failed. */
const selectObservationError = (lease: ObservationLease<boolean>): string | undefined => lease.getSnapshot().error;

/** The pinned measurements graphics holds, as a view record keeps them. */
const pinnedMeasurementsOf = (context: GraphicsContext): WorkbenchView['measurements'] =>
  toViewMeasurements(
    context.measurements
      .filter((measurement) => measurement.isPinned)
      .map(
        (measurement): PinnedMeasurement => ({
          id: measurement.id,
          frameId: measurement.frameId,
          frameBasis: measurement.frameBasis,
          startPoint: measurement.startPoint,
          endPoint: measurement.endPoint,
          distance: measurement.distance,
          name: measurement.name,
          operation: measurement.operation,
          quality: measurement.quality,
          anchors: measurement.anchors,
          geometryKey: measurement.geometryKey,
          poseRevision: measurement.poseRevision,
          status: measurement.status,
          unavailableReason: measurement.unavailableReason,
          evidenceDetails: measurement.evidenceDetails,
        }),
      ),
  );

/** The section graphics holds, as a view record keeps it. */
export const sectionOf = (context: GraphicsContext): PersistedSectionView => ({
  active: context.isSectionViewActive,
  cuts: context.sectionCuts.map((cut) => toPersistedSectionCut(cut)),
});

/** The graphics-held owner values a view record keeps. */
export const graphicsOwnersOf = (context: GraphicsContext): Omit<ViewOwners, 'camera' | 'fieldOfView'> => ({
  display: {
    surfaces: context.enableSurfaces,
    lines: context.enableLines,
    gizmo: context.enableGizmo,
    grid: context.enableGrid,
    axes: context.enableAxes,
    matcap: context.enableMatcap,
    postProcessing: context.enablePostProcessing,
  },
  upDirection: context.upDirection,
  gridUnit: context.displayUnits.length.symbol,
  measurements: pinnedMeasurementsOf(context),
  section: sectionOf(context),
});

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/* The owner fields that changed since `previous`, the section excepted: it is reported when it settles. */
const changedOwners = (
  previous: Omit<ViewOwners, 'camera' | 'fieldOfView'>,
  next: Omit<ViewOwners, 'camera' | 'fieldOfView'>,
): ViewOwnerChange => ({
  ...(same(previous.display, next.display) ? {} : { display: next.display }),
  ...(previous.upDirection === next.upDirection ? {} : { upDirection: next.upDirection }),
  ...(previous.gridUnit === next.gridUnit ? {} : { gridUnit: next.gridUnit }),
  ...(same(previous.measurements, next.measurements) ? {} : { measurements: next.measurements }),
});

/** Input of {@link startViewRecordSession}. */
export type ViewRecordSessionInput = Readonly<{
  viewId: string;
  graphics: GraphicsRef;
  ports: ViewRecordPorts;
}> &
  Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;

type StoreSession = Readonly<{
  store: ReturnType<typeof createWorkbenchViewStore>;
  observation: ObservationService<boolean>;
  lease: ObservationLease<boolean>;
  dispose: () => void;
}>;

/**
 * The adoption framing holds as its pending pose before the first frame. Framing's snapshot types only the context
 * every state shares, so the awaiting state's `pendingPose` is read by shape.
 *
 * @param context - Framing's snapshot context.
 * @returns The pending pose's request id, or `undefined` when framing holds none.
 */
function heldRequestIdOf(context: object): string | undefined {
  const pending = 'pendingPose' in context ? context.pendingPose : undefined;
  if (typeof pending !== 'object' || pending === null || !('requestId' in pending)) {
    return undefined;
  }

  return typeof pending.requestId === 'string' ? pending.requestId : undefined;
}

/**
 * Start one view's record session.
 *
 * @param input - The view, its graphics actor, the project's ports, and the actor options tests inject.
 * @returns The session's stop: it flushes what is owed, then closes the store.
 */
export function startViewRecordSession(input: ViewRecordSessionInput): () => void {
  const { viewId, graphics, ports, clock, inspect, onRejectedEvent } = input;
  const recordPath = workbenchPaths.view(viewId);
  const absolutePath = `${ports.root}/${recordPath}`;
  const { cameraRef: camera, framingRef: framing } = selectGraphicsContext(graphics);
  const actorOptions = {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
  };

  let store: StoreSession | undefined;
  /* A publication or a reopened store makes any acknowledgement still digesting stale. */
  let generation = 0;
  let record: WorkbenchView | undefined;
  let notice:
    | Readonly<{ code: 'INVALID_RECORD' | 'NEWER_RECORD'; message: string; bytes: Uint8Array<ArrayBuffer> | null }>
    | undefined;
  let health: RecordHealth | undefined;
  let observedError: string | undefined;
  let issue: RecordIssue | undefined;
  /* The session stopped: a publication of the store's last flush reaches nobody. */
  let stopped = false;

  const binding = createViewRecordBindingActor({
    input: {
      graphics: graphics as unknown as ViewBindingGraphicsRef,
      camera: camera as unknown as ViewBindingCameraRef,
      framing: framing as unknown as ViewBindingFramingRef,
      owners: graphicsOwnersOf(selectGraphicsContext(graphics)),
    },
    // The store answers `false` after a fault or a close, and reports its own health.
    edit: async (next) => store?.store.edit(next) ?? false,
    ...actorOptions,
  });

  /* The record's issue, from the codec's refusal, the store's health and the watch. */
  const publishIssue = (): void => {
    const current = store;
    if (current === undefined) {
      return;
    }
    const sourceHealth: RecordHealth | undefined =
      observedError === undefined
        ? health
        : { ...(health ?? current.store.health()), read: 'unavailable', error: observedError };
    const state = recordIssueState(notice, sourceHealth);
    const entryPath = record?.entryPath ?? undefined;
    issue =
      state === undefined
        ? undefined
        : {
            kind: 'view',
            path: recordPath,
            entry: entryPath,
            state,
            message: notice?.message ?? sourceHealth?.error,
            bytes: notice?.bytes ?? null,
            writing: health?.writing ?? false,
            retryRead: async () => {
              if (observedError !== undefined) {
                current.observation.refresh();
                return false;
              }
              return current.store.retryRead();
            },
            retrySave: current.store.flush,
            reset: async (reviewed) =>
              current.store.reset(
                record ?? workbenchRecords.view.schema.parse({ version: 1, entryPath: entryPath ?? null }),
                reviewed,
              ),
          };
    publishRecordIssue(ports.projectId, recordPath, issue);
  };

  const openStore = (): StoreSession => {
    const { files, watch } = ports.host();
    /* A replaced store finishes its last flush over the old connections; what it reports then is no longer this view's. */
    let retired = false;
    const opened = createWorkbenchViewStore({
      root: ports.root,
      viewId,
      files,
      editDebounce: viewRecordEditDebounce,
      ...actorOptions,
      onHealth: (next) => {
        if (stopped || retired) {
          return;
        }
        health = next;
        publishIssue();
      },
      onChange: (state, source, patch) => {
        if (stopped || retired) {
          return;
        }
        generation++;
        ports.setAppliedWorkbenchRevision(recordPath, undefined);
        if (state.refusal) {
          notice = { ...state.refusal, bytes: state.bytes };
          publishIssue();
          return;
        }
        notice = undefined;
        if (state.record) {
          record = state.record;
          ports.setViewRecord(viewId, state.record);
          ports.setViewEntryPath(viewId, state.record.entryPath);
        }
        publishIssue();
        binding.send({
          type: 'recordPublished',
          record: state.record,
          origin: source === 'write' ? 'own' : 'foreign',
          patch: source === 'write' ? patch : undefined,
        });
      },
      onError: () => {
        if (stopped || retired) {
          return;
        }
        // The record's health carries the failure to the settings trigger.
        generation++;
        ports.setAppliedWorkbenchRevision(recordPath, undefined);
      },
    });
    const observation = new ObservationService<boolean>({
      resource: absolutePath,
      watch: (invalidate, reset) =>
        watch(absolutePath, (event) => {
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        }),
      invalidate: opened.invalidateRead,
      read: async () => opened.read(!opened.ready()),
    });
    const lease = observation.acquire();
    const unsubscribe = lease.subscribe(() => {
      const error = selectObservationError(lease);
      if (error !== observedError) {
        observedError = error;
        publishIssue();
      }
    });
    return {
      store: opened,
      observation,
      lease,
      dispose: () => {
        retired = true;
        unsubscribe();
        lease.release();
        // Whatever is owed is written before the store closes; the close fence answers it `false` once the view closed.
        const flushThenClose = async (): Promise<void> => {
          try {
            await opened.flush();
          } finally {
            opened.dispose();
          }
        };
        void flushThenClose();
      },
    };
  };

  const subscriptions: Array<Subscription | (() => void)> = [];
  binding.start();

  // Framing's entry and state: the pane names the entry, the binding follows it.
  let framingKey = '';
  const reportFraming = (snapshot: ReturnType<typeof framing.getSnapshot>): void => {
    const framed = snapshot.matches('framed');
    const { identity } = snapshot.context;
    const holding = framed ? undefined : heldRequestIdOf(snapshot.context);
    const key = JSON.stringify([identity, framed, holding]);
    if (key === framingKey) {
      return;
    }
    framingKey = key;
    binding.send({ type: 'framingChanged', identity, framed, holding });
  };
  reportFraming(selectFraming(framing));
  subscriptions.push(framing.subscribe(reportFraming));

  // Camera revisions: one `cameraChanged` per change, with what produced it.
  let revision = selectCameraRevision(camera);
  subscriptions.push(
    camera.subscribe(({ context }) => {
      if (context.revision === revision) {
        return;
      }
      ({ revision } = context);
      const { frameId, target, direction, up, verticalSpan, perspectiveZoom, requestedVerticalFieldOfView } =
        context.view;
      binding.send({
        type: 'cameraChanged',
        change: context.lastChange,
        pose: { frameId, target, direction, up, verticalSpan, perspectiveZoom },
        verticalFieldOfView: requestedVerticalFieldOfView,
      });
    }),
    camera.on('adoptionApplied', (event) => {
      binding.send(event);
    }),
    camera.on('adoptionDropped', (event) => {
      binding.send(event);
    }),
  );

  // Graphics' settings and its section quiet gate.
  let owners = graphicsOwnersOf(selectGraphicsContext(graphics));
  subscriptions.push(
    graphics.subscribe(({ context }) => {
      const next = graphicsOwnersOf(context);
      const changed = changedOwners(owners, next);
      owners = next;
      if (Object.keys(changed).length > 0) {
        binding.send({ type: 'ownersChanged', owners: changed });
      }
    }),
    graphics.on('sectionEdited', () => {
      binding.send({ type: 'sectionEdited' });
    }),
    graphics.on('sectionSettled', () => {
      binding.send({ type: 'sectionSettled', section: sectionOf(selectGraphicsContext(graphics)) });
    }),
  );

  // The applied-revision acknowledgement: the digest of the bytes every owner adopted (correlated by generation).
  subscriptions.push(
    binding.on('recordApplied', ({ record: applied }) => {
      const current = store?.store;
      const state = current?.snapshot();
      if (current === undefined || state === undefined || state.record !== applied || !state.bytes || state.refusal) {
        return;
      }
      const expected = generation;
      const { bytes } = state;
      const acknowledgeAppliedBytes = async (): Promise<void> => {
        const digest = await digestBytes(bytes);
        const now = current.snapshot();
        if (expected === generation && now.record === applied && now.bytes === bytes && !now.refusal) {
          ports.setAppliedWorkbenchRevision(recordPath, digest);
        }
      };
      void acknowledgeAppliedBytes();
    }),
  );

  store = openStore();
  subscriptions.push(
    ports.onHostReplaced(() => {
      store?.dispose();
      generation++;
      ports.setAppliedWorkbenchRevision(recordPath, undefined);
      store = openStore();
    }),
  );

  /* A section still inside graphics' quiet gate is the person's latest: a close or a stop saves it as settled. */
  const settleEditedSection = (): boolean => {
    if (!selectSectionEditing(graphics)) {
      return false;
    }
    binding.send({ type: 'sectionSettled', section: sectionOf(selectGraphicsContext(graphics)) });
    return true;
  };

  const flushAtClose = async (): Promise<void> => {
    const current = store?.store;
    if (current === undefined) {
      return;
    }
    /* The flush saves the cuts being edited, and the gate stays shut while graphics still edits them: a session flush
     * is not always a close, and a foreign section must not land mid-drag. */
    if (settleEditedSection()) {
      binding.send({ type: 'sectionEdited' });
    }
    await confirmFlush(current.flush, `View settings for ${record?.entryPath ?? viewId} are not confirmed saved.`);
  };
  subscriptions.push(ports.addFlush(flushAtClose));

  return () => {
    settleEditedSection();
    stopped = true;
    for (const subscription of subscriptions) {
      if (typeof subscription === 'function') {
        subscription();
      } else {
        subscription.unsubscribe();
      }
    }
    binding.stop();
    store?.dispose();
    store = undefined;
    generation++;
    publishRecordIssue(ports.projectId, recordPath, undefined);
    ports.setAppliedWorkbenchRevision(recordPath, undefined);
  };
}
