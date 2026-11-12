/**
 * `viewRecordBinding`: one per view, beside the view's `recordSync`. It carries a foreign view record to the live
 * owners and the owners' changes back to the record (graphics event-driven state charter G6; D2, D6, D7, D15, D20;
 * invariants I5, I6, I7, I8, I12). It replaces `useViewSettingsSync`; `view-record-session.ts` wires it (G6b).
 *
 * ```text
 * viewRecordBinding (parallel)
 * ├── camera   awaitingFrame ──cameraChanged{framing | fit}──▶ framed
 * │            awaitingFrame: a foreign pose goes to framing as its pending pose (G5)
 * │            framed:        a foreign pose goes to the camera as adoptPersistedPose
 * │            framed ──framingChanged{framed: false} or a new identity──▶ awaitingFrame
 * ├── section  settled ──sectionEdited──▶ editing ──sectionSettled──▶ settled
 * │            editing: a foreign section waits, and is adopted on sectionSettled (the section quiet gate)
 * └── context  record, owners, pose{view, by}, fieldOfView, revision, lastWrittenRevision, adoptions, sectionPending,
 *              dropped, applying, requests, fault, framing{identity, framed, holding}, parked
 * ```
 *
 * - **Origin is the attribution (D2, I6).** A publication labelled `own` is never adopted; it only becomes the base of
 *   the next edit. A `foreign` one goes through {@link foreignChanges}. No timing window or byte comparison is used:
 *   `recordSync` attributes the bytes (I5, I12).
 * - **The camera rule (D20, I7).** The camera field is written only for a change whose source is `input`, `gizmo`,
 *   `fov`, `up`, `fit` or `focus` and whose revision is newer than the last one written. Automatic framing,
 *   `persisted`, `viewport` and `bounds` are never written, so an automatic refit after a model edit is no longer saved
 *   (D14's named change).
 * - **Capture with the change, re-save on drop (D15, CameraAuthority README).** The binding holds the camera's pose and
 *   the source of the last change that produced it (`pose.by`; `viewport` and `bounds` keep the pose). When the camera
 *   answers an adoption with `adoptionDropped`, the binding writes that pose again if a person made it, so the
 *   person's drag wins over the foreign pose it dropped. A machine-made pose is never re-saved.
 * - **One handling per publication.** A foreign record is compared with the last record handled, so a re-published
 *   record asks for nothing again, and a dropped pose is not requested twice.
 * - **No time here (D3, I8).** The camera applies an adoption only in `input.idle` and drops it otherwise; the section
 *   quiet gate is graphics' (`sectionEdited` and `sectionSettled`). Edits are coalesced by `recordSync`'s debounce.
 * - **The ten inheritable leaves (graphics charter ruling of 2026-11-12, amending D20, I6 and I7 for them).** Up
 *   direction, field of view, the seven display flags and the grid unit are command-written and resolver-seeded: each
 *   record (of any origin) and each `levelsChanged` seeds the owners from `resolveViewSettings` output, and no edit
 *   writes them from the owners.
 * - Foreign field of view and up direction go through `adoptPersistedPose` with the pose, never through the camera's
 *   `setVerticalFieldOfView` or `setUpDirection`, whose person sources would be written back. Graphics' own up
 *   direction setting is adopted through `adoptUpDirection`, which sends the camera nothing (graphics' `setUpDirection`
 *   turns the camera as a person's `up` change, which this binding would save; G6b's session rows prove it is not).
 * - **Framing names the entry; the binding follows it (G6b).** The view's pane names its entry to framing when it
 *   renders; the binding never does. It hears framing's identity (`framingChanged`) and gives a record's pose or
 *   orientation only to the entry the record is for: to framing as that entry's pending pose before its first frame,
 *   or to the camera once it is framed. A record for an entry framing does not name is parked until framing names it,
 *   so a record never turns the camera of another entry (CodeRabbit, taucad/tau#1857), and no poll or retry window is
 *   involved. When framing names the record's entry again, the record's camera rides that entry's first frame. A pending
 *   pose framing no longer holds at its first frame is given to the camera instead.
 *
 * The owners arrive in `input` as refs (MC-R3, MC-R13). The one effect, editing the record, is a custom action the
 * composition root (`view-record-binding.ts`) provides over `recordSync`'s command surface (MC-R8), so G1's answers hold: after a fault or a close
 * the store answers the edit `false`. Every fact in context is derived from the published record and the owners'
 * events, and none is persisted (MC-R5): a new binding rebuilds it from the next publication.
 *
 * @module
 */
