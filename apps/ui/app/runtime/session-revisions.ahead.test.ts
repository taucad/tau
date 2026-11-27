/**
 * STO-25 SP6 (SP3-local 394c63bf gap 3): an *Open* gesture opens its project's revision client, and its Tau Cloud open,
 * before the project route's code has loaded; the project's session `revisions` child takes the same connection.
 *
 * The rows hold what the review of the first attempt (PR #2599, `adoptPreconnected`) found:
 *
 * - HIGH: nothing the gesture does can close a client a session holds, whether the session took it first or adopted
 *   it after (the first attempt's 60 s orphan timer closed an adopted client, silently stopping sync);
 * - LOW: a sign-out or an account switch drops the gesture's connection, and a session never adopts one opened for
 *   another account;
 * - MEDIUM: a created or catalogued project's Tau remote is connected from the gesture, not only its salt and
 *   credential, so `info/refs` no longer waits for the route.
 *
 * No row keeps time: liveness is the registry's, never a timer's.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionClient, RevisionSessionUser } from '@taucad/revisions-ui/types/revision-client.types';
import { revisionClientTestApi } from '#hooks/use-revision-status.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import {
  openRevisionsAheadOfSession,
  sessionRevisionsAheadTestApi,
  sessionRevisionsCallback,
} from '#runtime/session-revisions.js';
import type {
  SessionRevisionsAheadPorts,
  SessionRevisionsCloudOpenContinuation,
  SessionRevisionsPorts,
} from '#runtime/session-revisions.js';

const projectId = 'prj_ahead00000000000000000';
const workspace = 'acme';
const worker = { name: 'shared-worker' } as unknown as Worker;
const ada: RevisionSessionUser = { id: 'usr_ada', name: 'Ada' };
const grace: RevisionSessionUser = { id: 'usr_grace', name: 'Grace' };

const createSignal = () => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
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
  };
};

/** A client that records each call; it publishes a projection only once opened and a row moves it. */
const createClient = (log: string[]) => {
  const listeners = createSignal();
  let status: RevisionStatusProjection | undefined;
  let answer = Promise.withResolvers<void>();
  const client = {
    send: (command: { command: string; actor?: { id: string } }) => {
      log.push(`send:${command.command}${command.actor === undefined ? '' : `:${command.actor.id}`}`);
    },
    setUser: async (user: RevisionSessionUser | undefined) => {
      log.push(`setUser:${user?.id ?? 'none'}`);
      await answer.promise;
    },
    setCredential: async (source: { kind: string }) => {
      log.push(`setCredential:${source.kind}`);
      return true;
    },
    remoteCredential: () => undefined,
    open: () => {
      log.push('open');
    },
    close: () => {
      log.push('close');
      status = undefined;
      listeners.emit();
    },
    status: () => status,
    subscribe: listeners.subscribe,
    focus: () => undefined,
    saveRevision: async () => 'recorded',
    quiesce: async () => undefined,
  };
  return {
    client: client as unknown as RevisionClient,
    /** Answer the `setUser` calls made so far; later ones wait again. */
    answerUser: () => {
      answer.resolve();
      answer = Promise.withResolvers<void>();
    },
    /** Publish a projection with `patch` over the harness's (the apply's roots, readiness, …). */
    publishStatus: (patch: Partial<RevisionStatusProjection>) => {
      status = { ...revisionStatusHarness.status, projectId, ...patch };
      listeners.emit();
    },
    publish: (remote: Partial<RevisionStatusProjection['remote']>) => {
      const moved: RevisionStatusProjection['remote'] = { ...revisionStatusHarness.status.remote, ...remote };
      status = { ...revisionStatusHarness.status, projectId, remote: moved };
      listeners.emit();
    },
  };
};

