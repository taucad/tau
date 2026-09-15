import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ProviderCapabilities, RootedFileSystem } from '@taucad/filesystem';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
import { generatePrefixedId, randomUuid } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type {
  FileSystemBridgeConnection,
  FileSystemBridgeProxy,
  FileSystemBridgeRuntimeService,
} from '@taucad/fs-bridge';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { FileSystemClientFacade } from '#hooks/use-file-manager.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import type { RevisionClient } from '#hooks/use-revision-status.js';
import type { WorkerRevisionEvent } from '#machines/file-manager.worker.revisions.js';
import {
  getHostFinalizedTurns,
  recordHostTurnSettlement,
  persistBrowserTurnSettlement,
  subscribeHostTurnSettlements,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { HostTurnSettlement } from '#chat-clients/_internal/browser-agent-host-transport.js';

/**
 * One chat's turn, as the page holds it while the turn runs.
 *
 * There is no materialized workspace any more and no claim file: the turn is
 * placed on the project's live checkout by the worker's revision root, which
 * holds its lease at `.tau/runs/<runId>.json` and records the revision itself
 * (north star D7/I18 — placement is non-branching by default). What survives
 * here is the per-document bookkeeping the chat client and the settlement
 * effect read: which chat is mid-turn, which run it is, and the two filesystem
 * handles the browser agent host is given.
 *
 * @public
 */
export type PreparedChatWorkspace = Readonly<{
  chatId: string;
  projectId: string;
  /** `workspaceId` is the checkout the turn was placed on (A38). */
  execution: ChatExecutionTarget & { readonly workspaceId: string };
  openFileSystemBridge: () => FileSystemBridgeConnection;
  runtimeFileSystem: RuntimeFileSystem;
  admitted: boolean;
  reclaimed: boolean;
  cancelled: boolean;
  /** The one run id shared by the revision lease and host request. */
  runId?: string;
  turnId?: string;
}>;

type ChatWorkspaceAuthorityContextValue = Readonly<{
  /**
   * Place this chat's next turn on its checkout.
   *
   * One `admitTurn` into the worker's revision root, which resolves the
   * chat's checkout, mints its base if the tree is dirty and takes the turn's
   * lease before this resolves — a turn that cannot be placed is refused rather
   * than run unrecorded (I-EDIT).
   */
  prepare: (chatId: string, options?: { readonly turnId?: string }) => Promise<PreparedChatWorkspace>;
  /**
   * Say this chat exists to resolve one conflicted revision (S33, AC14).
   *
   * *Ask chat to resolve* seeds a chat and the turn it starts has to land on
   * the conflicted branch's own checkout and name the revision whose three
   * terms the agent reads back from the graph. Both are facts about placement,
   * so they ride the execution target rather than the prompt.
   */
  bindConflict: (
    chatId: string,
    conflict: Readonly<{ revisionId: string; paths: readonly string[]; checkoutId: string | undefined }>,
  ) => void;
  reclaim: (chatId: string) => Promise<PreparedChatWorkspace | undefined>;
  reclaimAll: () => Promise<readonly PreparedChatWorkspace[]>;
  markAdmitted: (chatId: string, turnId?: string) => Promise<void>;
  markCancelled: (chatId: string) => Promise<void>;
  markRunId: (chatId: string, runId: string) => Promise<void>;
  get: (chatId: string) => PreparedChatWorkspace | undefined;
  /**
   * Tell the root the turn is over; it settles and records the revision.
   *
   * Nothing is returned: the revision is the host's fact, and it reaches every
   * reader as one `turn.finalized` — emitted by the worker root here, written
   * into the chat's durable log on a Node host, in one schema (S9).
   */
  finalize: (chatId: string) => Promise<void>;
  discard: (chatId: string) => Promise<void>;
  /** Let go of a turn whose run the host can no longer substantiate. */
  retireClaim: (chatId: string) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  /** Point the workbench at the checkout this chat's turns land on (D10). */
  followChat: (chatId: string) => void;
}>;

const ChatWorkspaceAuthorityContext = createContext<ChatWorkspaceAuthorityContextValue | undefined>(undefined);

/** What one project's rooted view needs from the file-manager machine. @public */
export type WorkspaceFileSystemBinding = {
  client: FileSystemClientFacade;
  rootDirectory: string;
  backend: string;
  providerIdentity?: unknown;
  capabilities?: ProviderCapabilities;
  /**
   * The project's own rooted bridge connection, opened once and memoized.
   *
   * This is the whole of the direct-mode event plane (A11, blueprint S15): a
   * rooted port carries its own origin, so a write through it reaches the UI's
   * port as an ordinary change event instead of being suppressed as the UI's
   * own.
   */
  connection?: Promise<FileSystemBridgeProxy>;
  openConnection?: () => Promise<FileSystemBridgeProxy>;
};

/** Read the selected provider's capabilities from its rooted bridge hello. */
export const readRootedBridgeCapabilities = async (
  openConnection: () => FileSystemBridgeConnection,
): Promise<ProviderCapabilities> => {
  const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const proxy = createFileSystemBridgeProxy(openConnection());
  try {
    await proxy.ready;
    const hello = proxy.hello.payload;
    if (hello.state !== 'ready') {
      throw new Error(`Rooted filesystem bridge is ${hello.state}`);
    }
    return hello.capabilities;
  } finally {
    proxy.dispose();
  }
};

type FileManagerContext = ReturnType<FileManagerRef['getSnapshot']>['context'];
type RootedBridgeReadyContext = FileManagerContext & {
  readonly openFileSystemBridge: NonNullable<FileManagerContext['openFileSystemBridge']>;
};

const hasRootedBridgeOpener = (context: FileManagerContext): context is RootedBridgeReadyContext =>
  context.openFileSystemBridge !== undefined;

/** Wait for the file-manager machine to mint the rooted bridge opener. */
export const waitForRootedBridgeOpener = async (fileManagerRef: FileManagerRef): Promise<RootedBridgeReadyContext> => {
  const current = fileManagerRef.getSnapshot().context;
  if (hasRootedBridgeOpener(current)) {
    return current;
  }
  return new Promise((resolve) => {
    const finish = (context: FileManagerContext): void => {
      if (!hasRootedBridgeOpener(context)) {
        return;
      }
      resolve(context);
      queueMicrotask(() => {
        subscription.unsubscribe();
      });
    };
    const subscription = fileManagerRef.subscribe((state) => {
      finish(state.context);
    });
    finish(fileManagerRef.getSnapshot().context);
  });
};

/** Close a connection this binding will not use again; a failed one has no port. */
const disposeConnection = (connection: Promise<FileSystemBridgeProxy> | undefined): void => {
  if (connection === undefined) {
    return;
  }
  // async-iife: bootstrap -- the caller is rebinding and has nothing to await.
  void (async () => {
    try {
      const proxy = await connection;
      proxy.dispose();
    } catch {
      /* The connection never opened; there is no port to close. */
    }
  })();
};

/** Open the project's rooted connection once, and keep it for the life of the binding. */
const connectRootedBridge = async (binding: WorkspaceFileSystemBinding): Promise<FileSystemBridgeProxy> => {
  if (binding.openConnection === undefined) {
    throw new Error('Rooted filesystem bridge is unavailable.');
  }
  const request = binding.connection ?? binding.openConnection();
  binding.connection = request;
  try {
    const proxy = await request;
    const hello = proxy.hello.payload;
    if (hello.state !== 'ready') {
      throw new Error(`Rooted filesystem bridge is ${hello.state}`);
    }
    binding.capabilities = hello.capabilities;
    return proxy;
  } catch (error) {
    if (binding.connection === request) {
      binding.connection = undefined;
      disposeConnection(request);
    }
    throw error;
  }
};

const ensureProviderCapabilities = async (binding: WorkspaceFileSystemBinding): Promise<void> => {
  if (binding.capabilities !== undefined) {
    return;
  }
  await connectRootedBridge(binding);
};

/**
 * The project's working copy, over its own rooted bridge connection.
 *
 * Every path is already the checkout's: the port is rooted at the project, so
 * there is no root to join on and no namespace to translate. `appendFile`,
 * `rename` and `watch` are the authority's own, which is why the emulation
 * this replaced could delete a change event it had no way to emit.
 */
export const createRootedBridgeFileSystem = (binding: WorkspaceFileSystemBinding): RootedFileSystem => {
  const connect = async (): Promise<FileSystemBridgeProxy> => connectRootedBridge(binding);
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const proxy = await connect();
    return encoding === 'utf8' ? proxy.readFile(path, 'utf8') : proxy.readFile(path);
  }
  return {
    id: 'chat-workspace-root:browser-authority',
    get capabilities(): ProviderCapabilities {
      if (binding.capabilities === undefined) {
        throw new Error('Rooted filesystem provider capabilities have not loaded.');
      }
      return binding.capabilities;
    },
    readFile,
    writeFile: async (path, data) => {
      const proxy = await connect();
      return proxy.writeFile(path, data);
    },
    appendFile: async (path, data) => {
      const proxy = await connect();
      return proxy.appendFile(path, data);
    },
    readdir: async (path) => {
      const proxy = await connect();
      return proxy.readdir(path);
    },
    stat: async (path) => {
      const proxy = await connect();
      return proxy.stat(path);
    },
    lstat: async (path) => {
      const proxy = await connect();
      return proxy.lstat(path);
    },
    mkdir: async (path, options) => {
      const proxy = await connect();
      return proxy.mkdir(path, options);
    },
    unlink: async (path) => {
      const proxy = await connect();
      await proxy.unlink(path);
    },
    rmdir: async (path) => {
      const proxy = await connect();
      return proxy.rmdir(path);
    },
    rename: async (from, to) => {
      const proxy = await connect();
      return proxy.rename(from, to);
    },
    exists: async (path) => {
      const proxy = await connect();
      return proxy.exists(path);
    },
    dispose: () => undefined,
    watch: (request, handler) => {
      const subscription: { stop?: () => void; cancelled: boolean } = { cancelled: false };
      // async-iife: bootstrap -- `watch` answers synchronously with its own
      // unsubscribe; the connection it needs resolves after that answer.
      void (async () => {
        const proxy = await connect();
        const stop = proxy.watch(request, handler);
        if (subscription.cancelled) {
          stop();
          return;
        }
        subscription.stop = stop;
      })();
      return () => {
        subscription.cancelled = true;
        subscription.stop?.();
      };
    },
  };
};

