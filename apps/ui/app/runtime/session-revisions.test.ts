/**
 * The `revisions` session child over fake ports, with nothing mounted (plan § 4 A7a; charter I5; row S27). Path table
 * (one state):
 *
 * 1. `running`: initial; the child owns the lifecycle until the parent stops it
 *
 * The first rows keep what `useRevisionClientLifecycle` did before A7b deleted it. The A7b rows add what the session
 * binding and `WorkbenchCheckoutRoot` did from React: the revision facts (S3), the chats' arrival (S1), the focused
 * project (F12) and the checkout the workbench follows (S23).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { githubProjectBinding } from '@taucad/ui-core/lib/github-project-binding';
import { revisionClientTestApi } from '#hooks/use-revision-status.js';
import type { FlushPhase } from '#runtime/environment.js';
import { revisionUserActor } from '#lib/revision-actor.js';
import type { RevisionSessionUser } from '#lib/revision-actor.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { RevisionClient } from '#types/revision-client.types.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { createSessionRevisionsLogic } from '#runtime/session-revisions.js';
import type {
  SessionRevisionsCloseCut,
  SessionRevisionsEmitted,
  SessionRevisionsPorts,
} from '#runtime/session-revisions.js';
import type { ChatRevisionFacts } from '#services/chat-session-store.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const handleStore = vi.hoisted(() => ({
  setCheckoutRootConfigs: vi.fn((_routes: unknown) => false),
  getProjectRootConfigs: vi.fn(async () => ({
    projects: [{ projectId: 'prj_revisions', backend: 'opfs', providerBasePath: 'prj_revisions' }],
    roots: [{ backend: 'opfs' }],
  })),
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectRootConfigs: async () => handleStore.getProjectRootConfigs(),
  setCheckoutRootConfigs: (routes: unknown) => handleStore.setCheckoutRootConfigs(routes),
}));

const projectId = 'prj_revisions';
const workspace = 'acme';

/** A listener set that counts what is still subscribed. */
const createSignal = (): Readonly<{
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
  readonly size: number;
}> => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    get size() {
      return listeners.size;
    },
  };
};

type ClientLog = string[];

/** A revision client that records every call, with a status a row can move. */
const createFakeClient = (
  name: string,
  log: ClientLog,
): RevisionClient &
  Readonly<{
    setApplying: (roots: readonly string[]) => void;
    userAnswer: PromiseWithResolvers<void>;
    holdSave: () => PromiseWithResolvers<void>;
    setStatus: (patch: Partial<RevisionStatusProjection>) => void;
    republish: () => void;
    focused: boolean[];
  }> => {
  const listeners = createSignal();
  /* A new projection object on each change, as the client publishes one. */
  let status: RevisionStatusProjection & { applyingRoots: readonly string[] } = {
    ...revisionStatusHarness.status,
    projectId,
    checkoutRoot: `/projects/${projectId}`,
    branches: [],
    applyingRoots: [],
  };
  const focused: boolean[] = [];
  const userAnswer = Promise.withResolvers<void>();
  let saveGate: PromiseWithResolvers<void> | undefined;
  const client = {
    send: (command: { command: string }) => {
      log.push(`${name}:send:${command.command}:${JSON.stringify(command)}`);
    },
    setUser: async (user: RevisionSessionUser | undefined) => {
      log.push(`${name}:setUser:${user?.id ?? 'none'}`);
      await userAnswer.promise;
    },
    setCredential: async (source: { kind: string }) => {
      log.push(`${name}:setCredential:${source.kind}`);
      return true;
    },
    open: () => {
      log.push(`${name}:open`);
    },
    close: () => {
      log.push(`${name}:close`);
    },
    saveRevision: async (trigger?: string) => {
      log.push(`${name}:saveRevision:${trigger ?? 'save'}`);
      await saveGate?.promise;
    },
    holdSave: () => {
      saveGate = Promise.withResolvers<void>();
      return saveGate;
    },
    status: () => status,
    subscribe: listeners.subscribe,
    focus: (on: boolean) => {
      focused.push(on);
    },
    focused,
    setApplying: (roots: readonly string[]) => {
      status = { ...status, applyingRoots: roots };
      listeners.emit();
    },
    setStatus: (patch: Partial<RevisionStatusProjection>) => {
      status = { ...status, ...patch };
      listeners.emit();
    },
    /* Tell the listeners again with the same projection. */
    republish: () => {
      listeners.emit();
    },
    userAnswer,
  };
  return client as unknown as RevisionClient & typeof client;
};

