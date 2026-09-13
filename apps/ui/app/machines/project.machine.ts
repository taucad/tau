import { assign, assertEvent, setup, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom, AnyStateMachine } from 'xstate';
import { produce } from 'immer';
import type { FileParameterEntry, Project } from '@taucad/types';
import { isBrowser } from '#constants/browser.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { cadMachine } from '#machines/cad.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { logMachine } from '#machines/logs.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import {
  updateGroupValues,
  createGroup,
  createDefaultEntry,
  deleteGroup,
  renameGroup,
  switchActiveGroup,
} from '#utils/parameter-config.utils.js';

/**
 * Project Machine Context
 */
export type ProjectContext = {
  projectId: string;
  project: Project | undefined;
  error: Error | undefined;
  isLoading: boolean;
  shouldLoadModelOnStart: boolean;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  /** Dynamic geometry units keyed by entry file path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** The main entry file path from project.assets.mechanical.main. Set after project loads. */
  mainEntryFile: string;
  logRef: ActorRefFrom<typeof logMachine>;
  /** Per-geometry unit parameter entries, keyed by entry file path. */
  parameterEntries: Map<string, FileParameterEntry>;
  /** Geometry unit file paths whose parameter entries need writing to disk. */
  dirtyParameterPaths: Set<string>;
};

/**
 * Project Machine Input
 */
type ProjectInput = {
  projectId: string;
  shouldLoadModelOnStart?: boolean;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  kernelOptionsFactory: LazyKernelOptionsFactory;
};

// Define the actors that the machine can invoke
const loadProjectActor = fromSafeAsync<
  { type: 'projectRetrieved'; project: Project; parameterEntries: Map<string, FileParameterEntry> },
  { projectId: string }
>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.loadProjectActor` option to the project machine.',
  );
});

const writeProjectActor = fromSafeAsync<void, { project: Project }>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.writeProjectActor` option to the project machine.',
  );
});

const writeParameterFileActor = fromSafeAsync<void, { projectId: string; filePath: string; entry: FileParameterEntry }>(
  async () => {
    throw new Error(
      'Not implemented. Please supply the `provide.actors.writeParameterFileActor` option to the project machine.',
    );
  },
);

const projectActors = {
  loadProjectActor,
  writeProjectActor,
  writeParameterFileActor,
  graphics: graphicsMachine,
  // Having the cadMachine typed results in:
  // `The inferred type of this node exceeds the maximum length the compiler will serialize`.
  // We need to dig into this and possibly simplify the external type inferred from the machine.
  //
  // This has no impact on machine consumer typings, only to this machine where
  // some types will need to be manually asserted (Eslint will report those places).
  cad: cadMachine as AnyStateMachine,
  logs: logMachine,
} as const;

/**
 * Project Machine Events
 */
type ProjectEventInternal =
  | { type: 'loadProject'; projectId: string }
  | { type: 'updateName'; name: string }
  | { type: 'updateDescription'; description: string }
  | { type: 'updateTags'; tags: string[] }
  | { type: 'updateThumbnail'; thumbnail: string }
  | {
      type: 'updateCodeParameters';
      files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
      parameters: Record<string, unknown>;
    }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setGeometryUnitParameters'; filePath: string; parameters: Record<string, unknown> }
  | { type: 'parameterFileChanged'; filePath: string; entry: FileParameterEntry }
  | { type: 'switchParameterGroup'; filePath: string; groupName: string }
  | { type: 'createParameterGroup'; filePath: string; groupName: string; values?: Record<string, unknown> }
  | { type: 'deleteParameterGroup'; filePath: string; groupName: string }
  | { type: 'renameParameterGroup'; filePath: string; oldName: string; newName: string }
  | { type: 'loadModel' }
  | { type: 'setMainFile'; path: string }
  | { type: 'createGeometryUnit'; entryFile: string }
  | { type: 'openInViewer'; entryFile: string }
  | { type: 'destroyGeometryUnit'; entryFile: string }
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
  | { type: 'flushNow' };

type ProjectEvent =
  | ProjectEventInternal
  | { type: 'projectRetrieved'; project: Project; parameterEntries: Map<string, FileParameterEntry> };

/**
 * Project Machine Emitted Events
 */
