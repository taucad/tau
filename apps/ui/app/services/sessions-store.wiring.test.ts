/**
 * A7b: the session owns its revision client, its read connector, its presence and its parking (plan § 4 A7b; charter
 * D4, D5, D23, D26, I5, B7; rows S1 to S5).
 *
 * With the app runtime's wiring, each session starts a `revisions` and a `hostConnector` child on each file manager
 * its `fileManager` child opens, from modules loaded on the first start (D5), with the workspace of its own open
 * request (B7) and that file manager's root synchronisation. Its `presence` child reports visibility from
 * `environment` and focus, its parking reaches its own runtime, the revision facts reach the session, and a deferred
 * focused chat is retried once the chats arrive: all with nothing mounted (I5). On `main` the binding's effects did
 * each of these from the mounted project route, so a registry alone did none of them and every row below fails there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';
import { flush, StepClock } from '@taucad/xstate-testing/clock';
import { createSessionsActor } from '#services/sessions-store.js';
import type {
  HostConnectorModule,
  SessionRevisionsModule,
  SessionFileManagerWorker,
  SessionRuntimeFacts,
  SessionsObservable,
  SessionWiring,
} from '#services/sessions-store.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { sessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type * as AppRuntimeFaults from '#runtime/app-runtime-faults.js';
import { createSessionRevisionsPorts } from '#runtime/session-revisions.js';
import type { SessionRevisionsEmitted, SessionRevisionsInput } from '#runtime/session-revisions.js';
import type { HostConnectorInput } from '#runtime/host-connector.js';
import { projectSessionParkWindowMilliseconds } from '#machines/project-session.machine.js';

const faults = vi.hoisted(() => [] as unknown[]);
vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AppRuntimeFaults>()),
  reportAppRuntimeFault: (error: unknown) => {
    faults.push(error);
  },
}));

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const projectId = 'proj_a7b_wiring';

/** A value a row moves; its listeners hear each set, as `environment` reports each visibility change. */
const observable = <T>(initial: T): SessionsObservable<T> & Readonly<{ set: (next: T) => void }> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

type Started<Input> = Readonly<{ input: Input; stopped: () => boolean }>;

type Harness = Readonly<{
  registry: ReturnType<typeof createSessionsActor>;
  clock: StepClock;
  files: SessionFileManagerStandIn[];
  opener: SessionRuntimeOpenerStandIn;
  focusedProject: ReturnType<typeof observable<string | undefined>>;
  documentVisible: ReturnType<typeof observable<boolean>>;
  /** Each `revisions` child started, with its `sendBack`. */
  revisions: Array<
    Started<SessionRevisionsInput> &
      Readonly<{ sendBack: (event: SessionRevisionsEmitted) => void; received: string[] }>
  >;
  /** Each `hostConnector` child started. */
  connectors: Array<Started<HostConnectorInput>>;
  /** Each root synchronisation opened, by the file manager it was opened for. */
  rootSyncs: Array<Readonly<{ syncProjectRoots: () => Promise<void>; closed: () => boolean }>>;
  loads: { revisions: number; hostConnector: number };
}>;

let current: Harness | undefined;

