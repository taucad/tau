/**
 * The session's revision-client lifecycle as actor logic (app state orchestration charter D4, D8, I5; plan § 4 A7a;
 * inventory row S27).
 *
 * Each session's `revisions` child owns its project's revision connection for one file manager, with nothing mounted
 * (A7b; `useRevisionClientLifecycle` did this from the session binding before):
 *
 * - while an apply writes the tree's root, the tree's refreshes are held;
 * - the page's device id is sent once per client;
 * - the session user is relayed to the client, and the client is opened once the open's own `setUser` has answered,
 *   and closed (its GitHub credential withdrawn first) when the client changes or the actor stops;
 * - the actor identity is sent on each change of the user, the workspace's anonymity, the account's salt or the
 *   project's GitHub binding;
 * - the close cut for the unload session stage is registered once, for the actor's whole life;
 * - a close cut the unload could not finish is recorded as owed, and the next child for the project pays it (A7d);
 * - the client is told whether its project is the focused one, so only that one holds the long poll (RV-W5b F12).
 *
 * It gives the session its revision facts, which the session binding relayed from React before:
 *
 * - the facts a policy close relies on go to the session (`revisionState`) and to the chat store (row S3);
 * - whether the chats have arrived goes to the session (`revisionChatsChanged`), whose `project` child retries a
 *   deferred focused chat (row S1);
 * - whether the file check has settled goes to the session (`fileCheckChanged`, A14): a status is published and the model
 *   is not checking its files, or a Tau Cloud open is still owed, whose own placeholder speaks;
 * - while the project is focused, the workbench follows the selected checkout's route (row S23).
 *
 * The client is the project's one client (`getRevisionClient`), looked up again only when the file manager's worker
 * changes, as `useRevisionClient` memoises it; the session's close reaches the same client through
 * `peekRevisionClient`. Every input that React read is a port: the session user, and, for the session's own
 * workspace (B7, from its open request), the anonymity preference and the account's salt; the focused project; the
 * chat store's revision facts and an editor's conflict still being recorded. {@link createSessionRevisionsPorts}
 * builds the real ones over the module stores; tests pass fakes.
 *
 * The ports and the client live in this closure, never in a machine's context (D4). The session loads this module
 * lazily (D5): the entry graph never reaches it.
 *
 * @module
 */
import { createCallbackLogic } from 'xstate';
import { randomUuid } from '@taucad/utils/id';
import type { ActorRefFrom, CallbackActorLogic, EventObject } from 'xstate';
import type { CheckoutRootConfig } from '@taucad/filesystem';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { deviceId } from '@taucad/ui-core/lib/device-id';
import { githubProjectBinding } from '@taucad/ui-core/lib/github-project-binding';
import { holdTreeRefreshesWhileApplying } from '@taucad/ui-core/lib/tree-refresh-hold';
import {
  getAnonymousRevisions,
  getRevisionSalt,
  getRevisionSessionUser,
  requestRevisionSalt,
  revisionUserActor,
  subscribeAnonymousRevisions,
  subscribeRevisionSalt,
  subscribeRevisionSessionUser,
} from '#lib/revision-actor.js';
import type { RevisionSessionUser } from '#lib/revision-actor.js';
import { isRecordingEditorConflict, subscribeEditorConflictRecords } from '#lib/editor-document-session.js';
import { getProjectRootConfigs, setCheckoutRootConfigs } from '#filesystem/handle-store.js';
import { getRevisionClient } from '#hooks/use-revision-status.js';
import { isFileCheckSettled } from '#hooks/use-project-availability.js';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';
import type { FlushPhase } from '#runtime/environment.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { ChatSyncState } from '#machines/chat-session.machine.js';
import type { ChatRevisionFacts } from '#services/chat-session-store.js';
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

/** Where the close cut is registered: the session stage of `environment`'s sequencer (D26). */
export type SessionRevisionsCloseCutPort = Readonly<{
  register: (cut: SessionRevisionsCloseCut) => () => void;
}>;