import { matchesState, setup, types } from 'xstate';
import type { ActorRef, EnqueueObject, Snapshot, SnapshotFrom, StateValue } from 'xstate';
import type {
  CameraChange,
  CameraMachineEmitted,
  CameraMachineEvent,
  CameraOrientation,
  CameraPose,
  CameraSource,
} from '@taucad/camera/machine';
import type { PersistedCameraView, PersistedSectionView } from '@taucad/viewer/graphics/graphics-settings';
import type { WorkbenchView } from '@taucad/workbench';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import {
  cameraAdoptionOf,
  foreignChanges,
  nextRecord,
  ownsCamera,
} from '#workbench-records/view-record-binding-changes.js';
import type {
  ViewCameraAdoption,
  ViewGraphicsAdoption,
  ViewOwners,
  ViewResolutionLevels,
} from '#workbench-records/view-record-binding-changes.js';
import type { ViewRecordPatch } from '#workbench-records/view-record-policy.js';

/** The graphics actor the binding adopts into: any actor that takes the graphics adoption events. */
export type ViewBindingGraphicsRef = ActorRef<Snapshot<unknown>, ViewGraphicsAdoption>;

/** The view's camera: any actor that takes the camera's public events. */
export type ViewBindingCameraRef = ActorRef<Snapshot<unknown>, CameraMachineEvent, CameraMachineEmitted>;

/**
 * The record's camera instruction framing applies after the entry's first frame (G5's `FramingPendingPose`).
 * `requestId` correlates the camera's answer.
 */
export type ViewBindingPendingPose =
  | Readonly<{ requestId: string; pose: CameraPose; orientation?: undefined }>
  | Readonly<{ requestId: string; orientation: CameraOrientation; pose?: undefined }>;

/** The event the binding sends the view's framing actor (G5's `entryChanged`). */
export type ViewBindingFramingEvent = Readonly<{
  type: 'entryChanged';
  identity: string;
  pendingPose?: ViewBindingPendingPose;
}>;

/** The view's framing actor: any actor that takes `entryChanged`. */
export type ViewBindingFramingRef = ActorRef<Snapshot<unknown>, ViewBindingFramingEvent>;

/** Input of {@link viewRecordBindingMachine}. */
export type ViewRecordBindingInput = Readonly<{
  graphics: ViewBindingGraphicsRef;
  camera: ViewBindingCameraRef;
  framing: ViewBindingFramingRef;
  /** The owners' values when the binding starts. */
  owners: Omit<ViewOwners, 'camera'>;
  /** The levels the record resolves over when the binding starts: the person's defaults and the view's exceptions. */
  levels?: ViewResolutionLevels;
}>;

/** The owner fields graphics holds; a change carries the fields that changed. */
export type ViewOwnerChange = Partial<Pick<ViewOwners, 'measurements'>>;

/** The public event alphabet of {@link viewRecordBindingMachine}. */
export type ViewRecordBindingEvent =
  /** `recordSync`'s `published`: the record (absent when the file is gone or refused) with its attribution. */
  | Readonly<{
      type: 'recordPublished';
      record: WorkbenchView | undefined;
      origin: 'own' | 'foreign';
      patch: ViewRecordPatch | undefined;
    }>
  /** A person changed graphics settings this record holds. */
  | Readonly<{ type: 'ownersChanged'; owners: ViewOwnerChange }>
  /** The person's defaults or this view's exceptions changed: the owners are seeded from the new resolution. */
  | Readonly<{ type: 'levelsChanged'; levels: ViewResolutionLevels }>
  /** The person is editing section cuts: graphics' section region left `settled`. */
  | Readonly<{ type: 'sectionEdited' }>
  /** The section settled; `section` is what the person left. */
  | Readonly<{ type: 'sectionSettled'; section: PersistedSectionView }>
  /** A camera change: its revision and source (`lastChange`), with the pose and field of view it left. */
  | Readonly<{ type: 'cameraChanged'; change: CameraChange; pose: PersistedCameraView; verticalFieldOfView: number }>
  /** The camera's answers to `adoptPersistedPose`. */
  | Extract<CameraMachineEmitted, { type: 'adoptionApplied' | 'adoptionDropped' }>
  /**
   * Framing's state: the entry it names, whether it has framed it, and, while it waits, the request id of the pending
   * pose it holds.
   */
  | Readonly<{ type: 'framingChanged'; identity: string | undefined; framed: boolean; holding: string | undefined }>;

/** Events the binding emits. */
export type ViewRecordBindingEmitted =
  /** Every owner has adopted `record`: the combined camera and section adoption acknowledges once. */
  Readonly<{ type: 'recordApplied'; record: WorkbenchView }>;

/** The `CameraAuthority.tla` action a transition refines (MC-R27); `Unmodelled` is outside the spec. */
export type ViewRecordBindingAction = 'Observe' | 'Changed' | 'Unmodelled';

/** The arguments of the binding's one effect. */
export type ViewRecordBindingEffectArgs = Readonly<{ editRecord: Readonly<{ next: WorkbenchView }> }>;

