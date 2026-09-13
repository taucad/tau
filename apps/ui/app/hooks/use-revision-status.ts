/**
 * The page's client of the worker revision root (architecture A38).
 *
 * The page holds no revision actor. It opens one `MessagePort` per project
 * route to the file-manager worker, reads the `RevisionStatus` projection off
 * it, and sends the machine's own verbs back down it. Everything stateful —
 * `projectRevisionsMachine`, its checkout, turn, restore and registry children,
 * the `isomorphic-git` port and the `.tau/runs` leases — lives in the worker.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { Topic } from '@taucad/events';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type {
  RevisionToast,
  RevisionFileComparison,
  WorkerRevisionCommand,
  WorkerRevisionEvent,
  WorkerRevisionRequest,
  WorkerRevisionResponse,
  WorkerRevisionResult,
  WorkerTurnPlacement,
} from '#machines/file-manager.worker.revisions.js';
import { isGithubRemoteUrl, tauRemoteUrl } from '@taucad/revisions';
import type { PublishDraft } from '@taucad/revisions/publish-machine';
import type {
  GitRemoteCredential,
  RevisionDiffEntry,
  RevisionLogRequest,
  RevisionRow,
  RevisionTag,
} from '@taucad/revisions';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { githubRemoteAuthorization } from '#lib/share-providers.js';
import type { GithubRemoteVisibility } from '#lib/share-providers.js';
import { useParams } from 'react-router';
import { revisionUserActor, useAnonymousRevisions, useRevisionSessionUser } from '#lib/revision-actor.js';
import { deviceId } from '#lib/device-id.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProject } from '#hooks/use-project.js';

/** One project's live connection to its revision root. @public */
export type RevisionClient = Readonly<{
  status: () => RevisionStatusProjection | undefined;
  /**
   * Tell this project's port how to reach a third-party remote (S34, W12).
   *
   * A port frame, not a tree command: the port makes the requests, and this is
   * the routing rule plus — once *Connect* has taken consent — the remote's own
   * credential. Memory only, on both sides (I8).
   */
  remoteCredential: (credential: GitRemoteCredential) => void;
  subscribe: (listener: () => void) => () => void;
  /** Every host revision fact this project's root published (S9). */
  subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => () => void;
  /** Restore's toasts — the only thing in the tree that needs a person to see it. */
  subscribeToasts: (listener: (toast: RevisionToast) => void) => () => void;
  /** One branch's history, newest first, each row carrying its `Rev N` (I3). */
  log: (request?: RevisionLogRequest) => Promise<readonly RevisionRow[]>;
  /** Which paths one revision changed, against `from` or its own first parent. */
  diff: (revisionId: string, from?: string) => Promise<readonly RevisionDiffEntry[]>;
  /** Name one revision, or re-point an existing name (S31). */
  tag: (input: Readonly<{ name: string; revisionId: string; note?: string }>) => Promise<RevisionTag | undefined>;
  /** Remove one name. The revision it named stays. */
  deleteTag: (name: string) => Promise<void>;
  /**
   * One file's text before and after a revision, for *Compare* (S38).
   *
   * `against: 'checkout'` is S38's second half: the same round trip, with the
   * working copy on the right instead of another revision — "how does what I
   * have now differ from this revision".
   */
  compare: (
    revisionId: string,
    path: string,
    options?: Readonly<{ from?: string; against?: 'checkout' }>,
  ) => Promise<RevisionFileComparison>;
  /** Place a turn and wait for its lease. Rejects when it cannot be placed. */
  admitTurn: (input: {
    readonly turnId: string;
    readonly chatId: string;
    readonly runId: string;
    readonly checkoutId?: string;
  }) => Promise<WorkerTurnPlacement>;
  send: (command: WorkerRevisionCommand) => void;
  /** Connect, or do nothing when the connection is already open. */
  open: () => void;
  /**
   * Give the root back.
   *
   * The worker stops the tree when the last port for a project closes, so this
   * is the page's half of that contract: the project route sends it when its
   * scope ends, and the document's unload registry sends it on
   * `visibilitychange: hidden`. That frame can send and await nothing;
   * `pagehide` cannot await at all, so what the worker does after it is
   * best-effort (W3c review). The client survives its own close — the next
   * `open`, command or mount connects again.
   */
  close: () => void;
  /**
   * Give the root back and wait for it to settle (W19, D31).
   *
   * The correlated form of {@link RevisionClient.close}: the worker's
   * `release()` takes the close cut and awaits W13's `awaitSyncSettled` before
   * it answers, so `project-session.closing` can flush before it stops the
   * project's children. Resolves anyway when the worker cannot answer — the
   * durable queue is the guarantee after the bound (D28).
   */
  quiesce: () => Promise<void>;
}>;