/** Bridge one already-confined filesystem without reconstructing an authority-global path. */
export const createPreparedWorkspaceFileSystems = async (
  filesystem: RootedFileSystem,
): Promise<Pick<PreparedChatWorkspace, 'openFileSystemBridge' | 'runtimeFileSystem'>> => {
  const { createFileSystemBridgePort } = await import('@taucad/fs-bridge');
  const { watch: _watch, ...handlers } = filesystem;
  const openFileSystemBridge = (): FileSystemBridgeConnection =>
    createFileSystemBridgePort(handlers satisfies FileSystemBridgeRuntimeService);
  return {
    openFileSystemBridge,
    runtimeFileSystem: fromFileSystemBridge(openFileSystemBridge),
  };
};

const createOpaqueId = (prefix: string): string => `${prefix}_${randomUuid()}`;

const getHostId = (): string => {
  if (!Reflect.has(globalThis, 'sessionStorage')) {
    return createOpaqueId('host');
  }
  const storageKey = 'tau.chat.execution-host-id';
  const stored = globalThis.sessionStorage.getItem(storageKey);
  if (stored) {
    return stored;
  }
  const hostId = createOpaqueId('host');
  globalThis.sessionStorage.setItem(storageKey, hostId);
  return hostId;
};

/** Per-turn bookkeeping this document holds while a browser turn runs. */
type TurnRecord = {
  readonly prepared: PreparedChatWorkspace;
  /** The turn id the root's lease is keyed by; `turnCompleted` names this one. */
  readonly leaseTurnId: string;
};

