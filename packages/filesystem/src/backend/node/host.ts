/**
 * Host half of the node filesystem backend: serves {@link NodeFsProvider}
 * rooted views over one port.
 *
 * Runs in the Electron services utility (or a plain Node peer in tests). The
 * renderer names the root it wants on every request, so `allowRoot` is the
 * trust boundary — without it a compromised renderer could name `/`.
 */

import type { NodeFsPort } from '#backend/node/port.js';
import type { NodeFsRequest, NodeFsResponse, NodeFsWatchEvent } from '#backend/node/protocol.js';
import {
  nodeFsMaxWatchBatch,
  nodeFsProtocolVersion,
  nodeFsRequestSchema,
  parseNodeFsFrame,
} from '#backend/node/protocol.js';
import {
  NodeFsProvider,
  drainNodeFsProviderWatchClosures,
  writeNodeFileCheckedWithAuthority,
  deleteNodeFileCheckedWithAuthority,
} from '#backend/node/provider.js';
import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { PathPolicy } from '#types.js';
import type { RootedFileSystem } from '#rooted-views.js';
import type { CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ResourceQueue } from '#resource-queue.js';
import type { ResourceQueueClaim } from '#resource-queue.js';
import { assertRootedPath, VirtualPathError } from '@taucad/utils/path';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

type AuthorityEntry = {
  readonly identity: string;
  readonly writer: Promise<NodeAuthorityWriter>;
  operations: number;
  idle: PromiseWithResolvers<void> | undefined;
};

type AuthorityConfiguration = Readonly<{
  authorityDirectory(authorityIdentity: string): string;
  authorityIdentity(canonicalRoot: string): string;
}>;

const authorityConfigurations = new WeakMap<NodeFsAuthorityHost, AuthorityConfiguration>();

/** Package-private claim entry point: {@link NodeFsAuthorityHost.run} plus cancellation while queued. */
type AuthorityClaimRunner = <T>(
  input: NodeFsAuthorityOperationInput,
  operation: (writer: NodeAuthorityWriter) => Promise<T>,
  signal: AbortSignal | undefined,
) => Promise<T>;

const authorityClaimRunners = new WeakMap<NodeFsAuthorityHost, AuthorityClaimRunner>();

/** Canonical-root mutation resources held by {@link NodeFsAuthorityHost.run}. @public */
export type NodeFsAuthorityOperationInput = Readonly<{
  root: string;
  paths: readonly string[];
}>;

const isContained = (base: string, target: string): boolean => {
  const relative = path.relative(base, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
};

type CanonicalResource = Readonly<{ collision: string; exact: string }>;

const foldAsciiCase = (value: string): string => value.replaceAll(/[A-Z]/g, (character) => character.toLowerCase());

const isAscii = (value: string): boolean => [...value].every((character) => character < '\u0080');

/** Resolve one resource to exact and conservatively folded physical queue keys. */
const canonicalResource = async (canonicalRoot: string, rootedPath: string): Promise<CanonicalResource> => {
  const canonicalPath = assertRootedPath(rootedPath);
  const target = path.resolve(canonicalRoot, canonicalPath);
  let existing = target;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Ancestors are resolved in order until one exists.
      await lstat(existing);
      break;
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error;
      }
      const parent = path.dirname(existing);
      if (parent === existing) {
        throw error;
      }
      existing = parent;
    }
  }
  const suffix = path.relative(existing, target);
  const physicalAncestor = await realpath(existing);
  const physical = path.resolve(physicalAncestor, suffix);
  if (!isContained(canonicalRoot, physical)) {
    throw new VirtualPathError('PATH_OUTSIDE_ROOT', rootedPath);
  }
  // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
  // ponytail: an absent name has no provider-native physical identity. ASCII
  // case variants share this conservative key on every volume; unresolved
  // non-ASCII names claim their existing ancestor because JavaScript case
  // conversion is not a complete filesystem Unicode collation oracle.
  const possibleAlias = foldAsciiCase(suffix === '' || isAscii(suffix) ? physical : physicalAncestor);
  return { collision: `possible-alias:${possibleAlias}`, exact: physical };
};

const subtreeClaim = (key: string): ResourceQueueClaim => ({
  key,
  descendantPrefix: key.endsWith(path.sep) ? key : `${key}${path.sep}`,
});

const resolveAuthorityRoot = async (
  authority: NodeFsAuthorityHost,
  requestedRoot: string,
  assertLive: () => void,
): Promise<{ canonicalRoot: string; identity: string; authorityRoot: string }> => {
  const configuration = authorityConfigurations.get(authority);
  if (configuration === undefined) {
    throw new Error('Node filesystem authority host is not configured.');
  }
  assertLive();
  const canonicalRoot = await realpath(requestedRoot);
  assertLive();
  const identity = configuration.authorityIdentity(canonicalRoot);
  const authorityRoot = await realpath(configuration.authorityDirectory(identity));
  assertLive();
  if (isContained(canonicalRoot, authorityRoot) || isContained(authorityRoot, canonicalRoot)) {
    throw Object.assign(new Error('Filesystem authority metadata and authored content roots must be disjoint.'), {
      code: 'AUTHORITY_ROOT_OVERLAP',
    });
  }
  return { canonicalRoot, identity, authorityRoot };
};

