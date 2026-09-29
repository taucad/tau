import { setup, types } from 'xstate';
import type { ActorRefFrom, EnqueueObject, SystemRegistry } from 'xstate';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { assertRootedPath, resolveRootedPath } from '@taucad/utils/path';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { PartialDeep } from 'type-fest';
import type {
  EditorState,
  EditorStateInput,
  OpenFile,
  FileOpenSource,
  PanelState,
  PreviousWorkbenchLayout,
} from '#types/editor.types.js';
import type { GraphicsBackendPreference } from '#constants/editor.constants.js';
import { defaultPanelState } from '#constants/editor.constants.js';
import { mergePanelState } from '#utils/panel-state.utils.js';

const maxOpenFiles = 200;

const repairPersistedOpenFiles = (files: readonly OpenFile[], activePaneId: string | undefined): OpenFile[] => {
  const byPath = new Map<string, OpenFile>();
  for (const file of files) {
    try {
      const candidate = file.path.startsWith('/') && !file.path.startsWith('//') ? file.path.slice(1) : file.path;
      const repaired = { ...file, path: resolveRootedPath(candidate) };
      const existing = byPath.get(repaired.path);
      if (!existing || repaired.paneId === activePaneId) {
        byPath.set(repaired.path, repaired);
      }
    } catch {
      // Ignore malformed persisted tabs; they cannot identify a project file.
    }
  }
  return [...byPath.values()];
};

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

function pathMatchesPathOrDescendant(path: string, targetPath: string): boolean {
  return path === targetPath || path.startsWith(`${targetPath}/`);
}

function rewritePathIfMatched(path: string | undefined, oldPath: string, newPath: string): string | undefined {
  if (!path) {
    return path;
  }
  if (path === oldPath) {
    return newPath;
  }
  if (!pathMatchesPathOrDescendant(path, oldPath)) {
    return path;
  }
  return `${newPath}${path.slice(oldPath.length)}`;
}

function rekeyFileSidebarsForRename(
  widths: Record<string, number>,
  oldPath: string,
  newPath: string,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(widths).map(([path, width]) => [rewritePathIfMatched(path, oldPath, newPath) ?? path, width]),
  );
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
  /** Route-requested chat selection. Validated before it becomes focused. */
  requestedChatId: string | undefined;
  focusedChatId: string | undefined;
  /** Panel layout state (open/close, sizes, mobile tab) */
  panelState: PanelState;
  /** Device-local file sidebar pixel widths, keyed by project path. */
  fileSidebars: Record<string, number>;
  /** Device rendering API preference. */
  graphicsBackendPreferences: Record<string, GraphicsBackendPreference>;
  previousLayout: PreviousWorkbenchLayout | undefined;
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
  requestedChatId?: string;
};

/**
 * Editor state Machine Events
 */
type EditorStateEvent =
  | { type: 'load' }
  // File operations (consolidated from fileExplorerMachine)
  | { type: 'openFile'; path: string; source: FileOpenSource; lineNumber?: number; column?: number; readOnly?: boolean }
  | { type: 'registerMaterialiseModel'; materialiseModel: ((path: string) => Promise<void>) | undefined }
  | { type: 'closeFile'; path: string }
  | { type: 'setActiveFile'; path: string }
  | { type: 'revealFileInTree'; path: string; expandTarget?: boolean }
  | { type: 'revealModelComponentInExplorer'; entryPath: string; unitId: string; componentId: string }
  /** Open the Kinematics pane at the joint that moves a part. */
  | { type: 'revealModelComponentInKinematics'; entryPath: string; unitId: string; componentId: string }
  | { type: 'renameFile'; oldPath: string; newPath: string }
  | { type: 'closeAll' }
  // Chat operations
  | { type: 'setRequestedChatId'; chatId: string | undefined }
  /* A chat the caller already knows exists (freshly created, or listed in the
   * loaded chat list). Focused synchronously — routing it through
   * `setRequestedChatId` would re-enter `ensuringFocusedChat` and flash the
   * chat pane's skeleton on every switch. */
  | { type: 'focusKnownChat'; chatId: string }
  | { type: 'setFocusedChatId'; chatId: string | undefined }
  // Panel operations
  | { type: 'setPanelState'; panelState: PartialDeep<PanelState> }
  // Browser-local presentation only; portable arrangement belongs to workbench records.
  | { type: 'setPreviousLayout'; layout: PreviousWorkbenchLayout | undefined }
  | { type: 'setFileSidebarWidth'; path: string; width: number }
  | { type: 'setGraphicsBackendPreference'; viewId: string; preference: GraphicsBackendPreference }
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
  | { type: 'fileRevealRequested'; path: string; expandTarget?: boolean }
  | { type: 'modelComponentRevealRequested'; entryPath: string; unitId: string; componentId: string }
  | { type: 'kinematicsRevealRequested'; entryPath: string; unitId: string; componentId: string };

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
 * requested and persisted candidates against the project's live chat list and emits a
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
  { projectId: string; requestedChatId: string | undefined; persistedChatId: string | undefined }