/** The module stores, faked: who is signed in, anonymity, salt and whether the project's cloud open is owed. */
const createPorts = (initial: Readonly<{ user?: RevisionSessionUser; cloudOpen?: boolean }> = {}) => {
  let { user } = initial;
  const userSignal = createSignal();
  const continued: SessionRevisionsCloudOpenContinuation[] = [];
  const ports: SessionRevisionsAheadPorts = {
    sessionUser: { get: () => user, subscribe: userSignal.subscribe },
    anonymity: { get: () => false, subscribe: createSignal().subscribe },
    salt: { get: () => 'salt', subscribe: createSignal().subscribe, request: () => undefined },
    cloudOpen: {
      get: () => initial.cloudOpen === true,
      subscribe: createSignal().subscribe,
      canOpen: () => true,
      continueOpen: async (input) => {
        continued.push(input);
      },
    },
    reportFault: (error) => {
      throw error;
    },
  };
  return {
    ports,
    continued,
    /** Change who is signed in, telling the listeners as the store does. */
    signIn: (next: RevisionSessionUser | undefined) => {
      user = next;
      userSignal.emit();
    },
    /** Change who is signed in without a word yet: a child that starts now reads the new one first. */
    swapQuietly: (next: RevisionSessionUser | undefined) => {
      user = next;
    },
  };
};

/** The project's session `revisions` child, over the same stores, on the shared worker. */
const startSessionChild = (ports: SessionRevisionsAheadPorts, treeService?: unknown): (() => void) => {
  const fileManagerRef = {
    send: () => undefined,
    getSnapshot: () => ({
      context: { worker, treeService, rootDirectory: `/projects/${projectId}` },
      matches: () => true,
    }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  } as unknown as ActorRefFrom<typeof fileManagerMachine>;
  const sessionPorts: SessionRevisionsPorts = {
    ...ports,
    closeCut: { register: () => () => undefined },
    focusedProject: { get: () => undefined, subscribe: () => () => undefined },
    chatFacts: () => undefined,
    recording: { get: () => false, subscribe: () => () => undefined },
    closeDebt: { read: () => undefined, write: () => undefined, clear: () => undefined },
    editorText: { setScope: () => undefined, owing: () => false, subscribe: () => () => undefined },
  };
  return sessionRevisionsCallback(sessionPorts)({
    input: { projectId, workspace, fileManagerRef, syncProjectRoots: async () => undefined },
    sendBack: () => undefined,
    receive: () => undefined,
  });
};

const settle = async (): Promise<void> => {
  for (let round = 0; round < 8; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each round lets the next microtask run.
    await Promise.resolve();
  }
};

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  revisionClientTestApi.reset();
  /* Each row starts with no session holding a client and no gesture owning one. */
  sessionRevisionsAheadTestApi.reset();
});

