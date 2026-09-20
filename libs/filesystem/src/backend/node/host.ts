/**
 * Host half of the node filesystem backend: serves {@link NodeFsProvider}
 * rooted views over one port.
 *
 * Runs in the Electron services utility (or a plain Node peer in tests). The
 * renderer names the root it wants on every request, so `allowRoot` is the
 * trust boundary — without it a compromised renderer could name `/`.
 */

import type { NodeFsPort } from '#backend/node/port.js';
import type { NodeFsRequest, NodeFsResponse } from '#backend/node/protocol.js';
import { nodeFsProtocolVersion, nodeFsRequestSchema, parseNodeFsFrame } from '#backend/node/protocol.js';
import { NodeFsProvider, writeNodeFileCheckedWithAuthority } from '#backend/node/provider.js';
import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { PathPolicy } from '#types.js';
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
      const resources = await Promise.all(
        snapshot.paths.map(async (resource) => canonicalResource(canonicalRoot, resource)),
      );
      return await this._mutations.queueForClaims(
        resources.flatMap(({ collision, exact }) => [subtreeClaim(exact), subtreeClaim(collision)]),
        async () => {
          const writer = await entry.writer;
          await writer.assertCurrent();
          return operation(writer);
        },
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

  private _assertLive(): void {
    if (this._servers === 0) {
      throw Object.assign(new Error('Node filesystem authority host has no attached server.'), {
        code: 'AUTHORITY_HOST_INACTIVE',
      });
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
   * every provider this host opens (G0-6). A host that serves a checkout which
   * can hold symlinks passes its policy; see {@link NodeFsProvider}.
   */
  policy?: PathPolicy;
  /**
   * Admission decision for a requested root. Required: it is the only thing
   * standing between a renderer-supplied string and the whole host filesystem.
   */
  allowRoot(root: string): boolean;
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
    case 'readdir': {
      return provider.readdir(request.path);
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
 * disposer runs.
 *
 * @param port - Transport to the renderer's file-manager worker.
 * @param options - Root admission policy.
 * @returns Disposer that drops every provider and watch subscription.
 * @public
 */
export function serveNodeFsProvider(port: NodeFsPort, options: NodeFsHostOptions): () => Promise<void> {
  const providers = new Map<string, NodeFsProvider>();
  const subscriptions = new Map<number, () => void>();
  const pendingSubscriptions = new Map<number, { cancelled: boolean }>();
  const operations = new Set<Promise<void>>();
  let disposed = false;
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
            const unsubscribe = provider.watch(request.request, (watchEvent) => {
              send({ v: nodeFsProtocolVersion, id: request.id, type: 'watch', event: watchEvent });
            });
            subscriptions.set(request.id, unsubscribe);
          }
          response = { v: nodeFsProtocolVersion, id: request.id, type: 'result', value: undefined };
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
          request.op === 'writeFileChecked' &&
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

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    port.removeEventListener?.('message', listener);
    for (const pending of pendingSubscriptions.values()) {
      pending.cancelled = true;
    }
    pendingSubscriptions.clear();
    await Promise.allSettled(operations);
    disposed = true;
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
  // Deliberately non-async: repeated disposal calls must receive the same settlement promise.
  // oxlint-disable-next-line typescript/promise-function-async -- Promise identity exposes one quiescence result.
  return () => {
    disposal ??= dispose();
    return disposal;
  };
}
