import { z } from 'zod';
import { CacheCorruptionError, actionDigest, contentDigest, digestContent } from '@taucad/cache-core';
import type {
  ActionDigest,
  ActionStore,
  CacheMaintenance,
  CacheStoreStatistics,
  ComputeActionRecord,
  ContentDigest,
  ContentStore,
} from '@taucad/cache-core';
import { randomUuid } from '@taucad/utils/id';
import { sha256String } from '@taucad/utils/hash';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';

const cacheRoot = '.tau/cache/compute/v1';
const contentRoot = `${cacheRoot}/blobs/sha256`;
const actionRoot = `${cacheRoot}/actions/sha256`;
const referencesRoot = `${cacheRoot}/refs`;
const indexRoot = `${referencesRoot}/compute-session/sha256`;
const leasesRoot = `${cacheRoot}/leases`;
const gcStatePath = `${cacheRoot}/gc/state.json`;
const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const mutationTails = new WeakMap<KernelFileSystem, Promise<void>>();

const validDigest = /^sha256:[0-9a-f]{64}$/u;
const actionDigestSchema = z.custom<ActionDigest>((value) => typeof value === 'string' && validDigest.test(value));
const contentDigestSchema = z.custom<ContentDigest>((value) => typeof value === 'string' && validDigest.test(value));
const actionRecordSchema: z.ZodType<ComputeActionRecord> = z
  .object({
    schemaVersion: z.literal(1),
    actionDigest: actionDigestSchema,
    codec: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
    output: z
      .object({
        digest: contentDigestSchema,
        size: z.number().int().nonnegative(),
        mediaType: z.string().min(1),
      })
      .strict(),
    dependencies: z.array(actionDigestSchema).readonly(),
  })
  .strict();
const projectComputeIndexSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z
      .array(
        z
          .object({
            canonicalAction: z.string().min(1),
            actionDigest: actionDigestSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();
const projectComputeRefSchema = z
  .object({
    schemaVersion: z.literal(1),
    actionDigests: z.array(actionDigestSchema).readonly(),
    contentDigests: z.array(contentDigestSchema).readonly(),
  })
  .strict();
const projectComputeLeaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['action', 'content']),
    digest: z.union([actionDigestSchema, contentDigestSchema]),
    expiresAt: z.number().int().nonnegative(),
  })
  .strict();
const projectComputeGcStateSchema = z.discriminatedUnion('phase', [
  z
    .object({
      schemaVersion: z.literal(1),
      phase: z.enum(['marking', 'sweeping']),
      runId: z.uuid(),
      startedAt: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      phase: z.literal('idle'),
      lastCompletedAt: z.number().int().nonnegative(),
      removedActions: z.number().int().nonnegative(),
      removedContent: z.number().int().nonnegative(),
      reclaimedBytes: z.number().int().nonnegative(),
    })
    .strict(),
]);

type StoreCounters = {
  hits: number;
  misses: number;
};

/** Bounds for one project-local compute cache. @internal */
export type ProjectComputeStoreOptions = {
  readonly maxContentBytes?: number;
  readonly maxActionBytes?: number;
  readonly maxEntryBytes?: number;
};

