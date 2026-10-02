import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import type { EditorState } from '#types/editor.types.js';
import { defaultPanelState } from '#constants/editor.constants.js';
import { editorMachine } from '#machines/editor.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const stubPaneIdMain = 'pane-main';
const stubPaneIdUtils = 'pane-utils';

const stubEditorState: EditorState = {
  projectId: 'test-build',
  openFiles: [
    { paneId: stubPaneIdMain, path: 'src/main.ts', name: 'main.ts', lastAccessedAt: 1000 },
    { paneId: stubPaneIdUtils, path: 'src/utils.ts', name: 'utils.ts', lastAccessedAt: 2000 },
  ],
  activePaneId: stubPaneIdMain,
  focusedChatId: 'chat-1',
  panelState: defaultPanelState,
  editorLayout: undefined,
  viewerLayout: undefined,
  viewSettings: {},
  updatedAt: Date.now(),
};

function selectActivePath(context: {
  openFiles: ReadonlyArray<{ paneId: string; path: string }>;
  activePaneId: string | undefined;
}): string | undefined {
  if (context.activePaneId === undefined) {
    return undefined;
  }
  return context.openFiles.find((f) => f.paneId === context.activePaneId)?.path;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

type EnsureFocusedChatInput = { projectId: string; candidateFocusedChatId: string | undefined };
type EnsureFocusedChatResult = { type: 'focusedChatEnsured'; focusedChatId: string };

/**
 * Default `ensureFocusedChatActor` behaviour used by the test factory:
 * passes the candidate through when defined, otherwise auto-creates a
 * stable test id. Tests that exercise the ensure path explicitly should
 * override via `ensureResult`.
 */
const defaultEnsureFocusedChat = async (input: EnsureFocusedChatInput): Promise<EnsureFocusedChatResult> => ({
  type: 'focusedChatEnsured',
  focusedChatId: input.candidateFocusedChatId ?? 'chat-default',
});

function createTestActor(options?: {
  loadResult?: EditorState | undefined | (() => Promise<EditorState | undefined>);
  saveResult?: () => Promise<void>;
  ensureResult?: (input: EnsureFocusedChatInput) => Promise<EnsureFocusedChatResult>;
  projectId?: string;
}) {
  const loadResult = options?.loadResult;
  const loadFunction = typeof loadResult === 'function' ? loadResult : async () => loadResult;
  const ensureFunction = options?.ensureResult ?? defaultEnsureFocusedChat;

  const machine = editorMachine.provide({
    actors: {
      loadEditorStateActor: fromSafeAsync(async () => {
        const state = await loadFunction();
        return { type: 'editorStateRetrieved', state };
      }),
      ensureFocusedChatActor: fromSafeAsync(async ({ input }) => ensureFunction(input)),
      ...(options?.saveResult
        ? {
            saveEditorStateActor: fromSafeAsync(async () => {
              await options.saveResult!();
            }),
          }
        : {}),
    },
  });

  return createActor(machine, {
    input: { projectId: options?.projectId ?? 'test-build' },
  });
}

async function startAndLoad(options?: Parameters<typeof createTestActor>[0]) {
  const actor = createTestActor(options);
  actor.start();
  actor.send({ type: 'load' });
  await waitFor(actor, (s) => s.matches({ ready: {} }));
  return actor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('editorMachine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // State: idle
  // =========================================================================
  describe('idle', () => {
    it('should start in idle state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should transition to loading on load event', () => {
      const actor = createTestActor({
        // oxlint-disable-next-line no-empty-function, typescript-eslint/promise-function-async -- mock never-resolving promise
        loadResult: () => new Promise(() => {}),
      });
      actor.start();
      actor.send({ type: 'load' });
      expect(actor.getSnapshot().matches({ loading: 'hydrating' })).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // State: loading
  // =========================================================================
  describe('loading', () => {
    it('should transition to ready after successful load', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      expect(actor.getSnapshot().matches({ ready: {} })).toBe(true);
      actor.stop();
    });

    it('should set loaded state in context', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toEqual(stubEditorState.openFiles);
      expect(selectActivePath(context)).toBe('src/main.ts');
      expect(context.activePaneId).toBe(stubPaneIdMain);
      expect(context.panelState).toEqual(defaultPanelState);
      actor.stop();
    });

    it('should handle load with undefined state', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toEqual([]);
      expect(context.activePaneId).toBeUndefined();
      expect(selectActivePath(context)).toBeUndefined();
      expect(context.panelState).toEqual(defaultPanelState);
      actor.stop();
    });

    it('should emit editorStateLoaded on successful load', async () => {
      const actor = createTestActor({ loadResult: stubEditorState });
      actor.start();
      const emitted: unknown[] = [];
      actor.on('editorStateLoaded', (event) => emitted.push(event));

      actor.send({ type: 'load' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ type: 'editorStateLoaded' });
      actor.stop();
    });

    it('should transition to ready even on load error (graceful degradation)', async () => {
      const actor = createTestActor({
        loadResult: async () => {
          throw new Error('load failed');
        },
      });
      actor.start();
      actor.send({ type: 'load' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().matches({ ready: {} })).toBe(true);
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – file operations
  // =========================================================================
  describe('ready – file operations', () => {
    it('should open a new file', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({ type: 'openFile', path: 'src/new.ts', source: 'user' });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toHaveLength(1);
      expect(context.openFiles[0]).toMatchObject({ path: 'src/new.ts', name: 'new.ts' });
      expect(context.openFiles[0]!.lastAccessedAt).toBeGreaterThan(0);
      actor.stop();
    });

    it('should set active file on open', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({ type: 'openFile', path: 'src/new.ts', source: 'user' });
      expect(selectActivePath(actor.getSnapshot().context)).toBe('src/new.ts');
      actor.stop();
    });

    it('should close a file and update active file', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      expect(actor.getSnapshot().context.openFiles).toHaveLength(2);

      actor.send({ type: 'closeFile', path: 'src/main.ts' });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toHaveLength(1);
      expect(selectActivePath(context)).toBe('src/utils.ts');
      actor.stop();
    });

    it('should close all files', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      actor.send({ type: 'closeAll' });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toHaveLength(0);
      expect(context.activePaneId).toBeUndefined();
      actor.stop();
    });

    it('should rename a file in openFiles while preserving the tab identity', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      const paneIdBefore = actor.getSnapshot().context.activePaneId;
      actor.send({ type: 'renameFile', oldPath: 'src/main.ts', newPath: 'src/index.ts' });
      const { context } = actor.getSnapshot();
      const renamed = context.openFiles.find((f) => f.path === 'src/index.ts');
      expect(renamed).toBeDefined();
      expect(renamed!.name).toBe('index.ts');
      expect(renamed!.paneId).toBe(paneIdBefore);
      expect(context.activePaneId).toBe(paneIdBefore);
      expect(selectActivePath(context)).toBe('src/index.ts');
      actor.stop();
    });

    it('should emit fileOpened event', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      const emitted: unknown[] = [];
      actor.on('fileOpened', (event) => emitted.push(event));

      actor.send({ type: 'openFile', path: 'src/test.ts', source: 'user' });
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ type: 'fileOpened', path: 'src/test.ts' });
      actor.stop();
    });

    it('should rewrite every nested tab in place on a directory rename, preserving tab identities', async () => {
      // Reproduces F22 / R3 — folder rename must move ALL open
      // tabs under that folder without remounting them. Identity is
      // captured via `paneId`; the test asserts both the path
      // migration and the stable paneId set.
      const nestedState: EditorState = {
        ...stubEditorState,
        openFiles: [
          { paneId: 'pane-a', path: 'src/foo/a.ts', name: 'a.ts', lastAccessedAt: 1000 },
          { paneId: 'pane-b', path: 'src/foo/nested/b.ts', name: 'b.ts', lastAccessedAt: 2000 },
          { paneId: 'pane-keep', path: 'src/keep.ts', name: 'keep.ts', lastAccessedAt: 3000 },
        ],
        activePaneId: 'pane-b',
      };
      const actor = await startAndLoad({ loadResult: nestedState });
      const paneIdsBefore = new Set(actor.getSnapshot().context.openFiles.map((f) => f.paneId));

      actor.send({ type: 'renameFile', oldPath: 'src/foo', newPath: 'src/bar' });

      const { context } = actor.getSnapshot();
      const byTab = new Map(context.openFiles.map((f) => [f.paneId, f]));
      expect(byTab.get('pane-a')?.path).toBe('src/bar/a.ts');
      expect(byTab.get('pane-a')?.name).toBe('a.ts');
      expect(byTab.get('pane-b')?.path).toBe('src/bar/nested/b.ts');
      expect(byTab.get('pane-b')?.name).toBe('b.ts');
      expect(byTab.get('pane-keep')?.path).toBe('src/keep.ts');
      const paneIdsAfter = new Set(context.openFiles.map((f) => f.paneId));
      expect(paneIdsAfter).toEqual(paneIdsBefore);
      expect(context.activePaneId).toBe('pane-b');
      expect(selectActivePath(context)).toBe('src/bar/nested/b.ts');
      actor.stop();
    });

    it('should close the active tab and pick a new active tab on closeFile', async () => {
      const nestedState: EditorState = {
        ...stubEditorState,
        openFiles: [
          { paneId: 'pane-x', path: 'a.ts', name: 'a.ts', lastAccessedAt: 1000 },
          { paneId: 'pane-y', path: 'b.ts', name: 'b.ts', lastAccessedAt: 2000 },
        ],
        activePaneId: 'pane-x',
      };
      const actor = await startAndLoad({ loadResult: nestedState });
      actor.send({ type: 'closeFile', path: 'a.ts' });
      const { context } = actor.getSnapshot();
      expect(context.openFiles).toHaveLength(1);
      expect(context.activePaneId).toBe('pane-y');
      actor.stop();
    });
  });

  // =========================================================================
  // State: ready – panel state
  // =========================================================================
  describe('ready – panel state', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- file path keys in paneview test fixtures */
    it('should update panel state with deep merge', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({
        type: 'setPanelState',
        panelState: { openPanels: { files: true } },
      });
      const { context } = actor.getSnapshot();
      expect(context.panelState.openPanels.files).toBe(true);
      expect(context.panelState.openPanels.chat).toBe(true);
      actor.stop();
    });

    it('should shallow-merge kernelPaneview into panel state', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({
        type: 'setPanelState',
        panelState: {
          kernelPaneview: { 'main.ts': { isExpanded: true, size: 200 } },
        },
      });
      expect(actor.getSnapshot().context.panelState.kernelPaneview).toEqual({
        'main.ts': { isExpanded: true, size: 200 },
      });

      actor.send({
        type: 'setPanelState',
        panelState: {
          kernelPaneview: { 'other.ts': { isExpanded: false, size: 80 } },
        },
      });
      expect(actor.getSnapshot().context.panelState.kernelPaneview).toEqual({
        'main.ts': { isExpanded: true, size: 200 },
        'other.ts': { isExpanded: false, size: 80 },
      });
      actor.stop();
    });

    it('should shallow-merge parametersPaneview into panel state', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({
        type: 'setPanelState',
        panelState: {
          parametersPaneview: { 'index.ts': { isExpanded: true, size: 150 } },
        },
      });
      expect(actor.getSnapshot().context.panelState.parametersPaneview).toEqual({
        'index.ts': { isExpanded: true, size: 150 },
      });
      actor.stop();
    });

    it('should preserve other panel state fields when merging paneview state', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({
        type: 'setPanelState',
        panelState: { openPanels: { files: true } },
      });
      actor.send({
        type: 'setPanelState',
        panelState: {
          kernelPaneview: { 'main.ts': { isExpanded: true, size: 200 } },
        },
      });

      const { panelState } = actor.getSnapshot().context;
      expect(panelState.openPanels.files).toBe(true);
      expect(panelState.openPanels.chat).toBe(true);
      expect(panelState.kernelPaneview).toEqual({
        'main.ts': { isExpanded: true, size: 200 },
      });
      expect(panelState.parametersPaneview).toEqual({});
      actor.stop();
    });
    /* eslint-enable @typescript-eslint/naming-convention -- file path keys in paneview test fixtures */
  });

  // =========================================================================
  // State: ready – storing (debounce)
  // =========================================================================
  describe('ready – storing', () => {
    it('should enter pending after file operation', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({ type: 'openFile', path: 'src/a.ts', source: 'user' });
      expect(actor.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);
      actor.stop();
    });

    it('should enter pending after closeAll', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      expect(actor.getSnapshot().context.openFiles).toHaveLength(2);

      actor.send({ type: 'closeAll' });
      expect(actor.getSnapshot().context.openFiles).toHaveLength(0);
      expect(actor.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);
      actor.stop();
    });

    it('should write after debounce elapses', async () => {
      vi.useFakeTimers();
      try {
        let writeCallCount = 0;
        const actor = await startAndLoad({
          loadResult: undefined,
          saveResult: async () => {
            writeCallCount++;
          },
        });

        actor.send({ type: 'openFile', path: 'src/a.ts', source: 'user' });
        expect(actor.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);

        await vi.advanceTimersByTimeAsync(500);

        const snapshot = await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
        expect(snapshot.matches({ ready: { storing: 'idle' } })).toBe(true);
        expect(writeCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should flush on flushNow', async () => {
      vi.useFakeTimers();
      try {
        let writeCallCount = 0;
        const actor = await startAndLoad({
          loadResult: undefined,
          saveResult: async () => {
            writeCallCount++;
          },
        });

        actor.send({ type: 'openFile', path: 'src/a.ts', source: 'user' });
        expect(actor.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);

        actor.send({ type: 'flushNow' });
        expect(actor.getSnapshot().matches({ ready: { storing: 'writing' } })).toBe(true);

        await vi.advanceTimersByTimeAsync(0);
        await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));
        expect(writeCallCount).toBe(1);
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // =========================================================================
  // State: ready – focused chat
  // =========================================================================
  describe('ready – focused chat', () => {
    it('should set focusedChatId when setFocusedChatId is dispatched', async () => {
      const actor = await startAndLoad({ loadResult: undefined });
      actor.send({ type: 'setFocusedChatId', chatId: 'chat-42' });
      expect(actor.getSnapshot().context.focusedChatId).toBe('chat-42');
      actor.stop();
    });

    it('self-heals focusedChatId=undefined at runtime via ensureFocusedChatActor', async () => {
      const actor = await startAndLoad({
        loadResult: stubEditorState,
        ensureResult: async (input) => ({
          type: 'focusedChatEnsured',
          focusedChatId: input.candidateFocusedChatId ?? 'chat-recovered',
        }),
      });
      expect(actor.getSnapshot().context.focusedChatId).toBe('chat-1');

      // Simulate the last-chat-deletion path that previously left
      // focusedChatId undefined and crashed the route gate.
      actor.send({ type: 'setFocusedChatId', chatId: undefined });

      // The `always` guard on `ready.operation.idle` re-enters
      // `ensuringFocusedChat`, which immediately resolves with the
      // healing value.
      await waitFor(actor, (s) => s.context.focusedChatId !== undefined);
      expect(actor.getSnapshot().context.focusedChatId).toBe('chat-recovered');
      expect(actor.getSnapshot().matches({ ready: { operation: 'idle' } })).toBe(true);
      actor.stop();
    });

    it('should hydrate focusedChatId from loaded EditorState', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });
      expect(actor.getSnapshot().context.focusedChatId).toBe('chat-1');
      actor.stop();
    });

    it('should persist focusedChatId via the storing region', async () => {
      vi.useFakeTimers();
      try {
        let savedFocusedChatId: string | undefined;
        const actor = await startAndLoad({
          loadResult: undefined,
          // oxlint-disable-next-line require-await -- save actor must be async
          saveResult: async () => {
            savedFocusedChatId = actor.getSnapshot().context.focusedChatId;
          },
        });

        actor.send({ type: 'setFocusedChatId', chatId: 'chat-42' });
        expect(actor.getSnapshot().matches({ ready: { storing: 'pending' } })).toBe(true);

        await vi.advanceTimersByTimeAsync(500);
        await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));

        expect(savedFocusedChatId).toBe('chat-42');
        actor.stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // =========================================================================
  // State: ready – reload
  // =========================================================================
  describe('ready – reload', () => {
    it('should reload with new projectId', async () => {
      const loadResults = [stubEditorState, { ...stubEditorState, projectId: 'new-build', openFiles: [] }];
      let loadIndex = 0;
      const actor = await startAndLoad({
        loadResult: async () => loadResults[loadIndex++],
      });

      expect(actor.getSnapshot().context.projectId).toBe('test-build');
      actor.send({ type: 'reload', projectId: 'new-build' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));
      expect(actor.getSnapshot().context.projectId).toBe('new-build');
      expect(actor.getSnapshot().context.openFiles).toEqual([]);
      actor.stop();
    });
  });

  // =========================================================================
  describe('ready – LRU eviction', () => {
    it('should evict least-recently-accessed tab when opening 201st file', async () => {
      const files = Array.from({ length: 200 }, (_, i) => ({
        paneId: `pane-${i}`,
        path: `src/file-${i}.ts`,
        name: `file-${i}.ts`,
        lastAccessedAt: i,
      }));
      const fullState: EditorState = {
        ...stubEditorState,
        openFiles: files,
        activePaneId: files.at(-1)!.paneId,
      };
      const actor = await startAndLoad({ loadResult: fullState });

      expect(actor.getSnapshot().context.openFiles).toHaveLength(200);

      actor.send({ type: 'openFile', path: 'src/new-file.ts', source: 'user' });
      const { context } = actor.getSnapshot();

      expect(context.openFiles).toHaveLength(200);
      expect(context.openFiles.find((f) => f.path === 'src/new-file.ts')).toBeDefined();
      // File-0 had lastAccessedAt=0, so it should be evicted
      expect(context.openFiles.find((f) => f.path === 'src/file-0.ts')).toBeUndefined();
      actor.stop();
    });

    it('should update lastAccessedAt when focusing an existing tab', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });

      const beforeAccess = actor.getSnapshot().context.openFiles.find((f) => f.path === 'src/utils.ts')!.lastAccessedAt;
      actor.send({ type: 'setActiveFile', path: 'src/utils.ts' });
      const afterAccess = actor.getSnapshot().context.openFiles.find((f) => f.path === 'src/utils.ts')!.lastAccessedAt;

      expect(afterAccess).toBeGreaterThanOrEqual(beforeAccess);
      actor.stop();
    });

    it('should update lastAccessedAt when re-opening an already-open file', async () => {
      const actor = await startAndLoad({ loadResult: stubEditorState });

      const before = actor.getSnapshot().context.openFiles.find((f) => f.path === 'src/main.ts')!.lastAccessedAt;
      actor.send({ type: 'openFile', path: 'src/main.ts', source: 'user' });
      const after = actor.getSnapshot().context.openFiles.find((f) => f.path === 'src/main.ts')!.lastAccessedAt;

      expect(after).toBeGreaterThanOrEqual(before);
      actor.stop();
    });
  });
});

