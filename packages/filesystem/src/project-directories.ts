/**
 * Project directories: discovery, adoption, journal commit and permanent delete.
 *
 * Extracted from `WorkspaceFileService` unchanged (charter D5/D14, W7). These
 * four operations are the project-directory *lifecycle*, not content: they scan
 * configured storage roots for each project directory's `tau.json`, parse and serialize the
 * manifest, and write a journal snapshot or remove a verified directory —
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
import { matchesGlob } from '#glob.js';
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
  AdoptableProjectManifest,
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

/** Lifecycle operations share every physical ancestor with nested admissions. */
const projectDirectoryLocks = (storageRootKey: string, directory: string): string[] => {
  const segments = directory.split('/');
  return Array.from(
    { length: segments.length + 1 },
    (_, index) => `${storageRootKey}:${segments.slice(0, index).join('/')}`,
  );
};

/** Concurrent `tau.json` probes while scanning a discovery root. */
const manifestProbeConcurrency = 16;

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
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'duplicate-id';
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
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'adoption-required';
      readonly manifest: AdoptableProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'invalid';
      readonly locator: ProjectLocator;
      readonly issue: ProjectManifestParseIssue;
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

/** A reusable file and the manifest that explicitly exposes it. @public */
export type ProjectPart = {
  readonly library: ProjectLocator;
  readonly entryPath: string;
  readonly declaredBy: string;
};

/** Contextual parts from this project and its ancestors within the connected folder. @public */
export type ListProjectPartsResult = {
  readonly parts: readonly ProjectPart[];
  readonly issues: ReadonlyArray<{ readonly code: 'library-invalid' | 'library-unreadable'; readonly path: string }>;
};

/**
 * Find the nearest discovered project containing a root-relative file or folder.
 * Invalid and ambiguous projects remain visible; callers must inspect status.
 *
 * @param discovery - Current discovery result.
 * @param storageRootKey - Connected authority containing the path.
 * @param relativePath - Canonical path within that authority.
 * @returns The nearest manifest-bearing ancestor, including the selected root.
 * @public
 */
