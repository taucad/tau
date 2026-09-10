import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { ImmutableRevisionTree, materializedWorkspaceId, mergeRevisionTrees, revisionId } from '@taucad/filesystem';
import { mainRevisionBranch, revisionBranchName, TurnRevisionRecorder, turnRevisionBranch } from '@taucad/revisions';
import type { BranchHeadUpdateResult, RevisionAuthority, RevisionBranchName } from '@taucad/revisions';
import type {
  MaterializedWorkspace,
  MaterializedWorkspaceAuthority,
  MaterializedWorkspaceMode,
  ProviderCapabilities,
  RevisionId,
  RevisionTreeConflict,
  RootedFileSystem,
} from '@taucad/filesystem';
import type { ChatExecutionTarget, ChatRevisionMode } from '@taucad/chat/schemas';
import { generatePrefixedId, randomUuid } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { joinPath } from '@taucad/utils/path';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type {
  FileSystemBridgeConnection,
  FileSystemBridgeProxy,
  FileSystemBridgeRuntimeService,
} from '@taucad/fs-bridge';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { FileSystemClientFacade } from '#hooks/use-file-manager.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { useProject } from '#hooks/use-project.js';
import { subscribeHostFinalizedRevisions } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type {
  AuthoritativeRevisionFinalization,
  PersistedBranchPublication,
  PersistedNativeGitStatus,
  PersistedRevisionConflict,
} from '#types/revision.types.js';

export type PreparedChatWorkspace = Readonly<{
  chatId: string;
  projectId: string;
  /**
   * A browser claim always names its workspace, so the two fields the wire
   * leaves optional for a host-placed turn are required here.
   */
  execution: ChatExecutionTarget & { readonly workspaceId: string; readonly baseRevisionId: string };
  branch: RevisionBranchName;
  workspace: MaterializedWorkspace;
  openFileSystemBridge: () => FileSystemBridgeConnection;
  runtimeFileSystem: RuntimeFileSystem;
  admitted: boolean;
  reclaimed: boolean;
  cancelled: boolean;
  runId?: string;
  turnId?: string;
}>;

export type FinalizedChatWorkspace = Readonly<
  AuthoritativeRevisionFinalization & {
    projectId: string;
    runId?: string;
  }
>;

export type ConflictedChatWorkspace = Readonly<{
  status: 'conflicted';
  chatId: string;
  projectId: string;
  turnId: string;
  workspaceId: string;
  branchName: string;
  conflict: Extract<PersistedRevisionConflict, { readonly type: 'merge' }>;
}>;

export type ChatWorkspaceFinalizationResult =
  | Readonly<{ status: 'finalized'; finalization: FinalizedChatWorkspace }>
  | ConflictedChatWorkspace;

type ChatWorkspaceFinalizationInput = Readonly<{
  actorId: string;
  runId?: string;
  turnId: string;
  parentTurnId?: string;
  jobIds?: readonly string[];
  summary: string;
}>;

type InFlightChatFinalization = Readonly<{
  fingerprint: string;
  promise: Promise<ChatWorkspaceFinalizationResult | undefined>;
  token: Record<string, never>;
}>;

/** One branch the revision authority holds a head for, whichever agent wrote it (DT1). */
export type RevisionBranchSummary = Readonly<{
  name: string;
  headRevisionId: string;
  /** The head revision's own generated summary — what the branch last did. */
  summary: string;
  /** Who wrote the head: a chat id for a Tau turn, the agent's own actor for an external one. */
  actorId: string;
  source: 'user' | 'agent' | 'merge' | 'restore' | 'import';
  /** Milliseconds since the Unix epoch. */
  createdAt: number;
}>;

/** One path-level difference between two revision trees (DT1 diff). */
export type RevisionPathChange = Readonly<{
  path: string;
  change: 'added' | 'modified' | 'removed';
}>;

/** What one DT1 branch merge did. A conflict is an outcome, never a failure (I-CONF). */
export type BranchMergeResult =
  | Readonly<{
      status: 'merged';
      branchName: string;
      revisionId: string;
      changedPaths: readonly string[];
    }>
  | Readonly<{ status: 'up-to-date'; branchName: string; revisionId: string }>
  | Readonly<{
      status: 'conflicted';
      branchName: string;
      conflict: Extract<PersistedRevisionConflict, { readonly type: 'merge' }>;
    }>;

type ChatWorkspaceAuthorityContextValue = Readonly<{
  /** `mode` defaults to `direct`: the turn writes the live project tree. */
  prepare: (chatId: string, options?: { readonly mode?: ChatRevisionMode }) => Promise<PreparedChatWorkspace>;
  /**
   * The mode this chat's *next* turn is admitted in — the composer's revision
   * selection, which exists before any claim does and outlives each claim.
   *
   * It lives beside the claims rather than on the execution object because it
   * describes the placement, not the model (V18): a Codex turn on a capable
   * host picks it exactly like a Tau turn does.
   */
  revisionMode: (chatId: string) => ChatRevisionMode;
  setRevisionMode: (chatId: string, mode: ChatRevisionMode) => void;
  reclaim: (chatId: string) => Promise<PreparedChatWorkspace | undefined>;
  reclaimAll: () => Promise<readonly PreparedChatWorkspace[]>;
  markAdmitted: (chatId: string, turnId?: string) => Promise<void>;
  markCancelled: (chatId: string) => Promise<void>;
  markRunId: (chatId: string, runId: string) => Promise<void>;
  get: (chatId: string) => PreparedChatWorkspace | undefined;
  finalize: (
    chatId: string,
    input: ChatWorkspaceFinalizationInput,
  ) => Promise<ChatWorkspaceFinalizationResult | undefined>;
  discard: (chatId: string) => Promise<void>;
  /**
   * Release the admission of a claim whose run the durable authority can no
   * longer substantiate, keeping the materialized workspace on disk as
   * inspectable evidence — the same retirement the merge-conflict settlement
   * performs. Without this a dead run's `admitted` claim blocks every later
   * submit for that chat (see `withWorkspace` in `use-cad-chat-client.ts`).
   */
  retireClaim: (chatId: string) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  listFinalized: () => readonly FinalizedChatWorkspace[];
  /**
   * DT1 porcelain over the revision authority: point the live project tree at
   * one stored revision. Switching a branch and restoring a revision are the
   * same operation — a branch is a name for a head — so there is one verb.
   */
  checkout: (revision: string) => Promise<readonly RevisionPathChange[]>;
  /** DT1 porcelain: merge one branch into another; a conflict is a value (I-CONF). */
  mergeBranch: (input: {
    readonly source: string;
    readonly target: string;
    readonly actorId: string;
  }) => Promise<BranchMergeResult>;
  /**
   * DT1 porcelain: remove one branch ref under its expected-old head.
   *
   * The name goes; the revisions it reached stay in the object store and stay
   * reachable by id, which is what makes discarding a branch safe.
   */
  deleteBranch: (branch: string) => Promise<BranchHeadUpdateResult>;
  /** DT1 porcelain: what changed between two stored revisions, by path. */
  diffRevisions: (input: { readonly from?: string | undefined; readonly to: string }) => readonly RevisionPathChange[];
  /**
   * DT1 porcelain: every branch head the revision authority holds.
   *
   * The authority, not the chat projection: a Tau turn, a Codex turn on a host
   * sharing this root and a branch this profile has never seen a transcript for
   * all publish their head into the same store, and this reads that store.
   * Identity-stable for `useSyncExternalStore`.
   */
  listBranches: () => readonly RevisionBranchSummary[];
  /**
   * DT1 porcelain: the branch the live project tree is on — the store's own head
   * reference, in the spirit of Git's HEAD.
   *
   * This, not the graph head, is what "Current" means: a checkout moves it, a
   * merge into it moves the live tree with it, and a candidate that happens to
   * be the newest revision is still just a branch you can switch to (operator
   * decisions 2026-09-09, question 11).
   *
   * Undefined while the live tree holds a revision no branch names — a Restore
   * of an older turn — so the pane paints nothing Current rather than labelling
   * a branch "The live project tree" over an older tree (c2-review S1).
   */
  headBranch: () => string | undefined;
}>;

const ChatWorkspaceAuthorityContext = createContext<ChatWorkspaceAuthorityContextValue | undefined>(undefined);
const workspaceStorageDirectory = '.tau/workspaces';
const workspaceClaimDirectory = `${workspaceStorageDirectory}/claims`;
const workspacePublicationDirectory = `${workspaceStorageDirectory}/publications`;
const workspaceConflictDirectory = `${workspaceStorageDirectory}/conflicts`;
const emptyFinalizedChatWorkspaces: readonly FinalizedChatWorkspace[] = [];
const emptyRevisionBranches: readonly RevisionBranchSummary[] = [];
/** How long a queued live-tree writer waits before it gives up on the holder. Milliseconds. */
const liveTreeWaitTimeout = 300_000;

const nonEmptyStringSchema = z.string().min(1);
const persistedChatWorkspaceClaimSchema = z.strictObject({
  version: z.literal(1),
  chatId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
  baseRevisionId: nonEmptyStringSchema,
  /** Absent means `branch`: claims written before local mode existed keep reclaiming. */
  mode: z.enum(['local', 'branch']).optional(),
  admitted: z.boolean(),
  cancelled: z.boolean(),
  runId: nonEmptyStringSchema.optional(),
  turnId: nonEmptyStringSchema.optional(),
});
type PersistedChatWorkspaceClaim = Readonly<z.infer<typeof persistedChatWorkspaceClaimSchema>>;