/** A record's pose or orientation, as the camera adopts it. */
type CameraTurn = Readonly<
  { pose: CameraPose; orientation?: undefined } | { orientation: CameraOrientation; pose?: undefined }
>;

/** A camera adoption waiting for its answer. */
type Adoption = Readonly<{
  requestId: string;
  /** It carries a pose or orientation. */
  turns: boolean;
  /** Framing holds it as the entry's pending pose; `turn` is what it carries, given to the camera if framing drops it. */
  framing?: CameraTurn;
}>;

/** What the binding last heard of framing. */
type FramingState = Readonly<{ identity: string | undefined; framed: boolean; holding: string | undefined }>;

/** State owned by one binding. */
type BindingContext = Readonly<{
  graphics: ViewBindingGraphicsRef;
  camera: ViewBindingCameraRef;
  framing: ViewBindingFramingRef;
  /** Framing's entry and state (`framingChanged`). */
  framingState: FramingState;
  /**
   * A record's pose or orientation for an entry framing does not name: given to that entry once framing names it. A
   * newer turn, or this view's own camera write, replaces it.
   */
  parked: Readonly<{ entryPath: string; turn: CameraTurn }> | undefined;
  /** The latest published record: the base of the next edit and what the next foreign record is compared with. */
  record: WorkbenchView | undefined;
  owners: ViewOwners;
  /** The levels the record resolves over. */
  levels: ViewResolutionLevels;
  /** The camera's pose and the source of the change that produced it (CameraAuthority's `poseBy`). */
  pose: Readonly<{ view: PersistedCameraView; by: CameraSource }> | undefined;
  /** The camera's requested vertical field of view. */
  fieldOfView: number | undefined;
  /** The latest camera revision observed. */
  revision: number;
  /** The newest camera revision written to the record. */
  lastWrittenRevision: number;
  /** Camera adoptions waiting for the camera's answer; `turns` when it carries a pose or orientation. */
  adoptions: readonly Adoption[];
  /**
   * A foreign section waiting while the person edits cuts. Set only in `section.editing`; a root key because the root
   * `recordPublished` handler writes it from either section state (MC-R26 debt, accepted as for R5 and G1).
   */
  sectionPending: PersistedSectionView | undefined;
  /**
   * The record whose camera adoption the camera dropped, and whether any unresolved drop carried a pose (`turns`). Until
   * this view's write of what was dropped is published (the camera, or for a field-only drop its field of view), or a
   * foreign record asks for a new pose, no record is acknowledged.
   */
  dropped: Readonly<{ record: WorkbenchView; turns: boolean }> | undefined;
  /** The publication the acknowledgement waits for. */
  applying: WorkbenchView | undefined;
  /** Request ids issued, for the next one. */
  requests: number;
  /** An effect failure no transition modelled (MC-R12). */
  fault: string | undefined;
}>;

type BindingEnqueue = EnqueueObject<ViewRecordBindingEvent, ViewRecordBindingEmitted>;

/** Sources of a person's command (D20). */
const personSources: ReadonlySet<CameraSource> = new Set(['input', 'gizmo', 'fov', 'up', 'fit', 'focus']);

/** Changes that keep the pose (CameraAuthority `Changed`): the camera's pose is still the one before them. */
const poseKeepingSources: ReadonlySet<CameraSource> = new Set(['viewport', 'bounds']);

/**
 * Changes that show the entry is framed: the first frame, or Fit view, which framing takes only once it has framed. A
 * person's move before the first frame does not: framing still holds its pending pose until geometry arrives.
 */
const framingSources: ReadonlySet<CameraSource> = new Set(['framing', 'fit']);

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

type Vector = readonly [number, number, number];
const finiteVector = (vector: Vector): boolean => vector.every((axis) => Number.isFinite(axis));
const length = (vector: Vector): number => Math.hypot(...vector);
const crossLength = (left: Vector, right: Vector): number =>
  Math.hypot(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );

/* The checks the camera's guard refuses an adoption on (G3): no zero, non-finite or parallel direction and up. */
const adoptable = (
  camera: CameraOrientation & Partial<Pick<CameraPose, 'target' | 'verticalSpan' | 'perspectiveZoom'>>,
): boolean => {
  const { direction, up, target, verticalSpan, perspectiveZoom } = camera;
  const positive = (value: number | undefined): boolean => value === undefined || (Number.isFinite(value) && value > 0);
  return (
    finiteVector(direction) &&
    finiteVector(up) &&
    (target === undefined || finiteVector(target)) &&
    positive(verticalSpan) &&
    positive(perspectiveZoom) &&
    crossLength(direction, up) > 1e-9 * length(direction) * length(up)
  );
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isFramed = (value: StateValue): boolean => matchesState({ camera: 'framed' }, value);

/* Whether the camera shows the record's entry: framing names it, or the record names none. */
const showsRecordEntry = (context: BindingContext): boolean =>
  context.record?.entryPath === undefined ||
  context.record.entryPath === null ||
  context.record.entryPath === context.framingState.identity;

const isEditingSection = (value: StateValue): boolean => matchesState({ section: 'editing' }, value);

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes; drop the cast when xstate types it.
 */
const refines = <F>(tla: ViewRecordBindingAction, to: F): F =>
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

const notProvided = (name: keyof ViewRecordBindingEffectArgs): never => {
  throw new Error(`viewRecordBinding: the ${name} effect was not provided; createViewRecordBindingActor provides it.`);
};

/* The acknowledgement waits for every camera adoption and the section; it is emitted once, then cleared. */
const acknowledged = (context: BindingContext, enq: BindingEnqueue): BindingContext => {
  if (
    context.applying === undefined ||
    context.adoptions.length > 0 ||
    context.sectionPending !== undefined ||
    context.parked !== undefined
  ) {
    return context;
  }
  enq.emit({ type: 'recordApplied', record: context.applying });
  return { ...context, applying: undefined };
};

type EditRecord = (args: ViewRecordBindingEffectArgs['editRecord']) => void;

/* An edit is the record the owners make over the latest published record. With no record there is no file to edit:
 * opening the pane creates it, so the owners' values wait for the first publication (as the hook did). */
const edited = (
  {
    context,
    editRecord,
    owners,
    revision = context.lastWrittenRevision,
  }: Readonly<{ context: BindingContext; editRecord: EditRecord; owners: ViewOwners; revision?: number }>,
  enq: BindingEnqueue,
): BindingContext => {
  if (context.record !== undefined) {
    enq(editRecord, { next: nextRecord(owners, context.record) });
  }
  return { ...context, owners, lastWrittenRevision: revision };
};

/* What every handler below is given: the context, its event and the edit effect. */
type Handled<Event> = Readonly<{ context: BindingContext; event: Event; editRecord: EditRecord }>;

type CameraChanged = Extract<ViewRecordBindingEvent, { type: 'cameraChanged' }>;

/* The camera rule (D20, I7), with the pose captured with the change that produced it. */
const observeCamera = (
  { context, event, editRecord, framed: wasFramed }: Handled<CameraChanged> & Readonly<{ framed: boolean }>,
  enq: BindingEnqueue,
): Readonly<{ framed: boolean; context: BindingContext }> | undefined => {
  const { source, revision } = event.change;
  if (revision <= context.revision) {
    // A re-delivered or older snapshot of a change already captured.
    return undefined;
  }
  // Capture with the change (CameraAuthority README): `viewport` and `bounds` keep the pose and its maker.
  const pose =
    poseKeepingSources.has(source) && context.pose !== undefined ? context.pose : { view: event.pose, by: source };
  const observed: BindingContext = { ...context, pose, fieldOfView: event.verticalFieldOfView, revision };
  const framed = framingSources.has(source);
  if (!personSources.has(source) || revision <= context.lastWrittenRevision) {
    // Automatic framing, `persisted`, `viewport` and `bounds` are never written (D20, I7).
    return { framed, context: observed };
  }
  // A person's Fit view is the entry's first frame itself, so it is written as any framed person change is. A pose of
  // an entry the record is not for is never written into it (the record arrived before framing named its entry).
  if ((!wasFramed && source !== 'fit') || !showsRecordEntry(context)) {
    // Before the entry's first frame no pose is written (as the hook did): framing still holds the record's pose and
    // applies it after that frame, so a move of the empty canvas would put a pose on file the view then leaves. The
    // field of view is an inheritable leaf, written by view commands only, so nothing is written here.
    return { framed, context: observed };
  }
  const owners: ViewOwners = { ...context.owners, camera: event.pose };
  return { framed, context: edited({ context: observed, editRecord, owners, revision }, enq) };
};

type Published = Extract<ViewRecordBindingEvent, { type: 'recordPublished' }>;

/* I6: this view's own write is never adopted; it becomes the base of the next edit. */
const observeOwn = (
  {
    context,
    record,
    patch,
  }: Readonly<{ context: BindingContext; record: WorkbenchView; patch: ViewRecordPatch | undefined }>,
  enq: BindingEnqueue,
): BindingContext => {
  // I6: this view's own write is never adopted. A different section it carried supersedes a foreign one still
  // waiting; one that carries the waiting section is an edit made while it waited, so graphics still adopts it.
  const supersedes =
    patch?.section !== undefined &&
    context.sectionPending !== undefined &&
    !same(record.section, context.sectionPending);
  // After a drop, only a write that carries the camera puts the view's camera back on file (CameraAuthority README: the
  // file keeps the foreign pose until this view's next write of it), so any other own write is not acknowledged.
  const resolved = ownsCamera(record, patch);
  const stillDropped = context.dropped !== undefined && !resolved;
  return acknowledged(
    {
      ...context,
      record,
      applying: stillDropped ? undefined : record,
      dropped: stillDropped ? context.dropped : undefined,
      // This view's own camera write supersedes a turn still parked for its entry.
      parked: ownsCamera(record, patch) ? undefined : context.parked,
      ...(supersedes ? { sectionPending: undefined, owners: { ...context.owners, section: record.section } } : {}),
    },
    enq,
  );
};

/* A publication handled once (CameraAuthority `Observe`): own is never adopted (I6), foreign goes to the owners. */
const observeRecord = (
  { context, event, value }: Readonly<{ context: BindingContext; event: Published; value: StateValue }>,
  enq: BindingEnqueue,
): BindingContext => {
  const { record } = event;
  if (record === undefined) {
    // The file is gone or refused: nothing to adopt. The last record stays the base, so a person's later edit recreates a
    // file another window deleted (as the hook did), and the next record is compared with it, not adopted whole.
    // A section still waiting belonged to that record, so the person's settled cuts are written again instead.
    return { ...context, applying: undefined, sectionPending: undefined };
  }
  if (event.origin === 'own') {
    return observeOwn({ context, record, patch: event.patch }, enq);
  }
  const changes = foreignChanges(context.record, record, { levels: context.levels });
  let { owners } = context;
  for (const adoption of changes.graphics) {
    enq.sendTo(context.graphics, adoption);
    owners = adoptedOwner(owners, adoption);
  }
  let { sectionPending } = context;
  if (changes.section !== undefined) {
    if (isEditingSection(value)) {
      // The section quiet gate: the person is editing cuts, so graphics adopts the foreign section on `sectionSettled`.
      // The record already holds it, so an edit meanwhile carries it too and never writes the old section back.
      sectionPending = changes.section;
      owners = { ...owners, section: changes.section };
    } else {
      enq.sendTo(context.graphics, { type: 'adoptSectionView', section: changes.section });
      owners = { ...owners, section: changes.section };
      sectionPending = undefined;
    }
  }
  // After a dropped adoption, a record that asks for no new pose or orientation (a forced re-read, or an edit of other
  // fields, field of view and up direction included) still holds the camera the view does not show, so it is not
  // acknowledged either.
  const stillDropped =
    context.dropped !== undefined && changes.camera?.pose === undefined && changes.camera?.orientation === undefined;
  const handled: BindingContext = {
    ...context,
    record,
    owners,
    sectionPending,
    applying: stillDropped ? undefined : record,
    dropped: stillDropped ? context.dropped : undefined,
  };
  return acknowledged(
    changes.camera === undefined
      ? handled
      : requestCamera(
          { context: handled, camera: changes.camera, entryPath: record.entryPath ?? undefined, value },
          enq,
        ),
    enq,
  );
};

/* The owner value a graphics adoption leaves; only the fields a foreign record changed are replaced. */
const adoptedOwner = (owners: ViewOwners, adoption: ViewGraphicsAdoption): ViewOwners => {
  switch (adoption.type) {
    case 'adoptPinnedMeasurements': {
      return { ...owners, measurements: [...adoption.measurements] as WorkbenchView['measurements'] };
    }
    case 'adoptSectionView': {
      return { ...owners, section: adoption.section };
    }
    default: {
      // Display, grid unit and up direction are seeded from the resolution and never written back.
      return owners;
    }
  }
};

/* The record's camera fields go to the camera, or to framing before the entry's first frame (G5). A pose or
 * orientation for an entry framing does not name is parked until it does. */
const requestCamera = (
  {
    context,
    camera,
    entryPath,
    value,
  }: Readonly<{
    context: BindingContext;
    camera: ViewCameraAdoption;
    entryPath: string | undefined;
    value: StateValue;
  }>,
  enq: BindingEnqueue,
): BindingContext => {
  const { verticalFieldOfView, upDirection } = camera;
  // A pose the camera would refuse gets no answer (G3), so it is not asked for: the acknowledgement would never come.
  const pose = camera.pose !== undefined && adoptable(camera.pose) ? camera.pose : undefined;
  const orientation =
    camera.orientation !== undefined && adoptable(camera.orientation) ? camera.orientation : undefined;
  // A record that names no entry has no model to turn the camera over.
  const turn: CameraTurn | undefined =
    entryPath === undefined ? undefined : pose === undefined ? orientation && { orientation } : { pose };
  const parks = turn !== undefined && entryPath !== context.framingState.identity;
  let { requests } = context;
  const nextRequest = (): string => {
    requests += 1;
    return `view-binding-${requests}`;
  };
  const fields = {
    ...(verticalFieldOfView === undefined ? {} : { verticalFieldOfView }),
    ...(upDirection === undefined ? {} : { upDirection }),
  };
  const issued: Adoption[] = [];
  const turns = turn !== undefined && !parks;
  if (turns && !isFramed(value)) {
    // Framing holds the record's camera and applies it after the first frame; the other fields go to the camera now.
    const requestId = nextRequest();
    issued.push({ requestId, turns: true, framing: turn });
    enq.sendTo(context.framing, {
      type: 'entryChanged',
      identity: entryPath!,
      pendingPose: { requestId, ...turn },
    });
    if (Object.keys(fields).length > 0) {
      const fieldsRequest = nextRequest();
      issued.push({ requestId: fieldsRequest, turns: false });
      enq.sendTo(context.camera, { type: 'adoptPersistedPose', requestId: fieldsRequest, ...fields });
    }
  } else if (turns || Object.keys(fields).length > 0) {
    const requestId = nextRequest();
    issued.push({ requestId, turns });
    enq.sendTo(context.camera, {
      type: 'adoptPersistedPose',
      requestId,
      ...(turns ? turn : {}),
      ...fields,
    });
  }
  return {
    ...context,
    requests,
    // A newer adoption supersedes the earlier ones it covers, whose answers are then stale (MC-R18): a pose or
    // orientation supersedes every earlier request, a field-only request only earlier field-only ones.
    adoptions: [...context.adoptions.filter((earlier) => !(turns || parks) && earlier.turns), ...issued],
    // A newer turn replaces a parked one; a parked turn waits for framing to name its entry.
    parked: parks ? { entryPath: entryPath!, turn } : turn === undefined ? context.parked : undefined,
    // The record's camera now stands for what it changed; a drop writes the person's pose back.
    owners: { ...context.owners, ...(turn === undefined ? {} : { camera: undefined }) },
  };
};

type FramingChanged = Extract<ViewRecordBindingEvent, { type: 'framingChanged' }>;

/*
 * Framing's entry or state changed. A pending pose framing no longer holds is gone: a new entry replaced it. When framing
 * waits for an entry, a turn parked for it, or else the record's own camera when the record is for it, becomes that
 * entry's pending pose.
 */
const followFraming = (
  { context, event }: Readonly<{ context: BindingContext; event: FramingChanged }>,
  enq: BindingEnqueue,
): Readonly<{ context: BindingContext; unframed: boolean }> => {
  const previous = context.framingState;
  const renamed = event.identity !== previous.identity;
  const unframed = renamed || (previous.framed && !event.framed);
  const framingState: FramingState = { identity: event.identity, framed: event.framed, holding: event.holding };
  let next: BindingContext = {
    ...context,
    framingState,
    adoptions: unframed
      ? context.adoptions.filter((adoption) => adoption.framing === undefined || adoption.requestId === event.holding)
      : context.adoptions,
  };
  if (event.framed || event.identity === undefined || !(unframed || context.parked !== undefined)) {
    return { context: acknowledged(next, enq), unframed };
  }
  const { parked } = context;
  const turn =
    parked?.entryPath === event.identity
      ? parked.turn
      : renamed && parked === undefined && next.record?.entryPath === event.identity
        ? cameraAdoptionOf(next.record)
        : undefined;
  if (turn === undefined) {
    return { context: acknowledged(next, enq), unframed };
  }
  next = { ...next, parked: undefined };
  return {
    context: acknowledged(
      requestCamera(
        { context: next, camera: turn, entryPath: event.identity, value: { camera: 'awaitingFrame' } },
        enq,
      ),
      enq,
    ),
    unframed,
  };
};

/*
 * The entry's first frame: a pending pose framing did not hold when it framed never reaches the camera from framing,
 * so the camera adopts it now (the record's camera, shown over the first frame).
 *
 * This relies on xstate's synchronous delivery: framing's `sendTo` reaches the idle camera inside framing's own step,
 * so the camera's `adoptionApplied` for a pose framing applied arrives before framing's observers report it framed.
 * A runtime that delivered asynchronously would reissue that pose; the session rows would show it as a second write.
 */
const rerouteDroppedPendingPoses = (context: BindingContext, enq: BindingEnqueue): BindingContext => {
  const lost = context.adoptions.filter(
    (adoption) => adoption.framing !== undefined && adoption.requestId !== context.framingState.holding,
  );
  if (lost.length === 0) {
    return context;
  }
  let { requests } = context;
  const reissued: Adoption[] = lost.map((adoption) => {
    requests += 1;
    const requestId = `view-binding-${requests}`;
    enq.sendTo(context.camera, { type: 'adoptPersistedPose', requestId, ...adoption.framing });
    return { requestId, turns: true };
  });
  return {
    ...context,
    requests,
    adoptions: [...context.adoptions.filter((adoption) => !lost.includes(adoption)), ...reissued],
  };
};

type SectionSettled = Extract<ViewRecordBindingEvent, { type: 'sectionSettled' }>;

/* The section quiet gate opens: a waiting foreign section is adopted, otherwise the person's section is written. */
const settleSection = (
  { context, event, editRecord }: Handled<SectionSettled>,
  enq: BindingEnqueue,
): BindingContext => {
  const pending = context.sectionPending;
  if (pending !== undefined) {
    // The record already holds the foreign section, so nothing is written; the person's cuts give way to it.
    enq.sendTo(context.graphics, { type: 'adoptSectionView', section: pending });
    return acknowledged(
      { ...context, owners: { ...context.owners, section: pending }, sectionPending: undefined },
      enq,
    );
  }
  if (same(context.owners.section, event.section)) {
    return context;
  }
  return edited({ context, editRecord, owners: { ...context.owners, section: event.section } }, enq);
};

type Answer = Extract<ViewRecordBindingEvent, { type: 'adoptionApplied' | 'adoptionDropped' }>;

/* The camera's answer to an adoption; a drop re-saves the person's pose (D15, `AdoptDropped:resaved`). */
const answerAdoption = (
  { context, event, editRecord, framed }: Handled<Answer> & Readonly<{ framed: boolean }>,
  enq: BindingEnqueue,
): BindingContext | undefined => {
  if (!context.adoptions.some(({ requestId }) => requestId === event.requestId)) {
    // MC-R18: an answer to a superseded or foreign request.
    return undefined;
  }
  const { turns } = context.adoptions.find(({ requestId }) => requestId === event.requestId)!;
  const adoptions = context.adoptions.filter(({ requestId }) => requestId !== event.requestId);
  if (event.type === 'adoptionApplied') {
    return acknowledged({ ...context, adoptions }, enq);
  }
  // A dropped adoption means the view never showed the record, so it is not acknowledged as applied.
  if (!turns && context.dropped === undefined) {
    // Field of view and up direction are the record's to set (ruling of 2026-11-12): a field-only drop has nothing to
    // write back. The camera shows them again at the next change of their resolution.
    return { ...context, adoptions, applying: undefined };
  }
  // An earlier drop still unresolved keeps its pose: a field-only drop after it never lowers what must be written back.
  const dropped = { record: context.record!, turns: turns || context.dropped?.turns === true };
  const answered: BindingContext = { ...context, adoptions, applying: undefined, dropped };
  const { pose } = context;
  if (!framed || pose === undefined || !personSources.has(pose.by)) {
    // Before the first frame nothing is written; framing still applies the record's pose after that frame.
    // Dropped over a machine-made pose, which is never saved (I7): the file keeps the foreign pose.
    return answered;
  }
  const owners: ViewOwners = { ...context.owners, camera: pose.view };
  // A re-save equal to the file publishes nothing: nothing differs, so the drop is resolved at once.
  const unchanged = !dropped.turns && same(nextRecord(owners, context.record!), context.record);
  return edited({ context: unchanged ? { ...answered, dropped: undefined } : answered, editRecord, owners }, enq);
};

const viewRecordBindingDefinition = setup({
  schemas: {
    context: types<BindingContext>(),
    events: eventSchemas<ViewRecordBindingEvent>(),
    emitted: eventSchemas<ViewRecordBindingEmitted>(),
    input: types<ViewRecordBindingInput>(),
    transitionMeta: types<{ tla: ViewRecordBindingAction }>(),
  },
  actions: {
    editRecord: (_args: ViewRecordBindingEffectArgs['editRecord']): void => notProvided('editRecord'),
  },
}).createMachine({
  id: 'viewRecordBinding',
  version: '1',
  /* A fault is recorded and the binding keeps answering (MC-R12); the store's command surface refuses its edits. */
  onError: refines('Unmodelled', ({ event }) => ({ context: { fault: messageOf(event.error) } })),
  context: ({ input }): BindingContext => ({
    graphics: input.graphics,
    camera: input.camera,
    framing: input.framing,
    framingState: { identity: undefined, framed: false, holding: undefined },
    parked: undefined,
    record: undefined,
    owners: { ...input.owners },
    levels: input.levels ?? {},
    pose: undefined,
    fieldOfView: undefined,
    revision: 0,
    lastWrittenRevision: 0,
    adoptions: [],
    sectionPending: undefined,
    dropped: undefined,
    applying: undefined,
    requests: 0,
    fault: undefined,
  }),
  type: 'parallel',
  on: {
    recordPublished: refines('Observe', ({ context, event, value }, enq) => ({
      context: observeRecord({ context, event, value }, enq),
    })),
    ownersChanged: refines('Unmodelled', ({ context, event, actions }, enq) => {
      const owners: ViewOwners = { ...context.owners, ...event.owners };
      if (same(owners, context.owners)) {
        // An owner echoing a value it already holds, such as one the binding just adopted.
        return {};
      }
      return { context: edited({ context, editRecord: actions.editRecord, owners }, enq) };
    }),
    levelsChanged: refines('Unmodelled', ({ context, event, value }, enq) => {
      if (context.record === undefined) {
        return { context: { levels: event.levels } };
      }
      // The same record over new levels: only the inheritable leaves whose resolution changed are seeded.
      const changes = foreignChanges(context.record, context.record, {
        levels: event.levels,
        previousLevels: context.levels,
      });
      for (const adoption of changes.graphics) {
        enq.sendTo(context.graphics, adoption);
      }
      const leveled: BindingContext = { ...context, levels: event.levels };
      return {
        context:
          changes.camera === undefined
            ? leveled
            : requestCamera(
                { context: leveled, camera: changes.camera, entryPath: context.record.entryPath ?? undefined, value },
                enq,
              ),
      };
    }),
    adoptionApplied: refines('Observe', ({ context, event, actions, value }, enq) => {
      const next = answerAdoption({ context, event, editRecord: actions.editRecord, framed: isFramed(value) }, enq);
      return next === undefined ? {} : { context: next };
    }),
    adoptionDropped: refines('Observe', ({ context, event, actions, value }, enq) => {
      const next = answerAdoption({ context, event, editRecord: actions.editRecord, framed: isFramed(value) }, enq);
      return next === undefined ? {} : { context: next };
    }),
  },
  states: {
    camera: {
      initial: 'awaitingFrame',
      states: {
        awaitingFrame: {
          on: {
            cameraChanged: refines('Changed', ({ context, event, actions }, enq) => {
              const observed = observeCamera({ context, event, editRecord: actions.editRecord, framed: false }, enq);
              if (observed === undefined) {
                return {};
              }
              return observed.framed
                ? { target: 'framed', context: rerouteDroppedPendingPoses(observed.context, enq) }
                : { context: observed.context };
            }),
            framingChanged: refines('Unmodelled', ({ context, event }, enq) => ({
              context: followFraming({ context, event }, enq).context,
            })),
          },
        },
        framed: {
          on: {
            cameraChanged: refines('Changed', ({ context, event, actions }, enq) => {
              const observed = observeCamera({ context, event, editRecord: actions.editRecord, framed: true }, enq);
              return observed === undefined ? {} : { context: observed.context };
            }),
            // A new entry, or framing waiting again: the camera shows no framed entry until its first frame.
            framingChanged: refines('Unmodelled', ({ context, event }, enq) => {
              const followed = followFraming({ context, event }, enq);
              return followed.unframed
                ? { target: 'awaitingFrame', context: followed.context }
                : { context: followed.context };
            }),
          },
        },
      },
    },
    section: {
      initial: 'settled',
      states: {
        settled: {
          on: {
            sectionEdited: { target: 'editing', meta: { tla: 'Unmodelled' } },
            sectionSettled: refines('Unmodelled', ({ context, event, actions }, enq) => ({
              context: settleSection({ context, event, editRecord: actions.editRecord }, enq),
            })),
          },
        },
        editing: {
          on: {
            // Still editing: the gate stays shut until graphics reports the section settled.
            sectionEdited: refines('Unmodelled', () => ({})),
            sectionSettled: refines('Unmodelled', ({ context, event, actions }, enq) => ({
              target: 'settled',
              context: settleSection({ context, event, editRecord: actions.editRecord }, enq),
            })),
          },
        },
      },
    },
  },
});

/**
 * The `[state, eventType]` pairs {@link viewRecordBindingMachine} leaves unanswered (MC-R17): none. Every state takes
 * every event; a stale answer or a re-delivery returns `{}` after its check.
 */
export const viewRecordBindingIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/** Every {@link ViewRecordBindingEvent} type, in the union's order. */
export const viewRecordBindingEventTypes = [
  'recordPublished',
  'ownersChanged',
  'levelsChanged',
  'sectionEdited',
  'sectionSettled',
  'cameraChanged',
  'adoptionApplied',
  'adoptionDropped',
  'framingChanged',
] as const satisfies ReadonlyArray<ViewRecordBindingEvent['type']>;

type ViewRecordBindingMachineDefinition = typeof viewRecordBindingDefinition;

/** The type of {@link viewRecordBindingMachine}, named so declarations reference it rather than inline it. */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface ViewRecordBindingMachine extends ViewRecordBindingMachineDefinition {}

/** One view's binding between its record and its live owners. */
export const viewRecordBindingMachine: ViewRecordBindingMachine = viewRecordBindingDefinition;

/** A binding's snapshot. */
export type ViewRecordBindingSnapshot = SnapshotFrom<ViewRecordBindingMachine>;
