import { assign, assertEvent, setup, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom, AnyStateMachine } from 'xstate';
import { produce } from 'immer';
import type { FileParameterEntry, ProjectManifest } from '@taucad/types';
import { normalizePath } from '@taucad/utils/path';
import { isBrowser } from '#constants/browser.constants.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { PersistedRevisionState } from '#types/project.types.js';
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
  project: ProjectManifest | undefined;
  revisionState: PersistedRevisionState | undefined;
  error: Error | undefined;
  isLoading: boolean;
  shouldLoadModelOnStart: boolean;
  kernelOptionsFactory: LazyKernelOptionsFactory;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** Geometry unit file paths that currently have geometry and at least one export route. */
  exportableGeometryUnitPaths: Set<string>;
  /** The main entry path from project.assets.main.entryPath. Set after project loads. */
  mainEntryPath: string;
  logRef: ActorRefFrom<typeof logMachine>;
  /** Per-geometry unit parameter entries, keyed by entry path. */
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
  {
    type: 'projectRetrieved';
    project: ProjectManifest;
    revisionState: PersistedRevisionState | undefined;
    parameterEntries: Map<string, FileParameterEntry>;
  },
  { projectId: string }
>(async () => {
  throw new Error(
    'Not implemented. Please supply the `provide.actors.loadProjectActor` option to the project machine.',
  );
});