const persistedRevisionProvenanceSchema = z.strictObject({
  source: z.enum(['user', 'agent', 'merge', 'restore', 'import']),
  actorId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema.optional(),
  createdAt: z.number(),
});
const persistedBranchPublicationSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('updated'),
    branchName: nonEmptyStringSchema,
    expectedHeadRevisionId: nonEmptyStringSchema,
    previousHeadRevisionId: nonEmptyStringSchema.optional(),
    headRevisionId: nonEmptyStringSchema,
  }),
  z.strictObject({
    status: z.literal('conflicted'),
    branchName: nonEmptyStringSchema,
    expectedHeadRevisionId: nonEmptyStringSchema,
    actualHeadRevisionId: nonEmptyStringSchema.optional(),
    proposedHeadRevisionId: nonEmptyStringSchema,
  }),
]);
const persistedNativeGitStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('not-configured') }),
  z.strictObject({
    status: z.literal('stored'),
    commitId: nonEmptyStringSchema,
    objectFormat: z.enum(['sha1', 'sha256']),
  }),
  z.strictObject({ status: z.literal('failed'), errorCode: nonEmptyStringSchema }),
]);
const finalizedChatWorkspaceSchema = z.strictObject({
  turnId: nonEmptyStringSchema,
  parentTurnId: nonEmptyStringSchema.optional(),
  revisionId: nonEmptyStringSchema,
  baseRevisionId: nonEmptyStringSchema,
  treeId: nonEmptyStringSchema,
  branchName: nonEmptyStringSchema,
  publication: persistedBranchPublicationSchema,
  changedPaths: z.array(z.string()),
  provenance: persistedRevisionProvenanceSchema,
  generatedSummary: z.string(),
  chatId: nonEmptyStringSchema,
  jobIds: z.array(nonEmptyStringSchema),
  projectId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
  nativeGit: persistedNativeGitStatusSchema,
  runId: nonEmptyStringSchema.optional(),
});
const conflictedChatWorkspaceSchema = z.strictObject({
  status: z.literal('conflicted'),
  chatId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  workspaceId: nonEmptyStringSchema,
  branchName: nonEmptyStringSchema,
  conflict: z.strictObject({
    type: z.literal('merge'),
    kind: z.enum(['add-add', 'modify-delete', 'binary', 'text']),
    paths: z.array(z.string()),
  }),
});

type WorkspaceFileSystemBinding = {
  client: FileSystemClientFacade;
  rootDirectory: string;
  backend: string;
  providerIdentity?: unknown;
  capabilities?: ProviderCapabilities;
  capabilitiesRequest?: Promise<ProviderCapabilities>;
  loadCapabilities?: () => Promise<ProviderCapabilities>;
  appendFile?: (path: string, data: Uint8Array<ArrayBuffer> | string) => Promise<void>;
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

const ensureProviderCapabilities = async (binding: WorkspaceFileSystemBinding): Promise<void> => {
  if (binding.capabilities !== undefined) {
    return;
  }
  if (binding.loadCapabilities === undefined) {
    throw new Error('Rooted filesystem provider capabilities are unavailable.');
  }
  const request = binding.capabilitiesRequest ?? binding.loadCapabilities();
  binding.capabilitiesRequest = request;
  try {
    binding.capabilities = await request;
  } catch (error) {
    if (binding.capabilitiesRequest === request) {
      binding.capabilitiesRequest = undefined;
    }
    throw error;
  }
};

const createClientRootedFileSystem = (binding: WorkspaceFileSystemBinding): RootedFileSystem => {
  const resolve = (path: string): string => joinPath(binding.rootDirectory, path);
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8'
      ? binding.client.readFile(resolve(path), 'utf8')
      : binding.client.readFile(resolve(path));
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
    writeFile: async (path, data) => binding.client.writeFile(resolve(path), data),
    appendFile: async (path, data) => {
      const resolved = resolve(path);
      if (binding.appendFile !== undefined) {
        await binding.appendFile(resolved, data);
        return;
      }
      let existing: Uint8Array<ArrayBuffer>;
      try {
        existing = await binding.client.readFile(resolved);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        existing = new Uint8Array();
      }
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
      const combined = new Uint8Array(existing.byteLength + bytes.byteLength);
      combined.set(existing);
      combined.set(bytes, existing.byteLength);
      await binding.client.writeFile(resolved, combined);
    },
    readdir: async (path) => binding.client.readdir(resolve(path)),
    stat: async (path) => binding.client.stat(resolve(path)),
    lstat: async (path) => binding.client.lstat(resolve(path)),
    mkdir: async (path, options) => binding.client.mkdir(resolve(path), options),
    unlink: async (path) => {
      await binding.client.unlink(resolve(path));
    },
    rmdir: async (path) => binding.client.rmdir(resolve(path)),
    rename: async (from, to) => {
      await binding.client.move(resolve(from), resolve(to));
    },
    exists: async (path) => binding.client.exists(resolve(path)),
    dispose: () => undefined,
    watch: () => () => undefined,
  };
};

const createOpaqueId = (prefix: string): string => `${prefix}_${randomUuid()}`;

const finalizationFingerprint = (input: ChatWorkspaceFinalizationInput): string =>
  JSON.stringify({
    actorId: input.actorId,
    runId: input.runId ?? null,
    turnId: input.turnId,
    parentTurnId: input.parentTurnId ?? null,
    jobIds: [...(input.jobIds ?? [])],
    summary: input.summary,
  });

/** Bridge one already-confined materialized filesystem without reconstructing an authority-global path. */
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

const persistedMergeConflict = (
  conflicts: readonly RevisionTreeConflict[],
): Extract<PersistedRevisionConflict, { readonly type: 'merge' }> => ({
  type: 'merge',
  kind: conflicts[0]?.type ?? 'text',
  paths: [...new Set(conflicts.map(({ path }) => path))].sort(),
});

/**
 * Project one branch publication into the durable record the pane reads.
 *
 * `fallbackHead` covers the one shape a *finalization* never produces: a
 * deletion, whose publication names no head at all.
 */
const persistedPublication = (input: {
  readonly publication: BranchHeadUpdateResult;
  readonly expectedHead: RevisionId;
  readonly fallbackHead: RevisionId;
}): PersistedBranchPublication => {
  if (input.publication.status === 'updated') {
    return {
      status: 'updated',
      branchName: input.publication.branch,
      expectedHeadRevisionId: input.expectedHead,
      ...(input.publication.previousHead === undefined
        ? {}
        : { previousHeadRevisionId: input.publication.previousHead }),
      headRevisionId: input.publication.head ?? input.fallbackHead,
    };
  }
  return {
    status: 'conflicted',
    branchName: input.publication.conflict.branch,
    expectedHeadRevisionId: input.expectedHead,
    ...(input.publication.conflict.actualHead === undefined
      ? {}
      : { actualHeadRevisionId: input.publication.conflict.actualHead }),
    proposedHeadRevisionId: input.publication.conflict.proposedHead ?? input.fallbackHead,
  };
};

const claimPathFor = (chatId: string): string => `${workspaceClaimDirectory}/${encodeURIComponent(chatId)}.json`;

/** Whether a claim, as written, makes its chat the project's one live-tree writer (DT2). */
const writesLiveTree = (claim: PersistedChatWorkspaceClaim): boolean =>
  (claim.mode ?? 'branch') === 'local' && claim.admitted && !claim.cancelled;

const claimLockPrefix = (projectId: string): string => `tau:chat-workspace-claim:${encodeURIComponent(projectId)}:`;
const claimLockName = (projectId: string, chatId: string): string =>
  `${claimLockPrefix(projectId)}${encodeURIComponent(chatId)}`;

/** Whether any tab is inside a `prepare`/claim update for this project right now. */
const claimLocksBusy = async (projectId: string): Promise<boolean> => {
  if (!Reflect.has(globalThis, 'navigator') || !Reflect.has(globalThis.navigator, 'locks')) {
    return false;
  }
  const { locks } = globalThis.navigator;
  if (typeof locks.query !== 'function') {
    return false;
  }
  const prefix = claimLockPrefix(projectId);
  const snapshot = await locks.query();
  return [...(snapshot.held ?? []), ...(snapshot.pending ?? [])].some((lock) => lock.name?.startsWith(prefix) === true);
};

/**
 * The one live-tree lock of a project (DT2).
 *
 * Under `claimLockPrefix` on purpose: `preparesInFlight` already stands the
 * orphan sweep down for anything holding a claim lock on this project, and a
 * turn writing the live tree is exactly when that sweep must not run.
 */
const liveTreeLockName = (projectId: string): string => `${claimLockPrefix(projectId)}live-tree`;

/**
 * Take the project live-tree lock and hold it until the returned release runs.
 *
 * Web Locks queue FIFO across tabs, which is the whole of DT2's ordering: the
 * previous polled wait woke every waiter on the same tick and let two of them
 * pass the advisory check before either wrote its admission (2-review S5).
 *
 * @param projectId - The project whose live tree is being claimed.
 * @returns The release for the granted lock.
 */
const acquireLiveTreeLock = async (projectId: string): Promise<() => void> => {
  const release = await requestLiveTreeLock(projectId, { wait: true });
  return release!;
};