describe('ready – deferred model materialisation', () => {
  it('defers fileOpened until registerMaterialiseModel handler resolves', async () => {
    const actor = await startAndLoad({ loadResult: undefined });
    const opened: unknown[] = [];
    const opening: unknown[] = [];
    actor.on('fileOpened', (event) => opened.push(event));
    actor.on('fileOpening', (event) => opening.push(event));

    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });

    actor.send({
      type: 'registerMaterialiseModel',
      materialiseModel: async () => barrier,
    });

    actor.send({ type: 'openFile', path: 'src/deferred.ts', source: 'user' });

    expect(opening).toHaveLength(1);
    expect(opened).toHaveLength(0);
    expect(actor.getSnapshot().context.openFiles.some((f) => f.path === 'src/deferred.ts')).toBe(false);

    release();
    await waitFor(actor, () => opened.length > 0);
    expect(opened[0]).toMatchObject({ type: 'fileOpened', path: 'src/deferred.ts' });
    expect(actor.getSnapshot().context.openFiles.some((f) => f.path === 'src/deferred.ts')).toBe(true);
    actor.stop();
  });

  it('emits fileOpenFailed when materialise rejects', async () => {
    const actor = await startAndLoad({ loadResult: undefined });
    const failed: unknown[] = [];
    actor.on('fileOpenFailed', (event) => failed.push(event));

    actor.send({
      type: 'registerMaterialiseModel',
      materialiseModel: async () => {
        throw new Error('boom');
      },
    });

    actor.send({ type: 'openFile', path: 'src/broken.ts', source: 'user' });

    await waitFor(actor, () => failed.length > 0);
    expect(failed[0]).toMatchObject({ type: 'fileOpenFailed', path: 'src/broken.ts' });
    expect(actor.getSnapshot().context.openFiles.some((f) => f.path === 'src/broken.ts')).toBe(false);
    actor.stop();
  });

  it('opens new files synchronously when materialiseModel is not registered', async () => {
    const actor = await startAndLoad({ loadResult: undefined });
    const opened: unknown[] = [];
    actor.on('fileOpened', (event) => opened.push(event));

    actor.send({ type: 'openFile', path: 'src/sync.ts', source: 'user' });

    expect(opened).toHaveLength(1);
    expect(actor.getSnapshot().context.openFiles.some((f) => f.path === 'src/sync.ts')).toBe(true);
    actor.stop();
  });
});