const harness = (
  options: Readonly<{
    facts?: Partial<SessionRuntimeFacts>;
    focused?: string;
    visible?: boolean;
    /** The host's shared worker the session's file managers are built on (none: each is built at once). */
    worker?: SessionFileManagerWorker;
    /** Replace the module loads, as a row that fails one does. */
    loads?: Partial<Pick<SessionWiring, 'loadRevisions' | 'loadHostConnector'>>;
    /** Hold the `revisions` module back until this settles, as a slow chunk does. */
    revisionsArrival?: Promise<void>;
    /** What each stopped `revisions` child's teardown does, as a row that throws from it does. */
    revisionsTeardown?: () => void;
    /** The revision client leaves the session's `quiesce` unanswered (it answers at once otherwise). */
    holdQuiesce?: boolean;
  }> = {},
): Harness => {
  const clock = new StepClock();
  const files: SessionFileManagerStandIn[] = [];
  const opener = sessionRuntimeOpenerStandIn(options.facts);
  const focusedProject = observable<string | undefined>(options.focused);
  const documentVisible = observable(options.visible ?? true);
  const revisions: Harness['revisions'] = [];
  const connectors: Harness['connectors'] = [];
  const rootSyncs: Harness['rootSyncs'] = [];
  const loads = { revisions: 0, hostConnector: 0 };

  const revisionsModule: SessionRevisionsModule = {
    createSessionRevisionsPorts,
    sessionRevisionsCallback:
      () =>
      ({ input, sendBack, receive }) => {
        let stopped = false;
        const received: string[] = [];
        /* The client hears the session's `quiesce`, and answers it unless the row holds it. */
        receive((event) => {
          received.push(event.type);
          if (options.holdQuiesce !== true) {
            sendBack({ type: 'syncQuiesced', requestId: event.requestId });
          }
        });
        revisions.push({ input, sendBack, received, stopped: () => stopped });
        return () => {
          stopped = true;
          options.revisionsTeardown?.();
        };
      },
  };
  const hostConnectorModule: HostConnectorModule = {
    hostConnectorCallback:
      () =>
      ({ input }) => {
        let stopped = false;
        connectors.push({ input, stopped: () => stopped });
        return () => {
          stopped = true;
        };
      },
  };

  const wiring: SessionWiring = {
    loadRevisions: async () => {
      loads.revisions += 1;
      await options.revisionsArrival;
      return revisionsModule;
    },
    loadHostConnector: async () => {
      loads.hostConnector += 1;
      return hostConnectorModule;
    },
    ...options.loads,
    registerCloseCut: () => () => undefined,
    registerProducer: () => () => undefined,
    focusedProject,
    documentVisible,
    chatSessions: {
      publishProjectHostConnector: () => undefined,
      getChatHostSettings: () => undefined,
      setRevisionFacts: () => undefined,
    } as unknown as SessionWiring['chatSessions'],
    choices: () => {
      throw new Error('no chat attaches in these rows, so nothing reads the choices');
    },
    rootSync: () => {
      let closed = false;
      const sync = { syncProjectRoots: async () => undefined, closed: () => closed };
      rootSyncs.push(sync);
      return {
        syncProjectRoots: sync.syncProjectRoots,
        close: () => {
          closed = true;
        },
      };
    },
  };

  const registry = createSessionsActor({
    clock,
    openFileManager: (id) => {
      const standIn = openSessionFileManagerStandIn(id);
      files.push(standIn);
      return standIn;
    },
    openRuntime: opener,
    wiring,
    ...(options.worker === undefined ? {} : { fileManagerWorker: options.worker }),
  }).start();
  current = {
    registry,
    clock,
    files,
    opener,
    focusedProject,
    documentVisible,
    revisions,
    connectors,
    rootSyncs,
    loads,
  };
  return current;
};

/** Let the session's close steps answer one another: each step hands the next a microtask or two. */
const settleSteps = async (): Promise<void> => {
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
};

const sessionOf = (registry: Harness['registry']) => registry.getSnapshot().context.refs[projectId];

const open = async (registry: Harness['registry'], id = projectId): Promise<void> => {
  registry.send({ type: 'open', projectId: id, request: { workspace: 'ws' } });
  await flush();
  await flush();
};

/** The host's shared worker as a row moves it: lost, then replaced. */
const sharedWorkerOf = (initial: Worker | undefined) => {
  let value = initial;
  const changes = new Topic<Worker | undefined>({ name: 'test.sharedWorker' });
  const port: SessionFileManagerWorker = {
    current: () => value,
    subscribe: (listener) => changes.subscribe(listener),
  };
  return {
    port,
    set: (next: Worker | undefined) => {
      value = next;
      changes.emit(next);
    },
  };
};
const workerA = { name: 'worker-a' } as unknown as Worker;
const workerB = { name: 'worker-b' } as unknown as Worker;