type FileManagerContext = Readonly<{ worker?: Worker; treeService?: unknown; rootDirectory: string }>;

/** The parts of a file-manager actor the child reads: its context and its changes. */
const createFileManager = (initial: FileManagerContext) => {
  let context = initial;
  const signal = createSignal();
  const sent: unknown[] = [];
  const ref = {
    send: (event: unknown) => {
      sent.push(event);
    },
    getSnapshot: () => ({ context, matches: () => true }),
    subscribe: (observer: { next: () => void }) => ({
      unsubscribe: signal.subscribe(() => {
        observer.next();
      }),
    }),
  };
  return {
    ref: ref as unknown as ActorRefFrom<typeof fileManagerMachine>,
    set: (next: Partial<FileManagerContext>) => {
      context = { ...context, ...next };
      signal.emit();
    },
    get listeners() {
      return signal.size;
    },
    sent,
  };
};

/** A tree whose refresh holds are counted. */
const createTree = (log: ClientLog, name = 'tree') => ({
  pauseRefreshes: () => {
    log.push(`${name}:pause`);
    return () => {
      log.push(`${name}:resume`);
    };
  },
});

const createFakePorts = (initial: Readonly<{ user?: RevisionSessionUser; focused?: string }> = {}) => {
  let { user, focused } = initial;
  const focusSignal = createSignal();
  let recording = false;
  const recordingSignal = createSignal();
  const chatFacts: Array<Readonly<{ projectId: string; facts: ChatRevisionFacts }>> = [];
  const faults: unknown[] = [];
  const userSignal = createSignal();
  const anonymousBy = new Map<string, boolean>();
  const anonymitySignal = createSignal();
  const salts = new Map<string, string>();
  const saltSignal = createSignal();
  const saltRequests: string[] = [];
  const cuts: SessionRevisionsCloseCut[] = [];
  let unregistered = 0;
  const ports: SessionRevisionsPorts = {
    sessionUser: { get: () => user, subscribe: userSignal.subscribe },
    anonymity: { get: (slug) => anonymousBy.get(slug) ?? false, subscribe: anonymitySignal.subscribe },
    salt: {
      get: ({ workspace: slug, userId }) => salts.get(`${slug}/${userId}`),
      subscribe: saltSignal.subscribe,
      request: ({ workspace: slug, userId }) => {
        saltRequests.push(`${slug}/${userId}`);
      },
    },
    closeCut: {
      register: (cut) => {
        cuts.push(cut);
        return () => {
          unregistered += 1;
          cuts.splice(cuts.indexOf(cut), 1);
        };
      },
    },
    focusedProject: { get: () => focused, subscribe: focusSignal.subscribe },
    chatFacts: (id, facts) => {
      chatFacts.push({ projectId: id, facts });
    },
    recording: { get: () => recording, subscribe: recordingSignal.subscribe },
    reportFault: (error) => {
      faults.push(error);
    },
  };
  return {
    ports,
    setUser: (next: RevisionSessionUser | undefined) => {
      user = next;
      userSignal.emit();
    },
    refetchUser: () => {
      userSignal.emit();
    },
    setAnonymous: (slug: string, on: boolean) => {
      anonymousBy.set(slug, on);
      anonymitySignal.emit();
    },
    setSalt: (key: string, salt: string) => {
      salts.set(key, salt);
      saltSignal.emit();
    },
    emitSalt: () => {
      saltSignal.emit();
    },
    setFocused: (next: string | undefined) => {
      focused = next;
      focusSignal.emit();
    },
    setRecording: (next: boolean) => {
      recording = next;
      recordingSignal.emit();
    },
    chatFacts,
    faults,
    saltRequests,
    cuts,
    get unregistered() {
      return unregistered;
    },
    listeners: () => userSignal.size + anonymitySignal.size + saltSignal.size + focusSignal.size + recordingSignal.size,
  };
};

