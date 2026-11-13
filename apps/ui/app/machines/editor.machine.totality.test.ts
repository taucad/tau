/**
 * Totality baseline for the editor machine (MC-R17). It locks today's answers before any state moves: every public
 * event is sampled in every reachable state, and each pair left unanswered must be on `editorIgnoredEvents`. A later
 * change that answers an event removes its pair; this file then fails until it does.
 *
 * A pair names a state where some sampled event of its type goes unanswered. Where another sample of that type is
 * answered there (a mixed pair), the blanket pair cannot tell if that answer stops, so a dedicated row checks it.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value, registered materialiser, set
 * of open tab paths and failed write) and the traversal limit. The effects never settle, so the traversal delivers
 * their answers as built-in events, each only where it can arrive: an invoke's done or error event while its state runs
 * it (the two `ensuringFocusedChat` invokes answer only by event or error) and `storeDebounce` in
 * `ready.storing.pending`. `flushNow` is answered in `ready.storing.idle` only after a failed write, so the baseline
 * names that pair for the state as a whole and the mixed-pair row checks the answer after a failed write.
 * `registerMaterialiseModel` has one sample, since the traversal keys events by their JSON. Path table (the shortest
 * path to each state value, the first row of its projections), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `loading.hydrating`: `load`
 * 3. `loading.ensuringFocusedChat`: then the load's done event
 * 4. `ready`, `operation.idle`: then `focusedChatEnsured`, which raises `setFocusedChatId` and so arms the debounce
 * 5. `ready`, `operation.focusedChatDeferred`: then `focusedChatDeferred`
 * 6. `ready`, `operation.ensuringFocusedChat`: the cold ensure's error, or row 4 and a `setRequestedChatId` for
 *    another chat
 * 7. `ready`, `operation.focusedChatUnresolved`: then the runtime ensure's error event
 * 8. `ready`, `operation.materializingOpenFile`: row 4, `registerMaterialiseModel`, `openFile` for a new tab
 * 9. each `operation` row with `storing.pending` (a write verb), `storing.writing` (`flushNow`) and `storing.idle`
 *    (the write's done event): eighteen state values in all
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { matchesState } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import type { AnyMachineSnapshot, StateValue } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { editorEventTypes, editorIgnoredEvents, editorMachine } from '#machines/editor.machine.js';
import type { EditorStateContext, EditorStateEvent } from '#machines/editor.machine.js';

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in EditorStateEvent['type']]: ReadonlyArray<Extract<EditorStateEvent, { type: T }>> };

const samples: Samples = {
  load: [{ type: 'load' }],
  openFile: [{ type: 'openFile', path: 'main.ts', source: 'user' }],
  /* One sample: the traversal keys events by their JSON, which drops the function, so an `undefined` twin would
   * replace it. */
  registerMaterialiseModel: [{ type: 'registerMaterialiseModel', materialiseModel: async () => undefined }],
  closeFile: [{ type: 'closeFile', path: 'main.ts' }],
  setActiveFile: [{ type: 'setActiveFile', path: 'main.ts' }],
  revealFileInTree: [{ type: 'revealFileInTree', path: 'main.ts' }],
  revealModelComponentInExplorer: [
    { type: 'revealModelComponentInExplorer', entryPath: 'main.ts', unitId: 'main.ts', componentId: 'root' },
  ],
  revealModelComponentInKinematics: [
    { type: 'revealModelComponentInKinematics', entryPath: 'main.ts', unitId: 'main.ts', componentId: 'root' },
  ],
  renameFile: [{ type: 'renameFile', oldPath: 'main.ts', newPath: 'part.ts' }],
  closeAll: [{ type: 'closeAll' }],
  setRequestedChatId: [
    { type: 'setRequestedChatId', chatId: 'chat_2' },
    { type: 'setRequestedChatId', chatId: undefined },
  ],
  focusKnownChat: [{ type: 'focusKnownChat', chatId: 'chat_1' }],
  setFocusedChatId: [
    { type: 'setFocusedChatId', chatId: 'chat_1' },
    { type: 'setFocusedChatId', chatId: undefined },
  ],
  setPanelState: [{ type: 'setPanelState', panelState: {} }],
  setPreviousLayout: [{ type: 'setPreviousLayout', layout: undefined }],
  setFileSidebarWidth: [{ type: 'setFileSidebarWidth', path: 'main.ts', width: 240 }],
  setGraphicsBackendPreference: [{ type: 'setGraphicsBackendPreference', viewId: 'view_1', preference: 'webgl' }],
  flushNow: [{ type: 'flushNow' }],
  editorStateRetrieved: [{ type: 'editorStateRetrieved', state: undefined }],
  focusedChatEnsured: [{ type: 'focusedChatEnsured', focusedChatId: 'chat_1' }],
  focusedChatDeferred: [{ type: 'focusedChatDeferred' }],
  retryEnsureFocusedChat: [{ type: 'retryEnsureFocusedChat' }],
};

/** Every effect settles only when the traversal delivers its built-in answer. */
const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const machine = editorMachine.provide({
  actors: {
    loadEditorStateActor: pending,
    saveEditorStateActor: pending,
    materialiseOpenFileActor: pending,
    ensureFocusedChatActor: pending,
  },
});
const events: readonly EditorStateEvent[] = Object.values(samples).flat();

const builtIn = (types: readonly string[]): readonly EditorStateEvent[] =>
  types.map((type) =>
    type.startsWith('xstate.error.') ? { type, error: new Error('effect failed') } : { type },
  ) as unknown as readonly EditorStateEvent[];
