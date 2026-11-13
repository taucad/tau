import { createAsyncLogic, createCallbackLogic, setup, types, waitFor } from 'xstate';
import type {
  ActorFromLogic,
  ActorRefFrom,
  AnyActor,
  AnyActorRef,
  EnqueueObject,
  SnapshotFrom,
  SystemRegistry,
} from 'xstate';
import { produce } from 'immer';
import type { Project, ProjectManifestParseIssue } from '@taucad/types';
import { assertRootedPath, normalizePath } from '@taucad/utils/path';
import { classify } from '@taucad/filesystem/path-registry';
import { isBrowser } from '#constants/browser.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { GraphicsOwnedSettings, GraphicsViewSettings } from '@taucad/viewer/graphics/graphics-settings';
import { defaultGraphicsSettings } from '@taucad/viewer/graphics/graphics-settings';
import { actorIdOf, eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { cadMachine, closeCadRuntime, disposeCadRuntime } from '#machines/cad.machine.js';
import { graphicsMachine, sameComponentFocus, selectComponentFocus } from '@taucad/viewer/machines/graphics.machine';
import type { ComponentFocus, GraphicsEmitted } from '@taucad/viewer/machines/graphics.machine';
import { logMachine } from '#machines/logs.machine.js';
import { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';

/** What a view presents: its unit, and the media type of the artifact it shows. */
type ViewPresentation = Readonly<{ unitId: string | undefined; mediaType: string | undefined }>;

/**
 * Project Machine Context
 */
export type ProjectContext = {
  projectId: string;
  project: Project | undefined;
  /**
   * Why `tau.json` on disk is not the canonical manifest `project` holds (blueprint R4/R5).
   *
   * Set by the load for a degraded manifest, and by the change observer when the
   * bytes stop identifying this project while it is open. While set, implicit
   * writes are refused; `repairManifest` is the one explicit write.
   */
  manifestIssue: ProjectManifestParseIssue | undefined;
  error: Error | undefined;
  isLoading: boolean;
  shouldLoadModelOnStart: boolean;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  /** Kernel heap above which each geometry unit recycles its runtime (see {@link ProjectInput}). */
  recycleHeapBytes: number | undefined;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  fileSystemRoot: string;
  /** Bytes each geometry unit's first render stages (see {@link ProjectInput}). */
  stage: Record<string, Uint8Array<ArrayBuffer>> | undefined;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  /**
   * Each view's record session, beside its graphics actor (charter G6b): the view record's store and the view's
   * `viewRecordBinding`. The host provides the `viewRecord` logic with the project's file ports; the default does nothing.
   */
  viewRecordSessions: Map<string, AnyActorRef>;
  /** What each view presents, as its graphics last reported it: the shared manifest is kept while a GLB view shows it. */
  viewPresentations: Map<string, ViewPresentation>;
  /** Each view's `presentedUnitChanged` listener, stopped with its view: a listener outlives its source otherwise. */
  viewPresentationListeners: Map<string, AnyActor>;
  /** Project-scoped model appearance shared by every viewer of the same geometry unit. */
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  /**
   * Each unit's focused component, folded from the shared model interaction and forwarded to every view's graphics:
   * graphics observes only a model interaction it owns (MC-R11), and the project owns this one.
   */
  componentFocus: ComponentFocus;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** Visible viewer panels and explicit operations are the runtime's entry-scoped demand. */
  viewerGeometryDemand: Map<string, string>;
  operationGeometryDemand: Map<string, string>;
  runtimeParked: boolean;
  /**
   * Why this project has no kernel, and which unit said so (R4).
   *
   * One word, because the row says one sentence — but tagged with its reporter,
   * because the clear rides on a unit *entering* `connecting`: an untagged word
   * would let a second view's first connect attempt erase the refusal its
   * still-refused sibling reported (V2-3). Only the unit that reported a
   * refusal can take it back.
   */
  kernelRefusal: { actorId: string; reason: string } | undefined;
  /** The main entry path from project.assets.main.entryPath. Set after project loads. */
  mainEntryPath: string;
  logRef: ActorRefFrom<typeof logMachine>;
};

/**
 * Project Machine Input
 */
type ProjectInput = {
  projectId: string;
  shouldLoadModelOnStart?: boolean;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  fileSystemRoot: string;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  /** Kernel heap in bytes above which each geometry unit recycles its runtime once idle; omitted never recycles. */
  recycleHeapBytes?: number;
  /** Bytes each geometry unit's first render stages, for a memory-mounted project whose kernel cannot see the mount. */
  stage?: Record<string, Uint8Array<ArrayBuffer>>;
};

export type ProjectLoadInput = { readonly projectId: string };

export type ProjectRetrievedEvent = {
  readonly type: 'projectRetrieved';
  readonly project: Project;
  /** Present when `project` is the normalized view of a degraded manifest. */
  readonly issue?: ProjectManifestParseIssue;
};

// Define the actors that the machine can invoke
const loadProjectActor = fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.loadProjectActor` option to the project machine.',
  );
});

const writeProjectActor = fromSafeAsync<void, { project: Project; repair?: boolean }>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.writeProjectActor` option to the project machine.',
  );
});

/** Input of a view's record session (the `viewRecord` actor). */
export type ViewRecordSessionActorInput = Readonly<{ viewId: string; graphics: ActorRefFrom<typeof graphicsMachine> }>;

/**
 * A view's record session. The default keeps nothing: a project with no record files (a test, the converter) has no
 * view record. `ProjectProvider` provides the session over its file ports (`view-record-session.ts`).
 */
const viewRecord = createCallbackLogic<{ type: 'never' }, ViewRecordSessionActorInput>(() => undefined);