type ClientState = {
  readonly client: RevisionClient;
  /** The worker the client's channel was opened on; a new one is a new client. */
  readonly worker: Worker;
};

/**
 * One client per project, for the life of the document.
 *
 * A module singleton for the same reason the file-manager's own worker handle
 * is one: two connections for one project would mean two ports the worker keeps
 * the root alive for, and a close from either would be a lie.
 */
const clients = new Map<string, ClientState>();

/**
 * The origin a credential would be minted for, or `undefined` for no remote.
 *
 * @param url - The remote URL the person gave, if any.
 * @returns Its origin.
 */
const remoteOrigin = (url: string | undefined): string | undefined => {
  if (url === undefined) {
    return undefined;
  }
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

/**
 * Open (or reuse) this project's connection to the worker revision root.
 *
 * @param input - The project and the worker serving it.
 * @returns The project's client.
 * @public
 */
export const getRevisionClient = (input: { readonly projectId: string; readonly worker: Worker }): RevisionClient => {
  const existing = clients.get(input.projectId);
  if (existing !== undefined) {
    if (existing.worker === input.worker) {
      return existing.client;
    }
    /* The file-manager terminates and recreates its worker on a reconnect. The
     * old channel died with it, so a client that kept it would post every
     * command into a closed port and never see the projection move again. */
    existing.client.close();
  }
  const listeners = new Topic<void>({ name: 'RevisionClient' });
  const events = new Topic<WorkerRevisionEvent>({ name: 'RevisionClientEvents' });
  const toasts = new Topic<RevisionToast>({ name: 'RevisionClientToasts' });
  const pending = new Map<number, PromiseWithResolvers<WorkerRevisionResult>>();
  let status: RevisionStatusProjection | undefined;
  let nextRequestId = 0;
  let channel: MessageChannel | undefined;
  const receive = ({ data }: MessageEvent<WorkerRevisionResponse>): void => {
    if (data.type === 'status') {
      status = data.status;
      listeners.emit();
      return;
    }
    if (data.type === 'event') {
      events.emit(data.event);
      return;
    }
    if (data.type === 'toast') {
      toasts.emit(data.toast);
      return;
    }
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.type === 'result') {
      request?.resolve(data.result);
      return;
    }
    request?.reject(Object.assign(new Error(data.message), ...(data.code === undefined ? [] : [{ code: data.code }])));
  };
  const open = (): MessagePort => {
    if (channel !== undefined) {
      return channel.port2;
    }
    const opened = new MessageChannel();
    opened.port2.addEventListener('message', receive);
    opened.port2.start();
    input.worker.postMessage({ type: 'revisionsConnect', projectId: input.projectId, port: opened.port1 }, [
      opened.port1,
    ]);
    /* Routing, before anything is asked of a remote: the worker has no
     * `window.ENV`, and telling Tau's own git server from a third-party remote
     * is what decides which credential a request may carry (S34, W12). The
     * credential itself arrives at *Connect*. */
    opened.port2.postMessage({
      command: 'remoteCredential',
      apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
    } satisfies WorkerRevisionRequest);
    channel = opened;
    return opened.port2;
  };
  const post = (request: WorkerRevisionRequest): void => {
    open().postMessage(request);
  };
  /**
   * Ask one question and wait for the frame that carries its answer.
   *
   * @param request - The verb, without its correlation id.
   * @returns The answer's payload.
   */
  const ask = async (request: WorkerRevisionCommand): Promise<WorkerRevisionResult> => {
    nextRequestId += 1;
    const id = nextRequestId;
    const answer = Promise.withResolvers<WorkerRevisionResult>();
    pending.set(id, answer);
    post({ ...request, id });
    return answer.promise;
  };
  const client: RevisionClient = {
    status: () => status,
    remoteCredential: (credential) => {
      post({ command: 'remoteCredential', ...credential });
    },
    subscribe: (listener) => listeners.subscribe(listener),
    subscribeEvents: (listener) => events.subscribe(listener),
    subscribeToasts: (listener) => toasts.subscribe(listener),
    admitTurn: async (placement) => {
      const result = await ask({ command: 'admitTurn', ...placement });
      return result.kind === 'placement' ? result.placement : { checkoutId: '', root: '', baseRevisionId: '' };
    },
    log: async (request) => {
      const result = await ask({
        command: 'log',
        ...(request?.branch === undefined ? {} : { branch: request.branch }),
        ...(request?.limit === undefined ? {} : { limit: request.limit }),
      });
      return result.kind === 'log' ? result.rows : [];
    },
    diff: async (revisionId, from) => {
      const result = await ask({ command: 'diff', revisionId, ...(from === undefined ? {} : { from }) });
      return result.kind === 'diff' ? result.entries : [];
    },
    tag: async (input) => {
      const result = await ask({ command: 'tag', ...input });
      return result.kind === 'tag' ? result.tag : undefined;
    },
    deleteTag: async (name) => {
      await ask({ command: 'deleteTag', name });
    },
    compare: async (revisionId, path, options) => {
      const result = await ask({
        command: 'compare',
        revisionId,
        path,
        ...(options?.from === undefined ? {} : { from: options.from }),
        ...(options?.against === undefined ? {} : { against: options.against }),
      });
      return result.kind === 'comparison' ? result.comparison : { original: '', modified: '' };
    },
    send: (command) => {
      post(command);
    },
    open: () => {
      open();
    },
    close: () => {
      if (channel === undefined) {
        return;
      }
      const closing = channel;
      channel = undefined;
      status = undefined;
      closing.port2.postMessage({ command: 'close' } satisfies WorkerRevisionRequest);
      closing.port2.close();
      listeners.emit();
    },
    quiesce: async () => {
      const closing = channel;
      if (closing === undefined) {
        return;
      }
      channel = undefined;
      status = undefined;
      nextRequestId += 1;
      const id = nextRequestId;
      const answer = Promise.withResolvers<WorkerRevisionResult>();
      pending.set(id, answer);
      closing.port2.postMessage({ command: 'close', id } satisfies WorkerRevisionRequest);
      try {
        await answer.promise;
      } catch {
        /* A worker that cannot answer has not lost the revision: the durable
         * queue is what the next open retries from (D28). */
      } finally {
        pending.delete(id);
        closing.port2.close();
        listeners.emit();
      }
    },
  };
  clients.set(input.projectId, { client, worker: input.worker });
  return client;
};