/** Shared OS writer ownership for every node-filesystem port in one host lifetime. @public */
export class NodeFsAuthorityHost {
  private readonly _entries = new Map<string, AuthorityEntry>();
  private readonly _retirements = new Map<string, Promise<void>>();
  private readonly _mutations = new ResourceQueue();
  private _servers = 0;

  /** @param options - Host-owned metadata placement for each canonical content root. */
  public constructor(options: {
    authorityDirectory(authorityIdentity: string): string;
    authorityIdentity(canonicalRoot: string): string;
  }) {
    authorityConfigurations.set(this, {
      authorityDirectory: options.authorityDirectory,
      authorityIdentity: options.authorityIdentity,
    });
    authorityClaimRunners.set(this, async (input, operation, signal) => this._run(input, operation, signal));
  }

  /** Register one served port. The returned async disposer releases ownership after quiescence. */
  public attach(): () => Promise<void> {
    this._servers += 1;
    let disposal: Promise<void> | undefined;
    // Deliberately non-async: repeated disposal calls must receive the same settlement promise.
    // oxlint-disable-next-line typescript/promise-function-async -- Promise identity makes repeated disposal await the same settlement.
    return () => {
      if (disposal !== undefined) {
        return disposal;
      }
      this._servers -= 1;
      if (this._servers !== 0) {
        disposal = Promise.resolve();
        return disposal;
      }
      const entries = [...this._entries.values()];
      disposal = this._releaseEntries(entries);
      return disposal;
    };
  }

  /** Run one operation while the canonical root's real OS writer and resource claims are held. */
  public async run<T>(
    input: NodeFsAuthorityOperationInput,
    operation: (writer: NodeAuthorityWriter) => Promise<T>,
  ): Promise<T> {
    return this._run(input, operation, undefined);
  }

  private _assertLive(): void {
    if (this._servers === 0) {
      throw Object.assign(new Error('Node filesystem authority host has no attached server.'), {
        code: 'AUTHORITY_HOST_INACTIVE',
      });
    }
  }

  private async _run<T>(
    input: NodeFsAuthorityOperationInput,
    operation: (writer: NodeAuthorityWriter) => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const snapshot = { root: input.root, paths: [...input.paths] };
    const { canonicalRoot, identity, authorityRoot } = await resolveAuthorityRoot(this, snapshot.root, () => {
      this._assertLive();
    });
    await this._retirements.get(identity);
    this._assertLive();
    let entry = this._entries.get(identity);
    if (entry === undefined) {
      entry = {
        identity,
        writer: acquireNodeAuthorityWriter({ authorityRoot }),
        operations: 0,
        idle: undefined,
      };
      this._entries.set(identity, entry);
    }
    if (entry.operations === 0) {
      entry.idle = Promise.withResolvers<void>();
    }
    entry.operations += 1;
    try {
      const writer = await entry.writer;
      const resources = await Promise.all(
        snapshot.paths.map(async (resource) => canonicalResource(canonicalRoot, resource)),
      );
      return await this._mutations.queueForClaims(
        resources.flatMap(({ collision, exact }) => [subtreeClaim(exact), subtreeClaim(collision)]),
        async () => {
          await writer.assertCurrent();
          return operation(writer);
        },
        signal === undefined ? undefined : { signal },
      );
    } finally {
      entry.operations -= 1;
      if (entry.operations === 0) {
        entry.idle?.resolve();
        entry.idle = undefined;
        try {
          await entry.writer;
        } catch {
          if (this._entries.get(identity) === entry) {
            this._entries.delete(identity);
          }
        }
      }
    }
  }

  private async _releaseEntries(entries: AuthorityEntry[]): Promise<void> {
    const retirements: Array<Promise<void>> = [];
    for (const entry of entries) {
      if (this._entries.get(entry.identity) === entry) {
        this._entries.delete(entry.identity);
      }
      const retirement = this._retire(entry);
      retirements.push(retirement);
      this._retirements.set(entry.identity, retirement);
    }
    const settlements = await Promise.allSettled(retirements);
    const failures: Error[] = [];
    for (const settlement of settlements) {
      if (settlement.status === 'rejected') {
        failures.push(
          settlement.reason instanceof Error
            ? settlement.reason
            : new Error('Filesystem authority release failed with a non-Error rejection.'),
        );
      }
    }
    const [failure] = failures;
    if (failures.length === 1 && failure !== undefined) {
      throw failure;
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple filesystem authority writers failed to release.');
    }
  }

  private async _releaseWhenIdle(entry: AuthorityEntry): Promise<void> {
    await entry.idle?.promise;
    let writer: NodeAuthorityWriter;
    try {
      writer = await entry.writer;
    } catch {
      // A rejected acquisition owns no descriptor and must not poison a later attempt.
      return;
    }
    await writer.release();
  }

  private async _retire(entry: AuthorityEntry): Promise<void> {
    await this._releaseWhenIdle(entry);
    this._retirements.delete(entry.identity);
  }
}

/** Options for {@link serveNodeFsProvider}. @public */
export type NodeFsHostOptions = {
  /** Shared host-lifetime authority. Checked writes fail closed when omitted. */
  authority?: NodeFsAuthorityHost;
  /**
   * The reserved layout an ordinary name may not resolve into, forwarded to
   * every provider this host opens (G0-6). Required beside `allowRoot`: a root
   * admitted without it is served with its symlink check skipped, so a checkout
   * symlink reaches `.git` / `.tau` through an ordinary name.
   */
  policy: PathPolicy;
  /**
   * Admission decision for a requested root. Required: it is the only thing
   * standing between a renderer-supplied string and the whole host filesystem.
   */
  allowRoot(root: string): boolean;
};