/** An editor's conflict still being recorded for a project (RV-W5b2 R2-1): its value, and its changes. */
export type SessionRevisionsRecordingPort = Readonly<{
  get: (projectId: string) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * Whose close cut is owed, for which project in which workspace (B7): `actorId` is the id the closing document
 * recorded as (an account id, or an anonymous pseudonym), so only the same person in the same workspace pays it.
 */
export type SessionRevisionsCloseDebtKey = Readonly<{ workspace: string; projectId: string; actorId: string }>;

/** A close cut owed by a document that went before its cut answered (A7d, I6); the token says which record it is. */
export type SessionRevisionsCloseDebt = Readonly<{ token: string }>;

/**
 * Where owed close cuts are kept: storage that outlives the document and is written synchronously, because the
 * unload's `pagehide` pass cannot await (D26). `clear` removes the record only while it still carries `token`.
 */
export type SessionRevisionsCloseDebtPort = Readonly<{
  read: (key: SessionRevisionsCloseDebtKey) => SessionRevisionsCloseDebt | undefined;
  write: (key: SessionRevisionsCloseDebtKey, debt: SessionRevisionsCloseDebt) => void;
  clear: (key: SessionRevisionsCloseDebtKey, token: string) => void;
}>;

/** Whether a Tau Cloud open is still owed for a project (its intent is `open`): its value, and its changes. */
export type SessionRevisionsCloudOpenPort = Readonly<{
  get: (projectId: string) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

/** What the session's composition supplies: the parts of the ports that are not module stores. */
export type SessionRevisionsWiring = Readonly<{
  closeCut: SessionRevisionsCloseCutPort;
  /** The project focus is on: the one whose client holds the long poll and whose workbench follows its checkout. */
  focusedProject: SessionRevisionsObservable<string | undefined>;
  /** Tell one project's chats its revision facts (the chat store's `setRevisionFacts`). */
  chatFacts: (projectId: string, facts: ChatRevisionFacts) => void;
}>;

/** The ports the lifecycle reads. {@link createSessionRevisionsPorts} builds the real ones; tests pass fakes. */
export type SessionRevisionsPorts = SessionRevisionsWiring &
  Readonly<{
    sessionUser: SessionRevisionsObservable<RevisionSessionUser | undefined>;
    anonymity: SessionRevisionsAnonymityPort;
    salt: SessionRevisionsSaltPort;
    recording: SessionRevisionsRecordingPort;
    /** Close cuts owed across documents (A7d). */
    closeDebt: SessionRevisionsCloseDebtPort;
    /** Whether a Tau Cloud open is still owed (A14): the file check then defers to the open's own placeholder. */
    cloudOpen: SessionRevisionsCloudOpenPort;
    /** Where a failure in a teardown goes, so the session is not faulted by a cleanup (D23). */
    reportFault: (error: unknown) => void;
  }>;

/** One session's identity. `workspace` is the slug of the session's own open request (B7), not the focused route's. */
export type SessionRevisionsInput = Readonly<{
  projectId: string;
  workspace: string;
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  /** Install the checkout routes this tab's file managers serve (the session file manager's root synchronisation). */
  syncProjectRoots: () => Promise<void>;
}>;

/** What the session asks `revisions` (A7c): quiesce the project's sync through W13's seam, answered by id (I18). */
export type SessionRevisionsEvent = Readonly<{ type: 'quiesce'; requestId: string }>;

/**
 * What `revisions` tells the session: the facts a policy close reads (row S3), and whether the chats arrived (S1).
 *
 * @public
 */
export type SessionRevisionsEmitted =
  | Readonly<{ type: 'revisionState'; dirty: boolean; pushed: boolean; recording: boolean; pendingCount: number }>
  | Readonly<{ type: 'revisionChatsChanged'; ready: boolean }>
  | Readonly<{ type: 'fileCheckChanged'; settled: boolean; judged: boolean }>
  /** The answer to `quiesce`, with the refusal's message if the client refused (A7c). */
  | Readonly<{ type: 'syncQuiesced'; requestId: string; error?: string }>;

export type SessionRevisionsLogic = CallbackActorLogic<SessionRevisionsEvent, SessionRevisionsInput>;

/** The callback a `revisions` child runs, for a composition that loads this module lazily (D5). */
export type SessionRevisionsCallback = (
  params: Readonly<{
    input: SessionRevisionsInput;
    sendBack: (event: SessionRevisionsEmitted) => void;
    /** Hear what the session asks (A7c). */
    receive: (listener: (event: SessionRevisionsEvent) => void) => void;
  }>,
) => () => void;

const withdrawnCredential = { kind: 'withdrawn', reason: 'Open this project in Tau to sync with GitHub.' } as const;

/** Run every step even when one throws, and report each failure, so a teardown never faults the session (D23). */
const runIsolated = (steps: ReadonlyArray<(() => void) | undefined>, reportFault: (error: unknown) => void): void => {
  for (const step of steps) {
    try {
      step?.();
    } catch (error) {
      reportFault(error);
    }
  }
};

/** The `localStorage` key prefix of an owed close cut; the workspace, the project and the person follow it. */
export const closeDebtStorageKeyPrefix = 'tau-revision-close-owed:';

const closeDebtStorageKey = ({ workspace, projectId, actorId }: SessionRevisionsCloseDebtKey): string =>
  `${closeDebtStorageKeyPrefix}${JSON.stringify([workspace, projectId, actorId])}`;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/** A stored record read back, or `undefined` for anything that is not one (another build's shape, a hand edit). */
const closeDebtOf = (stored: string | undefined): SessionRevisionsCloseDebt | undefined => {
  if (stored === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return undefined;
  }
  return isRecord(parsed) && typeof parsed['token'] === 'string' ? { token: parsed['token'] } : undefined;
};

/**
 * Owed close cuts in this browser's `localStorage` (A7d): it outlives the document, its writes are synchronous, and
 * every tab of the origin reads the same records. Storage that refuses (a private window, a full quota) owes nothing.
 *
 * @public
 */
export const sessionRevisionsCloseDebt: SessionRevisionsCloseDebtPort = {
  read: (key) => {
    try {
      return closeDebtOf(globalThis.localStorage.getItem(closeDebtStorageKey(key)) ?? undefined);
    } catch {
      return undefined;
    }
  },
  write: (key, debt) => {
    try {
      globalThis.localStorage.setItem(closeDebtStorageKey(key), JSON.stringify(debt));
    } catch {
      /* Nothing to keep it in: the next cut still records what is on disk. */
    }
  },
  clear: (key, token) => {
    try {
      const storageKey = closeDebtStorageKey(key);
      if (closeDebtOf(globalThis.localStorage.getItem(storageKey) ?? undefined)?.token === token) {
        globalThis.localStorage.removeItem(storageKey);
      }
    } catch {
      /* See `write`. */
    }
  },
};

/**
 * Build the real ports over the module stores: the published session user, the workspace's anonymity, the account's
 * salt, the editor's conflict records and the owed close cuts. The composition supplies the rest.
 *
 * @param wiring - The close-cut registration, the focused project, the chat store's facts and the fault report.
 * @returns The ports.
 * @public
 */
export const createSessionRevisionsPorts = (
  wiring: SessionRevisionsWiring & Pick<SessionRevisionsPorts, 'reportFault'>,
): SessionRevisionsPorts => ({
  ...wiring,
  sessionUser: { get: getRevisionSessionUser, subscribe: subscribeRevisionSessionUser },
  anonymity: { get: getAnonymousRevisions, subscribe: subscribeAnonymousRevisions },
  salt: { get: getRevisionSalt, subscribe: subscribeRevisionSalt, request: requestRevisionSalt },
  recording: { get: isRecordingEditorConflict, subscribe: subscribeEditorConflictRecords },
  closeDebt: sessionRevisionsCloseDebt,
  cloudOpen: { get: (projectId) => tauCloudIntent.get(projectId) === 'open', subscribe: tauCloudIntent.subscribe },
});

/**
 * Give this project's linked checkouts their routes (blueprint S27, W2 review R4), as `WorkbenchCheckoutRoot` did.
 *
 * A checkout rides its own project's storage root in the dot-prefixed space project discovery never scans (charter
 * D4), so a route needs no new capability and no new storage root, only a base path beside the project.
 *
 * @returns The re-issue, or `undefined` when the set was already installed.
 */
const mountCheckoutRoutes = (
  projectId: string,
  linkedIds: string,
  syncProjectRoots: () => Promise<void>,
): Promise<void> | undefined => {
  if (linkedIds === '') {
    /* Nothing to mount is still an answer: a discarded branch's route must go, or its rooted views keep answering
     * from a tree nothing writes. */
    return setCheckoutRootConfigs([]) ? syncProjectRoots() : undefined;
  }
  return (async () => {
    const configuration = await getProjectRootConfigs();
    const project = configuration.projects.find((config) => config.projectId === projectId);
    if (project === undefined) {
      return;
    }
    const routes: readonly CheckoutRootConfig[] = linkedIds.split(' ').map((checkoutId) => ({
      ...project,
      checkoutId,
      providerBasePath: `.tau/checkouts/${projectId}/${checkoutId}`,
    }));
    if (setCheckoutRootConfigs(routes)) {
      await syncProjectRoots();
    }
  })();
};

/** The sync facet as a chat shows it (R11): `pending`/`queued`/`failed` all hold something the remote has not taken. */
const chatSyncOf = (sync: RevisionStatusProjection['sync']): ChatSyncState =>
  sync.state === 'conflicted'
    ? 'conflicted'
    : sync.state === 'pending' || sync.state === 'queued' || sync.state === 'failed'
      ? 'pending'
      : 'synced';

/**
 * The `revisions` callback over its ports.
 *
 * @param ports - The session user, anonymity, salt, close-cut, focus, chat-facts and recording ports.
 * @returns The callback a `revisions` child runs until it stops.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- One lifecycle: every follower shares the client in this closure.
export const sessionRevisionsCallback =
  (ports: SessionRevisionsPorts): SessionRevisionsCallback =>
  ({ input, sendBack, receive }) => {
    const { projectId, workspace, fileManagerRef, syncProjectRoots } = input;
    /* The session's own workspace (B7) and the person the client records as: a debt is owed and paid there only. */
    const debtKeyOf = (actorId: string): SessionRevisionsCloseDebtKey => ({ workspace, projectId, actorId });

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
    let unsubscribeStatus: (() => void) | undefined;
    /* The project focus is on, as the route's focused session reads it; the client hears each change of `focused`. */
    let focused = ports.focusedProject.get() === projectId;
    let recording = ports.recording.get(projectId);
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

    /* The id the client records as now: whose close cut this document owes if it cannot finish it (A7d). */
    let recordsAs: string | undefined;

    const sendActor = (): void => {
      if (client === undefined) {
        return;
      }
      actorSentFor = { user, anonymous, salt };
      const actor = revisionUserActor({ workspace, user, anonymous, salt });
      recordsAs = actor.id;
      /* The linked forge's identity goes beside the person, for the author line alone (D33, I3). */
      const commitAuthor = githubProjectBinding.get(projectId)?.author;
      client.send({
        command: 'setActor',
        actor,
        ...(commitAuthor === undefined ? {} : { commitAuthor }),
      });
      /* A7d: the person may now be one who owes a close cut here. */
      payDebt();
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

    /*
     * The session's revision facts (row S3), relayed for each projection the client publishes and each change of an
     * editor's recording, as the binding's effect re-ran on the projection and the recording: what a policy close may
     * rely on goes to the session, and the chats' `revision` region to the chat store.
     */
    let relayedFor: Readonly<{ status: RevisionStatusProjection; recording: boolean }> | undefined;
    let chatsReady = false;
    /* A14: the file check, told on its first word and on each change after it. The session starts this client's
     * check as pending; the first word always goes out, so a word the session got from before cannot stand. */
    let fileCheckSettled: boolean | undefined;
    /* Whether the check has judged one of this client's statuses: one published while no Tau Cloud open was owed. Until
     * then a check that starts is still the client's first, which the open waits for (I20); after it, a later one. */
    let hasJudged = false;
    const relayFileCheck = (status: RevisionStatusProjection | undefined): void => {
      /* Read on each word, as the view's hook reads it on each render: another tab can end the open with no signal here. */
      const isCloudOpen = ports.cloudOpen.get(projectId);
      const settled = isFileCheckSettled(status, isCloudOpen);
      if (settled !== fileCheckSettled) {
        fileCheckSettled = settled;
        sendBack({ type: 'fileCheckChanged', settled, judged: hasJudged });
      }
      if (status !== undefined && !isCloudOpen) {
        hasJudged = true;
      }
    };
    const relayFacts = (): void => {
      const status = client?.status();
      relayFileCheck(status);
      const ready = status?.sync.chats === 'ready';
      /* S1: the session's `project` child retries a deferred focused chat once the chats arrive. */
      if (ready !== chatsReady) {
        chatsReady = ready;
        sendBack({ type: 'revisionChatsChanged', ready });
      }
      if (status === undefined || (relayedFor?.status === status && relayedFor.recording === recording)) {
        return;
      }
      relayedFor = { status, recording };
      const { sync } = status;
      sendBack({
        type: 'revisionState',
        dirty: status.projectDirty,
        recording,
        pushed: sync.state === 'noRemote' || sync.state === 'backedUp',
        pendingCount: sync.pendingCount,
      });
      /* R11: the branch the checkout is on gives `revision.line` its producer. */
      ports.chatFacts(projectId, {
        dirty: status.projectDirty,
        sync: chatSyncOf(sync),
        ...(status.line.kind === 'unknown' ? {} : { branch: status.line.name }),
      });
    };

    /*
     * Where the workbench's file services are rooted (S27, S23). While the project is focused, the workbench follows
     * the selected checkout's route: the route is installed before the move, since a `setRoot` at a route no
     * configuration installed would leave every rooted view answering ESTALE. Only the focused project installs, as
     * only its subtree mounted the follower: the installed set is the whole configuration's.
     */
    let checkoutFor: string | undefined;
    let checkoutLive: { current: boolean } | undefined;
    const followCheckout = (): void => {
      const status = client?.status();
      const checkoutRoot = status?.checkoutRoot;
      /* The route ids, not the rows: the facet array is rebuilt on every publication. */
      const linkedIds = (status?.branches ?? [])
        .flatMap((row) =>
          row.checkoutId === undefined || row.checkoutRoot !== `/checkouts/${row.checkoutId}` ? [] : [row.checkoutId],
        )
        .join(' ');
      const key = !focused || checkoutRoot === undefined ? undefined : `${checkoutRoot}\0${linkedIds}`;
      if (key === checkoutFor) {
        return;
      }
      checkoutFor = key;
      /* Two switches in flight are one person changing their mind: the superseded installation never lands. */
      if (checkoutLive !== undefined) {
        checkoutLive.current = false;
        checkoutLive = undefined;
      }
      if (key === undefined || checkoutRoot === undefined) {
        return;
      }
      const mounted = mountCheckoutRoutes(projectId, linkedIds, syncProjectRoots);
      if (mounted === undefined) {
        /* The file manager's own guard drops a `setRoot` that moves nothing, so following is idempotent. */
        fileManagerRef.send({ type: 'setRoot', path: checkoutRoot, projectId });
        return;
      }
      const live = { current: true };
      checkoutLive = live;
      // async-iife: bootstrap -- the settlement a caller would want is the `setRoot` itself.
      void (async (): Promise<void> => {
        try {
          await mounted;
        } catch (error) {
          /* An installation the session stopped or a newer selection overtook is cut short, not faulted (D23). */
          if (live.current) {
            ports.reportFault(error);
          }
          return;
        }
        if (live.current) {
          fileManagerRef.send({ type: 'setRoot', path: checkoutRoot, projectId });
        }
      })();
    };

    /* The stop, set below. */
    let stopped = false;
    /* The persons whose owed close cut this client has looked for, so each is asked for at most once (A7d). */
    let debtsLookedFor = new Set<string>();

    /* A7d: the registry has answered with a checkout, so a cut asked now can record. A failed registry read also
     * answers (`registrySettled`), with no checkout. */
    const hasCheckoutToCut = (status: RevisionStatusProjection | undefined): boolean =>
      status?.registrySettled === true && status.checkoutId !== undefined;

    /*
     * A7d (I6, S26): the close cut an earlier document owed. It is asked for as soon as the client records as the
     * person who owed it, in the session's own workspace, and the checkout registry has answered with a checkout,
     * since a cut asked of a root with no checkout records nothing. It is cut under the live actor, which is that
     * person: the client never records as anyone else. A person who never comes back in this document leaves the debt
     * for a later one; the bytes stay on disk for the next cut either way. Only the cut's answer settles the record,
     * and only while it carries the token read: a client closed first leaves it to the next open, and a newer record
     * written meanwhile is kept. The checkout's I5 gate mints nothing for a record that outlived a cut that landed.
     */
    function payDebt(): void {
      const target = client;
      const actorId = recordsAs;
      if (target === undefined || actorId === undefined || !hasCheckoutToCut(target.status())) {
        return;
      }
      if (debtsLookedFor.has(actorId)) {
        return;
      }
      debtsLookedFor.add(actorId);
      const key = debtKeyOf(actorId);
      const owed = ports.closeDebt.read(key);
      if (owed === undefined) {
        return;
      }
      // async-iife: bootstrap -- the cut's answer settles the record.
      void (async (): Promise<void> => {
        try {
          await target.saveRevision('close');
        } catch {
          /* The connection closed first: the debt stays for the next open. */
          return;
        }
        runIsolated(
          [
            () => {
              ports.closeDebt.clear(key, owed.token);
            },
          ],
          ports.reportFault,
        );
      })();
    }

    const followStatus = (): void => {
      relayFacts();
      followCheckout();
      payDebt();
    };

    /* Tear down the current client in the hook's cleanup order: the hold, the connection, the actor's binding. */
    const releaseClient = (): void => {
      const hold = releaseHold;
      const connection = closeConnection;
      const binding = unsubscribeBinding;
      const statusSubscription = unsubscribeStatus;
      releaseHold = undefined;
      tree = undefined;
      closeConnection = undefined;
      unsubscribeBinding = undefined;
      unsubscribeStatus = undefined;
      actorSentFor = undefined;
      recordsAs = undefined;
      runIsolated([hold, connection, binding, statusSubscription], ports.reportFault);
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
      debtsLookedFor = new Set();
      if (client === undefined) {
        followStatus();
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
      /* RV-W5b F12: only the focused project holds its revision long poll; one that gains focus pulls once open. */
      current.focus?.(focused);
      unsubscribeStatus = current.subscribe(followStatus);
      followStatus();
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
      /*
       * A7d: the cut is owed until it answers, and the record is written before anything is asked, synchronously: on a
       * reload `pagehide` comes before `hidden`, and the worker goes with the document before the cut can land.
       */
      const owedToken = owe();
      if (phase === 'hidden') {
        /* A root with no checkout to cut (its registry has not answered, or answered with none) records nothing:
         * the debt stays for the next open. */
        const canRecord = hasCheckoutToCut(current.status());
        await current.saveRevision('close');
        if (owedToken !== undefined && canRecord) {
          ports.closeDebt.clear(owedToken.key, owedToken.token);
        }
        return;
      }
      current.send({ command: 'flushKeepalive' });
    };

    /* Record the close cut as owed under who the client records as; nothing is owed before the actor is sent. */
    const owe = (): Readonly<{ key: SessionRevisionsCloseDebtKey; token: string }> | undefined => {
      if (recordsAs === undefined) {
        return undefined;
      }
      const owed = { key: debtKeyOf(recordsAs), token: randomUuid() };
      ports.closeDebt.write(owed.key, { token: owed.token });
      return owed;
    };

    /*
     * A7c (row S6): the session's close step, W13's seam called and never reimplemented. The client this child opened
     * quiesces (`close` → `pushSettled` or the durable queue write, bounded inside the worker); no client, nothing to
     * settle. A child stopped meanwhile answers nothing: the session has moved on.
     */
    receive((event) => {
      const current = client;
      const settle = async (): Promise<void> => {
        let refusal: string | undefined;
        try {
          await current?.quiesce();
        } catch (error) {
          refusal = error instanceof Error ? error.message : 'The project could not finish syncing.';
        }
        if (!stopped) {
          sendBack({
            type: 'syncQuiesced',
            requestId: event.requestId,
            ...(refusal === undefined ? {} : { error: refusal }),
          });
        }
      };
      // async-iife: bootstrap -- `receive` is synchronous; the answer goes through `sendBack`.
      void settle();
    });

    /* Each step's release, as it is taken: a start that throws partway releases what it took, then rethrows (D23). */
    let unregisterCut: (() => void) | undefined;
    let unsubscribeFileManager: (() => void) | undefined;
    let unsubscribeUserFacts: (() => void) | undefined;
    let unsubscribeAnonymity: (() => void) | undefined;
    let unsubscribeSalt: (() => void) | undefined;
    let unsubscribeFocus: (() => void) | undefined;
    let unsubscribeRecording: (() => void) | undefined;
    let unsubscribeCloudOpen: (() => void) | undefined;
    const stop = (): void => {
      stopped = true;
      if (checkoutLive !== undefined) {
        checkoutLive.current = false;
      }
      runIsolated(
        [
          unsubscribeFileManager,
          unsubscribeUserFacts,
          unsubscribeAnonymity,
          unsubscribeSalt,
          unsubscribeFocus,
          unsubscribeRecording,
          unsubscribeCloudOpen,
          unregisterCut,
          releaseClient,
        ],
        ports.reportFault,
      );
    };

    try {
      followWorker();
      /* A14: the first word, even with no client yet: a Tau Cloud open still owed is settled at once. */
      relayFileCheck(client?.status());
      unregisterCut = ports.closeCut.register(closeCut);
      requestSalt();

      const fileManagerSubscription = fileManagerRef.subscribe({
        next: followWorker,
        error: () => undefined,
      });
      unsubscribeFileManager = () => {
        fileManagerSubscription.unsubscribe();
      };
      /*
       * One user subscription, so the relay to the open client always runs before the actor is sent again, as the
       * store's listener runs before the re-render does today. A refetch or a new display name is relayed too:
       * `setUser` leaves D2's one-retry latch as it was.
       */
      unsubscribeUserFacts = ports.sessionUser.subscribe(() => {
        if (connected !== undefined) {
          // async-iife: bootstrap -- the credential reports through the frame it sends.
          void connected.setUser(ports.sessionUser.get());
        }
        user = ports.sessionUser.get();
        salt = saltOf();
        requestSalt();
        sendActorIfChanged();
      });
      unsubscribeAnonymity = ports.anonymity.subscribe(() => {
        anonymous = ports.anonymity.get(workspace);
        sendActorIfChanged();
      });
      unsubscribeSalt = ports.salt.subscribe(() => {
        salt = saltOf();
        requestSalt();
        sendActorIfChanged();
      });
      unsubscribeFocus = ports.focusedProject.subscribe(() => {
        const next = ports.focusedProject.get() === projectId;
        if (next === focused) {
          return;
        }
        focused = next;
        client?.focus?.(focused);
        followCheckout();
      });
      unsubscribeRecording = ports.recording.subscribe(() => {
        const next = ports.recording.get(projectId);
        if (next === recording) {
          return;
        }
        recording = next;
        relayFacts();
      });
      unsubscribeCloudOpen = ports.cloudOpen.subscribe(() => {
        relayFileCheck(client?.status());
      });
    } catch (error) {
      stop();
      throw error;
    }

    return stop;
  };

/**
 * Build the `revisions` logic over its ports.
 *
 * @param ports - The session user, anonymity, salt, close-cut, focus, chat-facts and recording ports.
 * @returns Callback logic that owns one project's revision-client lifecycle until it stops.
 * @public
 */
export const createSessionRevisionsLogic = (ports: SessionRevisionsPorts): SessionRevisionsLogic =>
  createCallbackLogic<SessionRevisionsEvent, SessionRevisionsInput>(({ input, sendBack, receive }) =>
    sessionRevisionsCallback(ports)({ input, sendBack: sendBack as (event: EventObject) => void, receive }),
  );
