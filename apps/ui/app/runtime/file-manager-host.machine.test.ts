/**
 * The file-manager host without React (app state orchestration charter D4, D6, D23; plan § 4 A1b; rows S17 to S19).
 *
 * The host resolves Home's backend once, as `resolving → resolved | failed` with `retry`, sends `rootFiles` its
 * `resolveInitialBackend` and emits `homeBackendResolved` for every other pending actor. It knows whether the shared
 * worker is up, and keeps its first fault. Its composition builds actors with the backend as input and owns none.
 */
import { flush, StepClock } from '@taucad/xstate-testing/clock';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { AnyEventObject, EventObject } from 'xstate';
import { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { HomeStorageBackend } from '#filesystem/handle-store.js';
import { noAnalytics } from '#runtime/app-runtime.js';
import {
  createFileManagerHost,
  selectFileManagerHostFault,
  selectHomeBackend,
  selectHomeBackendFailure,
  selectSharedWorkerPresent,
} from '#runtime/file-manager-host.js';
import {
  fileManagerHostEventTypes,
  fileManagerHostIgnoredEvents,
  fileManagerHostMachine,
} from '#runtime/file-manager-host.machine.js';
import type { FileManagerHostEvent, HomeBackendOutcome } from '#runtime/file-manager-host.machine.js';

const faults = vi.hoisted(() => ({ reported: [] as unknown[] }));

vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportAppRuntimeFault: (error: unknown) => {
    faults.reported.push(error);
  },
}));

const rootFilesActors: Array<{ stop: () => void }> = [];

/** `rootFiles` as a real file manager that never initializes, recording what the host sends it. */
const fakeRootFiles = (): Readonly<{ ref: FileManagerRef; events: readonly AnyEventObject[] }> => {
  const events: AnyEventObject[] = [];
  const ref = createActor(fileManagerMachine, {
    input: { rootDirectory: '/', shouldInitializeOnStart: false },
    inspect: (inspection) => {
      if (inspection.type === '@xstate.transition' && inspection.event.type === 'resolveInitialBackend') {
        events.push(inspection.event);
      }
    },
  }).start();
  rootFilesActors.push(ref);
  return { ref, events };
};