afterEach(() => {
  current?.registry.stop();
  current = undefined;
  faults.length = 0;
});

describe('the session starts its revision client and read connector (A7b)', () => {
  it("S2, B7: should start both on its file manager, with its own request's workspace and the root synchronisation", async () => {
    const { registry, files, revisions, connectors, rootSyncs } = harness();

    await open(registry);

    expect(revisions).toHaveLength(1);
    expect(connectors).toHaveLength(1);
    const expected = {
      projectId,
      fileManagerRef: files[0]?.fileManagerRef,
      syncProjectRoots: rootSyncs[0]?.syncProjectRoots,
    };
    expect(revisions[0]?.input).toEqual({ ...expected, workspace: 'ws' });
    expect(connectors[0]?.input).toMatchObject(expected);
  });

  it('D5: should load each module once, whatever the number of sessions', async () => {
    const { registry, loads, revisions } = harness();

    await open(registry);
    await open(registry, 'proj_a7b_other');

    expect(revisions).toHaveLength(2);
    expect(loads).toEqual({ revisions: 1, hostConnector: 1 });
  });

  it('should stop both and close the root synchronisation when the session closes', async () => {
    const { registry, revisions, connectors, rootSyncs } = harness();
    await open(registry);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();

    expect(revisions[0]?.stopped()).toBe(true);
    expect(connectors[0]?.stopped()).toBe(true);
    expect(rootSyncs[0]?.closed()).toBe(true);
  });
});

describe('the session holds its revision facts with nothing mounted (A7b)', () => {
  it('S3: should take dirty and unpushed from its revision client', async () => {
    const { registry, revisions } = harness();
    await open(registry);

    revisions[0]?.sendBack({ type: 'revisionState', dirty: true, pushed: false, recording: false, pendingCount: 2 });
    await flush();

    expect(registry.getSnapshot().context.status[projectId]).toMatchObject({ dirty: true, pushed: false });
  });

  it('S1: should retry the deferred focused chat once the chats have arrived', async () => {
    const { registry, revisions, opener } = harness({ facts: { chatDeferred: true } });
    await open(registry);

    expect(opener.built[0]?.signals).toEqual([]);

    revisions[0]?.sendBack({ type: 'revisionChatsChanged', ready: true });
    await flush();

    expect(opener.built[0]?.signals).toEqual(['retryEnsureFocusedChat']);
  });
});

describe('the session keeps its children apart from a module that fails (A7b, D23)', () => {
  it('should report a module that fails to load through the fault hook, and keep the session live', async () => {
    const failure = new Error('chunk failed');
    const { registry, connectors } = harness({
      loads: {
        loadRevisions: async () => {
          throw failure;
        },
      },
    });

    await open(registry);

    expect(faults).toEqual([failure]);
    expect(connectors).toHaveLength(1);
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should never start a child whose session closed before its module arrived', async () => {
    let arrive: (() => void) | undefined;
    const revisionsArrival = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const { registry, revisions, connectors } = harness({ revisionsArrival });
    await open(registry);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    arrive?.();
    await flush();
    await flush();

    expect(revisions).toEqual([]);
    expect(connectors[0]?.stopped()).toBe(true);
    expect(faults).toEqual([]);
  });

  it('should report a teardown that throws, and still close the session', async () => {
    const failure = new Error('teardown failed');
    const { registry, connectors } = harness({
      revisionsTeardown: () => {
        throw failure;
      },
    });
    await open(registry);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();

    expect(faults).toEqual([failure]);
    expect(connectors[0]?.stopped()).toBe(true);
    expect(sessionOf(registry)).toBeUndefined();
  });
});