const projectActors = {
  loadProjectActor,
  writeProjectActor,
  closeRuntimeActor: createAsyncLogic<void, { units: ReadonlyArray<ActorRefFrom<typeof cadMachine>> }>({
    run: async ({ input, signal }) => {
      const outcomes = await Promise.allSettled(input.units.map(async (unit) => closeCadRuntime(unit, signal)));
      const failures: unknown[] = [];
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          const reason: unknown = outcome.reason;
          failures.push(reason);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Project runtime shutdown failed');
      }
    },
  }),
  graphics: graphicsMachine,
  viewRecord,
  modelInteraction: modelInteractionMachine,
  cad: cadMachine,
  logs: logMachine,
} as const;

export type ProjectFileActivityOperation =
  | 'written'
  | 'batchWritten'
  | 'directoryCreated'
  | 'fileCopied'
  | 'directoryCopied'
  | 'renamed'
  | 'directoryRenamed'
  | 'deleted'
  | 'directoryDeleted';

/**
 * Whether a filesystem event is activity on the project's own content.
 *
 * The path registry answers it: versioned bytes are content. `tau.json` is
 * the one exception — it is project metadata, so a rename or description
 * edit is not work on the design.
 *
 * @param projectRelativePath - Path relative to the project root.
 * @returns `true` when the path is versioned project content.
 */
export function isProjectContentActivityPath(projectRelativePath: string): boolean {
  const normalized = normalizePath(projectRelativePath).replace(/^\/+/, '');
  if (normalized === '' || normalized === '.' || normalized === 'tau.json') {
    return false;
  }

  return classify(normalized).versioned;
}

/**
 * Project Machine Events
 */
type ProjectEventInternal =
  | { type: 'reloadProject' }
  | { type: 'closeRuntime' }
  | { type: 'geometryUnit.runtimeClosed'; unit: ActorRefFrom<typeof cadMachine> }
  /* The change observer: tau.json is no longer readable under the current declaration contract; keep the last good manifest open. */
  | { type: 'manifestIssueObserved'; issue: ProjectManifestParseIssue }
  /* The one explicit write over a degraded tau.json: the manifest this workspace holds. */
  | { type: 'repairManifest' }
  | { type: 'updateName'; name: string }
  | { type: 'updateDescription'; description: string }
  | { type: 'updateTags'; tags: string[] }
  | { type: 'loadModel' }
  | { type: 'setMainFile'; path: string }
  | { type: 'createGeometryUnit'; entryPath: string; operationTimeout?: number }
  | { type: 'setViewerGeometryDemand'; viewId: string; entryPath?: string }
  | { type: 'claimGeometryUnit'; claimId: string; entryPath: string; operationTimeout?: number }
  | { type: 'releaseGeometryUnit'; claimId: string }
  /* R4: a unit reporting whether its kernel was refused, and why. */
  | { type: 'geometryUnit.kernelRefused'; actorId: string; reason: string | undefined }
  | { type: 'openInViewer'; entryPath: string }
  /* R3: the live session's park signal, relayed to the kernels this project owns. */
  | { type: 'parkRuntime' }
  | { type: 'resumeRuntime' }
  | { type: 'destroyGeometryUnit'; entryPath: string }
  | {
      type: 'createViewGraphics';
      viewId: string;
      settings?: GraphicsViewSettings;
    }
  | { type: 'destroyViewGraphics'; viewId: string }
  /** A view's graphics reported `presentedUnitChanged`. */
  | { type: 'viewPresentationChanged'; viewId: string; unitId: string | undefined; mediaType: string | undefined }
  /** The shared model interaction's snapshot, folded to each unit's focused component. */
  | { type: 'modelComponentFocusObserved'; focus: ComponentFocus }
  // Filesystem participant intents — fired by the
  // `file-operation-participants.ts` adapter on rename/delete events.
  // The participant is the single source of truth; UI components must
  // not send these intents directly.
  | { type: 'fileMoved'; oldPath: string; newPath: string }
  | { type: 'fileDeleted'; path: string }
  | { type: 'directoryDeleted'; path: string }
  | {
      type: 'projectFileActivity';
      operation: ProjectFileActivityOperation;
      paths: readonly string[];
    }
  | { type: 'flushNow' };

/**
 * Every event the project machine accepts, its own and the load's report.
 *
 * @public
 */
export type ProjectEvent = ProjectEventInternal | ProjectRetrievedEvent;

/**
 * The project machine's public alphabet: every {@link ProjectEvent} type, in the union's order. The totality test
 * samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const projectEventTypes = [
  'reloadProject',
  'closeRuntime',
  'geometryUnit.runtimeClosed',
  'manifestIssueObserved',
  'repairManifest',
  'updateName',
  'updateDescription',
  'updateTags',
  'loadModel',
  'setMainFile',
  'createGeometryUnit',
  'setViewerGeometryDemand',
  'claimGeometryUnit',
  'releaseGeometryUnit',
  'geometryUnit.kernelRefused',
  'openInViewer',
  'parkRuntime',
  'resumeRuntime',
  'destroyGeometryUnit',
  'createViewGraphics',
  'destroyViewGraphics',
  'viewPresentationChanged',
  'modelComponentFocusObserved',
  'fileMoved',
  'fileDeleted',
  'directoryDeleted',
  'projectFileActivity',
  'flushNow',
  'projectRetrieved',
] as const satisfies ReadonlyArray<ProjectEvent['type']>;

/** The states outside `ready` that a person or a participant can still reach with a `ready` verb. */
const projectNotReadyStates = ['idle', 'loading', 'error', 'runtimeClosing', 'runtimeClosed', 'runtimeCloseFailed'];
const projectRuntimeCloseStates = ['runtimeClosing', 'runtimeClosed', 'runtimeCloseFailed'];

/** The verbs only `ready` answers: manifest, metadata, unit, viewer-demand, participant and flush events. */
const projectReadyOnlyEvents = [
  'manifestIssueObserved',
  'repairManifest',
  'updateName',
  'updateDescription',
  'updateTags',
  'loadModel',
  'setMainFile',
  'createGeometryUnit',
  'setViewerGeometryDemand',
  'claimGeometryUnit',
  'releaseGeometryUnit',
  'openInViewer',
  'destroyGeometryUnit',
  'fileMoved',
  'fileDeleted',
  'directoryDeleted',
  'projectFileActivity',
  'flushNow',
] as const;