const writeProjectActor = fromSafeAsync<void, { project: ProjectManifest }>(async () => {
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

export function isProjectContentActivityPath(projectRelativePath: string): boolean {
  const normalized = normalizePath(projectRelativePath).replace(/^\/+/, '');
  if (normalized === '' || normalized === '.') {
    return false;
  }

  const firstSegment = normalized.split('/').find((segment) => segment.length > 0);
  if (firstSegment === undefined) {
    return false;
  }

  return (
    normalized !== 'tau.json' &&
    normalized !== 'thumbnail.webp' &&
    firstSegment !== '.tau' &&
    firstSegment !== '.cache' &&
    firstSegment !== 'node_modules'
  );
}

/**
 * Project Machine Events
 */
type ProjectEventInternal =
  | { type: 'reloadProject' }
  | { type: 'updateName'; name: string }
  | { type: 'updateDescription'; description: string }
  | { type: 'updateTags'; tags: string[] }
  | { type: 'updateRevisionState'; revisionState: PersistedRevisionState }
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
  | { type: 'createGeometryUnit'; entryPath: string }
  | { type: 'geometryUnit.exportAvailabilityChanged'; actorId: string; available: boolean }
  | { type: 'openInViewer'; entryPath: string }
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
  | { type: 'projectFileActivity'; operation: ProjectFileActivityOperation; paths: readonly string[] }
  | { type: 'flushNow' };

type ProjectEvent =
  | ProjectEventInternal
  | {
      type: 'projectRetrieved';
      project: ProjectManifest;
      revisionState?: PersistedRevisionState;
      parameterEntries: Map<string, FileParameterEntry>;
    };

/**
 * Project Machine Emitted Events
 */
type ProjectEmitted =
  | { type: 'error'; error: Error }
  | { type: 'projectUpdated'; project: ProjectManifest }
  | { type: 'projectActivity' }
  | { type: 'revisionStateUpdated'; revisionState: PersistedRevisionState }
  | { type: 'viewerFileRequested'; entryPath: string };

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
    setProject: assign({
      project({ event }) {
        assertEvent(event, 'projectRetrieved');
        return event.project;
      },
      parameterEntries({ event }) {
        assertEvent(event, 'projectRetrieved');
        return event.parameterEntries;
      },
      revisionState({ event }) {
        assertEvent(event, 'projectRetrieved');
        return event.revisionState;
      },
      isLoading: false,
    }),
    clearProject: assign({
      project: undefined,
    }),
    updateName: assign(({ context, event }) => {
      assertEvent(event, 'updateName');
      if (!context.project || context.project.name === event.name) {
        return {};
      }

      return produce(context, (draft) => {
        draft.project!.name = event.name;
      });
    }),
    updateDescription: assign(({ context, event }) => {
      assertEvent(event, 'updateDescription');
      if (!context.project) {
        return {};
      }

      return produce(context, (draft) => {
        draft.project!.description = event.description;
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
    updateRevisionState: assign(({ event }) => {
      assertEvent(event, 'updateRevisionState');
      return { revisionState: event.revisionState };
    }),
    updateCodeParametersInContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'updateCodeParameters');

      if (!context.project) {
        return;
      }
      enqueue.assign(({ context }) => {
        const filePath = context.mainEntryPath;
        const entry = context.parameterEntries.get(filePath) ?? createDefaultEntry();
        const updated = updateGroupValues(entry, { groupName: entry.activeGroup, values: event.parameters });
        const parameterEntries = new Map(context.parameterEntries);
        parameterEntries.set(filePath, updated);
        return { parameterEntries };
      });
    }),
    setParametersInContext: assign(({ context, event }) => {
      assertEvent(event, 'setParameters');
      const filePath = context.mainEntryPath;
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
      if (!context.project) {
        return {};
      }

      return produce(context, (draft) => {
        if (draft.project) {
          draft.project.assets.main.entryPath = event.path;
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
    updateGeometryUnitExportAvailability: assign(({ context, event }) => {
      assertEvent(event, 'geometryUnit.exportAvailabilityChanged');

      let entryPath: string | undefined;
      for (const [candidateEntryPath, actor] of context.geometryUnits) {
        if (actor.id === event.actorId) {
          entryPath = candidateEntryPath;
          break;
        }
      }

      if (!entryPath) {
        return {};
      }

      const isCurrentlyExportable = context.exportableGeometryUnitPaths.has(entryPath);
      if (isCurrentlyExportable === event.available) {
        return {};
      }

      const next = new Set(context.exportableGeometryUnitPaths);
      if (event.available) {
        next.add(entryPath);
      } else {
        next.delete(entryPath);
      }
      return { exportableGeometryUnitPaths: next };
    }),
    initializeKernelIfNeeded: enqueueActions(({ enqueue, context, self }) => {
      if (!context.shouldLoadModelOnStart) {
        return;
      }

      const mainAsset = context.project?.assets.main;
      if (!mainAsset) {
        return;
      }

      const mainFile = mainAsset.entryPath;

      if (context.geometryUnits.has(mainFile)) {
        enqueue.assign({ mainEntryPath: mainFile });
        const existingUnit = context.geometryUnits.get(mainFile)!;
        enqueue.sendTo(existingUnit, {
          type: 'initializeModel',
          entryPath: mainFile,
        });
      } else {
        enqueue.assign(({ spawn, context }) => {
          const cadUnit = spawn('cad', {
            id: `cad-${context.projectId}-${mainFile.replaceAll('/', '-')}`,
            input: {
              shouldInitializeKernelOnStart: false,
              parentRef: self,
              logRef: context.logRef,
              fileManagerRef: context.fileManagerRef,
              kernelOptionsFactory: context.kernelOptionsFactory,
              fileSystemRoot: `/projects/${context.projectId}`,
            },
          });

          cadUnit.send({
            type: 'initializeModel',
            entryPath: mainFile,
          });

          const newUnits = new Map(context.geometryUnits);
          newUnits.set(mainFile, cadUnit as ActorRefFrom<typeof cadMachine>);
          return { geometryUnits: newUnits, mainEntryPath: mainFile };
        });
      }
    }),
    loadModel: enqueueActions(({ enqueue, context, self }) => {
      const mainAsset = context.project?.assets.main;
      if (!mainAsset) {
        return;
      }

      const mainFile = mainAsset.entryPath;

      const mainUnit = context.geometryUnits.get(mainFile);
      if (mainUnit) {
        enqueue.sendTo(mainUnit, {
          type: 'initializeModel',
          entryPath: mainFile,
        });
      } else {
        enqueue.assign(({ spawn, context }) => {
          const cadUnit = spawn('cad', {
            id: `cad-${context.projectId}-${mainFile.replaceAll('/', '-')}`,
            input: {
              shouldInitializeKernelOnStart: false,
              parentRef: self,
              logRef: context.logRef,
              fileManagerRef: context.fileManagerRef,
              kernelOptionsFactory: context.kernelOptionsFactory,
              fileSystemRoot: `/projects/${context.projectId}`,
            },
          });

          cadUnit.send({
            type: 'initializeModel',
            entryPath: mainFile,
          });

          const newUnits = new Map(context.geometryUnits);
          newUnits.set(mainFile, cadUnit as ActorRefFrom<typeof cadMachine>);
          return { geometryUnits: newUnits, mainEntryPath: mainFile };
        });
      }
    }),
    createGeometryUnit: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'createGeometryUnit');

      // No-op if a geometry unit already exists for this entry path
      if (context.geometryUnits.has(event.entryPath)) {
        return;
      }

      // Spawn is only available inside assign callbacks in XState v5.
      enqueue.assign(({ spawn, context }) => {
        const cadUnit = spawn('cad', {
          id: `cad-${context.projectId}-${event.entryPath.replaceAll('/', '-')}`,
          input: {
            shouldInitializeKernelOnStart: true,
            parentRef: self,
            logRef: context.logRef,
            fileManagerRef: context.fileManagerRef,
            kernelOptionsFactory: context.kernelOptionsFactory,
            fileSystemRoot: `/projects/${context.projectId}`,
          },
        });

        cadUnit.send({
          type: 'initializeModel',
          entryPath: event.entryPath,
        });

        const newUnits = new Map(context.geometryUnits);
        newUnits.set(event.entryPath, cadUnit as ActorRefFrom<typeof cadMachine>);
        return {
          geometryUnits: newUnits,
          ...(context.mainEntryPath === '' ? { mainEntryPath: event.entryPath } : {}),
        };
      });
    }),
    openInViewer: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'openInViewer');
      enqueue.raise({
        type: 'createGeometryUnit',
        entryPath: event.entryPath,
      });
      enqueue.emit({ type: 'viewerFileRequested', entryPath: event.entryPath });
    }),
    destroyGeometryUnit: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'destroyGeometryUnit');

      const unit = context.geometryUnits.get(event.entryPath);
      if (!unit) {
        return;
      }

      enqueue.stopChild(unit);
      enqueue.assign(({ context }) => {
        const newUnits = new Map(context.geometryUnits);
        newUnits.delete(event.entryPath);
        const exportableGeometryUnitPaths = new Set(context.exportableGeometryUnitPaths);
        exportableGeometryUnitPaths.delete(event.entryPath);
        return {
          geometryUnits: newUnits,
          exportableGeometryUnitPaths,
          ...(context.mainEntryPath === event.entryPath ? { mainEntryPath: '' } : {}),
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
        // ParameterEntries: Map<filePath, entry>
        const newEntries = new Map(context.parameterEntries);
        let mutatedEntries = false;
        for (const [key, value] of context.parameterEntries) {
          if (matches(key)) {
            newEntries.delete(key);
            newEntries.set(rewrite(key), value);
            mutatedEntries = true;
          }
        }

        // GeometryUnits: Map<entryPath, ActorRef>
        const newUnits = new Map(context.geometryUnits);
        let mutatedUnits = false;
        for (const [key, value] of context.geometryUnits) {
          if (matches(key)) {
            newUnits.delete(key);
            newUnits.set(rewrite(key), value);
            mutatedUnits = true;
          }
        }

        // Exportable geometry units: Set<entryPath>
        const newExportablePaths = new Set(context.exportableGeometryUnitPaths);
        let mutatedExportablePaths = false;
        for (const key of context.exportableGeometryUnitPaths) {
          if (matches(key)) {
            newExportablePaths.delete(key);
            newExportablePaths.add(rewrite(key));
            mutatedExportablePaths = true;
          }
        }

        const next: Partial<ProjectContext> = {};
        if (mutatedEntries) {
          next.parameterEntries = newEntries;
        }
        if (mutatedUnits) {
          next.geometryUnits = newUnits;
        }
        if (mutatedExportablePaths) {
          next.exportableGeometryUnitPaths = newExportablePaths;
        }
        if (matches(context.mainEntryPath)) {
          next.mainEntryPath = rewrite(context.mainEntryPath);
        }
        return next;
      });

      // If the main file was renamed, persist its entry pointer.
      // Recency is stamped separately by `projectFileActivity`, so this
      // mechanical metadata rewrite does not decide project activity itself.
      if (matches(context.project?.assets.main.entryPath ?? '')) {
        enqueue.assign(({ context }) =>
          produce(context, (draft) => {
            if (draft.project) {
              draft.project.assets.main.entryPath = rewrite(draft.project.assets.main.entryPath);
            }
          }),
        );
      }
    }),
    applyProjectFileActivity: emit(({ context, event }) => {
      assertEvent(event, 'projectFileActivity');
      if (!context.project || !event.paths.some(isProjectContentActivityPath)) {
        return { type: 'projectActivity' };
      }
      return { type: 'projectActivity' };
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
        const exportableGeometryUnitPaths = new Set(context.exportableGeometryUnitPaths);
        exportableGeometryUnitPaths.delete(path);
        const newEntries = new Map(context.parameterEntries);
        newEntries.delete(path);
        return {
          geometryUnits: newUnits,
          exportableGeometryUnitPaths,
          parameterEntries: newEntries,
          ...(context.mainEntryPath === path ? { mainEntryPath: '' } : {}),
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
        const newExportablePaths = new Set(context.exportableGeometryUnitPaths);
        for (const key of context.exportableGeometryUnitPaths) {
          if (matches(key)) {
            newExportablePaths.delete(key);
          }
        }
        for (const key of context.parameterEntries.keys()) {
          if (matches(key)) {
            newEntries.delete(key);
          }
        }
        return {
          geometryUnits: newUnits,
          exportableGeometryUnitPaths: newExportablePaths,
          parameterEntries: newEntries,
          ...(matches(context.mainEntryPath) ? { mainEntryPath: '' } : {}),
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
            componentDisplay: settings.componentDisplay,
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
    addDirtyParameterPath: assign(({ context, event }) => {
      const filePath = 'filePath' in event ? (event as { filePath: string }).filePath : context.mainEntryPath;
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
    emitRevisionStateUpdated: emit(({ event }) => {
      assertEvent(event, 'updateRevisionState');
      return { type: 'revisionStateUpdated', revisionState: event.revisionState };
    }),
  },
  guards: {
    isNotBrowser() {
      return !isBrowser;
    },
    shouldAutoLoad() {
      return isBrowser;
    },
    shouldUpdateProjectName({ context, event }) {
      assertEvent(event, 'updateName');
      return Boolean(context.project && context.project.name !== event.name);
    },
    hasVisibleProjectFileActivity({ context, event }) {
      assertEvent(event, 'projectFileActivity');
      return Boolean(context.project && event.paths.some(isProjectContentActivityPath));
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
    const exportableGeometryUnitPaths = new Set<string>();

    // View graphics are created dynamically by Dockview viewer panels.
    const viewGraphics = new Map<string, ActorRefFrom<typeof graphicsMachine>>();

    return {
      projectId,
      project: undefined,
      revisionState: undefined,
      error: undefined,
      isLoading: true,
      shouldLoadModelOnStart,
      kernelOptionsFactory,
      fileManagerRef,
      viewGraphics,
      geometryUnits,
      exportableGeometryUnitPaths,
      mainEntryPath: '',
      logRef,
      parameterEntries: new Map(),
      dirtyParameterPaths: new Set(),
    };
  },
  on: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- XState event name
    'geometryUnit.exportAvailabilityChanged': {
      actions: 'updateGeometryUnitExportAvailability',
    },
  },
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
        reloadProject: {
          target: 'loading',
          actions: 'setLoading',
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
          actions: ['setProject', 'clearLoading'],
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
            reloadProject: {
              target: '#project.loading',
              actions: 'setLoading',
            },
            updateName: {
              guard: 'shouldUpdateProjectName',
              actions: ['updateName'],
            },
            updateDescription: {
              actions: ['updateDescription'],
            },
            updateTags: {
              actions: ['updateTags'],
            },
            updateRevisionState: {
              actions: ['updateRevisionState', 'emitRevisionStateUpdated'],
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
            projectFileActivity: {
              guard: 'hasVisibleProjectFileActivity',
              actions: 'applyProjectFileActivity',
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                updateName: {
                  guard: 'shouldUpdateProjectName',
                  target: 'writing',
                },
                updateDescription: {
                  target: 'writing',
                },
                updateTags: {
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
                  guard: 'shouldUpdateProjectName',
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
                  guard: 'shouldUpdateProjectName',
                  target: 'pending',
                },
                updateDescription: {
                  target: 'pending',
                },
                updateTags: {
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
        reloadProject: {
          target: 'loading',
          actions: 'setLoading',
        },
      },
    },
  },
});
