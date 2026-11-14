/**
 * The session's revision-client lifecycle as actor logic (app state orchestration charter D4, D8, I5; plan § 4 A7a;
 * inventory row S27).
 *
 * `useRevisionClientLifecycle` (`hooks/use-revision-status.ts`) owns a project's revision connection from React
 * today, mounted by the session binding. This module is the same lifecycle with no React, for the session child
 * `revisions` that A7b invokes:
 *
 * - while an apply writes the tree's root, the tree's refreshes are held;
 * - the page's device id is sent once per client;
 * - the session user is relayed to the client, and the client is opened once the open's own `setUser` has answered,
 *   and closed (its GitHub credential withdrawn first) when the client changes or the actor stops;
 * - the actor identity is sent on each change of the user, the workspace's anonymity, the account's salt or the
 *   project's GitHub binding;
 * - the close cut for the unload session stage is registered once, for the actor's whole life.
 *
 * The client is the project's one client (`getRevisionClient`), looked up again only when the file manager's worker
 * changes, as `useRevisionClient` memoises it. Every input that is React-only today is a port: the session user, and,
 * for the session's own workspace (B7, from its open request), the anonymity preference and the account's salt. A7b
 * supplies the real ports and the close-cut registration (the session stage of `environment`'s sequencer); tests
 * pass fakes.
 *
 * The ports and the client live in this closure, never in a machine's context (D4). Nothing in the app imports this
 * module yet: A7b loads it lazily from the session (D5).
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import type { ActorRefFrom, CallbackActorLogic } from 'xstate';
import { deviceId } from '@taucad/ui-core/lib/device-id';
import { githubProjectBinding } from '@taucad/ui-core/lib/github-project-binding';
import { holdTreeRefreshesWhileApplying } from '@taucad/ui-core/lib/tree-refresh-hold';
import { revisionUserActor } from '#lib/revision-actor.js';
import type { RevisionSessionUser } from '#lib/revision-actor.js';
import { getRevisionClient } from '#hooks/use-revision-status.js';
import type { FlushPhase } from '#hooks/use-flush-on-close.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { RevisionClient } from '#types/revision-client.types.js';

/** A value that can change: the current value, and a listener called after each change. */
export type SessionRevisionsObservable<T> = Readonly<{
  get: () => T;
  subscribe: (listener: () => void) => () => void;
}>;

/** The account's salt for a workspace, as `useRevisionSalt` reads and requests it (EQ10 option (a)). */
export type SessionRevisionsSaltKey = Readonly<{ workspace: string; userId: string }>;

/**
 * The account's salt: the held value, its changes, and a request for it. `request` asks the API once per key while
 * nothing is held, as the hook's effect does; the port keeps the one-request-per-key latch and writes the answer to
 * host state, which `subscribe` then reports.
 */
export type SessionRevisionsSaltPort = Readonly<{
  get: (key: SessionRevisionsSaltKey) => string | undefined;
  subscribe: (listener: () => void) => () => void;
  request: (key: SessionRevisionsSaltKey) => void;
}>;

/** The workspace's anonymity preference (EQ8): whether revisions recorded there hide the person. */
export type SessionRevisionsAnonymityPort = Readonly<{
  get: (workspace: string) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

/** The close cut the unload session stage runs: `hidden` awaits the close revision, `pagehide` offers the keepalive. */
export type SessionRevisionsCloseCut = (phase: FlushPhase) => Promise<void>;

/** Where the close cut is registered: today `useFlushOnClose` at stage `session`; from A7b `environment`'s stage. */
export type SessionRevisionsCloseCutPort = Readonly<{
  register: (cut: SessionRevisionsCloseCut) => () => void;
}>;

/** The ports the lifecycle reads. A7b supplies the real ones; tests pass fakes. */
export type SessionRevisionsPorts = Readonly<{
  sessionUser: SessionRevisionsObservable<RevisionSessionUser | undefined>;
  anonymity: SessionRevisionsAnonymityPort;
  salt: SessionRevisionsSaltPort;
  closeCut: SessionRevisionsCloseCutPort;
}>;

/** One session's identity. `workspace` is the slug of the session's own open request (B7), not the focused route's. */
export type SessionRevisionsInput = Readonly<{
  projectId: string;
  workspace: string;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
}>;

/** `revisions` takes no events. */
export type SessionRevisionsEvent = Readonly<{ type: 'never' }>;

export type SessionRevisionsLogic = CallbackActorLogic<SessionRevisionsEvent, SessionRevisionsInput>;

const withdrawnCredential = { kind: 'withdrawn', reason: 'Open this project in Tau to sync with GitHub.' } as const;

/** Run every step even when one throws, then rethrow the first failure (worker policy rule 5). */
const runIsolated = (steps: ReadonlyArray<(() => void) | undefined>): void => {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      step?.();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw failures[0];
  }
};