/** A session stand-in that invokes `revisions` and does nothing else. */
const createSession = (
  ports: SessionRevisionsPorts,
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>,
  options: Readonly<{
    guard: ReturnType<typeof guardActors>;
    workspace?: string;
    received?: SessionRevisionsEmitted[];
    syncProjectRoots?: () => Promise<void>;
  }>,
) => {
  const {
    guard,
    workspace: sessionWorkspace = workspace,
    received = [],
    syncProjectRoots = async () => undefined,
  } = options;
  const session = setup({
    schemas: { context: types<Record<string, never>>(), events: eventSchemas<SessionRevisionsEmitted>() },
    actors: { revisions: createSessionRevisionsLogic(ports) },
  }).createMachine({
    id: 'revisions-session',
    context: {},
    initial: 'running',
    /* What the child tells its session: the facts a policy close relies on (S3) and the chats' arrival (S1). */
    on: {
      revisionState: ({ event }, enq) => {
        enq(() => {
          received.push(event);
        });
      },
      revisionChatsChanged: ({ event }, enq) => {
        enq(() => {
          received.push(event);
        });
      },
    },
    states: {
      running: {
        invoke: {
          id: 'revisions',
          src: 'revisions',
          input: { projectId, workspace: sessionWorkspace, fileManagerRef, syncProjectRoots },
        },
      },
    },
  });
  return createActor(session, { clock: new StepClock(), inspect: guard.inspect });
};

const workerA = { name: 'worker-a' } as unknown as Worker;
const workerB = { name: 'worker-b' } as unknown as Worker;

/** Commands of one kind the client was sent, parsed. */
const sent = (log: ClientLog, name: string, command: string): Array<Record<string, unknown>> =>
  log
    .filter((line) => line.startsWith(`${name}:send:${command}:`))
    .map((line) => JSON.parse(line.slice(`${name}:send:${command}:`.length)) as Record<string, unknown>);

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each turn lets one more promise continuation run.
    await Promise.resolve();
  }
};