/**
 * Take the project live-tree lock without queueing for it.
 *
 * A reclaim runs under the chat's cross-document claim lock, and every release
 * of the live-tree lock runs under that same claim lock in the holding
 * document — so a reclaim that waited would deadlock two tabs for the whole
 * `liveTreeWaitTimeout` (8-review M4). Reclaim inherits a free lock or is
 * simply not the writer in this document; only admission waits.
 *
 * @param projectId - The project whose live tree is being claimed.
 * @returns The release, or `undefined` when another document holds the lock.
 */
const tryAcquireLiveTreeLock = async (projectId: string): Promise<(() => void) | undefined> =>
  requestLiveTreeLock(projectId, { wait: false });

const requestLiveTreeLock = async (
  projectId: string,
  mode: { readonly wait: boolean },
): Promise<(() => void) | undefined> => {
  if (!Reflect.has(globalThis, 'navigator') || !Reflect.has(globalThis.navigator, 'locks')) {
    throw Object.assign(new Error('The browser cannot serialize durable chat workspace claims.'), {
      code: 'WORKSPACE_CLAIM_LOCK_UNAVAILABLE',
    });
  }
  const held = Promise.withResolvers<void>();
  const granted = Promise.withResolvers<(() => void) | undefined>();
  /* An admitted claim whose run died never releases, so the wait is bounded and
   * the rejection reaches the chat error banner — a submit must never vanish
   * into a holder that is gone. */
  const controller = new AbortController();
  const waitExpiry = globalThis.setTimeout(() => {
    controller.abort();
  }, liveTreeWaitTimeout);
  /* async-iife: bootstrap -- the lock is held for as long as the caller keeps
   * it, which is past this function's own return; the settlement it hides is
   * the release, and the grant is reported through `granted`. */
  void (async (): Promise<void> => {
    try {
      const outcome = await globalThis.navigator.locks.request(
        liveTreeLockName(projectId),
        mode.wait ? { mode: 'exclusive', signal: controller.signal } : { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          globalThis.clearTimeout(waitExpiry);
          if (lock === null) {
            return null;
          }
          granted.resolve(() => {
            held.resolve();
          });
          await held.promise;
          return undefined;
        },
      );
      if (outcome === null) {
        globalThis.clearTimeout(waitExpiry);
        granted.resolve(undefined);
      }
    } catch (error) {
      globalThis.clearTimeout(waitExpiry);
      held.resolve();
      granted.reject(
        Object.assign(
          new Error(
            'Another chat is still working in this project folder. Wait for it to finish, or switch this chat to a new branch.',
          ),
          { code: 'WORKSPACE_LOCAL_CLAIM_CONFLICT', cause: error },
        ),
      );
    }
  })();
  return granted.promise;
};

const withClaimLock = async <T,>(projectId: string, chatId: string, operation: () => Promise<T>): Promise<T> => {
  if (!Reflect.has(globalThis, 'navigator') || !Reflect.has(globalThis.navigator, 'locks')) {
    throw Object.assign(new Error('The browser cannot serialize durable chat workspace claims.'), {
      code: 'WORKSPACE_CLAIM_LOCK_UNAVAILABLE',
    });
  }
  return globalThis.navigator.locks.request(claimLockName(projectId, chatId), { mode: 'exclusive' }, operation);
};

const quarantineInvalidRecord = async (filesystem: RootedFileSystem, path: string): Promise<void> => {
  try {
    if (await filesystem.exists(path)) {
      await filesystem.rename(path, `${path}.${randomUuid()}.invalid`);
    }
  } catch {
    // A concurrent recovery may already have quarantined or removed this record.
  }
};