/** One entry whose observed state differed from what a checked entry operation required. @public */
// oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
export type CheckedEntryConflict = Readonly<{ path: string; actual: Uint8Array<ArrayBuffer> | null | 'directory' }>;

/** Outcome of a checked rename or directory operation. A conflict is returned, never thrown. @public */
export type CheckedEntryResult =
  | Readonly<{ status: 'applied' }>
  | Readonly<{ status: 'conflict'; conflicts: readonly CheckedEntryConflict[] }>;

/**
 * Move one file or directory in one native rename. `preconditions` name the source file (or every regular
 * file below a source directory, which must match the directory's membership exactly) and the destination,
 * `null` when it must be absent. Same-directory and cross-directory moves inside the root are both atomic.
 * A move whose walk passes {@link checkedRenameLimits}' entries, or whose preconditions and observed bytes pass
 * its bytes, is refused with `EXDEV` before anything moves, so `mv` falls back to copying.
 * @public
 */
export type CheckedRename = Readonly<{
  from: string;
  to: string;
  preconditions: readonly FileWritePrecondition[];
  signal?: AbortSignal;
}>;

/**
 * Exactly one directory: create needs an existing parent and an absent path; remove needs an empty directory.
 * @public
 */
export type CheckedDirectory = Readonly<{ path: string; signal?: AbortSignal }>;

/**
 * What one held root claim may do: existing rooted reads, existing checked file writes, and three checked
 * entry operations. No unchecked mutation, watch, dispose, provider, writer or host path leaves the server.
 * `signal` aborts when the run's own signal aborts or the server starts closing. A method's `signal` is
 * checked before its mutation starts; a started mutation completes. Every call re-decides root admission.
 * Calls still in flight when the operation settles are awaited before the claim is released; later calls
 * reject with `AUTHORITY_SCOPE_CLOSED`.
 * @public
 */
export type NodeFsRootScope = Readonly<
  Pick<RootedFileSystem, 'readFile' | 'readdir' | 'stat' | 'exists' | 'writeFileChecked' | 'deleteFileChecked'> & {
    signal: AbortSignal;
    renameChecked(input: CheckedRename): Promise<CheckedEntryResult>;
    mkdirChecked(input: CheckedDirectory): Promise<CheckedEntryResult>;
    rmdirChecked(input: CheckedDirectory): Promise<CheckedEntryResult>;
  }
>;

/**
 * The memory and time bound of one checked rename while the whole-root claim is held (PO-Q7): entries the source
 * walk may visit, preconditions it may name, and bytes it may hold across preconditions and observations.
 * @public
 */
export const checkedRenameLimits = Object.freeze({ entries: 4096, bytes: 64 * 1024 * 1024 });

/**
 * One admitted canonical root, exactly as `realpath` spells it; any other spelling is refused with
 * `AUTHORITY_ROOT_NOT_CANONICAL`. The claim always covers the whole root. `signal` cancels a queued run.
 * @public
 */
export type NodeFsRootRunInput = Readonly<{ root: string; signal?: AbortSignal }>;

/** Run one operation while the root's OS writer and whole-root resource claim are held. @public */
export type NodeFsRootRun = <T>(
  input: NodeFsRootRunInput,
  operation: (scope: NodeFsRootScope) => Promise<T>,
) => Promise<T>;

/** The served node filesystem: its root claims for trusted composition, and its one disposer. @public */
export type NodeFsServer = Readonly<{
  /**
   * Hold one admitted root's whole-root claim for an in-process operation. Trusted host composition only:
   * a mutation of the same root through a wire client awaited inside `operation` waits on this claim forever.
   */
  run: NodeFsRootRun;
  /** Stop serving, abort open scopes' signals, wait for accepted work, release the authority. */
  close(): Promise<void>;
}>;

const codedError = (message: string, code: string): Error => Object.assign(new Error(message), { code });

const scopeClosedError = (): Error =>
  codedError(
    'This filesystem scope ended when its operation settled. Call run again to hold a new claim.',
    'AUTHORITY_SCOPE_CLOSED',
  );

const serverInactiveError = (): Error =>
  codedError('Node filesystem server is no longer accepting requests.', 'AUTHORITY_HOST_INACTIVE');

/** Live flag of the operation whose async context a call runs in, and its server; cleared when it settles. */
const heldClaims = new AsyncLocalStorage<{ live: boolean; server: AbortController }>();

const bytesOf = (value: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const errnoCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | undefined)?.code;

const isDescendant = (ancestor: string, candidate: string): boolean =>
  ancestor === '' ? candidate !== '' : candidate.startsWith(`${ancestor}/`);

const parentOf = (rootedPath: string): string => {
  const separator = rootedPath.lastIndexOf('/');
  return separator === -1 ? '' : rootedPath.slice(0, separator);
};

// oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
type EntryState = CheckedEntryConflict['actual'];