>(async () => {
  throw new Error('Not implemented. Please supply via provide.');
});

const editorActors = {
  loadEditorStateActor,
  saveEditorStateActor,
  materialiseOpenFileActor,
  ensureFocusedChatActor,
};

type EditorEnqueue = EnqueueObject<EditorStateEvent, EditorStateEmitted, SystemRegistry, typeof editorActors>;
type EditorPatch = Partial<EditorStateContext>;
type EditorArgs<EventType extends EditorStateEvent['type']> = Readonly<{
  context: EditorStateContext;
  event: Extract<EditorStateEvent, { type: EventType }>;
}>;

const errorOf = (error: unknown, fallback: string): Error => (error instanceof Error ? error : new Error(fallback));

/** Hydrate context from the persisted editor state, repairing whatever older data left behind. */
const loadedStatePatch = ({ event }: EditorArgs<'editorStateRetrieved'>, enq: EditorEnqueue): EditorPatch => {
  const loadedState = event.state;

  // Merge loaded panelState with defaults to handle missing fields from old data
  const mergedPanelState = loadedState?.panelState
    ? mergePanelState(defaultPanelState, loadedState.panelState)
    : defaultPanelState;

  const persistedActivePaneId = loadedState?.activePaneId;
  const openFiles = repairPersistedOpenFiles(loadedState?.openFiles ?? [], persistedActivePaneId);
  const knownPaneIds = new Set<string>(openFiles.map((f) => f.paneId));
  const resolvedActivePaneId =
    persistedActivePaneId !== undefined && knownPaneIds.has(persistedActivePaneId) ? persistedActivePaneId : undefined;

  const activeMeta = openFiles.find((f) => f.paneId === resolvedActivePaneId);
  if (activeMeta) {
    enq.emit({ type: 'fileOpened', path: activeMeta.path, source: 'machine', readOnly: activeMeta.readOnly });
  }

  return {
    openFiles,
    activePaneId: resolvedActivePaneId,
    // `focusedChatId` is hydrated from `loadedState` here as the
    // *candidate* — the subsequent `loading.ensuringFocusedChat`
    // substate validates it against the live chat list and reassigns
    // (or auto-creates) so the value on entry to `ready` is always
    // an extant chat id.
    focusedChatId: loadedState?.focusedChatId,
    panelState: mergedPanelState,
    fileSidebars: loadedState?.fileSidebars ?? {},
    graphicsBackendPreferences: loadedState?.graphicsBackendPreferences ?? {},
    previousLayout: loadedState?.previousLayout,
    isLoading: false,
  };
};