describe('the session rebuilds what it owns on a new file manager (A7b review)', () => {
  it("S1: should wait for the new revision client's chats before retrying a deferred chat after a worker loss", async () => {
    const worker = sharedWorkerOf(workerA);
    const { registry, revisions, opener } = harness({ facts: { chatDeferred: true }, worker: worker.port });
    await open(registry);
    revisions[0]?.sendBack({ type: 'revisionChatsChanged', ready: true });
    await flush();
    expect(opener.built[0]?.signals).toEqual(['retryEnsureFocusedChat']);

    worker.set(undefined);
    worker.set(workerB);
    await flush();
    await flush();
    expect(revisions).toHaveLength(2);
    expect(opener.built[1]?.signals).toEqual([]);

    revisions[1]?.sendBack({ type: 'revisionChatsChanged', ready: true });
    await flush();
    expect(opener.built[1]?.signals).toEqual(['retryEnsureFocusedChat']);
  });

  it('should go on with the close when the shared worker is replaced while the close quiesces (A7c review round 2)', async () => {
    const worker = sharedWorkerOf(workerA);
    const { registry, revisions } = harness({ worker: worker.port, holdQuiesce: true });
    await open(registry);
    const session = sessionOf(registry);
    registry.send({ type: 'close', projectId, reason: 'user' });
    await settleSteps();
    expect(session?.getSnapshot().matches({ closing: 'flushing' })).toBe(true);
    expect(revisions[0]?.received).toEqual(['quiesce']);

    /* The old file manager is reported gone before the new one: the step finds no client, the old client is released
     * by its child's teardown, and the close goes on rather than waiting on a quiesce nobody can answer. */
    worker.set(workerB);
    await settleSteps();
    expect(revisions[0]?.stopped()).toBe(true);
    expect(revisions.slice(1).every((child) => child.stopped())).toBe(true);
    expect(session?.getSnapshot().matches('closed')).toBe(true);
    expect(sessionOf(registry)).toBeUndefined();
  });

  it('S5: should park a runtime rebuilt while the session is parked', async () => {
    const { registry, clock, focusedProject, opener } = harness({ focused: undefined, visible: true });
    await open(registry);
    clock.advance(projectSessionParkWindowMilliseconds);
    await flush();
    expect(opener.built[0]?.signals).toEqual(['parkRuntime']);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();

    expect(opener.built[1]?.signals).toEqual(['parkRuntime']);
    focusedProject.set(projectId);
    await flush();
    expect(opener.built[1]?.signals).toEqual(['parkRuntime', 'resumeRuntime']);
  });
});

describe('the session takes its presence from environment and focus (A7b)', () => {
  it('S4, I5: should report itself visible while focused and on screen, with nothing mounted', async () => {
    const { registry, focusedProject, documentVisible } = harness({ focused: projectId, visible: true });
    await open(registry);

    expect(sessionOf(registry)?.getSnapshot().context).toMatchObject({ visible: true, focused: true });

    documentVisible.set(false);
    await flush();
    expect(sessionOf(registry)?.getSnapshot().context).toMatchObject({ visible: false, focused: true });

    documentVisible.set(true);
    focusedProject.set('proj_elsewhere');
    await flush();
    expect(sessionOf(registry)?.getSnapshot().context).toMatchObject({ visible: false, focused: false });
  });

  it('S5: should park its own runtime once nobody is on it, and resume it when focus returns', async () => {
    const { registry, clock, focusedProject, opener } = harness({ focused: projectId, visible: true });
    await open(registry);

    clock.advance(projectSessionParkWindowMilliseconds);
    await flush();
    expect(opener.built[0]?.signals).toEqual([]);

    focusedProject.set(undefined);
    await flush();
    clock.advance(projectSessionParkWindowMilliseconds);
    await flush();
    expect(opener.built[0]?.signals).toEqual(['parkRuntime']);

    focusedProject.set(projectId);
    await flush();
    expect(opener.built[0]?.signals).toEqual(['parkRuntime', 'resumeRuntime']);
  });
});