// Observe one entry through the admitted provider: bytes, absence, or a directory.
const observeEntry = async (provider: NodeFsProvider, rootedPath: string): Promise<EntryState> => {
  let stats: Awaited<ReturnType<NodeFsProvider['stat']>>;
  try {
    stats = await provider.stat(rootedPath);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT' || errnoCode(error) === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
  return stats.type === 'dir' ? 'directory' : provider.readFile(rootedPath);
};

type ExpectedState = Exclude<EntryState, 'directory'>;

const matches = (actual: EntryState, expected: ExpectedState): boolean =>
  actual === null ? expected === null : actual !== 'directory' && expected !== null && sameBytes(actual, expected);

const renameTooLarge = (from: string): Error =>
  Object.assign(
    codedError(
      `EXDEV: rename '${from}' exceeds the checked rename bound of ${String(checkedRenameLimits.entries)} entries or ${String(checkedRenameLimits.bytes)} bytes`,
      'EXDEV',
    ),
    { applicationState: 'known-not-applied' },
  );

/** Bytes a checked rename may still hold; exceeding it refuses the whole rename before anything moves. */
type RenameBudget = { bytes: number; readonly from: string };

const spend = (budget: RenameBudget, bytes: number): void => {
  budget.bytes -= bytes;
  if (budget.bytes < 0) {
    throw renameTooLarge(budget.from);
  }
};

// Observe one entry, refusing before a read that would pass the rename's byte budget.
const observeBounded = async (
  provider: NodeFsProvider,
  rootedPath: string,
  budget: RenameBudget,
): Promise<EntryState> => {
  let stats: Awaited<ReturnType<NodeFsProvider['stat']>>;
  try {
    stats = await provider.stat(rootedPath);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT' || errnoCode(error) === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
  if (stats.type === 'dir') {
    return 'directory';
  }
  spend(budget, stats.size);
  const bytes = await provider.readFile(rootedPath);
  // A file that grew between stat and read is charged for what was read.
  spend(budget, Math.max(0, bytes.byteLength - stats.size));
  return bytes;
};

// Every regular file below one directory, by root-relative path, visiting at most the entry bound.
const regularFilesBelow = async (
  provider: NodeFsProvider,
  directory: string,
  signal: AbortSignal | undefined,
): Promise<string[]> => {
  const files: string[] = [];
  const pending = [directory];
  let visited = 0;
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    // A close or cancellation stops the walk between directories, so it never holds the writer unbounded.
    signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- One directory at a time keeps the walk's memory bounded.
    const entries = await provider.readdirEntries(next);
    visited += entries.length;
    if (visited > checkedRenameLimits.entries) {
      throw renameTooLarge(directory);
    }
    for (const entry of entries) {
      const child = next === '' ? entry.name : `${next}/${entry.name}`;
      if (entry.kind === 'dir') {
        pending.push(child);
      } else {
        files.push(child);
      }
    }
  }
  return files;
};

// Canonical expected state per path; two preconditions for one path must agree.
const expectationsOf = (
  preconditions: readonly FileWritePrecondition[],
  operation: string,
): Map<string, ExpectedState> => {
  const expected = new Map<string, ExpectedState>();
  for (const precondition of preconditions) {
    assertRootedPath(precondition.path);
    const bytes = precondition.expected === null ? null : bytesOf(precondition.expected);
    const previous = expected.get(precondition.path);
    if (
      expected.has(precondition.path) &&
      (previous === null ? bytes !== null : bytes === null || !sameBytes(previous!, bytes))
    ) {
      throw new TypeError(`Checked ${operation} aliases disagree for '${precondition.path}'.`);
    }
    expected.set(precondition.path, bytes);
  }
  return expected;
};

// Mark an error thrown once a provider mutation began; recovery must re-observe.
const potentiallyApplied = (error: unknown): never => {
  if (error instanceof Error && (error as { applicationState?: unknown }).applicationState === undefined) {
    Object.assign(error, { applicationState: 'potentially-applied' });
  }
  throw error;
};

const renameChecked = async (
  provider: NodeFsProvider,
  writer: NodeAuthorityWriter,
  input: CheckedRename,
): Promise<CheckedEntryResult> => {
  input.signal?.throwIfAborted();
  assertRootedPath(input.from);
  assertRootedPath(input.to);
  if (input.from === '' || input.to === '' || isDescendant(input.from, input.to)) {
    throw codedError(`EINVAL: invalid argument, rename '${input.from}' -> '${input.to}'`, 'EINVAL');
  }
  if (input.preconditions.length > checkedRenameLimits.entries + 1) {
    throw renameTooLarge(input.from);
  }
  const expected = expectationsOf(input.preconditions, 'rename');
  if (!expected.has(input.to)) {
    throw new TypeError('Checked renames require a destination precondition.');
  }
  const budget: RenameBudget = { bytes: checkedRenameLimits.bytes, from: input.from };
  for (const bytes of expected.values()) {
    spend(budget, bytes?.byteLength ?? 0);
  }
  await writer.assertCurrent();
  const source = await observeEntry(provider, input.from);
  const conflicts: CheckedEntryConflict[] = [];
  if (source === 'directory') {
    if (expected.has(input.from)) {
      conflicts.push({ path: input.from, actual: 'directory' });
    }
    // Membership: every regular file below the source is named, and nothing named is missing.
    for (const file of await regularFilesBelow(provider, input.from, input.signal)) {
      if (!expected.has(file)) {
        // oxlint-disable-next-line no-await-in-loop -- Conflicts report current bytes in a stable order.
        conflicts.push({ path: file, actual: await observeBounded(provider, file, budget) });
      }
    }
  } else if (!expected.has(input.from)) {
    throw new TypeError('Checked renames require a source precondition.');
  }
  const observed = await Promise.all(
    [...expected].map(async ([candidate, bytes]) => ({
      candidate,
      bytes,
      actual: await observeBounded(provider, candidate, budget),
    })),
  );
  for (const { candidate, bytes, actual } of observed) {
    if (!matches(actual, bytes)) {
      conflicts.push({ path: candidate, actual });
    }
  }
  if (conflicts.length > 0) {
    return { status: 'conflict', conflicts };
  }
  input.signal?.throwIfAborted();
  await writer.assertCurrent();
  try {
    await provider.rename(input.from, input.to);
  } catch (error) {
    potentiallyApplied(error);
  }
  return { status: 'applied' };
};

const mkdirChecked = async (
  provider: NodeFsProvider,
  writer: NodeAuthorityWriter,
  input: CheckedDirectory,
): Promise<CheckedEntryResult> => {
  input.signal?.throwIfAborted();
  assertRootedPath(input.path);
  await writer.assertCurrent();
  const current = await observeEntry(provider, input.path);
  if (current !== null) {
    return { status: 'conflict', conflicts: [{ path: input.path, actual: current }] };
  }
  const parent = parentOf(input.path);
  const parentState = await observeEntry(provider, parent);
  if (parentState !== 'directory') {
    return { status: 'conflict', conflicts: [{ path: parent, actual: parentState }] };
  }
  input.signal?.throwIfAborted();
  await writer.assertCurrent();
  try {
    await provider.mkdir(input.path);
  } catch (error) {
    potentiallyApplied(error);
  }
  return { status: 'applied' };
};

const rmdirChecked = async (
  provider: NodeFsProvider,
  writer: NodeAuthorityWriter,
  input: CheckedDirectory,
): Promise<CheckedEntryResult> => {
  input.signal?.throwIfAborted();
  assertRootedPath(input.path);
  if (input.path === '') {
    throw codedError("EINVAL: invalid argument, rmdir ''", 'EINVAL');
  }
  await writer.assertCurrent();
  const current = await observeEntry(provider, input.path);
  if (current !== 'directory') {
    return { status: 'conflict', conflicts: [{ path: input.path, actual: current }] };
  }
  const children = await provider.readdir(input.path);
  if (children.length > 0) {
    const conflicts = await Promise.all(
      children.map(async (name) => {
        const child = `${input.path}/${name}`;
        return { path: child, actual: await observeEntry(provider, child) };
      }),
    );
    return { status: 'conflict', conflicts };
  }
  input.signal?.throwIfAborted();
  await writer.assertCurrent();
  try {
    await provider.rmdir(input.path);
  } catch (error) {
    potentiallyApplied(error);
  }
  return { status: 'applied' };
};

const errorFrame = (id: number, error: unknown): NodeFsResponse => ({
  v: nodeFsProtocolVersion,
  id,
  type: 'error',
  message: error instanceof Error ? error.message : String(error),
  ...((error as NodeJS.ErrnoException | undefined)?.code === undefined
    ? {}
    : { code: (error as NodeJS.ErrnoException).code }),
  ...((error as { applicationState?: unknown } | undefined)?.applicationState === 'known-not-applied' ||
  (error as { applicationState?: unknown } | undefined)?.applicationState === 'potentially-applied'
    ? {
        applicationState: (error as { applicationState: 'known-not-applied' | 'potentially-applied' }).applicationState,
      }
    : {}),
});

const runOperation = async (
  provider: NodeFsProvider,
  request: NodeFsRequest,
  authority?: NodeFsAuthorityHost,
): Promise<unknown> => {
  const mutate = async <T>(root: string, paths: readonly string[], operation: () => Promise<T>): Promise<T> =>
    authority === undefined ? operation() : authority.run({ root, paths }, async () => operation());
  switch (request.op) {
    case 'readFile': {
      return provider.readFile(request.path);
    }
    case 'readFileRange': {
      // At most one chunk of the provider's own bounded stream: `length` never exceeds its chunk size.
      const bytes = new Uint8Array(request.length);
      let filled = 0;
      for await (const chunk of provider.readFileStream(request.path, {
        position: request.position,
        length: request.length,
      })) {
        bytes.set(chunk, filled);
        filled += chunk.byteLength;
      }
      return bytes.slice(0, filled);
    }
    case 'writeFile': {
      const data = typeof request.data === 'string' ? request.data : new Uint8Array(request.data);
      return mutate(request.root, [request.path], async () => provider.writeFile(request.path, data));
    }
    case 'writeFileChecked': {
      if (authority === undefined) {
        throw Object.assign(new Error('Checked writes require a node filesystem authority owner.'), {
          code: 'CHECKED_WRITE_UNSUPPORTED',
          applicationState: 'known-not-applied',
        });
      }
      const input = {
        ...request,
        data: typeof request.data === 'string' ? request.data : new Uint8Array(request.data),
        preconditions: request.preconditions.map((precondition) => ({
          ...precondition,
          expected:
            precondition.expected === null || typeof precondition.expected === 'string'
              ? precondition.expected
              : new Uint8Array(precondition.expected),
        })),
      };
      const state = { providerInvoked: false };
      try {
        return await authority.run(
          { root: request.root, paths: input.preconditions.map(({ path }) => path) },
          async (writer) => {
            state.providerInvoked = true;
            return writeNodeFileCheckedWithAuthority(provider, input, writer);
          },
        );
      } catch (error) {
        if ((error as { applicationState?: unknown }).applicationState === undefined) {
          Object.assign(error as Record<string, unknown>, {
            applicationState: state.providerInvoked ? 'potentially-applied' : 'known-not-applied',
          });
        }
        throw error;
      }
    }
    case 'deleteFileChecked': {
      if (authority === undefined) {
        throw Object.assign(new Error('Checked deletes require a node filesystem authority owner.'), {
          code: 'CHECKED_WRITE_UNSUPPORTED',
          applicationState: 'known-not-applied',
        });
      }
      const input = {
        ...request,
        preconditions: request.preconditions.map((precondition) => ({
          ...precondition,
          expected:
            precondition.expected === null || typeof precondition.expected === 'string'
              ? precondition.expected
              : new Uint8Array(precondition.expected),
        })),
      };
      const state = { providerInvoked: false };
      try {
        return await authority.run(
          { root: request.root, paths: input.preconditions.map(({ path }) => path) },
          async (writer) => {
            state.providerInvoked = true;
            return deleteNodeFileCheckedWithAuthority(provider, input, writer);
          },
        );
      } catch (error) {
        if ((error as { applicationState?: unknown }).applicationState === undefined) {
          Object.assign(error as Record<string, unknown>, {
            applicationState: state.providerInvoked ? 'potentially-applied' : 'known-not-applied',
          });
        }
        throw error;
      }
    }
    case 'hashFiles': {
      return provider.hashFiles(request.paths);
    }
    case 'readdir': {
      return provider.readdir(request.path);
    }
    case 'readdirEntries': {
      return provider.readdirEntries(request.path);
    }
    case 'readdirWithStats': {
      return provider.readdirWithStats(request.path);
    }
    case 'readdirHeadWithStats': {
      return provider.readdirWithStats(request.path, { content: 'head' });
    }
    case 'headStat': {
      return provider.stat(request.path, { content: 'head' });
    }
    case 'stat': {
      return provider.stat(request.path);
    }
    case 'getFileMode': {
      return provider.getFileMode(request.path);
    }
    case 'setFileMode': {
      return provider.setFileMode(request.path, request.mode);
    }
    case 'mkdir': {
      return mutate(request.root, [request.path], async () => provider.mkdir(request.path));
    }
    case 'unlink': {
      return mutate(request.root, [request.path], async () => provider.unlink(request.path));
    }
    case 'rmdir': {
      return mutate(request.root, [request.path], async () => provider.rmdir(request.path));
    }
    case 'rename': {
      return mutate(request.root, [request.from, request.to], async () => provider.rename(request.from, request.to));
    }
    default: {
      throw new Error(`Unhandled node filesystem operation: ${request.op}`);
    }
  }
};

/**
 * Serve node filesystem requests arriving on `port` until the returned
 * server closes.
 *
 * @param port - Transport to the renderer's file-manager worker.
 * @param options - Root admission policy.
 * @returns The server: `run` holds one admitted root's claim for trusted in-process composition, and `close`
 * drops every provider and watch subscription after accepted work settles.
 * @public
 */
export function serveNodeFsProvider(port: NodeFsPort, options: NodeFsHostOptions): NodeFsServer {
  const providers = new Map<string, NodeFsProvider>();
  const subscriptions = new Map<number, () => void>();
  const pendingSubscriptions = new Map<number, { cancelled: boolean }>();
  const operations = new Set<Promise<void>>();
  let disposed = false;
  const closing = new AbortController();
  const detachAuthority = options.authority?.attach();

  const send = (response: NodeFsResponse): void => {
    if (!disposed) {
      try {
        port.postMessage(response);
      } catch (error) {
        port.close?.();
        throw error;
      }
    }
  };

  const providerFor = async (root: string): Promise<NodeFsProvider> => {
    // Admission is re-decided per request, before the cache: caching it would
    // make a narrowed allowlist (a workspace disconnected while the port stays
    // open) invisible for the life of the connection. One predicate call.
    if (!options.allowRoot(root)) {
      throw Object.assign(new Error(`Refusing to serve an unadmitted filesystem root: ${root}`), { code: 'EACCES' });
    }
    if (options.authority !== undefined) {
      await resolveAuthorityRoot(options.authority, root, () => {
        if (disposed) {
          throw Object.assign(new Error('Node filesystem server is no longer accepting requests.'), {
            code: 'AUTHORITY_HOST_INACTIVE',
          });
        }
      });
    }
    const existing = providers.get(root);
    if (existing) {
      return existing;
    }
    const provider = new NodeFsProvider(root, { policy: options.policy });
    providers.set(root, provider);
    return provider;
  };

  const listener = (event: { data: unknown }): void => {
    let request: NodeFsRequest;
    try {
      request = parseNodeFsFrame(nodeFsRequestSchema, event.data);
    } catch (error) {
      const id = (event.data as { id?: unknown } | undefined)?.id;
      if (typeof id === 'number') {
        send(errorFrame(id, error));
      }
      return;
    }

    if (request.op === 'unwatch') {
      const pending = pendingSubscriptions.get(request.id);
      if (pending !== undefined) {
        pending.cancelled = true;
        pendingSubscriptions.delete(request.id);
      }
      const unsubscribe = subscriptions.get(request.id);
      subscriptions.delete(request.id);
      unsubscribe?.();
      return;
    }

    if (request.op === 'watch') {
      const previousPending = pendingSubscriptions.get(request.id);
      if (previousPending !== undefined) {
        previousPending.cancelled = true;
      }
      const unsubscribe = subscriptions.get(request.id);
      subscriptions.delete(request.id);
      unsubscribe?.();
      const pending = { cancelled: false };
      pendingSubscriptions.set(request.id, pending);
      const operation = (async () => {
        let response: NodeFsResponse;
        try {
          const provider = await providerFor(request.root);
          if (!pending.cancelled && pendingSubscriptions.get(request.id) === pending) {
            const active = { unsubscribe: undefined as (() => void) | undefined };
            const isCurrent = (): boolean =>
              !pending.cancelled &&
              !disposed &&
              (pendingSubscriptions.get(request.id) === pending ||
                (active.unsubscribe !== undefined && subscriptions.get(request.id) === active.unsubscribe));
            /* Everything one native callback reports, in order, as one frame: the provider emits synchronously, so
             * the batch closes by the next microtask. */
            let batch: NodeFsWatchEvent[] | undefined;
            const flush = (): void => {
              const events = batch;
              batch = undefined;
              if (events !== undefined && isCurrent()) {
                send({ v: nodeFsProtocolVersion, id: request.id, type: 'watch', events });
              }
            };
            const unsubscribe = await provider.watch(request.request, (watchEvent) => {
              if (!isCurrent()) {
                return;
              }
              if (batch === undefined) {
                batch = [];
                queueMicrotask(flush);
              }
              batch.push(watchEvent);
              if (batch.length >= nodeFsMaxWatchBatch) {
                flush();
              }
            });
            active.unsubscribe = unsubscribe;
            if (isCurrent()) {
              subscriptions.set(request.id, unsubscribe);
            } else {
              unsubscribe();
            }
          }
          response =
            pending.cancelled || pendingSubscriptions.get(request.id) !== pending || disposed
              ? errorFrame(request.id, new Error('Node filesystem watch was cancelled before admission.'))
              : { v: nodeFsProtocolVersion, id: request.id, type: 'result', value: undefined };
        } catch (error) {
          response = errorFrame(request.id, error);
        } finally {
          if (pendingSubscriptions.get(request.id) === pending) {
            pendingSubscriptions.delete(request.id);
          }
        }
        send(response);
      })();
      operations.add(operation);
      const forgetSettledWatch = async (): Promise<void> => {
        await operation.catch(() => undefined);
        operations.delete(operation);
      };
      // async-iife: bootstrap -- the pending watch admission is retained and awaited by the async disposer.
      void forgetSettledWatch();
      return;
    }

    // async-iife: bootstrap — a port listener cannot be async; every outcome is a reply frame.
    const operation = (async () => {
      let response: NodeFsResponse;
      try {
        response = {
          v: nodeFsProtocolVersion,
          id: request.id,
          type: 'result',
          value: await runOperation(await providerFor(request.root), request, options.authority),
        };
      } catch (error) {
        if (
          (request.op === 'writeFileChecked' || request.op === 'deleteFileChecked') &&
          (error as { applicationState?: unknown }).applicationState === undefined
        ) {
          Object.assign(error as Record<string, unknown>, { applicationState: 'known-not-applied' });
        }
        response = errorFrame(request.id, error);
      }
      send(response);
    })();
    operations.add(operation);
    const forgetSettledOperation = async (): Promise<void> => {
      await operation.catch(() => undefined);
      operations.delete(operation);
    };
    // async-iife: bootstrap -- the operation is retained in `operations` and awaited by the async disposer.
    void forgetSettledOperation();
  };

  port.addEventListener('message', listener);
  port.start?.();

  const track = (work: Promise<unknown>): void => {
    const settled = (async (): Promise<void> => {
      try {
        await work;
      } catch {
        // The caller of `run` receives the rejection; `close` only waits for settlement.
      }
    })();
    operations.add(settled);
    const forget = async (): Promise<void> => {
      await settled;
      operations.delete(settled);
    };
    // async-iife: bootstrap -- the claim is retained in `operations` and awaited by `close`.
    void forget();
  };

  const scopeFor = ({
    root,
    provider,
    writer,
    signal,
  }: Readonly<{
    root: string;
    provider: NodeFsProvider;
    writer: NodeAuthorityWriter;
    signal: AbortSignal;
  }>): { scope: NodeFsRootScope; settle(): Promise<void> } => {
    let open = true;
    const inFlight = new Set<Promise<unknown>>();
    const call = async <T>(work: () => Promise<T>): Promise<T> => {
      if (!open) {
        throw scopeClosedError();
      }
      // Admission is re-decided on every call, so a root narrowed mid-operation stops it here.
      if (!options.allowRoot(root)) {
        throw codedError(`Refusing to serve an unadmitted filesystem root: ${root}`, 'EACCES');
      }
      const pending = work();
      inFlight.add(pending);
      try {
        return await pending;
      } finally {
        inFlight.delete(pending);
      }
    };
    // A mutation starts only while the scope's signal is live; one already started completes.
    const mutate = async <T>(methodSignal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> =>
      call(async () => {
        signal.throwIfAborted();
        methodSignal?.throwIfAborted();
        return work();
      });
    const scope: NodeFsRootScope = {
      signal,
      // oxlint-disable-next-line typescript/promise-function-async -- Overloads forward to the provider's own.
      readFile: ((rootedPath: string, encoding?: 'utf8') =>
        call(async () =>
          encoding === undefined ? provider.readFile(rootedPath) : provider.readFile(rootedPath, encoding),
        )) as NodeFsRootScope['readFile'],
      readdir: async (rootedPath) => call(async () => provider.readdir(rootedPath)),
      // oxlint-disable-next-line typescript/promise-function-async -- Overloads forward to the provider's own.
      stat: ((rootedPath: string, statOptions?: Parameters<NodeFsProvider['stat']>[1]) =>
        call(async () =>
          statOptions === undefined ? provider.stat(rootedPath) : provider.stat(rootedPath, statOptions),
        )) as NodeFsRootScope['stat'],
      exists: async (rootedPath) => call(async () => provider.exists(rootedPath)),
      writeFileChecked: async ({ signal: writeSignal, ...input }): Promise<CheckedFileWriteResult> =>
        mutate(writeSignal, async () => writeNodeFileCheckedWithAuthority(provider, input, writer)),
      deleteFileChecked: async ({ signal: deleteSignal, ...input }): Promise<CheckedFileWriteResult> =>
        mutate(deleteSignal, async () => deleteNodeFileCheckedWithAuthority(provider, input, writer)),
      // The rename's walk also stops on the scope signal, so closing never waits on an unbounded move.
      renameChecked: async (input) =>
        mutate(input.signal, async () =>
          renameChecked(provider, writer, {
            ...input,
            signal: input.signal === undefined ? signal : AbortSignal.any([signal, input.signal]),
          }),
        ),
      mkdirChecked: async (input) => mutate(input.signal, async () => mkdirChecked(provider, writer, input)),
      rmdirChecked: async (input) => mutate(input.signal, async () => rmdirChecked(provider, writer, input)),
    };
    return {
      scope,
      settle: async () => {
        open = false;
        // Nothing joins after `open` is cleared, so one settlement covers every accepted call.
        await Promise.allSettled(inFlight);
      },
    };
  };

  const run: NodeFsRootRun = async (input, operation) => {
    if (heldClaims.getStore()?.live === true) {
      throw codedError(
        'A filesystem root claim is already held by this operation. Use its scope instead of calling run again.',
        'AUTHORITY_CLAIM_NESTED',
      );
    }
    const { authority } = options;
    if (authority === undefined) {
      throw codedError(
        'Filesystem root claims require a node filesystem authority owner. Compose this server with a NodeFsAuthorityHost.',
        'AUTHORITY_CLAIM_UNSUPPORTED',
      );
    }
    if (disposed) {
      throw serverInactiveError();
    }
    input.signal?.throwIfAborted();
    const { root } = input;
    const signal = input.signal === undefined ? closing.signal : AbortSignal.any([closing.signal, input.signal]);
    const claimed = (async () => {
      // The claim and writer bind the canonical root, so the provider must resolve through that same spelling.
      if ((await realpath(root)) !== root) {
        throw codedError(
          `Filesystem root claims require the canonical root spelling; '${root}' is not it.`,
          'AUTHORITY_ROOT_NOT_CANONICAL',
        );
      }
      const provider = await providerFor(root);
      return authorityClaimRunners.get(authority)!(
        { root, paths: [''] },
        async (writer) => {
          const held = scopeFor({ root, provider, writer, signal });
          const context = { live: true, server: closing };
          try {
            return await heldClaims.run(context, async () => operation(held.scope));
          } finally {
            context.live = false;
            await held.settle();
          }
        },
        signal,
      );
    })();
    track(claimed);
    return claimed;
  };

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    port.removeEventListener?.('message', listener);
    disposed = true;
    closing.abort(serverInactiveError());
    for (const pending of pendingSubscriptions.values()) {
      pending.cancelled = true;
    }
    pendingSubscriptions.clear();
    await Promise.allSettled(operations);
    const failures: unknown[] = [];
    for (const unsubscribe of subscriptions.values()) {
      try {
        unsubscribe();
      } catch (error) {
        failures.push(error);
      }
    }
    subscriptions.clear();
    for (const provider of providers.values()) {
      try {
        provider.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    const closureResults = await Promise.allSettled(
      [...providers.values()].map(async (provider) => drainNodeFsProviderWatchClosures(provider)),
    );
    for (const result of closureResults) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
      }
    }
    providers.clear();
    try {
      await detachAuthority?.();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple node filesystem resources failed to dispose.');
    }
  };
  let disposal: Promise<void> | undefined;
  return {
    run,
    // Deliberately non-async: repeated close calls must receive the same settlement promise.
    // oxlint-disable-next-line typescript/promise-function-async -- Promise identity exposes one quiescence result.
    close: () => {
      // Closing waits for every run, including the caller's own, so a close inside a run could never settle.
      const held = heldClaims.getStore();
      if (held?.live === true && held.server === closing) {
        return Promise.reject(
          codedError(
            'This filesystem server cannot close from inside one of its own root claims. Close it after the run settles.',
            'AUTHORITY_CLOSE_IN_CLAIM',
          ),
        );
      }
      disposal ??= dispose();
      return disposal;
    },
  };
}