/** Add a pane for a newly opened file, evicting the least recently used pane past the cap. */
const withNewPane = (
  context: EditorStateContext,
  file: Readonly<{ path: string; readOnly?: boolean | undefined }>,
): Readonly<{ openFiles: OpenFile[]; paneId: string }> => {
  const newFile: OpenFile = {
    paneId: mintPaneId(),
    path: file.path,
    name: file.path.split('/').pop() ?? file.path,
    lastAccessedAt: Date.now(),
    readOnly: file.readOnly,
  };

  let openFiles = [...context.openFiles, newFile];

  if (openFiles.length > maxOpenFiles) {
    const sorted = [...openFiles].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    const victim = sorted.find((f) => f.paneId !== newFile.paneId);
    if (victim) {
      openFiles = openFiles.filter((f) => f.paneId !== victim.paneId);
    }
  }
  return { openFiles, paneId: newFile.paneId };
};

/**
 * Take the validated/created focused chat id `ensureFocusedChatActor` reports
 * and re-raise it as `setFocusedChatId`, so the `storing` region picks the
 * change up through the canonical event channel (single write path,
 * debounced). An out-of-band save would race it.
 */
const focusedChatEnsured =
  (target: string) =>
  ({ event }: EditorArgs<'focusedChatEnsured'>, enq: EditorEnqueue) => {
    enq.raise({ type: 'setFocusedChatId', chatId: event.focusedChatId });
    return { target, context: { focusedChatId: event.focusedChatId, focusedChatError: undefined } };
  };

const focusedChatFailed =
  (target: string) =>
  ({ event }: Readonly<{ event: Readonly<{ error: unknown }> }>) => ({
    target,
    context: { focusedChatError: errorOf(event.error, 'ensureFocusedChatActor failed') },
  });

/** Candidates for the focused chat: the one asked for, then the one persisted. */
const ensureFocusedChatInput = ({ context }: Readonly<{ context: EditorStateContext }>) => ({
  projectId: context.projectId,
  requestedChatId: context.requestedChatId,
  persistedChatId: context.focusedChatId,
});