/** Reachability, lease, and collection controls for one project-local compute cache. @internal */
export type ProjectComputeLifecycle = {
  readonly readRef: (input: {
    readonly scope: string;
    readonly name: string;
    readonly signal?: AbortSignal;
  }) => Promise<
    | {
        readonly actionDigests: readonly ActionDigest[];
        readonly contentDigests: readonly ContentDigest[];
      }
    | undefined
  >;
  readonly writeRef: (input: {
    readonly scope: string;
    readonly name: string;
    readonly actionDigests: readonly ActionDigest[];
    readonly contentDigests: readonly ContentDigest[];
    readonly signal?: AbortSignal;
  }) => Promise<void>;
  readonly removeRef: (input: {
    readonly scope: string;
    readonly name: string;
    readonly signal?: AbortSignal;
  }) => Promise<void>;
  readonly renewLease: (input: {
    readonly sessionId: string;
    readonly actionDigests: readonly ActionDigest[];
    readonly contentDigests: readonly ContentDigest[];
    /** Unix epoch time in milliseconds. */
    readonly expiresAt: number;
    readonly signal?: AbortSignal;
  }) => Promise<void>;
  readonly releaseLease: (input: { readonly sessionId: string; readonly signal?: AbortSignal }) => Promise<void>;
  readonly collect: (input: {
    /** Unix epoch time in milliseconds. */
    readonly now?: number;
    /** Milliseconds an unreachable file must age before collection. */
    readonly gracePeriod?: number;
    readonly signal?: AbortSignal;
  }) => Promise<{
    readonly status: 'collected';
    readonly removedActions: number;
    readonly removedContent: number;
    readonly reclaimedBytes: number;
  }>;
  readonly inspect: (input: { readonly signal?: AbortSignal }) => Promise<{
    readonly status: 'supported';
    readonly content: { readonly entries: number; readonly bytes: number };
    readonly actions: { readonly entries: number; readonly bytes: number };
    readonly refs: number;
    readonly leases: number;
  }>;
  readonly clear: (input: { readonly signal?: AbortSignal }) => Promise<{ readonly status: 'cleared' }>;
};

/** Project-local stores sharing one rooted runtime filesystem authority. @internal */
export type ProjectComputeStores = {
  readonly contentStore: ContentStore;
  readonly actionStore: ActionStore;
  readonly lifecycle: ProjectComputeLifecycle;
};

/** Durable discovery entry; semantic validity still comes from the exact action digest. @internal */
export type ProjectComputeIndexEntry = z.infer<typeof projectComputeIndexSchema>['entries'][number];

const assertBound = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
};