// ===========================================================================
// State: loading.ensuringFocusedChat (load-time invariant)
// ===========================================================================
describe('loading.ensuringFocusedChat', () => {
  it('passes through a valid candidate focusedChatId from loaded state', async () => {
    const ensureCalls: Array<{ projectId: string; candidateFocusedChatId: string | undefined }> = [];
    const actor = createTestActor({
      loadResult: stubEditorState,
      ensureResult: async (input) => {
        ensureCalls.push(input);
        return {
          type: 'focusedChatEnsured',
          focusedChatId: input.candidateFocusedChatId ?? 'chat-fallback',
        };
      },
    });
    actor.start();
    actor.send({ type: 'load' });
    await waitFor(actor, (s) => s.matches({ ready: {} }));

    expect(ensureCalls).toHaveLength(1);
    expect(ensureCalls[0]?.candidateFocusedChatId).toBe('chat-1');
    expect(actor.getSnapshot().context.focusedChatId).toBe('chat-1');
    expect(actor.getSnapshot().context.focusedChatError).toBeUndefined();
    actor.stop();
  });

  it('reassigns focusedChatId when ensure picks a different chat (stale candidate)', async () => {
    const actor = createTestActor({
      loadResult: stubEditorState,
      ensureResult: async () => ({ type: 'focusedChatEnsured', focusedChatId: 'chat-most-recent' }),
    });
    actor.start();
    actor.send({ type: 'load' });
    await waitFor(actor, (s) => s.matches({ ready: {} }));

    expect(actor.getSnapshot().context.focusedChatId).toBe('chat-most-recent');
    actor.stop();
  });

  it('adopts a freshly-created focusedChatId for zero-chats projects', async () => {
    const actor = createTestActor({
      loadResult: { ...stubEditorState, focusedChatId: undefined },
      ensureResult: async () => ({ type: 'focusedChatEnsured', focusedChatId: 'chat-newly-created' }),
    });
    actor.start();
    actor.send({ type: 'load' });
    await waitFor(actor, (s) => s.matches({ ready: {} }));

    expect(actor.getSnapshot().context.focusedChatId).toBe('chat-newly-created');
    actor.stop();
  });

  it('surfaces ensure failure via focusedChatError + parks in focusedChatUnresolved', async () => {
    const actor = createTestActor({
      loadResult: stubEditorState,
      ensureResult: async () => {
        throw new Error('ensure exploded');
      },
    });
    actor.start();
    actor.send({ type: 'load' });
    await waitFor(actor, (s) => s.matches({ ready: {} }));
    // Ensure failure on the load path lands in `ready` but with the
    // typed error surfaced and `focusedChatId` still undefined; the
    // runtime always-guard then transitions to `ensuringFocusedChat`.
    expect(actor.getSnapshot().context.focusedChatError?.message).toBe('ensure exploded');
    actor.stop();
  });

  it('persists the ensured focusedChatId via the storing region (raised event)', async () => {
    vi.useFakeTimers();
    try {
      const saves: Array<string | undefined> = [];
      const actor = createTestActor({
        loadResult: { ...stubEditorState, focusedChatId: undefined },
        ensureResult: async () => ({ type: 'focusedChatEnsured', focusedChatId: 'chat-ensured' }),
        // oxlint-disable-next-line require-await -- save actor must be async
        saveResult: async () => {
          saves.push(actor.getSnapshot().context.focusedChatId);
        },
      });
      actor.start();
      actor.send({ type: 'load' });
      await waitFor(actor, (s) => s.matches({ ready: {} }));

      await vi.advanceTimersByTimeAsync(500);
      await waitFor(actor, (s) => s.matches({ ready: { storing: 'idle' } }));

      expect(saves.at(-1)).toBe('chat-ensured');
      actor.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ===========================================================================
// State: ready.operation.ensuringFocusedChat (runtime invariant)
// ===========================================================================
describe('ready.operation.ensuringFocusedChat', () => {
  it('re-enters ensuringFocusedChat from idle when focusedChatId becomes undefined', async () => {
    let ensureInvocationCount = 0;
    const actor = await startAndLoad({
      loadResult: stubEditorState,
      ensureResult: async () => {
        ensureInvocationCount += 1;
        return { type: 'focusedChatEnsured', focusedChatId: `chat-healed-${ensureInvocationCount}` };
      },
    });
    // First invocation came from the load-time ensure.
    expect(ensureInvocationCount).toBe(1);
    expect(actor.getSnapshot().context.focusedChatId).toBe('chat-healed-1');

    // Simulate the last-chat deletion path that clears focusedChatId.
    actor.send({ type: 'setFocusedChatId', chatId: undefined });

    await waitFor(actor, (s) => s.context.focusedChatId === 'chat-healed-2');
    expect(ensureInvocationCount).toBe(2);
    expect(actor.getSnapshot().matches({ ready: { operation: 'idle' } })).toBe(true);
    actor.stop();
  });

  it('parks in focusedChatUnresolved and recovers via retryEnsureFocusedChat', async () => {
    let shouldFail = true;
    const actor = await startAndLoad({
      loadResult: stubEditorState,
      ensureResult: async () => {
        if (shouldFail) {
          throw new Error('ensure offline');
        }
        return { type: 'focusedChatEnsured', focusedChatId: 'chat-after-retry' };
      },
    });

    actor.send({ type: 'setFocusedChatId', chatId: undefined });

    await waitFor(actor, (s) => s.matches({ ready: { operation: 'focusedChatUnresolved' } }));
    expect(actor.getSnapshot().context.focusedChatError?.message).toBe('ensure offline');

    shouldFail = false;
    actor.send({ type: 'retryEnsureFocusedChat' });

    await waitFor(actor, (s) => s.context.focusedChatId === 'chat-after-retry');
    expect(actor.getSnapshot().context.focusedChatError).toBeUndefined();
    expect(actor.getSnapshot().matches({ ready: { operation: 'idle' } })).toBe(true);
    actor.stop();
  });
});