const debounceWrite = { target: 'pending' } as const;
const restartDebounce = { target: 'pending', reenter: true } as const;
const markPendingChanges = { context: { hasPendingChanges: true } } as const;

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
  schemas: {
    context: types<EditorStateContext>(),
    events: eventSchemas<EditorStateEvent>(),
    emitted: eventSchemas<EditorStateEmitted>(),
    input: types<EditorStateMachineInput>(),
  },
  actors: editorActors,
  delays: {
    storeDebounce: 500,
  },
}).createMachine({
  id: 'editor',
  context: ({ input }) => ({
    projectId: input.projectId,
    openFiles: [],
    activePaneId: undefined,
    requestedChatId: input.requestedChatId,
    focusedChatId: undefined,
    panelState: defaultPanelState,
    fileSidebars: {},
    graphicsBackendPreferences: {},
    previousLayout: undefined,
    isLoading: false,
    error: undefined,
    hasPendingChanges: false,
    focusedChatError: undefined,
    materialiseModel: undefined,
    pendingOpenFile: undefined,
  }),
  initial: 'idle',
  on: {
    setRequestedChatId: { context: ({ event }) => ({ requestedChatId: event.chatId }) },
    /* Fallback for the pre-`ready` window: record the request so the cold-start
     * ensure resolves to it. The `ready.operation` handler overrides this one
     * and also persists. */
    focusKnownChat: {
      context: ({ event }) => ({
        requestedChatId: event.chatId,
        focusedChatId: event.chatId,
        focusedChatError: undefined,
      }),
    },
  },
  states: {
    idle: {
      on: {
        load: { target: 'loading', context: { isLoading: true } },
      },
    },
    loading: {
      entry: () => ({ context: { error: undefined } }),
      initial: 'hydrating',
      states: {
        hydrating: {
          invoke: {
            src: 'loadEditorStateActor',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'ensuringFocusedChat' },
            // Loading failed; still run the ensure path so the route
            // gate sees either a healed focusedChatId or a typed error
            // panel rather than a stuck spinner.
            onError: { target: 'ensuringFocusedChat', context: { isLoading: false } },
          },
          on: {
            editorStateRetrieved: (args, enq) => ({ context: loadedStatePatch(args, enq) }),
          },
        },
        ensuringFocusedChat: {
          entry: () => ({ context: { focusedChatError: undefined } }),
          invoke: {
            src: 'ensureFocusedChatActor',
            input: ensureFocusedChatInput,
            // Surface the error to the route gate via `focusedChatError`.
            // The runtime ensure loop in `ready.operation` lets the user
            // retry via `<FocusedChatErrorPanel>` without a full reload.
            onError: focusedChatFailed('#editor.ready'),
          },
          on: {
            focusedChatEnsured: focusedChatEnsured('#editor.ready'),
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
              // last-chat deletion in project chat navigation) immediately
              // re-enters `ensuringFocusedChat` so the route gate's
              // <ActiveChatProvider chatId> mount-precondition is always
              // restored.
              always: ({ context }) =>
                context.focusedChatId === undefined ? { target: 'ensuringFocusedChat' } : undefined,
            },
            materializingOpenFile: {
              invoke: {
                src: 'materialiseOpenFileActor',
                input: ({ context }) => ({
                  path: context.pendingOpenFile?.path ?? '',
                  materialise: context.materialiseModel!,
                }),
                onDone: ({ context }, enq) => {
                  const pending = context.pendingOpenFile;
                  if (!pending) {
                    return { target: 'idle' };
                  }
                  const { openFiles, paneId } = withNewPane(context, pending);
                  enq.emit({
                    type: 'fileOpened',
                    path: pending.path,
                    lineNumber: pending.lineNumber,
                    column: pending.column,
                    source: pending.source,
                    readOnly: pending.readOnly,
                  });
                  return {
                    target: 'idle',
                    context: { openFiles, activePaneId: paneId, pendingOpenFile: undefined },
                  };
                },
                onError: ({ context, event }, enq) => {
                  enq.emit({
                    type: 'fileOpenFailed',
                    path: context.pendingOpenFile?.path ?? 'unknown',
                    error: errorOf(event.error, 'Materialise model failed'),
                  });
                  return { target: 'idle', context: { pendingOpenFile: undefined } };
                },
              },
            },
            ensuringFocusedChat: {
              entry: () => ({ context: { focusedChatError: undefined } }),
              invoke: {
                src: 'ensureFocusedChatActor',
                input: ensureFocusedChatInput,
                onError: focusedChatFailed('focusedChatUnresolved'),
              },
              on: {
                focusedChatEnsured: focusedChatEnsured('idle'),
              },
            },
            focusedChatUnresolved: {
              on: {
                retryEnsureFocusedChat: { target: 'ensuringFocusedChat' },
              },
            },
          },
          on: {
            focusKnownChat: ({ event }, enq) => {
              enq.raise({ type: 'setFocusedChatId', chatId: event.chatId });
              return {
                target: '.idle',
                context: { requestedChatId: event.chatId, focusedChatId: event.chatId, focusedChatError: undefined },
              };
            },
            /* A bare project URL (no `searchParameterName.chat`) names no chat, so a chat already focused
             * still satisfies it — revalidating would enter `ensuringFocusedChat` and
             * flash the chat pane's skeleton before the route rewrites the URL. */
            setRequestedChatId: ({ context, event }) =>
              event.chatId === undefined && context.focusedChatId !== undefined
                ? { context: { requestedChatId: event.chatId } }
                : { target: '.ensuringFocusedChat', context: { requestedChatId: event.chatId } },
            registerMaterialiseModel: { context: ({ event }) => ({ materialiseModel: event.materialiseModel }) },
            openFile: ({ context, event }, enq) => {
              assertRootedPath(event.path);
              const existingFile = context.openFiles.find((f) => f.path === event.path);

              if (context.pendingOpenFile === undefined && context.materialiseModel !== undefined && !existingFile) {
                enq.emit({ type: 'fileOpening', path: event.path });
                return {
                  target: '.materializingOpenFile',
                  context: {
                    pendingOpenFile: {
                      path: event.path,
                      source: event.source,
                      lineNumber: event.lineNumber,
                      column: event.column,
                      readOnly: event.readOnly,
                    },
                  },
                };
              }

              if (existingFile) {
                const now = Date.now();
                enq.emit({
                  type: 'fileOpened',
                  path: event.path,
                  lineNumber: event.lineNumber,
                  column: event.column,
                  source: event.source,
                  readOnly: event.readOnly ?? existingFile.readOnly,
                });
                return {
                  context: {
                    openFiles: context.openFiles.map((f) =>
                      f.paneId === existingFile.paneId
                        ? { ...f, lastAccessedAt: now, readOnly: event.readOnly ?? f.readOnly }
                        : f,
                    ),
                    activePaneId: existingFile.paneId,
                  },
                };
              }

              const { openFiles, paneId } = withNewPane(context, event);
              enq.emit({
                type: 'fileOpened',
                path: event.path,
                lineNumber: event.lineNumber,
                column: event.column,
                source: event.source,
                readOnly: event.readOnly,
              });
              return { context: { openFiles, activePaneId: paneId } };
            },
            closeFile: ({ context, event }, enq) => {
              const closing = context.openFiles.find((file) => file.path === event.path);
              if (!closing) {
                return {};
              }
              const openFiles = context.openFiles.filter((file) => file.paneId !== closing.paneId);
              let { activePaneId } = context;

              if (context.activePaneId === closing.paneId) {
                activePaneId = openFiles.at(-1)?.paneId;
                const newActive = openFiles.find((f) => f.paneId === activePaneId);
                if (activePaneId !== undefined && newActive) {
                  enq.emit({ type: 'fileOpened', path: newActive.path });
                }
              }

              return { context: { openFiles, activePaneId } };
            },
            setActiveFile: ({ context, event }, enq) => {
              const target = context.openFiles.find((f) => f.path === event.path);
              if (!target || context.activePaneId === target.paneId) {
                return {};
              }
              enq.emit({ type: 'fileOpened', path: target.path });
              return {
                context: {
                  openFiles: context.openFiles.map((f) =>
                    f.paneId === target.paneId ? { ...f, lastAccessedAt: Date.now() } : f,
                  ),
                  activePaneId: target.paneId,
                },
              };
            },
            revealFileInTree: ({ event }, enq) => {
              enq.emit({ type: 'fileRevealRequested', path: event.path, expandTarget: event.expandTarget });
              return {};
            },
            revealModelComponentInExplorer: ({ event }, enq) => {
              enq.emit({
                type: 'modelComponentRevealRequested',
                entryPath: event.entryPath,
                unitId: event.unitId,
                componentId: event.componentId,
              });
              return {};
            },
            revealModelComponentInKinematics: ({ event }, enq) => {
              enq.emit({
                type: 'kinematicsRevealRequested',
                entryPath: event.entryPath,
                unitId: event.unitId,
                componentId: event.componentId,
              });
              return {};
            },
            renameFile: ({ context, event }, enq) => {
              const { oldPath, newPath } = event;

              // Rewrite path in place on each affected pane. Pane identity
              // (paneId) is preserved — only the `path` and `name` properties
              // mutate. This is the key invariant that lets the editor + viewer
              // surfaces survive a rename without React unmount.
              const openFiles = context.openFiles.map((file) => {
                if (file.path === oldPath) {
                  return { ...file, path: newPath, name: newPath.split('/').pop() ?? newPath };
                }
                if (file.path.startsWith(`${oldPath}/`)) {
                  const newFilePath = `${newPath}${file.path.slice(oldPath.length)}`;
                  return { ...file, path: newFilePath, name: newFilePath.split('/').pop() ?? newFilePath };
                }
                return file;
              });

              const activePath = selectActiveFilePath(context.openFiles, context.activePaneId);
              const activeWasAffected = activePath === oldPath || activePath?.startsWith(`${oldPath}/`);
              if (activeWasAffected) {
                enq.emit({
                  type: 'fileOpened',
                  path: activePath === oldPath ? newPath : `${newPath}${activePath?.slice(oldPath.length) ?? ''}`,
                });
              }

              return {
                context: {
                  openFiles,
                  fileSidebars: rekeyFileSidebarsForRename(context.fileSidebars, oldPath, newPath),
                },
              };
            },
            closeAll: { context: { openFiles: [], activePaneId: undefined } },
            setFocusedChatId: { context: ({ event }) => ({ focusedChatId: event.chatId }) },
            setPanelState: {
              context: ({ context, event }) => ({ panelState: mergePanelState(context.panelState, event.panelState) }),
            },
            setPreviousLayout: { context: ({ event }) => ({ previousLayout: event.layout }) },
            setFileSidebarWidth: {
              context: ({ context, event }) => ({
                fileSidebars: { ...context.fileSidebars, [event.path]: event.width },
              }),
            },
            setGraphicsBackendPreference: {
              context: ({ context, event }) => ({
                graphicsBackendPreferences: { ...context.graphicsBackendPreferences, [event.viewId]: event.preference },
              }),
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                flushNow: ({ context }) => (context.error === undefined ? undefined : { target: 'writing' }),
                openFile: debounceWrite,
                closeFile: debounceWrite,
                closeAll: debounceWrite,
                setActiveFile: debounceWrite,
                renameFile: debounceWrite,
                setFocusedChatId: debounceWrite,
                setPanelState: debounceWrite,
                setPreviousLayout: debounceWrite,
                setFileSidebarWidth: debounceWrite,
                setGraphicsBackendPreference: debounceWrite,
                registerMaterialiseModel: debounceWrite,
              },
            },
            pending: {
              after: {
                storeDebounce: { target: 'writing' },
              },
              on: {
                openFile: restartDebounce,
                closeFile: restartDebounce,
                closeAll: restartDebounce,
                setActiveFile: restartDebounce,
                renameFile: restartDebounce,
                setFocusedChatId: restartDebounce,
                setPanelState: restartDebounce,
                setPreviousLayout: restartDebounce,
                setFileSidebarWidth: restartDebounce,
                setGraphicsBackendPreference: restartDebounce,
                registerMaterialiseModel: restartDebounce,
                // Immediately bypass debounce and write
                flushNow: { target: 'writing' },
              },
            },
            writing: {
              invoke: {
                src: 'saveEditorStateActor',
                input: ({ context }) => ({
                  editorState: {
                    projectId: context.projectId,
                    openFiles: context.openFiles,
                    activePaneId: context.activePaneId,
                    focusedChatId: context.focusedChatId,
                    panelState: context.panelState,
                    fileSidebars: context.fileSidebars,
                    graphicsBackendPreferences: context.graphicsBackendPreferences,
                    previousLayout: context.previousLayout,
                  },
                }),
                onDone: ({ context }) =>
                  context.hasPendingChanges
                    ? { target: 'pending', context: { error: undefined, hasPendingChanges: false } }
                    : { target: 'idle', context: { error: undefined } },
                onError: ({ event }) => ({
                  target: 'idle',
                  context: { error: errorOf(event.error, 'Unknown error'), isLoading: false, hasPendingChanges: false },
                }),
              },
              on: {
                // Track mutations during write so we persist again after completion
                openFile: markPendingChanges,
                closeFile: markPendingChanges,
                closeAll: markPendingChanges,
                setActiveFile: markPendingChanges,
                renameFile: markPendingChanges,
                setFocusedChatId: markPendingChanges,
                setPanelState: markPendingChanges,
                setPreviousLayout: markPendingChanges,
                setFileSidebarWidth: markPendingChanges,
                setGraphicsBackendPreference: markPendingChanges,
                registerMaterialiseModel: markPendingChanges,
              },
            },
          },
        },
      },
    },
  },
});

export type EditorStateMachineRef = ActorRefFrom<typeof editorMachine>;
