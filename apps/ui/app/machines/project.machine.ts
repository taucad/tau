import { setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, EnqueueObject, SnapshotFrom, SystemRegistry } from 'xstate';
import { produce } from 'immer';
import type { ProjectManifest } from '@taucad/types';
import { assertRootedPath, normalizePath } from '@taucad/utils/path';
import { classify } from '@taucad/filesystem/path-registry';
import { isBrowser } from '#constants/browser.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { GraphicsOwnedSettings, GraphicsViewSettings } from '#constants/editor.constants.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { actorIdOf, eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { cadMachine } from '#machines/cad.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { logMachine } from '#machines/logs.machine.js';
import { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';

/**
 * Project Machine Context
 */
export type ProjectContext = {
  projectId: string;
  project: ProjectManifest | undefined;
  error: Error | undefined;
  isLoading: boolean;
  shouldLoadModelOnStart: boolean;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  fileSystemRoot: string;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  /** Project-scoped model appearance shared by every viewer of the same geometry unit. */
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** Geometry unit file paths that currently have geometry and at least one export route. */
  exportableGeometryUnitPaths: Set<string>;
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
};

export type ProjectLoadInput = { readonly projectId: string };

export type ProjectRetrievedEvent = {
  readonly type: 'projectRetrieved';
  readonly project: ProjectManifest;
};

// Define the actors that the machine can invoke
const loadProjectActor = fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.loadProjectActor` option to the project machine.',
  );
});

const writeProjectActor = fromSafeAsync<void, { project: ProjectManifest }>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.writeProjectActor` option to the project machine.',
  );
});

const projectActors = {
  loadProjectActor,
  writeProjectActor,
  graphics: graphicsMachine,
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
 * The path registry answers it: authored bytes are content, records, caches
 * and the control plane are not. `tau.json` is the one exception — it is
 * authored, but it is the project's metadata, and a rename or a description
 * edit is not work on the design.
 *
 * @param projectRelativePath - Path relative to the project root.
 * @returns `true` when the path is authored project content.
 */
export function isProjectContentActivityPath(projectRelativePath: string): boolean {
  const normalized = normalizePath(projectRelativePath).replace(/^\/+/, '');
  if (normalized === '' || normalized === '.' || normalized === 'tau.json') {
    return false;
  }

  return classify(normalized).class === 'authored';
}

/**
 * Project Machine Events
 */
type ProjectEventInternal =
  | { type: 'reloadProject' }
  | { type: 'updateName'; name: string }
  | { type: 'updateDescription'; description: string }
  | { type: 'updateTags'; tags: string[] }
  | { type: 'loadModel' }
  | { type: 'setMainFile'; path: string }
  | { type: 'createGeometryUnit'; entryPath: string; renderTimeout?: number }
  | {
      type: 'geometryUnit.exportAvailabilityChanged';
      actorId: string;
      available: boolean;
    }
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

type ProjectEvent = ProjectEventInternal | ProjectRetrievedEvent;

/**
 * Project Machine Emitted Events
 */
type ProjectEmitted =
  | { type: 'error'; error: Error }
  | { type: 'projectUpdated'; project: ProjectManifest }
  | { type: 'projectActivity' }
  | { type: 'viewerFileRequested'; entryPath: string };

type ProjectEnqueue = EnqueueObject<ProjectEvent, ProjectEmitted, SystemRegistry, typeof projectActors>;
type ProjectPatch = Partial<ProjectContext>;
type ProjectArgs<TType extends ProjectEvent['type']> = Readonly<{
  context: ProjectContext;
  event: Extract<ProjectEvent, { type: TType }>;
  self: AnyActorRef;
}>;
type CadUnitRef = ActorRefFrom<typeof cadMachine>;

const setError = (error: unknown): ProjectPatch => ({
  error: error instanceof Error ? error : new Error('Unknown error'),
  isLoading: false,
});

const shouldUpdateProjectName = (context: ProjectContext, event: Extract<ProjectEvent, { type: 'updateName' }>) =>
  Boolean(context.project && context.project.name !== event.name);

/** Rewrite the loaded manifest, or leave context alone when no project is loaded. */
const withProject = (context: ProjectContext, recipe: (project: ProjectManifest) => void): ProjectPatch =>
  context.project ? { project: produce(context.project, recipe) } : {};

/**
 * Spawn one headless CAD unit for an entry and ask it to render that entry.
 *
 * The unit's id is fixed at spawn; a later rename re-keys the map but not the
 * id, which is why lookups by id read the ref rather than recompute it.
 */
const spawnGeometryUnit = (
  context: ProjectContext,
  self: AnyActorRef,
  enq: ProjectEnqueue,
  entryPath: string,
  options: Readonly<{ shouldInitializeKernelOnStart: boolean; renderTimeout?: number }>,
): CadUnitRef => {
  const cadUnit = enq.spawn('cad', {
    id: `cad-${context.projectId}-${entryPath.replaceAll('/', '-')}`,
    input: {
      shouldInitializeKernelOnStart: options.shouldInitializeKernelOnStart,
      parentRef: self,
      logRef: context.logRef,
      fileManagerRef: context.fileManagerRef,
      kernelOptionsFactory: context.kernelOptionsFactory,
      fileSystemRoot: context.fileSystemRoot,
      ...(options.renderTimeout === undefined ? {} : { renderTimeout: options.renderTimeout }),
    },
  });
  enq.sendTo(cadUnit, { type: 'initializeModel', entryPath });
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
  self: AnyActorRef,
  enq: ProjectEnqueue,
  options: Readonly<{ pointAtExistingUnit: boolean }>,
): ProjectPatch => {
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
    spawnGeometryUnit(context, self, enq, mainFile, { shouldInitializeKernelOnStart: false }),
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
    sectionDisplay: settings.sectionDisplay,
    graphicsBackend: settings.graphicsBackend ?? 'webgl',
  };

  const gfx = enq.spawn('graphics', {
    id: `graphics-view-${context.projectId}-${event.viewId}`,
    input: {
      ...graphicsSeed,
      measureSnapDistance: 40,
      modelInteractionRef: context.modelInteractionRef,
    },
  });

  const viewGraphics = new Map(context.viewGraphics);
  viewGraphics.set(event.viewId, gfx);
  return { context: { viewGraphics } };
};

