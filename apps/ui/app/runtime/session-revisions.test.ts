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
import {
  closeDebtStorageKeyPrefix,
  createSessionRevisionsLogic,
  sessionRevisionsCallback,
  sessionRevisionsCloseDebt,
} from '#runtime/session-revisions.js';
import type {
  SessionRevisionsCloseCut,
  SessionRevisionsCloseDebt,
  SessionRevisionsCloseDebtKey,
  SessionRevisionsCloseDebtPort,
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

/** Owed close cuts kept across documents, as `localStorage` keeps them: one store two sessions can share (A7d). */
const createDebtStore = () => {
  const records = new Map<string, SessionRevisionsCloseDebt>();
  const keyOf = ({ workspace: slug, projectId: id, actorId }: SessionRevisionsCloseDebtKey): string =>
    `${slug}:${id}:${actorId}`;
  const port: SessionRevisionsCloseDebtPort = {
    read: (key) => records.get(keyOf(key)),
    write: (key, debt) => {
      records.set(keyOf(key), debt);
    },
    clear: (key, token) => {
      if (records.get(keyOf(key))?.token === token) {
        records.delete(keyOf(key));
      }
    },
  };
  return { port, records };
};

const createFakePorts = (
  initial: Readonly<{ user?: RevisionSessionUser; focused?: string; debts?: ReturnType<typeof createDebtStore> }> = {},
) => {
  let { user, focused } = initial;
  const debts = initial.debts ?? createDebtStore();
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
    closeDebt: debts.port,
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
    debts,
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

  it('D23: should release what a start that throws partway had already taken', async () => {
    const log: ClientLog = [];
    const client = createFakeClient('a', log);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, workerA, client);
    const fake = createFakePorts({});
    const fileManager = createFileManager({ worker: workerA, rootDirectory: `/projects/${projectId}` });
    const failure = new Error('subscribe threw');
    const ports: SessionRevisionsPorts = {
      ...fake.ports,
      recording: {
        ...fake.ports.recording,
        subscribe: () => {
          throw failure;
        },
      },
    };

    expect(() =>
      sessionRevisionsCallback(ports)({
        input: { projectId, workspace, fileManagerRef: fileManager.ref, syncProjectRoots: async () => undefined },
        sendBack: () => undefined,
        receive: () => undefined,
      }),
    ).toThrow(failure);
    await settle();

    expect(log).toContain('a:close');
    expect(fake.cuts).toEqual([]);
    expect(fake.listeners()).toBe(0);
    expect(fileManager.listeners).toBe(0);
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

/*
 * A7d (I6, S26, D26): the close cut a reload cannot finish. On a reload `pagehide` runs the session stage before
 * `hidden`, and the revision worker goes with the document before `saveRevision('close')` answers, so History never
 * shows the close revision. The child records the cut as owed by the person it records as, synchronously, and the
 * next child for the project in this browser takes it once it records as that same person.
 */
describe('session revisions take a close cut owed by an earlier document (A7d)', () => {
  afterEach(() => {
    revisionClientTestApi.reset();
    githubProjectBinding.remove(projectId);
    globalThis.localStorage.clear();
  });

  const ada = { id: 'usr_1', name: 'Ada' } as const;
  const adaKey = { workspace, projectId, actorId: 'usr_1' } as const;

  /** One document: a session whose `revisions` child has a client on `worker`, with its open answered. */
  const openDocument = async (
    name: string,
    worker: Worker,
    options: Readonly<{
      log: ClientLog;
      debts: ReturnType<typeof createDebtStore>;
      user?: RevisionSessionUser;
      workspace?: string;
      /* Prepare the client before its open, e.g. hold or refuse its first cut. */
      prepare?: (client: ReturnType<typeof createFakeClient>) => void;
    }>,
  ) => {
    const guard = guardActors();
    const client = createFakeClient(name, options.log);
    options.prepare?.(client);
    client.userAnswer.resolve();
    revisionClientTestApi.adopt(projectId, worker, client);
    const fake = createFakePorts({
      debts: options.debts,
      ...(options.user === undefined ? {} : { user: options.user }),
    });
    const fileManager = createFileManager({ worker, rootDirectory: `/projects/${projectId}` });
    const session = createSession(fake.ports, fileManager.ref, {
      guard,
      ...(options.workspace === undefined ? {} : { workspace: options.workspace }),
    });
    session.start();
    await settle();
    return { client, fake, session, guard, fileManager };
  };

  /** A reload: `pagehide` then `hidden` reach the cut, the cut never answers, and the document goes. */
  const reload = async (document: Awaited<ReturnType<typeof openDocument>>): Promise<void> => {
    document.client.holdSave();
    const [cut] = document.fake.cuts;
    await cut?.('pagehide');
    // async-iife: bootstrap -- the cut is cut short by the document going, so nothing awaits it.
    void cut?.('hidden');
    await settle();
    document.session.stop();
    revisionClientTestApi.reset();
  };

  const cuts = (log: ClientLog): string[] => log.filter((line) => line.includes('saveRevision'));

  it('I6: should take the close cut a reloaded document owed once the next open records as the same person', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    const first = await openDocument('a', workerA, { log, debts, user: ada });
    await reload(first);
    expect(log).toContain('a:saveRevision:close');
    expect(debts.port.read(adaKey)).toBeDefined();
    log.length = 0;

    /* The next document has not heard who is signed in yet, and its registry has not answered: nothing is cut. */
    let save: PromiseWithResolvers<void> | undefined;
    const next = await openDocument('b', workerB, {
      log,
      debts,
      prepare: (client) => {
        save = client.holdSave();
        client.setStatus({ registrySettled: false });
      },
    });
    next.client.setStatus({ registrySettled: true });
    await settle();
    expect(cuts(log)).toEqual([]);

    /* Ada is signed in: the client records as her, and her owed cut is its next act. */
    next.fake.setUser(ada);
    await settle();
    expect(cuts(log)).toEqual(['b:saveRevision:close']);
    /* Only the live actor is ever sent: first the signed-out one, then Ada's. */
    expect(sent(log, 'b', 'setActor')).toEqual([
      { command: 'setActor', actor: revisionUserActor({ workspace, user: undefined, anonymous: false }) },
      { command: 'setActor', actor: { kind: 'user', id: 'usr_1', name: 'Ada' } },
    ]);
    expect(debts.port.read(adaKey)).toBeDefined();

    /* The answer settles the debt; paid once, a later document owes nothing. */
    save?.resolve();
    await settle();
    expect(debts.port.read(adaKey)).toBeUndefined();
    next.session.stop();
    log.length = 0;
    const third = await openDocument('c', workerA, { log, debts, user: ada });
    expect(cuts(log)).toEqual([]);
    third.session.stop();
    expect([...first.guard.take(), ...next.guard.take(), ...third.guard.take()]).toEqual([]);
  });

  it('should ask for the owed cut only once the checkout registry has answered', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts }));
    log.length = 0;
    const next = await openDocument('b', workerB, {
      log,
      debts,
      prepare: (client) => {
        client.setStatus({ registrySettled: false });
      },
    });
    expect(cuts(log)).toEqual([]);
    next.client.setStatus({ registrySettled: true });
    await settle();
    expect(cuts(log)).toEqual(['b:saveRevision:close']);
    expect(debts.records.size).toBe(0);
    /* Asked once: later projections ask nothing again. */
    next.client.republish();
    await settle();
    expect(cuts(log)).toEqual(['b:saveRevision:close']);
    next.session.stop();
  });

  it("should never cut another person's owed cut, nor record as them", async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts, user: ada }));
    log.length = 0;
    const next = await openDocument('b', workerB, { log, debts, user: { id: 'usr_2', name: 'Bea' } });
    next.fake.setAnonymous(workspace, true);
    await settle();
    expect(cuts(log)).toEqual([]);
    expect(sent(log, 'b', 'setActor').map((command) => (command['actor'] as { id: string }).id)).not.toContain('usr_1');
    expect(debts.port.read(adaKey)).toBeDefined();
    next.session.stop();
  });

  it('should keep the closing person’s debt when a second document goes before paying it', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts, user: ada }));
    const { token } = debts.port.read(adaKey) ?? { token: '' };
    /* The second document goes before it knows who is signed in: what it owes is its own person's. */
    await reload(await openDocument('b', workerB, { log, debts }));
    expect(debts.port.read(adaKey)?.token).toBe(token);
    log.length = 0;
    const third = await openDocument('c', workerA, { log, debts, user: ada });
    expect(cuts(log)).toEqual(['c:saveRevision:close']);
    third.session.stop();
  });

  it('should owe nothing once the close cut has answered, so the next open takes no cut', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    const first = await openDocument('a', workerA, { log, debts });
    const [cut] = first.fake.cuts;
    const save = first.client.holdSave();
    const hidden = cut?.('hidden');
    await settle();
    expect(debts.records.size).toBe(1);
    save.resolve();
    await hidden;
    expect(debts.records.size).toBe(0);
    first.session.stop();
    revisionClientTestApi.reset();
    log.length = 0;

    const next = await openDocument('b', workerB, { log, debts });
    expect(cuts(log)).toEqual([]);
    next.session.stop();
  });

  it('should leave the debt for the next open when its client closes before the cut answers', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts }));
    const next = await openDocument('b', workerB, {
      log,
      debts,
      /* The connection's close rejects the cut still waiting for its answer. */
      prepare: (client) => {
        Object.assign(client, {
          saveRevision: async () => {
            log.push('b:saveRevision:close');
            throw new DOMException('The revision connection closed before the request completed.', 'AbortError');
          },
        });
      },
    });
    expect(log).toContain('b:saveRevision:close');
    next.session.stop();
    await settle();
    expect(debts.records.size).toBe(1);
  });

  it('should keep a newer debt written while an older one was being paid', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts, user: ada }));
    let save: PromiseWithResolvers<void> | undefined;
    const next = await openDocument('b', workerB, {
      log,
      debts,
      user: ada,
      prepare: (client) => {
        save = client.holdSave();
      },
    });
    const newer: SessionRevisionsCloseDebt = { token: 'newer' };
    debts.port.write(adaKey, newer);
    save?.resolve();
    await settle();
    expect(debts.port.read(adaKey)).toEqual(newer);
    next.session.stop();
  });

  it('should settle the debt by a late answer after a worker swap, which asks again', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts }));
    let save: PromiseWithResolvers<void> | undefined;
    const next = await openDocument('b', workerB, {
      log,
      debts,
      prepare: (client) => {
        save = client.holdSave();
      },
    });
    const swapped = createFakeClient('c', log);
    swapped.userAnswer.resolve();
    const swappedSave = swapped.holdSave();
    revisionClientTestApi.adopt(projectId, workerA, swapped);
    next.fileManager.set({ worker: workerA });
    await settle();
    expect(log).toContain('c:saveRevision:close');
    expect(debts.records.size).toBe(1);
    save?.resolve();
    await settle();
    expect(debts.records.size).toBe(0);
    next.session.stop();
    swappedSave.resolve();
    await settle();
    expect(debts.records.size).toBe(0);
  });

  it("B7: should pay only its own workspace's debt", async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts, user: ada, workspace: 'other' }));
    log.length = 0;
    const next = await openDocument('b', workerB, { log, debts, user: ada });
    expect(cuts(log)).toEqual([]);
    expect(debts.records.size).toBe(1);
    next.session.stop();
  });

  it('should keep only a token in storage, under the workspace, project and person', async () => {
    const log: ClientLog = [];
    const debts = createDebtStore();
    await reload(await openDocument('a', workerA, { log, debts, user: ada }));
    const records = [...debts.records.values()];
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0] ?? {})).toEqual(['token']);
  });

  it('should keep the owed cut in localStorage, readable by a later document, cleared only by its own token', () => {
    sessionRevisionsCloseDebt.write(adaKey, { token: 't1' });
    const stored = Object.keys(globalThis.localStorage).filter((key) => key.startsWith(closeDebtStorageKeyPrefix));
    expect(stored).toHaveLength(1);
    expect(globalThis.localStorage.getItem(stored[0] ?? '')).toBe('{"token":"t1"}');
    expect(sessionRevisionsCloseDebt.read(adaKey)).toEqual({ token: 't1' });
    expect(sessionRevisionsCloseDebt.read({ ...adaKey, workspace: 'other' })).toBeUndefined();
    expect(sessionRevisionsCloseDebt.read({ ...adaKey, actorId: 'usr_2' })).toBeUndefined();
    sessionRevisionsCloseDebt.clear(adaKey, 't0');
    expect(sessionRevisionsCloseDebt.read(adaKey)).toEqual({ token: 't1' });
    sessionRevisionsCloseDebt.clear(adaKey, 't1');
    expect(sessionRevisionsCloseDebt.read(adaKey)).toBeUndefined();
    globalThis.localStorage.setItem(stored[0] ?? '', '{"token":1}');
    expect(sessionRevisionsCloseDebt.read(adaKey)).toBeUndefined();
  });
});
