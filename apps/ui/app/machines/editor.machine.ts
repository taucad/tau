import { assign, assertEvent, setup, enqueueActions, emit, raise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { PartialDeep } from 'type-fest';
import type { SerializedDockview } from 'dockview-react';
import type {
  EditorState,
  EditorStateInput,
  OpenFile,
  FileOpenSource,
  PanelState,
  ViewState,
} from '#types/editor.types.js';
import type { GraphicsViewSettings } from '#constants/editor.constants.js';
import { defaultPanelState } from '#constants/editor.constants.js';

const maxOpenFiles = 200;

/**
 * Mint a fresh stable editor pane id.
 */
function mintPaneId(): string {
  return generatePrefixedId(idPrefix.pane);
}

/**
 * Selector: derive the path of the active pane from a context. Returns
 * undefined when no pane is active or the active pane id no longer
 * exists in `openFiles` (e.g. closed by a rapid sequence of events).
 */
export function selectActiveFilePath(
  openFiles: readonly OpenFile[],
  activePaneId: string | undefined,
): string | undefined {
  if (activePaneId === undefined) {
    return undefined;
  }
  return openFiles.find((f) => f.paneId === activePaneId)?.path;
}

/**
 * Deep merge utility for panel state.
 * Merges partial updates into the current state while preserving unspecified values.
 */
function deepMergePanelState(current: PanelState, update: PartialDeep<PanelState>): PanelState {
  return {
    openPanels: {
      ...current.openPanels,
      ...update.openPanels,
    },
    panelSizes: {
      ...current.panelSizes,
      ...update.panelSizes,
    },
    mobileActiveTab: update.mobileActiveTab ?? current.mobileActiveTab,
    kernelPaneview: {
      ...current.kernelPaneview,
      ...(update.kernelPaneview as PanelState['kernelPaneview'] | undefined),
    },
    parametersPaneview: {
      ...current.parametersPaneview,
      ...(update.parametersPaneview as PanelState['parametersPaneview'] | undefined),
    },
  };
}

/**
 * Editor state Machine Context
 */
export type EditorStateContext = {
  projectId: string;
  openFiles: OpenFile[];
  /**
   * Stable pane identity of the currently-active tab. Path-based lookup
   * (via {@link selectActiveFilePath}) is derived from `openFiles`, so
   * renames update `openFiles[i].path` in place without churning the
   * active-pane identity.
   */
  activePaneId: string | undefined;
  focusedChatId: string | undefined;
  /** Panel layout state (open/close, sizes, mobile tab) */
  panelState: PanelState;
  /** Serialized DockviewReact layout for the code editor area */
  editorLayout: SerializedDockview | undefined;
  /** Serialized DockviewReact layout for the geometry viewer area */
  viewerLayout: SerializedDockview | undefined;
  /** Per-viewer-panel state, keyed by Dockview panel ID */
  viewSettings: Record<string, ViewState>;
  isLoading: boolean;
  error: Error | undefined;
  /** Flag indicating changes occurred during a write operation that need persisting */
  hasPendingChanges: boolean;
  /**
   * Last error from `ensureFocusedChatActor`. Surfaced to the route gate so
   * a `<FocusedChatErrorPanel>` can render a retry CTA. Cleared whenever
   * the actor is re-invoked.
   */
  focusedChatError: Error | undefined;
  /** Optional: awaited before new tabs emit `fileOpened` (Monaco model materialisation). */
  materialiseModel?: (path: string) => Promise<void>;
  /** In-flight deferred open (only set while materialising). */
  pendingOpenFile?: PendingOpenFile;
};

type PendingOpenFile = Readonly<{
  path: string;
  source: FileOpenSource;
  lineNumber?: number;
  column?: number;
  readOnly?: boolean;
}>;

/**
 * Editor state Machine Input
 */
type EditorStateMachineInput = {
  projectId: string;
};

/**
 * Editor state Machine Events
 */
type EditorStateEvent =
  | { type: 'load' }
  | { type: 'reload'; projectId: string }
  // File operations (consolidated from fileExplorerMachine)
  | { type: 'openFile'; path: string; source: FileOpenSource; lineNumber?: number; column?: number; readOnly?: boolean }
  | { type: 'registerMaterialiseModel'; materialiseModel: ((path: string) => Promise<void>) | undefined }
  | { type: 'closeFile'; path: string }
  | { type: 'setActiveFile'; path: string }
  | { type: 'revealFileInTree'; path: string; expandTarget?: boolean }
  | { type: 'renameFile'; oldPath: string; newPath: string }
  | { type: 'closeAll' }
  // Chat operations
  | { type: 'setFocusedChatId'; chatId: string | undefined }
  // Panel operations
  | { type: 'setPanelState'; panelState: PartialDeep<PanelState> }
  // Dockview layout operations
  | { type: 'setEditorLayout'; layout: SerializedDockview }
  | { type: 'setViewerLayout'; layout: SerializedDockview }
  // View settings operations
  | { type: 'setViewSettings'; viewId: string; viewState: ViewState }
  | { type: 'updateViewSettings'; viewId: string; settings: Partial<GraphicsViewSettings> }
  | { type: 'removeViewSettings'; viewId: string }
  // Flush pending state immediately (bypasses debounce, used on tab close)
  | { type: 'flushNow' }
  | { type: 'editorStateRetrieved'; state: EditorState | undefined }
  // Emitted by `ensureFocusedChatActor` when the focused-chat invariant
  // has been re-established.
  | { type: 'focusedChatEnsured'; focusedChatId: string }
  // User-initiated retry from `<FocusedChatErrorPanel>` after
  // `ensureFocusedChatActor` rejected.
  | { type: 'retryEnsureFocusedChat' };

/**
 * Editor state Machine Emitted Events
 */
type EditorStateEmitted =
  | { type: 'editorStateLoaded'; editorState: EditorState | undefined }
  | {
      type: 'fileOpened';
      path: string;
      lineNumber?: number;
      column?: number;
      source?: FileOpenSource;
      readOnly?: boolean;
    }
  | { type: 'fileOpening'; path: string }
  | { type: 'fileOpenFailed'; path: string; error: Error }
  | { type: 'fileRevealRequested'; path: string; expandTarget?: boolean };

// Actors to be provided by the consumer
const loadEditorStateActor = fromSafeAsync<
  { type: 'editorStateRetrieved'; state: EditorState | undefined },
  { projectId: string }
>(async () => {
  throw new Error('Not implemented. Please supply via provide.');
});

const saveEditorStateActor = fromSafeAsync<void, { editorState: EditorStateInput }>(async () => {
  throw new Error('Not implemented. Please supply via provide.');
});

const materialiseOpenFileActor = fromSafeAsync<void, { path: string; materialise: (path: string) => Promise<void> }>(
  async ({ input, signal }) => {
    if (signal.aborted) {
      return;
    }

    await input.materialise(input.path);
  },
);

/**
 * Establishes the "focused chat is valid" invariant. Validates the
 * candidate against the project's live chat list and emits a
 * `focusedChatEnsured` event with:
 *  - the candidate if it points to an extant chat,
 *  - the most-recently-updated chat, otherwise,
 *  - a freshly created chat id (zero-chats project), otherwise.
 *
 * Provided by `use-project.tsx` so the editor machine stays free of
 * IndexedDB/worker coupling. The emit-then-complete contract (vs
 * returning a plain payload) is required because `fromSafeAsync` is
 * built on `fromEventObservable`, which forwards `next()` values to
 * the parent as events — values without a `type` discriminator crash
 * XState's `isErrorActorEvent` macrostep.
 */
const ensureFocusedChatActor = fromSafeAsync<
  { type: 'focusedChatEnsured'; focusedChatId: string },
  { projectId: string; candidateFocusedChatId: string | undefined }
>(async () => {
  throw new Error('Not implemented. Please supply via provide.');
});

/**
 * Editor State Machine
 *
 * Manages transient Editor state per-build:
 * - Open files / tabs
 * - Active file path
 * - Focused chat ID
 *
 * This machine is DECOUPLED from the project machine to keep the project machine
 * clean for CLI/multi-frontend reuse.
 */
export const editorMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as EditorStateContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as EditorStateEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as EditorStateEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as EditorStateMachineInput,
  },
  actors: {
    loadEditorStateActor,
    saveEditorStateActor,
    materialiseOpenFileActor,
    ensureFocusedChatActor,
  },
  actions: {
    // ============================================================================
    // Lifecycle actions
    // ============================================================================
    setLoading: assign({ isLoading: true }),
    clearLoading: assign({ isLoading: false }),
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }

        return new Error('Unknown error');
      },
      isLoading: false,
    }),
    clearError: assign({ error: undefined }),

    setLoadedState: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'editorStateRetrieved');
      const loadedState = event.state;

      // Merge loaded panelState with defaults to handle missing fields from old data
      const mergedPanelState = loadedState?.panelState
        ? deepMergePanelState(defaultPanelState, loadedState.panelState)
        : defaultPanelState;

      // Safe loading for Dockview layout fields -- older persisted data may not have these
      let editorLayout: SerializedDockview | undefined;
      let viewerLayout: SerializedDockview | undefined;
      let viewSettings: Record<string, ViewState> = {};
      try {
        editorLayout = loadedState?.editorLayout;

        viewerLayout = loadedState?.viewerLayout;

        viewSettings = loadedState?.viewSettings ?? {};
      } catch {
        // Corrupt/incompatible persisted data -- silently default
        editorLayout = undefined;
        viewerLayout = undefined;
        viewSettings = {};
      }

      const openFiles: OpenFile[] = [...(loadedState?.openFiles ?? [])];
      const knownPaneIds = new Set<string>(openFiles.map((f) => f.paneId));
      const persistedActivePaneId = loadedState?.activePaneId;
      const resolvedActivePaneId =
        persistedActivePaneId !== undefined && knownPaneIds.has(persistedActivePaneId)
          ? persistedActivePaneId
          : undefined;

      enqueue.assign({
        openFiles,
        activePaneId: resolvedActivePaneId,
        // `focusedChatId` is hydrated from `loadedState` here as the
        // *candidate* — the subsequent `loading.ensuringFocusedChat`
        // substate validates it against the live chat list and reassigns
        // (or auto-creates) so the value on entry to `ready` is always
        // an extant chat id.
        focusedChatId: loadedState?.focusedChatId,
        panelState: mergedPanelState,
        editorLayout,
        viewerLayout,
        viewSettings,
        isLoading: false,
      });

      const activeMeta = openFiles.find((f) => f.paneId === resolvedActivePaneId);
      if (activeMeta) {
        enqueue.emit({
          type: 'fileOpened',
          path: activeMeta.path,
          source: 'machine',
          readOnly: activeMeta.readOnly,
        });
      }

      // Always emit editorStateLoaded so consumers know loading is complete
      enqueue.emit({
        type: 'editorStateLoaded',
        editorState: loadedState,
      });
    }),

    updateProjectId: assign(({ event }) => {
      assertEvent(event, 'reload');
      return {
        projectId: event.projectId,
        openFiles: [],
        activePaneId: undefined,
        focusedChatId: undefined,
        panelState: defaultPanelState,
        editorLayout: undefined,
        viewerLayout: undefined,
        viewSettings: {},
        materialiseModel: undefined,
        pendingOpenFile: undefined,
      };
    }),

    emitEditorStateLoadedEmpty: emit(() => ({
      type: 'editorStateLoaded',
      editorState: undefined,
    })),

    setMaterialiseModel: assign(({ event }) => {
      assertEvent(event, 'registerMaterialiseModel');
      return { materialiseModel: event.materialiseModel };
    }),

    stashPendingOpenAndEmitOpening: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'openFile');
      enqueue.assign({
        pendingOpenFile: {
          path: event.path,
          source: event.source,
          lineNumber: event.lineNumber,
          column: event.column,
          readOnly: event.readOnly,
        },
      });
      enqueue.emit({ type: 'fileOpening', path: event.path });
    }),

    finalizeMaterializedOpenSuccess: enqueueActions(({ enqueue, context }) => {
      const pending = context.pendingOpenFile;
      if (!pending) {
        return;
      }

      const now = Date.now();
      const newFile: OpenFile = {
        paneId: mintPaneId(),
        path: pending.path,
        name: pending.path.split('/').pop() ?? pending.path,
        lastAccessedAt: now,
        readOnly: pending.readOnly,
      };

      let updatedFiles = [...context.openFiles, newFile];

      if (updatedFiles.length > maxOpenFiles) {
        const sorted = [...updatedFiles].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        const victim = sorted.find((f) => f.paneId !== newFile.paneId);
        if (victim) {
          updatedFiles = updatedFiles.filter((f) => f.paneId !== victim.paneId);
        }
      }

      enqueue.assign({
        openFiles: updatedFiles,
        activePaneId: newFile.paneId,
        pendingOpenFile: undefined,
      });

      enqueue.emit({
        type: 'fileOpened',
        path: pending.path,
        lineNumber: pending.lineNumber,
        column: pending.column,
        source: pending.source,
        readOnly: pending.readOnly,
      });
    }),

    finalizeMaterializedOpenFailure: enqueueActions(({ enqueue, event, context }) => {
      const path = context.pendingOpenFile?.path ?? 'unknown';
      const error =
        'error' in event && event.error instanceof Error ? event.error : new Error('Materialise model failed');
      enqueue.assign({ pendingOpenFile: undefined });
      enqueue.emit({ type: 'fileOpenFailed', path, error });
    }),

    // ============================================================================
    // File operations (consolidated from fileExplorerMachine)
    // ============================================================================
    openFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'openFile');

      const now = Date.now();
      const existingFile = context.openFiles.find((f) => f.path === event.path);
      if (existingFile) {
        enqueue.assign({
          openFiles: context.openFiles.map((f) =>
            f.paneId === existingFile.paneId
              ? { ...f, lastAccessedAt: now, readOnly: event.readOnly ?? f.readOnly }
              : f,
          ),
          activePaneId: existingFile.paneId,
        });
        enqueue.emit({
          type: 'fileOpened',
          path: event.path,
          lineNumber: event.lineNumber,
          column: event.column,
          source: event.source,
          readOnly: event.readOnly ?? existingFile.readOnly,
        });
        return;
      }

      const newFile: OpenFile = {
        paneId: mintPaneId(),
        path: event.path,
        name: event.path.split('/').pop() ?? event.path,
        lastAccessedAt: now,
        readOnly: event.readOnly,
      };

      let updatedFiles = [...context.openFiles, newFile];

      if (updatedFiles.length > maxOpenFiles) {
        const sorted = [...updatedFiles].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        const victim = sorted.find((f) => f.paneId !== newFile.paneId);
        if (victim) {
          updatedFiles = updatedFiles.filter((f) => f.paneId !== victim.paneId);
        }
      }

      enqueue.assign({
        openFiles: updatedFiles,
        activePaneId: newFile.paneId,
      });

      enqueue.emit({
        type: 'fileOpened',
        path: event.path,
        lineNumber: event.lineNumber,
        column: event.column,
        source: event.source,
        readOnly: event.readOnly,
      });
    }),

    closeFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'closeFile');

      const closing = context.openFiles.find((file) => file.path === event.path);
      if (!closing) {
        return;
      }
      const updatedOpenFiles = context.openFiles.filter((file) => file.paneId !== closing.paneId);
      let newActivePaneId = context.activePaneId;

      if (context.activePaneId === closing.paneId) {
        newActivePaneId = updatedOpenFiles.at(-1)?.paneId;
        if (newActivePaneId !== undefined) {
          const newActive = updatedOpenFiles.find((f) => f.paneId === newActivePaneId);
          if (newActive) {
            enqueue.emit({
              type: 'fileOpened',
              path: newActive.path,
            });
          }
        }
      }

      enqueue.assign({
        openFiles: updatedOpenFiles,
        activePaneId: newActivePaneId,
      });
    }),

    setActiveFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'setActiveFile');

      const target = context.openFiles.find((f) => f.path === event.path);
      if (!target || context.activePaneId === target.paneId) {
        return;
      }

      enqueue.assign({
        openFiles: context.openFiles.map((f) =>
          f.paneId === target.paneId ? { ...f, lastAccessedAt: Date.now() } : f,
        ),
        activePaneId: target.paneId,
      });

      enqueue.emit({
        type: 'fileOpened',
        path: target.path,
      });
    }),

    revealFileInTree: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'revealFileInTree');

      enqueue.emit({
        type: 'fileRevealRequested',
        path: event.path,
        expandTarget: event.expandTarget,
      });
    }),

    closeAll: enqueueActions(({ enqueue }) => {
      enqueue.assign({
        openFiles: [],
        activePaneId: undefined,
      });
    }),

    renameFile: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'renameFile');

      const { oldPath, newPath } = event;

      // Rewrite path in place on each affected pane. Pane identity
      // (paneId) is preserved — only the `path` and `name` properties
      // mutate. This is the key invariant that lets the editor + viewer
      // surfaces survive a rename without React unmount.
      const updatedOpenFiles = context.openFiles.map((file) => {
        if (file.path === oldPath) {
          return {
            ...file,
            path: newPath,
            name: newPath.split('/').pop() ?? newPath,
          };
        }
        if (file.path.startsWith(`${oldPath}/`)) {
          const relativePath = file.path.slice(oldPath.length);
          const newFilePath = `${newPath}${relativePath}`;
          return {
            ...file,
            path: newFilePath,
            name: newFilePath.split('/').pop() ?? newFilePath,
          };
        }
        return file;
      });

      enqueue.assign({
        openFiles: updatedOpenFiles,
      });

      const activePath = selectActiveFilePath(context.openFiles, context.activePaneId);
      const activeWasAffected = activePath === oldPath || activePath?.startsWith(`${oldPath}/`);
      if (activeWasAffected) {
        const newActivePath = activePath === oldPath ? newPath : `${newPath}${activePath?.slice(oldPath.length) ?? ''}`;
        enqueue.emit({
          type: 'fileOpened',
          path: newActivePath,
        });
      }
    }),

    // ============================================================================
    // Chat operations
    // ============================================================================
    setFocusedChatIdInContext: assign(({ event }) => {
      assertEvent(event, 'setFocusedChatId');
      return { focusedChatId: event.chatId };
    }),

    /**
     * Assign the validated/created focused chat id emitted by
     * `ensureFocusedChatActor` via the `focusedChatEnsured` event to
     * context and clear any pre-existing `focusedChatError`. Pairs with
     * `raiseSetFocusedChatId` so the `storing` region picks up the
     * change through the canonical event channel (single write path,
     * debounced).
     */
    assignEnsuredFocusedChat: assign(({ event }) => {
      assertEvent(event, 'focusedChatEnsured');
      return {
        focusedChatId: event.focusedChatId,
        focusedChatError: undefined,
      };
    }),

    /**
     * Re-emit the assigned focused chat id as a `setFocusedChatId` event
     * so the `storing` region's existing handler (line 760+) debounces a
     * write. Keeping persistence on a single canonical path avoids the
     * dual-write race that an out-of-band save would introduce.
     */
    raiseSetFocusedChatId: raise(({ context }): { type: 'setFocusedChatId'; chatId: string | undefined } => ({
      type: 'setFocusedChatId',
      chatId: context.focusedChatId,
    })),

    assignFocusedChatError: assign(({ event }) => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate's done.invoke.* error event has an `error` payload not modelled in the union
      const { error } = event as unknown as { error: unknown };
      return {
        focusedChatError: error instanceof Error ? error : new Error('ensureFocusedChatActor failed'),
      };
    }),

    clearFocusedChatError: assign({ focusedChatError: undefined }),

    // ============================================================================
    // Panel operations
    // ============================================================================
    setPanelStateInContext: assign(({ event, context }) => {
      assertEvent(event, 'setPanelState');
      return {
        panelState: deepMergePanelState(context.panelState, event.panelState),
      };
    }),

    // ============================================================================
    // Dockview layout operations
    // ============================================================================
    setEditorLayoutInContext: assign(({ event }) => {
      assertEvent(event, 'setEditorLayout');
      return { editorLayout: event.layout };
    }),

    setViewerLayoutInContext: assign(({ event }) => {
      assertEvent(event, 'setViewerLayout');
      return { viewerLayout: event.layout };
    }),

    // ============================================================================
    // View settings operations
    // ============================================================================
    setViewSettingsInContext: assign(({ event, context }) => {
      assertEvent(event, 'setViewSettings');
      return {
        viewSettings: { ...context.viewSettings, [event.viewId]: event.viewState },
      };
    }),

    updateViewSettingsInContext: assign(({ event, context }) => {
      assertEvent(event, 'updateViewSettings');
      const existing = context.viewSettings[event.viewId];
      if (!existing) {
        return {};
      }

      return {
        viewSettings: {
          ...context.viewSettings,
          [event.viewId]: {
            ...existing,
            graphicsSettings: { ...existing.graphicsSettings, ...event.settings },
          },
        },
      };
    }),

    removeViewSettingsInContext: assign(({ event, context }) => {
      assertEvent(event, 'removeViewSettings');
      const { [event.viewId]: _, ...rest } = context.viewSettings;
      return { viewSettings: rest };
    }),

    // ============================================================================
    // Persistence tracking
    // ============================================================================
    setPendingChanges: assign({ hasPendingChanges: true }),
    clearPendingChanges: assign({ hasPendingChanges: false }),
  },
  guards: {
    isProjectIdChanging({ context, event }) {
      assertEvent(event, 'reload');
      return context.projectId !== event.projectId;
    },
    hasPendingChanges({ context }) {
      return context.hasPendingChanges;
    },
    shouldDeferOpenFile({ context, event }) {
      assertEvent(event, 'openFile');
      if (context.pendingOpenFile !== undefined) {
        return false;
      }

      if (context.materialiseModel === undefined) {
        return false;
      }

      return !context.openFiles.some((f) => f.path === event.path);
    },
    focusedChatIdIsUndefined({ context }) {
      return context.focusedChatId === undefined;
    },
  },
  delays: {
    storeDebounce: 500,
  },
}).createMachine({
  id: 'editor',
  context({ input }) {
    return {
      projectId: input.projectId,
      openFiles: [],
      activePaneId: undefined,
      focusedChatId: undefined,
      panelState: defaultPanelState,
      editorLayout: undefined,
      viewerLayout: undefined,
      viewSettings: {},
      isLoading: false,
      error: undefined,
      hasPendingChanges: false,
      focusedChatError: undefined,
      materialiseModel: undefined,
      pendingOpenFile: undefined,
    };
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        load: {
          target: 'loading',
          actions: 'setLoading',
        },
        reload: {
          target: 'loading',
          actions: ['updateProjectId', 'setLoading'],
        },
      },
    },
    loading: {
      entry: 'clearError',
      initial: 'hydrating',
      on: {
        reload: {
          target: '.hydrating',
          actions: ['updateProjectId', 'setLoading'],
          reenter: true,
        },
      },
      states: {
        hydrating: {
          invoke: {
            src: 'loadEditorStateActor',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: {
              target: 'ensuringFocusedChat',
            },
            onError: {
              // Loading failed; still run the ensure path so the route
              // gate sees either a healed focusedChatId or a typed error
              // panel rather than a stuck spinner.
              target: 'ensuringFocusedChat',
              actions: ['clearLoading', 'emitEditorStateLoadedEmpty'],
            },
          },
          on: {
            editorStateRetrieved: {
              actions: 'setLoadedState',
            },
          },
        },
        ensuringFocusedChat: {
          entry: 'clearFocusedChatError',
          invoke: {
            src: 'ensureFocusedChatActor',
            input: ({ context }) => ({
              projectId: context.projectId,
              candidateFocusedChatId: context.focusedChatId,
            }),
            onError: {
              // Surface the error to the route gate via `focusedChatError`.
              // The runtime ensure loop in `ready.operation` lets the user
              // retry via `<FocusedChatErrorPanel>` without a full reload.
              target: '#editor.ready',
              actions: 'assignFocusedChatError',
            },
          },
          on: {
            focusedChatEnsured: {
              target: '#editor.ready',
              actions: ['assignEnsuredFocusedChat', 'raiseSetFocusedChatId'],
            },
          },
        },
      },
    },
    ready: {
      type: 'parallel',
      states: {
        operation: {
          initial: 'idle',
          states: {
            idle: {
              // Self-heal at runtime: any path that leaves `focusedChatId`
              // undefined (e.g. `setFocusedChatId(undefined)` from the
              // last-chat deletion in `chat-history-selector`) immediately
              // re-enters `ensuringFocusedChat` so the route gate's
              // <ActiveChatProvider chatId> mount-precondition is always
              // restored.
              always: [{ guard: 'focusedChatIdIsUndefined', target: 'ensuringFocusedChat' }],
            },
            materializingOpenFile: {
              invoke: {
                src: 'materialiseOpenFileActor',
                input: ({ context }) => ({
                  path: context.pendingOpenFile?.path ?? '',
                  materialise: context.materialiseModel!,
                }),
                onDone: {
                  target: 'idle',
                  actions: 'finalizeMaterializedOpenSuccess',
                },
                onError: {
                  target: 'idle',
                  actions: 'finalizeMaterializedOpenFailure',
                },
              },
            },
            ensuringFocusedChat: {
              entry: 'clearFocusedChatError',
              invoke: {
                src: 'ensureFocusedChatActor',
                input: ({ context }) => ({
                  projectId: context.projectId,
                  candidateFocusedChatId: context.focusedChatId,
                }),
                onError: {
                  target: 'focusedChatUnresolved',
                  actions: 'assignFocusedChatError',
                },
              },
              on: {
                focusedChatEnsured: {
                  target: 'idle',
                  actions: ['assignEnsuredFocusedChat', 'raiseSetFocusedChatId'],
                },
              },
            },
            focusedChatUnresolved: {
              on: {
                retryEnsureFocusedChat: {
                  target: 'ensuringFocusedChat',
                },
              },
            },
          },
          on: {
            registerMaterialiseModel: {
              actions: 'setMaterialiseModel',
            },
            openFile: [
              {
                guard: 'shouldDeferOpenFile',
                target: '.materializingOpenFile',
                actions: 'stashPendingOpenAndEmitOpening',
              },
              { actions: 'openFile' },
            ],
            closeFile: {
              actions: 'closeFile',
            },
            setActiveFile: {
              actions: 'setActiveFile',
            },
            revealFileInTree: {
              actions: 'revealFileInTree',
            },
            renameFile: {
              actions: 'renameFile',
            },
            closeAll: {
              actions: 'closeAll',
            },
            setFocusedChatId: {
              actions: 'setFocusedChatIdInContext',
            },
            setPanelState: {
              actions: 'setPanelStateInContext',
            },
            setEditorLayout: {
              actions: 'setEditorLayoutInContext',
            },
            setViewerLayout: {
              actions: 'setViewerLayoutInContext',
            },
            setViewSettings: {
              actions: 'setViewSettingsInContext',
            },
            updateViewSettings: {
              actions: 'updateViewSettingsInContext',
            },
            removeViewSettings: {
              actions: 'removeViewSettingsInContext',
            },
            reload: {
              target: '#editor.loading',
              actions: ['updateProjectId', 'setLoading'],
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                openFile: { target: 'pending' },
                closeFile: { target: 'pending' },
                closeAll: { target: 'pending' },
                setActiveFile: { target: 'pending' },
                renameFile: { target: 'pending' },
                setFocusedChatId: { target: 'pending' },
                setPanelState: { target: 'pending' },
                setEditorLayout: { target: 'pending' },
                setViewerLayout: { target: 'pending' },
                setViewSettings: { target: 'pending' },
                updateViewSettings: { target: 'pending' },
                removeViewSettings: { target: 'pending' },
                registerMaterialiseModel: { target: 'pending' },
              },
            },
            pending: {
              after: {
                storeDebounce: 'writing',
              },
              on: {
                openFile: { target: 'pending', reenter: true },
                closeFile: { target: 'pending', reenter: true },
                closeAll: { target: 'pending', reenter: true },
                setActiveFile: { target: 'pending', reenter: true },
                renameFile: { target: 'pending', reenter: true },
                setFocusedChatId: { target: 'pending', reenter: true },
                setPanelState: { target: 'pending', reenter: true },
                setEditorLayout: { target: 'pending', reenter: true },
                setViewerLayout: { target: 'pending', reenter: true },
                setViewSettings: { target: 'pending', reenter: true },
                updateViewSettings: { target: 'pending', reenter: true },
                removeViewSettings: { target: 'pending', reenter: true },
                registerMaterialiseModel: { target: 'pending', reenter: true },
                // Immediately bypass debounce and write
                flushNow: { target: 'writing' },
              },
            },
            writing: {
              invoke: {
                src: 'saveEditorStateActor',
                input({ context }) {
                  return {
                    editorState: {
                      projectId: context.projectId,
                      openFiles: context.openFiles,
                      activePaneId: context.activePaneId,
                      focusedChatId: context.focusedChatId,
                      panelState: context.panelState,
                      editorLayout: context.editorLayout,
                      viewerLayout: context.viewerLayout,
                      viewSettings: context.viewSettings,
                    },
                  };
                },
                onDone: [
                  {
                    guard: 'hasPendingChanges',
                    target: 'pending',
                    actions: 'clearPendingChanges',
                  },
                  { target: 'idle' },
                ],
                onError: { target: 'pending', actions: 'clearPendingChanges' },
              },
              on: {
                // Track mutations during write so we persist again after completion
                openFile: { actions: 'setPendingChanges' },
                closeFile: { actions: 'setPendingChanges' },
                closeAll: { actions: 'setPendingChanges' },
                setActiveFile: { actions: 'setPendingChanges' },
                renameFile: { actions: 'setPendingChanges' },
                setFocusedChatId: { actions: 'setPendingChanges' },
                setPanelState: { actions: 'setPendingChanges' },
                setEditorLayout: { actions: 'setPendingChanges' },
                setViewerLayout: { actions: 'setPendingChanges' },
                setViewSettings: { actions: 'setPendingChanges' },
                updateViewSettings: { actions: 'setPendingChanges' },
                removeViewSettings: { actions: 'setPendingChanges' },
                registerMaterialiseModel: { actions: 'setPendingChanges' },
              },
            },
          },
        },
      },
    },
  },
});

export type EditorStateMachineRef = ActorRefFrom<typeof editorMachine>;