/**
 * Build the `revisions` logic over its ports.
 *
 * @param ports - The session user, anonymity, salt and close-cut ports.
 * @returns Callback logic that owns one project's revision-client lifecycle until it stops.
 */
export const createSessionRevisionsLogic = (ports: SessionRevisionsPorts): SessionRevisionsLogic =>
  createCallbackLogic<SessionRevisionsEvent, SessionRevisionsInput>(({ input }) => {
    const { projectId, workspace, fileManagerRef } = input;

    /* What the hook reads in render, kept current by the subscriptions below. */
    let user = ports.sessionUser.get();
    const saltOf = (): string | undefined =>
      user === undefined ? undefined : ports.salt.get({ workspace, userId: user.id });
    let anonymous = ports.anonymity.get(workspace);
    let salt = saltOf();

    /* The client, looked up again only when the worker changes (`useRevisionClient`'s memo). */
    let worker: Worker | undefined;
    let client: RevisionClient | undefined;
    let tree: Readonly<{ client: RevisionClient | undefined; service: unknown; root: string }> | undefined;
    let releaseHold: (() => void) | undefined;
    let closeConnection: (() => void) | undefined;
    /* The client whose open is in flight or done: the user relay's target. */
    let connected: RevisionClient | undefined;
    let unsubscribeBinding: (() => void) | undefined;
    /* The inputs the last `setActor` was sent for, compared as React compares effect dependencies. */
    let actorSentFor: Readonly<{ user: unknown; anonymous: boolean; salt: unknown }> | undefined;

    /*
     * EQ10 (a): asked for on sign-in whatever the preference, so it is ready before anonymity is. Evaluated only when
     * the account or the held salt changed, as the hook's effect re-runs on its dependencies: a failed request is not
     * asked again until one of them changes.
     */
    let saltAskedFor: Readonly<{ userId: string | undefined; salt: string | undefined }> | undefined;
    const requestSalt = (): void => {
      const userId = user?.id;
      if (saltAskedFor !== undefined && saltAskedFor.userId === userId && saltAskedFor.salt === salt) {
        return;
      }
      saltAskedFor = { userId, salt };
      if (userId === undefined || workspace === '' || salt !== undefined) {
        return;
      }
      ports.salt.request({ workspace, userId });
    };

    const sendActor = (): void => {
      if (client === undefined) {
        return;
      }
      actorSentFor = { user, anonymous, salt };
      client.send({
        command: 'setActor',
        actor: revisionUserActor({
          workspace,
          user,
          anonymous,
          salt,
          commitIdentity: githubProjectBinding.get(projectId)?.author,
        }),
      });
    };

    /* The actor is sent again only when one of its inputs changed, as the hook's effect re-runs. */
    const sendActorIfChanged = (): void => {
      if (
        actorSentFor !== undefined &&
        Object.is(actorSentFor.user, user) &&
        actorSentFor.anonymous === anonymous &&
        Object.is(actorSentFor.salt, salt)
      ) {
        return;
      }
      sendActor();
    };

    /* While an apply writes the tree's root, its file events would each re-list a directory the apply is still writing. */
    const followTree = (): void => {
      const { treeService: service, rootDirectory: root } = fileManagerRef.getSnapshot().context;
      if (tree !== undefined && tree.client === client && tree.service === service && tree.root === root) {
        return;
      }
      const held = releaseHold;
      releaseHold = undefined;
      tree = { client, service, root };
      held?.();
      if (client !== undefined && service !== undefined) {
        releaseHold = holdTreeRefreshesWhileApplying({ client, tree: service, root });
      }
    };

    /*
     * Open and close follow the project's client alone (audit R6). Who is signed in reaches the open client as an
     * event; the open's own `setUser` runs first, so the credential frame is queued before the connection that starts
     * the root (D36).
     */
    const connect = (next: RevisionClient): (() => void) => {
      const closed = new AbortController();
      connected = next;
      // async-iife: bootstrap -- the stop retires the session-scoped credential request.
      void (async (): Promise<void> => {
        await next.setUser(ports.sessionUser.get());
        if (!closed.signal.aborted) {
          next.open();
        }
      })();
      return () => {
        closed.abort();
        connected = undefined;
        // async-iife: bootstrap -- a withdrawal sends its frame before it returns.
        void next.setCredential(withdrawnCredential);
        next.close();
      };
    };

    /* Tear down the current client in the hook's cleanup order: the hold, the connection, the actor's binding. */
    const releaseClient = (): void => {
      const hold = releaseHold;
      const connection = closeConnection;
      const binding = unsubscribeBinding;
      releaseHold = undefined;
      tree = undefined;
      closeConnection = undefined;
      unsubscribeBinding = undefined;
      actorSentFor = undefined;
      runIsolated([hold, connection, binding]);
    };

    const followWorker = (): void => {
      const next = fileManagerRef.getSnapshot().context.worker;
      if (next === worker) {
        followTree();
        return;
      }
      worker = next;
      const previous = client;
      client = next === undefined ? undefined : getRevisionClient({ projectId, worker: next });
      if (client === previous) {
        followTree();
        return;
      }
      releaseClient();
      if (client === undefined) {
        return;
      }
      const current = client;
      followTree();
      /* Which device this document is (W13, W17): the id lives in `localStorage`, which the worker cannot read. */
      current.send({ command: 'setDeviceId', deviceId: deviceId() });
      closeConnection = connect(current);
      sendActor();
      /* Linking or unlinking GitHub changes who the next revision is authored as (D33). */
      unsubscribeBinding = githubProjectBinding.subscribe(sendActor);
    };

    /*
     * A38's two-phase unload. `hidden` reaches the session stage only after every producer settled: the checkout
     * takes the gated close cut, awaited (C16) so `pagehide` offers this push's pack. `pagehide` is synchronous and
     * precomputed-only: it offers the keepalive prepared during `hidden` (bounded at 64 KiB).
     */
    const closeCut: SessionRevisionsCloseCut = async (phase) => {
      const current = client;
      if (current === undefined) {
        return;
      }
      if (phase === 'hidden') {
        await current.saveRevision('close');
        return;
      }
      current.send({ command: 'flushKeepalive' });
    };

    followWorker();
    const unregisterCut = ports.closeCut.register(closeCut);
    requestSalt();

    const fileManagerSubscription = fileManagerRef.subscribe({
      next: followWorker,
      error: () => undefined,
    });
    /*
     * One user subscription, so the relay to the open client always runs before the actor is sent again, as the
     * store's listener runs before the re-render does today. A refetch or a new display name is relayed too: `setUser`
     * leaves D2's one-retry latch as it was.
     */
    const unsubscribeUserFacts = ports.sessionUser.subscribe(() => {
      if (connected !== undefined) {
        // async-iife: bootstrap -- the credential reports through the frame it sends.
        void connected.setUser(ports.sessionUser.get());
      }
      user = ports.sessionUser.get();
      salt = saltOf();
      requestSalt();
      sendActorIfChanged();
    });
    const unsubscribeAnonymity = ports.anonymity.subscribe(() => {
      anonymous = ports.anonymity.get(workspace);
      sendActorIfChanged();
    });
    const unsubscribeSalt = ports.salt.subscribe(() => {
      salt = saltOf();
      requestSalt();
      sendActorIfChanged();
    });

    return () => {
      runIsolated([
        () => {
          fileManagerSubscription.unsubscribe();
        },
        unsubscribeUserFacts,
        unsubscribeAnonymity,
        unsubscribeSalt,
        unregisterCut,
        releaseClient,
      ]);
    };
  });