type BrowserWorkspaceAuthorityState = {
  readonly projectId: string;
  readonly binding: WorkspaceFileSystemBinding;
  readonly rootedFileSystem: RootedFileSystem;
  readonly turns: Map<string, TurnRecord>;
  /**
   * The lease turn id of a chat whose admission is still in flight.
   *
   * A run can finish before its own `admitTurn` resolves. The record that
   * `drop` reads is written when the placement lands, so without this the
   * completion has nothing to name and is lost — the lease is never retired and
   * the turn waits out the root's cut bound (W3c §7.2).
   */
  readonly placing: Map<string, string>;
  readonly pending: Map<string, Promise<PreparedChatWorkspace>>;
  /** Chats seeded by *Ask chat to resolve*, by chat id (S33). */
  readonly conflicts: Map<
    string,
    Readonly<{ revisionId: string; paths: readonly string[]; checkoutId: string | undefined }>
  >;
  readonly listeners: Set<() => void>;
  readonly hostId: string;
};

const browserWorkspaceAuthorities = new Map<string, BrowserWorkspaceAuthorityState>();

const getBrowserWorkspaceAuthority = (input: {
  readonly projectId: string;
  readonly binding: WorkspaceFileSystemBinding;
}): BrowserWorkspaceAuthorityState => {
  const existing = browserWorkspaceAuthorities.get(input.projectId);
  if (existing) {
    const providerChanged =
      existing.binding.backend !== input.binding.backend ||
      existing.binding.providerIdentity !== input.binding.providerIdentity ||
      existing.binding.rootDirectory !== input.binding.rootDirectory;
    existing.binding.client = input.binding.client;
    existing.binding.rootDirectory = input.binding.rootDirectory;
    existing.binding.backend = input.binding.backend;
    existing.binding.providerIdentity = input.binding.providerIdentity;
    existing.binding.openConnection = input.binding.openConnection;
    if (providerChanged) {
      existing.binding.capabilities = input.binding.capabilities;
      disposeConnection(existing.binding.connection);
      existing.binding.connection = undefined;
    }
    return existing;
  }
  const created: BrowserWorkspaceAuthorityState = {
    projectId: input.projectId,
    binding: input.binding,
    rootedFileSystem: createRootedBridgeFileSystem(input.binding),
    turns: new Map(),
    placing: new Map(),
    pending: new Map(),
    conflicts: new Map(),
    listeners: new Set(),
    hostId: getHostId(),
  };
  browserWorkspaceAuthorities.set(input.projectId, created);
  return created;
};