/**
 * The (state, event) pairs this machine leaves unanswered today (MC-R17): the totality baseline. A pair names a state
 * where some event of its type goes unanswered; a mixed pair's type is also answered there with other context (a
 * pair cannot say which), and the totality test checks that answer with its own row. The view, focus, refusal and
 * runtime-closed reports are answered at the root.
 *
 * - Outside `ready`, every verb only `ready` answers.
 * - In `ready`, the metadata verbs return `undefined` when they would change nothing or the manifest is degraded
 *   (`updateName` to the current name, `updateDescription`, `updateTags`, `setMainFile`); `repairManifest` unless the
 *   manifest is repairable and nothing is being written; `projectFileActivity` for metadata only; `flushNow` unless a
 *   write failed, and while a write or repair runs.
 * - `projectRetrieved` outside `loading`: the load's report lands only while its invoke runs.
 * - `reloadProject` while loading and once the runtime is closing or closed.
 * - The close states' static `{}` answers, which `can()` reads as refused: `closeRuntime` while closing or closed,
 *   `parkRuntime` and `resumeRuntime` in all three.
 * - `createViewGraphics` and `destroyViewGraphics` in `error` and the close states: a view's graphics actor created
 *   before the load failed is not stopped when its pane closes.
 *
 * @public
 */
export const projectIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ...projectNotReadyStates.flatMap((state) => projectReadyOnlyEvents.map((type) => [state, type] as const)),
  ...(
    ['repairManifest', 'updateName', 'updateDescription', 'updateTags', 'setMainFile', 'projectFileActivity'] as const
  ).map((type) => ['ready', type] as const),
  ...['ready.storing.idle', 'ready.storing.writing', 'ready.storing.repairing'].map(
    (state) => [state, 'flushNow'] as const,
  ),
  ...['idle', 'ready', 'error', ...projectRuntimeCloseStates].map((state) => [state, 'projectRetrieved'] as const),
  ...['loading', ...projectRuntimeCloseStates].map((state) => [state, 'reloadProject'] as const),
  ['runtimeClosing', 'closeRuntime'],
  ['runtimeClosed', 'closeRuntime'],
  ...projectRuntimeCloseStates.flatMap((state) => [[state, 'parkRuntime'] as const, [state, 'resumeRuntime'] as const]),
  ...['error', ...projectRuntimeCloseStates].flatMap((state) => [
    [state, 'createViewGraphics'] as const,
    [state, 'destroyViewGraphics'] as const,
  ]),
];

/**
 * Project Machine Emitted Events
 */
type ProjectEmitted =
  | { type: 'error'; error: Error }
  | { type: 'projectUpdated'; project: Project }
  | { type: 'projectActivity' }
  | { type: 'viewerFileRequested'; entryPath: string };

type ProjectEnqueue = EnqueueObject<ProjectEvent, ProjectEmitted, SystemRegistry, typeof projectActors>;
type ProjectPatch = Partial<ProjectContext>;
type ProjectArgs<EventType extends ProjectEvent['type']> = Readonly<{
  context: ProjectContext;
  event: Extract<ProjectEvent, { type: EventType }>;
  self: AnyActorRef;
}>;
type CadUnitRef = ActorRefFrom<typeof cadMachine>;

const isCadChild = (child: AnyActor | undefined): child is ActorFromLogic<typeof cadMachine> => child?.src === 'cad';

const setError = (error: unknown): ProjectPatch => ({
  error: error instanceof Error ? error : new Error('Unknown error'),
  isLoading: false,
});

/** Implicit writes never replace a degraded manifest: its normalized view is lossy (blueprint R4). */
const isManifestWritable = (context: ProjectContext): boolean => context.manifestIssue === undefined;

/** Repair is refused for a JSON syntax error, whose defaults would erase text a person can still fix. */
const isManifestRepairable = (context: ProjectContext): boolean =>
  context.project !== undefined &&
  context.manifestIssue !== undefined &&
  context.manifestIssue.code !== 'manifest-invalid-json';

const shouldUpdateProjectName = (context: ProjectContext, event: Extract<ProjectEvent, { type: 'updateName' }>) =>
  Boolean(isManifestWritable(context) && context.project && context.project.name !== event.name);

/** Rewrite the loaded manifest, or leave context alone when no project is loaded. */
const withProject = (context: ProjectContext, recipe: (project: Project) => void): ProjectPatch =>
  context.project ? { project: produce(context.project, recipe) } : {};

/**
 * Spawn one headless CAD unit for an entry and ask it to render that entry.
 *
 * XState assigns each invocation its own id, so a retired unit may finish
 * closing while a replacement renders the same entry.
 */
const spawnGeometryUnit = (
  context: ProjectContext,
  enq: ProjectEnqueue,
  unit: Readonly<{
    self: AnyActorRef;
    entryPath: string;
    options: Readonly<{ shouldInitializeKernelOnStart: boolean; operationTimeout?: number }>;
  }>,
): CadUnitRef => {
  const { self, entryPath, options } = unit;
  const cadUnit = enq.spawn('cad', {
    input: {
      shouldInitializeKernelOnStart: options.shouldInitializeKernelOnStart,
      parentRef: self,
      logRef: context.logRef,
      fileManagerRef: context.fileManagerRef,
      kernelOptionsFactory: context.kernelOptionsFactory,
      fileSystemRoot: context.fileSystemRoot,
      ...(options.operationTimeout === undefined ? {} : { operationTimeout: options.operationTimeout }),
      ...(context.recycleHeapBytes === undefined ? {} : { recycleHeapBytes: context.recycleHeapBytes }),
    },
  });
  enq.sendTo(cadUnit, { type: 'initializeModel', entryPath, ...(context.stage ? { stage: context.stage } : {}) });
  return cadUnit;
};

