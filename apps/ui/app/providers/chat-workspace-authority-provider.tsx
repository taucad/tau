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
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
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
  prepare: (
    chatId: string,
    options?: {
      readonly turnId?: string;
      /**
       * The run this lease belongs to, when the host already holds it.
       *
       * A continuation is a second attempt at the run the host is still
       * carrying (I1), so its lease must be keyed by that run and not by a
       * fresh one — `drop` refuses a release that does not name the claim's
       * current run, and a claim minted under a new id could never be retired
       * by the settlement of the run it actually fenced.
       */
      readonly runId?: string;
    },
  ) => Promise<PreparedChatWorkspace>;
  /**
   * This chat's workspace for an attach that drives nothing: no lease, no run.
   *
   * Open-time discovery (I7) has to build a host client before it knows what
   * the log holds, and building it through {@link prepare} made every chat
   * open `admitTurn` a run id the host had never admitted — the abandoned
   * run's settlement then named *that* id and the durable log refused it
   * (*"was never admitted in chat …"*), so the recorded `RUN_ABANDONED` never
   * became a `turn.failed`. A claim this chat already holds is reused; nothing
   * is minted, because minting belongs to the admission.
   *
   * `undefined` when no checkout can be named: there is no turn to attach to.
   */
  attachment: (chatId: string) => Promise<PreparedChatWorkspace | undefined>;
  /**
   * Say where this chat's next turn works.
   *
   * `target` is a checkout id, or the settling answer of the verb that makes
   * one (*New branch*). A {@link prepare} that arrives while it settles waits
   * for it — the person chose the branch before they pressed send, and the turn
   * goes where they chose or is refused with the reason the branch was. The
   * authority is the only writer of `Chat.checkoutId`, and it remembers the
   * root a settling verb answered with so an attach made before the registry
   * publishes that checkout still finds its files.
   *
   * Resolves once the placement has settled either way. A refused branch is
   * already the toast channel's to report and `prepare`'s to refuse; a caller
   * has nothing left to say about it, so it is not asked to catch anything.
   */
  placeChat: (
    chatId: string,
    target: string | Promise<Readonly<{ checkoutId: string; checkoutRoot?: string }>>,
  ) => Promise<void>;
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
    conflict: Readonly<{
      revisionId: string;
      paths: readonly string[];
      checkoutId: string | undefined;
    }>,
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
  finalize: (chatId: string, runId: string | undefined) => Promise<void>;
  discard: (chatId: string, runId: string | undefined) => Promise<void>;
  /** Let go of a turn whose run the host can no longer substantiate. */
  retireClaim: (chatId: string, runId: string | undefined) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  /** Point the workbench at the checkout this chat's turns land on (D10). */
  followChat: (chatId: string) => void;
  /**
   * Whether this project's revision root is connected, so a turn can be placed.
   *
   * `prepare` throws *"This project has no revision root"* until the file
   * manager's worker exists, and the authority's identity changes the moment it
   * does — so a consumer that only registers once must read this and register
   * again. The open-time reattach did not: it composed before the worker was
   * up, its `createClient` threw inside the resume the AI SDK swallows into
   * `onError`, and the chat's durable log was never attached — so an abandoned
   * run was never recorded and never settled (I4, I7).
   */
  ready: boolean;
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
  /** Opens a connection rooted at `root`, or at `rootDirectory` when none is named. */
  openConnection?: (root?: string) => Promise<FileSystemBridgeProxy>;
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

/**
 * How long a turn waits for the file manager to mint the rooted bridge opener
 * before giving up. Milliseconds.
 */
const rootedBridgeOpenerTimeout = 30_000;

/**
 * Wait for the file-manager machine to mint the rooted bridge opener.
 *
 * Bounded on purpose: the caller memoizes this connection, so an opener that
 * never arrives used to wedge the chat for the life of the page — the first
 * submit hung in `prepare` and every later one was told a turn was still
 * starting. A failure rejects instead, and reaches the chat's error banner.
 */