describe('session revisions', () => {
  afterEach(() => {
    revisionClientTestApi.reset();
    githubProjectBinding.remove(projectId);
    globalThis.localStorage.clear();
  });

  it('should hold refreshes, send the device id, relay the user before opening, and send the actor, with nothing mounted (I5)', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ user: { id: 'usr_1', name: 'Ada' } });
    const fileManager = createFileManager({
      worker: workerA,
      treeService: createTree(log),
      rootDirectory: `/projects/${projectId}`,
    });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();

    client.setApplying([`/projects/${projectId}/`]);
    expect(log).toContain('tree:pause');
    expect(log.filter((line) => line.startsWith('a:'))).toEqual([
      expect.stringMatching(/^a:send:setDeviceId:/u),
      'a:setUser:usr_1',
      expect.stringMatching(/^a:send:setActor:/u),
    ]);
    expect(sent(log, 'a', 'setActor')).toEqual([
      { command: 'setActor', actor: { kind: 'user', id: 'usr_1', name: 'Ada' } },
    ]);
    expect(log).not.toContain('a:open');

    client.userAnswer.resolve();
    await settle();
    expect(log.at(-1)).toBe('a:open');

    client.setApplying([]);
    expect(log.at(-1)).toBe('tree:resume');
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should start nothing until the file manager has a worker, then start the lifecycle', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts();
    const fileManager = createFileManager({ rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    expect(log).toEqual([]);

    fileManager.set({ worker: workerA });
    await settle();

    expect(log).toEqual([
      expect.stringMatching(/^a:send:setDeviceId:/u),
      'a:setUser:none',
      expect.stringMatching(/^a:send:setActor:/u),
      'a:open',
    ]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should close the old client, withdrawing its credential first, and open the new one when the worker changes', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const clientA = createFakeClient('a', log);
    const clientB = createFakeClient('b', log);
    clientA.userAnswer.resolve();
    clientB.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, clientA);
    const fake = createFakePorts();
    const fileManager = createFileManager({
      worker: workerA,
      treeService: createTree(log),
      rootDirectory: `/projects/${projectId}`,
    });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    clientA.setApplying([`/projects/${projectId}`]);
    await settle();
    log.length = 0;

    revisionClientTestApi.adopt(projectId, workerB, clientB);
    fileManager.set({ worker: workerB });
    await settle();

    expect(log).toEqual([
      'tree:resume',
      'a:setCredential:withdrawn',
      'a:close',
      expect.stringMatching(/^b:send:setDeviceId:/u),
      'b:setUser:none',
      expect.stringMatching(/^b:send:setActor:/u),
      'b:open',
    ]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should keep one client while the worker stays and hold again when the tree or its root changes', () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts();
    const fileManager = createFileManager({
      worker: workerA,
      treeService: createTree(log, 'tree1'),
      rootDirectory: `/projects/${projectId}`,
    });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    client.setApplying([`/projects/${projectId}`]);
    log.length = 0;

    fileManager.set({ treeService: createTree(log, 'tree2') });
    fileManager.set({ rootDirectory: `/projects/${projectId}/other` });
    fileManager.set({});

    expect(log).toEqual(['tree1:resume', 'tree2:pause', 'tree2:resume']);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should relay every user change to the open client before sending the actor again, and a refetch without one', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts();
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    await settle();
    log.length = 0;

    fake.setUser({ id: 'usr_2' });
    expect(log).toEqual(['a:setUser:usr_2', expect.stringMatching(/^a:send:setActor:/u)]);
    expect(sent(log, 'a', 'setActor').at(-1)).toEqual({ command: 'setActor', actor: { kind: 'user', id: 'usr_2' } });
    log.length = 0;

    fake.refetchUser();
    expect(log).toEqual(['a:setUser:usr_2']);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it("should send the actor again for the session's own workspace when its anonymity or salt changes, and not for another's", () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ user: { id: 'usr_1' } });
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    const before = sent(log, 'a', 'setActor').length;

    fake.setAnonymous('elsewhere', true);
    expect(sent(log, 'a', 'setActor')).toHaveLength(before);

    fake.setAnonymous(workspace, true);
    const anonymousDevice = sent(log, 'a', 'setActor').at(-1);
    expect(anonymousDevice).toMatchObject({ actor: { name: 'Anonymous', anonymous: true } });
    /* B7: the device pseudonym is this workspace's own salt, never another workspace's. */
    expect(globalThis.localStorage.getItem(`tau-revision-salt:${workspace}`)).not.toBeNull();
    expect(globalThis.localStorage.getItem('tau-revision-salt:elsewhere')).toBeNull();

    fake.setSalt(`elsewhere/usr_1`, 'salt-other');
    expect(sent(log, 'a', 'setActor')).toHaveLength(before + 1);

    fake.setSalt(`${workspace}/usr_1`, 'salt-account');
    const anonymousAccount = sent(log, 'a', 'setActor').at(-1);
    expect(sent(log, 'a', 'setActor')).toHaveLength(before + 2);
    expect(anonymousAccount).toMatchObject({ actor: { name: 'Anonymous', anonymous: true } });
    expect(anonymousAccount).not.toEqual(anonymousDevice);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it("should drop the previous account's salt from the actor when the account changes", () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ user: { id: 'usr_1' } });
    fake.setSalt(`${workspace}/usr_1`, 'salt-one');
    fake.setAnonymous(workspace, true);
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    const first = revisionUserActor({ workspace, user: { id: 'usr_1' }, anonymous: true, salt: 'salt-one' });
    expect(sent(log, 'a', 'setActor').at(-1)).toEqual({ command: 'setActor', actor: first });

    fake.setUser({ id: 'usr_2' });

    const second = revisionUserActor({ workspace, user: { id: 'usr_2' }, anonymous: true });
    expect(second).not.toEqual(first);
    expect(sent(log, 'a', 'setActor').at(-1)).toEqual({ command: 'setActor', actor: second });
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it("should ask for the account's salt once per account and held salt, never for an empty workspace", () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const fake = createFakePorts({ user: { id: 'usr_1' } });
    const fileManager = createFileManager({ rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    expect(fake.saltRequests).toEqual([`${workspace}/usr_1`]);

    /* A failed request leaves nothing held: it is not asked again until the account changes. */
    fake.emitSalt();
    fake.refetchUser();
    expect(fake.saltRequests).toEqual([`${workspace}/usr_1`]);

    fake.setUser({ id: 'usr_2' });
    expect(fake.saltRequests).toEqual([`${workspace}/usr_1`, `${workspace}/usr_2`]);
    fake.setSalt(`${workspace}/usr_2`, 'held');
    fake.setUser(undefined);
    expect(fake.saltRequests).toHaveLength(2);
    session.stop();

    const unnamed = createFakePorts({ user: { id: 'usr_1' } });
    const unnamedSession = createSession(unnamed.ports, fileManager.ref, { guard, workspace: '' });
    unnamedSession.start();
    expect(unnamed.saltRequests).toEqual([]);
    unnamedSession.stop();
    expect(log).toEqual([]);
    expect(guard.take()).toEqual([]);
  });

  it("should send the project's GitHub no-reply identity beside the actor once it is linked (D33, I3)", () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ user: { id: 'usr_1', name: 'Ada' } });
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();

    githubProjectBinding.set(projectId, {
      connectionId: '00000000-0000-4000-8000-000000000001',
      repositoryId: 7,
      repositoryUrl: 'https://github.com/acme/widget',
      generation: 1,
      author: { name: 'ada', email: '1+ada@users.noreply.github.com' },
    });

    expect(sent(log, 'a', 'setActor').at(-1)).toEqual({
      command: 'setActor',
      actor: { kind: 'user', id: 'usr_1', name: 'Ada' },
      commitAuthor: { name: 'ada', email: '1+ada@users.noreply.github.com' },
    });
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should register one close cut for its whole life: hidden awaits the close revision, pagehide offers the keepalive', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const fake = createFakePorts();
    const fileManager = createFileManager({ rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    expect(fake.cuts).toHaveLength(1);
    const [cut] = fake.cuts;

    /* No client yet: the cut has nothing to save. */
    await cut?.('hidden');
    expect(log).toEqual([]);

    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    fileManager.set({ worker: workerA });
    await settle();
    log.length = 0;

    /* C16: `hidden` settles only when the close revision has answered, so `pagehide` offers this push's pack. */
    const save = client.holdSave();
    let hiddenSettled = false;
    const hidden = (async (): Promise<void> => {
      await cut?.('hidden');
      hiddenSettled = true;
    })();
    await settle();
    expect(hiddenSettled).toBe(false);
    save.resolve();
    await hidden;
    expect(hiddenSettled).toBe(true);
    log.length = 0;

    const phases: FlushPhase[] = ['hidden', 'pagehide'];
    for (const phase of phases) {
      // oxlint-disable-next-line no-await-in-loop -- The phases run in order, as the unload sequencer runs them.
      await cut?.(phase);
    }
    expect(log).toEqual(['a:saveRevision:close', 'a:send:flushKeepalive:{"command":"flushKeepalive"}']);
    expect(fake.cuts).toEqual([cut]);

    session.stop();
    expect(fake.cuts).toEqual([]);
    expect(fake.unregistered).toBe(1);
    expect(guard.take()).toEqual([]);
  });

  it('should release everything when it stops: the hold, the connection with its credential withdrawn, every subscription', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ user: { id: 'usr_1' } });
    const fileManager = createFileManager({
      worker: workerA,
      treeService: createTree(log),
      rootDirectory: `/projects/${projectId}`,
    });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    client.setApplying([`/projects/${projectId}`]);
    await settle();
    log.length = 0;

    session.stop();

    expect(log).toEqual(['tree:resume', 'a:setCredential:withdrawn', 'a:close']);
    expect(fake.listeners()).toBe(0);
    expect(fileManager.listeners).toBe(0);
    log.length = 0;
    fake.setUser({ id: 'usr_2' });
    githubProjectBinding.remove(projectId);
    client.setApplying([]);
    expect(log).toEqual([]);
    expect(guard.take()).toEqual([]);
  });

  it("should not open a client whose open's setUser answers after the child stopped", async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts();
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();

    session.stop();
    client.userAnswer.resolve();
    await settle();

    expect(log).not.toContain('a:open');
    expect(log.slice(-2)).toEqual(['a:setCredential:withdrawn', 'a:close']);
    expect(guard.take()).toEqual([]);
  });

  it('should relay nothing to a client it closed when the worker went away', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts();
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    await settle();

    fileManager.set({ worker: undefined });
    expect(log.slice(-2)).toEqual(['a:setCredential:withdrawn', 'a:close']);
    log.length = 0;
    fake.setUser({ id: 'usr_2' });
    githubProjectBinding.remove(projectId);

    expect(log).toEqual([]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should stop listening to the old client, so a later setUser or binding change reaches only the new one', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const clientA = createFakeClient('a', log);
    const clientB = createFakeClient('b', log);
    clientA.userAnswer.resolve();
    clientB.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, clientA);
    const fake = createFakePorts();
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    revisionClientTestApi.adopt(projectId, workerB, clientB);
    fileManager.set({ worker: workerB });
    await settle();
    log.length = 0;

    fake.setUser({ id: 'usr_9' });
    githubProjectBinding.remove(projectId);

    expect(log.every((line) => line.startsWith('b:'))).toBe(true);
    expect(log).toContain('b:setUser:usr_9');
    session.stop();
    expect(guard.take()).toEqual([]);
  });
});