/**
 * Render the project's main entry, spawning its unit the first time.
 *
 * The load that follows opening the project also points `mainEntryPath` at an
 * existing unit; an explicit `loadModel` leaves the pointer where it is.
 */
const loadMainModel = (
  context: ProjectContext,
  enq: ProjectEnqueue,
  load: Readonly<{ self: AnyActorRef; options: Readonly<{ pointAtExistingUnit: boolean }> }>,
): ProjectPatch => {
  const { self, options } = load;
  const mainAsset = context.project?.assets.main;
  if (!mainAsset) {
    return {};
  }
  const mainFile = mainAsset.entryPath;
  const existingUnit = context.geometryUnits.get(mainFile);
  if (existingUnit) {
    enq.sendTo(existingUnit, { type: 'initializeModel', entryPath: mainFile });
    return options.pointAtExistingUnit ? { mainEntryPath: mainFile } : {};
  }
  const geometryUnits = new Map(context.geometryUnits);
  geometryUnits.set(
    mainFile,
    spawnGeometryUnit(context, enq, { self, entryPath: mainFile, options: { shouldInitializeKernelOnStart: false } }),
  );
  return { geometryUnits, mainEntryPath: mainFile };
};

const createViewGraphics = ({ context, event }: ProjectArgs<'createViewGraphics'>, enq: ProjectEnqueue) => {
  // No-op if a graphics actor already exists for this view
  if (context.viewGraphics.has(event.viewId)) {
    return {};
  }

  const settings = event.settings ?? defaultGraphicsSettings;

  /* Every graphics-owned key, spelled out: a key added to the partition fails to compile here
   * until the spawn seeds it, which is what makes Law 1's declaration reach the actor. */
  const graphicsSeed: { [K in keyof Required<GraphicsOwnedSettings>]: GraphicsOwnedSettings[K] } = {
    enableSurfaces: settings.enableSurfaces,
    enableLines: settings.enableLines,
    enableGizmo: settings.enableGizmo,
    enableGrid: settings.enableGrid,
    enableAxes: settings.enableAxes,
    enableMatcap: settings.enableMatcap,
    enablePostProcessing: settings.enablePostProcessing,
    upDirection: settings.upDirection,
    pinnedMeasurements: settings.pinnedMeasurements,
    sectionView: settings.sectionView,
    graphicsBackend: settings.graphicsBackend ?? 'webgl',
  };

  const gfx = enq.spawn('graphics', {
    id: `graphics-view-${context.projectId}-${event.viewId}`,
    input: {
      ...graphicsSeed,
      // The view's camera is the graphics actor's child: it is seeded here, once, and lives as long as the view.
      camera: { cameraFovAngle: settings.cameraFovAngle, cameraView: settings.cameraView },
      modelInteractionRef: context.modelInteractionRef,
    },
  });

  // The view's record session lives as long as its graphics actor: the record follows the owners, not a pane.
  const session = enq.spawn('viewRecord', {
    id: `view-record-${context.projectId}-${event.viewId}`,
    input: { viewId: event.viewId, graphics: gfx },
  });

  // A focus made before this view opened frames it once it presents that unit.
  if (Object.keys(context.componentFocus).length > 0) {
    enq.sendTo(gfx, { type: 'componentFocusObserved', focus: context.componentFocus });
  }

  const listener = enq.listen(
    gfx,
    'presentedUnitChanged',
    (presented: Extract<GraphicsEmitted, { type: 'presentedUnitChanged' }>): ProjectEvent => ({
      type: 'viewPresentationChanged',
      viewId: event.viewId,
      unitId: presented.unitId,
      mediaType: presented.mediaType,
    }),
  );

  const viewGraphics = new Map(context.viewGraphics);
  viewGraphics.set(event.viewId, gfx);
  const viewRecordSessions = new Map(context.viewRecordSessions);
  viewRecordSessions.set(event.viewId, session);
  const viewPresentationListeners = new Map(context.viewPresentationListeners);
  viewPresentationListeners.set(event.viewId, listener);
  return { context: { viewGraphics, viewRecordSessions, viewPresentationListeners } };
};

const glbMediaType = 'model/gltf-binary';

/** The project owns the shared manifest until its last presented GLB pane leaves. */
const reconcileViewManifest = (
  context: ProjectContext,
  enq: ProjectEnqueue,
  { unitId, viewPresentations }: Readonly<{ unitId: string; viewPresentations: ProjectContext['viewPresentations'] }>,
): void => {
  for (const view of viewPresentations.values()) {
    if (view.mediaType === glbMediaType && view.unitId === unitId) {
      return;
    }
  }
  enq.sendTo(context.modelInteractionRef, { type: 'clearManifest', unitId, source: 'viewer' });
  enq.sendTo(context.modelInteractionRef, { type: 'clearSelection', unitId, source: 'viewer' });
  enq.sendTo(context.modelInteractionRef, { type: 'clearFocus', unitId, source: 'viewer' });
};

/** A view that stops presenting a unit as a GLB, by a new unit or other media, may have been its last. */
const viewPresentationChanged = (
  { context, event }: ProjectArgs<'viewPresentationChanged'>,
  enq: ProjectEnqueue,
): Readonly<{ context?: Partial<ProjectContext> }> => {
  if (!context.viewGraphics.has(event.viewId)) {
    return {};
  }
  const previous = context.viewPresentations.get(event.viewId);
  const viewPresentations = new Map(context.viewPresentations);
  viewPresentations.set(event.viewId, { unitId: event.unitId, mediaType: event.mediaType });
  if (
    previous?.unitId &&
    (previous.unitId !== event.unitId || (previous.mediaType === glbMediaType && event.mediaType !== glbMediaType))
  ) {
    reconcileViewManifest(context, enq, { unitId: previous.unitId, viewPresentations });
  }
  return { context: { viewPresentations } };
};