/** The invokes, by the state that runs them, and whether each has an `onDone`. */
const invokes = [
  ['loading.hydrating', true],
  ['loading.ensuringFocusedChat', false],
  ['ready.operation.materializingOpenFile', true],
  ['ready.operation.ensuringFocusedChat', false],
  ['ready.storing.writing', true],
] as const;
/** Timers and invoke answers, built in and so never public; offered only in the state that arms or runs them. */
const builtInsAt = (snapshot: AnyMachineSnapshot): readonly EditorStateEvent[] =>
  builtIn([
    ...invokes
      .filter(([state]) => snapshot.matches(state))
      .flatMap(([state, hasDone]) => [
        ...(hasDone ? [`xstate.done.actor.0.editor.${state}`] : []),
        `xstate.error.actor.0.editor.${state}`,
      ]),
    ...(snapshot.matches('ready.storing.pending') ? ['xstate.after.storeDebounce.editor.ready.storing.pending'] : []),
  ]);
const options = {
  input: { projectId: 'proj_1' },
  events: (snapshot: AnyMachineSnapshot) => [...events, ...builtInsAt(snapshot)],
  limit: 50_000,
  /* A registered materialiser, the open tabs and a failed write join the projection: each changes which branch
   * answers. */
  serializeState: (snapshot: AnyMachineSnapshot) => {
    const context = snapshot.context as EditorStateContext;
    return JSON.stringify([
      snapshot.value,
      context.materialiseModel !== undefined,
      [...new Set(context.openFiles.map((file) => file.path))].toSorted(),
      context.error !== undefined,
    ]);
  },
};

/** The active leaf paths of a state value, dotted and joined, e.g. `ready.operation.idle | ready.storing.idle`. */
const leaves = (value: StateValue, prefix = ''): string[] =>
  typeof value === 'string'
    ? [`${prefix}${value}`]
    : Object.entries(value).flatMap(([key, child]) =>
        child === undefined ? [`${prefix}${key}`] : leaves(child, `${prefix}${key}.`),
      );
const dotted = (value: StateValue): string => leaves(value).join(' | ');

describe('editor machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...editorEventTypes].toSorted());
    expect(new Set(editorEventTypes).size).toBe(editorEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    // The projection splits a state value by its context; the first row per value is its shortest path.
    const rows = new Map<string, string[]>();
    for (const row of pathTable(machine, options)) {
      const state = dotted(row.state);
      if (!rows.has(state)) {
        rows.set(
          state,
          row.events.map((event) => event.type),
        );
      }
    }
    const hydrated = ['load', 'xstate.done.actor.0.editor.loading.hydrating'];
    const ensured = [...hydrated, 'focusedChatEnsured'];
    const reopened = [...ensured, 'setRequestedChatId'];
    const materializing = [...ensured, 'registerMaterialiseModel', 'openFile'];
    const deferred = [...hydrated, 'focusedChatDeferred', 'openFile'];
    const unresolved = 'xstate.error.actor.0.editor.ready.operation.ensuringFocusedChat';
    const written = 'xstate.done.actor.0.editor.ready.storing.writing';
    expect(Object.fromEntries(rows)).toEqual({
      idle: [],
      'loading.hydrating': ['load'],
      'loading.ensuringFocusedChat': hydrated,
      'ready.operation.idle | ready.storing.pending': ensured,
      'ready.operation.focusedChatDeferred | ready.storing.idle': [...hydrated, 'focusedChatDeferred'],
      'ready.operation.ensuringFocusedChat | ready.storing.idle': [
        ...hydrated,
        'xstate.error.actor.0.editor.loading.ensuringFocusedChat',
      ],
      'ready.operation.ensuringFocusedChat | ready.storing.pending': reopened,
      'ready.operation.idle | ready.storing.writing': [...ensured, 'flushNow'],
      'ready.operation.focusedChatDeferred | ready.storing.pending': deferred,
      'ready.operation.focusedChatUnresolved | ready.storing.idle': [
        ...hydrated,
        'xstate.error.actor.0.editor.loading.ensuringFocusedChat',
        unresolved,
      ],
      'ready.operation.materializingOpenFile | ready.storing.pending': materializing,
      'ready.operation.ensuringFocusedChat | ready.storing.writing': [...reopened, 'flushNow'],
      'ready.operation.focusedChatUnresolved | ready.storing.pending': [...reopened, unresolved],
      'ready.operation.idle | ready.storing.idle': [...ensured, 'flushNow', written],
      'ready.operation.focusedChatDeferred | ready.storing.writing': [...deferred, 'flushNow'],
      'ready.operation.materializingOpenFile | ready.storing.writing': [...materializing, 'flushNow'],
      'ready.operation.focusedChatUnresolved | ready.storing.writing': [...reopened, 'flushNow', unresolved],
      'ready.operation.materializingOpenFile | ready.storing.idle': [...materializing, 'flushNow', written],
    });
    expect(unreachedStates(machine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: editorIgnoredEvents })).toEqual([]);
  });

  it('should flush after a failed write, which the blanket `flushNow` pair cannot check', () => {
    const failed = getShortestPaths(machine, {
      ...options,
      serializeState: (snapshot: AnyMachineSnapshot) => `${snapshot.status}:${options.serializeState(snapshot)}`,
    })
      .map((path) => path.state)
      .filter(
        (snapshot) =>
          snapshot.status === 'active' &&
          snapshot.matches('ready.storing.idle') &&
          (snapshot.context as EditorStateContext).error !== undefined,
      );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.filter((snapshot) => !snapshot.can({ type: 'flushNow' })).map((snapshot) => snapshot.value)).toEqual(
      [],
    );
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = editorIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
