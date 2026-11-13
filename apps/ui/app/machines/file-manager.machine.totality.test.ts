/**
 * Totality baseline for the file manager machine (MC-R17). It locks today's answers before any state moves: every
 * public event is sampled in every reachable state, and each pair left unanswered must be on
 * `fileManagerIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until it
 * does.
 *
 * A pair names a state where some sampled event of its type goes unanswered. Where another sample of that type is
 * answered there (a mixed pair), the blanket pair cannot tell if that answer stops, so a dedicated row checks it.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value, root and reported webaccess
 * failure) and the traversal limit. The effects never settle, so the traversal delivers their answers as built-in
 * events, each only where it can arrive: the connect and init invokes' done or error events in `connectingWorker` and
 * `initializingServices`, and in `ready` the proxy watch's error and `restartWindow`. `setRoot` is sampled with the
 * current root and a new one; the live states answer only a new root, so the baseline names `setRoot` for each of them,
 * and the mixed-pair row checks that each answers a new root. The worker and service payloads are opaque stand-ins: the
 * machine only stores them. The input is a root mount with the default `indexeddb` backend. Path table (the shortest
 * path to each state value, the first row of its projections), kept current with `pathTable`:
 *
 * 1. `initializing`: initial
 * 2. `connectingWorker`: `initialize`
 * 3. `initializingServices`: then the connect step's done event
 * 4. `error`: `initialize`, the connect step's error event
 * 5. `ready`: from row 3, the init step's done event
 * 6. `webAccessUnavailable`: from row 3, `webAccessUnavailable`, then the init step's done event
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createCallbackLogic, matchesState } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import type { AnyMachineSnapshot } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { fileManagerEventTypes, fileManagerIgnoredEvents, fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileManagerEvent } from '#machines/file-manager.machine.js';

vi.mock('#machines/file-manager.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
    public postMessage = vi.fn();
    public addEventListener = vi.fn();
    public removeEventListener = vi.fn();
  },
}));

type Event<T extends FileManagerEvent['type']> = Extract<FileManagerEvent, { type: T }>;

/** Opaque host objects: the machine only stores them, so a typed stand-in is enough to sample the event. */
const host = <T>(): T => mock<T>();

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in FileManagerEvent['type']]: ReadonlyArray<Event<T>> };

const samples: Samples = {
  initialize: [{ type: 'initialize' }],
  resolveInitialBackend: [{ type: 'resolveInitialBackend', backend: 'indexeddb' }],
  /* The current root, which a live state does not answer, and a new one, which it does. */
  setRoot: [
    { type: 'setRoot', path: '/projects/a', projectId: 'a' },
    { type: 'setRoot', path: '/projects/b', projectId: 'b' },
  ],
  setBackendType: [{ type: 'setBackendType', backendType: 'indexeddb' }],
  reloadWorkspace: [{ type: 'reloadWorkspace' }],
  workerConnected: [
    {
      type: 'workerConnected',
      worker: host<Event<'workerConnected'>['worker']>(),
      proxy: host<Event<'workerConnected'>['proxy']>(),
      bridgeDispose: () => undefined,
      openFileSystemBridge: host<Event<'workerConnected'>['openFileSystemBridge']>(),
      openComputeBinding: host<Event<'workerConnected'>['openComputeBinding']>(),
      openComputeStorePort: host<Event<'workerConnected'>['openComputeStorePort']>(),
      computeControl: host<Event<'workerConnected'>['computeControl']>(),
      openRevisionSessionPort: host<Event<'workerConnected'>['openRevisionSessionPort']>(),
    },
  ],
  workerInitialized: [
    {
      type: 'workerInitialized',
      configuredBackend: 'indexeddb',
      activeWorkspaceId: undefined,
      activeWorkspaceName: undefined,
      contentService: host<Event<'workerInitialized'>['contentService']>(),
      treeService: host<Event<'workerInitialized'>['treeService']>(),
      viewClient: host<Event<'workerInitialized'>['viewClient']>(),
      workerChangeChannel: host<Event<'workerInitialized'>['workerChangeChannel']>(),
      disposeComposedView: () => undefined,
    },
  ],
  webAccessUnavailable: [
    { type: 'webAccessUnavailable', reason: 'permission', activeWorkspaceId: 'wsp_1', activeWorkspaceName: 'Parts' },
  ],
};