/** Test-only access to the module's client table; not exported from a barrel. @internal */
export const revisionClientTestApi = {
  reset: (): void => {
    clients.clear();
  },
};

/**
 * This project's client, or `undefined` before the worker is connected.
 *
 * @returns The client, once the file-manager has a worker.
 * @public
 */
export const useRevisionClient = (): RevisionClient | undefined => {
  const { projectId } = useProject();
  const { workspace } = useParams();
  const sessionUser = useRevisionSessionUser();
  const { fileManagerRef } = useFileManager();
  const worker = useSelector(fileManagerRef, (state) => state.context.worker);
  const client = useMemo(
    () => (worker === undefined ? undefined : getRevisionClient({ projectId, worker })),
    [projectId, worker],
  );
  /*
   * A38's two-phase unload, through the one registry the document already has.
   *
   * `hidden` is the real close: the document is alive, so the checkout is asked
   * to record what is on disk and the I5 gate decides whether anything is
   * minted — and **the port stays open**, because everything that revision is
   * for happens after it. Giving the port back here stopped the tree on the
   * same tick: the cut was cancelled mid-flight, so nothing was minted, nothing
   * was pushed and nothing was queued, and the recorder the `pagehide` re-send
   * reads was rebuilt from scratch (W13 review 2 R2, P32).
   *
   * `pagehide` is best-effort — nothing asynchronous will finish — so it sends
   * `close`, offers the last push again, and gives the port back. The worker's
   * own release waits for the scheduler inside its bound (P33); the idle timer
   * inside the checkout is the guarantee, this is the courtesy (S30).
   */
  useFlushOnClose((phase) => {
    if (client === undefined) {
      return;
    }
    if (phase === 'hidden') {
      client.send({ command: 'saveRevision', trigger: 'hidden' });
      return;
    }
    client.send({ command: 'saveRevision', trigger: 'close' });
    /* Offers the receive-pack POST the `hidden` flush built again, bounded at
     * 64 KiB; over it the client refuses and the scheduler records *Not backed
     * up* rather than dropping it (W13). */
    client.send({ command: 'flushKeepalive' });
    client.close();
  });
  /*
   * Who this document records as (S37, A26, EQ8).
   *
   * Sent on every change rather than captured at connect: signing in, signing
   * out and turning anonymity on are all mid-session events, and what they
   * change is the *next* revision. The anonymity decision is applied here,
   * before anything is written, so no later change rewrites a recorded
   * identity.
   */
  const anonymous = useAnonymousRevisions(workspace ?? '');
  /*
   * Which device this document is (W13, W17).
   *
   * Sent from the page because the id lives in `localStorage`, which the worker
   * cannot read. It names a chat log segment, so a worker that was never told
   * writes no chat refs rather than guessing an id two profiles could share.
   */
  useEffect(() => {
    if (client === undefined) {
      return;
    }
    client.send({ command: 'setDeviceId', deviceId: deviceId() });
  }, [client]);
  useEffect(() => {
    if (client === undefined) {
      return;
    }
    client.send({
      command: 'setActor',
      actor: revisionUserActor({
        workspace: workspace ?? '',
        user: sessionUser,
        anonymous,
      }),
    });
  }, [client, workspace, sessionUser, anonymous]);
  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    client.open();
    return () => {
      /* The project's scope ended — a route change, or the worker being
       * replaced. The worker stops the tree when this was its last port.
       *
       * The port is not given back at `hidden` any more, so there is nothing to
       * reopen on the way back either (P32). */
      client.close();
    };
  }, [client]);
  return client;
};