type ProjectEmitted =
  | { type: 'projectLoaded'; project: Project }
  | { type: 'error'; error: Error }
  | { type: 'projectUpdated'; project: Project }
  | { type: 'viewerFileRequested'; entryFile: string };

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
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ProjectContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ProjectEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ProjectEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ProjectInput,
  },
  actors: projectActors,
  actions: {
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }

        return new Error('Unknown error');
      },
      isLoading: false,
    }),
    clearError: assign({
      error: undefined,
    }),
    setLoading: assign({
      isLoading: true,
    }),
    clearLoading: assign({
      isLoading: false,
    }),
    updateProjectId: assign({
      projectId({ event }) {
        assertEvent(event, 'loadProject');
        return event.projectId;
      },
    }),
    setProject: assign({
      project({ event }) {
        assertEvent(event, 'projectRetrieved');
        return event.project;
      },
      parameterEntries({ event }) {
        assertEvent(event, 'projectRetrieved');
        return event.parameterEntries;
      },
      isLoading: false,
    }),
    clearProject: assign({
      project: undefined,
    }),
    updateName: assign(({ context, event }) => {
      assertEvent(event, 'updateName');
      if (!context.project) {
        return {};
      }

      return produce(context, (draft) => {
        draft.project!.name = event.name;
        draft.project!.updatedAt = Date.now();
      });
    }),
    updateDescription: assign(({ context, event }) => {
      assertEvent(event, 'updateDescription');
      if (!context.project) {
        return {};
      }

      return produce(context, (draft) => {
        draft.project!.description = event.description;
        draft.project!.updatedAt = Date.now();
      });
    }),
    updateTags: assign(({ context, event }) => {
      assertEvent(event, 'updateTags');
      if (!context.project) {
        return {};
      }

      // Deduplicate tags to ensure uniqueness
      const uniqueTags = [...new Set(event.tags)];

      return produce(context, (draft) => {
        draft.project!.tags = uniqueTags;
        // Don't update updatedAt for tags - they're metadata
      });
    }),
    updateThumbnail: assign(({ context, event }) => {
      assertEvent(event, 'updateThumbnail');
      if (!context.project) {
        return {};
      }

      return produce(context, (draft) => {
        draft.project!.thumbnail = event.thumbnail;
        // Don't update updatedAt for thumbnails - they're metadata
      });
    }),
    updateCodeParametersInContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'updateCodeParameters');

      if (!context.project?.assets.mechanical) {
        return;
      }

      // Update project in context using Immer
      enqueue.assign(({ context }) =>
        produce(context, (draft) => {
          if (draft.project?.assets.mechanical) {
            draft.project.assets.mechanical.parameters = event.parameters;
            draft.project.updatedAt = Date.now();
          }
        }),
      );
    }),
    setParametersInContext: assign(({ context, event }) => {
      assertEvent(event, 'setParameters');
      const filePath = context.mainEntryFile;
      const entry = context.parameterEntries.get(filePath) ?? createDefaultEntry();
      const { activeGroup } = entry;
      const updated = updateGroupValues(entry, { groupName: activeGroup, values: event.parameters });
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(filePath, updated);
      return { parameterEntries: newEntries };
    }),
    setGeometryUnitParametersInContext: assign(({ context, event }) => {
      assertEvent(event, 'setGeometryUnitParameters');
      const entry = context.parameterEntries.get(event.filePath) ?? createDefaultEntry();
      const { activeGroup } = entry;
      const updated = updateGroupValues(entry, { groupName: activeGroup, values: event.parameters });
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, updated);
      return { parameterEntries: newEntries };
    }),
    handleParameterFileChanged: assign(({ context, event }) => {
      assertEvent(event, 'parameterFileChanged');
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, event.entry);
      return { parameterEntries: newEntries };
    }),
    handleSwitchParameterGroup: assign(({ context, event }) => {
      assertEvent(event, 'switchParameterGroup');
      const entry = context.parameterEntries.get(event.filePath) ?? createDefaultEntry();
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, switchActiveGroup(entry, event.groupName));
      return { parameterEntries: newEntries };
    }),
    handleCreateParameterGroup: assign(({ context, event }) => {
      assertEvent(event, 'createParameterGroup');
      const entry = context.parameterEntries.get(event.filePath) ?? createDefaultEntry();
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, createGroup(entry, { groupName: event.groupName, values: event.values ?? {} }));
      return { parameterEntries: newEntries };
    }),
    handleDeleteParameterGroup: assign(({ context, event }) => {
      assertEvent(event, 'deleteParameterGroup');
      const entry = context.parameterEntries.get(event.filePath) ?? createDefaultEntry();
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, deleteGroup(entry, event.groupName));
      return { parameterEntries: newEntries };
    }),
    handleRenameParameterGroup: assign(({ context, event }) => {
      assertEvent(event, 'renameParameterGroup');
      const entry = context.parameterEntries.get(event.filePath) ?? createDefaultEntry();
      const newEntries = new Map(context.parameterEntries);
      newEntries.set(event.filePath, renameGroup(entry, { oldName: event.oldName, newName: event.newName }));
      return { parameterEntries: newEntries };
    }),
    setMainFileInContext: assign(({ context, event }) => {
      assertEvent(event, 'setMainFile');
      if (!context.project?.assets.mechanical) {
        return {};
      }

      return produce(context, (draft) => {
        if (draft.project?.assets.mechanical) {
          draft.project.assets.mechanical.main = event.path;
          draft.project.updatedAt = Date.now();
        }
      });
    }),
    stopStatefulActors: enqueueActions(({ enqueue, context }) => {
      // Stop the old stateful actors (they'll be garbage collected)

      // Stop all geometry units
      for (const unit of context.geometryUnits.values()) {
        enqueue.stopChild(unit);
      }

      // Stop all view graphics machines
      for (const gfx of context.viewGraphics.values()) {
        enqueue.stopChild(gfx);
      }
    }),
    respawnStatefulActors: assign({
      // Reset geometry units - the primary one will be created during initializeKernelIfNeeded after project load
      geometryUnits: () => new Map(),
      mainEntryFile: () => '',
      // Reset view graphics - they'll be created by Dockview viewer panels
      viewGraphics: () => new Map(),
    }),
    initializeKernelIfNeeded: enqueueActions(({ enqueue, context }) => {
      if (!context.shouldLoadModelOnStart) {
        return;
      }

      const mechanicalAsset = context.project?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      const mainFile = mechanicalAsset.main;

      if (context.geometryUnits.has(mainFile)) {
        enqueue.assign({ mainEntryFile: mainFile });
        const existingUnit = context.geometryUnits.get(mainFile)!;
        enqueue.sendTo(existingUnit, {
          type: 'initializeModel',
          file: {
            path: `/projects/${context.projectId}`,
            filename: mainFile,
          },
        });
      } else {
        enqueue.assign(({ spawn, context }) => {
          const cadUnit = spawn('cad', {
            id: `cad-${context.projectId}-${mainFile.replaceAll('/', '-')}`,
            input: {
              shouldInitializeKernelOnStart: false,
              logRef: context.logRef,
              fileManagerRef: context.fileManagerRef,
              kernelOptionsFactory: context.kernelOptionsFactory,
            },
          });

          cadUnit.send({
            type: 'initializeModel',
            file: {
              path: `/projects/${context.projectId}`,
              filename: mainFile,
            },
          });

          const newUnits = new Map(context.geometryUnits);
          newUnits.set(mainFile, cadUnit as ActorRefFrom<typeof cadMachine>);
          return { geometryUnits: newUnits, mainEntryFile: mainFile };
        });
      }
    }),
    loadModel: enqueueActions(({ enqueue, context }) => {
      const mechanicalAsset = context.project?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      const mainFile = mechanicalAsset.main;

      const mainUnit = context.geometryUnits.get(mainFile);
      if (mainUnit) {
        enqueue.sendTo(mainUnit, {
          type: 'initializeModel',
          file: {
            path: `/projects/${context.projectId}`,
            filename: mainFile,
          },
        });
      } else {
        enqueue.assign(({ spawn, context }) => {
          const cadUnit = spawn('cad', {
            id: `cad-${context.projectId}-${mainFile.replaceAll('/', '-')}`,
            input: {
              shouldInitializeKernelOnStart: false,
              logRef: context.logRef,
              fileManagerRef: context.fileManagerRef,
              kernelOptionsFactory: context.kernelOptionsFactory,
            },
          });

          cadUnit.send({
            type: 'initializeModel',
            file: {
              path: `/projects/${context.projectId}`,
              filename: mainFile,
            },
          });

          const newUnits = new Map(context.geometryUnits);
          newUnits.set(mainFile, cadUnit as ActorRefFrom<typeof cadMachine>);
          return { geometryUnits: newUnits, mainEntryFile: mainFile };
        });
      }
    }),
    createGeometryUnit: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'createGeometryUnit');

      // No-op if a geometry unit already exists for this entry file
      if (context.geometryUnits.has(event.entryFile)) {
        return;
      }

      // Spawn is only available inside assign callbacks in XState v5.
      enqueue.assign(({ spawn, context }) => {
        const cadUnit = spawn('cad', {
          id: `cad-${context.projectId}-${event.entryFile.replaceAll('/', '-')}`,
          input: {
            shouldInitializeKernelOnStart: true,
            logRef: context.logRef,
            fileManagerRef: context.fileManagerRef,
            kernelOptionsFactory: context.kernelOptionsFactory,
          },
        });

        cadUnit.send({
          type: 'initializeModel',
          file: {
            path: `/projects/${context.projectId}`,
            filename: event.entryFile,
          },
        });

        const newUnits = new Map(context.geometryUnits);
        newUnits.set(event.entryFile, cadUnit as ActorRefFrom<typeof cadMachine>);
        return {
          geometryUnits: newUnits,
          ...(context.mainEntryFile === '' ? { mainEntryFile: event.entryFile } : {}),
        };
      });
    }),
    openInViewer: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'openInViewer');
      enqueue.raise({
        type: 'createGeometryUnit',
        entryFile: event.entryFile,
      });
      enqueue.emit({ type: 'viewerFileRequested', entryFile: event.entryFile });
    }),
    destroyGeometryUnit: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'destroyGeometryUnit');

      const unit = context.geometryUnits.get(event.entryFile);
      if (!unit) {
        return;
      }

      enqueue.stopChild(unit);
      enqueue.assign(({ context }) => {
        const newUnits = new Map(context.geometryUnits);
        newUnits.delete(event.entryFile);
        return {
          geometryUnits: newUnits,
          ...(context.mainEntryFile === event.entryFile ? { mainEntryFile: '' } : {}),
        };
      });
    }),
    // ─────────────────────────────────────────────────────────────
    // Filesystem-participant actions
    //
    // These actions are invoked by `file-operation-participants.ts`
    // in response to {@link ContentChangeEvent}s, NOT by UI
    // components. They re-key every path-indexed map in the project
    // context so the open viewers + CAD actors + parameter entries +
    // main entry pointer all survive a rename / delete.
    // ─────────────────────────────────────────────────────────────
    applyFileMoved: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'fileMoved');
      const { oldPath, newPath } = event;
      const matches = (path: string): boolean => path === oldPath || path.startsWith(`${oldPath}/`);
      const rewrite = (path: string): string =>
        path === oldPath ? newPath : path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : path;

      enqueue.assign(({ context }) => {
        // parameterEntries: Map<filePath, entry>
        const newEntries = new Map(context.parameterEntries);
        let mutatedEntries = false;
        for (const [key, value] of context.parameterEntries) {
          if (matches(key)) {
            newEntries.delete(key);
            newEntries.set(rewrite(key), value);
            mutatedEntries = true;
          }
        }

        // geometryUnits: Map<entryFile, ActorRef>
        const newUnits = new Map(context.geometryUnits);
        let mutatedUnits = false;
        for (const [key, value] of context.geometryUnits) {
          if (matches(key)) {
            newUnits.delete(key);
            newUnits.set(rewrite(key), value);
            mutatedUnits = true;
          }
        }

        const next: Partial<ProjectContext> = {};
        if (mutatedEntries) {
          next.parameterEntries = newEntries;
        }
        if (mutatedUnits) {
          next.geometryUnits = newUnits;
        }
        if (matches(context.mainEntryFile)) {
          next.mainEntryFile = rewrite(context.mainEntryFile);
        }
        return next;
      });

      // If the mechanical main file was renamed, persist the updated
      // `assets.mechanical.main` pointer so reload picks the new path.
      if (matches(context.project?.assets.mechanical?.main ?? '')) {
        enqueue.assign(({ context }) =>
          produce(context, (draft) => {
            if (draft.project?.assets.mechanical) {
              draft.project.assets.mechanical.main = rewrite(draft.project.assets.mechanical.main);
              draft.project.updatedAt = Date.now();
            }
          }),
        );
      }
    }),
    applyFileDeleted: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'fileDeleted');
      const { path } = event;
      const unit = context.geometryUnits.get(path);
      if (unit) {
        enqueue.stopChild(unit);
      }
      enqueue.assign(({ context }) => {
        const newUnits = new Map(context.geometryUnits);
        newUnits.delete(path);
        const newEntries = new Map(context.parameterEntries);
        newEntries.delete(path);
        return {
          geometryUnits: newUnits,
          parameterEntries: newEntries,
          ...(context.mainEntryFile === path ? { mainEntryFile: '' } : {}),
        };
      });
    }),
    applyDirectoryDeleted: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'directoryDeleted');
      const { path } = event;
      const prefix = `${path}/`;
      const matches = (filePath: string): boolean => filePath === path || filePath.startsWith(prefix);

      for (const [key, unit] of context.geometryUnits) {
        if (matches(key)) {
          enqueue.stopChild(unit);
        }
      }
      enqueue.assign(({ context }) => {
        const newUnits = new Map(context.geometryUnits);
        const newEntries = new Map(context.parameterEntries);
        for (const key of context.geometryUnits.keys()) {
          if (matches(key)) {
            newUnits.delete(key);
          }
        }
        for (const key of context.parameterEntries.keys()) {
          if (matches(key)) {
            newEntries.delete(key);
          }
        }
        return {
          geometryUnits: newUnits,
          parameterEntries: newEntries,
          ...(matches(context.mainEntryFile) ? { mainEntryFile: '' } : {}),
        };
      });
    }),
    createViewGraphics: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'createViewGraphics');

      // No-op if a graphics actor already exists for this view
      if (context.viewGraphics.has(event.viewId)) {
        return;
      }

      const settings = event.settings ?? defaultGraphicsSettings;

      enqueue.assign(({ spawn, context }) => {
        const gfx = spawn('graphics', {
          id: `graphics-view-${context.projectId}-${event.viewId}`,
          input: {
            defaultCameraFovAngle: settings.cameraFovAngle,
            measureSnapDistance: 40,
            enableSurfaces: settings.enableSurfaces,
            enableLines: settings.enableLines,
            enableGizmo: settings.enableGizmo,
            enableGrid: settings.enableGrid,
            enableAxes: settings.enableAxes,
            enableMatcap: settings.enableMatcap,
            enablePostProcessing: settings.enablePostProcessing,
            upDirection: settings.upDirection,
            environmentPreset: settings.environmentPreset,
            pinnedMeasurements: settings.pinnedMeasurements,
            graphicsBackendPreference: settings.graphicsBackend ?? 'webgl',
          },
        });

        const newMap = new Map(context.viewGraphics);
        newMap.set(event.viewId, gfx);
        return { viewGraphics: newMap };
      });
    }),
    destroyViewGraphics: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'destroyViewGraphics');

      const gfx = context.viewGraphics.get(event.viewId);
      if (!gfx) {
        return;
      }

      enqueue.stopChild(gfx);
      enqueue.assign(({ context }) => {
        const newMap = new Map(context.viewGraphics);
        newMap.delete(event.viewId);
        return { viewGraphics: newMap };
      });
    }),
    emitProjectLoaded: emit(({ event }) => {
      assertEvent(event, 'projectRetrieved');
      return {
        type: 'projectLoaded',
        project: event.project,
      };
    }),
    addDirtyParameterPath: assign(({ context, event }) => {
      const filePath = 'filePath' in event ? (event as { filePath: string }).filePath : context.mainEntryFile;
      const next = new Set(context.dirtyParameterPaths);
      next.add(filePath);
      return { dirtyParameterPaths: next };
    }),
    removeWrittenParameterPath: assign(({ context }) => {
      const next = new Set(context.dirtyParameterPaths);
      const [first] = next;
      if (first !== undefined) {
        next.delete(first);
      }
      return { dirtyParameterPaths: next };
    }),
    emitProjectUpdated: emit(({ context }) => ({
      type: 'projectUpdated',
      project: context.project!,
    })),
  },
  guards: {
    isNotBrowser() {
      return !isBrowser;
    },
    shouldAutoLoad() {
      return isBrowser;
    },
    isProjectIdChanging({ context, event }) {
      assertEvent(event, 'loadProject');
      return context.projectId !== event.projectId;
    },
    hasParameterEntries({ context }) {
      return context.parameterEntries.size > 0;
    },
    hasRemainingDirtyPaths({ context }) {
      return context.dirtyParameterPaths.size > 1;
    },
  },
  delays: {
    /** Zero-delay batching step so `pending` can handle `flushNow` before transitioning to `writing`. */
    pendingToWriting: 0,
  },
}).createMachine({
  id: 'project',
  context({ input, spawn }) {
    const { projectId, shouldLoadModelOnStart = true, fileManagerRef, kernelOptionsFactory } = input;

    const logRef = spawn('logs', {
      id: `log-${projectId}`,
    });

    // Compilation units are created dynamically after project loads (when we know the main file).
    // The primary geometry unit is created by initializeKernelIfNeeded.
    const geometryUnits = new Map<string, ActorRefFrom<typeof cadMachine>>();

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
      viewGraphics,
      geometryUnits,
      mainEntryFile: '',
      logRef,
      parameterEntries: new Map(),
      dirtyParameterPaths: new Set(),
    };
  },
  on: {},
  exit: ['stopStatefulActors'],
  initial: 'checkEnvironment',
  states: {
    checkEnvironment: {
      always: [
        {
          guard: 'isNotBrowser',
          target: 'ssr',
        },
        {
          guard: 'shouldAutoLoad',
          target: 'loading',
        },
        {
          target: 'idle',
        },
      ],
    },
    ssr: {
      type: 'final',
    },
    idle: {
      on: {
        loadProject: {
          target: 'loading',
          actions: ['updateProjectId', 'setLoading'],
        },
        // Accept view graphics lifecycle events in idle state so they
        // are not silently dropped if a useEffect fires before loading starts.
        createViewGraphics: {
          actions: 'createViewGraphics',
        },
        destroyViewGraphics: {
          actions: 'destroyViewGraphics',
        },
      },
    },
    loading: {
      entry: 'clearError',
      on: {
        // Accept view graphics lifecycle events during loading.
        // These are safe to process in any state -- they only depend on
        // context.projectId (always set) and defaultGraphicsSettings, with
        // zero dependency on context.project or any loaded data.
        createViewGraphics: {
          actions: 'createViewGraphics',
        },
        destroyViewGraphics: {
          actions: 'destroyViewGraphics',
        },
        projectRetrieved: {
          actions: ['setProject', 'clearLoading', 'emitProjectLoaded'],
        },
      },
      invoke: {
        src: 'loadProjectActor',
        input: ({ context }) => ({ projectId: context.projectId }),
        onDone: {
          target: 'ready',
          actions: ['initializeKernelIfNeeded'],
        },
        onError: {
          target: 'error',
          actions: ['setError'],
        },
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
            loadProject: [
              {
                guard: 'isProjectIdChanging',
                target: '#project.loading',
                actions: ['updateProjectId', 'stopStatefulActors', 'respawnStatefulActors', 'setLoading'],
              },
              {
                target: '#project.loading',
                actions: 'setLoading',
              },
            ],
            updateName: {
              actions: ['updateName'],
            },
            updateDescription: {
              actions: ['updateDescription'],
            },
            updateTags: {
              actions: ['updateTags'],
            },
            updateThumbnail: {
              actions: ['updateThumbnail'],
            },
            updateCodeParameters: {
              actions: ['updateCodeParametersInContext'],
            },
            setParameters: {
              actions: ['setParametersInContext'],
            },
            setGeometryUnitParameters: {
              actions: ['setGeometryUnitParametersInContext'],
            },
            parameterFileChanged: {
              actions: ['handleParameterFileChanged'],
            },
            switchParameterGroup: {
              actions: ['handleSwitchParameterGroup'],
            },
            createParameterGroup: {
              actions: ['handleCreateParameterGroup'],
            },
            deleteParameterGroup: {
              actions: ['handleDeleteParameterGroup'],
            },
            renameParameterGroup: {
              actions: ['handleRenameParameterGroup'],
            },
            loadModel: {
              actions: 'loadModel',
            },
            setMainFile: {
              actions: 'setMainFileInContext',
            },
            createGeometryUnit: {
              actions: 'createGeometryUnit',
            },
            openInViewer: {
              actions: 'openInViewer',
            },
            destroyGeometryUnit: {
              actions: 'destroyGeometryUnit',
            },
            createViewGraphics: {
              actions: 'createViewGraphics',
            },
            destroyViewGraphics: {
              actions: 'destroyViewGraphics',
            },
            fileMoved: {
              actions: 'applyFileMoved',
            },
            fileDeleted: {
              actions: 'applyFileDeleted',
            },
            directoryDeleted: {
              actions: 'applyDirectoryDeleted',
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                updateName: {
                  target: 'writing',
                },
                updateDescription: {
                  target: 'writing',
                },
                updateTags: {
                  target: 'writing',
                },
                updateThumbnail: {
                  target: 'writing',
                },
                updateCodeParameters: {
                  target: 'writing',
                },
                setMainFile: {
                  target: 'writing',
                },
              },
            },
            pending: {
              after: {
                pendingToWriting: 'writing',
              },
              on: {
                updateName: {
                  target: 'pending',
                  reenter: true,
                },
                updateDescription: {
                  target: 'pending',
                  reenter: true,
                },
                updateTags: {
                  target: 'pending',
                  reenter: true,
                },
                updateThumbnail: {
                  target: 'pending',
                  reenter: true,
                },
                updateCodeParameters: {
                  target: 'pending',
                  reenter: true,
                },
                setMainFile: {
                  target: 'pending',
                  reenter: true,
                },
                flushNow: { target: 'writing' },
              },
            },
            writing: {
              invoke: {
                src: 'writeProjectActor',
                input({ context }) {
                  return { project: context.project! };
                },
                onDone: {
                  target: 'idle',
                  actions: ['emitProjectUpdated'],
                },
                onError: {
                  target: 'idle',
                  actions: ['setError'],
                },
              },
              on: {
                updateName: {
                  target: 'pending',
                },
                updateDescription: {
                  target: 'pending',
                },
                updateTags: {
                  target: 'pending',
                },
                updateThumbnail: {
                  target: 'pending',
                },
                updateCodeParameters: {
                  target: 'pending',
                },
                setMainFile: {
                  target: 'pending',
                },
              },
            },
          },
        },
        parameterStoring: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                setParameters: { guard: 'hasParameterEntries', target: 'writing', actions: ['addDirtyParameterPath'] },
                setGeometryUnitParameters: {
                  guard: 'hasParameterEntries',
                  target: 'writing',
                  actions: ['addDirtyParameterPath'],
                },
                switchParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'writing',
                  actions: ['addDirtyParameterPath'],
                },
                createParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'writing',
                  actions: ['addDirtyParameterPath'],
                },
                deleteParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'writing',
                  actions: ['addDirtyParameterPath'],
                },
                renameParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'writing',
                  actions: ['addDirtyParameterPath'],
                },
              },
            },
            pending: {
              after: {
                pendingToWriting: 'writing',
              },
              on: {
                setParameters: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
                setGeometryUnitParameters: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
                switchParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
                createParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
                deleteParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
                renameParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  reenter: true,
                  actions: ['addDirtyParameterPath'],
                },
              },
            },
            writing: {
              invoke: {
                src: 'writeParameterFileActor',
                input({ context }) {
                  const [filePath] = context.dirtyParameterPaths;
                  return {
                    projectId: context.projectId,
                    filePath: filePath!,
                    entry: context.parameterEntries.get(filePath!)!,
                  };
                },
                onDone: [
                  {
                    guard: 'hasRemainingDirtyPaths',
                    target: 'writing',
                    reenter: true,
                    actions: ['removeWrittenParameterPath'],
                  },
                  {
                    target: 'idle',
                    actions: ['removeWrittenParameterPath'],
                  },
                ],
                onError: {
                  target: 'idle',
                  actions: ['removeWrittenParameterPath', 'setError'],
                },
              },
              on: {
                setParameters: { guard: 'hasParameterEntries', target: 'pending', actions: ['addDirtyParameterPath'] },
                setGeometryUnitParameters: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  actions: ['addDirtyParameterPath'],
                },
                switchParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  actions: ['addDirtyParameterPath'],
                },
                createParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  actions: ['addDirtyParameterPath'],
                },
                deleteParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  actions: ['addDirtyParameterPath'],
                },
                renameParameterGroup: {
                  guard: 'hasParameterEntries',
                  target: 'pending',
                  actions: ['addDirtyParameterPath'],
                },
              },
            },
          },
        },
      },
    },
    error: {
      on: {
        loadProject: [
          {
            guard: 'isProjectIdChanging',
            target: 'loading',
            actions: ['updateProjectId', 'stopStatefulActors', 'respawnStatefulActors', 'setLoading'],
          },
          {
            target: 'loading',
            actions: 'setLoading',
          },
        ],
      },
    },
  },
});