export const waitForRootedBridgeOpener = async (fileManagerRef: FileManagerRef): Promise<RootedBridgeReadyContext> => {
  const current = fileManagerRef.getSnapshot().context;
  if (hasRootedBridgeOpener(current)) {
    return current;
  }
  return new Promise((resolve, reject) => {
    const release = (): void => {
      globalThis.clearTimeout(openerExpiry);
      queueMicrotask(() => {
        subscription.unsubscribe();
      });
    };
    const openerExpiry = globalThis.setTimeout(() => {
      release();
      reject(new Error('The project filesystem did not finish starting. Reload the page and try again.'));
    }, rootedBridgeOpenerTimeout);
    const finish = (context: FileManagerContext): void => {
      if (hasRootedBridgeOpener(context)) {
        release();
        resolve(context);
        return;
      }
      if (context.error !== undefined) {
        release();
        reject(context.error);
      }
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
  const request = binding.connection ?? binding.openConnection(binding.rootDirectory);
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
    writeFileChecked: async ({ signal, ...input }) => {
      signal?.throwIfAborted();
      const proxy = await connect();
      signal?.throwIfAborted();
      return proxy.writeFileChecked(input);
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
      const subscription: { stop?: () => void; cancelled: boolean } = {
        cancelled: false,
      };
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

/**
 * Where one chat's work happens, as the composer needs it.
 *
 * The admission answers all of it; an attach knows only the first two, because
 * it takes no lease and starts from no revision.
 */
type ChatPlacement = Readonly<{
  checkoutId: string;
  root: string;
  baseRevisionId?: string;
  runId?: string;
  conflict?: Readonly<{ revisionId: string; paths: readonly string[] }>;
}>;

/**
 * The checkout a settling branch verb answers with, and where its files are.
 *
 * The root it answers with is remembered because the projection that names it
 * is published a beat later, and an attach made in between would otherwise find
 * no files at all. A refusal is re-thrown in the page's own words: the verb
 * rejects with the port's diagnostic ("Branch x is unborn; a checkout of it
 * needs an explicit base revision."), and this rejection *is* what the turn's
 * error card renders — so the code crosses and the table chooses the sentence
 * (P4, Rule 1).
 */
const settlePlacement = async (
  target: Promise<Readonly<{ checkoutId: string; checkoutRoot?: string }>>,
  checkoutRoots: Map<string, string>,
): Promise<string> => {
  let created;
  try {
    created = await target;
  } catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    throw Object.assign(new Error(describeRevisionFailure('branch', code).description), { code });
  }
  if (created.checkoutRoot !== undefined && created.checkoutRoot !== '') {
    checkoutRoots.set(created.checkoutId, created.checkoutRoot);
  }
  return created.checkoutId;
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
  /** The turn's own connection when it was placed off the bound root; closed with the claim. */
  readonly binding?: WorkspaceFileSystemBinding;
};

type BrowserWorkspaceAuthorityState = {
  readonly projectId: string;
  readonly binding: WorkspaceFileSystemBinding;
  readonly rootedFileSystem: RootedFileSystem;
  readonly turns: Map<string, TurnRecord>;
  /**
   * The lease of a chat whose admission is still in flight.
   *
   * A run can finish before its own `admitTurn` resolves. The record that
   * `drop` reads is written when the placement lands, so without this the
   * completion has nothing to name and is lost — the lease is never retired and
   * the turn waits out the root's cut bound (W3c §7.2). It carries the run id
   * as well, because a settlement has to name the run it settles even when the
   * claim it belongs to has not landed yet.
   */
  readonly placing: Map<string, { readonly leaseTurnId: string; readonly runId: string }>;
  readonly pending: Map<string, Promise<PreparedChatWorkspace>>;
  /**
   * The checkout each chat is moving to, while that is still settling (P1).
   *
   * *New branch* used to write `Chat.checkoutId` from an effect once the branch
   * row appeared, so a send fired in between leased the project instead. The
   * intent is recorded the moment it is expressed, and an admission that
   * arrives while it settles waits for it rather than racing it.
   */
  readonly placements: Map<string, Promise<string>>;
  /**
   * Where a checkout's files are, as the verb that made it answered (P2).
   *
   * The registry's projection is the authority on this, but it is published
   * after the verb resolves, so a chat attached in that window had no root and
   * no workspace. Consulted only when the projection names no such checkout.
   */
  readonly checkoutRoots: Map<string, string>;
  /** Chats seeded by *Ask chat to resolve*, by chat id (S33). */
  readonly conflicts: Map<
    string,
    Readonly<{
      revisionId: string;
      paths: readonly string[];
      checkoutId: string | undefined;
    }>
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
    placements: new Map(),
    checkoutRoots: new Map(),
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
  const { getChat, patchChat, invalidateProjectedChats } = useProjectManager();
  const chatSessions = useChatSessionStore();
  const { rootDirectory, proxy: providerIdentity } = fileManager.fileManagerRef.getSnapshot().context;
  const state = getBrowserWorkspaceAuthority({
    projectId,
    binding: {
      client: fileManager.client,
      rootDirectory,
      backend: fileManager.backendType,
      providerIdentity,
      openConnection: async (root = rootDirectory) => {
        await fileManager.workspace.syncProjectRoots();
        const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
        const { openFileSystemBridge } = await waitForRootedBridgeOpener(fileManager.fileManagerRef);
        /* Trusted composition: the workspace authority serves the checkout (G6). */
        const proxy = createFileSystemBridgeProxy(openFileSystemBridge(root, 'working-copy'));
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
      let refused = false;
      try {
        persisted = await persistBrowserTurnSettlement(event);
      } catch (error) {
        /* F5: the durable log refused this settlement — the run it names is not
         * one the log holds. It is not a fact, so it never becomes one here:
         * `getHostFinalizedTurns()` is read as "the host already attested this
         * run", and a refusal recorded as an attestation makes the next
         * settlement of that run discard instead of publishing. */
        refused = true;
        console.error('[browserAgentHost] turn settlement was not persisted', error);
      }
      if (!refused) {
        /* `persisted === false` is not a refusal: it is a settlement with no
         * durable writer to hand it to, which the reload reconciliation picks
         * up. The revision it names is real either way. */
        recordHostTurnSettlement(event);
      }
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

  /**
   * Retire the lease of the run this settlement names, and no other.
   *
   * Reading "whichever claim is current" is what let a decision made about one
   * run abandon the *next* turn's lease: a settlement racing a claim rollover
   * released the fresh admission, and the root answered that with a
   * `turn.failed` recorded under a run the host had not admitted yet. A
   * settlement names one run; if that is not the run this chat currently holds,
   * the claim is somebody else's and this release must not take it.
   *
   * It must not answer as though it had, either. Refusing with a `console.warn`
   * told the settlement its lease was retired when it was still held, so no
   * owner ever retried it and every later turn of that chat waited out the
   * admission bound and died on *"still holding a workspace"* (T3-amp). The
   * refusal is thrown, so the turn's settlement fails visibly and its owner can
   * retry; only discovery, which reads the claim and then retires it, tolerates
   * the rollover.
   */
  const drop = useCallback(
    (chatId: string, command: 'turnCompleted' | 'turnAbandoned', runId: string | undefined): void => {
      const current = state.turns.get(chatId) ?? state.placing.get(chatId);
      if (current === undefined) {
        /* Nothing is held: a daemon-placed turn leases nothing here, and a
         * claim already retired cannot be retired twice. */
        return;
      }
      const currentRunId = 'prepared' in current ? current.prepared.runId : current.runId;
      if (currentRunId !== runId) {
        throw Object.assign(
          new Error(
            `${command} for run ${runId ?? '(none)'} does not name chat ${chatId}'s current run ${currentRunId ?? '(none)'}.`,
          ),
          { code: 'CHAT_CLAIM_RUN_MISMATCH' },
        );
      }
      state.turns.delete(chatId);
      state.placing.delete(chatId);
      if ('binding' in current) {
        disposeConnection(current.binding?.connection);
      }
      revisions?.send({ command, turnId: current.leaseTurnId });
      notify();
    },
    [notify, revisions, state],
  );

  /**
   * The one workspace composer: a placement in, the filesystem a host client is
   * handed out (P2).
   *
   * `prepare` and `attachment` built this twice with different chains, and only
   * `prepare` knew the placement's root — so a chat on a branch was attached to
   * the project's files. They are the same object built from the same facts; an
   * attach is a prepare with no lease.
   */
  const composeWorkspace = useCallback(
    async (
      chatId: string,
      placement: ChatPlacement,
    ): Promise<{ readonly prepared: PreparedChatWorkspace; readonly binding?: WorkspaceFileSystemBinding }> => {
      if (placement.root === '') {
        /* A placement with no root is not a placement. `''` is not the
         * project's root either — it is the authority's own origin, every
         * project's files at once — so it is refused here rather than opened. */
        throw Object.assign(new Error('This chat’s files could not be found.'), { code: 'PLACEMENT_UNROOTED' });
      }
      await ensureProviderCapabilities(state.binding);
      /* The bound connection is rooted wherever the workbench stood when it
       * opened, so work placed on a branch was handed the project's files,
       * wrote there, and left the branch's own cut nothing to record. */
      const binding: WorkspaceFileSystemBinding | undefined =
        placement.root === state.binding.rootDirectory
          ? undefined
          : { ...state.binding, rootDirectory: placement.root, connection: undefined };
      const preparedFileSystems = await createPreparedWorkspaceFileSystems(
        binding === undefined ? state.rootedFileSystem : createRootedBridgeFileSystem(binding),
      );
      const prepared: PreparedChatWorkspace = Object.freeze({
        chatId,
        projectId,
        ...(placement.runId === undefined ? {} : { runId: placement.runId }),
        execution: Object.freeze({
          hostId: state.hostId,
          workspaceId: placement.checkoutId,
          ...(placement.baseRevisionId === undefined || placement.baseRevisionId === ''
            ? {}
            : { baseRevisionId: placement.baseRevisionId }),
          ...(placement.conflict === undefined
            ? {}
            : {
                conflict: {
                  revisionId: placement.conflict.revisionId,
                  paths: [...placement.conflict.paths],
                },
              }),
        }),
        ...preparedFileSystems,
        admitted: false,
        reclaimed: false,
        cancelled: false,
      });
      return binding === undefined ? { prepared } : { prepared, binding };
    },
    [projectId, state],
  );

  const placeChat = useCallback(
    async (
      chatId: string,
      target: string | Promise<Readonly<{ checkoutId: string; checkoutRoot?: string }>>,
    ): Promise<void> => {
      const settling =
        typeof target === 'string' ? Promise.resolve(target) : settlePlacement(target, state.checkoutRoots);
      /* Recorded before it settles: an admission racing it has to wait for it
       * rather than lease the checkout the record still names (Q2). */
      state.placements.set(chatId, settling);
      try {
        /* The verb's refusal has two owners already (the toast channel and the
         * next `prepare`); only a record write that fails is this call's own. */
        const checkoutId = await settling.catch(() => undefined);
        /* A later `placeChat` for this chat has replaced this one: the person
         * moved on while it settled, and writing now would put the record back
         * on the branch they moved away from. */
        if (checkoutId !== undefined && state.placements.get(chatId) === settling) {
          await patchChat(chatId, 'checkoutId', checkoutId);
        }
      } finally {
        /* Only this placement's own entry: a later `placeChat` for the same
         * chat has replaced it, and that one is the current intent. */
        if (state.placements.get(chatId) === settling) {
          state.placements.delete(chatId);
        }
      }
    },
    [patchChat, state],
  );

  const prepare = useCallback(
    async (
      chatId: string,
      options?: { readonly turnId?: string; readonly runId?: string },
    ): Promise<PreparedChatWorkspace> => {
      const current = state.turns.get(chatId);
      if (current) {
        /* The claim this chat holds *is* the turn's, so reusing it is right —
         * unless the caller named a run and this claim is not it. Handing back
         * a claim keyed by a different run would fence the continuation's
         * writes under the wrong id, and its settlement would then name a run
         * `drop` is not holding. Refused rather than mis-keyed: the admission
         * routes this to the chat's banner. */
        if (options?.runId !== undefined && current.prepared.runId !== options.runId) {
          throw Object.assign(
            new Error(
              `Chat ${chatId} is still holding a workspace for run ${current.prepared.runId ?? '(none)'}, so run ${options.runId} cannot continue over it.`,
            ),
            { code: 'CHAT_CLAIM_RUN_MISMATCH' },
          );
        }
        return current.prepared;
      }
      const inFlight = state.pending.get(chatId);
      if (inFlight) {
        return inFlight;
      }
      /* Read before the first await: a placement settles — or is refused —
       * while this admission is still starting, and the entry is gone by the
       * time an awaited read would reach it. It is still this turn's. */
      const settlingPlacement = state.placements.get(chatId);
      const operation = (async (): Promise<PreparedChatWorkspace> => {
        if (revisions === undefined) {
          throw new Error('This project has no revision root; the file manager is not connected.');
        }
        await ensureProviderCapabilities(state.binding);
        /* The lease key is also the host request id. Mint it before admission
         * so the revision settlement and chat lifecycle can only name the same
         * run — unless the caller is continuing a run the host already holds,
         * whose id this lease has to carry instead. */
        const runId = options?.runId ?? generatePrefixedId(idPrefix.run);
        const leaseTurnId = options?.turnId ?? runId;
        state.placing.set(chatId, { leaseTurnId, runId });
        const conflict = state.conflicts.get(chatId);
        /* P1: a placement still settling *is* this chat's checkout — the person
         * chose the branch before they pressed send, so the admission waits for
         * it, and its refusal is the turn's refusal (E2). The resolved id is
         * read from here rather than from the record: `placeChat`'s own write
         * has not landed by the time this resumes. */
        const placed = await settlingPlacement;
        /* Read at call time through the manager's own accessor. Deriving it
         * from the `useChats` query's `data` made `prepare` — and the whole
         * context value — a new identity on every chats refetch, and every
         * message persist invalidates that query: effects documented as
         * mount-only re-ran mid-dispatch. */
        const chat = await getChat(chatId);
        const checkoutId = placed ?? conflict?.checkoutId ?? chat?.checkoutId;
        const placement = await revisions.admitTurn({
          turnId: leaseTurnId,
          chatId,
          runId,
          ...(checkoutId === undefined ? {} : { checkoutId }),
        });
        const { prepared, binding } = await composeWorkspace(chatId, {
          checkoutId: placement.checkoutId,
          root: placement.root,
          baseRevisionId: placement.baseRevisionId,
          runId,
          ...(conflict === undefined ? {} : { conflict }),
        });
        /* The completion may already have arrived and dropped the placement; a
         * turn nobody is waiting for any more is not re-recorded here. */
        if (!state.placing.has(chatId)) {
          return prepared;
        }
        state.placing.delete(chatId);
        state.turns.set(chatId, {
          prepared,
          leaseTurnId,
          ...(binding === undefined ? {} : { binding }),
        });
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
    [composeWorkspace, getChat, notify, revisions, state],
  );

  const attachment = useCallback(
    async (chatId: string): Promise<PreparedChatWorkspace | undefined> => {
      const current = state.turns.get(chatId);
      if (current) {
        return current.prepared;
      }
      /* Mirrors `prepare`'s own reuse: the claim is recorded only once
       * `admitTurn` answers, so an attach composed while the placement is still
       * in flight would fall through to the chain below and hand the turn's own
       * worker a checkout that is not the turn's. */
      const inFlight = state.pending.get(chatId);
      if (inFlight) {
        return inFlight;
      }
      const placed = await state.placements.get(chatId);
      const chat = await getChat(chatId);
      /* The checkout this chat's turns land on, in the order `prepare` itself
       * resolves it — minus the `admitTurn` that would lease it. The root's own
       * checkout is the last resort: a chat with no turn yet has no checkout of
       * its own, and a project with no checkout at all has no log to attach to. */
      const status = revisions?.status();
      const checkoutId = placed ?? state.conflicts.get(chatId)?.checkoutId ?? chat?.checkoutId ?? status?.checkoutId;
      if (checkoutId === undefined) {
        return undefined;
      }
      /* P2: where that checkout's files are is the registry's own answer —
       * its branch row, or `checkoutRoot` when the checkout is the selected one
       * and no branch names it yet — never the workbench's bound root, which
       * handed every chat the project's tree whatever checkout it named. A
       * checkout the registry no longer names has no files to attach to, which
       * is the same answer as no checkout at all. */
      const root =
        (checkoutId === status?.checkoutId
          ? status.checkoutRoot
          : status?.branches.find((row) => row.checkoutId === checkoutId)?.checkoutRoot) ??
        state.checkoutRoots.get(checkoutId);
      if (root === undefined) {
        return undefined;
      }
      /* The attach's own binding is not kept: it drives nothing and is never
       * dropped, and its connection opens lazily on the first filesystem call,
       * which the open-time client does not make — it reads capabilities from
       * the port's hello and the chat's log over the project-root bridge. A
       * caller that does read a branch's files through an attach needs a close
       * hook; there is none to hang one on today. */
      const { prepared } = await composeWorkspace(chatId, { checkoutId, root });
      return prepared;
    },
    [composeWorkspace, getChat, revisions, state],
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
      attachment,
      placeChat,
      bindConflict: (chatId, conflict) => {
        state.conflicts.set(chatId, conflict);
        if (conflict.checkoutId !== undefined) {
          /* The conflict's terms ride one turn, but its checkout is durable:
           * seeding wrote only the in-memory map, so a reload dropped the chat
           * onto the live checkout. The authority is the one writer of that
           * field, so this goes through `placeChat` — which also makes a
           * `prepare` racing the seed wait for it. */
          // async-iife: bootstrap -- the seed has nothing to await; a record write that fails is reported, not surfaced.
          // oxlint-disable-next-line promise/prefer-await-to-then -- same reason: the settlement belongs to the next `prepare`.
          void placeChat(chatId, conflict.checkoutId).catch((error: unknown) => {
            console.error('[chatWorkspaceAuthority] a seeded chat’s checkout was not recorded', error);
          });
        }
      },
      reclaim: async (chatId) => state.turns.get(chatId)?.prepared,
      /* Nothing durable to reclaim: a turn this document did not place holds a
       * lease in `.tau/runs`, and the root's own `sweepLeases` retires it on
       * open against the authority epoch (F13). */
      reclaimAll: async () => [...state.turns.values()].map((record) => record.prepared),
      markAdmitted: async (chatId, turnId) => {
        update(chatId, {
          admitted: true,
          cancelled: false,
          ...(turnId === undefined ? {} : { turnId }),
        });
      },
      markCancelled: async (chatId) => {
        update(chatId, { cancelled: true });
      },
      markRunId: async (chatId, runId) => {
        update(chatId, { runId, admitted: true });
      },
      get: (chatId) => state.turns.get(chatId)?.prepared,
      finalize: async (chatId, runId) => {
        drop(chatId, 'turnCompleted', runId);
      },
      discard: async (chatId, runId) => {
        drop(chatId, 'turnAbandoned', runId);
      },
      retireClaim: async (chatId, runId) => {
        try {
          drop(chatId, 'turnAbandoned', runId);
        } catch (error) {
          /* Discovery reads `reclaimAll` and then retires, so the claim can
           * roll over in between — and a claim that rolled over is a live turn
           * this retirement must not touch. Nothing is leaked by leaving it:
           * the turn that holds it settles it. */
          console.warn('[chatWorkspaceAuthority] a claim rolled over before discovery could retire it', error);
        }
      },
      subscribe: (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      followChat: (chatId) => revisions?.send({ command: 'followChat', chatId }),
      ready: revisions !== undefined,
    }),
    [attachment, drop, placeChat, prepare, revisions, state, update],
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