const assertOpaqueId = (value: string, name: string): string => {
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${name} must be non-empty, well-formed Unicode.`);
  }
  return value;
};

const withFilesystemMutation = async <T>(filesystem: KernelFileSystem, operation: () => Promise<T>): Promise<T> => {
  const previous = mutationTails.get(filesystem) ?? Promise.resolve();
  const gate = Promise.withResolvers<void>();
  mutationTails.set(filesystem, gate.promise);
  await previous;
  try {
    return await operation();
  } finally {
    gate.resolve();
  }
};

const digestPath = (input: {
  readonly root: string;
  readonly digest: ActionDigest | ContentDigest;
  readonly suffix?: string;
}): string => {
  const hexadecimal = input.digest.slice('sha256:'.length);
  return `${input.root}/${hexadecimal.slice(0, 2)}/${hexadecimal.slice(2)}${input.suffix ?? ''}`;
};

const parentPath = (path: string): string => path.slice(0, path.lastIndexOf('/'));

const refPath = async (scope: string, name: string): Promise<string> => {
  const scopeKey = await sha256String(assertOpaqueId(scope, 'Project compute ref scope'));
  const nameKey = await sha256String(assertOpaqueId(name, 'Project compute ref name'));
  return `${referencesRoot}/pins/${scopeKey}/${nameKey}.json`;
};

const leaseDirectory = async (sessionId: string): Promise<string> =>
  `${leasesRoot}/${await sha256String(assertOpaqueId(sessionId, 'Project compute lease sessionId'))}`;

const leasePath = (input: {
  readonly directory: string;
  readonly kind: 'action' | 'content';
  readonly digest: ActionDigest | ContentDigest;
}): string => `${input.directory}/${input.kind}/${input.digest.slice('sha256:'.length)}.json`;

const indexPath = (key: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(key)) {
    throw new TypeError('Project compute index key must be lowercase SHA-256 hexadecimal.');
  }
  return `${indexRoot}/${key.slice(0, 2)}/${key.slice(2)}.json`;
};

const removeIfPresent = async (filesystem: KernelFileSystem, path: string): Promise<void> => {
  try {
    await filesystem.unlink(path);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
};

const writeMutableAtomic = async (input: {
  readonly filesystem: KernelFileSystem;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}): Promise<void> => {
  const directory = parentPath(input.path);
  await input.filesystem.ensureDir(directory);
  const temporaryPath = `${directory}/.tmp-${randomUuid()}`;
  await input.filesystem.writeFile(temporaryPath, new Uint8Array(input.bytes));
  try {
    await input.filesystem.rename(temporaryPath, input.path);
  } catch (error) {
    await removeIfPresent(input.filesystem, temporaryPath);
    throw error;
  }
};

const readFileOrMiss = async (
  filesystem: KernelFileSystem,
  path: string,
): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  try {
    return await filesystem.readFile(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
};

type ProjectCacheFile = {
  readonly path: string;
  readonly name: string;
  readonly size: number;
  readonly mtimeMs: number;
};

const listTreeFiles = async (filesystem: KernelFileSystem, root: string): Promise<readonly ProjectCacheFile[]> => {
  if (!(await filesystem.exists(root))) {
    return [];
  }
  const files: ProjectCacheFile[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded filesystem walk is intentionally serialized.
    for (const entry of await filesystem.readdirStat(directory)) {
      if (entry.type === 'dir') {
        pending.push(entry.path);
      } else {
        files.push({ path: entry.path, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs });
      }
    }
  }
  return files;
};

const scanTree = async (
  filesystem: KernelFileSystem,
  root: string,
): Promise<{ readonly entries: number; readonly bytes: number }> => {
  const allFiles = await listTreeFiles(filesystem, root);
  const files = allFiles.filter((entry) => !entry.name.startsWith('.tmp-'));
  return { entries: files.length, bytes: files.reduce((total, entry) => total + entry.size, 0) };
};

const clearTree = async (filesystem: KernelFileSystem, root: string): Promise<void> => {
  if (!(await filesystem.exists(root))) {
    return;
  }
  const entries = await filesystem.readdirStat(root);
  for (const entry of entries) {
    if (entry.type !== 'dir') {
      // oxlint-disable-next-line no-await-in-loop -- deterministic bounded cleanup.
      await filesystem.unlink(entry.path);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- removal order must be child before parent.
    await clearTree(filesystem, entry.path);
  }
  await filesystem.rmdir(root);
};

const removeEmptyParents = async (filesystem: KernelFileSystem, path: string, root: string): Promise<void> => {
  let directory = parentPath(path);
  while (directory === root || directory.startsWith(`${root}/`)) {
    // oxlint-disable-next-line no-await-in-loop -- parent pruning is ordered from leaf to root.
    const entries = await filesystem.readdir(directory);
    if (entries.length > 0) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- parent pruning is ordered from leaf to root.
    await filesystem.rmdir(directory);
    if (directory === root) {
      return;
    }
    directory = parentPath(directory);
  }
};

const createMaintenance = (input: {
  readonly filesystem: KernelFileSystem;
  readonly root: string;
  readonly counters: StoreCounters;
}): CacheMaintenance => ({
  status: 'supported',
  inspect: async ({ signal }) => {
    signal?.throwIfAborted();
    const current = await scanTree(input.filesystem, input.root);
    signal?.throwIfAborted();
    return {
      status: 'supported',
      statistics: {
        ...current,
        hits: input.counters.hits,
        misses: input.counters.misses,
        evictions: 0,
      } satisfies CacheStoreStatistics,
    };
  },
  clear: async ({ signal }) => {
    signal?.throwIfAborted();
    await clearTree(input.filesystem, input.root);
    signal?.throwIfAborted();
    return { status: 'cleared' };
  },
});

const publishAtomic = async (input: {
  readonly filesystem: KernelFileSystem;
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly verifyExisting: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
}): Promise<'stored' | 'existing'> => {
  const existing = await readFileOrMiss(input.filesystem, input.path);
  if (existing !== undefined) {
    await input.verifyExisting(existing);
    return 'existing';
  }

  const directory = parentPath(input.path);
  await input.filesystem.ensureDir(directory);
  const temporaryPath = `${directory}/.tmp-${randomUuid()}`;
  await input.filesystem.writeFile(temporaryPath, new Uint8Array(input.bytes));
  try {
    const raced = await readFileOrMiss(input.filesystem, input.path);
    if (raced !== undefined) {
      await input.verifyExisting(raced);
      await removeIfPresent(input.filesystem, temporaryPath);
      return 'existing';
    }
    await input.filesystem.rename(temporaryPath, input.path);
    return 'stored';
  } catch (error) {
    await removeIfPresent(input.filesystem, temporaryPath);
    const raced = await readFileOrMiss(input.filesystem, input.path);
    if (raced === undefined) {
      throw error;
    }
    await input.verifyExisting(raced);
    return 'existing';
  }
};

/**
 * Read one bounded candidate-discovery index from the rooted project cache.
 * @internal
 * @param input - Rooted filesystem and opaque SHA-256 index key.
 * @returns Validated discovery entries, or an empty list when no index exists.
 */
export const readProjectComputeIndex = async (input: {
  readonly filesystem: KernelFileSystem;
  readonly key: string;
}): Promise<readonly ProjectComputeIndexEntry[]> => {
  const bytes = await readFileOrMiss(input.filesystem, indexPath(input.key));
  if (bytes === undefined) {
    return [];
  }
  try {
    return projectComputeIndexSchema.parse(JSON.parse(strictUtf8.decode(bytes))).entries;
  } catch (error) {
    throw new CacheCorruptionError('Project compute discovery index is malformed.', { cause: error });
  }
};

/**
 * Atomically replace one mutable candidate-discovery index.
 * @internal
 * @param input - Rooted filesystem, opaque SHA-256 index key, and validated entries.
 * @returns A promise that settles after the ref is durable.
 */
export const writeProjectComputeIndex = async (input: {
  readonly filesystem: KernelFileSystem;
  readonly key: string;
  readonly entries: readonly ProjectComputeIndexEntry[];
}): Promise<void> => {
  const bytes = utf8.encode(
    JSON.stringify(projectComputeIndexSchema.parse({ schemaVersion: 1, entries: input.entries })),
  );
  await withFilesystemMutation(input.filesystem, async () =>
    writeMutableAtomic({ filesystem: input.filesystem, path: indexPath(input.key), bytes }),
  );
};

type Reachability = {
  readonly actions: Set<ActionDigest>;
  readonly content: Set<ContentDigest>;
};

type ProjectComputeLease = {
  readonly kind: 'action' | 'content';
  readonly digest: ActionDigest | ContentDigest;
};

const readJson = <T>(bytes: Uint8Array<ArrayBuffer>, schema: z.ZodType<T>, message: string): T => {
  try {
    return schema.parse(JSON.parse(strictUtf8.decode(bytes)));
  } catch (error) {
    throw new CacheCorruptionError(message, { cause: error });
  }
};

const digestFromPath = (input: {
  readonly path: string;
  readonly root: string;
  readonly suffix: string;
}): string | undefined => {
  if (!input.path.startsWith(`${input.root}/`) || !input.path.endsWith(input.suffix)) {
    return undefined;
  }
  const relative = input.path.slice(input.root.length + 1, -input.suffix.length || undefined);
  const hexadecimal = relative.replace('/', '');
  return /^[0-9a-f]{64}$/u.test(hexadecimal) ? `sha256:${hexadecimal}` : undefined;
};

const collectRefRoots = async (filesystem: KernelFileSystem): Promise<Reachability> => {
  const reachable: Reachability = { actions: new Set(), content: new Set() };
  const files = await listTreeFiles(filesystem, referencesRoot);
  for (const file of files) {
    if (file.name.startsWith('.tmp-')) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- refs are bounded project metadata and parsed deterministically.
    const bytes = await filesystem.readFile(file.path);
    if (file.path.startsWith(`${indexRoot}/`)) {
      const index = readJson(bytes, projectComputeIndexSchema, 'Project compute discovery index is malformed.');
      for (const entry of index.entries) {
        reachable.actions.add(entry.actionDigest);
      }
      continue;
    }
    const ref = readJson(bytes, projectComputeRefSchema, 'Project compute ref is malformed.');
    for (const digest of ref.actionDigests) {
      reachable.actions.add(digest);
    }
    for (const digest of ref.contentDigests) {
      reachable.content.add(digest);
    }
  }
  return reachable;
};

const collectLeaseRoots = async (input: {
  readonly filesystem: KernelFileSystem;
  /** Unix epoch time in milliseconds. */
  readonly now: number;
}): Promise<Reachability> => {
  const reachable: Reachability = { actions: new Set(), content: new Set() };
  const files = await listTreeFiles(input.filesystem, leasesRoot);
  for (const file of files) {
    if (file.name.startsWith('.tmp-')) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- leases are bounded project metadata and parsed deterministically.
    const bytes = await input.filesystem.readFile(file.path);
    const lease = readJson(bytes, projectComputeLeaseSchema, 'Project compute lease is malformed.');
    if (lease.expiresAt <= input.now) {
      // oxlint-disable-next-line no-await-in-loop -- stale lease removal is part of the serialized GC transaction.
      await input.filesystem.unlink(file.path);
      // oxlint-disable-next-line no-await-in-loop -- empty lease directories are pruned after their last entry.
      await removeEmptyParents(input.filesystem, file.path, leasesRoot);
      continue;
    }
    if (lease.kind === 'action') {
      reachable.actions.add(actionDigest({ value: lease.digest }));
    } else {
      reachable.content.add(contentDigest({ value: lease.digest }));
    }
  }
  return reachable;
};

const markActionClosure = async (input: {
  readonly filesystem: KernelFileSystem;
  readonly reachable: Reachability;
}): Promise<void> => {
  const pending = [...input.reachable.actions];
  while (pending.length > 0) {
    const digest = pending.pop();
    if (digest === undefined) {
      break;
    }
    const path = digestPath({ root: actionRoot, digest, suffix: '.json' });
    // oxlint-disable-next-line no-await-in-loop -- dependency traversal must validate each immutable record in order.
    const bytes = await readFileOrMiss(input.filesystem, path);
    if (bytes === undefined) {
      continue;
    }
    const record = readJson(bytes, actionRecordSchema, 'Project cache action record is malformed during GC.');
    if (record.actionDigest !== digest) {
      throw new CacheCorruptionError('Project cache action record has the wrong identity during GC.');
    }
    input.reachable.content.add(record.output.digest);
    for (const dependency of record.dependencies) {
      if (!input.reachable.actions.has(dependency)) {
        input.reachable.actions.add(dependency);
        pending.push(dependency);
      }
    }
  }
};

const writeGcState = async (
  filesystem: KernelFileSystem,
  state: z.input<typeof projectComputeGcStateSchema>,
): Promise<void> =>
  writeMutableAtomic({
    filesystem,
    path: gcStatePath,
    bytes: utf8.encode(JSON.stringify(projectComputeGcStateSchema.parse(state))),
  });

const createProjectComputeLifecycle = (filesystem: KernelFileSystem): ProjectComputeLifecycle => ({
  readRef: async ({ scope, name, signal }) => {
    signal?.throwIfAborted();
    const bytes = await readFileOrMiss(filesystem, await refPath(scope, name));
    if (bytes === undefined) {
      return undefined;
    }
    const reference = readJson(bytes, projectComputeRefSchema, 'Project compute ref is malformed.');
    signal?.throwIfAborted();
    return {
      actionDigests: reference.actionDigests,
      contentDigests: reference.contentDigests,
    };
  },
  writeRef: async ({ scope, name, actionDigests, contentDigests, signal }) => {
    signal?.throwIfAborted();
    for (const digest of actionDigests) {
      actionDigest({ value: digest });
    }
    for (const digest of contentDigests) {
      contentDigest({ value: digest });
    }
    const path = await refPath(scope, name);
    const bytes = utf8.encode(
      JSON.stringify(projectComputeRefSchema.parse({ schemaVersion: 1, actionDigests, contentDigests })),
    );
    await withFilesystemMutation(filesystem, async () => writeMutableAtomic({ filesystem, path, bytes }));
    signal?.throwIfAborted();
  },
  removeRef: async ({ scope, name, signal }) => {
    signal?.throwIfAborted();
    const path = await refPath(scope, name);
    await withFilesystemMutation(filesystem, async () => {
      await removeIfPresent(filesystem, path);
      if (await filesystem.exists(parentPath(path))) {
        await removeEmptyParents(filesystem, path, `${referencesRoot}/pins`);
      }
    });
    signal?.throwIfAborted();
  },
  renewLease: async ({ sessionId, actionDigests, contentDigests, expiresAt, signal }) => {
    signal?.throwIfAborted();
    assertBound(expiresAt, 'expiresAt');
    const directory = await leaseDirectory(sessionId);
    const leases = [
      ...actionDigests.map<ProjectComputeLease>((digest) => ({
        kind: 'action',
        digest: actionDigest({ value: digest }),
      })),
      ...contentDigests.map<ProjectComputeLease>((digest) => ({
        kind: 'content',
        digest: contentDigest({ value: digest }),
      })),
    ];
    await withFilesystemMutation(filesystem, async () => {
      for (const lease of leases) {
        const path = leasePath({ directory, ...lease });
        const bytes = utf8.encode(
          JSON.stringify(projectComputeLeaseSchema.parse({ schemaVersion: 1, ...lease, expiresAt })),
        );
        // oxlint-disable-next-line no-await-in-loop -- lease files form one serialized renewal set.
        await writeMutableAtomic({ filesystem, path, bytes });
      }
    });
    signal?.throwIfAborted();
  },
  releaseLease: async ({ sessionId, signal }) => {
    signal?.throwIfAborted();
    const directory = await leaseDirectory(sessionId);
    await withFilesystemMutation(filesystem, async () => {
      await clearTree(filesystem, directory);
      const leasesExist = await filesystem.exists(leasesRoot);
      const leaseEntries = leasesExist ? await filesystem.readdir(leasesRoot) : [];
      if (leasesExist && leaseEntries.length === 0) {
        await filesystem.rmdir(leasesRoot);
      }
    });
    signal?.throwIfAborted();
  },
  collect: async ({ now = Date.now(), gracePeriod = 24 * 60 * 60 * 1000, signal }) => {
    assertBound(now, 'now');
    assertBound(gracePeriod, 'gracePeriod');
    return withFilesystemMutation(filesystem, async () => {
      signal?.throwIfAborted();
      const runId = randomUuid();
      await writeGcState(filesystem, { schemaVersion: 1, phase: 'marking', runId, startedAt: now });
      const references = await collectRefRoots(filesystem);
      const leases = await collectLeaseRoots({ filesystem, now });
      for (const digest of leases.actions) {
        references.actions.add(digest);
      }
      for (const digest of leases.content) {
        references.content.add(digest);
      }
      await markActionClosure({ filesystem, reachable: references });
      signal?.throwIfAborted();
      await writeGcState(filesystem, { schemaVersion: 1, phase: 'sweeping', runId, startedAt: now });

      const cutoff = now - gracePeriod;
      const actionFiles = await listTreeFiles(filesystem, actionRoot);
      const contentFiles = await listTreeFiles(filesystem, contentRoot);
      let removedActions = 0;
      let removedContent = 0;
      let reclaimedBytes = 0;
      for (const file of actionFiles) {
        const value = digestFromPath({ path: file.path, root: actionRoot, suffix: '.json' });
        if (file.mtimeMs > cutoff || (value !== undefined && references.actions.has(actionDigest({ value })))) {
          continue;
        }
        signal?.throwIfAborted();
        // oxlint-disable-next-line no-await-in-loop -- action records are removed before their now-unreachable content.
        await filesystem.unlink(file.path);
        removedActions += value === undefined ? 0 : 1;
        reclaimedBytes += file.size;
      }
      for (const file of contentFiles) {
        const value = digestFromPath({ path: file.path, root: contentRoot, suffix: '' });
        if (file.mtimeMs > cutoff || (value !== undefined && references.content.has(contentDigest({ value })))) {
          continue;
        }
        signal?.throwIfAborted();
        // oxlint-disable-next-line no-await-in-loop -- immutable blobs are swept only after unreachable records.
        await filesystem.unlink(file.path);
        removedContent += value === undefined ? 0 : 1;
        reclaimedBytes += file.size;
      }
      await writeGcState(filesystem, {
        schemaVersion: 1,
        phase: 'idle',
        lastCompletedAt: now,
        removedActions,
        removedContent,
        reclaimedBytes,
      });
      return { status: 'collected', removedActions, removedContent, reclaimedBytes };
    });
  },
  inspect: async ({ signal }) => {
    signal?.throwIfAborted();
    const [content, actions, references, leases] = await Promise.all([
      scanTree(filesystem, contentRoot),
      scanTree(filesystem, actionRoot),
      scanTree(filesystem, referencesRoot),
      scanTree(filesystem, leasesRoot),
    ]);
    signal?.throwIfAborted();
    return { status: 'supported', content, actions, refs: references.entries, leases: leases.entries };
  },
  clear: async ({ signal }) => {
    signal?.throwIfAborted();
    await withFilesystemMutation(filesystem, async () => clearTree(filesystem, cacheRoot));
    signal?.throwIfAborted();
    return { status: 'cleared' };
  },
});

/**
 * Create immutable, validated content and action stores under `.tau/cache/compute/v1`.
 * @internal
 * @param filesystem - Rooted project filesystem authority.
 * @param options - Optional byte quotas for the durable stores.
 * @returns Project stores and their shared lifecycle controller.
 */
export const createProjectComputeStores = (
  filesystem: KernelFileSystem,
  options: ProjectComputeStoreOptions = {},
): ProjectComputeStores => {
  const maxContentBytes = assertBound(options.maxContentBytes ?? 1024 * 1024 * 1024, 'maxContentBytes');
  const maxActionBytes = assertBound(options.maxActionBytes ?? 64 * 1024 * 1024, 'maxActionBytes');
  const maxEntryBytes = assertBound(options.maxEntryBytes ?? 256 * 1024 * 1024, 'maxEntryBytes');
  const contentCounters: StoreCounters = { hits: 0, misses: 0 };
  const actionCounters: StoreCounters = { hits: 0, misses: 0 };
  const lifecycle = createProjectComputeLifecycle(filesystem);

  const contentStore: ContentStore = {
    read: async ({ digest, signal }) => {
      signal?.throwIfAborted();
      contentDigest({ value: digest });
      const bytes = await readFileOrMiss(filesystem, digestPath({ root: contentRoot, digest }));
      if (bytes === undefined) {
        contentCounters.misses += 1;
        return { status: 'miss' };
      }
      if ((await digestContent({ bytes })) !== digest) {
        throw new CacheCorruptionError('Project cache content does not match its digest.');
      }
      signal?.throwIfAborted();
      contentCounters.hits += 1;
      return { status: 'hit', bytes: new Uint8Array(bytes) };
    },
    write: async ({ digest, bytes, signal }) =>
      withFilesystemMutation(filesystem, async () => {
        signal?.throwIfAborted();
        contentDigest({ value: digest });
        if (bytes.byteLength > maxEntryBytes) {
          return { status: 'rejected', reason: 'entry-too-large' };
        }
        if ((await digestContent({ bytes })) !== digest) {
          throw new CacheCorruptionError('Project cache write bytes do not match their declared digest.');
        }
        const path = digestPath({ root: contentRoot, digest });
        if (!(await filesystem.exists(path))) {
          const usage = await scanTree(filesystem, contentRoot);
          if (usage.bytes + bytes.byteLength > maxContentBytes) {
            return { status: 'rejected', reason: 'entry-too-large' };
          }
        }
        const status = await publishAtomic({
          filesystem,
          path,
          bytes,
          verifyExisting: async (existing) => {
            if ((await digestContent({ bytes: existing })) !== digest) {
              throw new CacheCorruptionError('Project cache already contains conflicting content.');
            }
          },
        });
        signal?.throwIfAborted();
        return { status };
      }),
    maintenance: createMaintenance({ filesystem, root: contentRoot, counters: contentCounters }),
  };

  const actionStore: ActionStore = {
    read: async ({ digest, signal }) => {
      signal?.throwIfAborted();
      actionDigest({ value: digest });
      const bytes = await readFileOrMiss(filesystem, digestPath({ root: actionRoot, digest, suffix: '.json' }));
      if (bytes === undefined) {
        actionCounters.misses += 1;
        return { status: 'miss' };
      }
      let record: ComputeActionRecord;
      try {
        record = actionRecordSchema.parse(JSON.parse(strictUtf8.decode(bytes)));
      } catch (error) {
        throw new CacheCorruptionError('Project cache action record is malformed.', { cause: error });
      }
      if (record.actionDigest !== digest) {
        throw new CacheCorruptionError('Project cache action record has the wrong identity.');
      }
      const output = await contentStore.read({ digest: record.output.digest, signal });
      if (output.status === 'miss' || output.bytes.byteLength !== record.output.size) {
        throw new CacheCorruptionError('Project cache action record references missing or truncated content.');
      }
      actionCounters.hits += 1;
      return { status: 'hit', record };
    },
    publish: async ({ record, signal }) =>
      withFilesystemMutation(filesystem, async () => {
        signal?.throwIfAborted();
        const validated = actionRecordSchema.parse(record);
        actionDigest({ value: validated.actionDigest });
        const output = await contentStore.read({ digest: validated.output.digest, signal });
        if (output.status === 'miss' || output.bytes.byteLength !== validated.output.size) {
          throw new CacheCorruptionError('Cannot publish an action before its referenced content exists.');
        }
        const bytes = utf8.encode(JSON.stringify(validated));
        if (bytes.byteLength > maxEntryBytes) {
          return { status: 'rejected', reason: 'entry-too-large' };
        }
        const path = digestPath({ root: actionRoot, digest: validated.actionDigest, suffix: '.json' });
        if (!(await filesystem.exists(path))) {
          const usage = await scanTree(filesystem, actionRoot);
          if (usage.bytes + bytes.byteLength > maxActionBytes) {
            return { status: 'rejected', reason: 'entry-too-large' };
          }
        }
        const status = await publishAtomic({
          filesystem,
          path,
          bytes,
          verifyExisting: async (existing) => {
            let candidate: ComputeActionRecord;
            try {
              candidate = actionRecordSchema.parse(JSON.parse(strictUtf8.decode(existing)));
            } catch (error) {
              throw new CacheCorruptionError('Project cache already contains a malformed action record.', {
                cause: error,
              });
            }
            if (JSON.stringify(candidate) !== JSON.stringify(validated)) {
              throw new CacheCorruptionError('Project cache already contains a conflicting action record.');
            }
          },
        });
        signal?.throwIfAborted();
        return { status: status === 'stored' ? 'published' : 'existing' };
      }),
    maintenance: createMaintenance({ filesystem, root: actionRoot, counters: actionCounters }),
  };

  return { contentStore, actionStore, lifecycle };
};