describe('session revisions relay the facts and follow the checkout (A7b)', () => {
  beforeEach(() => {
    revisionStatusHarness.reset();
    handleStore.setCheckoutRootConfigs.mockClear();
    handleStore.setCheckoutRootConfigs.mockReturnValue(false);
    handleStore.getProjectRootConfigs.mockClear();
  });

  afterEach(() => {
    revisionClientTestApi.reset();
    githubProjectBinding.remove(projectId);
  });

  /** A started session on one open client, with what it told its session. */
  const startSession = async (options: Readonly<{ focused?: string; syncProjectRoots?: () => Promise<void> }> = {}) => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts(options.focused === undefined ? {} : { focused: options.focused });
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const received: SessionRevisionsEmitted[] = [];
    const session = createSession(fake.ports, fileManager.ref, {
      guard,
      received,
      ...(options.syncProjectRoots === undefined ? {} : { syncProjectRoots: options.syncProjectRoots }),
    });
    session.start();
    await settle();
    return { guard, log, client, fake, fileManager, received, session };
  };

  const setRoot = (path: string) => ({ type: 'setRoot', path, projectId });

  const onBranch = (checkoutId: string): Partial<RevisionStatusProjection> => ({
    checkoutId,
    checkoutRoot: `/checkouts/${checkoutId}`,
    line: { kind: 'branch', name: checkoutId },
    branches: [
      { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: `/projects/${projectId}`, leaseChatIds: [] },
      { name: checkoutId, head: undefined, checkoutId, checkoutRoot: `/checkouts/${checkoutId}`, leaseChatIds: [] },
    ],
  });

  it('S3: should tell the session and its chats each projection, and the recording, with nothing mounted', async () => {
    const { client, fake, received, session, guard } = await startSession();
    expect(received.at(-1)).toEqual({
      type: 'revisionState',
      dirty: false,
      recording: false,
      pushed: true,
      pendingCount: 0,
    });

    client.setStatus({
      projectDirty: true,
      line: { kind: 'branch', name: 'fillet' },
      sync: { ...revisionStatusHarness.status.sync, state: 'pending', pendingCount: 3 },
    });
    expect(received.at(-1)).toEqual({
      type: 'revisionState',
      dirty: true,
      recording: false,
      pushed: false,
      pendingCount: 3,
    });
    expect(fake.chatFacts.at(-1)).toEqual({
      projectId,
      facts: { dirty: true, sync: 'pending', branch: 'fillet' },
    });

    fake.setRecording(true);
    expect(received.at(-1)).toMatchObject({ type: 'revisionState', recording: true });
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('should relay a projection once, however often the client publishes it', async () => {
    const { client, received, session } = await startSession();
    const before = received.length;

    client.republish();
    client.republish();
    expect(received.length).toBe(before);

    client.setStatus({});
    expect(received.slice(before)).toEqual([
      { type: 'revisionState', dirty: false, recording: false, pushed: true, pendingCount: 0 },
    ]);
    session.stop();
  });

  it('S1: should tell the session once when the chats arrive', async () => {
    const { client, received, session } = await startSession();
    expect(received.filter((event) => event.type === 'revisionChatsChanged')).toEqual([]);

    const sync: RevisionStatusProjection['sync'] = { ...revisionStatusHarness.status.sync, chats: 'ready' };
    client.setStatus({ sync });
    client.setStatus({ projectDirty: true });
    expect(received.filter((event) => event.type === 'revisionChatsChanged')).toEqual([
      { type: 'revisionChatsChanged', ready: true },
    ]);
    session.stop();
  });

  it('F12: should tell the client whether its project is focused, on connect and on each flip', async () => {
    const { client, fake, session } = await startSession();
    expect(client.focused).toEqual([false]);

    fake.setFocused(projectId);
    fake.setFocused(projectId);
    fake.setFocused('prj_other');

    expect(client.focused).toEqual([false, true, false]);
    session.stop();
  });

  it('S23: should serve the project directory while the focused project is on the live checkout', async () => {
    const { fileManager, session } = await startSession({ focused: projectId });

    expect(fileManager.sent).toEqual([setRoot(`/projects/${projectId}`)]);
    session.stop();
  });

  it('S23: should install nothing for a project focus is not on, and follow once it is', async () => {
    const { client, fake, fileManager, session } = await startSession();
    client.setStatus({ checkoutRoot: `/projects/${projectId}` });
    expect(fileManager.sent).toEqual([]);
    expect(handleStore.setCheckoutRootConfigs).not.toHaveBeenCalled();

    fake.setFocused(projectId);

    expect(fileManager.sent).toEqual([setRoot(`/projects/${projectId}`)]);
    session.stop();
  });

  it('S23: should re-root at the checkout the switch selected only once its route is installed', async () => {
    const pending: Array<() => void> = [];
    const syncProjectRoots = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { client, fileManager, session } = await startSession({ focused: projectId, syncProjectRoots });
    fileManager.sent.length = 0;
    handleStore.setCheckoutRootConfigs.mockReturnValue(true);

    client.setStatus(onBranch('co-2'));
    await settle();

    expect(syncProjectRoots).toHaveBeenCalledTimes(1);
    expect(handleStore.setCheckoutRootConfigs).toHaveBeenCalledWith([
      { projectId, backend: 'opfs', providerBasePath: `.tau/checkouts/${projectId}/co-2`, checkoutId: 'co-2' },
    ]);
    expect(fileManager.sent).toEqual([]);

    for (const resolve of pending.splice(0)) {
      resolve();
    }
    await settle();
    expect(fileManager.sent).toEqual([setRoot('/checkouts/co-2')]);
    session.stop();
  });

  it('D23: should report nothing when a checkout route still installing is cut short by the session stopping', async () => {
    const pending: Array<(error: Error) => void> = [];
    const syncProjectRoots = vi.fn(
      async () =>
        new Promise<void>((_resolve, reject) => {
          pending.push(reject);
        }),
    );
    const { client, fake, fileManager, session } = await startSession({ focused: projectId, syncProjectRoots });
    fileManager.sent.length = 0;
    handleStore.setCheckoutRootConfigs.mockReturnValue(true);
    client.setStatus(onBranch('co-2'));
    await settle();
    expect(syncProjectRoots).toHaveBeenCalledTimes(1);

    session.stop();
    for (const reject of pending.splice(0)) {
      reject(new Error('Workspace root synchronization owner is disposed'));
    }
    await settle();

    expect(fake.faults).toEqual([]);
    expect(fileManager.sent).toEqual([]);
  });

  it('S23: should let the newest selection win when two switches land together', async () => {
    const pending: Array<() => void> = [];
    const syncProjectRoots = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const { client, fileManager, session } = await startSession({ focused: projectId, syncProjectRoots });
    fileManager.sent.length = 0;
    handleStore.setCheckoutRootConfigs.mockReturnValue(true);

    client.setStatus(onBranch('co-2'));
    await settle();
    client.setStatus(onBranch('co-3'));
    await settle();
    expect(syncProjectRoots).toHaveBeenCalledTimes(2);

    for (const resolve of pending.splice(0)) {
      resolve();
    }
    await settle();
    expect(fileManager.sent).toEqual([setRoot('/checkouts/co-3')]);
    session.stop();
  });

  it('S23: should take the route back when the branch that owned it is gone', async () => {
    const syncProjectRoots = vi.fn(async () => undefined);
    handleStore.setCheckoutRootConfigs.mockReturnValue(true);

    const { session } = await startSession({ focused: projectId, syncProjectRoots });

    expect(handleStore.setCheckoutRootConfigs).toHaveBeenCalledWith([]);
    expect(syncProjectRoots).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it('S23: should send nothing before the root has answered', async () => {
    const guard = guardActors();
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    client.setStatus({ checkoutRoot: undefined });
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({ focused: projectId });
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, { guard });
    session.start();
    await settle();

    expect(fileManager.sent).toEqual([]);
    session.stop();
    expect(guard.take()).toEqual([]);
  });

  it('D23: should report a teardown that throws rather than fault the session, and still release the rest', async () => {
    const { client, fake, fileManager, session, guard } = await startSession();
    const failure = new Error('close threw');
    Object.assign(client, {
      close: () => {
        throw failure;
      },
    });

    session.stop();

    expect(fake.faults).toEqual([failure]);
    expect(fake.listeners()).toBe(0);
    expect(fileManager.listeners).toBe(0);
    expect(guard.take()).toEqual([]);
  });
});