export function resolveProjectForPath(
  discovery: ProjectDiscoveryResult,
  storageRootKey: string,
  relativePath: string,
): ProjectDiscoveryEntry | undefined {
  if (assertRootedPath(relativePath) !== relativePath) {
    throw new TypeError('Project lookup requires a canonical relative path.');
  }
  return discovery.entries
    .filter(
      ({ locator }) =>
        locator.storageRootKey === storageRootKey &&
        (locator.relativeDirectory === '' ||
          relativePath === locator.relativeDirectory ||
          relativePath.startsWith(`${locator.relativeDirectory}/`)),
    )
    .sort((left, right) => right.locator.relativeDirectory.length - left.locator.relativeDirectory.length)[0];
}

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
    providerBasePath: z.string(),
    scope: pendingProjectScopeSchema,
    files: z.record(z.string(), pendingProjectFileDescriptorSchema),
    manifest: z.instanceof(Uint8Array),
  })
  .superRefine((input, context) => {
    try {
      if (
        assertRootedPath(input.providerBasePath) !== input.providerBasePath ||
        input.providerBasePath === '' ||
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

    const treePaths = new Set(['tau.json']);
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
      if (relativePath === 'tau.json' || relativePath.endsWith('/tau.json')) {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project files cannot contain a manifest',
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
  | { readonly kind: 'identified'; readonly manifest: ProjectManifest; readonly issue?: ProjectManifestParseIssue }
  | {
      readonly kind: 'adoptable';
      readonly manifest: AdoptableProjectManifest;
      readonly issue: ProjectManifestParseIssue;
    }
  | { readonly kind: 'invalid'; readonly issue: ProjectManifestParseIssue };

/**
 * Classify one project directory by its manifest — the single reading that
 * discovery reports and that Adopt re-establishes under the physical lock
 * before it writes (R11, blueprint R6).
 *
 * A defective declaration still identifies its project; only a missing
 * identity makes the directory adoptable, and only unreadable, oversize or
 * foreign-schema bytes leave it quarantined. A directory holding `.tau/`
 * state has been a project, so losing its `tau.json` keeps it visible as
 * adoptable instead of letting it vanish with its chats (blueprint F10).
 *
 * @param provider - The discovery root's provider.
 * @param directory - Root-relative project directory.
 * @returns The directory's reading; never throws for manifest content.
 */
async function readProjectDirectory(
  provider: FileSystemProvider,
  directory: string,
  knownProject = false,
): Promise<ProjectDirectoryReading> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await provider.readFile(joinRelativePath(directory, 'tau.json'));
  } catch (error) {
    if (!isNotFoundError(error)) {
      return {
        kind: 'invalid',
        issue: { code: 'manifest-unreadable', message: error instanceof Error ? error.message : String(error) },
      };
    }
    // One listing, no `stat`: it both proves Tau state and finds the likely main entry.
    const entries = await readDirectoryEntries(provider, directory).catch(() => []);
    if (!knownProject && !entries.some((entry) => entry.kind === 'dir' && entry.name === '.tau')) {
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
  const read = readProjectManifestBytes(bytes);
  if (read.success) {
    return read.issue === undefined
      ? { kind: 'identified', manifest: read.data }
      : { kind: 'identified', manifest: read.data, issue: read.issue };
  }
  if (read.adoptable === undefined) {
    return { kind: 'invalid', issue: read.issue };
  }
  return {
    kind: 'adoptable',
    manifest: read.adoptable.name === '' ? { ...read.adoptable, name: basenameOf(directory) } : read.adoptable,
    issue: read.issue,
  };
}

/**
 * The project-directory lifecycle over the authority's own collaborators.
 *
 * @public
 */
export class ProjectDirectories {
  private readonly _registry: ProviderRegistry;
  private readonly _resourceQueue: ResourceQueue;
  private readonly _crossTabCoordinator: CrossTabCoordinator;
  private readonly _pipeline: MutationPipeline;
  private readonly _treeIndexes: TreeIndexes;
  /** The configured discovery roots, owned by the authority's mount lifecycle. */
  private readonly _discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
  private readonly _isKnownProject: (storageRootKey: string, directory: string) => boolean;
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
    isKnownProject: (storageRootKey: string, directory: string) => boolean;
    filePool: () => SharedPool | undefined;
    revokeProjectRoute: (path: string, notifyPeers: boolean) => void;
  }) {
    this._registry = options.registry;
    this._resourceQueue = options.resourceQueue;
    this._crossTabCoordinator = options.crossTabCoordinator;
    this._pipeline = options.pipeline;
    this._treeIndexes = options.treeIndexes;
    this._discoveryRoots = options.discoveryRoots;
    this._filePool = options.filePool;
    this._isKnownProject = options.isKnownProject;
    this._revokeProjectRoute = options.revokeProjectRoute;
  }

  /**
   * Discover projects at a selected root and at every nested directory. Hidden
   * directories, dependencies and symbolic links are outside discovery.
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
      const directories: string[] = [];
      const failures: string[] = [];
      const pending = [''];
      while (pending.length > 0) {
        const batch = pending.splice(0, manifestProbeConcurrency);
        const listings = await Promise.all(
          batch.map(async (directory) => {
            try {
              return { directory, entries: await readDirectoryEntries(provider, directory) };
            } catch (error) {
              failures.push(`${directory || '.'}: ${error instanceof Error ? error.message : String(error)}`);
              return undefined;
            }
          }),
        );
        for (const listing of listings) {
          if (listing === undefined) {
            continue;
          }
          const { directory, entries } = listing;
          // A selected root's .tau directory is workspace metadata, not evidence
          // of a missing project. Descendants retain explicit recovery behavior.
          if (
            this._isKnownProject(storageRootKey, directory) ||
            entries.some((entry) => entry.name === 'tau.json' && entry.kind === 'file') ||
            (directory !== '' && entries.some((entry) => entry.name === '.tau' && entry.kind === 'dir'))
          ) {
            directories.push(directory);
          }
          pending.push(
            ...entries
              .filter(
                (entry) =>
                  entry.kind === 'dir' &&
                  !entry.isSymbolicLink &&
                  !entry.name.startsWith('.') &&
                  entry.name !== 'node_modules',
              )
              .map((entry) => joinRelativePath(directory, entry.name))
              .sort(),
          );
        }
      }
      directories.sort();
      const probe = async (directory: string): Promise<ProjectDiscoveryEntry | undefined> => {
        const relativeDirectory = assertRootedPath(directory);
        const locator = projectLocatorFor(root, storageRootKey, relativeDirectory);
        // An unreadable manifest is quarantined in place; an unreadable
        // directory separately marks the root incomplete for reconciliation.
        const reading = await readProjectDirectory(
          provider,
          relativeDirectory,
          this._isKnownProject(storageRootKey, relativeDirectory),
        );
        switch (reading.kind) {
          case 'not-a-project': {
            return undefined;
          }
          case 'identified': {
            return reading.issue === undefined
              ? { status: 'valid', manifest: reading.manifest, locator }
              : { status: 'valid', manifest: reading.manifest, locator, issue: reading.issue };
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
      roots.push(
        failures.length === 0
          ? { status: 'complete', root }
          : { status: 'inaccessible', root, reason: failures.sort().join('; ') },
      );
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
        occurrenceCount.set(entry.manifest.id, (occurrenceCount.get(entry.manifest.id) ?? 0) + 1);
      }
    }
    const entries = discovered.map(
      (entry): ProjectDiscoveryEntry =>
        entry.status === 'valid' && (occurrenceCount.get(entry.manifest.id) ?? 0) > 1
          ? { ...entry, status: 'duplicate-id' }
          : entry,
    );
    return { entries, roots };
  }

  /**
   * Resolve explicit reusable files from a project and each ancestor manifest.
   * Globs are rooted at their declaring library, never at the process directory.
   *
   * @param input - Exact discovered project locator.
   * @returns Deterministic parts with provenance and incomplete-library issues.
   */
  public async listProjectParts(input: { readonly project: ProjectLocator }): Promise<ListProjectPartsResult> {
    const { project } = input;
    if (
      assertRootedPath(project.relativeDirectory) !== project.relativeDirectory ||
      !isProjectDirectoryPath(project.relativeDirectory)
    ) {
      throw new TypeError('Parts lookup requires a canonical project directory.');
    }
    const root = this._discoveryRoots().find((candidate) => candidate.storageRootKey === project.storageRootKey);
    if (root === undefined) {
      throw new TypeError('Parts lookup requires a configured discovery root.');
    }
    const discovery = await this.listProjectManifests();
    const owner = resolveProjectForPath(discovery, project.storageRootKey, project.relativeDirectory);
    if (owner?.status !== 'valid' || owner.locator.relativeDirectory !== project.relativeDirectory) {
      throw new TypeError('Parts lookup requires an unambiguous discovered project.');
    }
    const libraries = discovery.entries
      .filter(
        ({ locator }) =>
          locator.storageRootKey === project.storageRootKey &&
          (locator.relativeDirectory === '' ||
            locator.relativeDirectory === project.relativeDirectory ||
            project.relativeDirectory.startsWith(`${locator.relativeDirectory}/`)),
      )
      .sort((left, right) => right.locator.relativeDirectory.length - left.locator.relativeDirectory.length);
    const provider = await this._registry.getProvider(root.scope);
    const parts: ProjectPart[] = [];
    const issues: Array<ListProjectPartsResult['issues'][number]> = [];
    const seen = new Set<string>();
    if (discovery.roots.some((status) => status.status === 'inaccessible' && status.root === root.root)) {
      issues.push({ code: 'library-unreadable', path: '' });
    }
    /* oxlint-disable no-await-in-loop -- Library walks are deliberately bounded and nearest declarations win. */
    for (const library of libraries) {
      const declaredBy = joinRelativePath(library.locator.relativeDirectory, 'tau.json');
      if (library.status !== 'valid') {
        issues.push({ code: 'library-invalid', path: declaredBy });
        continue;
      }
      if (library.issue !== undefined) {
        issues.push({ code: 'library-invalid', path: declaredBy });
      }
      const declaration = library.manifest.parts;
      if (declaration === undefined || declaration.include.length === 0) {
        continue;
      }
      const pending = [''];
      while (pending.length > 0) {
        const relative = pending.pop()!;
        const directory = joinRelativePath(library.locator.relativeDirectory, relative);
        let entries;
        try {
          entries = await readDirectoryEntries(provider, directory);
        } catch {
          issues.push({ code: 'library-unreadable', path: directory });
          continue;
        }
        for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
          if (
            entry.isSymbolicLink === true ||
            entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'tau.json'
          ) {
            continue;
          }
          const entryPath = joinRelativePath(relative, entry.name);
          if (entry.kind === 'dir') {
            pending.push(entryPath);
          } else if (
            declaration.include.some((pattern) => matchesGlob(entryPath, pattern)) &&
            !declaration.exclude?.some((pattern) => matchesGlob(entryPath, pattern))
          ) {
            const physicalPath = joinRelativePath(library.locator.relativeDirectory, entryPath);
            if (!seen.has(physicalPath)) {
              seen.add(physicalPath);
              parts.push({ library: library.locator, entryPath, declaredBy });
            }
          }
        }
      }
    }
    /* oxlint-enable no-await-in-loop */
    return {
      parts: parts.sort(
        (left, right) =>
          right.library.relativeDirectory.length - left.library.relativeDirectory.length ||
          left.entryPath.localeCompare(right.entryPath),
      ),
      issues,
    };
  }

  /**
   * Give an `adoption-required` project directory a Tau identity in place,
   * writing the salvaged declaration discovery showed. Service-side because the
   * write must re-establish adoptability under the same physical lock every
   * other project mutation takes — a UI-side read/modify/write could adopt a
   * directory a sibling tab just repaired.
   *
   * @param locator - Discovery locator of the directory to adopt.
   * @param options - `id` restores the identity this exact directory's route was bound to; absent mints a fresh one.
   * @returns The manifest now on disk, identity included.
   */
  public async adoptProjectDirectory(
    locator: ProjectLocator,
    options?: { readonly id?: string },
  ): Promise<ProjectManifest> {
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
    const locks = projectDirectoryLocks(locator.storageRootKey, path);
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        const reading = await readProjectDirectory(provider, path, this._isKnownProject(locator.storageRootKey, path));
        if (reading.kind !== 'adoptable') {
          throw new TypeError(`Project directory is not adoptable: ${path}`);
        }
        const manifest = projectToManifest({
          ...reading.manifest,
          id: options?.id ?? generatePrefixedId(idPrefix.project),
        });
        await provider.writeFile(joinRelativePath(path, 'tau.json'), serializeProjectManifest(manifest));
        this._pipeline.publishPhysicalDirectoryChange(locator.storageRootKey, path);
        this._crossTabCoordinator.notifyDirectoryChange('/', this._scopedPhysicalAuthority(root.scope, ''));
        return manifest;
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
    if (path === '' || !isProjectDirectoryPath(path)) {
      throw new TypeError(
        'Permanent delete requires a descendant project directory; disconnect a selected root instead.',
      );
    }
    // `StorageRootConfig` has no ephemeral member, but an untyped RPC caller can
    // still deliver one, and this operation must never run against it.
    if (!isDurableScope(input.scope)) {
      throw new TypeError('Permanent project deletion requires durable storage.');
    }
    const scope: StorageRootConfig = { ...input.scope };
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const locks = [`project:${projectId}`, ...projectDirectoryLocks(this._registry.resolveStorageRootKey(scope), path)];
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
        // Identity is what deletion verifies; a degraded declaration still carries it.
        const parsed = readProjectManifestBytes(manifest);
        if (!parsed.success) {
          return { status: 'unidentifiable' };
        }
        if (parsed.data.id !== projectId) {
          return { status: 'identity-mismatch', actualProjectId: parsed.data.id };
        }

        await this._assertNoNestedProjects(provider, path);
        this._revokeProjectRoute(logicalRoot, true);
        const separator = path.lastIndexOf('/');
        const physicalParent = separator === -1 ? '' : path.slice(0, separator);
        const authorityParent = physicalParent === '' ? '/' : `/${physicalParent}`;
        const parentAuthority = this._scopedPhysicalAuthority(scope, physicalParent);
        try {
          await this._deleteProjectDirectory(provider, path, manifest);
        } finally {
          this._filePool()?.clear();
          this._pipeline.publishPhysicalDirectoryChange(this._registry.resolveStorageRootKey(scope), path);
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
    const locks = [`project:${projectId}`, ...projectDirectoryLocks(storageRootKey, path)];

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
              if (!existing.success) {
                return { status: 'unidentifiable-manifest' };
              }
              if (existing.data.id !== projectId) {
                return { status: 'identity-mismatch', actualProjectId: existing.data.id };
              }
              return { status: 'already-committed' };
            }
            await this._assertNoNestedProjects(provider, path);
            mutationBegan = true;
            await this._pipeline.rmdirRecursive(provider, path);
          }

          mutationBegan = true;
          await provider.mkdir(path, { recursive: true });
          this._filePool()?.clear();
          this._treeIndexes.removeDirectory(logicalRoot);

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
          if (!committed.success || committed.data.id !== projectId) {
            throw new Error(`Pending project manifest verification failed for ${projectId}`);
          }

          this._pipeline.publishPhysicalDirectoryChange(storageRootKey, path, context);
          this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          return { status: 'committed' };
        } catch (error) {
          if (mutationBegan) {
            this._filePool()?.clear();
            this._treeIndexes.removeDirectory(logicalRoot);
            this._pipeline.publishPhysicalDirectoryChange(storageRootKey, path, context);
            this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          }
          throw error;
        }
      }),
    );
  }

  private async _assertNoNestedProjects(provider: FileSystemProvider, directory: string): Promise<void> {
    const pending = [directory];
    while (pending.length > 0) {
      const current = pending.pop()!;
      // oxlint-disable-next-line no-await-in-loop -- Preflight must finish before deletion starts.
      const entries = await readDirectoryEntries(provider, current);
      if (current !== directory && entries.some((entry) => entry.name === 'tau.json')) {
        throw new TypeError(`Cannot remove a directory containing a nested project: ${current}`);
      }
      pending.push(
        ...entries
          .filter(
            (entry) =>
              entry.kind === 'dir' &&
              !entry.isSymbolicLink &&
              !entry.name.startsWith('.') &&
              entry.name !== 'node_modules',
          )
          .map((entry) => joinRelativePath(current, entry.name)),
      );
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
    const projectId = parsedManifest.data.id;
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

  private async _deleteProjectDirectory(
    provider: FileSystemProvider,
    directoryPath: string,
    manifest: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const manifestPath = joinRelativePath(directoryPath, 'tau.json');
    const entries = await provider.readdir(directoryPath);
    for (const entry of entries) {
      if (entry === 'tau.json') {
        continue;
      }
      const fullPath = joinRelativePath(directoryPath, entry);
      // oxlint-disable-next-line no-await-in-loop -- Preserve the manifest until every sibling is gone.
      await this._pipeline.removeRecursive(provider, fullPath);
    }
    await provider.unlink(manifestPath);
    try {
      await provider.rmdir(directoryPath);
    } catch (error) {
      try {
        if ((await provider.exists(directoryPath)) && !(await provider.exists(manifestPath))) {
          await provider.writeFile(manifestPath, manifest);
        }
      } catch {
        // Best effort only: preserve the original directory-removal failure.
      }
      throw error;
    }
  }
}