const destroyViewGraphics = ({ context, event }: ProjectArgs<'destroyViewGraphics'>, enq: ProjectEnqueue) => {
  const gfx = context.viewGraphics.get(event.viewId);
  if (!gfx) {
    return {};
  }
  enq.stop(gfx);
  const viewGraphics = new Map(context.viewGraphics);
  viewGraphics.delete(event.viewId);
  return { context: { viewGraphics } };
};

/** Drop the units a deletion matched, their export routes and a main pointer into them. */
const withoutUnits = (context: ProjectContext, matches: (entryPath: string) => boolean): ProjectPatch => {
  const geometryUnits = new Map(context.geometryUnits);
  for (const key of context.geometryUnits.keys()) {
    if (matches(key)) {
      geometryUnits.delete(key);
    }
  }
  const exportableGeometryUnitPaths = new Set(context.exportableGeometryUnitPaths);
  for (const key of context.exportableGeometryUnitPaths) {
    if (matches(key)) {
      exportableGeometryUnitPaths.delete(key);
    }
  }
  return {
    geometryUnits,
    exportableGeometryUnitPaths,
    ...(matches(context.mainEntryPath) ? { mainEntryPath: '' } : {}),
  };
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
    const { projectId, shouldLoadModelOnStart = true, fileManagerRef, fileSystemRoot, kernelOptionsFactory } = input;

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
    const exportableGeometryUnitPaths = new Set<string>();

    // View graphics are created dynamically by Dockview viewer panels.
    const viewGraphics = new Map<string, ActorRefFrom<typeof graphicsMachine>>();

    return {
      projectId,
      project: undefined,
      error: undefined,
      isLoading: true,
      shouldLoadModelOnStart,
      kernelOptionsFactory,
      fileManagerRef,
      fileSystemRoot,
      viewGraphics,
      modelInteractionRef,
      geometryUnits,
      exportableGeometryUnitPaths,
      kernelRefusal: undefined,
      mainEntryPath: '',
      logRef,
    };
  },
  on: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- XState event name
    'geometryUnit.exportAvailabilityChanged': ({ context, event }) => {
      let entryPath: string | undefined;
      for (const [candidateEntryPath, actor] of context.geometryUnits) {
        if (actorIdOf(actor) === event.actorId) {
          entryPath = candidateEntryPath;
          break;
        }
      }

      if (!entryPath || context.exportableGeometryUnitPaths.has(entryPath) === event.available) {
        return {};
      }

      const exportableGeometryUnitPaths = new Set(context.exportableGeometryUnitPaths);
      if (event.available) {
        exportableGeometryUnitPaths.add(entryPath);
      } else {
        exportableGeometryUnitPaths.delete(entryPath);
      }
      return { context: { exportableGeometryUnitPaths } };
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
      for (const unit of context.geometryUnits.values()) {
        enq.sendTo(unit, { type: 'parkRuntime' });
      }
      return {};
    },
    resumeRuntime: ({ context }, enq) => {
      for (const unit of context.geometryUnits.values()) {
        enq.sendTo(unit, { type: 'resumeRuntime' });
      }
      return {};
    },
  },
  /* Stop the stateful children; they'll be garbage collected. */
  exit: ({ context }, enq) => {
    for (const unit of context.geometryUnits.values()) {
      enq.stop(unit);
    }
    for (const gfx of context.viewGraphics.values()) {
      enq.stop(gfx);
    }
    enq.stop(context.modelInteractionRef);
  },
  initial: 'checkEnvironment',
  states: {
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
        projectRetrieved: { context: ({ event }) => ({ project: event.project, isLoading: false }) },
      },
      invoke: {
        src: 'loadProjectActor',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: ({ context, self }, enq) => ({
          target: 'ready',
          context: context.shouldLoadModelOnStart
            ? loadMainModel(context, self, enq, { pointAtExistingUnit: true })
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
            updateName: ({ context, event }) =>
              shouldUpdateProjectName(context, event)
                ? {
                    context: withProject(context, (project) => {
                      project.name = event.name;
                    }),
                  }
                : undefined,
            updateDescription: ({ context, event }) => ({
              context: withProject(context, (project) => {
                project.description = event.description;
              }),
            }),
            updateTags: ({ context, event }) => {
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
              context: loadMainModel(context, self, enq, { pointAtExistingUnit: false }),
            }),
            setMainFile: ({ context, event }) => ({
              context: withProject(context, (project) => {
                project.assets.main.entryPath = event.path;
              }),
            }),
            createGeometryUnit: ({ context, event, self }, enq) => {
              assertRootedPath(event.entryPath);

              // No-op if a geometry unit already exists for this entry path
              if (context.geometryUnits.has(event.entryPath)) {
                return {};
              }

              const geometryUnits = new Map(context.geometryUnits);
              geometryUnits.set(
                event.entryPath,
                spawnGeometryUnit(context, self, enq, event.entryPath, {
                  shouldInitializeKernelOnStart: true,
                  ...(event.renderTimeout === undefined ? {} : { renderTimeout: event.renderTimeout }),
                }),
              );
              return {
                context: {
                  geometryUnits,
                  ...(context.mainEntryPath === '' ? { mainEntryPath: event.entryPath } : {}),
                },
              };
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

              enq.stop(unit);
              return {
                context: {
                  ...withoutUnits(context, (entryPath) => entryPath === event.entryPath),
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

              const exportableGeometryUnitPaths = new Set(context.exportableGeometryUnitPaths);
              let mutatedExportablePaths = false;
              for (const key of context.exportableGeometryUnitPaths) {
                if (matches(key)) {
                  exportableGeometryUnitPaths.delete(key);
                  exportableGeometryUnitPaths.add(rewrite(key));
                  mutatedExportablePaths = true;
                }
              }

              return {
                context: {
                  ...(mutatedUnits ? { geometryUnits } : {}),
                  ...(mutatedExportablePaths ? { exportableGeometryUnitPaths } : {}),
                  ...(matches(context.mainEntryPath) ? { mainEntryPath: rewrite(context.mainEntryPath) } : {}),
                  // If the main file was renamed, persist its entry pointer.
                  // Recency is stamped separately by `projectFileActivity`, so this
                  // mechanical metadata rewrite does not decide project activity itself.
                  ...(matches(context.project?.assets.main.entryPath ?? '')
                    ? withProject(context, (project) => {
                        project.assets.main.entryPath = rewrite(project.assets.main.entryPath);
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
                enq.stop(unit);
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
                  enq.stop(unit);
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
                flushNow: ({ context }) => (context.error === undefined ? undefined : { target: 'writing' }),
                updateName: ({ context, event }) =>
                  shouldUpdateProjectName(context, event) ? { target: 'writing' } : undefined,
                updateDescription: { target: 'writing' },
                updateTags: { target: 'writing' },
                setMainFile: { target: 'writing' },
              },
            },
            pending: {
              after: {
                pendingToWriting: { target: 'writing' },
              },
              on: {
                updateName: ({ context, event }) =>
                  shouldUpdateProjectName(context, event) ? { target: 'pending', reenter: true } : undefined,
                updateDescription: { target: 'pending', reenter: true },
                updateTags: { target: 'pending', reenter: true },
                setMainFile: { target: 'pending', reenter: true },
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
                updateDescription: { target: 'pending' },
                updateTags: { target: 'pending' },
                setMainFile: { target: 'pending' },
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

/**
 * Why this project has no kernel, or `undefined` when it has one (R4).
 *
 * @param snapshot - The project machine's snapshot.
 * @returns The reason a unit reported, or `undefined`.
 * @public
 */
export const selectProjectKernelRefusal = (snapshot: SnapshotFrom<typeof projectMachine>): string | undefined =>
  snapshot.context.kernelRefusal?.reason;