/** A backend read that answers each call from the script, in order. */
const scriptedRead = (...outcomes: ReadonlyArray<HomeBackendOutcome | Error>) => {
  const calls = { count: 0 };
  const logic = createAsyncLogic<HomeBackendOutcome>({
    run: async () => {
      const outcome = outcomes[Math.min(calls.count, outcomes.length - 1)]!;
      calls.count += 1;
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
  });
  return { logic, calls };
};

const startHost = (read: ReturnType<typeof scriptedRead>['logic'], rootFiles: FileManagerRef) => {
  const host = createActor(validated(fileManagerHostMachine.provide({ actors: { loadHomeBackend: read } })), {
    input: { rootFiles },
  });
  const emitted = recordEmitted(host);
  host.start();
  return { host, emitted };
};

afterEach(() => {
  for (const rootFiles of rootFilesActors.splice(0)) {
    rootFiles.stop();
  }
  faults.reported.length = 0;
});

describe('file-manager host', () => {
  it('should resolve Home once, send rootFiles the backend and emit it for the other pending actors (S17)', async () => {
    const rootFiles = fakeRootFiles();
    const read = scriptedRead({ status: 'resolved', backend: 'opfs' });
    const { host, emitted } = startHost(read.logic, rootFiles.ref);
    expect(host.getSnapshot().value).toBe('resolving');
    expect(selectHomeBackend(host.getSnapshot())).toBeUndefined();

    await flush();

    expect(host.getSnapshot().value).toBe('resolved');
    expect(selectHomeBackend(host.getSnapshot())).toBe('opfs');
    expect(rootFiles.events).toEqual([{ type: 'resolveInitialBackend', backend: 'opfs' }]);
    expect(emitted).toEqual([{ type: 'homeBackendResolved', backend: 'opfs' }]);
    expect(read.calls.count).toBe(1);
    host.stop();
  });

  it('should fail without a fallback engine, and resolve after retry (S18)', async () => {
    const rootFiles = fakeRootFiles();
    const read = scriptedRead(
      { status: 'failed', message: 'IndexedDB is blocked' },
      { status: 'resolved', backend: 'indexeddb' },
    );
    const { host, emitted } = startHost(read.logic, rootFiles.ref);
    await flush();

    expect(host.getSnapshot().value).toBe('failed');
    expect(selectHomeBackendFailure(host.getSnapshot())).toBe('IndexedDB is blocked');
    expect(selectHomeBackend(host.getSnapshot())).toBeUndefined();
    expect(rootFiles.events).toEqual([]);
    /* A refusal the read reports is modelled: it is not a fault. */
    expect(selectFileManagerHostFault(host.getSnapshot())).toBeUndefined();

    host.send({ type: 'retry' });
    expect(host.getSnapshot().value).toBe('resolving');
    await flush();

    expect(host.getSnapshot().value).toBe('resolved');
    expect(selectHomeBackend(host.getSnapshot())).toBe('indexeddb');
    expect(selectHomeBackendFailure(host.getSnapshot())).toBeUndefined();
    expect(rootFiles.events).toEqual([{ type: 'resolveInitialBackend', backend: 'indexeddb' }]);
    expect(emitted).toEqual([{ type: 'homeBackendResolved', backend: 'indexeddb' }]);
    expect(read.calls.count).toBe(2);
    host.stop();
  });

  it('should keep a read that throws as its first fault, report it once and still offer the retry (D23)', async () => {
    const rootFiles = fakeRootFiles();
    const read = scriptedRead(new Error('handle store defect'), new Error('second defect'), {
      status: 'resolved',
      backend: 'opfs',
    });
    const { host } = startHost(read.logic, rootFiles.ref);
    await flush();

    expect(host.getSnapshot().value).toBe('failed');
    expect(selectFileManagerHostFault(host.getSnapshot())).toBe('handle store defect');
    expect(selectHomeBackendFailure(host.getSnapshot())).toBe('handle store defect');

    host.send({ type: 'retry' });
    await flush();
    expect(host.getSnapshot().value).toBe('failed');
    /* The first fault is kept; the second is its consequence. */
    expect(selectFileManagerHostFault(host.getSnapshot())).toBe('handle store defect');
    expect(faults.reported).toHaveLength(1);

    host.send({ type: 'retry' });
    await flush();
    expect(host.getSnapshot().value).toBe('resolved');
    expect(selectFileManagerHostFault(host.getSnapshot())).toBe('handle store defect');
    host.stop();
  });

  it('should hold the watch child for its life and take no worker report from anyone (D4, MC-R15)', () => {
    const rootFiles = fakeRootFiles();
    const watch = { stopped: 0 };
    const sharedWorker = createCallbackLogic<EventObject, { rootFiles: FileManagerRef }>(() => () => {
      watch.stopped += 1;
    });
    const host = createActor(
      validated(fileManagerHostMachine.provide({ actors: { loadHomeBackend: scriptedRead().logic, sharedWorker } })),
      { input: { rootFiles: rootFiles.ref } },
    ).start();
    // @ts-expect-error -- `workerChanged` was the watch's report; the host no longer takes one from any sender.
    expect(host.getSnapshot().can({ type: 'workerChanged', present: true })).toBe(false);
    host.stop();
    expect(watch.stopped).toBe(1);
  });

  it('should read whether the shared worker is up from rootFiles itself', () => {
    type RootFilesSnapshot = Parameters<typeof selectSharedWorkerPresent>[0];
    expect(selectSharedWorkerPresent(mock<RootFilesSnapshot>({ context: { worker: undefined } }))).toBe(false);
    expect(selectSharedWorkerPresent(mock<RootFilesSnapshot>({ context: { worker: mock<Worker>() } }))).toBe(true);
  });

  it('should keep a watch that throws as its first fault and keep answering (D23)', () => {
    const rootFiles = fakeRootFiles();
    const sharedWorker = createCallbackLogic<EventObject, { rootFiles: FileManagerRef }>(() => {
      throw new Error('watch failed');
    });
    const host = createActor(
      fileManagerHostMachine.provide({ actors: { loadHomeBackend: scriptedRead().logic, sharedWorker } }),
      { input: { rootFiles: rootFiles.ref } },
    ).start();

    expect(selectFileManagerHostFault(host.getSnapshot())).toBe('watch failed');
    expect(faults.reported).toHaveLength(1);
    expect(host.getSnapshot().status).toBe('active');
    host.stop();
  });
});

describe('file-manager host totality', () => {
  type Samples = { [T in FileManagerHostEvent['type']]: ReadonlyArray<Extract<FileManagerHostEvent, { type: T }>> };
  const samples: Samples = {
    retry: [{ type: 'retry' }],
  };

  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...fileManagerHostEventTypes].toSorted());
  });

  it('should answer every public event in every reachable state, but for its declared pairs (MC-R17)', () => {
    expect(
      unansweredEvents(fileManagerHostMachine, {
        input: { rootFiles: fakeRootFiles().ref },
        events: Object.values(samples).flat(),
        limit: 200,
        ignore: fileManagerHostIgnoredEvents,
        serializeState: (snapshot) => JSON.stringify(snapshot.value),
      }),
    ).toEqual([]);
  });

  it('should leave retry unanswered exactly where its ignore table says', async () => {
    const answered = async (outcome: HomeBackendOutcome | undefined): Promise<readonly [string, boolean]> => {
      const read =
        outcome === undefined
          ? createAsyncLogic({ run: async () => Promise.withResolvers<never>().promise })
          : scriptedRead(outcome).logic;
      const { host } = startHost(read as ReturnType<typeof scriptedRead>['logic'], fakeRootFiles().ref);
      await flush();
      const row = [String(host.getSnapshot().value), host.getSnapshot().can({ type: 'retry' })] as const;
      host.stop();
      return row;
    };
    expect(await answered(undefined)).toEqual(['resolving', false]);
    expect(await answered({ status: 'resolved', backend: 'opfs' })).toEqual(['resolved', false]);
    expect(await answered({ status: 'failed', message: 'blocked' })).toEqual(['failed', true]);
    expect(fileManagerHostIgnoredEvents).toEqual([
      ['resolving', 'retry'],
      ['resolved', 'retry'],
    ]);
  });
});