/** Test-only access to the module singleton; not exported from an app barrel. @internal */
export const browserWorkspaceAuthorityTestApi = {
  get: getBrowserWorkspaceAuthority,
  reset: (): void => {
    browserWorkspaceAuthorities.clear();
  },
};

/** Places this project's browser turns on the worker's revision root. */
export function ChatWorkspaceAuthorityProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { projectId } = useProject();
  const fileManager = useFileManager();
  const { invalidateProjectedChats } = useProjectManager();
  const chatSessions = useChatSessionStore();
  const { rootDirectory, proxy: providerIdentity } = fileManager.fileManagerRef.getSnapshot().context;
  const state = getBrowserWorkspaceAuthority({
    projectId,
    binding: {
      client: fileManager.client,
      rootDirectory,
      backend: fileManager.backendType,
      providerIdentity,
      openConnection: async () => {
        await fileManager.workspace.syncProjectRoots();
        const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
        const { openFileSystemBridge } = await waitForRootedBridgeOpener(fileManager.fileManagerRef);
        const proxy = createFileSystemBridgeProxy(openFileSystemBridge(rootDirectory));
        await proxy.ready;
        return proxy;
      },
    },
  });
  /* This is a passive consumer of the retained project session's connection;
   * `ProjectSessionBinding` owns its lifecycle once for the whole subtree. */
  const revisions: RevisionClient | undefined = useRevisionClient();
  /* One store for both transports: a turn this document placed settles in the
   * worker and arrives here, and a turn a remote host placed arrives as a
   * `turn.finalized` record in the chat's own durable log. Same schema (S9). */
  useEffect(() => {
    const handleRevisionEvent = async (event: WorkerRevisionEvent): Promise<void> => {
      if (event.type === 'chats.projected') {
        invalidateProjectedChats(event.projectId, event.chatIds);
        await Promise.all(event.chatIds.map(async (chatId) => chatSessions.refreshFromStorage(chatId)));
        return;
      }
      let persisted = false;
      try {
        persisted = await persistBrowserTurnSettlement(event);
      } catch (error) {
        console.error('[browserAgentHost] turn settlement was not persisted', error);
      }
      recordHostTurnSettlement(event);
      if (persisted) {
        revisions?.send({ command: 'recordsChanged' });
      }
    };
    return revisions?.subscribeEvents((event) => {
      void handleRevisionEvent(event);
    });
  }, [chatSessions, invalidateProjectedChats, revisions]);
  /* A daemon-hosted turn updates Git outside this worker. Adopt its attested
   * head into the retained projection so the next native or ACP turn starts
   * from the same checkout without requiring a page reload. */
  useEffect(() => {
    const adopted = new Set<string>();
    const adopt = (event: HostTurnSettlement): void => {
      if (
        revisions === undefined ||
        event.type !== 'turn.finalized' ||
        event.projectId !== projectId ||
        event.checkoutId === undefined ||
        event.revisionId === undefined ||
        event.treeId === undefined ||
        revisions.status()?.headRevisionId === event.revisionId
      ) {
        return;
      }
      if (adopted.has(event.revisionId)) {
        return;
      }
      adopted.add(event.revisionId);
      revisions.send({
        command: 'adoptHostFinalized',
        checkoutId: event.checkoutId,
        revisionId: event.revisionId,
        treeId: event.treeId,
        ...(event.branch === undefined ? {} : { branch: event.branch }),
      });
    };
    const unsubscribe = subscribeHostTurnSettlements(adopt);
    for (const event of getHostFinalizedTurns()) {
      adopt(event);
    }
    return unsubscribe;
  }, [projectId, revisions]);
  const notify = useCallback(() => {
    for (const listener of state.listeners) {
      listener();
    }
  }, [state]);

  const drop = useCallback(
    (chatId: string, command: 'turnCompleted' | 'turnAbandoned'): void => {
      const leaseTurnId = state.turns.get(chatId)?.leaseTurnId ?? state.placing.get(chatId);
      if (leaseTurnId === undefined) {
        return;
      }
      state.turns.delete(chatId);
      state.placing.delete(chatId);
      revisions?.send({ command, turnId: leaseTurnId });
      notify();
    },
    [notify, revisions, state],
  );

  const prepare = useCallback(
    async (chatId: string, options?: { readonly turnId?: string }): Promise<PreparedChatWorkspace> => {
      const current = state.turns.get(chatId);
      if (current) {
        return current.prepared;
      }
      const inFlight = state.pending.get(chatId);
      if (inFlight) {
        return inFlight;
      }
      const operation = (async (): Promise<PreparedChatWorkspace> => {
        if (revisions === undefined) {
          throw new Error('This project has no revision root; the file manager is not connected.');
        }
        await ensureProviderCapabilities(state.binding);
        /* The lease key is also the host request id. Mint it before admission
         * so the revision settlement and chat lifecycle can only name the same
         * run. */
        const runId = generatePrefixedId(idPrefix.run);
        const leaseTurnId = options?.turnId ?? runId;
        state.placing.set(chatId, leaseTurnId);
        const conflict = state.conflicts.get(chatId);
        const placement = await revisions.admitTurn({
          turnId: leaseTurnId,
          chatId,
          runId,
          ...(conflict?.checkoutId === undefined ? {} : { checkoutId: conflict.checkoutId }),
        });
        const preparedFileSystems = await createPreparedWorkspaceFileSystems(state.rootedFileSystem);
        const prepared: PreparedChatWorkspace = Object.freeze({
          chatId,
          projectId,
          runId,
          execution: Object.freeze({
            hostId: state.hostId,
            workspaceId: placement.checkoutId,
            ...(placement.baseRevisionId === '' ? {} : { baseRevisionId: placement.baseRevisionId }),
            ...(conflict === undefined
              ? {}
              : { conflict: { revisionId: conflict.revisionId, paths: [...conflict.paths] } }),
          }),
          ...preparedFileSystems,
          admitted: false,
          reclaimed: false,
          cancelled: false,
        });
        /* The completion may already have arrived and dropped the placement; a
         * turn nobody is waiting for any more is not re-recorded here. */
        if (!state.placing.has(chatId)) {
          return prepared;
        }
        state.placing.delete(chatId);
        state.turns.set(chatId, { prepared, leaseTurnId });
        notify();
        return prepared;
      })();
      state.pending.set(chatId, operation);
      try {
        return await operation;
      } finally {
        state.pending.delete(chatId);
      }
    },
    [notify, projectId, revisions, state],
  );

  const update = useCallback(
    (
      chatId: string,
      changes: {
        readonly admitted?: boolean;
        readonly cancelled?: boolean;
        readonly runId?: string;
        readonly turnId?: string;
      },
    ): void => {
      const record = state.turns.get(chatId);
      if (record === undefined) {
        return;
      }
      const { prepared } = record;
      /* A no-op update must stay a no-op: `notify()` publishes by identity, and
       * the RPC binding's `onLease` calls `markRunId` on every join. */
      if (
        (changes.admitted ?? prepared.admitted) === prepared.admitted &&
        (changes.cancelled ?? prepared.cancelled) === prepared.cancelled &&
        (changes.runId ?? prepared.runId) === prepared.runId &&
        (changes.turnId ?? prepared.turnId) === prepared.turnId
      ) {
        return;
      }
      state.turns.set(chatId, {
        ...record,
        prepared: Object.freeze({
          ...prepared,
          admitted: changes.admitted ?? prepared.admitted,
          cancelled: changes.cancelled ?? prepared.cancelled,
          ...(changes.runId === undefined ? {} : { runId: changes.runId }),
          ...(changes.turnId === undefined ? {} : { turnId: changes.turnId }),
        }),
      });
      notify();
    },
    [notify, state],
  );

  const value = useMemo<ChatWorkspaceAuthorityContextValue>(
    () => ({
      prepare,
      bindConflict: (chatId, conflict) => {
        state.conflicts.set(chatId, conflict);
      },
      reclaim: async (chatId) => state.turns.get(chatId)?.prepared,
      /* Nothing durable to reclaim: a turn this document did not place holds a
       * lease in `.tau/runs`, and the root's own `sweepLeases` retires it on
       * open against the authority epoch (F13). */
      reclaimAll: async () => [...state.turns.values()].map((record) => record.prepared),
      markAdmitted: async (chatId, turnId) => {
        update(chatId, { admitted: true, cancelled: false, ...(turnId === undefined ? {} : { turnId }) });
      },
      markCancelled: async (chatId) => {
        update(chatId, { cancelled: true });
      },
      markRunId: async (chatId, runId) => {
        update(chatId, { runId, admitted: true });
      },
      get: (chatId) => state.turns.get(chatId)?.prepared,
      finalize: async (chatId) => {
        drop(chatId, 'turnCompleted');
      },
      discard: async (chatId) => {
        drop(chatId, 'turnAbandoned');
      },
      retireClaim: async (chatId) => {
        drop(chatId, 'turnAbandoned');
      },
      subscribe: (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      followChat: (chatId) => revisions?.send({ command: 'followChat', chatId }),
    }),
    [drop, prepare, revisions, state, update],
  );
  return <ChatWorkspaceAuthorityContext.Provider value={value}>{children}</ChatWorkspaceAuthorityContext.Provider>;
}

export const useChatWorkspaceAuthority = (): ChatWorkspaceAuthorityContextValue => {
  const authority = useContext(ChatWorkspaceAuthorityContext);
  if (!authority) {
    throw new Error('useChatWorkspaceAuthority must be used within ChatWorkspaceAuthorityProvider');
  }
  return authority;
};

/** Optional accessor for generic chat-client tests and non-project profiles. */
export const useOptionalChatWorkspaceAuthority = (): ChatWorkspaceAuthorityContextValue | undefined =>
  useContext(ChatWorkspaceAuthorityContext);

export const usePreparedChatWorkspace = (chatId: string): PreparedChatWorkspace | undefined => {
  const authority = useChatWorkspaceAuthority();
  const workspace = useSyncExternalStore(
    authority.subscribe,
    () => authority.get(chatId),
    () => undefined,
  );
  useEffect(() => {
    if (!workspace) {
      // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- background reclaim owns unavailable-root failures
      void authority.reclaim(chatId).catch(() => undefined);
    }
  }, [authority, chatId, workspace]);
  return workspace;
};
