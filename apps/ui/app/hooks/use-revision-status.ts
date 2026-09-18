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
import { sessionEpoch } from '#services/sessions-store.js';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
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
import { useParams } from 'react-router';
import { revisionUserActor, useAnonymousRevisions, useRevisionSessionUser } from '#lib/revision-actor.js';
import { deviceId } from '#lib/device-id.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectAccessRole } from '#hooks/use-cloud-projects.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';
import { githubConnections } from '#lib/github-connections.js';
import { githubProjectBinding } from '#lib/github-project-binding.js';
import type { AgentChannelClient, JsonValue } from '@taucad/agent-host';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';

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
  /** Every settled revision signal this project's root published. */
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
  /**
   * Record what is on disk and wait for the answer (C16, contract §6).
   *
   * The correlated form of `send({ command: 'saveRevision' })`: it resolves
   * once the root has settled the cut and its scheduler has quiesced, bounded
   * by `syncQuiesceMilliseconds` on the far side. The `hidden` unload registrant
   * awaits it so `pagehide`'s keepalive POST carries *this* close revision
   * rather than the previous push's pack.
   */
  saveRevision: (trigger?: 'save' | 'hidden' | 'close') => Promise<void>;
  /** Connect, or do nothing when the connection is already open. */
  open: () => void;
  /**
   * Give the root back.
   *
   * The worker stops the tree when the last port for a project closes, so this
   * is the page's half of that contract when the owning project scope ends or
   * its worker is replaced. Lifecycle close preparation uses the correlated
   * {@link RevisionClient.quiesce}; pagehide does not close because release
   * itself takes a fresh cut. The client survives its own close — the next
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

/** Build the renderer half of a host-owned native revision root. */
export const createHostRevisionClient = (input: {
  readonly projectId: string;
  readonly connect?: () => Promise<AgentChannelClient>;
}): RevisionClient => {
  const listeners = new Topic<void>({ name: 'HostRevisionClient' });
  const events = new Topic<WorkerRevisionEvent>({
    name: 'HostRevisionClientEvents',
  });
  const toasts = new Topic<RevisionToast>({ name: 'HostRevisionClientToasts' });
  const projectedChatIds = new Set<string>();
  let status: RevisionStatusProjection | undefined;
  let channel: AgentChannelClient | undefined;
  let opening: Promise<AgentChannelClient> | undefined;
  let streamAbort: AbortController | undefined;
  let connectionGeneration = 0;

  const staleConnection = (): Error & { readonly code: string } =>
    Object.assign(new Error('The revision connection was closed.'), {
      code: 'STALE_REVISION_CONNECTION',
    });
  const isStaleConnection = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'STALE_REVISION_CONNECTION';

  const applyStatus = (value: JsonValue): void => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('projectId' in value) ||
      value['projectId'] !== input.projectId
    ) {
      throw Object.assign(new Error('The host returned an invalid revision projection.'), {
        code: 'INVALID_REVISION_RESPONSE',
      });
    }
    status = value as unknown as RevisionStatusProjection;
    listeners.emit();
  };
  const connect =
    input.connect ??
    (async (): Promise<AgentChannelClient> =>
      openAgentHostChannel('desktop', {
        projectId: input.projectId,
        workspaceRoot: await desktopWorkspaceRoot(input.projectId),
      }));
  const opened = async (): Promise<AgentChannelClient> => {
    if (channel !== undefined) {
      return channel;
    }
    if (opening !== undefined) {
      return opening;
    }
    const generation = connectionGeneration;
    const pending = (async (): Promise<AgentChannelClient> => {
      const next = await connect();
      if (generation !== connectionGeneration) {
        next.close();
        throw staleConnection();
      }
      channel = next;
      const initial = await next.execute({
        type: 'revision',
        request: { command: 'status' },
      });
      if (generation !== connectionGeneration) {
        throw staleConnection();
      }
      if (initial.type !== 'revision') {
        throw new Error('The host answered a revision request with an agent response.');
      }
      applyStatus(initial.status);
      /* The desktop host keeps this project's root alive across renderer
       * reloads. Reattaching is therefore the open signal that makes the
       * retained scheduler fetch again before the client reads remote work. */
      await next.execute({
        type: 'revision',
        request: { command: 'open' },
      });
      const abort = new AbortController();
      streamAbort = abort;
      // async-iife: bootstrap -- the stream lives for the connection and reports through Topics.
      void (async (): Promise<void> => {
        try {
          for await (const event of next.revisionEvents(abort.signal)) {
            if (generation !== connectionGeneration) {
              break;
            }
            if (event.kind === 'status') {
              applyStatus(event.value);
            } else if (event.kind === 'event') {
              const projected = event.value as unknown as WorkerRevisionEvent;
              if (projected.type === 'chats.projected') {
                for (const chatId of projected.chatIds) {
                  projectedChatIds.add(chatId);
                }
              }
              events.emit(projected);
            } else {
              toasts.emit(event.value as unknown as RevisionToast);
            }
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            toasts.emit({
              type: 'error',
              subject: 'save',
              message: error instanceof Error ? error.message : 'The revision connection failed.',
            });
          }
        }
      })();
      return next;
    })();
    opening = pending;
    try {
      return await pending;
    } finally {
      if (opening === pending) {
        opening = undefined;
      }
    }
  };
  const ask = async (request: JsonValue): Promise<JsonValue> => {
    const connected = await opened();
    const response = await connected.execute({ type: 'revision', request });
    if (response.type !== 'revision') {
      throw new Error('The host answered a revision request with an agent response.');
    }
    applyStatus(response.status);
    return response.result;
  };
  const send = (request: WorkerRevisionCommand): void => {
    // Only a browser-owned replica adopts host settlements. This client already
    // reads that host's authoritative revision stream; never echo its heads back.
    if (request.command === 'adoptHostFinalized') {
      return;
    }
    // async-iife: bootstrap -- a machine verb reports its settled state on the revision stream.
    void (async (): Promise<void> => {
      try {
        await ask(request as unknown as JsonValue);
      } catch (error) {
        if (isStaleConnection(error)) {
          return;
        }
        toasts.emit({
          type: 'error',
          subject: 'save',
          message: error instanceof Error ? error.message : 'The revision request failed.',
        });
      }
    })();
  };
  const close = (): void => {
    connectionGeneration += 1;
    opening = undefined;
    streamAbort?.abort();
    streamAbort = undefined;
    channel?.close();
    channel = undefined;
    status = undefined;
    projectedChatIds.clear();
    listeners.emit();
  };

  return {
    status: () => status,
    remoteCredential: (credential) => {
      // async-iife: bootstrap -- credential updates report through the same toast topic.
      void (async (): Promise<void> => {
        try {
          await ask({ command: 'remoteCredential', ...credential });
        } catch (error) {
          toasts.emit({
            type: 'error',
            subject: 'save',
            message: error instanceof Error ? error.message : 'The revision credential could not be updated.',
          });
        }
      })();
    },
    subscribe: (listener) => listeners.subscribe(listener),
    subscribeEvents: (listener) => {
      const unsubscribe = events.subscribe(listener);
      if (projectedChatIds.size > 0) {
        try {
          listener({
            type: 'chats.projected',
            projectId: input.projectId,
            chatIds: [...projectedChatIds],
          });
        } catch {
          /* Match Topic fan-out: one failed observer cannot break the client. */
        }
      }
      return unsubscribe;
    },
    subscribeToasts: (listener) => toasts.subscribe(listener),
    admitTurn: async () => ({ checkoutId: '', root: '', baseRevisionId: '' }),
    log: async (request) =>
      (await ask({
        command: 'log',
        ...(request?.branch === undefined ? {} : { branch: request.branch }),
        ...(request?.limit === undefined ? {} : { limit: request.limit }),
      })) as unknown as readonly RevisionRow[],
    diff: async (revisionId, from) =>
      (await ask({
        command: 'diff',
        revisionId,
        ...(from === undefined ? {} : { from }),
      })) as unknown as readonly RevisionDiffEntry[],
    tag: async (tagInput) => (await ask({ command: 'tag', ...tagInput })) as unknown as RevisionTag | undefined,
    deleteTag: async (name) => {
      await ask({ command: 'deleteTag', name });
    },
    compare: async (revisionId, path, options) =>
      (await ask({
        command: 'compare',
        revisionId,
        path,
        ...(options?.from === undefined ? {} : { from: options.from }),
        ...(options?.against === undefined ? {} : { against: options.against }),
      })) as unknown as RevisionFileComparison,
    send,
    saveRevision: async (trigger) => {
      await ask({ command: 'saveRevision', ...(trigger === undefined ? {} : { trigger }) });
    },
    open: () => {
      // async-iife: bootstrap -- project lifecycle owns this connection and errors surface as toasts.
      void (async (): Promise<void> => {
        try {
          await opened();
        } catch (error) {
          if (isStaleConnection(error)) {
            return;
          }
          toasts.emit({
            type: 'error',
            subject: 'save',
            message: error instanceof Error ? error.message : 'The revision connection could not be opened.',
          });
        }
      })();
    },
    close,
    quiesce: async () => {
      await ask({ command: 'quiesce' });
      close();
    },
  };
};

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
  if (isDesktopTarget) {
    const client = createHostRevisionClient({ projectId: input.projectId });
    clients.set(input.projectId, { client, worker: input.worker });
    return client;
  }
  const listeners = new Topic<void>({ name: 'RevisionClient' });
  const events = new Topic<WorkerRevisionEvent>({
    name: 'RevisionClientEvents',
  });
  const toasts = new Topic<RevisionToast>({ name: 'RevisionClientToasts' });
  const projectedChatIds = new Set<string>();
  const pending = new Map<number, PromiseWithResolvers<WorkerRevisionResult>>();
  let status: RevisionStatusProjection | undefined;
  let nextRequestId = 0;
  let connectionGeneration = 0;
  let channel: MessageChannel | undefined;
  const receive = (generation: number, { data }: MessageEvent<WorkerRevisionResponse>): void => {
    if (generation !== connectionGeneration) {
      return;
    }
    if (data.type === 'status') {
      status = data.status;
      listeners.emit();
      return;
    }
    if (data.type === 'event') {
      if (data.event.type === 'chats.projected') {
        for (const chatId of data.event.chatIds) {
          projectedChatIds.add(chatId);
        }
      }
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
    connectionGeneration += 1;
    const generation = connectionGeneration;
    opened.port2.addEventListener('message', (event: MessageEvent<WorkerRevisionResponse>) => {
      receive(generation, event);
    });
    opened.port2.start();
    /* W19/R5: the frame carries who serves this project's revisions and which
     * client session is asking (P31, W3c-R4). Both fields had no sender, so
     * the worker's gate and its per-project authority epoch were inert. */
    input.worker.postMessage(
      {
        type: 'revisionsConnect',
        projectId: input.projectId,
        port: opened.port1,
        hostServesRevisions: isDesktopTarget,
        sessionEpoch,
      },
      [opened.port1],
    );
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
  const cancelPendingRequests = (): void => {
    const error = new DOMException('The revision connection closed before the request completed.', 'AbortError');
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };
  const client: RevisionClient = {
    status: () => status,
    remoteCredential: (credential) => {
      post({ command: 'remoteCredential', ...credential });
    },
    subscribe: (listener) => listeners.subscribe(listener),
    subscribeEvents: (listener) => {
      const unsubscribe = events.subscribe(listener);
      if (projectedChatIds.size > 0) {
        try {
          listener({
            type: 'chats.projected',
            projectId: input.projectId,
            chatIds: [...projectedChatIds],
          });
        } catch {
          /* Match Topic fan-out: one failed observer cannot break the client. */
        }
      }
      return unsubscribe;
    },
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
      const result = await ask({
        command: 'diff',
        revisionId,
        ...(from === undefined ? {} : { from }),
      });
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
    saveRevision: async (trigger) => {
      await ask({ command: 'saveRevision', ...(trigger === undefined ? {} : { trigger }) });
    },
    open: () => {
      open();
    },
    close: () => {
      if (channel === undefined) {
        return;
      }
      const closing = channel;
      cancelPendingRequests();
      channel = undefined;
      connectionGeneration += 1;
      status = undefined;
      projectedChatIds.clear();
      closing.port2.postMessage({
        command: 'close',
      } satisfies WorkerRevisionRequest);
      closing.port2.close();
      listeners.emit();
    },
    quiesce: async () => {
      const closing = channel;
      if (closing === undefined) {
        return;
      }
      nextRequestId += 1;
      const id = nextRequestId;
      const answer = Promise.withResolvers<WorkerRevisionResult>();
      const receiveClose = ({ data }: MessageEvent<WorkerRevisionResponse>): void => {
        if ((data.type !== 'result' && data.type !== 'error') || data.id !== id) {
          return;
        }
        if (data.type === 'result') {
          answer.resolve(data.result);
          return;
        }
        answer.reject(
          Object.assign(new Error(data.message), ...(data.code === undefined ? [] : [{ code: data.code }])),
        );
      };
      closing.port2.addEventListener('message', receiveClose);
      closing.port2.postMessage({
        command: 'close',
        id,
      } satisfies WorkerRevisionRequest);
      try {
        await answer.promise;
        cancelPendingRequests();
        if (channel === closing) {
          channel = undefined;
          connectionGeneration += 1;
          status = undefined;
          projectedChatIds.clear();
        }
        closing.port2.close();
        listeners.emit();
      } finally {
        closing.port2.removeEventListener('message', receiveClose);
      }
    },
  };
  clients.set(input.projectId, { client, worker: input.worker });
  return client;
};

/**
 * This project's client if one already exists, without opening one (W20).
 *
 * The sidebar reads every live project's `RevisionStatus`, and it is not inside
 * any project's route, so it must not be the thing that creates a connection:
 * a project with no client has nothing to say about branches or sync, and A29
 * says such a row shows nothing at all.
 *
 * @param projectId - The project the row is about.
 * @returns Its client, when its route subtree already opened one.
 * @public
 */
export const peekRevisionClient = (projectId: string): RevisionClient | undefined => clients.get(projectId)?.client;

/** Test-only access to the module's client table; not exported from a barrel. @internal */
export const revisionClientTestApi = {
  reset: (): void => {
    clients.clear();
  },
};

/**
 * What this account may do with the open project on Tau Cloud (D27).
 *
 * `GET /v1/projects` is the only place a client learns it, and the listing is
 * the one the library already reads — a role shown in the Sync region is the
 * same row the library labels, from one cache key.
 *
 * `undefined` is the honest answer for a project Tau Cloud does not list for
 * this account: signed out, offline, never backed up, or somebody else's. Every
 * surface it gates folds away rather than guessing, and the API refuses each of
 * them again on its own.
 *
 * @returns The role held, or `undefined`.
 * @public
 */
export const useProjectRole = (): ProjectAccessRole | undefined => {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  /* N3: only a Tau remote has a cloud project that can hold a role, so a
     GitHub-backed or unconnected project never makes the listing request. */
  return useProjectAccessRole(projectId, status?.remote.kind === 'tau');
};

/**
 * This project's client, or `undefined` before the worker is connected.
 *
 * @returns The client, once the file-manager has a worker.
 * @public
 */
export const useRevisionClient = (): RevisionClient | undefined => {
  const { projectId } = useProject();
  const { fileManagerRef } = useFileManager();
  const worker = useSelector(fileManagerRef, (state) => state.context.worker);
  return useMemo(
    () => (worker === undefined ? undefined : getRevisionClient({ projectId, worker })),
    [projectId, worker],
  );
};

/**
 * Own the live revision connection for this project.
 *
 * Mount exactly once in the retained project session. Other revision hooks are
 * passive consumers of {@link useRevisionClient}; they must not open, close or
 * register lifecycle work for the shared client.
 *
 * @returns The owned client, once the file-manager has a worker.
 * @public
 */
export const useRevisionClientLifecycle = (): RevisionClient | undefined => {
  const { workspace } = useParams();
  const sessionUser = useRevisionSessionUser();
  const client = useRevisionClient();
  const { projectId } = useProject();
  /*
   * A38's two-phase unload, through the one registry the document already has.
   *
   * `hidden` reaches this session stage only after the provider has awaited all
   * producer flush acknowledgements. The checkout then takes the gated close
   * cut and starts zero-debounce sync while the page can still work (W13, V18).
   * The port stays open so the cut, mint, push and durable queue can settle.
   *
   * `pagehide` is synchronous and precomputed-only. It offers the serialized
   * history-set POST prepared during `hidden`; it does not mint a revision or
   * close the worker root, because release itself takes a fresh close cut.
   */
  useFlushOnClose(
    async (phase) => {
      if (client === undefined) {
        return;
      }
      if (phase === 'hidden') {
        /* Awaited (C16): posting and returning let `flushHidden` resolve in the
         * same microtask, so `pagehide` offered the *previous* push's pack —
         * or nothing. The far side bounds this at `syncQuiesceMilliseconds`. */
        await client.saveRevision('close');
        return;
      }
      /* Bounded at 64 KiB; refusal remains a durable *Not backed up* fact. */
      client.send({ command: 'flushKeepalive' });
    },
    { stage: 'session' },
  );
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
    const binding = githubProjectBinding.get(projectId);
    const credentialAbort = new AbortController();
    const provisionCredential = async (): Promise<void> => {
      if (binding === undefined || sessionUser === undefined) {
        client.remoteCredential({
          apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
        });
      } else {
        try {
          const token = await githubConnections.token(binding.connectionId);
          if (credentialAbort.signal.aborted) {
            return;
          }
          if (token.generation < binding.generation) {
            throw new Error('The GitHub connection is stale. Reconnect it.');
          }
          client.remoteCredential({
            apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
            origin: 'https://github.com',
            repositoryUrl: binding.repositoryUrl,
            authorization: `Basic ${globalThis.btoa(`x-access-token:${token.accessToken}`)}`,
          });
        } catch (error) {
          if (credentialAbort.signal.aborted) {
            return;
          }
          client.remoteCredential({
            apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
            origin: 'https://github.com',
            repositoryUrl: binding.repositoryUrl,
            unavailable: error instanceof Error ? error.message : 'The GitHub connection needs to be renewed.',
          });
        }
      }
      if (!credentialAbort.signal.aborted) {
        client.open();
      }
    };
    // async-iife: bootstrap -- project cleanup fences the session-scoped credential request.
    void provisionCredential();
    return () => {
      credentialAbort.abort();
      client.remoteCredential({
        apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
      });
      client.close();
    };
  }, [client, projectId, sessionUser]);
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
export const useRevisionClientStatus = (client: RevisionClient | undefined): RevisionStatusProjection | undefined => {
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

/** The current project's revision projection. @public */
export const useRevisionStatus = (): RevisionStatusProjection | undefined =>
  useRevisionClientStatus(useRevisionClient());

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
    options?: Readonly<{
      authorization?: string;
      provider?: 'github';
      repositoryId?: string;
      connectionId?: string;
      generation?: number;
      fetchOnly?: boolean;
    }>,
  ) => Promise<void>;
  disconnectRemote: () => void;
  cancelRemote: () => void;
  /** Ask the existing project scheduler to fetch and push now. */
  syncNow: () => void;
  /**
   * Record what is on disk now (S30, AC12).
   *
   * `Mod+S`, the palette's *Save revision*, the tab going hidden and the page
   * unloading are the same wish with different triggers; the checkout's I5 gate
   * decides whether a revision is minted at all, so a save on an unchanged tree
   * costs a tree hash and records nothing.
   */
  saveRevision: (trigger?: 'save' | 'hidden' | 'close') => Promise<void>;
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
        client?.send({
          command: 'createBranch',
          name,
          ...(from === undefined ? {} : { from }),
        }),
      discardBranch: (branch: string, checkoutId?: string) =>
        client?.send({
          command: 'discardBranch',
          branch,
          ...(checkoutId === undefined ? {} : { checkoutId }),
        }),
      mergeBranch: (branch: string) => client?.send({ command: 'mergeBranch', branch }),
      renameBranch: (branch: string, name: string) => client?.send({ command: 'renameBranch', branch, name }),
      confirmBranch: () => client?.send({ command: 'confirmBranch' }),
      cancelBranch: () => client?.send({ command: 'cancelBranch' }),
      resolveFile: (revisionId: string, path: string, side: 'mine' | 'theirs') =>
        client?.send({ command: 'resolve', revisionId, path, side }),
      openConflictInEditor: (revisionId: string, path: string) =>
        client?.send({ command: 'resolveInEditor', revisionId, path }),
      resolveFileInEditor: (revisionId: string, path: string, content: string) =>
        client?.send({
          command: 'resolvedInEditor',
          revisionId,
          path,
          content,
        }),
      finishResolution: (revisionId: string) => client?.send({ command: 'finishResolution', revisionId }),
      abandonResolution: (revisionId: string) => client?.send({ command: 'abandonResolution', revisionId }),
      askChatToResolve: (revisionId: string) => client?.send({ command: 'askChatToResolve', revisionId }),
      connectRemote: async (
        kind,
        url?: string,
        options?: Readonly<{
          authorization?: string;
          provider?: 'github';
          repositoryId?: string;
          connectionId?: string;
          generation?: number;
          fetchOnly?: boolean;
        }>,
      ) => {
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
            ? options?.authorization === undefined
              ? {
                  unavailable: 'Select this repository from a connected GitHub account.',
                }
              : {
                  authorization: options.authorization,
                  repositoryUrl: resolved,
                }
            : {};
        /* One frame on *every* connect, including *No remote* and Tau Cloud: the
         * frame is how a credential minted for the last remote stops being
         * offered to the next one (review R1). A non-GitHub host gets an origin
         * and no credential, which is an anonymous read. */
        client?.remoteCredential({
          apiBaseUrl,
          ...(origin === undefined ? {} : { origin }),
          ...minted,
        });
        client?.send({
          command: 'connectRemote',
          kind,
          ...(resolved === undefined ? {} : { url: resolved }),
          ...(options?.provider === undefined ? {} : { provider: options.provider }),
          ...(options?.repositoryId === undefined ? {} : { repositoryId: options.repositoryId }),
          ...(options?.fetchOnly === true ? { fetchOnly: true } : {}),
        });
        if (
          options?.provider === 'github' &&
          resolved !== undefined &&
          options.repositoryId !== undefined &&
          options.connectionId !== undefined &&
          options.generation !== undefined
        ) {
          const repositoryId = Number(options.repositoryId);
          if (Number.isSafeInteger(repositoryId) && repositoryId > 0) {
            githubProjectBinding.set(projectId, {
              connectionId: options.connectionId,
              repositoryId,
              repositoryUrl: resolved,
              generation: options.generation,
            });
          }
        } else {
          githubProjectBinding.remove(projectId);
        }
      },
      disconnectRemote: () => {
        /* The credential goes with the remote it was minted for (review R1). */
        client?.remoteCredential({
          apiBaseUrl: requireClientEnvironmentUrl('TAU_API_URL'),
        });
        client?.send({ command: 'disconnectRemote' });
        githubProjectBinding.remove(projectId);
      },
      cancelRemote: () => client?.send({ command: 'cancelRemote' }),
      syncNow: () => client?.send({ command: 'syncNow' }),
      saveRevision: async (trigger?: 'save' | 'hidden' | 'close') => client?.saveRevision(trigger),
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