const destroyViewGraphics = ({ context, event }: ProjectArgs<'destroyViewGraphics'>, enq: ProjectEnqueue) => {
  const gfx = context.viewGraphics.get(event.viewId);
  if (!gfx) {
    return {};
  }
  // The session stops first: its last flush reads the owners it wrote from.
  const session = context.viewRecordSessions.get(event.viewId);
  if (session) {
    enq.stop(session);
  }
  enq.stop(gfx);
  const viewPresentationListeners = new Map(context.viewPresentationListeners);
  const listener = viewPresentationListeners.get(event.viewId);
  if (listener) {
    enq.stop(listener);
    viewPresentationListeners.delete(event.viewId);
  }
  const viewPresentations = new Map(context.viewPresentations);
  const unitId = viewPresentations.get(event.viewId)?.unitId;
  viewPresentations.delete(event.viewId);
  if (unitId) {
    reconcileViewManifest(context, enq, { unitId, viewPresentations });
  }
  const viewGraphics = new Map(context.viewGraphics);
  viewGraphics.delete(event.viewId);
  const viewRecordSessions = new Map(context.viewRecordSessions);
  viewRecordSessions.delete(event.viewId);
  return { context: { viewGraphics, viewRecordSessions, viewPresentations, viewPresentationListeners } };
};

/** Drop the units a deletion matched and a main pointer into them. */
const withoutUnits = (context: ProjectContext, matches: (entryPath: string) => boolean): ProjectPatch => {
  const geometryUnits = new Map(context.geometryUnits);
  for (const key of context.geometryUnits.keys()) {
    if (matches(key)) {
      geometryUnits.delete(key);
    }
  }
  return {
    geometryUnits,
    viewerGeometryDemand: new Map([...context.viewerGeometryDemand].filter(([, path]) => !matches(path))),
    operationGeometryDemand: new Map([...context.operationGeometryDemand].filter(([, path]) => !matches(path))),
    ...(matches(context.mainEntryPath) ? { mainEntryPath: '' } : {}),
  };
};

const hasOperationDemand = (context: ProjectContext, entryPath: string): boolean =>
  [...context.operationGeometryDemand.values()].includes(entryPath);

const shouldRunUnit = (context: ProjectContext, entryPath: string): boolean =>
  hasOperationDemand(context, entryPath) ||
  (!context.runtimeParked &&
    (entryPath === context.mainEntryPath || [...context.viewerGeometryDemand.values()].includes(entryPath)));

const reconcileUnitRuntime = (
  { previous, next, entryPath }: { previous: ProjectContext; next: ProjectContext; entryPath: string },
  enq: ProjectEnqueue,
): void => {
  if (shouldRunUnit(previous, entryPath) === shouldRunUnit(next, entryPath)) {
    return;
  }
  const unit = next.geometryUnits.get(entryPath);
  if (unit) {
    enq.sendTo(unit, { type: shouldRunUnit(next, entryPath) ? 'resumeRuntime' : 'parkRuntime' });
  }
};

/**
 * Project Machine
 *
 * Manages project lifecycle, storage operations, and filesystem coordination.
 *
 * States:
 * - idle: No project loaded
 * - loading: Loading project from storage
 * - ready: Project loaded and ready
 * - updating: Updating project metadata
 * - creating: Creating a new project
 * - deleting: Deleting a project
 * - error: An error occurred
 */
