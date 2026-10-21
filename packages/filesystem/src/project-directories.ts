/**
 * Project directories: discovery, adoption, journal commit and permanent delete.
 *
 * Extracted from `WorkspaceFileService` unchanged (charter D5/D14, W7). These
 * four operations are the project-directory *lifecycle*, not content: they scan
 * configured storage roots for each project directory's `tau.json`, parse and serialize the
 * manifest, resolve generated identity through shared actors, and write a journal snapshot or remove a verified directory —
 * always through a named authority operation holding the logical-project and
 * canonical-physical locks (authority Rules 5, 8 and 12).
 *
 * It is the one module in this library that names `ProjectManifest`: the router
 * above it routes paths and the mechanism below it moves bytes, so neither
 * parses the product's manifest (review Finding 6, boundary rule
 * `project-manifest`).
 *
 * Unmasked on purpose. Project-directory lifecycle is one of the three trusted
 * compositions authority Rule 16 admits to the unmasked authority — it must
 * read and remove a `tau.json` and everything beside it, including the control
 * plane a composed view refuses.
 *
 * @module
 */

import { z } from 'zod';
import { createAsyncLogic, toPromise } from 'xstate';
import {
  convertLegacyProjectManifestBytes,
  createProjectIdentityActor,
  createProjectIdentityResolver,
  createProjectManifestConversionActor,
  parseProjectIdentityBytes,
  projectIdentityPath,
  serializeProjectIdentity,
} from '@taucad/project-core/identity';
import type {
  ProjectIdentityRecord,
  ProjectIdentityResult,
  ProjectIdentityResolver,
} from '@taucad/project-core/identity';
import {
  parseProjectManifestBytes,
  projectIdSchema,
  projectManifestSchemaUrl,
  projectToManifest,
  readProjectManifestBytes,
  serializeProjectManifest,
} from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type {
  CheckedFileWriteResult,
  FileWritePrecondition,
  FileSystemBackend,
  ProjectManifest,
  ProjectManifestParseIssue,
} from '@taucad/types';
import { assertRootedPath, isSafeRelativePath, joinRelativePath } from '@taucad/utils/path';
import type { SharedPool } from '@taucad/memory';
import type { FileSystemProvider, WorkspaceMutationContext } from '#types.js';
import type {
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  ProjectRootConfiguration,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { CrossTabCoordinator, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { MutationPipeline } from '#mutation-pipeline.js';
import { isProjectDirectoryPath } from '#mutation-pipeline.js';
import type { TreeIndexes } from '#tree-index.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import { isDurableScope, projectLocatorFor } from '#backend/scope.js';
import { isNotFoundError } from '#workspace-errors.js';
import { projectRoute } from '#project-routes.js';

/** Concurrent `tau.json` probes while scanning a discovery root. */
const manifestProbeConcurrency = 64;

/** Declaration or generated-identity failure affecting one discovery entry. @public */
export type ProjectDiscoveryIssue =
  | ProjectManifestParseIssue
  | { readonly code: 'identity-invalid'; readonly message: string }
  | { readonly code: 'identity-unavailable'; readonly message: string }
  | { readonly code: 'identity-conflict'; readonly expectedProjectId: string; readonly actualProjectId: string };

/** Resolved identity kept separate from the authored declaration. @public */
export type ResolvedProjectManifest = {
  readonly projectId: string;
  readonly manifest: ProjectManifest;
};

/**
 * Validated or quarantined result from project discovery.
 *
 * An identified entry's optional `issue` marks a degraded manifest: the
 * identity routes, `manifest` is the normalized strict view, and the bytes
 * on disk still need an explicit Repair.
 *
 * @public
 */
export type ProjectDiscoveryEntry =
  | {
      readonly status: 'valid';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'duplicate-id';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      /**
       * The project is discoverable here, but its persisted route still points
       * at a storage root this pass could not observe, so re-pointing would be
       * unsafe. Synthesized by the UI reconciliation layer — the worker scan
       * never emits it.
       */
      readonly status: 'route-blocked';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'adoption-required';
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'invalid';
      readonly locator: ProjectLocator;
      readonly issue: ProjectDiscoveryIssue;
    };

/** Completeness of one configured physical-root scan. @public */
export type ProjectRootDiscoveryStatus =
  | {
      readonly status: 'complete';
      readonly root: StorageRootConfig;
    }
  | {
      readonly status: 'inaccessible';
      readonly root: StorageRootConfig;
      readonly reason: string;
    };

/** Complete project-discovery result. Entries never imply an unreported root was empty. @public */
export type ProjectDiscoveryResult = {
  readonly entries: readonly ProjectDiscoveryEntry[];
  readonly roots: readonly ProjectRootDiscoveryStatus[];
};

/** One configured discovery root, resolved to the scope and root key its scan uses. @public */
export type ResolvedDiscoveryRoot = {
  root: ProjectRootConfiguration['roots'][number];
  scope: WorkspaceScope;
  storageRootKey: string;
};

const directoryHandleSchema = z.custom<FileSystemDirectoryHandle>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const pendingProjectScopeSchema = z
  .discriminatedUnion('backend', [
    z.object({ backend: z.literal('webaccess'), directoryHandle: directoryHandleSchema, workspaceId: z.string() }),
    z.object({ backend: z.literal('indexeddb') }),
    z.object({ backend: z.literal('opfs') }),
    z.object({ backend: z.literal('node'), path: z.string() }),
    z.object({ backend: z.literal('memory'), storageRootKey: z.string() }),
  ])
  .superRefine((scope, context) => {
    if (!isDurableScope(scope)) {
      context.addIssue({ code: 'custom', message: 'Pending project commits require durable storage.' });
    }
  })
  .transform((scope): StorageRootConfig => scope as unknown as StorageRootConfig);
const pendingProjectFileDescriptorSchema = z.object({
  content: z.instanceof(Uint8Array),
  mode: z.enum(['100644', '100755']).optional(),
});

/** Complete runtime boundary for direct and bridged pending-project commits. @public */
export const pendingProjectCommitInputSchema: z.ZodType<CommitPendingProjectDirectoryInput> = z
  .object({
    projectId: projectIdSchema,
    providerBasePath: z.string(),
    scope: pendingProjectScopeSchema,
    files: z.record(z.string(), pendingProjectFileDescriptorSchema),
    manifest: z.instanceof(Uint8Array),
  })
  .superRefine((input, context) => {
    try {
      if (
        assertRootedPath(input.providerBasePath) !== input.providerBasePath ||
        !isProjectDirectoryPath(input.providerBasePath)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['providerBasePath'],
          message: 'Pending project target must be a canonical project directory',
        });
      }
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['providerBasePath'],
        message: 'Pending project target must be a canonical project directory',
      });
    }

    const treePaths = new Set(['tau.json', projectIdentityPath]);
    for (const relativePath of Object.keys(input.files)) {
      if (!isSafeRelativePath(relativePath)) {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project file path is unsafe',
        });
        continue;
      }
      try {
        assertRootedPath(relativePath);
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project file path must be canonical',
        });
        continue;
      }
      if (
        relativePath === 'tau.json' ||
        relativePath.endsWith('/tau.json') ||
        relativePath.toLowerCase() === '.tau' ||
        relativePath.toLowerCase() === projectIdentityPath ||
        relativePath.toLowerCase().startsWith(`${projectIdentityPath}/`)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project files cannot contain a manifest or generated identity',
        });
      }
      treePaths.add(relativePath);
    }
    for (const treePath of treePaths) {
      let parent = treePath.slice(0, treePath.lastIndexOf('/'));
      while (parent.length > 0) {
        if (treePaths.has(parent)) {
          context.addIssue({
            code: 'custom',
            path: ['files', treePath],
            message: 'Pending project file path collides with an ancestor',
          });
          break;
        }
        parent = parent.slice(0, parent.lastIndexOf('/'));
      }
    }
  });