const readPersistedRecord = async <T,>(
  filesystem: RootedFileSystem,
  path: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> => {
  let serialized: string;
  try {
    serialized = await filesystem.readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(serialized);
  } catch {
    await quarantineInvalidRecord(filesystem, path);
    return undefined;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    await quarantineInvalidRecord(filesystem, path);
    return undefined;
  }
  return parsed.data;
};

const writePersistedRecord = async <T,>(input: {
  readonly filesystem: RootedFileSystem;
  readonly path: string;
  readonly schema: z.ZodType<T>;
  readonly value: T;
}): Promise<void> => {
  const { filesystem, path, schema, value } = input;
  const validated = schema.parse(value);
  // `writeFile` is the atomic-replace primitive: every backend swaps the whole
  // file in one step and leaves the prior record intact on failure (node = temp
  // + fsync + rename, OPFS/FS-Access = swap file + atomic rename on close,
  // IndexedDB = one transaction, memory = one map write). Writing a temp file
  // and `rename`-ing it over the target re-implemented that on top of the one
  // operation that is contractually fail-closed on an existing target, so every
  // record UPDATE threw `EEXIST`. `move` keeps its fail-closed semantics for
  // user-facing file operations; persisted records go straight through
  // `writeFile`. Pinned by the `writeFile` replace conformance across every
  // backend in `provider-tree-conformance.test.ts`.
  await filesystem.writeFile(path, JSON.stringify(validated));
};

const workspaceAuthorityMismatch = (
  chatId: string,
  expected: { readonly workspaceId: string; readonly baseRevisionId: string },
  claim: PersistedChatWorkspaceClaim | undefined,
): Error =>
  Object.assign(
    new Error(
      `Durable workspace authority does not match the active tab for chat: ${chatId} ` +
        `(expected workspace ${expected.workspaceId} on ${expected.baseRevisionId}; ` +
        `claim ${claim === undefined ? 'is absent' : `names ${claim.workspaceId} on ${claim.baseRevisionId} for chat ${claim.chatId} in project ${claim.projectId}`})`,
    ),
    { code: 'WORKSPACE_AUTHORITY_MISMATCH' },
  );

/**
 * The wire says `direct | candidate` (N26); `libs/filesystem` says
 * `local | branch`, because a materialized workspace is a filesystem concept
 * older than the wire. One translation each way, here, at the only boundary
 * where both vocabularies meet.
 */
const wireRevisionMode = (mode: MaterializedWorkspaceMode): ChatRevisionMode =>
  mode === 'local' ? 'direct' : 'candidate';

const workspaceRevisionMode = (mode: ChatRevisionMode): MaterializedWorkspaceMode =>
  mode === 'direct' ? 'local' : 'branch';

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

type BrowserWorkspaceAuthorityState = {
  readonly projectId: string;
  readonly binding: WorkspaceFileSystemBinding;
  readonly rootedFileSystem: RootedFileSystem;
  /** Host-neutral prepare/capture/merge/finalize; this provider owns only claims, locks and notification. */
  readonly recorder: TurnRevisionRecorder;
  readonly authority: MaterializedWorkspaceAuthority;
  readonly revisions: RevisionAuthority;
  readonly prepared: Map<string, PreparedChatWorkspace>;
  readonly finalized: Map<string, FinalizedChatWorkspace>;
  finalizedSnapshot: readonly FinalizedChatWorkspace[];
  readonly pending: Map<string, Promise<PreparedChatWorkspace>>;
  readonly finalizing: Map<string, InFlightChatFinalization>;
  readonly listeners: Set<() => void>;
  /** The composer's revision selection per chat; see the context's `revisionMode`. */
  readonly revisionModes: Map<string, ChatRevisionMode>;
  /** Releases for the project live-tree lock, by the chat admitted under it (DT2). */
  readonly liveTreeHolds: Map<string, () => void>;
  /** Identity-stable branch list for `useSyncExternalStore`, and the heads it was built from. */
  branchSnapshot: readonly RevisionBranchSummary[];
  branchSnapshotKey: string;
  /** The store's head reference — the branch the live project tree is on (Q11). */
  headBranch: string | undefined;
  /**
   * Whether the live tree holds a revision no branch names, after a Restore.
   *
   * The head reference itself is left where it was — a claim's branch still
   * comes from it — but no branch is the live tree, so nothing is Current
   * (c2-review S1).
   */
  detached: boolean;
  /**
   * Whether the revision authority has been asked to hydrate, and whether it
   * has. Rehydration is deliberately lazy — constructing an authority touches
   * no storage — so the branch list starts it on its first read rather than at
   * mount, where it reorders every continuation the claim race is decided in.
   */
  branchHydration: 'idle' | 'loading' | 'ready';
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
    existing.binding.loadCapabilities = input.binding.loadCapabilities;
    existing.binding.appendFile = input.binding.appendFile;
    if (providerChanged) {
      existing.binding.capabilities = input.binding.capabilities;
      existing.binding.capabilitiesRequest = undefined;
    }
    return existing;
  }
  const rootedFileSystem = createClientRootedFileSystem(input.binding);
  const recorder = new TurnRevisionRecorder({ filesystem: rootedFileSystem });
  const created: BrowserWorkspaceAuthorityState = {
    projectId: input.projectId,
    binding: input.binding,
    rootedFileSystem,
    recorder,
    authority: recorder.workspaces,
    revisions: recorder.revisions,
    prepared: new Map(),
    finalized: new Map(),
    finalizedSnapshot: emptyFinalizedChatWorkspaces,
    pending: new Map(),
    finalizing: new Map(),
    listeners: new Set(),
    revisionModes: new Map(),
    liveTreeHolds: new Map(),
    branchSnapshot: emptyRevisionBranches,
    branchSnapshotKey: '',
    headBranch: undefined,
    detached: false,
    branchHydration: 'idle',
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

/** Entries under `.tau/workspaces` that are authority state, not materialized workspaces. */
const workspaceReservedEntries = new Set(['claims', 'publications', 'conflicts', 'revisions']);

/**
 * Whether any tab is between creating a workspace directory and writing its
 * claim. This tab's own prepares are tracked in `pending`; other tabs are
 * visible only through the claim lock they hold for the whole operation.
 */
const preparesInFlight = async (state: BrowserWorkspaceAuthorityState): Promise<boolean> =>
  state.pending.size > 0 || (await claimLocksBusy(state.projectId));

/**
 * Destroy workspace directories that neither a claim nor a publication names.
 *
 * A submit that prepares a workspace and then never dispatches leaves exactly
 * that: bytes no code path will ever reclaim, because reclaim is claim-driven.
 *
 * The one window this must not race is inside `prepare`, where the workspace
 * directory exists before its claim is written. A wall-clock grace window
 * cannot see it — the IndexedDB backend reports `mtimeMs: 0` for every entry,
 * so every directory there looks infinitely old — so the guard is the claim
 * lock itself: while any tab holds or awaits one for this project, the sweep
 * stands down and retries on the next mount.
 */
const sweepOrphanedWorkspaces = async (state: BrowserWorkspaceAuthorityState): Promise<void> => {
  const filesystem = state.rootedFileSystem;
  if (!(await filesystem.exists(workspaceStorageDirectory)) || (await preparesInFlight(state))) {
    return;
  }
  // Snapshot BEFORE reading claims: a directory that appears after this line is
  // never a candidate, so a `prepare` that starts mid-sweep cannot be swept.
  const entries = await filesystem.readdir(workspaceStorageDirectory);
  /* SR4, and the mirror of the host's own sweep: a Tau Host sharing this root —
   * the desktop services utility, or a daemon serving a placed chat — mints
   * `t<runId>` workspaces for turns this authority knows nothing about, and
   * sweeps its own at its own start (`sweepTurnWorkspaces`). Deleting one here
   * deletes the tree a live host turn is writing. Each authority sweeps what it
   * mints, and this one mints `generatePrefixedId(idPrefix.run)`. */
  const candidates = entries.filter(
    (entry) => !workspaceReservedEntries.has(entry) && entry.startsWith(`${idPrefix.run}_`),
  );
  if (candidates.length === 0) {
    return;
  }
  const claimEntries = (await filesystem.exists(workspaceClaimDirectory))
    ? await filesystem.readdir(workspaceClaimDirectory)
    : [];
  const claimFiles = claimEntries.filter((file) => file.endsWith('.json'));
  const claims = await Promise.all(
    claimFiles.map(async (file) =>
      readPersistedRecord(filesystem, `${workspaceClaimDirectory}/${file}`, persistedChatWorkspaceClaimSchema),
    ),
  );
  const live = new Set([
    ...claims.map((claim) => claim?.workspaceId),
    ...[...state.prepared.values()].map((prepared) => prepared.execution.workspaceId),
  ]);
  const orphans = candidates.filter((candidate) => !live.has(candidate));
  if (orphans.length === 0 || (await preparesInFlight(state))) {
    return;
  }
  await Promise.all(
    orphans.map(async (candidate) => {
      /* A publication is the durable record of a finalized run; its directory
       * is evidence, not garbage. So is a conflict record: a stale-head
       * publication keeps the run's tree so the porcelain can diff and retry
       * it, and its claim is retired at the same moment — which made it an
       * orphan whose tree the very next mount deleted, leaving a conflict
       * pointing at nothing (6-review M6). */
      if (
        (await filesystem.exists(`${workspacePublicationDirectory}/${encodeURIComponent(candidate)}.json`)) ||
        (await filesystem.exists(`${workspaceConflictDirectory}/${encodeURIComponent(candidate)}.json`))
      ) {
        return;
      }
      await state.authority.destroy(materializedWorkspaceId(candidate));
    }),
  );
};

const equalRevisionBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

/**
 * Path-level difference between two revision trees.
 *
 * Paths and byte equality only: the porcelain's diff answers "what moved", and
 * a line-level view is the file viewer's job over the two trees.
 *
 * @param base - The tree changed from; an absent one makes every path an add.
 * @param next - The tree changed to.
 * @returns Every differing path, sorted, with its kind of change.
 */
const diffRevisionTrees = (
  base: ImmutableRevisionTree | undefined,
  next: ImmutableRevisionTree,
): readonly RevisionPathChange[] => {
  const baseFiles = new Map(base?.entries().map((entry) => [entry.path, entry.content]) ?? []);
  const nextFiles = new Map(next.entries().map((entry) => [entry.path, entry.content]));
  return [...new Set([...baseFiles.keys(), ...nextFiles.keys()])]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap((path): readonly RevisionPathChange[] => {
      const before = baseFiles.get(path);
      const after = nextFiles.get(path);
      if (before === undefined) {
        return after === undefined ? [] : [{ path, change: 'added' }];
      }
      if (after === undefined) {
        return [{ path, change: 'removed' }];
      }
      return equalRevisionBytes(before, after) ? [] : [{ path, change: 'modified' }];
    });
};

/**
 * The nearest revision both heads descend from.
 *
 * Breadth-first over recorded parents, which is exact for the shapes this graph
 * mints (one base parent per turn, two per merge) and terminates because the
 * revision graph is acyclic by construction.
 *
 * ponytail: nearest-by-distance, not a criss-cross-safe merge base — the store R-W1 brings
 * carries the engine's own merge base, and this goes when it lands.
 *
 * @param revisions - The authority holding both histories.
 * @param left - One head.
 * @param right - The other head.
 * @returns The merge base, or `undefined` when the histories are unrelated.
 */
const mergeBaseOf = (revisions: RevisionAuthority, left: RevisionId, right: RevisionId): RevisionId | undefined => {
  const ancestorsOf = (head: RevisionId): ReadonlySet<RevisionId> => {
    const seen = new Set<RevisionId>();
    const queue: RevisionId[] = [head];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      queue.push(...(revisions.getRevision(id)?.parents ?? []));
    }
    return seen;
  };
  const leftAncestors = ancestorsOf(left);
  const queue: RevisionId[] = [right];
  const seen = new Set<RevisionId>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (leftAncestors.has(id)) {
      return id;
    }
    queue.push(...(revisions.getRevision(id)?.parents ?? []));
  }
  return undefined;
};

/**
 * Write one revision tree over the live project root.
 *
 * The write itself is `TurnRevisionRecorder.applyTree` — the same ordered
 * removal, write and `WORKSPACE_VERIFY_FAILED` re-read a settlement runs, at
 * the shared owner rather than duplicated here (R-W4b §5.4). This adds only the
 * shape the pane reports: which paths changed, and how.
 *
 * @param state - The authority whose rooted filesystem is the live project.
 * @param tree - The tree the project should hold when this returns.
 * @returns Every path this write changed.
 */
const applyTreeToLiveRoot = async (
  state: BrowserWorkspaceAuthorityState,
  tree: ImmutableRevisionTree,
): Promise<readonly RevisionPathChange[]> => {
  const live = await state.recorder.captureTree();
  const changes = diffRevisionTrees(live, tree);
  await state.recorder.applyTree(tree, live);
  return changes;
};