describe('file-manager host composition', () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) {
      stop();
    }
  });

  /* The host's composition over a running host, as the runtime spawns it beside `rootFiles`. */
  const composeHost = (backend: Promise<HomeStorageBackend>) => {
    const host = createFileManagerHost({ analytics: noAnalytics, loadHomeBackend: async () => backend });
    /* A real `rootFiles`, never asked to connect: the worker watch reads its snapshots. */
    const rootFiles = createActor(fileManagerMachine, {
      input: { rootDirectory: '/', backendResolution: 'pending', shouldInitializeOnStart: false },
    });
    rootFiles.start();
    const ref = createActor(host.logic, { input: { rootFiles } }).start();
    stops.push(() => {
      ref.stop();
      rootFiles.stop();
    });
    return { host, ref, rootFiles };
  };

  it('should build an actor for Home with the resolved backend as input', async () => {
    const { host, ref } = composeHost(Promise.resolve('opfs'));
    await flush();
    const built = host.build(
      ref,
      { rootDirectory: '/projects/p1', projectId: 'p1', backend: 'home', shouldInitializeOnStart: false },
      {},
    );
    built.actor.start();
    expect(built.actor.getSnapshot().context.backendType).toBe('opfs');
    expect(built.actor.getSnapshot().context.rootDirectory).toBe('/projects/p1');
    expect(built.actor.getSnapshot().context.projectId).toBe('p1');
    built.actor.stop();
    built.dispose();
  });

  it('should send an actor built while Home resolves its backend once, and none after its release', async () => {
    const selection = Promise.withResolvers<HomeStorageBackend>();
    const { host, ref } = composeHost(selection.promise);
    const sent: AnyEventObject[] = [];
    const clock = new StepClock();
    const spec = { rootDirectory: '/projects/p1', backend: 'home', shouldInitializeOnStart: false } as const;
    const pending = host.build(ref, spec, {
      clock,
      inspect: (inspection) => {
        if (inspection.type === '@xstate.transition' && inspection.event.type === 'resolveInitialBackend') {
          sent.push(inspection.event);
        }
      },
    });
    const released = host.build(ref, spec, {});
    released.dispose();
    pending.actor.start();
    released.actor.start();
    expect(pending.actor.getSnapshot().context.backendType).toBeUndefined();

    selection.resolve('indexeddb');
    await flush();

    expect(pending.actor.getSnapshot().context.backendType).toBe('indexeddb');
    expect(sent).toEqual([{ type: 'resolveInitialBackend', backend: 'indexeddb' }]);
    expect(released.actor.getSnapshot().context.backendType).toBeUndefined();
    pending.actor.stop();
    released.actor.stop();
    pending.dispose();
  });

  it('should build an actor for an explicit backend without waiting for Home', () => {
    const { host, ref } = composeHost(Promise.withResolvers<HomeStorageBackend>().promise);
    const built = host.build(
      ref,
      { rootDirectory: '/previews/x', backend: 'memory', shouldInitializeOnStart: false },
      {},
    );
    expect(built.actor.getSnapshot().context.backendType).toBe('memory');
    built.dispose();
  });

  it('should give rootFiles the root and wait for Home as its input', () => {
    const { host } = composeHost(Promise.withResolvers<HomeStorageBackend>().promise);
    expect(host.rootFilesInput()).toEqual(
      expect.objectContaining({ rootDirectory: '/', backendResolution: 'pending', sharedWorker: undefined }),
    );
    expect(host.sharedWorker()).toBeUndefined();
  });
});