describe('an open ahead of its session (STO-25 SP6)', () => {
  it('opens the client as the session child would: device id and actor queued, the user settled, then the root', async () => {
    const log: string[] = [];
    const { client, answerUser } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    const { ports } = createPorts({ user: ada });

    stops.push(openRevisionsAheadOfSession(ports)({ projectId, workspace, worker }));
    expect(log).toStrictEqual(['send:setDeviceId', expect.stringMatching(/^send:setActor:/u), 'setUser:usr_ada']);
    answerUser();
    await settle();
    expect(log.at(-1)).toBe('open');
  });

  it('starts nothing with nobody signed in', () => {
    const log: string[] = [];
    revisionClientTestApi.adopt(projectId, worker, createClient(log).client);
    stops.push(openRevisionsAheadOfSession(createPorts().ports)({ projectId, workspace, worker }));
    expect(log).toStrictEqual([]);
  });

  describe('HIGH: a client a session holds is never closed by the gesture', () => {
    it('never takes a client a session took first, even while that session is still opening it', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const { ports } = createPorts({ user: ada, cloudOpen: true });
      /* The session's open is in flight: its `setUser` has not answered, so the client publishes no projection. */
      stops.push(startSessionChild(ports));
      expect(client.status()).toBeUndefined();
      log.length = 0;

      const release = openRevisionsAheadOfSession(ports)({ projectId, workspace, worker });
      release();
      answerUser();
      await settle();
      /* The gesture said nothing to the client and closed nothing; the session opened it. */
      expect(log).toStrictEqual(['open']);
    });

    it('closes nothing once the session adopted the connection: not its release, nor a later account change', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada });
      const release = openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker });
      answerUser();
      await settle();
      publish({ kind: 'tau', phase: 'connected' });

      stops.push(startSessionChild(store.ports));
      answerUser();
      await settle();
      log.length = 0;
      /* Every way the gesture's ownership ends, after the session took it. */
      release();
      store.signIn(grace);
      answerUser();
      await settle();
      expect(log).not.toContain('close');
      /* The session tells its open client who is signed in now, as it does for any account switch. */
      expect(log).toContain('setUser:usr_grace');
      expect(client.status()).toBeDefined();
    });

    it('lets the session that adopted it close it when the session stops', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const { ports } = createPorts({ user: ada });
      stops.push(openRevisionsAheadOfSession(ports)({ projectId, workspace, worker }));
      answerUser();
      await settle();
      const stop = startSessionChild(ports);
      answerUser();
      await settle();
      stop();
      expect(log.slice(-2)).toStrictEqual(['setCredential:withdrawn', 'close']);
    });

    it('does not start on a project a session holds once the session released it to another child', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const { ports } = createPorts({ user: ada });
      const first = startSessionChild(ports);
      const second = startSessionChild(ports);
      first();
      answerUser();
      await settle();
      log.length = 0;
      const release = openRevisionsAheadOfSession(ports)({ projectId, workspace, worker });
      release();
      expect(log).toStrictEqual([]);
      second();
    });
  });

  it('leaves a client open while another session child still holds it, and closes it with the last', async () => {
    const log: string[] = [];
    const { client, answerUser } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    const { ports } = createPorts({ user: ada });
    const first = startSessionChild(ports);
    const second = startSessionChild(ports);
    answerUser();
    await settle();
    log.length = 0;
    first();
    expect(log).not.toContain('close');
    second();
    expect(log).toStrictEqual(['setCredential:withdrawn', 'close']);
  });

  /*
   * Review of d158d3e7 (I7): with the open started at the click, the root may already be applying the checkout when
   * the session's tree first exists. Its re-reads are held from the start, it re-reads what it listed through the hold
   * at the entry closure, and it lists what the apply touched once the apply ends: a partial directory is never the
   * tree's last word.
   */
  it('holds a session tree created mid-apply from its start, and re-reads it at the entry closure and at the end', async () => {
    const log: string[] = [];
    const { client, answerUser, publishStatus } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    const store = createPorts({ user: ada, cloudOpen: true });
    stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
    answerUser();
    await settle();
    const root = `/projects/${projectId}`;
    publishStatus({ applyingRoots: [root], checkoutRoot: root, readiness: 'treeReady' });
    const tree = {
      pauseRefreshes: () => {
        log.push('tree:pause');
        return () => {
          log.push('tree:resume');
        };
      },
      refreshListedThroughHold: () => {
        log.push('tree:read-through');
      },
    };
    log.length = 0;
    stops.push(startSessionChild(store.ports, tree));
    /* Held before the session says anything to the client. */
    expect(log[0]).toBe('tree:pause');
    publishStatus({ applyingRoots: [root], checkoutRoot: root, readiness: 'entryReady' });
    expect(log.filter((entry) => entry.startsWith('tree:'))).toStrictEqual(['tree:pause', 'tree:read-through']);
    publishStatus({ applyingRoots: [], checkoutRoot: root, readiness: 'materialized' });
    expect(log.filter((entry) => entry.startsWith('tree:'))).toStrictEqual([
      'tree:pause',
      'tree:read-through',
      'tree:resume',
    ]);
  });

  it('re-reads a session tree created after the entry closure landed, while the apply still writes', async () => {
    const log: string[] = [];
    const { client, answerUser, publishStatus } = createClient(log);
    revisionClientTestApi.adopt(projectId, worker, client);
    const store = createPorts({ user: ada, cloudOpen: true });
    stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
    answerUser();
    await settle();
    const root = `/projects/${projectId}`;
    publishStatus({ applyingRoots: [root], checkoutRoot: root, readiness: 'entryReady' });
    const tree = {
      pauseRefreshes: () => {
        log.push('tree:pause');
        return () => undefined;
      },
      refreshListedThroughHold: () => {
        log.push('tree:read-through');
      },
    };
    log.length = 0;
    stops.push(startSessionChild(store.ports, tree));
    expect(log.slice(0, 2)).toStrictEqual(['tree:pause', 'tree:read-through']);
  });

  describe('LOW: the connection is bound to the account it was opened for', () => {
    it('is withdrawn and closed when the person signs out before any session took it', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
      answerUser();
      await settle();
      store.signIn(undefined);
      expect(log.slice(-2)).toStrictEqual(['setCredential:withdrawn', 'close']);
    });

    it('is closed at an account switch, and the next account’s session opens its own', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
      answerUser();
      await settle();
      store.signIn(grace);
      expect(log.at(-1)).toBe('close');
      log.length = 0;
      stops.push(startSessionChild(store.ports));
      answerUser();
      await settle();
      expect(log).toContain('setUser:usr_grace');
      expect(log.at(-1)).toBe('open');
    });

    it('is never adopted by a session of another account, even before the switch is announced', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
      answerUser();
      await settle();
      log.length = 0;
      store.swapQuietly(grace);
      stops.push(startSessionChild(store.ports));
      /* Closed before the session says anything to it: the session then opens it afresh as Grace. */
      expect(log.slice(0, 2)).toStrictEqual(['setCredential:withdrawn', 'close']);
      expect(log).toContain('setUser:usr_grace');
    });

    it('opens nothing when the account changed while its credential work was out', async () => {
      const log: string[] = [];
      const { client, answerUser } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker }));
      store.signIn(grace);
      answerUser();
      await settle();
      expect(log).not.toContain('open');
    });
  });

  /*
   * Review of d158d3e7 (LOW): the wait for the root's first answer ends when the gesture is released or the client
   * closes, so a later reopen's answer is never the gesture's. A hand-over to a session on the same connection does not
   * end it (SP3-local 5bc7b961 gap 2).
   */
  describe('the first-answer wait ends at a release and when the client closes, not at hand-over', () => {
    it('never continues the open on a later reopen after a session took the client before its first answer', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true }));
      answerUser();
      await settle();
      /* A session takes the client before the root answered, then closes it. */
      const stop = startSessionChild(store.ports);
      answerUser();
      await settle();
      stop();
      /* Another session reopens it later: its first answer is no longer the gesture's. */
      stops.push(startSessionChild(store.ports));
      answerUser();
      await settle();
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toStrictEqual([]);
    });

    /*
     * SP3-local 5bc7b961 gap 2: the session's `revisions` child takes the client a few milliseconds after the gesture
     * opens it, well before the root first answers. The open the gesture started is still this connection's: ending the
     * wait at the hand-over left `info/refs` to the route's connector, after the route rendered and a listing.
     */
    it('continues the owed open when a session takes the client before its first answer, on the same connection', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      const release = openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true });
      answerUser();
      await settle();
      expect(log.at(-1)).toBe('open');
      /* The session takes the client while the root has not answered yet; the gesture's navigation then settles. */
      stops.push(startSessionChild(store.ports));
      answerUser();
      await settle();
      release();
      expect(store.continued).toStrictEqual([]);
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toHaveLength(1);
      expect(store.continued[0]).toMatchObject({ projectId, account: ada.id, client, asserted: true });
      /* The session holds the connection now: nothing the gesture does ends the open it continued. */
      expect(store.continued[0]?.signal.aborted).toBe(false);
      expect(log).not.toContain('close');
    });

    /* Review of 1cd99a7c (LOW): the answer is the gesture's only while a session still holds that very client. */
    it('continues nothing when the session that took the client lets it go in the tick its root answers', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true }));
      answerUser();
      await settle();
      const stop = startSessionChild(store.ports);
      answerUser();
      await settle();
      /* The root answers, and the session stops before the continuation reads who holds the client. */
      publish({ kind: 'none', phase: 'none' });
      stop();
      await settle();
      expect(store.continued).toStrictEqual([]);
    });

    it('continues nothing when the account changed after the hand-over, before the first answer', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true }));
      answerUser();
      await settle();
      stops.push(startSessionChild(store.ports));
      answerUser();
      await settle();
      /* An identity change is an event on the open client, never a reopen: the same connection answers as Grace. */
      store.signIn(grace);
      answerUser();
      await settle();
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toStrictEqual([]);
    });

    it('continues nothing once the gesture was released before any session took the client', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      const release = openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true });
      answerUser();
      await settle();
      release();
      expect(log.slice(-2)).toStrictEqual(['setCredential:withdrawn', 'close']);
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toStrictEqual([]);
    });

    it('never continues the open on a client that closed before its first answer', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true }));
      answerUser();
      await settle();
      client.close();
      await settle();
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toStrictEqual([]);
    });
  });

  describe('MEDIUM: a created or catalogued project’s Tau remote is connected from the gesture', () => {
    it('continues the owed open as soon as the root first answers with no remote, with no session or route', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const store = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker, asserted: true }));
      answerUser();
      await settle();
      expect(store.continued).toStrictEqual([]);
      publish({ kind: 'none', phase: 'none' });
      await settle();
      expect(store.continued).toHaveLength(1);
      expect(store.continued[0]).toMatchObject({ projectId, account: ada.id, client, asserted: true });
      expect(store.continued[0]?.signal.aborted).toBe(false);
    });

    it('leaves a recorded remote to its root, and owes nothing for a project with no pending open', async () => {
      const log: string[] = [];
      const { client, answerUser, publish } = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, client);
      const owed = createPorts({ user: ada, cloudOpen: true });
      stops.push(openRevisionsAheadOfSession(owed.ports)({ projectId, workspace, worker }));
      answerUser();
      await settle();
      publish({ kind: 'tau', phase: 'connecting' });
      await settle();
      expect(owed.continued).toStrictEqual([]);
    });

    it('ends the continued open’s wait when the gesture is released, and keeps it when a session adopts', async () => {
      const log: string[] = [];
      const first = createClient(log);
      revisionClientTestApi.adopt(projectId, worker, first.client);
      const store = createPorts({ user: ada, cloudOpen: true });
      const release = openRevisionsAheadOfSession(store.ports)({ projectId, workspace, worker });
      first.answerUser();
      await settle();
      first.publish({ kind: 'none', phase: 'none' });
      await settle();
      stops.push(startSessionChild(store.ports));
      first.answerUser();
      await settle();
      release();
      /* Adopted: the open runs on under the session. */
      expect(store.continued[0]?.signal.aborted).toBe(false);

      revisionClientTestApi.reset();
      const second = createClient(log);
      const other = 'prj_ahead00000000000000001';
      revisionClientTestApi.adopt(other, worker, second.client);
      const releaseOther = openRevisionsAheadOfSession(store.ports)({ projectId: other, workspace, worker });
      second.answerUser();
      await settle();
      second.publish({ kind: 'none', phase: 'none' });
      await settle();
      releaseOther();
      expect(store.continued[1]?.signal.aborted).toBe(true);
    });
  });
});