/** Every effect settles only when the traversal delivers its built-in answer. */
const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const machine = fileManagerMachine.provide({
  actors: {
    connectWorkerActor: pending,
    initializeServicesActor: pending,
    watchProxyClosedActor: pending,
    observeRootDirectoryActor: createCallbackLogic(() => undefined),
  },
});
const events: readonly FileManagerEvent[] = Object.values(samples).flat();

const builtIn = (types: readonly string[]): readonly FileManagerEvent[] =>
  types.map((type) =>
    type.startsWith('xstate.error.') ? { type, error: new Error('effect failed') } : { type },
  ) as unknown as readonly FileManagerEvent[];
/** Timers and invoke answers, built in and so never public; offered only in the state that arms or runs them. */
const builtInsAt = (snapshot: AnyMachineSnapshot): readonly FileManagerEvent[] =>
  builtIn([
    ...['connectingWorker', 'initializingServices'].flatMap((state) =>
      snapshot.matches(state)
        ? [`xstate.done.actor.0.fileManager.${state}`, `xstate.error.actor.0.fileManager.${state}`]
        : [],
    ),
    ...(snapshot.matches('ready')
      ? ['xstate.error.actor.0.fileManager.ready', 'xstate.after.restartWindow.fileManager.ready']
      : []),
  ]);
const options = {
  input: { rootDirectory: '/projects/a', projectId: 'a' },
  events: (snapshot: AnyMachineSnapshot) => [...events, ...builtInsAt(snapshot)],
  limit: 4000,
  /* The root and a reported webaccess failure join the projection: each changes which branch answers. */
  serializeState: (snapshot: AnyMachineSnapshot) => {
    const context = snapshot.context as { rootDirectory: string; unavailableReason: string | undefined };
    return JSON.stringify([snapshot.value, context.rootDirectory, context.unavailableReason !== undefined]);
  },
};

describe('file manager machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...fileManagerEventTypes].toSorted());
    expect(new Set(fileManagerEventTypes).size).toBe(fileManagerEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    // The projection splits a state value by its context; the first row per value is its shortest path.
    const rows = new Map<string, string[]>();
    for (const row of pathTable(machine, options)) {
      const state = JSON.stringify(row.state);
      if (!rows.has(state)) {
        rows.set(
          state,
          row.events.map((event) => event.type),
        );
      }
    }
    const connected = ['initialize', 'xstate.done.actor.0.fileManager.connectingWorker'];
    expect(Object.fromEntries([...rows].map(([state, path]) => [JSON.parse(state) as string, path]))).toEqual({
      initializing: [],
      connectingWorker: ['initialize'],
      initializingServices: connected,
      error: ['initialize', 'xstate.error.actor.0.fileManager.connectingWorker'],
      ready: [...connected, 'xstate.done.actor.0.fileManager.initializingServices'],
      webAccessUnavailable: [
        ...connected,
        'webAccessUnavailable',
        'xstate.done.actor.0.fileManager.initializingServices',
      ],
    });
    expect(unreachedStates(machine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: fileManagerIgnoredEvents })).toEqual([]);
  });

  it('should answer a new root in every live state, which the blanket `setRoot` pairs cannot check', () => {
    const live = ['connectingWorker', 'initializingServices', 'ready', 'webAccessUnavailable'];
    const snapshots = getShortestPaths(machine, {
      ...options,
      serializeState: (snapshot: AnyMachineSnapshot) => `${snapshot.status}:${options.serializeState(snapshot)}`,
    })
      .map((path) => path.state)
      .filter((snapshot) => snapshot.status === 'active' && live.some((state) => snapshot.matches(state)));
    expect(new Set(snapshots.map((snapshot) => snapshot.value as string))).toEqual(new Set(live));
    const refused = snapshots.filter((snapshot) => {
      const { rootDirectory } = snapshot.context as { rootDirectory: string };
      const elsewhere = `${rootDirectory}-elsewhere`;
      return !snapshot.can({ type: 'setRoot', path: elsewhere, projectId: elsewhere });
    });
    expect(refused.map((snapshot) => snapshot.value)).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = fileManagerIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