/** Owns per-run materialized workspace capabilities for one project route. */
export function ChatWorkspaceAuthorityProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { projectId } = useProject();
  const fileManager = useFileManager();
  const { rootDirectory, proxy: providerIdentity } = fileManager.fileManagerRef.getSnapshot().context;
  const state = getBrowserWorkspaceAuthority({
    projectId,
    binding: {
      client: fileManager.client,
      rootDirectory,
      backend: fileManager.backendType,
      providerIdentity,
      loadCapabilities: async () => {
        await fileManager.workspace.syncProjectRoots();
        const { openFileSystemBridge } = await waitForRootedBridgeOpener(fileManager.fileManagerRef);
        return readRootedBridgeCapabilities(() => openFileSystemBridge(rootDirectory));
      },
      appendFile: async (path, data) => {
        const proxy = fileManager.fileManagerRef.getSnapshot().context.proxy as FileSystemBridgeProxy | undefined;
        if (proxy === undefined) {
          throw new Error('Filesystem bridge is unavailable.');
        }
        await proxy.appendFile(path, data);
      },
    },
  });
  const { rootedFileSystem, finalized, finalizing } = state;
  const notify = useCallback(() => {
    for (const listener of state.listeners) {
      listener();
    }
  }, [state]);

  const assemble = useCallback(
    async (input: {
      readonly chatId: string;
      readonly workspace: MaterializedWorkspace;
      readonly admitted: boolean;
      readonly reclaimed: boolean;
      readonly cancelled: boolean;
      readonly runId?: string;
      readonly turnId?: string;
    }): Promise<PreparedChatWorkspace> => {
      const { chatId, workspace, admitted, reclaimed, cancelled, runId, turnId } = input;
      const { workspaceId, baseRevisionId } = workspace.identity;
      /* The lane a candidate publishes onto, and the trunk the live tree is on
       * for a direct turn — the same rule the recorder records by (Q11). */
      const branch =
        workspace.identity.mode === 'branch'
          ? turnRevisionBranch(chatId)
          : state.headBranch === undefined
            ? mainRevisionBranch
            : revisionBranchName(state.headBranch);
      const preparedFileSystems = await createPreparedWorkspaceFileSystems(workspace.filesystem);
      /* The identity marker is the durable mode: a reclaimed `branch` claim
       * after a reload must show as the mode it executes (review 2-review S4). */
      const wireMode = wireRevisionMode(workspace.identity.mode);
      state.revisionModes.set(chatId, wireMode);
      const value: PreparedChatWorkspace = Object.freeze({
        chatId,
        projectId,
        execution: Object.freeze({
          hostId: state.hostId,
          mode: wireMode,
          workspaceId,
          baseRevisionId,
        }),
        branch,
        workspace,
        ...preparedFileSystems,
        admitted,
        reclaimed,
        cancelled,
        ...(runId === undefined ? {} : { runId }),
        ...(turnId === undefined ? {} : { turnId }),
      });
      state.prepared.set(chatId, value);
      notify();
      return value;
    },
    [notify, projectId],
  );

  /** Give the live tree back, if this chat holds it. */
  const releaseLiveTree = useCallback(
    (chatId: string): void => {
      state.liveTreeHolds.get(chatId)?.();
      state.liveTreeHolds.delete(chatId);
    },
    [state],
  );

  /**
   * Hold — or give back — the project live tree for this chat (DT2).
   *
   * One verb rather than two so a claim update states the invariant once: this
   * chat is the project's live-tree writer, or it is not.
   *
   * @param chatId - The chat whose claim is being written.
   * @param held - Whether that claim, as written, makes it the live-tree writer.
   */
  const setLiveTreeHold = useCallback(
    async (chatId: string, held: boolean, options?: { readonly wait?: boolean }): Promise<void> => {
      if (!held) {
        releaseLiveTree(chatId);
        return;
      }
      if (state.liveTreeHolds.has(chatId)) {
        return;
      }
      const release =
        options?.wait === false ? await tryAcquireLiveTreeLock(projectId) : await acquireLiveTreeLock(projectId);
      if (release === undefined) {
        // Another document is the writer; this one reclaims the record only.
        return;
      }
      /* A concurrent admission of the same chat may have won the race while
       * this one waited; one hold per chat, and the loser gives its own back. */
      if (state.liveTreeHolds.has(chatId)) {
        release();
        return;
      }
      state.liveTreeHolds.set(chatId, release);
    },
    [projectId, releaseLiveTree, state],
  );

  /**
   * Reclaim without taking the claim lock — for callers that already hold it.
   * `navigator.locks` is not reentrant, so `prepare` must reach this seam
   * directly.
   */
  const reclaimUnderClaimLock = useCallback(
    async (chatId: string): Promise<PreparedChatWorkspace | undefined> => {
      const current = state.prepared.get(chatId);
      if (current) {
        return current;
      }
      await ensureProviderCapabilities(state.binding);
      const path = claimPathFor(chatId);
      if (!(await state.rootedFileSystem.exists(path))) {
        return undefined;
      }
      const claim = await readPersistedRecord(state.rootedFileSystem, path, persistedChatWorkspaceClaimSchema);
      if (claim === undefined) {
        return undefined;
      }
      if (claim.chatId !== chatId || claim.projectId !== projectId) {
        await quarantineInvalidRecord(state.rootedFileSystem, path);
        return undefined;
      }
      if ((claim.mode ?? 'branch') === 'local') {
        await state.revisions.ready;
        // `assemble` always stores the base revision, so a missing one means the
        // claim no longer describes anything recoverable.
        const baseRevision = state.revisions.getRevision(revisionId(claim.baseRevisionId));
        if (!baseRevision) {
          await quarantineInvalidRecord(state.rootedFileSystem, path);
          return undefined;
        }
        /* Reclaim restores `admitted` exactly as it was persisted and used to
         * take no lock of its own, so after a reload — or in a second tab that
         * reclaimed this claim — an admitted live-tree writer had no hold in
         * this document and the next chat walked straight past the DT2 queue
         * into the same tree (6-review M3). */
        await setLiveTreeHold(chatId, writesLiveTree(claim), { wait: false });
        return assemble({
          chatId,
          workspace: await state.authority.bindInPlace({
            workspaceId: materializedWorkspaceId(claim.workspaceId),
            baseRevisionId: revisionId(claim.baseRevisionId),
            tree: baseRevision.tree,
            filesystem: state.rootedFileSystem,
          }),
          admitted: claim.admitted,
          reclaimed: true,
          cancelled: claim.cancelled,
          ...(claim.runId === undefined ? {} : { runId: claim.runId }),
          ...(claim.turnId === undefined ? {} : { turnId: claim.turnId }),
        });
      }
      let workspace: MaterializedWorkspace;
      try {
        workspace = await state.authority.reopen(materializedWorkspaceId(claim.workspaceId));
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'WORKSPACE_EXISTS') {
          await new Promise<void>((resolve) => {
            globalThis.setTimeout(resolve, 0);
          });
          const concurrentlyReclaimed = state.prepared.get(chatId);
          if (concurrentlyReclaimed) {
            return concurrentlyReclaimed;
          }
        }
        throw error;
      }
      if (workspace.identity.baseRevisionId !== claim.baseRevisionId) {
        workspace.filesystem.dispose();
        await quarantineInvalidRecord(state.rootedFileSystem, path);
        return undefined;
      }
      return assemble({
        chatId,
        workspace,
        admitted: claim.admitted,
        reclaimed: true,
        cancelled: claim.cancelled,
        ...(claim.runId === undefined ? {} : { runId: claim.runId }),
        ...(claim.turnId === undefined ? {} : { turnId: claim.turnId }),
      });
    },
    [assemble, projectId, setLiveTreeHold, state],
  );

  const discard = useCallback(
    async (chatId: string): Promise<void> => {
      await withClaimLock(projectId, chatId, async () => {
        const current = state.prepared.get(chatId);
        if (!current) {
          return;
        }
        const path = claimPathFor(chatId);
        const claim = await readPersistedRecord(state.rootedFileSystem, path, persistedChatWorkspaceClaimSchema);
        if (
          claim === undefined ||
          claim.chatId !== chatId ||
          claim.projectId !== projectId ||
          claim.workspaceId !== current.execution.workspaceId
        ) {
          throw workspaceAuthorityMismatch(chatId, current.execution, claim);
        }
        current.workspace.filesystem.dispose();
        if (await state.rootedFileSystem.exists(path)) {
          await state.rootedFileSystem.unlink(path);
        }
        state.prepared.delete(chatId);
        releaseLiveTree(chatId);
        notify();
        try {
          await state.authority.destroy(current.workspace.identity.workspaceId);
        } catch (error) {
          // The claim is the authority; the materialized bytes are not. Chrome
          // stages File System Access writes through a sibling `<name>.crswap`
          // file that directory listings hide but `rmdir` still trips over, so
          // one abandoned kernel-cache write can make a workspace directory
          // permanently unremovable (`ENOTEMPTY`). Failing here left the claim
          // retained after the publication was already written, and every later
          // submit for that chat hit the admission wait. Release first, then
          // remove; a surviving directory is inspectable evidence, exactly like
          // the merge-conflict retirement above.
          console.error('[ChatWorkspaceAuthority] materialized workspace bytes were not removed', error);
        }
      });
    },
    [notify, projectId, releaseLiveTree, state],
  );

  const prepare = useCallback(
    async (chatId: string, options?: { readonly mode?: ChatRevisionMode }): Promise<PreparedChatWorkspace> => {
      const mode = workspaceRevisionMode(options?.mode ?? 'direct');
      const current = state.prepared.get(chatId);
      if (current) {
        // The composer claims a workspace at mount to publish the latest agent
        // body, long before the user touches the Revision Picker. An admitted
        // claim belongs to a live run and keeps its mode; an unadmitted one is
        // released so the picked mode reaches the next turn.
        // `bindInPlace` returns a confining wrapper, never the live root itself,
        // so the claim's mode is the identity record — never a reference check.
        if (current.admitted || current.workspace.identity.mode === mode) {
          return current;
        }
        await discard(chatId);
      }
      const inFlight = state.pending.get(chatId);
      if (inFlight) {
        return inFlight;
      }
      const operation = (async (): Promise<PreparedChatWorkspace> => {
        const reclaimed = await withClaimLock(projectId, chatId, async () => reclaimUnderClaimLock(chatId));
        if (reclaimed) {
          return reclaimed;
        }
        if (mode === 'local' && !state.liveTreeHolds.has(chatId)) {
          // DT2: one live-tree writer at a time. Pre-isolation Tau let
          // concurrent runs write one tree, which is why charter ruling D6
          // exists — but refusing the second chat threw away a turn the user
          // meant, so it waits the holder out instead. Taken and given straight
          // back: this is the queue, not the claim. The lock is *held* by the
          // admission below, so a chat that only prepared — the composer claims
          // one at mount, long before any submit — blocks nobody.
          //
          // Outside the claim lock, deliberately: this waits up to
          // `liveTreeWaitTimeout` (5 minutes), and holding this chat's claim
          // lock across it blocked the very `discard`/`markAdmitted` that would
          // end the wait — the second tab's own retirement queues behind it
          // (6-review M5).
          (await acquireLiveTreeLock(projectId))();
        }
        return withClaimLock(projectId, chatId, async () => {
          // The wait above is not under this lock, so another tab may have
          // written this chat's claim while it ran.
          const raced = await reclaimUnderClaimLock(chatId);
          if (raced) {
            return raced;
          }
          // One workspace per claim; the publication lane is the chat's own
          // branch, and every turn's base is published onto it before the turn
          // runs, so a later turn's base-CAS stands on its own history.
          const workspaceId = materializedWorkspaceId(generatePrefixedId(idPrefix.run));
          const { workspace } = await state.recorder.prepare({
            workspaceId,
            mode,
            lane: chatId,
            actorId: projectId,
          });
          const { baseRevisionId } = workspace.identity;
          await state.rootedFileSystem.mkdir(workspaceClaimDirectory, { recursive: true });
          try {
            await writePersistedRecord({
              filesystem: state.rootedFileSystem,
              path: claimPathFor(chatId),
              schema: persistedChatWorkspaceClaimSchema,
              value: {
                version: 1,
                chatId,
                projectId,
                workspaceId,
                baseRevisionId,
                mode,
                admitted: false,
                cancelled: false,
              },
            });
          } catch (error) {
            try {
              await state.authority.destroy(workspaceId);
            } catch {
              // Preserve the claim-write failure; the unclaimed workspace is not authoritative.
            }
            throw error;
          }
          return assemble({
            chatId,
            workspace,
            admitted: false,
            reclaimed: false,
            cancelled: false,
          });
        });
      })();
      state.pending.set(chatId, operation);
      try {
        return await operation;
      } finally {
        state.pending.delete(chatId);
      }
    },
    [assemble, discard, projectId, reclaimUnderClaimLock, state],
  );

  /**
   * Rebuild this chat's prepared workspace from its persisted claim.
   *
   * Under the claim lock, because it publishes into the same `state.prepared`
   * that `prepare`, `discard` and every claim update guard: reading the claim
   * while another tab (or `prepare` itself) is between writing a workspace and
   * writing its claim published a workspace the claim no longer named, and the
   * next `markAdmitted` then failed with WORKSPACE_AUTHORITY_MISMATCH.
   */
  const reclaim = useCallback(
    async (chatId: string): Promise<PreparedChatWorkspace | undefined> =>
      withClaimLock(projectId, chatId, async () => reclaimUnderClaimLock(chatId)),
    [projectId, reclaimUnderClaimLock],
  );

  const reclaimAll = useCallback(async (): Promise<readonly PreparedChatWorkspace[]> => {
    if (!(await state.rootedFileSystem.exists(workspaceClaimDirectory))) {
      return [];
    }
    const files = await state.rootedFileSystem.readdir(workspaceClaimDirectory);
    const values = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          const path = `${workspaceClaimDirectory}/${file}`;
          const claim = await readPersistedRecord(state.rootedFileSystem, path, persistedChatWorkspaceClaimSchema);
          if (claim === undefined) {
            return undefined;
          }
          if (claim.projectId !== projectId) {
            await quarantineInvalidRecord(state.rootedFileSystem, path);
            return undefined;
          }
          try {
            return await reclaim(claim.chatId);
          } catch {
            return undefined;
          }
        }),
    );
    return values.filter((value): value is PreparedChatWorkspace => value !== undefined);
  }, [projectId, reclaim, state]);

  const updateClaim = useCallback(
    async (
      chatId: string,
      changes: {
        readonly admitted?: boolean;
        readonly cancelled?: boolean;
        readonly runId?: string;
        readonly turnId?: string;
      },
    ): Promise<void> => {
      await withClaimLock(projectId, chatId, async () => {
        const current = state.prepared.get(chatId);
        if (!current) {
          return;
        }
        const path = claimPathFor(chatId);
        const claim = await readPersistedRecord(state.rootedFileSystem, path, persistedChatWorkspaceClaimSchema);
        if (
          claim === undefined ||
          claim.chatId !== chatId ||
          claim.projectId !== projectId ||
          claim.workspaceId !== current.execution.workspaceId ||
          claim.baseRevisionId !== current.execution.baseRevisionId
        ) {
          throw workspaceAuthorityMismatch(chatId, current.execution, claim);
        }
        const nextClaim: PersistedChatWorkspaceClaim = Object.freeze({ ...claim, ...changes });
        /* A no-op update must stay a no-op. `notify()` mints a fresh prepared
         * object, and `usePreparedChatWorkspace` publishes it by identity, so
         * any subscriber that re-marks on every change spins: the RPC binding's
         * `onLease` calls `markRunId` on each join, which notified, which
         * re-ran the join effect (leave + rejoin, disposing the retained kernel
         * clients each time) — measured at ~33 join/leave cycles per second,
         * which is why no tool RPC ever completed on the desktop shell. */
        if (
          claim.admitted === nextClaim.admitted &&
          claim.cancelled === nextClaim.cancelled &&
          claim.runId === nextClaim.runId &&
          claim.turnId === nextClaim.turnId &&
          current.admitted === nextClaim.admitted &&
          current.cancelled === nextClaim.cancelled &&
          current.runId === nextClaim.runId &&
          current.turnId === nextClaim.turnId
        ) {
          return;
        }
        /* DT2: the fence, and the ordered queue. The advisory check in `prepare`
         * cannot be it — the composer prepares a claim at mount, so by submit
         * time both contenders already hold one and neither re-checks. Held
         * from here until the claim is retired, so exactly one chat is an
         * admitted live-tree writer at a time, across tabs. A claim that stops
         * being a live-tree writer gives the lock back *before* its record is
         * written: its turn is over either way, and the next writer's own
         * admission is what publishes the change that matters.
         */
        await setLiveTreeHold(chatId, writesLiveTree(nextClaim));
        try {
          await writePersistedRecord({
            filesystem: state.rootedFileSystem,
            path,
            schema: persistedChatWorkspaceClaimSchema,
            value: nextClaim,
          });
        } catch (error) {
          /* The hold is taken before the record so no window exists where an
           * admitted claim is unfenced — but a write that throws (quota,
           * ENOSPC) would otherwise leave the project lock held by a chat that
           * never became a writer, and nothing releases it for the life of the
           * document (6-review M4). */
          releaseLiveTree(chatId);
          throw error;
        }
        state.prepared.set(
          chatId,
          Object.freeze({
            ...current,
            admitted: nextClaim.admitted,
            cancelled: nextClaim.cancelled,
            ...(nextClaim.runId === undefined ? {} : { runId: nextClaim.runId }),
            ...(nextClaim.turnId === undefined ? {} : { turnId: nextClaim.turnId }),
          }),
        );
        notify();
      });
    },
    [notify, projectId, releaseLiveTree, setLiveTreeHold, state],
  );

  const markAdmitted = useCallback(
    async (chatId: string, turnId?: string): Promise<void> =>
      updateClaim(chatId, { admitted: true, cancelled: false, ...(turnId === undefined ? {} : { turnId }) }),
    [updateClaim],
  );
  const markCancelled = useCallback(
    async (chatId: string): Promise<void> => updateClaim(chatId, { cancelled: true }),
    [updateClaim],
  );
  /**
   * A claim that names a live run is admitted, whichever dispatch path started
   * that run. `markAdmitted` is only reached from `withWorkspace` and the
   * approval path, but the homepage-seeded first turn dispatches through the
   * chat-session store's `latestAgentBody` fallback, which runs neither: its
   * claim stayed `{ admitted: false, runId }` forever, and settlement — which
   * requires admission — never published the agent's work to the live tree.
   * Recording the run id is the one point every dispatch path funnels through.
   */
  const markRunId = useCallback(
    async (chatId: string, runId: string): Promise<void> => updateClaim(chatId, { runId, admitted: true }),
    [updateClaim],
  );

  const retireClaimPreservingWorkspace = useCallback(
    async (chatId: string): Promise<void> => {
      await withClaimLock(projectId, chatId, async () => {
        const current = state.prepared.get(chatId);
        if (!current) {
          return;
        }
        const path = claimPathFor(chatId);
        const claim = await readPersistedRecord(state.rootedFileSystem, path, persistedChatWorkspaceClaimSchema);
        if (
          claim === undefined ||
          claim.chatId !== chatId ||
          claim.projectId !== projectId ||
          claim.workspaceId !== current.execution.workspaceId
        ) {
          throw workspaceAuthorityMismatch(chatId, current.execution, claim);
        }
        await state.rootedFileSystem.unlink(path);
        state.prepared.delete(chatId);
        releaseLiveTree(chatId);
        current.workspace.filesystem.dispose();
        notify();
      });
    },
    [notify, projectId, releaseLiveTree, state],
  );

  const preparedWorkspaces: ReadonlyMap<string, PreparedChatWorkspace> = state.prepared;
  const finalize = useCallback<ChatWorkspaceAuthorityContextValue['finalize']>(
    async (chatId, input) => {
      const fingerprint = finalizationFingerprint(input);
      const inFlight = finalizing.get(chatId);
      if (inFlight !== undefined) {
        if (inFlight.fingerprint !== fingerprint) {
          throw new Error(`Concurrent finalization payload does not match for chat: ${chatId}`);
        }
        return inFlight.promise;
      }
      const operation = (async (): Promise<ChatWorkspaceFinalizationResult | undefined> => {
        const current = preparedWorkspaces.get(chatId);
        if (!current) {
          return undefined;
        }
        const authoritativeRunId = input.runId ?? current.runId;
        /* Settlement merges into the live root whatever the mode, so it is a
         * live-tree write and takes the DT2 hold unless this chat already is the
         * writer — Web Locks are not re-entrant, so that test is load-bearing
         * (8-review M3). */
        const releaseSettlementHold = state.liveTreeHolds.has(chatId)
          ? undefined
          : await acquireLiveTreeLock(projectId);
        let settled;
        try {
          settled = await state.recorder.finalize({
            lane: chatId,
            workspace: current.workspace,
            actorId: input.actorId,
            ...(authoritativeRunId === undefined ? {} : { runId: authoritativeRunId }),
            summary: input.summary,
          });
        } finally {
          releaseSettlementHold?.();
        }
        if (settled.status === 'conflicted') {
          const result: ConflictedChatWorkspace = Object.freeze({
            status: 'conflicted',
            chatId,
            projectId,
            turnId: input.turnId,
            workspaceId: current.execution.workspaceId,
            branchName: current.branch,
            conflict: persistedMergeConflict(settled.conflicts),
          });
          await rootedFileSystem.mkdir(workspaceConflictDirectory, { recursive: true });
          await writePersistedRecord({
            filesystem: rootedFileSystem,
            path: `${workspaceConflictDirectory}/${encodeURIComponent(current.execution.workspaceId)}.json`,
            schema: conflictedChatWorkspaceSchema,
            value: result,
          });
          await retireClaimPreservingWorkspace(chatId);
          return result;
        }
        const { revision: storedRevision, persistence } = settled;
        // The tree id, not the revision id — the same fact the host records (8-review S2).
        const settledRevision = await state.recorder.port.readRevision(storedRevision.id);
        const result: FinalizedChatWorkspace = Object.freeze({
          turnId: input.turnId,
          ...(input.parentTurnId === undefined ? {} : { parentTurnId: input.parentTurnId }),
          revisionId: storedRevision.id,
          baseRevisionId: current.workspace.identity.baseRevisionId,
          treeId: settledRevision?.treeId ?? storedRevision.id,
          branchName: settled.branch,
          publication: persistedPublication({
            publication: settled.publication,
            expectedHead: current.workspace.identity.baseRevisionId,
            fallbackHead: storedRevision.id,
          }),
          changedPaths: settled.changedPaths,
          provenance: storedRevision.provenance,
          generatedSummary: storedRevision.summary.generated,
          chatId,
          jobIds: Object.freeze([...(input.jobIds ?? [])]),
          projectId,
          workspaceId: current.execution.workspaceId,
          /* One store: a recorded revision is durable in it by construction, so
           * the receipt is the evidence rather than an optional native leg. */
          nativeGit: ((): PersistedNativeGitStatus =>
            persistence === undefined
              ? { status: 'not-configured' }
              : { status: 'stored', commitId: persistence.commitId, objectFormat: persistence.objectFormat })(),
          ...(storedRevision.provenance.runId === undefined ? {} : { runId: storedRevision.provenance.runId }),
        });
        await rootedFileSystem.mkdir(workspacePublicationDirectory, { recursive: true });
        await writePersistedRecord({
          filesystem: rootedFileSystem,
          path: `${workspacePublicationDirectory}/${encodeURIComponent(current.execution.workspaceId)}.json`,
          schema: finalizedChatWorkspaceSchema,
          value: result,
        });
        const conflictPath = `${workspaceConflictDirectory}/${encodeURIComponent(current.execution.workspaceId)}.json`;
        if (await rootedFileSystem.exists(conflictPath)) {
          await rootedFileSystem.unlink(conflictPath);
        }
        if (String(settled.branch) === state.headBranch) {
          /* The turn published onto the branch the head reference names, and
           * settlement wrote its tree into the live folder: the live tree is on
           * that branch again, whatever a Restore left behind (c2-review S1). */
          Reflect.set(state, 'detached', false);
        }
        finalized.set(current.execution.workspaceId, result);
        Reflect.set(state, 'finalizedSnapshot', [...finalized.values()]);
        await discard(chatId);
        notify();
        return { status: 'finalized', finalization: result };
      })();
      const token = {};
      const tracked = (async (): Promise<ChatWorkspaceFinalizationResult | undefined> => {
        try {
          return await operation;
        } finally {
          if (finalizing.get(chatId)?.token === token) {
            finalizing.delete(chatId);
          }
        }
      })();
      finalizing.set(chatId, { fingerprint, promise: tracked, token });
      return tracked;
    },
    [
      discard,
      finalized,
      finalizing,
      notify,
      preparedWorkspaces,
      projectId,
      retireClaimPreservingWorkspace,
      rootedFileSystem,
      state,
    ],
  );

  /**
   * DT1: re-read the store's head reference.
   *
   * Asynchronous, and the pane's snapshot is not, so the value is cached beside
   * the branch list and refreshed wherever it can move: hydration, a checkout,
   * and a host writing revisions into the same store.
   */
  const refreshHeadBranch = useCallback(async (): Promise<void> => {
    const stored = await state.recorder.port.readHead();
    if (state.headBranch === stored?.branch && !state.detached) {
      return;
    }
    // Re-reading the head is what ends a detached live tree (c2-review S1).
    Reflect.set(state, 'detached', false);
    Reflect.set(state, 'headBranch', stored?.branch);
    notify();
  }, [notify, state]);

  /**
   * DT1: point the live project tree at one stored revision.
   *
   * Switching a branch and restoring a revision are the same operation — a
   * branch is a name for a head — so the porcelain has one verb. Under the
   * project live-tree lock, so it can never overwrite a turn running in the
   * project folder: the same queue DT2 admits live-tree writers through.
   */
  const checkout = useCallback(
    async (revision: string): Promise<readonly RevisionPathChange[]> => {
      await state.revisions.ready;
      /* The projection loads only ref-reachable revisions; a discarded branch's
       * turns are still whole objects in the store, and a Restore names them by
       * id (8-review S1). */
      const tree =
        state.revisions.getRevision(revisionId(revision))?.tree ??
        (await state.recorder.port.readTree(revisionId(revision)));
      if (!tree) {
        throw Object.assign(new Error(`This project holds no revision ${revision}.`), {
          code: 'REVISION_NOT_FOUND',
        });
      }
      const release = await acquireLiveTreeLock(projectId);
      try {
        const changes = await applyTreeToLiveRoot(state, tree);
        /* The folder is now on whatever branch names this revision, so the head
         * reference goes with it — that is what makes "Current" the branch the
         * live tree is on rather than the branch of the newest turn (Q11). A
         * restore to a revision no branch names leaves the head where it is. */
        const branch = [...state.revisions.listBranchHeads()].find(([, head]) => head === revisionId(revision))?.[0];
        if (branch === undefined) {
          /* Detached: the folder holds a revision no branch names, so no branch
           * is "The live project tree" until the next turn or the next switch
           * puts it back on one. The head reference stays where it is — a
           * claim's branch is still read from it (c2-review S1). */
          Reflect.set(state, 'detached', true);
          notify();
          return changes;
        }
        await state.recorder.port.setHead(String(branch));
        await refreshHeadBranch();
        return changes;
      } finally {
        release();
      }
    },
    [notify, projectId, refreshHeadBranch, state],
  );

  /**
   * DT1: merge one branch into another and publish the result.
   *
   * The conflict is a *value*: `mergeRevisionTrees` returns it rather than
   * throwing, this returns it in the same shape the finalizer's own conflicted
   * settlement uses, and nothing is written — both branches, both trees and the
   * merge base are all still there to try again from (I-CONF).
   */
  const mergeBranch = useCallback(
    async (input: {
      readonly source: string;
      readonly target: string;
      readonly actorId: string;
    }): Promise<BranchMergeResult> => {
      await state.revisions.ready;
      const source = revisionBranchName(input.source);
      const target = revisionBranchName(input.target);
      const sourceHead = state.revisions.getBranchHead(source);
      const targetHead = state.revisions.getBranchHead(target);
      if (sourceHead === undefined || targetHead === undefined) {
        throw Object.assign(
          new Error(`This project holds no head for ${sourceHead === undefined ? source : target}.`),
          { code: 'REVISION_BRANCH_NOT_FOUND' },
        );
      }
      const sourceRevision = state.revisions.getRevision(sourceHead);
      const targetRevision = state.revisions.getRevision(targetHead);
      if (!sourceRevision || !targetRevision) {
        throw Object.assign(new Error('A branch head names a revision this project does not hold.'), {
          code: 'REVISION_NOT_FOUND',
        });
      }
      if (sourceHead === targetHead) {
        return { status: 'up-to-date', branchName: target, revisionId: targetHead };
      }
      const base = mergeBaseOf(state.revisions, targetHead, sourceHead);
      const baseTree =
        base === undefined
          ? new ImmutableRevisionTree([])
          : (state.revisions.getRevision(base)?.tree ?? new ImmutableRevisionTree([]));
      const merged = mergeRevisionTrees(baseTree, targetRevision.tree, sourceRevision.tree);
      if (merged.status === 'conflicted') {
        return { status: 'conflicted', branchName: target, conflict: persistedMergeConflict(merged.conflicts) };
      }
      const changedPaths = diffRevisionTrees(targetRevision.tree, merged.tree).map((change) => change.path);
      if (changedPaths.length === 0) {
        return { status: 'up-to-date', branchName: target, revisionId: targetHead };
      }
      /* Through the recorder, so a merge is content-addressed like every other
       * revision. An opaque id here poisoned the branch it published onto: the
       * chat's next `prepare` names that head as its parent, and `writeRevision`
       * refuses a parent that is not an object id (6-review M1). */
      const revision = await state.recorder.record({
        parents: [targetHead, sourceHead],
        tree: merged.tree,
        provenance: { source: 'merge', actorId: input.actorId, createdAt: Date.now() },
        summary: { generated: `Merged ${source} into ${target}` },
      });
      const publication = await state.revisions.updateBranchHead({
        branch: target,
        expectedHead: targetHead,
        head: revision.id,
      });
      if (publication.status === 'conflicted') {
        /* Another writer moved the target head while this merge computed. The
         * merge revision stays — it is immutable evidence of what was tried —
         * and the caller merges again from the head that won. */
        throw Object.assign(new Error(`The ${target} head moved while this merge was computed.`), {
          code: 'REVISION_BRANCH_HEAD_CONFLICT',
        });
      }
      if (String(target) === state.headBranch) {
        /* The live tree follows the head reference: merging into the branch the
         * folder is on lands in the folder too, under the same live-tree lock a
         * checkout takes (Q11). */
        const release = await acquireLiveTreeLock(projectId);
        try {
          await applyTreeToLiveRoot(state, merged.tree);
        } finally {
          release();
        }
      }
      notify();
      return {
        status: 'merged',
        branchName: target,
        revisionId: revision.id,
        changedPaths: Object.freeze([...changedPaths]),
      };
    },
    [notify, projectId, state],
  );

  /**
   * DT1: discard one branch by removing its ref.
   *
   * Under the authority's own per-branch expected-old check, so a branch whose
   * head moved while the pane was showing it is refused rather than silently
   * dropped. Nothing in the object store is deleted.
   */
  const deleteBranch = useCallback(
    async (branch: string): Promise<BranchHeadUpdateResult> => {
      await state.revisions.ready;
      const name = revisionBranchName(branch);
      const result = await state.revisions.deleteBranchHead({
        branch: name,
        expectedHead: state.revisions.getBranchHead(name),
      });
      Reflect.set(state, 'branchSnapshotKey', '');
      notify();
      return result;
    },
    [notify, state],
  );

  /** DT1: every branch head the authority holds, newest write first. */
  const listBranches = useCallback((): readonly RevisionBranchSummary[] => {
    if (state.branchHydration !== 'ready') {
      if (state.branchHydration === 'idle') {
        Reflect.set(state, 'branchHydration', 'loading');
        // async-iife: bootstrap -- hydration has no caller to return to; it notifies.
        void (async (): Promise<void> => {
          try {
            await state.revisions.ready;
            await refreshHeadBranch();
            Reflect.set(state, 'branchHydration', 'ready');
            notify();
          } catch (error) {
            // Unreadable revision storage is not a broken pane; the list stays empty.
            Reflect.set(state, 'branchHydration', 'idle');
            console.error('[ChatWorkspaceAuthority] revision authority did not hydrate', error);
          }
        })();
      }
      return state.branchSnapshot;
    }
    const heads = [...state.revisions.listBranchHeads()].sort(([left], [right]) => left.localeCompare(right));
    const key = heads.map(([name, head]) => `${name}\u0000${head}`).join('\u0001');
    if (state.branchSnapshotKey === key) {
      return state.branchSnapshot;
    }
    Reflect.set(state, 'branchSnapshotKey', key);
    Reflect.set(
      state,
      'branchSnapshot',
      Object.freeze(
        heads.flatMap(([name, head]): readonly RevisionBranchSummary[] => {
          const revision = state.revisions.getRevision(head);
          return revision === undefined
            ? []
            : [
                Object.freeze({
                  name: String(name),
                  headRevisionId: String(head),
                  summary: revision.summary.edited ?? revision.summary.generated,
                  actorId: revision.provenance.actorId,
                  source: revision.provenance.source,
                  createdAt: revision.provenance.createdAt,
                }),
              ];
        }),
      ),
    );
    return state.branchSnapshot;
  }, [notify, refreshHeadBranch, state]);

  /**
   * A branch a *host* publishes reaches this pane when its record arrives.
   *
   * `listBranches` is authority state, and the authority reads its store once —
   * correct for the only writer, wrong the moment a daemon or the desktop
   * services utility writes revisions into the same `.tau/revisions` store
   * from another process. The host's own `revision.finalized` record is the one
   * signal that reaches the page, so it is what re-reads the store.
   *
   * Nothing is awaited at mount: the subscription is synchronous and the reload
   * only runs on an event. (An `await` in a mount effect here reorders every
   * continuation the cross-tab claim race is decided in — R-W4b note 2.)
   */
  useEffect(
    () =>
      subscribeHostFinalizedRevisions(() => {
        if (state.branchHydration !== 'ready') {
          return;
        }
        // async-iife: bootstrap -- the store event has no caller to return to; it notifies.
        void (async (): Promise<void> => {
          try {
            await state.revisions.reload();
            await refreshHeadBranch();
            Reflect.set(state, 'branchSnapshotKey', '');
            notify();
          } catch (error) {
            console.error('[ChatWorkspaceAuthority] revision authority did not reload', error);
          }
        })();
      }),
    [notify, refreshHeadBranch, state],
  );

  /** DT1: what changed between two stored revisions, by path. */
  const diffRevisions = useCallback(
    (input: { readonly from?: string | undefined; readonly to: string }): readonly RevisionPathChange[] => {
      const to = state.revisions.getRevision(revisionId(input.to));
      if (!to) {
        return [];
      }
      const from = input.from === undefined ? undefined : state.revisions.getRevision(revisionId(input.from));
      return diffRevisionTrees(from?.tree, to.tree);
    },
    [state],
  );

  useEffect(() => {
    let cancelled = false;
    const hydratePublications = async (): Promise<void> => {
      // The bridge client can be transiently absent (and is absent in shallow
      // test mounts); hydration retries on the next state change.
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the binding type says required; a shallow test mount hands over a partial one, and losing this guard throws there.
      if (!state.binding.client) {
        return;
      }
      if (!(await state.rootedFileSystem.exists(workspacePublicationDirectory))) {
        return;
      }
      const files = await state.rootedFileSystem.readdir(workspacePublicationDirectory);
      const publications = await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .map(async (file) =>
            readPersistedRecord(
              state.rootedFileSystem,
              `${workspacePublicationDirectory}/${file}`,
              finalizedChatWorkspaceSchema,
            ),
          ),
      );
      for (const value of publications) {
        if (!cancelled && value?.projectId === projectId) {
          state.finalized.set(value.workspaceId, Object.freeze(value));
        }
      }
      if (!cancelled) {
        state.finalizedSnapshot = [...state.finalized.values()];
        notify();
      }
    };
    const hydrateThenSweep = async (): Promise<void> => {
      await hydratePublications();
      if (cancelled) {
        return;
      }
      try {
        await sweepOrphanedWorkspaces(state);
      } catch (error) {
        // Orphan bytes are inert; a failed sweep must never break the mount.
        console.error('[ChatWorkspaceAuthority] orphaned workspace sweep failed', error);
      }
    };
    // async-iife: bootstrap
    void hydrateThenSweep();
    return () => {
      cancelled = true;
    };
  }, [notify, projectId, state]);

  const value = useMemo<ChatWorkspaceAuthorityContextValue>(
    () => ({
      prepare,
      revisionMode: (chatId) => state.revisionModes.get(chatId) ?? 'direct',
      setRevisionMode: (chatId, mode) => {
        if ((state.revisionModes.get(chatId) ?? 'direct') === mode) {
          return;
        }
        state.revisionModes.set(chatId, mode);
        notify();
      },
      reclaim,
      reclaimAll,
      markAdmitted,
      markCancelled,
      markRunId,
      get: (chatId) => state.prepared.get(chatId),
      finalize,
      discard,
      retireClaim: retireClaimPreservingWorkspace,
      subscribe: (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      listFinalized: () => state.finalizedSnapshot,
      checkout,
      mergeBranch,
      deleteBranch,
      diffRevisions,
      listBranches,
      headBranch: () => (state.detached ? undefined : state.headBranch),
    }),
    [
      checkout,
      deleteBranch,
      diffRevisions,
      listBranches,
      discard,
      finalize,
      mergeBranch,
      markAdmitted,
      markCancelled,
      markRunId,
      notify,
      prepare,
      reclaim,
      reclaimAll,
      retireClaimPreservingWorkspace,
      state,
    ],
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

const noAuthoritySubscribe = (): (() => void) => () => undefined;

/**
 * The mode this chat's next turn is admitted in, and the setter the revision
 * selector writes through.
 *
 * `undefined` outside a project route, where there is no authority to hold the
 * selection and therefore no revision selector to render.
 *
 * @param chatId - The chat whose selection to read.
 * @returns The selection and its setter, or `undefined`.
 * @public
 */
export const useChatRevisionMode = (
  chatId: string,
): { readonly mode: ChatRevisionMode; readonly setMode: (mode: ChatRevisionMode) => void } | undefined => {
  const authority = useOptionalChatWorkspaceAuthority();
  const mode = useSyncExternalStore(
    authority?.subscribe ?? noAuthoritySubscribe,
    () => authority?.revisionMode(chatId) ?? 'direct',
    (): ChatRevisionMode => 'direct',
  );
  const setMode = useCallback(
    (next: ChatRevisionMode) => authority?.setRevisionMode(chatId, next),
    [authority, chatId],
  );
  return authority === undefined ? undefined : { mode, setMode };
};

/** Project-wide authoritative publications produced by chat workspaces. */
export const useFinalizedChatWorkspaces = (): readonly FinalizedChatWorkspace[] => {
  const authority = useChatWorkspaceAuthority();
  return useSyncExternalStore(authority.subscribe, authority.listFinalized, () => emptyFinalizedChatWorkspaces);
};
