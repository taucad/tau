import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import {
  MaterializedWorkspaceAuthority,
  RevisionAuthority,
  captureRevisionTree,
  createBrowserRevisionPersistence,
  mergeRevisionTrees,
  materializedWorkspaceId,
  revisionBranchName,
  revisionId,
} from '@taucad/filesystem';
import type {
  ImmutableRevisionTree,
  MaterializedWorkspace,
  ProviderCapabilities,
  Revision,
  RevisionBranchName,
  RevisionId,
  RevisionTreeConflict,
  RootedFileSystem,
} from '@taucad/filesystem';
import type { ChatExecutionTarget } from '@taucad/chat/schemas';
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
import type { ChatRevisionMode } from '#utils/chat-revision-mode.js';
import type {
  AuthoritativeRevisionFinalization,
  PersistedBranchPublication,
  PersistedNativeGitStatus,
  PersistedRevisionConflict,
} from '#types/revision.types.js';

export type PreparedChatWorkspace = Readonly<{
  chatId: string;
  projectId: string;
  execution: ChatExecutionTarget;
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

type ChatWorkspaceAuthorityContextValue = Readonly<{
  /** `mode` defaults to `local`: the turn writes the live project tree. */
  prepare: (chatId: string, options?: { readonly mode?: ChatRevisionMode }) => Promise<PreparedChatWorkspace>;
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
}>;

const ChatWorkspaceAuthorityContext = createContext<ChatWorkspaceAuthorityContextValue | undefined>(undefined);
const workspaceStorageDirectory = '.tau/workspaces';
const workspaceClaimDirectory = `${workspaceStorageDirectory}/claims`;
const workspacePublicationDirectory = `${workspaceStorageDirectory}/publications`;
const workspaceConflictDirectory = `${workspaceStorageDirectory}/conflicts`;
/**
 * Kernel-generated output, not project content: `kernel-worker.ts` already
 * excludes `.tau/cache/**` from its watches. Capturing it made every geometry
 * cache bin ride the base revision, merge into the live project on finalize,
 * and show up in `changedPaths` — and made the live cache a deletion candidate
 * whenever the agent's tree lacked it. The live kernel repopulates its own cache.
 */
const generatedCacheDirectory = '.tau/cache';
/**
 * The host's canonical chat log (PH19: `.tau/chats/<chatId>/events.jsonl`) is
 * written to the **project root**, not the turn tree — so in local mode, where
 * the live root IS the agent tree, an unexcluded log rides straight into the
 * revision capture and lands in `changedPaths`. The log is a session record,
 * never project content.
 */
const chatLogDirectory = '.tau/chats';
/** Directories `captureProjectTree` never walks: authority state, kernel cache, chat logs. */
const captureExcludedDirectories = [workspaceStorageDirectory, generatedCacheDirectory, chatLogDirectory] as const;
const emptyFinalizedChatWorkspaces: readonly FinalizedChatWorkspace[] = [];

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

const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const changedPathsBetween = (base: ImmutableRevisionTree, next: ImmutableRevisionTree): readonly string[] => {
  const baseFiles = new Map(base.entries().map((entry) => [entry.path, entry.content]));
  const nextFiles = new Map(next.entries().map((entry) => [entry.path, entry.content]));
  return [...new Set([...baseFiles.keys(), ...nextFiles.keys()])]
    .filter((path) => {
      const before = baseFiles.get(path);
      const after = nextFiles.get(path);
      return before === undefined || after === undefined || !equalBytes(before, after);
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};

const sameTree = (left: ImmutableRevisionTree, right: ImmutableRevisionTree): boolean =>
  changedPathsBetween(left, right).length === 0;

const sameFinalizationRevision = (left: Revision, right: Revision): boolean =>
  left.id === right.id &&
  left.parents.length === right.parents.length &&
  left.parents.every((parent, index) => parent === right.parents[index]) &&
  sameTree(left.tree, right.tree) &&
  left.provenance.source === right.provenance.source &&
  left.provenance.actorId === right.provenance.actorId &&
  left.provenance.runId === right.provenance.runId &&
  left.provenance.createdAt === right.provenance.createdAt &&
  left.summary.generated === right.summary.generated &&
  left.summary.edited === right.summary.edited;

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

/**
 * Three-way merge, apply, and verify one isolated workspace against the current
 * live project.
 *
 * Verification covers **only the paths this merge applied**. The preview and
 * geometry pipeline writes its own outputs (`thumbnail.webp`, parameter and
 * geometry caches) into the live root while the settlement runs, unfenced; a
 * whole-tree comparison therefore failed on bytes the settlement never wrote,
 * and the run retried five times and stopped. Re-reading exactly what was
 * written and unlinked keeps the whole point of the check — a write that
 * silently did not land still refuses to publish — without owning writes that
 * belong to another writer.
 */
export const mergeWorkspaceIntoLiveProject = async (input: {
  readonly base: ImmutableRevisionTree;
  readonly live: RootedFileSystem;
  readonly agent: RootedFileSystem;
}): Promise<
  | Readonly<{ status: 'merged'; tree: ImmutableRevisionTree }>
  | Readonly<{ status: 'conflicted'; conflicts: readonly RevisionTreeConflict[] }>
> => {
  const liveTree = await captureProjectTree(input.live);
  // Local mode binds the live root AS the agent root (`bindInPlace`), so a
  // second capture is not a second opinion — it is a second *snapshot*, and a
  // pipeline write landing between the two reads as an agent change.
  const agentTree = input.agent === input.live ? liveTree : await captureProjectTree(input.agent);
  const merged = mergeRevisionTrees(input.base, liveTree, agentTree);
  if (merged.status === 'conflicted') {
    return merged;
  }

  const liveFiles = new Map(liveTree.entries().map(({ path, content }) => [path, content]));
  const targetFiles = new Map(merged.tree.entries().map(({ path, content }) => [path, content]));
  const removedPaths = [...liveFiles.keys()]
    .filter((path) => !targetFiles.has(path))
    .sort((left, right) => right.length - left.length || right.localeCompare(left));
  for (const path of removedPaths) {
    // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
    await input.live.unlink(path);
  }
  const writtenPaths: string[] = [];
  for (const [path, content] of targetFiles) {
    const current = liveFiles.get(path);
    if (current !== undefined && equalBytes(current, content)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
    await input.live.writeFile(path, content);
    writtenPaths.push(path);
  }

  const verified = await captureProjectTree(input.live);
  const verifiedFiles = new Map(verified.entries().map(({ path, content }) => [path, content]));
  const unverifiedPaths = [
    ...removedPaths.filter((path) => verifiedFiles.has(path)),
    ...writtenPaths.filter((path) => {
      const applied = verifiedFiles.get(path);
      return applied === undefined || !equalBytes(applied, targetFiles.get(path)!);
    }),
  ].sort();
  if (unverifiedPaths.length > 0) {
    const error = Object.assign(
      new Error(`Live project verification did not match the paths this merge applied: ${unverifiedPaths.join(', ')}`),
      { code: 'WORKSPACE_VERIFY_FAILED', paths: Object.freeze(unverifiedPaths) },
    );
    throw error;
  }
  return { status: 'merged', tree: merged.tree };
};

const persistedMergeConflict = (
  conflicts: readonly RevisionTreeConflict[],
): Extract<PersistedRevisionConflict, { readonly type: 'merge' }> => ({
  type: 'merge',
  kind: conflicts[0]?.type ?? 'text',
  paths: [...new Set(conflicts.map(({ path }) => path))].sort(),
});

const persistedPublication = (input: {
  readonly publication: Awaited<ReturnType<RevisionAuthority['updateBranchHead']>>;
  readonly expectedHead: RevisionId;
}): PersistedBranchPublication => {
  if (input.publication.status === 'updated') {
    return {
      status: 'updated',
      branchName: input.publication.branch,
      expectedHeadRevisionId: input.expectedHead,
      ...(input.publication.previousHead === undefined
        ? {}
        : { previousHeadRevisionId: input.publication.previousHead }),
      headRevisionId: input.publication.head,
    };
  }
  return {
    status: 'conflicted',
    branchName: input.publication.conflict.branch,
    expectedHeadRevisionId: input.expectedHead,
    ...(input.publication.conflict.actualHead === undefined
      ? {}
      : { actualHeadRevisionId: input.publication.conflict.actualHead }),
    proposedHeadRevisionId: input.publication.conflict.proposedHead,
  };
};

const claimPathFor = (chatId: string): string => `${workspaceClaimDirectory}/${encodeURIComponent(chatId)}.json`;

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

/** Local mode is exactly "the workspace root is the live project root" — no extra state to track. */
const preparedRevisionMode = (
  state: { readonly rootedFileSystem: RootedFileSystem },
  prepared: PreparedChatWorkspace,
): ChatRevisionMode => (prepared.workspace.filesystem === state.rootedFileSystem ? 'local' : 'branch');

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
  readonly authority: MaterializedWorkspaceAuthority;
  readonly revisions: RevisionAuthority;
  readonly prepared: Map<string, PreparedChatWorkspace>;
  readonly finalized: Map<string, FinalizedChatWorkspace>;
  finalizedSnapshot: readonly FinalizedChatWorkspace[];
  readonly pending: Map<string, Promise<PreparedChatWorkspace>>;
  readonly finalizing: Map<string, InFlightChatFinalization>;
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
    existing.binding.loadCapabilities = input.binding.loadCapabilities;
    existing.binding.appendFile = input.binding.appendFile;
    if (providerChanged) {
      existing.binding.capabilities = input.binding.capabilities;
      existing.binding.capabilitiesRequest = undefined;
    }
    return existing;
  }
  const rootedFileSystem = createClientRootedFileSystem(input.binding);
  const created: BrowserWorkspaceAuthorityState = {
    projectId: input.projectId,
    binding: input.binding,
    rootedFileSystem,
    authority: new MaterializedWorkspaceAuthority({ filesystem: rootedFileSystem }),
    revisions: new RevisionAuthority({
      persistence: createBrowserRevisionPersistence({
        filesystem: rootedFileSystem,
        storageDirectory: `${workspaceStorageDirectory}/revisions`,
      }),
    }),
    prepared: new Map(),
    finalized: new Map(),
    finalizedSnapshot: emptyFinalizedChatWorkspaces,
    pending: new Map(),
    finalizing: new Map(),
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

/**
 * One walker, shared with the materialized-workspace substrate: it already
 * skips entries that vanish between the listing and the read, which is what
 * kept an in-flight atomic write's `.<name>.<pid>.<uuid>.tmp` sibling from
 * failing workspace admission on a node-backed folder.
 */
const captureProjectTree = async (filesystem: RootedFileSystem): Promise<ImmutableRevisionTree> =>
  captureRevisionTree(filesystem, {
    exclude: (path) =>
      captureExcludedDirectories.some((excluded) => path === excluded || path.startsWith(`${excluded}/`)),
  });

/**
 * The revision this chat's next base descends from: the head of the most
 * recently published `agent/<chatId>/<runId>` lane. Every run publishes onto
 * its own branch, so without this each claim's base is a fresh root and the
 * chat's durable lineage is a pile of disconnected "Base for chat" revisions —
 * nothing can walk back to the turn that actually produced the live tree.
 * Empty for the chat's first claim (a genuine root).
 *
 * ponytail: per chat, not per project. Two chats taking turns on one live tree
 * still produce two lineages; local mode admits only one at a time, and a
 * project-wide head is a bigger ruling than this defect needs.
 */
const chatLineageHead = (revisions: RevisionAuthority, chatId: string, workspaceId: string): readonly RevisionId[] => {
  const lanePrefix = `agent/${chatId}/`;
  let latest: Revision | undefined;
  for (const [branch, head] of revisions.listBranchHeads()) {
    if (!branch.startsWith(lanePrefix) || branch === `${lanePrefix}${workspaceId}`) {
      continue;
    }
    const revision = revisions.getRevision(head);
    if (
      revision !== undefined &&
      (latest === undefined || revision.provenance.createdAt > latest.provenance.createdAt)
    ) {
      latest = revision;
    }
  }
  return latest === undefined ? [] : [latest.id];
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
  const candidates = entries.filter((entry) => !workspaceReservedEntries.has(entry));
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
      // A publication is the durable record of a finalized run; its directory
      // is evidence, not garbage.
      if (await filesystem.exists(`${workspacePublicationDirectory}/${encodeURIComponent(candidate)}.json`)) {
        return;
      }
      await state.authority.destroy(materializedWorkspaceId(candidate));
    }),
  );
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
  const rootedFileSystem = state.rootedFileSystem;
  const revisions = state.revisions;
  const finalized = state.finalized;
  const finalizing = state.finalizing;
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
      await state.revisions.ready;
      if (!state.revisions.getRevision(baseRevisionId)) {
        await state.revisions.createRevision({
          id: baseRevisionId,
          parents: chatLineageHead(state.revisions, chatId, workspaceId),
          tree: workspace.baseTree,
          provenance: { source: 'user', actorId: projectId, createdAt: Date.now() },
          summary: { generated: `Base for chat ${chatId}` },
        });
      }
      const branch = revisionBranchName(`agent/${chatId}/${workspaceId}`);
      if (!state.revisions.getBranchHead(branch)) {
        await state.revisions.updateBranchHead({ branch, expectedHead: undefined, head: baseRevisionId });
      }
      const preparedFileSystems = await createPreparedWorkspaceFileSystems(workspace.filesystem);
      const value: PreparedChatWorkspace = Object.freeze({
        chatId,
        projectId,
        execution: Object.freeze({ workspaceId, baseRevisionId, hostId: state.hostId }),
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
    [assemble, projectId, state],
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
    [notify, projectId, state],
  );

  /** The chat, if any, that already holds an admitted live-tree claim on this project. */
  const admittedLocalClaimHolder = useCallback(
    async (chatId: string): Promise<string | undefined> => {
      if (!(await state.rootedFileSystem.exists(workspaceClaimDirectory))) {
        return undefined;
      }
      const files = await state.rootedFileSystem.readdir(workspaceClaimDirectory);
      const claims = await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .map(async (file) =>
            readPersistedRecord(
              state.rootedFileSystem,
              `${workspaceClaimDirectory}/${file}`,
              persistedChatWorkspaceClaimSchema,
            ),
          ),
      );
      return claims.find(
        (claim) =>
          claim !== undefined &&
          claim.projectId === projectId &&
          claim.chatId !== chatId &&
          claim.mode === 'local' &&
          claim.admitted &&
          !claim.cancelled,
      )?.chatId;
    },
    [projectId, state],
  );

  const prepare = useCallback(
    async (chatId: string, options?: { readonly mode?: ChatRevisionMode }): Promise<PreparedChatWorkspace> => {
      const mode = options?.mode ?? 'local';
      const current = state.prepared.get(chatId);
      if (current) {
        // The composer claims a workspace at mount to publish the latest agent
        // body, long before the user touches the Revision Picker. An admitted
        // claim belongs to a live run and keeps its mode; an unadmitted one is
        // released so the picked mode reaches the next turn.
        if (current.admitted || preparedRevisionMode(state, current) === mode) {
          return current;
        }
        await discard(chatId);
      }
      const inFlight = state.pending.get(chatId);
      if (inFlight) {
        return inFlight;
      }
      const operation = withClaimLock(projectId, chatId, async () => {
        const reclaimed = await reclaimUnderClaimLock(chatId);
        if (reclaimed) {
          return reclaimed;
        }
        if (mode === 'local') {
          // Pre-isolation Tau let concurrent runs write one live tree, which is
          // why charter ruling D6 exists. Refuse instead of racing; queued
          // admission is deferred task DT2.
          const holder = await admittedLocalClaimHolder(chatId);
          if (holder !== undefined) {
            throw Object.assign(
              new Error(
                'Another chat is already working in this project folder. Wait for it to finish, or switch this chat to a new branch.',
              ),
              { code: 'WORKSPACE_LOCAL_CLAIM_CONFLICT', chatId: holder },
            );
          }
        }
        const tree = await captureProjectTree(state.rootedFileSystem);
        const baseRevisionId = revisionId(createOpaqueId('rev'));
        // A branch is the immutable publication lane for one logical run. A
        // later turn in the same chat must never reuse the previous run's
        // head, otherwise its base-CAS would conflict with its own history.
        const workspaceId = materializedWorkspaceId(generatePrefixedId(idPrefix.run));
        const workspace =
          mode === 'local'
            ? await state.authority.bindInPlace({
                workspaceId,
                baseRevisionId,
                tree,
                filesystem: state.rootedFileSystem,
              })
            : await state.authority.materialize({ workspaceId, baseRevisionId, tree });
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
      state.pending.set(chatId, operation);
      try {
        return await operation;
      } finally {
        state.pending.delete(chatId);
      }
    },
    [admittedLocalClaimHolder, assemble, discard, projectId, reclaimUnderClaimLock, state],
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
        await writePersistedRecord({
          filesystem: state.rootedFileSystem,
          path,
          schema: persistedChatWorkspaceClaimSchema,
          value: nextClaim,
        });
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
    [notify, projectId, state],
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
        current.workspace.filesystem.dispose();
        notify();
      });
    },
    [notify, projectId, state],
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
        const settled = await mergeWorkspaceIntoLiveProject({
          base: current.workspace.baseTree,
          live: rootedFileSystem,
          agent: current.workspace.filesystem,
        });
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
        const head = revisionId(`rev:${current.execution.workspaceId}`);
        const authoritativeRunId = input.runId ?? current.runId;
        await revisions.ready;
        const existingRevision = revisions.getRevision(head);
        const revisionInput: Revision = Object.freeze({
          id: head,
          parents: Object.freeze([current.workspace.identity.baseRevisionId]),
          tree: settled.tree,
          provenance: Object.freeze({
            source: 'agent',
            actorId: input.actorId,
            ...(authoritativeRunId === undefined ? {} : { runId: authoritativeRunId }),
            createdAt: existingRevision?.provenance.createdAt ?? Date.now(),
          }),
          summary: Object.freeze({ generated: input.summary }),
        });
        if (existingRevision !== undefined && !sameFinalizationRevision(existingRevision, revisionInput)) {
          throw new Error(`Finalization retry does not match stored revision: ${head}`);
        }
        const storedRevision = existingRevision ?? (await revisions.createRevision(revisionInput));
        const existingHead = revisions.getBranchHead(current.branch);
        const publication: Awaited<ReturnType<RevisionAuthority['updateBranchHead']>> =
          existingHead === storedRevision.id
            ? {
                status: 'updated',
                branch: current.branch,
                previousHead: current.workspace.identity.baseRevisionId,
                head: storedRevision.id,
              }
            : await revisions.updateBranchHead({
                branch: current.branch,
                expectedHead: current.workspace.identity.baseRevisionId,
                head: storedRevision.id,
              });
        const result: FinalizedChatWorkspace = Object.freeze({
          turnId: input.turnId,
          ...(input.parentTurnId === undefined ? {} : { parentTurnId: input.parentTurnId }),
          revisionId: storedRevision.id,
          baseRevisionId: current.workspace.identity.baseRevisionId,
          treeId: storedRevision.id,
          branchName: current.branch,
          publication: persistedPublication({
            publication,
            expectedHead: current.workspace.identity.baseRevisionId,
          }),
          changedPaths: changedPathsBetween(current.workspace.baseTree, storedRevision.tree),
          provenance: storedRevision.provenance,
          generatedSummary: storedRevision.summary.generated,
          chatId,
          jobIds: Object.freeze([...(input.jobIds ?? [])]),
          projectId,
          workspaceId: current.execution.workspaceId,
          nativeGit: ((): PersistedNativeGitStatus => {
            const receipt = revisions.getRevisionPersistence(storedRevision.id);
            return receipt?.type === 'native-git'
              ? { status: 'stored', commitId: receipt.commitId, objectFormat: receipt.objectFormat }
              : { status: 'not-configured' };
          })(),
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
      revisions,
      rootedFileSystem,
      state,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const hydratePublications = async (): Promise<void> => {
      // The bridge client can be transiently absent (and is absent in shallow
      // test mounts); hydration retries on the next state change.
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
    }),
    [
      discard,
      finalize,
      markAdmitted,
      markCancelled,
      markRunId,
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

/** Project-wide authoritative publications produced by chat workspaces. */
export const useFinalizedChatWorkspaces = (): readonly FinalizedChatWorkspace[] => {
  const authority = useChatWorkspaceAuthority();
  return useSyncExternalStore(authority.subscribe, authority.listFinalized, () => emptyFinalizedChatWorkspaces);
};