/**
 * The one projection the page reads about revisions.
 *
 * `Rev N` is not here: it is derived from the graph at read time (I3). The
 * remote facet is (W11b); sync *progress* arrives with `sync.machine` (W13).
 *
 * @returns The projection, or `undefined` before the root has answered.
 * @public
 */
export const useRevisionStatus = (): RevisionStatusProjection | undefined => {
  const client = useRevisionClient();
  const subscribe = useCallback(
    (listener: () => void) => client?.subscribe(listener) ?? ((): void => undefined),
    [client],
  );
  return useSyncExternalStore(
    subscribe,
    () => client?.status(),
    () => undefined,
  );
};

/** The verbs the page sends to its revision root. @public */
export type RevisionCommands = Readonly<{
  restore: (revisionId: string) => void;
  returnToLatest: () => void;
  undo: () => void;
  confirm: () => void;
  cancel: () => void;
  switchTo: (branch: string) => void;
  followChat: (chatId: string) => void;
  pinTo: (checkoutId: string) => void;
  /** The *Branches* region's verbs; each one is `branch.machine`'s own event. */
  createBranch: (name: string, from?: string) => void;
  discardBranch: (branch: string, checkoutId?: string) => void;
  mergeBranch: (branch: string) => void;
  renameBranch: (branch: string, name: string) => void;
  confirmBranch: () => void;
  cancelBranch: () => void;
  /**
   * The *Needs resolution* card's verbs (S33, W10).
   *
   * Each names the conflicted revision, because a project can hold more than
   * one conflicted branch and each has its own resolution actor.
   */
  resolveFile: (revisionId: string, path: string, side: 'mine' | 'theirs') => void;
  /** Ask for the marker text; it arrives on the toast channel as `conflictText`. */
  openConflictInEditor: (revisionId: string, path: string) => void;
  /** Hand back the file as the person resolved it. */
  resolveFileInEditor: (revisionId: string, path: string, content: string) => void;
  finishResolution: (revisionId: string) => void;
  abandonResolution: (revisionId: string) => void;
  askChatToResolve: (revisionId: string) => void;
  /**
   * Pick this project's remote (S34).
   *
   * The Tau Cloud URL is resolved here rather than in the worker: only the page
   * has `window.ENV`, and the URL is the whole of what *Tau Cloud* means to the
   * port. No credential travels with it (I8).
   *
   * `url` is therefore optional for *Tau Cloud* — this hook is the one call
   * site that knows where it is — and required for W12's third-party remotes,
   * which the person names themselves.
   */
  connectRemote: (
    kind: 'none' | 'tau' | 'git',
    url?: string,
    options?: Readonly<{ visibility?: GithubRemoteVisibility }>,
  ) => Promise<void>;
  disconnectRemote: () => void;
  cancelRemote: () => void;
  /**
   * Record what is on disk now (S30, AC12).
   *
   * `Mod+S`, the palette's *Save revision*, the tab going hidden and the page
   * unloading are the same wish with different triggers; the checkout's I5 gate
   * decides whether a revision is minted at all, so a save on an unchanged tree
   * costs a tree hash and records nothing.
   */
  saveRevision: (trigger?: 'save' | 'hidden' | 'close') => void;
  /** Name one revision, or re-point an existing name (S31). */
  tag: (input: Readonly<{ name: string; revisionId: string; note?: string }>) => Promise<RevisionTag | undefined>;
  /** Remove one name (S31). */
  deleteTag: (name: string) => Promise<void>;
  /**
   * Open the Publish dialog on this project's own names (S32, W8).
   *
   * The API origin goes with it for the same reason it goes with `connectRemote`:
   * publishing pushes to this project's Tau Cloud repository and records the
   * publication there, and only the page knows which API it is signed in to.
   */
  publishProject: (tag?: string) => void;
  /** Publish the chosen name, with everything only a person decides. */
  confirmPublish: (draft: PublishDraft) => void;
  cancelPublish: () => void;
  /** Close the dialog back to `idle` after the link has been handled. */
  resetPublish: () => void;
}>;