/** The last segment of a root-relative directory, clamped to the manifest's name bound. */
const basenameOf = (directory: string): string => (directory.split('/').at(-1) ?? directory).slice(0, 200);

/** What one immediate child directory of a discovery root holds, as far as project identity goes. */
type ProjectDirectoryReading =
  | { readonly kind: 'not-a-project' }
  | {
      readonly kind: 'identified';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly issue?: ProjectManifestParseIssue;
    }
  | { readonly kind: 'adoptable'; readonly manifest: ProjectManifest; readonly issue: ProjectManifestParseIssue }
  | { readonly kind: 'invalid'; readonly issue: ProjectDiscoveryIssue };

type DirectoryAuthority = {
  readonly provider: FileSystemProvider;
  readonly directory: string;
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
  readonly alreadyLocked?: boolean;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The project-directory lifecycle over the authority's own collaborators.
 *
 * @public
 */
export class ProjectDirectories {
  private readonly _registry: ProviderRegistry;
  private readonly _observedIdentityResolver: ProjectIdentityResolver;
  private readonly _lifetime = new AbortController();
  private readonly _resourceQueue: ResourceQueue;
  private readonly _crossTabCoordinator: CrossTabCoordinator;
  private readonly _pipeline: MutationPipeline;
  private readonly _treeIndexes: TreeIndexes;
  /** The configured discovery roots, owned by the authority's mount lifecycle. */
  private readonly _discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
  private readonly _filePool: () => SharedPool | undefined;
  /** Retire one logical project route the authority installed, as a delete must. */
  private readonly _revokeProjectRoute: (path: string, notifyPeers: boolean) => void;

  /**
   * Create the project-directory lifecycle over the authority's collaborators.
   *
   * @param options - Provider registry, queues, pipeline, index and the two authority-owned accessors the lifecycle reads and revokes through.
   */
  public constructor(options: {
    registry: ProviderRegistry;
    resourceQueue: ResourceQueue;
    crossTabCoordinator: CrossTabCoordinator;
    pipeline: MutationPipeline;
    treeIndexes: TreeIndexes;
    discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
    filePool: () => SharedPool | undefined;
    revokeProjectRoute: (path: string, notifyPeers: boolean) => void;
  }) {
    this._observedIdentityResolver = createProjectIdentityResolver({
      capacity: 0,
      actors: {
        readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, { locationKey: string }>({
          run: async () => {
            throw new Error('Observed identity resolution requires an already-read record.');
          },
        }),
        mintIdentity: createAsyncLogic<string, { locationKey: string }>({
          run: async () => {
            throw new Error('Observed identity resolution never generates identity.');
          },
        }),
        initializeIdentity: createAsyncLogic<ProjectIdentityRecord, { locationKey: string; projectId: string }>({
          run: async () => {
            throw new Error('Observed identity resolution never initializes storage.');
          },
        }),
      },
    });
    this._observedIdentityResolver.actor.start();
    this._registry = options.registry;
    this._resourceQueue = options.resourceQueue;
    this._crossTabCoordinator = options.crossTabCoordinator;
    this._pipeline = options.pipeline;
    this._treeIndexes = options.treeIndexes;
    this._discoveryRoots = options.discoveryRoots;
    this._filePool = options.filePool;
    this._revokeProjectRoute = options.revokeProjectRoute;
  }

  /** Stop the bounded owner when its filesystem authority is disposed. */
  public dispose(): void {
    this._lifetime.abort();
    this._observedIdentityResolver.actor.stop();
  }

  /**
   * Discover physical project manifests. A project is any immediate child
   * directory of a configured root carrying `tau.json`; dot-prefixed children
   * hold app state and are never scanned.
   *
   * @returns Manifests and per-root completeness from the configured physical roots.
   */
  public async listProjectManifests(): Promise<ProjectDiscoveryResult> {
    const discovered: ProjectDiscoveryEntry[] = [];
    const roots: ProjectRootDiscoveryStatus[] = [];
    /* oxlint-disable eslint/no-await-in-loop -- Root scans are deliberately serialized to bound filesystem-handle and IndexedDB pressure. */
    for (const resolvedRoot of this._discoveryRoots()) {
      const { root, scope, storageRootKey } = resolvedRoot;
      let provider: FileSystemProvider;
      try {
        // Out-of-band writes reach the provider through the external-change path
        // (native observer, safety poll, or a sibling-tab notification), so a scan
        // never has to drop the handle cache to see them.
        provider = await this._registry.getProvider(scope);
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      let directories: string[];
      try {
        // The workspace root exists by definition; a project is any immediate
        // child directory carrying `tau.json`. Entry kinds come from the listing
        // so files never cost a `stat`, and dotdirs are excluded by name alone.
        const entries = await readDirectoryEntries(provider, '');
        directories = entries
          .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.'))
          .map((entry) => entry.name)
          .sort();
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const probe = async (directory: string): Promise<ProjectDiscoveryEntry | undefined> => {
        const relativeDirectory = assertRootedPath(directory);
        const locator = projectLocatorFor(root, storageRootKey, relativeDirectory);
        // One unreadable child must not blank an otherwise readable root: it is
        // reported in place and the scan continues. `inaccessible` stays
        // reserved for failures of the root listing or its provider.
        const reading = await this._readProjectDirectory({
          provider,
          directory: relativeDirectory,
          scope,
          storageRootKey,
        });
        switch (reading.kind) {
          case 'not-a-project': {
            return undefined;
          }
          case 'identified': {
            return reading.issue === undefined
              ? { status: 'valid', projectId: reading.projectId, manifest: reading.manifest, locator }
              : {
                  status: 'valid',
                  projectId: reading.projectId,
                  manifest: reading.manifest,
                  locator,
                  issue: reading.issue,
                };
          }
          case 'adoptable': {
            return { status: 'adoption-required', manifest: reading.manifest, locator, issue: reading.issue };
          }
          case 'invalid': {
            return { status: 'invalid', locator, issue: reading.issue };
          }
        }
      };
      // Chunked awaits bound the probe concurrency; the pre-sorted input keeps
      // the result order independent of completion order.
      for (let offset = 0; offset < directories.length; offset += manifestProbeConcurrency) {
        const chunk = await Promise.all(
          directories.slice(offset, offset + manifestProbeConcurrency).map(async (directory) => probe(directory)),
        );
        discovered.push(...chunk.filter((entry) => entry !== undefined));
      }
      roots.push({ status: 'complete', root });
    }
    /* oxlint-enable eslint/no-await-in-loop -- End bounded serial root scan. */

    const priority: Record<Exclude<FileSystemBackend, 'memory'>, number> = {
      indexeddb: 0,
      opfs: 1,
      webaccess: 2,
      // Disk beats every browser engine: on desktop it is the only real root.
      node: 3,
    };
    discovered.sort((left, right) => {
      const backendOrder = priority[left.locator.backend] - priority[right.locator.backend];
      if (backendOrder !== 0) {
        return backendOrder;
      }
      const rootOrder = left.locator.storageRootKey.localeCompare(right.locator.storageRootKey);
      if (rootOrder !== 0) {
        return rootOrder;
      }
      return left.locator.relativeDirectory.localeCompare(right.locator.relativeDirectory);
    });

    const occurrenceCount = new Map<string, number>();
    for (const entry of discovered) {
      if (entry.status === 'valid') {
        occurrenceCount.set(entry.projectId, (occurrenceCount.get(entry.projectId) ?? 0) + 1);
      }
    }
    const entries = discovered.map(
      (entry): ProjectDiscoveryEntry =>
        entry.status === 'valid' && (occurrenceCount.get(entry.projectId) ?? 0) > 1
          ? { ...entry, status: 'duplicate-id' }
          : entry,
    );
    return { entries, roots };
  }

  /**
   * Give an `adoption-required` project directory a Tau identity in place,
   * writing the recovered declaration discovery showed and preserving its generated identity. Service-side because the
   * write must re-establish adoptability under the same physical lock every
   * other project mutation takes — a UI-side read/modify/write could adopt a
   * directory a sibling tab just repaired.
   *
   * @param locator - Discovery locator of the directory to adopt.
   * @param options - `id` restores the identity this exact directory's route was bound to; absent mints a fresh one.
   * @returns The declaration now on disk and its separately resolved identity.
   */
  public async adoptProjectDirectory(
    locator: ProjectLocator,
    options?: { readonly id?: string },
  ): Promise<ResolvedProjectManifest> {
    const path = assertRootedPath(locator.relativeDirectory);
    if (path !== locator.relativeDirectory || !isProjectDirectoryPath(path)) {
      throw new TypeError(`Adoption target must be a canonical project directory: ${locator.relativeDirectory}`);
    }
    if (options?.id !== undefined && !projectIdSchema.safeParse(options.id).success) {
      throw new TypeError(`Invalid project id: ${JSON.stringify(options.id)}`);
    }
    const root = this._discoveryRoots().find((candidate) => candidate.storageRootKey === locator.storageRootKey);
    if (root === undefined) {
      throw new TypeError(`Adoption target is not a configured discovery root: ${locator.storageRootKey}`);
    }
    const provider = await this._registry.getProvider(root.scope);
    const physicalLock = `${locator.storageRootKey}:${path}`;
    return this._crossTabCoordinator.withLocks([physicalLock], async () =>
      this._resourceQueue.queueForMany([physicalLock], async () => {
        const authority = {
          provider,
          directory: path,
          scope: root.scope,
          storageRootKey: locator.storageRootKey,
          alreadyLocked: true,
        };
        const reading = await this._readProjectDirectory(authority);
        if (reading.kind !== 'adoptable') {
          throw new TypeError(`Project directory is not adoptable: ${path}`);
        }
        const identity = await this._resolveIdentity({
          ...authority,
          preferredProjectId: options?.id,
          alreadyLocked: true,
        });
        if (identity.status !== 'resolved') {
          throw new Error(`Project identity could not be established: ${JSON.stringify(identity)}`);
        }
        const manifest = projectToManifest(reading.manifest);
        await provider.writeFile(`${path}/tau.json`, serializeProjectManifest(manifest));
        this._crossTabCoordinator.notifyDirectoryChange('/', this._scopedPhysicalAuthority(root.scope, ''));
        return { projectId: identity.projectId, manifest };
      }),
    );
  }

  /**
   * Permanently remove one exact physical project directory. Identity is
   * re-established under the same project-wide lock that all logical project
   * mutations acquire, so no write can race the verification/delete window.
   *
   * @param input - Exact project identity, physical path, and storage scope.
   * @returns Identity-safe deletion outcome.
   */
  public async permanentlyDeleteProjectDirectory(
    input: PermanentDeleteProjectDirectoryInput,
  ): Promise<PermanentDeleteProjectDirectoryResult> {
    const { projectId } = input;
    if (!projectIdSchema.safeParse(projectId).success) {
      throw new TypeError(`Invalid project id: ${JSON.stringify(projectId)}`);
    }
    const path = assertRootedPath(input.providerBasePath);
    if (path !== input.providerBasePath) {
      throw new TypeError('Permanent delete target must already be canonical.');
    }
    if (!isProjectDirectoryPath(path)) {
      throw new TypeError('Permanent delete target must be an immediate child of the workspace root.');
    }
    // `StorageRootConfig` has no ephemeral member, but an untyped RPC caller can
    // still deliver one, and this operation must never run against it.
    if (!isDurableScope(input.scope)) {
      throw new TypeError('Permanent project deletion requires durable storage.');
    }
    const scope: StorageRootConfig = { ...input.scope };
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const physicalLock = `${this._registry.resolveStorageRootKey(scope)}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        await provider.refresh?.();
        if (!(await provider.exists(path))) {
          return { status: 'absent' };
        }

        const manifestPath = `${path}/tau.json`;
        if (!(await provider.exists(manifestPath))) {
          return { status: 'unidentifiable' };
        }
        const manifest = await provider.readFile(manifestPath);
        let identity: ProjectIdentityRecord | undefined;
        let identityBytes: Uint8Array<ArrayBuffer>;
        try {
          identityBytes = await provider.readFile(`${path}/${projectIdentityPath}`);
          identity = parseProjectIdentityBytes(identityBytes);
        } catch {
          return { status: 'unidentifiable' };
        }
        if (identity.projectId !== projectId) {
          return { status: 'identity-mismatch', actualProjectId: identity.projectId };
        }

        this._revokeProjectRoute(logicalRoot, true);
        const separator = path.lastIndexOf('/');
        const physicalParent = separator === -1 ? '' : path.slice(0, separator);
        const authorityParent = physicalParent === '' ? '/' : `/${physicalParent}`;
        const parentAuthority = this._scopedPhysicalAuthority(scope, physicalParent);
        try {
          await this._deleteProjectDirectory({ provider, directoryPath: path, manifest, identity: identityBytes });
        } finally {
          this._filePool()?.clear();
          this._treeIndexes.clear();
          this._pipeline.emitChangeEvent({ type: 'directoryChanged', path: authorityParent, backend: scope.backend });
          this._crossTabCoordinator.notifyDirectoryChange(authorityParent, parentAuthority);
        }
        if (await provider.exists(path)) {
          throw new Error(`Permanent delete did not remove ${path}`);
        }
        return { status: 'deleted' };
      }),
    );
  }

  /**
   * Commit one durable pending-operation snapshot to its exact physical
   * project directory. The manifest is the commit marker and is always
   * written last.
   *
   * @param input - Owned journal snapshot and exact target locator.
   * @param context - Optional mutation origin metadata.
   * @returns Replay-safe commit outcome.
   */
  public async commitPendingProjectDirectory(
    input: CommitPendingProjectDirectoryInput,
    context?: WorkspaceMutationContext,
  ): Promise<CommitPendingProjectDirectoryResult> {
    const { path, files, manifest, scope, storageRootKey, projectId } = this._validatePendingProjectCommit(input);
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const physicalLock = `${storageRootKey}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];

    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        let mutationBegan = false;
        try {
          await provider.refresh?.();
          if (await provider.exists(path)) {
            const targetStat = await provider.stat(path);
            if (targetStat.type !== 'dir') {
              throw new TypeError(`Pending project target is not a directory: ${path}`);
            }
            const existingManifestPath = `${path}/tau.json`;
            if (await provider.exists(existingManifestPath)) {
              const existing = readProjectManifestBytes(await provider.readFile(existingManifestPath));
              let identity: ProjectIdentityRecord | undefined;
              try {
                identity = await this._readIdentity({ provider, directory: path, scope, storageRootKey });
              } catch {
                return { status: 'unidentifiable-manifest' };
              }
              if (!existing.success || identity === undefined) {
                return { status: 'unidentifiable-manifest' };
              }
              if (identity.projectId !== projectId) {
                return { status: 'identity-mismatch', actualProjectId: identity.projectId };
              }
              return { status: 'already-committed' };
            }
            let residueIdentity: ProjectIdentityRecord | undefined;
            try {
              residueIdentity = await this._readIdentity({ provider, directory: path, scope, storageRootKey });
            } catch {
              return { status: 'unidentifiable-manifest' };
            }
            if (residueIdentity === undefined) {
              return { status: 'unidentifiable-manifest' };
            }
            if (residueIdentity.projectId !== projectId) {
              return { status: 'identity-mismatch', actualProjectId: residueIdentity.projectId };
            }
            mutationBegan = true;
            await this._clearProjectDirectoryContents(provider, path);
          }

          mutationBegan = true;
          await provider.mkdir(path, { recursive: true });
          this._filePool()?.clear();
          this._treeIndexes.removeDirectory(logicalRoot);
          const identity = await this._resolveIdentity({
            provider,
            directory: path,
            scope,
            storageRootKey,
            preferredProjectId: projectId,
            alreadyLocked: true,
          });
          if (identity.status !== 'resolved') {
            throw new Error(`Pending project identity could not be established: ${JSON.stringify(identity)}`);
          }

          for (const [relativePath, descriptor] of files) {
            const logicalPath = `${logicalRoot}/${relativePath}`;
            const providerPath = `${path}/${relativePath}`;
            // oxlint-disable-next-line no-await-in-loop -- deterministic manifest-last transaction
            await this._pipeline.writeFileUnlocked({
              path: logicalPath,
              resolution: { provider, path: providerPath, backend: scope.backend },
              data: descriptor.content,
              context,
            });
            if (descriptor.mode !== undefined) {
              // oxlint-disable-next-line no-await-in-loop -- mode belongs to the file just written.
              await provider.setFileMode?.(providerPath, descriptor.mode);
            }
          }

          await this._pipeline.writeFileUnlocked({
            path: `${logicalRoot}/tau.json`,
            resolution: { provider, path: `${path}/tau.json`, backend: scope.backend },
            data: manifest,
            context,
          });
          const committed = parseProjectManifestBytes(await provider.readFile(`${path}/tau.json`));
          const committedIdentity = await this._readIdentity({ provider, directory: path, scope, storageRootKey });
          if (!committed.success || committedIdentity?.projectId !== projectId) {
            throw new Error(`Pending project manifest verification failed for ${projectId}`);
          }

          this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          return { status: 'committed' };
        } catch (error) {
          if (mutationBegan) {
            this._filePool()?.clear();
            this._treeIndexes.removeDirectory(logicalRoot);
            this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          }
          throw error;
        }
      }),
    );
  }

  private async _readIdentity(authority: DirectoryAuthority): Promise<ProjectIdentityRecord | undefined> {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await authority.provider.readFile(`${authority.directory}/${projectIdentityPath}`);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
    try {
      return parseProjectIdentityBytes(bytes);
    } catch (error) {
      throw Object.assign(new Error(`Invalid project identity: ${errorMessage(error)}`), { code: 'IDENTITY_INVALID' });
    }
  }

  private async _resolveIdentity(
    input: DirectoryAuthority & {
      readonly preferredProjectId?: string;
      readonly initialIdentity?: { readonly record: ProjectIdentityRecord | undefined };
      readonly manifestBytes?: Uint8Array<ArrayBuffer>;
      readonly alreadyLocked?: boolean;
      readonly signal?: AbortSignal;
    },
  ): Promise<ProjectIdentityResult> {
    if (input.initialIdentity?.record !== undefined) {
      return this._observedIdentityResolver.resolve({
        locationKey: `${input.storageRootKey}:${input.directory}`,
        mode: 'read',
        initialIdentity: input.initialIdentity,
        ...(input.preferredProjectId === undefined ? {} : { preferredProjectId: input.preferredProjectId }),
      });
    }
    const signal =
      input.signal === undefined ? this._lifetime.signal : AbortSignal.any([this._lifetime.signal, input.signal]);
    if (signal.aborted) {
      return { status: 'failed', message: 'Project identity resolution was canceled.' };
    }
    const actor = createProjectIdentityActor({
      input: {
        locationKey: `${input.storageRootKey}:${input.directory}`,
        mode: 'ensure',
        ...(input.preferredProjectId === undefined ? {} : { preferredProjectId: input.preferredProjectId }),
        ...(input.initialIdentity === undefined ? {} : { initialIdentity: input.initialIdentity }),
      },
      actors: {
        readIdentity: createAsyncLogic<ProjectIdentityRecord | undefined, { locationKey: string }>({
          run: async ({ signal }) => {
            const identity = await this._readIdentity(input);
            signal.throwIfAborted();
            return identity;
          },
        }),
        mintIdentity: createAsyncLogic<string, { locationKey: string }>({
          run: async ({ signal }) => {
            signal.throwIfAborted();
            return generatePrefixedId(idPrefix.project);
          },
        }),
        initializeIdentity: createAsyncLogic<ProjectIdentityRecord, { locationKey: string; projectId: string }>({
          run: async ({ input: candidate, signal }) => {
            const record: ProjectIdentityRecord = { version: 1, projectId: candidate.projectId };
            const path = `${input.directory}/${projectIdentityPath}`;
            const result = await this._checkedWrite({
              ...input,
              projectId: candidate.projectId,
              path,
              data: serializeProjectIdentity(record),
              preconditions: [
                { path, expected: null },
                ...(input.manifestBytes === undefined
                  ? []
                  : [{ path: `${input.directory}/tau.json`, expected: input.manifestBytes }]),
              ],
              signal,
            });
            signal.throwIfAborted();
            if (result.status === 'applied') {
              return record;
            }
            const winner = await this._readIdentity(input);
            signal.throwIfAborted();
            if (winner === undefined) {
              throw new Error(
                'The project declaration changed while its identity was being initialized. Retry discovery.',
              );
            }
            return winner;
          },
        }),
      },
    });
    const cancel = (): void => {
      actor.send({ type: 'cancel' });
    };
    signal.addEventListener('abort', cancel, { once: true });
    actor.start();
    try {
      return await toPromise(actor);
    } finally {
      signal.removeEventListener('abort', cancel);
      actor.stop();
    }
  }

  private async _checkedWrite(
    input: DirectoryAuthority & {
      readonly projectId: string;
      readonly path: string;
      readonly data: Uint8Array<ArrayBuffer>;
      readonly preconditions: readonly FileWritePrecondition[];
      readonly alreadyLocked?: boolean;
      readonly signal: AbortSignal;
    },
  ): Promise<CheckedFileWriteResult> {
    const physicalLock = `${input.storageRootKey}:${input.directory}`;
    const run = async (): Promise<CheckedFileWriteResult> => {
      input.signal.throwIfAborted();
      if (!input.provider.capabilities.writable) {
        throw new Error('Project identity persistence is unavailable on this read-only storage.');
      }
      if (input.provider.writeFileChecked !== undefined) {
        return input.provider.writeFileChecked({
          path: input.path,
          data: input.data,
          preconditions: input.preconditions,
        });
      }
      const conflicts = [];
      for (const precondition of input.preconditions) {
        let actual: Exclude<FileWritePrecondition['expected'], string>;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Compare every expected byte under the held physical lock.
          actual = await input.provider.readFile(precondition.path);
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          actual = null;
        }
        const expected =
          typeof precondition.expected === 'string'
            ? new TextEncoder().encode(precondition.expected)
            : precondition.expected;
        const matches =
          actual === null
            ? expected === null
            : actual.byteLength === expected?.byteLength && actual.every((byte, index) => byte === expected[index]);
        if (!matches) {
          conflicts.push({ path: precondition.path, actual });
        }
      }
      if (conflicts.length > 0) {
        return { status: 'conflict', conflicts };
      }
      input.signal.throwIfAborted();
      await input.provider.writeFile(input.path, input.data);
      return { status: 'applied', content: input.data };
    };
    const locked = async (): Promise<CheckedFileWriteResult> =>
      input.alreadyLocked === true ? run() : this._resourceQueue.queueForMany([physicalLock], run);
    // Native checked writes own their authority fence. Browser providers without
    // that primitive require Web Locks; best-effort exclusion is insufficient.
    const result =
      input.provider.writeFileChecked === undefined
        ? await this._crossTabCoordinator.withRequiredLocks(input.alreadyLocked === true ? [] : [physicalLock], locked)
        : await locked();
    if (result.status === 'applied') {
      const relativePath = input.path.slice(input.directory.length + 1);
      const logicalPath = `${projectRoute(input.projectId)}/${relativePath}`;
      this._filePool()?.invalidate(logicalPath);
      this._treeIndexes.evict(logicalPath);
      if (input.alreadyLocked !== true) {
        this._pipeline.emitChangeEvent({ type: 'fileWritten', path: logicalPath, backend: input.scope.backend });
        this._crossTabCoordinator.notifyDirectoryChange('/', this._scopedPhysicalAuthority(input.scope, ''));
      }
    }
    return result;
  }

  private async _readProjectDirectory(authority: DirectoryAuthority): Promise<ProjectDirectoryReading> {
    const { provider, directory } = authority;
    const [manifestResult, identityResult] = await Promise.allSettled([
      provider.readFile(`${directory}/tau.json`),
      this._readIdentity(authority),
    ]);
    if (manifestResult.status === 'rejected') {
      if (!isNotFoundError(manifestResult.reason)) {
        return {
          kind: 'invalid',
          issue: { code: 'manifest-unreadable', message: errorMessage(manifestResult.reason) },
        };
      }
      const entries = await readDirectoryEntries(provider, directory).catch(() => []);
      if (!entries.some((entry) => entry.kind === 'dir' && entry.name === '.tau')) {
        return { kind: 'not-a-project' };
      }
      const mainFile = entries
        .filter((entry) => entry.kind === 'file' && /^main\.[^.]+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()[0];
      return {
        kind: 'adoptable',
        manifest: {
          $schema: projectManifestSchemaUrl,
          name: basenameOf(directory),
          description: '',
          tags: [],
          assets: { main: { entryPath: mainFile ?? 'main.ts' } },
        },
        issue: { code: 'manifest-missing' },
      };
    }
    if (identityResult.status === 'rejected') {
      const error: unknown = identityResult.reason;
      const invalid =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'IDENTITY_INVALID';
      return {
        kind: 'invalid',
        issue: { code: invalid ? 'identity-invalid' : 'identity-unavailable', message: errorMessage(error) },
      };
    }
    const bytes = manifestResult.value;
    const read = readProjectManifestBytes(bytes);
    const legacy = read.success ? undefined : convertLegacyProjectManifestBytes(bytes);
    if (legacy?.success === true) {
      const { projectId, manifest } = legacy.data;
      const nextBytes = serializeProjectManifest(manifest);
      const actor = createProjectManifestConversionActor({
        input: { projectId },
        actors: {
          establishIdentity: createAsyncLogic<ProjectIdentityResult, { projectId: string }>({
            run: async ({ input, signal }) => {
              const result = await this._resolveIdentity({
                ...authority,
                preferredProjectId: input.projectId,
                initialIdentity: { record: identityResult.value },
                manifestBytes: bytes,
                signal,
              });
              signal.throwIfAborted();
              return result;
            },
          }),
          replaceManifest: createAsyncLogic<'converted' | 'unchanged' | 'conflict', { projectId: string }>({
            run: async ({ input, signal }) => {
              const identityBytes = await provider.readFile(`${directory}/${projectIdentityPath}`);
              signal.throwIfAborted();
              if (parseProjectIdentityBytes(identityBytes).projectId !== input.projectId) {
                return 'conflict';
              }
              const result = await this._checkedWrite({
                ...authority,
                projectId: input.projectId,
                path: `${directory}/tau.json`,
                data: nextBytes,
                preconditions: [
                  { path: `${directory}/tau.json`, expected: bytes },
                  { path: `${directory}/${projectIdentityPath}`, expected: identityBytes },
                ],
                signal,
              });
              signal.throwIfAborted();
              if (result.status === 'applied') {
                return 'converted';
              }
              // A failed precondition can be an identity replacement even when
              // another writer already published the same declaration bytes.
              return result.status === 'unchanged' ? 'unchanged' : 'conflict';
            },
          }),
        },
      });
      const cancel = (): void => {
        actor.send({ type: 'cancel' });
      };
      this._lifetime.signal.addEventListener('abort', cancel, { once: true });
      actor.start();
      if (this._lifetime.signal.aborted) {
        cancel();
      }
      try {
        const result = await toPromise(actor);
        if (result.status === 'converted' || result.status === 'unchanged') {
          return { kind: 'identified', projectId, manifest };
        }
        if (
          result.status === 'conflict' &&
          identityResult.value !== undefined &&
          identityResult.value.projectId !== projectId
        ) {
          return {
            kind: 'invalid',
            issue: {
              code: 'identity-conflict',
              expectedProjectId: projectId,
              actualProjectId: identityResult.value.projectId,
            },
          };
        }
        return {
          kind: 'invalid',
          issue: {
            code: 'identity-unavailable',
            message:
              result.status === 'failed'
                ? result.message
                : 'Project declaration changed during conversion. Retry discovery.',
          },
        };
      } finally {
        this._lifetime.signal.removeEventListener('abort', cancel);
        actor.stop();
      }
    }
    if (!read.success) {
      return { kind: 'invalid', issue: read.issue };
    }
    if (
      identityResult.value === undefined &&
      (read.issue?.code === 'manifest-invalid-json' || read.issue?.code === 'manifest-unknown-schema')
    ) {
      return { kind: 'invalid', issue: read.issue };
    }
    const identity = await this._resolveIdentity({
      ...authority,
      initialIdentity: { record: identityResult.value },
      manifestBytes: bytes,
    });
    switch (identity.status) {
      case 'resolved': {
        return {
          kind: 'identified',
          projectId: identity.projectId,
          manifest: read.data,
          ...(read.issue === undefined ? {} : { issue: read.issue }),
        };
      }
      case 'conflict': {
        return {
          kind: 'invalid',
          issue: {
            code: 'identity-conflict',
            expectedProjectId: identity.expectedProjectId,
            actualProjectId: identity.actualProjectId,
          },
        };
      }
      case 'failed': {
        return { kind: 'invalid', issue: { code: 'identity-unavailable', message: identity.message } };
      }
      case 'missing': {
        return {
          kind: 'invalid',
          issue: { code: 'identity-unavailable', message: 'Project identity has not been persisted.' },
        };
      }
    }
  }

  private _validatePendingProjectCommit(input: CommitPendingProjectDirectoryInput): {
    path: string;
    files: Array<readonly [string, { readonly content: Uint8Array<ArrayBuffer>; readonly mode?: '100644' | '100755' }]>;
    manifest: Uint8Array<ArrayBuffer>;
    scope: StorageRootConfig;
    storageRootKey: string;
    projectId: string;
  } {
    const parsedInput = pendingProjectCommitInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new TypeError(parsedInput.error.issues[0]?.message ?? 'Pending project commit input is invalid');
    }
    const manifest = new Uint8Array(parsedInput.data.manifest);
    const parsedManifest = parseProjectManifestBytes(manifest);
    if (!parsedManifest.success) {
      throw new TypeError('Pending project commit manifest is invalid');
    }
    const { projectId } = parsedInput.data;
    const scope: StorageRootConfig = { ...parsedInput.data.scope };
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const path = parsedInput.data.providerBasePath;
    const files: Array<
      readonly [string, { readonly content: Uint8Array<ArrayBuffer>; readonly mode?: '100644' | '100755' }]
    > = [];
    for (const [relativePath, { content, mode }] of Object.entries(parsedInput.data.files)) {
      const ownedContent = new Uint8Array(content);
      files.push([relativePath, { content: ownedContent, ...(mode === undefined ? {} : { mode }) }]);
    }

    return {
      path,
      files: files.sort(([left], [right]) => left.localeCompare(right)),
      manifest,
      scope,
      storageRootKey,
      projectId,
    };
  }

  private _scopedPhysicalAuthority(scope: WorkspaceScope, providerBasePath: string): PhysicalAuthority {
    return {
      storageRootKey: this._registry.resolveStorageRootKey(scope),
      providerBasePath: assertRootedPath(providerBasePath),
    };
  }

  private async _clearProjectDirectoryContents(provider: FileSystemProvider, directoryPath: string): Promise<void> {
    const stateDirectory = joinRelativePath(directoryPath, '.tau');
    const entries = await provider.readdir(directoryPath);
    for (const entry of entries) {
      const canonicalName = entry.toLowerCase();
      if (canonicalName === 'tau.json' || canonicalName === '.tau') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Preserve both identity markers until every sibling is gone.
      await this._pipeline.removeRecursive(provider, joinRelativePath(directoryPath, entry));
    }
    const stateEntries = await provider.readdir(stateDirectory);
    for (const entry of stateEntries) {
      if (entry.toLowerCase() === 'project.json') {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Preserve identity while removing sibling records.
      await this._pipeline.removeRecursive(provider, joinRelativePath(stateDirectory, entry));
    }
  }

  private async _deleteProjectDirectory(input: {
    provider: FileSystemProvider;
    directoryPath: string;
    manifest: Uint8Array<ArrayBuffer>;
    identity: Uint8Array<ArrayBuffer>;
  }): Promise<void> {
    const { provider, directoryPath, manifest, identity } = input;
    const manifestPath = joinRelativePath(directoryPath, 'tau.json');
    const identityPath = joinRelativePath(directoryPath, projectIdentityPath);
    const stateDirectory = joinRelativePath(directoryPath, '.tau');
    await this._clearProjectDirectoryContents(provider, directoryPath);
    try {
      await provider.unlink(identityPath);
      await provider.rmdir(stateDirectory);
      await provider.unlink(manifestPath);
      await provider.rmdir(directoryPath);
    } catch (error) {
      try {
        if (await provider.exists(directoryPath)) {
          if (!(await provider.exists(identityPath))) {
            await provider.writeFile(identityPath, identity);
          }
          if (!(await provider.exists(manifestPath))) {
            await provider.writeFile(manifestPath, manifest);
          }
        }
      } catch {
        // Preserve the original removal failure; durable journal remains for retry.
      }
      throw error;
    }
  }
}