export const projectMachine = setup({
  schemas: {
    context: types<ProjectContext>(),
    events: eventSchemas<ProjectEvent>(),
    emitted: eventSchemas<ProjectEmitted>(),
    input: types<ProjectInput>(),
  },
  actors: projectActors,
  /* Provided by hosts and tests that pin the environment instead of reading `isBrowser`. */
  guards: {
    isNotBrowser: () => !isBrowser,
    shouldAutoLoad: () => isBrowser,
  },
  delays: {
    /** Zero-delay batching step so `pending` can handle `flushNow` before transitioning to `writing`. */
    pendingToWriting: 0,
  },
}).createMachine({
  id: 'project',
  context: ({ input, spawn, actors }) => {
    const {
      projectId,
      shouldLoadModelOnStart = true,
      fileManagerRef,
      fileSystemRoot,
      kernelOptionsFactory,
      recycleHeapBytes,
      stage,
    } = input;

    const logRef = spawn(actors.logs, {
      id: `log-${projectId}`,
    });
    const modelInteractionRef = spawn(actors.modelInteraction, {
      id: `model-interaction-${projectId}`,
      input: {},
    });

    // Compilation units are created dynamically after project loads (when we know the main file).
    // The primary geometry unit is created once the project loads.
    const geometryUnits = new Map<string, CadUnitRef>();

    // View graphics are created dynamically by Dockview viewer panels.
    const viewGraphics = new Map<string, ActorRefFrom<typeof graphicsMachine>>();

    return {
      projectId,
      project: undefined,
      manifestIssue: undefined,
      error: undefined,
      isLoading: true,
      shouldLoadModelOnStart,
      kernelOptionsFactory,
      recycleHeapBytes,
      fileManagerRef,
      fileSystemRoot,
      stage,
      viewGraphics,
      viewRecordSessions: new Map(),
      viewPresentations: new Map(),
      viewPresentationListeners: new Map(),
      modelInteractionRef,
      componentFocus: {},
      geometryUnits,
      viewerGeometryDemand: new Map(),
      operationGeometryDemand: new Map(),
      runtimeParked: false,
      kernelRefusal: undefined,
      mainEntryPath: '',
      logRef,
    };
  },
  // The project owns the shared model interaction, so it observes the focus there and forwards it to each view.
  entry: ({ context }, enq) => {
    enq.subscribeTo(
      context.modelInteractionRef,
      (snapshot): ProjectEvent => ({
        type: 'modelComponentFocusObserved',
        focus: selectComponentFocus(snapshot.context),
      }),
    );
  },
  on: {
    closeRuntime: { target: '.runtimeClosing', context: { error: undefined } },
    // A view's report is answered in every state, so its record never goes stale while the project runs.
    viewPresentationChanged,
    // Only a change of focus reaches the views: most model-interaction snapshots (hover, selection) leave it alone.
    modelComponentFocusObserved: ({ context, event }, enq) => {
      if (sameComponentFocus(context.componentFocus, event.focus)) {
        return {};
      }
      for (const gfx of context.viewGraphics.values()) {
        enq.sendTo(gfx, { type: 'componentFocusObserved', focus: event.focus });
      }
      return { context: { componentFocus: event.focus } };
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- XState event name
    'geometryUnit.runtimeClosed': ({ context, event, children }, enq) => {
      const owned = Object.values(children).some((child) => child === event.unit);
      const active = [...context.geometryUnits.values()].includes(event.unit);
      if (owned && !active && event.unit.getSnapshot().matches('runtimeClosed')) {
        enq.stop(event.unit);
      }
      return {};
    },
    /* R4: the project keeps the refusal so its live session can report the
     * runtime region failed, which is what puts the reason on the row. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- XState event name
    'geometryUnit.kernelRefused': {
      context: ({ context, event }) => ({
        kernelRefusal:
          event.reason === undefined
            ? /* Another unit trying again says nothing about this one. */
              context.kernelRefusal?.actorId === event.actorId
              ? undefined
              : context.kernelRefusal
            : { actorId: event.actorId, reason: event.reason },
      }),
    },
    /* R3: the session knows hidden-and-idle, this owns the units. One loop. */
    parkRuntime: ({ context }, enq) => {
      for (const [path, unit] of context.geometryUnits) {
        if (!hasOperationDemand(context, path)) {
          enq.sendTo(unit, { type: 'parkRuntime' });
        }
      }
      return { context: { runtimeParked: true } };
    },
    resumeRuntime: ({ context }, enq) => {
      const resumed = { ...context, runtimeParked: false };
      for (const path of context.geometryUnits.keys()) {
        reconcileUnitRuntime({ previous: context, next: resumed, entryPath: path }, enq);
      }
      return { context: { runtimeParked: false } };
    },
  },
  /* Stop the stateful children; they'll be garbage collected. */
  exit: ({ context, children }, enq) => {
    for (const child of Object.values(children).filter((child) => isCadChild(child))) {
      enq(() => {
        disposeCadRuntime(child.getSnapshot().context);
      });
      enq.stop(child);
    }
    for (const session of context.viewRecordSessions.values()) {
      enq.stop(session);
    }
    for (const gfx of context.viewGraphics.values()) {
      enq.stop(gfx);
    }
    enq.stop(context.modelInteractionRef);
  },
  initial: 'checkEnvironment',
  states: {
    runtimeClosing: {
      on: { closeRuntime: {}, parkRuntime: {}, resumeRuntime: {} },
      invoke: {
        src: 'closeRuntimeActor',
        input: ({ self }) => ({
          units: Object.values(self.getSnapshot().children).filter((child) => isCadChild(child)),
        }),
        onDone: { target: 'runtimeClosed' },
        onError: ({ event }) => ({ target: 'runtimeCloseFailed', context: setError(event.error) }),
      },
    },
    runtimeClosed: { on: { closeRuntime: {}, parkRuntime: {}, resumeRuntime: {} } },
    runtimeCloseFailed: { on: { parkRuntime: {}, resumeRuntime: {} } },
    checkEnvironment: {
      always: ({ guards }) => {
        if (guards.isNotBrowser()) {
          return { target: 'ssr' };
        }
        return { target: guards.shouldAutoLoad() ? 'loading' : 'idle' };
      },
    },
    ssr: {
      type: 'final',
    },
    idle: {
      on: {
        reloadProject: { target: 'loading', context: { isLoading: true } },
        // Accept view graphics lifecycle events in idle state so they
        // are not silently dropped if a useEffect fires before loading starts.
        createViewGraphics,
        destroyViewGraphics,
      },
    },
    loading: {
      entry: () => ({ context: { error: undefined } }),
      on: {
        // Accept view graphics lifecycle events during loading.
        // These are safe to process in any state -- they only depend on
        // context.projectId (always set) and defaultGraphicsSettings, with
        // zero dependency on context.project or any loaded data.
        createViewGraphics,
        destroyViewGraphics,
        projectRetrieved: {
          context: ({ event }) => ({ project: event.project, manifestIssue: event.issue, isLoading: false }),
        },
      },
      invoke: {
        src: 'loadProjectActor',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: ({ context, self }, enq) => ({
          target: 'ready',
          context: context.shouldLoadModelOnStart
            ? loadMainModel(context, enq, { self, options: { pointAtExistingUnit: true } })
            : {},
        }),
        onError: ({ event }) => ({ target: 'error', context: setError(event.error) }),
      },
    },
    ready: {
      type: 'parallel',
      states: {
        operation: {
          initial: 'idle',
          states: {
            idle: {},
          },
          on: {
            reloadProject: { target: '#project.loading', context: { isLoading: true } },
            manifestIssueObserved: ({ event }) => ({ context: { manifestIssue: event.issue } }),
            updateName: ({ context, event }) =>
              shouldUpdateProjectName(context, event)
                ? {
                    context: withProject(context, (project) => {
                      project.name = event.name;
                    }),
                  }
                : undefined,
            updateDescription: ({ context, event }) =>
              isManifestWritable(context)
                ? {
                    context: withProject(context, (project) => {
                      project.description = event.description;
                    }),
                  }
                : undefined,
            updateTags: ({ context, event }) => {
              if (!isManifestWritable(context)) {
                return undefined;
              }
              // Deduplicate tags to ensure uniqueness
              const uniqueTags = [...new Set(event.tags)];
              return {
                context: withProject(context, (project) => {
                  project.tags = uniqueTags;
                  // Don't update updatedAt for tags - they're metadata
                }),
              };
            },
            loadModel: ({ context, self }, enq) => ({
              context: loadMainModel(context, enq, { self, options: { pointAtExistingUnit: false } }),
            }),
            setMainFile: ({ context, event }) =>
              isManifestWritable(context)
                ? {
                    context: withProject(context, (project) => {
                      // An entry-less project adopts its first main here (blueprint D3).
                      project.assets.main = { ...project.assets.main, entryPath: event.path };
                    }),
                  }
                : undefined,
            createGeometryUnit: ({ context, event, self }, enq) => {
              assertRootedPath(event.entryPath);

              // No-op if a geometry unit already exists for this entry path
              if (context.geometryUnits.has(event.entryPath)) {
                return {};
              }

              const geometryUnits = new Map(context.geometryUnits);
              const unit = spawnGeometryUnit(context, enq, {
                self,
                entryPath: event.entryPath,
                options: {
                  shouldInitializeKernelOnStart: true,
                  ...(event.operationTimeout === undefined ? {} : { operationTimeout: event.operationTimeout }),
                },
              });
              geometryUnits.set(event.entryPath, unit);
              return {
                context: {
                  geometryUnits,
                  ...(context.mainEntryPath === '' ? { mainEntryPath: event.entryPath } : {}),
                },
              };
            },
            setViewerGeometryDemand: ({ context, event }, enq) => {
              const previousPath = context.viewerGeometryDemand.get(event.viewId);
              const viewerGeometryDemand = new Map(context.viewerGeometryDemand);
              if (event.entryPath === undefined) {
                viewerGeometryDemand.delete(event.viewId);
              } else {
                assertRootedPath(event.entryPath);
                viewerGeometryDemand.set(event.viewId, event.entryPath);
              }
              const next = { ...context, viewerGeometryDemand };
              if (previousPath !== undefined && previousPath !== event.entryPath) {
                reconcileUnitRuntime({ previous: context, next, entryPath: previousPath }, enq);
              }
              if (event.entryPath !== undefined) {
                if (context.geometryUnits.has(event.entryPath)) {
                  reconcileUnitRuntime({ previous: context, next, entryPath: event.entryPath }, enq);
                } else {
                  enq.raise({ type: 'createGeometryUnit', entryPath: event.entryPath });
                }
              }
              return { context: { viewerGeometryDemand } };
            },
            claimGeometryUnit: ({ context, event }, enq) => {
              assertRootedPath(event.entryPath);
              const operationGeometryDemand = new Map(context.operationGeometryDemand);
              const previousPath = operationGeometryDemand.get(event.claimId);
              operationGeometryDemand.set(event.claimId, event.entryPath);
              const next = { ...context, operationGeometryDemand };
              if (previousPath !== undefined && previousPath !== event.entryPath) {
                reconcileUnitRuntime({ previous: context, next, entryPath: previousPath }, enq);
              }
              if (context.geometryUnits.has(event.entryPath)) {
                reconcileUnitRuntime({ previous: context, next, entryPath: event.entryPath }, enq);
              } else {
                enq.raise({
                  type: 'createGeometryUnit',
                  entryPath: event.entryPath,
                  operationTimeout: event.operationTimeout,
                });
              }
              return { context: { operationGeometryDemand } };
            },
            releaseGeometryUnit: ({ context, event }, enq) => {
              const entryPath = context.operationGeometryDemand.get(event.claimId);
              if (entryPath === undefined) {
                return {};
              }
              const operationGeometryDemand = new Map(context.operationGeometryDemand);
              operationGeometryDemand.delete(event.claimId);
              reconcileUnitRuntime(
                { previous: context, next: { ...context, operationGeometryDemand }, entryPath },
                enq,
              );
              return { context: { operationGeometryDemand } };
            },
            openInViewer: ({ event }, enq) => {
              assertRootedPath(event.entryPath);
              enq.raise({ type: 'createGeometryUnit', entryPath: event.entryPath });
              enq.emit({ type: 'viewerFileRequested', entryPath: event.entryPath });
              return {};
            },
            destroyGeometryUnit: ({ context, event }, enq) => {
              const unit = context.geometryUnits.get(event.entryPath);
              if (!unit) {
                return {};
              }

              enq.sendTo(unit, { type: 'closeRuntime' });
              return {
                context: {
                  ...withoutUnits(context, (entryPath) => entryPath === event.entryPath),
                  /* A still-open viewer may explicitly reopen this unit. */
                  viewerGeometryDemand: context.viewerGeometryDemand,
                  /* R4: a unit nobody holds cannot keep a row red. */
                  ...(context.kernelRefusal?.actorId === actorIdOf(unit) ? { kernelRefusal: undefined } : {}),
                },
              };
            },
            createViewGraphics,
            destroyViewGraphics,
            // ─────────────────────────────────────────────────────────────
            // Filesystem-participant transitions
            //
            // These are driven by `file-operation-participants.ts` in
            // response to {@link ContentChangeEvent}s, NOT by UI
            // components. They re-key every path-indexed map in the project
            // context so the open viewers + CAD actors +
            // main entry pointer all survive a rename / delete.
            // ─────────────────────────────────────────────────────────────
            fileMoved: ({ context, event }, enq) => {
              const { oldPath, newPath } = event;
              const matches = (path: string): boolean => path === oldPath || path.startsWith(`${oldPath}/`);
              const rewrite = (path: string): string =>
                path === oldPath
                  ? newPath
                  : path.startsWith(`${oldPath}/`)
                    ? `${newPath}${path.slice(oldPath.length)}`
                    : path;

              enq.sendTo(context.modelInteractionRef, { type: 'rekeySourceUnits', oldPath, newPath });

              // A moved unit renders its new path, so its geometry and parameter manifest follow the file.
              const geometryUnits = new Map(context.geometryUnits);
              let mutatedUnits = false;
              for (const [key, unit] of context.geometryUnits) {
                if (matches(key)) {
                  enq.sendTo(unit, { type: 'setEntryPath', entryPath: rewrite(key) });
                  geometryUnits.delete(key);
                  geometryUnits.set(rewrite(key), unit);
                  mutatedUnits = true;
                }
              }

              return {
                context: {
                  ...(mutatedUnits ? { geometryUnits } : {}),
                  viewerGeometryDemand: new Map(
                    [...context.viewerGeometryDemand].map(([viewId, entryPath]) => [viewId, rewrite(entryPath)]),
                  ),
                  operationGeometryDemand: new Map(
                    [...context.operationGeometryDemand].map(([claimId, entryPath]) => [claimId, rewrite(entryPath)]),
                  ),
                  ...(matches(context.mainEntryPath) ? { mainEntryPath: rewrite(context.mainEntryPath) } : {}),
                  // If the main file was renamed, persist its entry pointer.
                  // Recency is stamped separately by `projectFileActivity`, so this
                  // mechanical metadata rewrite does not decide project activity itself.
                  ...(matches(context.project?.assets.main?.entryPath ?? '')
                    ? withProject(context, (project) => {
                        if (project.assets.main) {
                          project.assets.main.entryPath = rewrite(project.assets.main.entryPath);
                        }
                      })
                    : {}),
                },
              };
            },
            fileDeleted: ({ context, event }, enq) => {
              const { path } = event;
              enq.sendTo(context.modelInteractionRef, { type: 'pruneSourceUnits', path });
              const unit = context.geometryUnits.get(path);
              if (unit) {
                enq.sendTo(unit, { type: 'closeRuntime' });
              }
              return { context: withoutUnits(context, (entryPath) => entryPath === path) };
            },
            directoryDeleted: ({ context, event }, enq) => {
              const { path } = event;
              enq.sendTo(context.modelInteractionRef, { type: 'pruneSourceUnits', path });
              const prefix = `${path}/`;
              const matches = (filePath: string): boolean => filePath === path || filePath.startsWith(prefix);

              for (const [key, unit] of context.geometryUnits) {
                if (matches(key)) {
                  enq.sendTo(unit, { type: 'closeRuntime' });
                }
              }
              return { context: withoutUnits(context, matches) };
            },
            projectFileActivity: ({ context, event }, enq) => {
              if (!context.project || !event.paths.some(isProjectContentActivityPath)) {
                return undefined;
              }
              enq.emit({ type: 'projectActivity' });
              return {};
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                flushNow: ({ context }) =>
                  context.error === undefined || !isManifestWritable(context) ? undefined : { target: 'writing' },
                updateName: ({ context, event }) =>
                  shouldUpdateProjectName(context, event) ? { target: 'writing' } : undefined,
                updateDescription: ({ context }) => (isManifestWritable(context) ? { target: 'writing' } : undefined),
                updateTags: ({ context }) => (isManifestWritable(context) ? { target: 'writing' } : undefined),
                setMainFile: ({ context }) => (isManifestWritable(context) ? { target: 'writing' } : undefined),
                repairManifest: ({ context }) => (isManifestRepairable(context) ? { target: 'repairing' } : undefined),
              },
            },
            pending: {
              after: {
                pendingToWriting: { target: 'writing' },
              },
              on: {
                updateName: ({ context, event }) =>
                  shouldUpdateProjectName(context, event) ? { target: 'pending', reenter: true } : undefined,
                updateDescription: ({ context }) =>
                  isManifestWritable(context) ? { target: 'pending', reenter: true } : undefined,
                updateTags: ({ context }) =>
                  isManifestWritable(context) ? { target: 'pending', reenter: true } : undefined,
                setMainFile: ({ context }) =>
                  isManifestWritable(context) ? { target: 'pending', reenter: true } : undefined,
                flushNow: { target: 'writing' },
              },
            },
            writing: {
              invoke: {
                src: 'writeProjectActor',
                input: ({ context }) => ({ project: context.project! }),
                onDone: ({ context }, enq) => {
                  enq.emit({ type: 'projectUpdated', project: context.project! });
                  return { target: 'idle', context: { error: undefined } };
                },
                onError: ({ event }) => ({ target: 'idle', context: setError(event.error) }),
              },
              on: {
                updateName: ({ context, event }) =>
                  shouldUpdateProjectName(context, event) ? { target: 'pending' } : undefined,
                updateDescription: ({ context }) => (isManifestWritable(context) ? { target: 'pending' } : undefined),
                updateTags: ({ context }) => (isManifestWritable(context) ? { target: 'pending' } : undefined),
                setMainFile: ({ context }) => (isManifestWritable(context) ? { target: 'pending' } : undefined),
              },
            },
            repairing: {
              invoke: {
                src: 'writeProjectActor',
                input: ({ context }) => ({ project: context.project!, repair: true }),
                onDone: ({ context }, enq) => {
                  enq.emit({ type: 'projectUpdated', project: context.project! });
                  return { target: 'idle', context: { manifestIssue: undefined, error: undefined } };
                },
                onError: ({ event }) => ({ target: 'idle', context: setError(event.error) }),
              },
            },
          },
        },
      },
    },
    error: {
      on: {
        reloadProject: { target: 'loading', context: { isLoading: true } },
      },
    },
  },
});

/** Close every project CAD owner after persistence, before its session stops. */
export const closeProjectRuntime = async (actor: ActorRefFrom<typeof projectMachine>): Promise<void> => {
  actor.send({ type: 'closeRuntime' });
  const snapshot = await waitFor(
    actor,
    (state) => state.matches('runtimeClosed') || state.matches('runtimeCloseFailed'),
  );
  if (snapshot.matches('runtimeCloseFailed')) {
    const error: unknown = snapshot.context.error;
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Project runtime shutdown failed');
  }
};

/**
 * Why this project has no kernel, or `undefined` when it has one (R4).
 *
 * @param snapshot - The project machine's snapshot.
 * @returns The reason a unit reported, or `undefined`.
 * @public
 */
export const selectProjectKernelRefusal = (snapshot: SnapshotFrom<typeof projectMachine>): string | undefined =>
  snapshot.context.kernelRefusal?.reason;