/**
 * The commands this project's revision root accepts.
 *
 * One hook rather than one per verb: they are the same machine's events, and a
 * caller that holds one holds them all.
 *
 * @returns The command surface; every verb is a no-op before the root connects.
 * @public
 */
export const useRevisionCommands = (): RevisionCommands => {
  const client = useRevisionClient();
  const { projectId } = useProject();
  return useMemo(
    () => ({
      restore: (revisionId: string) => client?.send({ command: 'restore', revisionId }),
      returnToLatest: () => client?.send({ command: 'returnToLatest' }),
      undo: () => client?.send({ command: 'undo' }),
      confirm: () => client?.send({ command: 'confirm' }),
      cancel: () => client?.send({ command: 'cancel' }),
      switchTo: (branch: string) => client?.send({ command: 'switch', branch }),
      followChat: (chatId: string) => client?.send({ command: 'followChat', chatId }),
      pinTo: (checkoutId: string) => client?.send({ command: 'pinTo', checkoutId }),
      createBranch: (name: string, from?: string) =>
        client?.send({ command: 'createBranch', name, ...(from === undefined ? {} : { from }) }),
      discardBranch: (branch: string, checkoutId?: string) =>
        client?.send({ command: 'discardBranch', branch, ...(checkoutId === undefined ? {} : { checkoutId }) }),
      mergeBranch: (branch: string) => client?.send({ command: 'mergeBranch', branch }),
      renameBranch: (branch: string, name: string) => client?.send({ command: 'renameBranch', branch, name }),
      confirmBranch: () => client?.send({ command: 'confirmBranch' }),
      cancelBranch: () => client?.send({ command: 'cancelBranch' }),
      resolveFile: (revisionId: string, path: string, side: 'mine' | 'theirs') =>
        client?.send({ command: 'resolve', revisionId, path, side }),
      openConflictInEditor: (revisionId: string, path: string) =>
        client?.send({ command: 'resolveInEditor', revisionId, path }),
      resolveFileInEditor: (revisionId: string, path: string, content: string) =>
        client?.send({ command: 'resolvedInEditor', revisionId, path, content }),
      finishResolution: (revisionId: string) => client?.send({ command: 'finishResolution', revisionId }),
      abandonResolution: (revisionId: string) => client?.send({ command: 'abandonResolution', revisionId }),
      askChatToResolve: (revisionId: string) => client?.send({ command: 'askChatToResolve', revisionId }),
      connectRemote: async (kind, url?: string, options?: Readonly<{ visibility?: GithubRemoteVisibility }>) => {
        /* Every surface that offers *Tau Cloud* — the palette, the Sync region,
         * whatever W7 mounts — sends the same URL, because none of them has to
         * know it. */
        const apiBaseUrl = requireClientEnvironmentUrl('TAU_API_URL');
        const resolved = url ?? (kind === 'tau' ? tauRemoteUrl(apiBaseUrl, projectId) : undefined);
        /* A GitHub remote is reached with the GitHub sign-in on this session
         * (S34). The token is minted here, where `authClient` lives, and handed
         * to the worker for the requests it makes; a session that can no longer
         * mint one says so, and the row asks for *Reconnect* rather than
         * reporting a failed push (charter W12). */
        const origin = kind === 'git' ? remoteOrigin(resolved) : undefined;
        const minted =
          origin !== undefined && resolved !== undefined && isGithubRemoteUrl(resolved)
            ? await githubRemoteAuthorization(options?.visibility ?? 'public').then(
                (authorization) => ({ authorization }),
                (error: unknown) => ({
                  unavailable: error instanceof Error ? error.message : 'The GitHub connection needs to be renewed.',
                }),
              )
            : {};
        /* One frame on *every* connect, including *No remote* and Tau Cloud: the
         * frame is how a credential minted for the last remote stops being
         * offered to the next one (review R1). A non-GitHub host gets an origin
         * and no credential, which is an anonymous read. */
        client?.remoteCredential({ apiBaseUrl, ...(origin === undefined ? {} : { origin }), ...minted });
        client?.send({ command: 'connectRemote', kind, ...(resolved === undefined ? {} : { url: resolved }) });
      },
      disconnectRemote: () => {
        /* The credential goes with the remote it was minted for (review R1). */
        client?.remoteCredential({ apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL') });
        client?.send({ command: 'disconnectRemote' });
      },
      cancelRemote: () => client?.send({ command: 'cancelRemote' }),
      saveRevision: (trigger?: 'save' | 'hidden' | 'close') =>
        client?.send({ command: 'saveRevision', ...(trigger === undefined ? {} : { trigger }) }),
      tag: async (input) => client?.tag(input),
      deleteTag: async (name) => client?.deleteTag(name),
      publishProject: (tag?: string) => {
        /* The origin rides the command itself: it is how the worker names this
         * project's Tau Cloud repository and reaches the publications route
         * (I8 — no credential travels, the session is a cookie the worker's own
         * request carries). Never a credential frame, which carries *no*
         * credential here and would sign this project out of the remote it is
         * connected to (review R4). */
        client?.send({
          command: 'publishProject',
          apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
          ...(tag === undefined ? {} : { tag }),
        });
      },
      confirmPublish: (draft) => client?.send({ command: 'confirmPublish', draft }),
      cancelPublish: () => client?.send({ command: 'cancelPublish' }),
      resetPublish: () => client?.send({ command: 'resetPublish' }),
    }),
    [client, projectId],
  );
};
