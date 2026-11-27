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
import type { FileSystemProvider, WorkspaceMutationContext } from '#types.js';
import type { BatchEntry } from '#changeset.js';
import type {
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  ProjectRootConfiguration,
  RootState,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { ChangeNotification, CrossTabCoordinator, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { MutationPipeline } from '#mutation-pipeline.js';
import { isProjectDirectoryPath } from '#mutation-pipeline.js';
import type { ProjectIndexes } from '#project-index/project-indexes.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import { isDurableScope, projectLocatorFor } from '#backend/scope.js';
import { isNotFoundError } from '#workspace-errors.js';
import { projectRoute } from '#project-routes.js';
import {
  importStagingDirectory,
  isTauControlPath,
  ownsImportTarget,
  placeStagedControl,
  readStagedImport,
  releaseStagedImport,
} from '#importer/staging.js';
import type { ImportStagingPort, StagedImport } from '#importer/staging.js';
import { importFactsPath } from '#importer/facts.js';
import type { ImportFactsRecord, RecordedImportEntry, StagedImportEntry } from '#importer/facts.js';
import { isReservedImportPath } from '#importer/path-policy.js';
import { directoryConcurrency, mapConcurrent } from '#concurrency.js';
import { workerTimings } from '#worker-timings.js';
import type { ProjectDirectoryIndex } from '#project-directory-index.js';
import { foldPathSpelling } from '#path-fold.js';

/** Declaration or generated-identity failure affecting one discovery entry. @public */
export type ProjectDiscoveryIssue =
  | ProjectManifestParseIssue
  | { readonly code: 'identity-invalid'; readonly message: string }
  | { readonly code: 'identity-unavailable'; readonly message: string }
  | { readonly code: 'identity-conflict'; readonly expectedProjectId: string; readonly actualProjectId: string };

/** What one immediate child directory of a discovery root holds, as far as project identity goes. @public */
export type ProjectDirectoryReading =
  | { readonly kind: 'not-a-project' }
  | {
      readonly kind: 'identified';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly issue?: ProjectManifestParseIssue;
    }
  | { readonly kind: 'adoptable'; readonly manifest: ProjectManifest; readonly issue: ProjectManifestParseIssue }
  | { readonly kind: 'invalid'; readonly issue: ProjectDiscoveryIssue };

/** A provider whose host copies a person's chosen source into it (the desktop node client, W7.4). */
/**
 * When a discovered project's `tau.json` last changed, or nothing when its provider cannot say: a failed stat or a
 * synthesised zero leaves the time out rather than inventing one.
 *
 * @param provider - The provider of the copy's root, as the scan resolved it.
 * @param locator - The copy.
 * @returns The manifest's modification time in milliseconds, when known.
 */
const manifestModifiedAt = async (
  provider: FileSystemProvider | undefined,
  locator: ProjectLocator,
): Promise<number | undefined> => {
  try {
    const stat = await provider?.stat(`${locator.relativeDirectory}/tau.json`);
    return stat !== undefined && stat.mtimeMs > 0 ? stat.mtimeMs : undefined;
  } catch {
    return undefined;
  }
};

/** One exact physical directory: its storage root and its canonical path inside it. */
type PhysicalDirectory = Readonly<{ storageRootKey: string; providerBasePath: string }>;

type HostImportCopier = Readonly<{ copyFromImportGrant: NonNullable<ImportStagingPort['copyHost']> }>;

/** What the sweep answers for a directory it could not read. */
const unknownIdentity = '\0unknown';

/** Concurrent `tau.json` probes while scanning a discovery root. */
const manifestProbeConcurrency = 64;

/** Resolved identity kept separate from the authored declaration. @public */
export type ResolvedProjectManifest = {
  readonly projectId: string;
  readonly manifest: ProjectManifest;
};

/** Read-only verification of an already installed project binding. @public */
export type ProjectRouteVerification =
  | {
      readonly status: 'verified';
      readonly project: ResolvedProjectManifest;
      /**
       * The root of the directory the bytes were read from: the one the route bound when it was read. An authority
       * older than this field leaves it and `providerBasePath` out, so a caller that needs a particular copy proven
       * treats their absence as no proof.
       */
      readonly storageRootKey?: string;
      /** That directory under its root, as a discovery locator's `relativeDirectory` names it. */
      readonly providerBasePath?: string;
    }
  | { readonly status: 'discovery-required' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'superseded' };

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
      /** When this copy's `tau.json` last changed; read only while another directory carries the same id. */
      readonly modifiedAt?: number;
    }
  | {
      readonly status: 'duplicate-id';
      readonly projectId: string;
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue?: ProjectManifestParseIssue;
      /** When this copy's `tau.json` last changed, so a person can tell the copies apart. */
      readonly modifiedAt?: number;
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
    staging: z.object({ operationId: z.string().regex(/^[\w-]{1,128}$/u) }).optional(),
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
      /* Every spelling a filesystem resolves onto the manifest or the identity (case, trailing dots, streams). */
      if (isReservedImportPath(relativePath)) {
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

/** A reading, and whether the bytes read determined it: false for an I/O failure other than a not-found (A2 g). */
type DirectoryRead = Readonly<{ reading: ProjectDirectoryReading; determined: boolean }>;

/**
 * Whether no configured root of a discovery carries an id (index-contract review A1). `unknown` when a root was not
 * available or a read failed with anything but not-found: that proves nothing.
 *
 * @public
 */
export type ProjectAbsence =
  | { readonly status: 'absent' }
  | { readonly status: 'present'; readonly locators: readonly ProjectLocator[] }
  | { readonly status: 'unknown'; readonly reason: string };

/**
 * What a probe read at one known location of an id (fast-path FW3): `held` when its manifest reads and its identity
 * names the id (or, with no identity record, a legacy manifest declares it); `vacant` when the bytes say otherwise (gone,
 * no manifest, another id); `unknown` when its root is not available or a read failed with anything but not-found.
 * Only `held` proves a copy; `unknown` proves nothing either way.
 *
 * @public
 */
export type ProjectProbeLocation = Readonly<{ locator: ProjectLocator; status: 'held' | 'vacant' | 'unknown' }>;

/**
 * A probe (fast-path FW3): locations of `projectId`, the caller's `locators` and with `known` the discovery index's,
 * each read under the id's lock, `except` left out; and, with `root`, a fresh listing of that root's child names.
 *
 * @public
 */
export type ProjectDirectoryProbeRequest = Readonly<{
  projectId?: string;
  locators?: readonly ProjectLocator[];
  /** Also probe every directory the discovery index last read carrying the id (`locationsOf`). */
  known?: boolean;
  except?: Readonly<{ storageRootKey: string; relativeDirectory: string }>;
  /** Locations under a pending delete, which prove nothing and are left out (FW3 review M2). */
  exclude?: ReadonlyArray<Readonly<{ storageRootKey: string; relativeDirectory: string }>>;
  /** A configured root, by key, whose child names to list afresh: what allocating a new project's directory reads. */
  root?: string;
}>;

/**
 * What a probe read (fast-path FW3). `names` is set only when a root was asked for and could be listed.
 *
 * @public
 */
export type ProjectDirectoryProbe = Readonly<{
  locations: readonly ProjectProbeLocation[];
  names?: readonly string[];
}>;

/** A location the authority probes: the root it is in and the directory under it. */
type ProbeTarget = Readonly<{ storageRootKey: string; relativeDirectory: string; locator?: ProjectLocator }>;

/** What a discovery root's live channels say about how its index is kept current (A3). @public */
export type DiscoveryRootChannels = Readonly<{
  /** The root has a snapshot source a poll can walk. */
  snapshot: boolean;
  /** A native observer is delivering. */
  native: boolean;
  /** The interval between the last two discovery-wide polls, when known. */
  pollPeriodMilliseconds?: number;
}>;

/** How long the audit takes to re-read every warm directory once (A4). @public */
export const discoveryAuditIntervalMilliseconds = 10 * 60_000;

/** A shared root served from the index is complete only inside its freshness window (A3). */
const freshnessWindow = (channels: DiscoveryRootChannels | undefined): number => {
  if (channels?.snapshot === true && channels.native) {
    return 5 * 60_000;
  }
  if (channels?.snapshot === true) {
    /* The page walks a whole unobserved folder every fifth poll: every 10 s focused, every 50 s blurred. The period is
     * the time between two such walks, clamped to that cadence, so a longer gap (a hidden tab) never stretches the
     * window (review m3) and a shorter one never shrinks it below what the page's walks keep (review N4). */
    const pollPeriod = Math.min(Math.max(channels.pollPeriodMilliseconds ?? 10_000, 10_000), 50_000);
    return Math.max(3 * pollPeriod, 30_000);
  }
  return discoveryAuditIntervalMilliseconds;
};

type DirectoryAuthority = {
  readonly provider: FileSystemProvider;
  readonly directory: string;
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
  readonly alreadyLocked?: boolean;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * A notice fact that names one physical path of a root for a sibling's discovery index (A2 b): its logical path is
 * the root's, so no tab routes it, and its physical authority is the path itself.
 *
 * @param storageRootKey - The root.
 * @param providerPath - The directory, or a file under it.
 * @returns The fact.
 */
const namedDirectoryFact = (storageRootKey: string, providerPath: string): ChangeNotification => ({
  type: 'directory-change',
  path: '/',
  authority: { storageRootKey, providerBasePath: assertRootedPath(providerPath) },
});

/**
 * The discovery entry a directory's reading lists, or none for a directory that is not a project.
 *
 * @param reading - What the directory holds.
 * @param locator - Where it is.
 * @returns The entry.
 */
const discoveryEntryOf = (
  reading: ProjectDirectoryReading,
  locator: ProjectLocator,
): ProjectDiscoveryEntry | undefined => {
  switch (reading.kind) {
    case 'not-a-project': {
      return undefined;
    }
    case 'identified': {
      return reading.issue === undefined
        ? { status: 'valid', projectId: reading.projectId, manifest: reading.manifest, locator }
        : { status: 'valid', projectId: reading.projectId, manifest: reading.manifest, locator, issue: reading.issue };
    }
    case 'adoptable': {
      return { status: 'adoption-required', manifest: reading.manifest, locator, issue: reading.issue };
    }
    case 'invalid': {
      return { status: 'invalid', locator, issue: reading.issue };
    }
  }
};

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
  private readonly _projectIndexes: ProjectIndexes;
  /** The configured discovery roots, owned by the authority's mount lifecycle. */
  private readonly _discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
  /** A root's published state; a root that is not `available` is never scanned (blueprint D1). */
  private readonly _rootState: (storageRootKey: string) => RootState | 'pending' | undefined;
  /**
   * Retire one logical project route the authority installed, as a delete must. With `boundTo`, only while the route
   * is mounted on that exact directory: another copy of the id keeps the route it holds.
   */
  private readonly _revokeProjectRoute: (path: string, notifyPeers: boolean, boundTo?: PhysicalDirectory) => void;
  /** The discovery index: a listing cache that nominates and never decides (FW2). */
  private readonly _index: ProjectDirectoryIndex<ProjectDirectoryReading>;
  /** A root's live channels, from the external-change ingest. */
  private readonly _rootChannels: (storageRootKey: string) => DiscoveryRootChannels | undefined;
  /** One snapshot poll of a root that can be polled; resolves whether it ran. */
  private readonly _validateRoot: (storageRootKey: string) => Promise<boolean>;
  /** Resolves once a root's observer and poll baseline are in place, before its first read (A2 e, A3). */
  private readonly _channelsArmed: (storageRootKey: string) => Promise<void>;
  /** Tell the page what an audit found: the root's listing changed with no other evidence (A4). */
  private readonly _onAuditChange: (storageRootKey: string) => void;
  /** When each root's audit cycle began. */
  private readonly _auditCycles = new Map<string, number>();
  /** When each root's audit last completed a whole cycle. */
  private readonly _auditCompleted = new Map<string, number>();

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
    projectIndexes: ProjectIndexes;
    discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
    /** A root's admission state; `pending` while a non-Home root is still being admitted. */
    rootState?: (storageRootKey: string) => RootState | 'pending' | undefined;
    revokeProjectRoute: (path: string, notifyPeers: boolean, boundTo?: PhysicalDirectory) => void;
    index: ProjectDirectoryIndex<ProjectDirectoryReading>;
    rootChannels?: (storageRootKey: string) => DiscoveryRootChannels | undefined;
    validateRoot?: (storageRootKey: string) => Promise<boolean>;
    channelsArmed?: (storageRootKey: string) => Promise<void>;
    onAuditChange?: (storageRootKey: string) => void;
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
    this._projectIndexes = options.projectIndexes;
    this._discoveryRoots = options.discoveryRoots;
    this._rootState = options.rootState ?? (() => undefined);
    this._revokeProjectRoute = options.revokeProjectRoute;
    this._index = options.index;
    this._rootChannels = options.rootChannels ?? (() => undefined);
    this._validateRoot = options.validateRoot ?? (async () => false);
    this._channelsArmed = options.channelsArmed ?? (async () => undefined);
    this._onAuditChange = options.onAuditChange ?? (() => undefined);
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
    /** The provider of each root this pass completed, for the copies told apart by time. */
    const providers = new Map<string, FileSystemProvider>();
    /* oxlint-disable eslint/no-await-in-loop -- Root passes are deliberately serialized to bound filesystem-handle and IndexedDB pressure. */
    for (const resolvedRoot of this._discoveryRoots()) {
      const { root, storageRootKey } = resolvedRoot;
      /* Home is the first root and is read first; a root that is lost, hung
       * or still being admitted is reported by its state without resolving its
       * provider, so it cannot hold Home's project list. */
      const state = this._rootState(storageRootKey);
      if (state !== undefined && state !== 'available') {
        roots.push({ status: 'inaccessible', root, reason: state });
        continue;
      }
      let provider: FileSystemProvider;
      try {
        provider = await this._registry.getProvider(resolvedRoot.scope);
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: errorMessage(error) });
        continue;
      }
      const readings = await this._passRoot(resolvedRoot, provider);
      if (readings.status === 'inaccessible') {
        roots.push({ status: 'inaccessible', root, reason: readings.reason });
        continue;
      }
      for (const [directory, reading] of readings.readings) {
        const entry = discoveryEntryOf(reading, projectLocatorFor(root, storageRootKey, assertRootedPath(directory)));
        if (entry !== undefined) {
          discovered.push(entry);
        }
      }
      providers.set(storageRootKey, provider);
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
    /* Only copies that share an id are told apart by time: one stat each, never one per project. */
    const entries = await Promise.all(
      discovered.map(async (entry): Promise<ProjectDiscoveryEntry> => {
        if (entry.status !== 'valid' || (occurrenceCount.get(entry.projectId) ?? 0) <= 1) {
          return entry;
        }
        const { storageRootKey, relativeDirectory } = entry.locator;
        const indexed = this._index.entry(storageRootKey, relativeDirectory);
        let modifiedAt = indexed?.modifiedAt;
        if (indexed === undefined || !('modifiedAt' in indexed)) {
          const version = this._index.version(storageRootKey, relativeDirectory);
          modifiedAt = await manifestModifiedAt(providers.get(storageRootKey), entry.locator);
          this._index.installModifiedAt(storageRootKey, relativeDirectory, { version, modifiedAt });
        }
        return { ...entry, status: 'duplicate-id', ...(modifiedAt === undefined ? {} : { modifiedAt }) };
      }),
    );
    return { entries, roots };
  }

  /**
   * Prove from storage whether any configured root still carries `projectId` (index-contract review A1): the one
   * question that needs every directory, and the one the index is never asked. Under `project:<id>`, which every Tau
   * writer of the id holds; every configured root must be available, each root's names are listed afresh, and each
   * directory's identity record is read through handles resolved for the sweep. A directory with no identity record
   * counts by the id discovery would give it from `tau.json` (a legacy manifest's), writing nothing: a modern
   * declaration with no record would be minted a new id, which is never this one. Any failure but a not-found answers
   * `unknown`. What the sweep reads is evidence: a directory or a name the index has otherwise is read again by the
   * next pass.
   *
   * @param projectId - The id.
   * @param options - `alreadyLocked` when the caller holds `project:<id>`; `except` a directory to leave out (adopt's).
   * @returns `absent`, `present` with every directory that carries the id, or `unknown`.
   */
  public async verifyAbsent(
    projectId: string,
    options?: Readonly<{ alreadyLocked?: boolean; except?: PhysicalDirectory }>,
  ): Promise<ProjectAbsence> {
    if (!projectIdSchema.safeParse(projectId).success) {
      throw new TypeError(`Invalid project id: ${JSON.stringify(projectId)}`);
    }
    const sweep = async (): Promise<ProjectAbsence> => {
      workerTimings.count('discovery.identitySweep');
      const locators: ProjectLocator[] = [];
      const roots = this._discoveryRoots();
      /* Every root must be available, or the answer is unknown: checked before any I/O, so a lost folder costs the
       * other roots no read (review M4). */
      for (const { storageRootKey } of roots) {
        const state = this._rootState(storageRootKey);
        if (state !== undefined && state !== 'available') {
          return { status: 'unknown', reason: `root ${state}` };
        }
      }
      /* oxlint-disable eslint/no-await-in-loop -- Roots are swept one after another, as a pass reads them. */
      for (const { root, scope, storageRootKey } of roots) {
        let provider: FileSystemProvider;
        try {
          provider = await this._registry.getProvider(scope);
        } catch (error) {
          return { status: 'unknown', reason: errorMessage(error) };
        }
        const names = await this._listNames(provider);
        if (!Array.isArray(names)) {
          return { status: 'unknown', reason: errorMessage(names.error) };
        }
        this._compareNames(storageRootKey, names);
        const swept = names.filter(
          (name) => options?.except?.storageRootKey !== storageRootKey || options.except.providerBasePath !== name,
        );
        try {
          await provider.refresh?.(swept);
        } catch (error) {
          return { status: 'unknown', reason: errorMessage(error) };
        }
        for (let offset = 0; offset < swept.length; offset += manifestProbeConcurrency) {
          const ids = await Promise.all(
            swept.slice(offset, offset + manifestProbeConcurrency).map(async (name) => {
              const id = await this._sweptIdentity(provider, name);
              const entry = this._index.entry(storageRootKey, name);
              const entryId = entry?.reading.kind === 'identified' ? entry.reading.projectId : undefined;
              if (id !== unknownIdentity && entry !== undefined && id !== entryId) {
                this._index.note(storageRootKey, [name]);
              }
              return [name, id] as const;
            }),
          );
          if (ids.some(([, id]) => id === unknownIdentity)) {
            return { status: 'unknown', reason: 'A directory could not be read.' };
          }
          for (const [name, id] of ids) {
            if (id === projectId) {
              locators.push(projectLocatorFor(root, storageRootKey, assertRootedPath(name)));
            }
          }
        }
      }
      /* oxlint-enable eslint/no-await-in-loop -- End serial root sweep. */
      return locators.length === 0 ? { status: 'absent' } : { status: 'present', locators };
    };
    if (options?.alreadyLocked === true) {
      return sweep();
    }
    const locks = [`project:${projectId}`];
    return this._crossTabCoordinator.withLocks(locks, async () => this._resourceQueue.queueForMany(locks, sweep));
  }

  /**
   * Read known locations of an id from storage (fast-path FW3, `probe`): the caller's `locators` and the directories
   * the discovery index last read carrying the id (`locationsOf`), `except` left out, each under the id's lock and its
   * own physical lock, as `verifyProjectRoute` reads a route. Nothing is decided from the index: it only nominates, and
   * each location's answer is the bytes read now. What a probe reads is evidence for the index. With `root`, the
   * root's child names are listed afresh as well, for a new project's directory to be allocated against.
   *
   * @param request - The id and its nominations, and the root whose names to list.
   * @returns Each location's answer, and the root's names when they could be listed.
   */
  public async probeProjectDirectories(request: ProjectDirectoryProbeRequest): Promise<ProjectDirectoryProbe> {
    const { projectId } = request;
    if (projectId !== undefined && !projectIdSchema.safeParse(projectId).success) {
      throw new TypeError(`Invalid project id: ${JSON.stringify(projectId)}`);
    }
    const names = request.root === undefined ? undefined : await this._rootNames(request.root);
    const named = names === undefined ? {} : { names };
    if (projectId === undefined) {
      return { locations: [], ...named };
    }
    const targets = this._nominations(projectId, {
      locators: request.locators ?? [],
      except: [...(request.except === undefined ? [] : [request.except]), ...(request.exclude ?? [])],
      known: request.known === true,
    });
    if (targets.length === 0) {
      return { locations: [], ...named };
    }
    const locks = [
      `project:${projectId}`,
      ...targets
        .filter((target) => isProjectDirectoryPath(target.relativeDirectory))
        .map((target) => `${target.storageRootKey}:${target.relativeDirectory}`),
    ];
    const locations = await this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => this._probe(projectId, targets)),
    );
    return { locations, ...named };
  }

  /**
   * Re-read the next warm directories from content with no evidence asking (A4), and the root's names at the start of
   * each root's cycle. A reading that differs from the index's entry is installed, counted under its root's kind and
   * reported, since no evidence moved the page's epoch for it. A root whose cycle completes was compared with storage
   * as a whole from when the cycle began.
   *
   * @param share - The share of each root's directories to re-read, from 0 to 1; a whole cycle when omitted.
   * @returns When every warm root last completed a whole cycle (the oldest of them), or undefined while one has not
   *   completed one yet. The rolling audit reports its own cycles, so the caller runs an overdue whole cycle only when
   *   the rolling one fell behind (review M3).
   */
  public async auditDiscovery(share?: number): Promise<number | undefined> {
    let oldestCycle = Number.POSITIVE_INFINITY;
    /* oxlint-disable eslint/no-await-in-loop -- The audit is background work: one directory batch at a time. */
    for (const { scope, storageRootKey } of this._discoveryRoots()) {
      const view = this._index.view(storageRootKey);
      const state = this._rootState(storageRootKey);
      if (view?.currency !== 'warm' || (state !== undefined && state !== 'available')) {
        continue;
      }
      const completed = await this._auditRoot({ scope, storageRootKey, view }, share);
      /* A root whose audit failed this time is left out: it would hold every other root's cycle back (review N1). */
      if (completed !== undefined) {
        oldestCycle = Math.min(oldestCycle, completed);
      }
    }
    /* oxlint-enable eslint/no-await-in-loop -- End audit. */
    return Number.isFinite(oldestCycle) ? oldestCycle : undefined;
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
    /* A remembered id is restored under its project lock, which every Tau writer of the id holds, so no delete of its
     * last copy can decide meanwhile that none remains (blueprint, mutation protocols step 8). */
    const locks = options?.id === undefined ? [physicalLock] : [`project:${options.id}`, physicalLock];
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
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
        /* Storage decides (A1): the id is restored only while no other directory carries it; otherwise one is minted. */
        const absence =
          options?.id === undefined
            ? undefined
            : await this.verifyAbsent(options.id, {
                alreadyLocked: true,
                except: { storageRootKey: locator.storageRootKey, providerBasePath: path },
              });
        const restored = absence?.status === 'absent' ? options?.id : undefined;
        const identity = await this._resolveIdentity({
          ...authority,
          preferredProjectId: restored,
          alreadyLocked: true,
        });
        if (identity.status !== 'resolved') {
          throw new Error(`Project identity could not be established: ${JSON.stringify(identity)}`);
        }
        const manifest = projectToManifest(reading.manifest);
        await provider.writeFile(`${path}/tau.json`, serializeProjectManifest(manifest));
        this._crossTabCoordinator.notifyChanges([
          { type: 'directory-change', path: '/', authority: this._scopedPhysicalAuthority(root.scope, '') },
          namedDirectoryFact(locator.storageRootKey, `${path}/tau.json`),
        ]);
        return { projectId: identity.projectId, manifest };
      }),
    );
  }

  /**
   * Permanently remove one exact physical project directory. Identity is
   * re-established under the same project-wide lock that all logical project
   * mutations acquire, so no write can race the verification/delete window.
   * Other directories that carry the same id are untouched, and so is the
   * project route while it is mounted on one of them.
   *
   * Under the same hold of `project:<id>` it also answers what is left of the id (fast-path FW3, step 5): the other
   * known locations are probed and, when none holds the id, the identity sweep decides, so no copy can come or go
   * between the removal and the answer for any Tau writer, all of which hold that lock. With `copy` set (the journal
   * waived the Trash because another copy was proven), a surviving copy is proven again from storage before anything
   * is removed, and the delete is refused when none holds the id: two deletes of the last two copies, each proven by
   * the other, leave one.
   *
   * The removal takes every entry but the two identity markers, then the manifest, and the identity record last, as a
   * commit writes the manifest last. A directory found with no manifest is a removal this authority began and is
   * finished when it holds nothing, or nothing but an identity record naming the id; anything else is left alone.
   *
   * @param input - Exact project identity, physical path, and storage scope; `copy` and the caller's `locations`.
   * @returns Identity-safe deletion outcome, with the directories that still hold the id or why none is known to.
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
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const physicalLock = `${storageRootKey}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];
    const target: PhysicalDirectory = { storageRootKey, providerBasePath: path };
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async (): Promise<PermanentDeleteProjectDirectoryResult> => {
        /* The other known locations, taken before the removal forgets the target's entry. */
        const leftOut = {
          target,
          excluded: new Set((input.exclude ?? []).map((left) => `${left.storageRootKey}\0${left.relativeDirectory}`)),
        };
        /* A location under a pending delete of its own is not counted: its removal may already be under way (M2). It is
         * not counted as absent either: one left out makes a refusal `unknown` (review N2). */
        const nominated = this._nominations(projectId, {
          locators: input.locations ?? [],
          except: [{ storageRootKey, relativeDirectory: path }],
          known: true,
        });
        const others = nominated.filter(
          (other) => !leftOut.excluded.has(`${other.storageRootKey}\0${other.relativeDirectory}`),
        );
        const leftOutNominated = others.length < nominated.length;
        await provider.refresh?.([path]);
        if (!(await provider.exists(path))) {
          this._contradicted(storageRootKey, path, (reading) => reading.kind === 'not-a-project');
          return { status: 'absent', ...(await this._remaining(projectId, others, leftOut)) };
        }

        const manifestPath = `${path}/tau.json`;
        let removal: Readonly<{ manifest?: Uint8Array<ArrayBuffer>; identity: Uint8Array<ArrayBuffer> }>;
        if (await provider.exists(manifestPath)) {
          const manifest = await provider.readFile(manifestPath);
          let identity: ProjectIdentityRecord | undefined;
          let identityBytes: Uint8Array<ArrayBuffer>;
          try {
            identityBytes = await provider.readFile(`${path}/${projectIdentityPath}`);
            identity = parseProjectIdentityBytes(identityBytes);
          } catch {
            this._contradicted(storageRootKey, path, (reading) => reading.kind !== 'identified');
            return { status: 'unidentifiable' };
          }
          if (identity.projectId !== projectId) {
            const actual = identity.projectId;
            this._contradicted(
              storageRootKey,
              path,
              (reading) => reading.kind !== 'identified' || reading.projectId === actual,
            );
            return { status: 'identity-mismatch', actualProjectId: identity.projectId };
          }
          removal = { manifest, identity: identityBytes };
        } else {
          const interrupted = await this._interruptedRemoval(provider, path, projectId);
          if (interrupted.kind === 'foreign') {
            this._contradicted(storageRootKey, path, (reading) => reading.kind !== 'identified');
            return { status: 'unidentifiable' };
          }
          if (interrupted.kind !== 'finish') {
            /* Nothing names the id here, so nothing of it is deleted (review m2): the husk goes, and the answer is
             * that the directory was already gone. */
            await this._removeHusk(provider, path);
            return { status: 'absent', ...(await this._remaining(projectId, others, leftOut)) };
          }
          removal = { identity: interrupted.identity };
        }

        /* The waiver of the Trash rests on a copy that holds the id now, under this lock, and not on what the journal
         * was told: a copy another tab removed since this delete's proof leaves this one in place. A directory whose
         * removal already began is no longer a copy anyone counts, so finishing it waives nothing. */
        let proven: readonly ProjectLocator[] | undefined;
        if (input.copy === true && removal.manifest !== undefined) {
          const survivors = await this._survivors(projectId, others, { ...leftOut, leftOutNominated });
          if (survivors.status !== 'held') {
            return survivors.unavailable.length === 0
              ? { status: 'copy-unproven', reason: survivors.status }
              : { status: 'copy-unproven', reason: survivors.status, unavailable: survivors.unavailable };
          }
          proven = survivors.locators;
        }

        this._revokeProjectRoute(logicalRoot, true, target);
        const separator = path.lastIndexOf('/');
        const physicalParent = separator === -1 ? '' : path.slice(0, separator);
        const authorityParent = physicalParent === '' ? '/' : `/${physicalParent}`;
        const parentAuthority = this._scopedPhysicalAuthority(scope, physicalParent);
        try {
          await this._deleteProjectDirectory({ provider, directoryPath: path, ...removal });
        } finally {
          this._projectIndexes.clear();
          this._pipeline.emitChangeEvent({ type: 'directoryChanged', path: authorityParent, backend: scope.backend });
          /* The root fact is for an older tab; the named one tells a sibling's index which directory went (A2 b). */
          this._crossTabCoordinator.notifyChanges([
            { type: 'directory-change', path: authorityParent, authority: parentAuthority },
            namedDirectoryFact(storageRootKey, path),
          ]);
        }
        /* Every write of the removal has settled: what the check below reads is installed if nothing moved since. */
        const version = this._index.version(storageRootKey, path);
        if (await provider.exists(path)) {
          throw new Error(`Permanent delete did not remove ${path}`);
        }
        this._index.installGone(storageRootKey, path, version);
        return {
          status: 'deleted',
          ...(proven === undefined ? await this._remaining(projectId, others, leftOut) : { remaining: proven }),
        };
      }),
    );
  }

  /**
   * Commit one durable pending-operation snapshot to its exact physical
   * project directory. The manifest is the commit marker and is always
   * written last.
   *
   * The commit publishes no bus event — the route is not mounted until the
   * caller configures it — so a mutation origin has nothing to tag.
   *
   * @param input - Owned journal snapshot and exact target locator.
   * @param _context - Mutation origin metadata, which the unmounted commit does not publish.
   * @returns Replay-safe commit outcome.
   */
  public async commitPendingProjectDirectory(
    input: CommitPendingProjectDirectoryInput,
    _context?: WorkspaceMutationContext,
  ): Promise<CommitPendingProjectDirectoryResult> {
    const { path, files, manifest, scope, storageRootKey, projectId, staging } =
      this._validatePendingProjectCommit(input);
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const physicalLock = `${storageRootKey}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];

    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        let mutationBegan = false;
        try {
          await provider.refresh?.([path]);
          /* A staging written straight into this directory (where a move would copy) is the directory's residue. */
          const staged = staging === undefined ? undefined : await readStagedImport(provider, staging.operationId);
          if (staged?.inPlace !== undefined && staged.inPlace !== path) {
            throw new TypeError(`The staged import ${staged.operationId} was written for another directory.`);
          }
          /* Written in place, the directory is the import's only while its owner marker names the operation. */
          const stagedInPlace = staged?.inPlace === path;
          if (stagedInPlace && !(await ownsImportTarget(provider, path, staged.operationId))) {
            throw new TypeError(`The project folder ${path} no longer belongs to the import ${staged.operationId}.`);
          }
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
              /* A commit that stopped after its manifest left its staging: the project is whole, so it goes now. */
              if (staging !== undefined) {
                await this._removeStaging(provider, staging.operationId);
              }
              return { status: 'already-committed' };
            }
            let residueIdentity: ProjectIdentityRecord | undefined;
            try {
              residueIdentity = await this._readIdentity({ provider, directory: path, scope, storageRootKey });
            } catch {
              return { status: 'unidentifiable-manifest' };
            }
            if (residueIdentity === undefined && !stagedInPlace) {
              return { status: 'unidentifiable-manifest' };
            }
            if (residueIdentity !== undefined && residueIdentity.projectId !== projectId) {
              return { status: 'identity-mismatch', actualProjectId: residueIdentity.projectId };
            }
            mutationBegan = true;
            /* A staged import's residue is the entries an earlier attempt already moved in: they stay. */
            if (staging === undefined) {
              await this._clearProjectDirectoryContents(provider, path);
            }
          }

          mutationBegan = true;
          await provider.mkdir(path, { recursive: true });
          this._projectIndexes.removeDirectory(logicalRoot);
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

          /* The payload lands in bounded batches, then the manifest — the commit
           * marker — alone, after every payload byte applied (D2 phases). */
          const commitPhase = async (entries: readonly BatchEntry[]): Promise<void> => {
            const receipts = await this._pipeline.applyUnlocked(provider, entries);
            const failure = receipts.find(({ outcome }) => outcome !== 'applied');
            if (failure !== undefined) {
              throw failure.error instanceof Error ? failure.error : new Error('Pending project commit failed.');
            }
          };
          let importFacts: BatchEntry[] = [];
          if (staging !== undefined) {
            if (staged === undefined) {
              throw new Error(`The staged import ${staging.operationId} is gone.`);
            }
            const written = new Set(files.map(([relativePath]) => relativePath));
            const placed = await this._placeStagedImport({ provider, staged, target: path, written });
            /* A linked import's `.git`, which the revisions authority fetched into the staging: moved, never written here (I6). */
            await placeStagedControl(provider, staged.operationId, path);
            /* Each file's mtime as placed: the index takes a fact only for a file still at exactly this (size, mtime). */
            const observed = await mapConcurrent(placed, directoryConcurrency, async (entry) =>
              provider.stat(`${path}/${entry.path}`).catch(() => undefined),
            );
            const entries: RecordedImportEntry[] = [];
            for (const [index, entry] of placed.entries()) {
              const stat = observed[index];
              if (stat?.type === 'file' && stat.size === entry.size) {
                entries.push({ ...entry, mtimeMs: stat.mtimeMs });
              }
            }
            const record: ImportFactsRecord = {
              version: 1,
              operationId: staged.operationId,
              pin: staged.pin,
              at: Date.now(),
              entries,
            };
            importFacts = [
              {
                op: 'write',
                path: `${path}/${importFactsPath}`,
                data: new TextEncoder().encode(JSON.stringify(record)),
              },
            ];
          }
          await commitPhase([
            ...files.map(
              ([relativePath, descriptor]): BatchEntry => ({
                op: 'write',
                path: `${path}/${relativePath}`,
                data: descriptor.content,
                ...(descriptor.mode === undefined ? {} : { mode: descriptor.mode }),
              }),
            ),
            ...importFacts,
          ]);
          /* The staging lets go of the directory before the manifest makes it a project, so none names a committed one. */
          if (staging !== undefined) {
            await releaseStagedImport(
              { provider, apply: async (entries) => this._pipeline.applyUnlocked(provider, entries) },
              staging.operationId,
            );
          }
          await commitPhase([{ op: 'write', path: `${path}/tau.json`, data: manifest }]);
          /* Every write of the commit has settled: its own check below is the directory's reading (A2 f). */
          const version = this._index.version(storageRootKey, path);
          const committedBytes = await provider.readFile(`${path}/tau.json`);
          const committed = parseProjectManifestBytes(committedBytes);
          const committedIdentity = await this._readIdentity({ provider, directory: path, scope, storageRootKey });
          if (!committed.success || committedIdentity?.projectId !== projectId) {
            throw new Error(`Pending project manifest verification failed for ${projectId}`);
          }
          const read = readProjectManifestBytes(committedBytes);
          if (read.success && read.issue === undefined) {
            this._index.install(storageRootKey, path, {
              version,
              reading: { kind: 'identified', projectId, manifest: read.data },
              determined: true,
            });
          }

          if (staging !== undefined) {
            await this._removeStaging(provider, staging.operationId);
          }

          this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          return { status: 'committed' };
        } catch (error) {
          if (mutationBegan) {
            this._projectIndexes.removeDirectory(logicalRoot);
            this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          }
          throw error;
        }
      }),
    );
  }

  /**
   * Where an import stages on one durable storage root (charter D12): the
   * root's provider and the unlocked batch apply over it. Staging is private
   * to its operation, under the reserved `.tau-staging/` folder no discovery
   * or index reads, so it takes no lock; the commit takes the project's. An
   * import written straight into its project directory claims, writes and
   * removes that directory under the lock its commit takes (`exclusive`), so
   * neither interleaves with a create of the same folder.
   *
   * @param scope - A durable storage root.
   * @returns The staging port.
   * @throws TypeError for a scope that is not durable.
   */
  public async importStaging(scope: StorageRootConfig): Promise<ImportStagingPort> {
    const parsed = pendingProjectScopeSchema.safeParse(scope);
    if (!parsed.success) {
      throw new TypeError(parsed.error.issues[0]?.message ?? 'An import stages on durable storage only.');
    }
    const provider = await this._registry.getProvider(parsed.data);
    const storageRootKey = this._registry.resolveStorageRootKey(parsed.data);
    /* A desktop node root's host copies what a person chose on it straight into the staging (W7.4). */
    const { copyFromImportGrant } = provider as Partial<Pick<HostImportCopier, 'copyFromImportGrant'>>;
    return {
      provider,
      apply: async (entries) => this._pipeline.applyUnlocked(provider, entries),
      ...(typeof copyFromImportGrant === 'function'
        ? { copyHost: async (grant, entries) => copyFromImportGrant.call(provider, grant, entries) }
        : {}),
      exclusive: async <Result>(path: string, work: () => Promise<Result>): Promise<Result> => {
        const physicalLock = `${storageRootKey}:${path}`;
        return this._crossTabCoordinator.withLocks([physicalLock], async () =>
          this._resourceQueue.queueForMany([physicalLock], work),
        );
      },
    };
  }

  /**
   * Verify declaration and identity without conversion, adoption or repair.
   * @param input - Captured exact-mount provider and its physical lock identity.
   * @returns Verified bytes or a truthful fallback outcome; topology fencing belongs to the service.
   */
  public async verifyProjectRoute(input: {
    readonly projectId: string;
    readonly provider: FileSystemProvider;
    readonly directory: string;
    readonly storageRootKey: string;
  }): Promise<ProjectRouteVerification> {
    const directory = assertRootedPath(input.directory);
    const locks = [`project:${input.projectId}`, `${input.storageRootKey}:${directory}`];
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async (): Promise<ProjectRouteVerification> => {
        try {
          await input.provider.refresh?.([directory]);
          const manifestBytes = await input.provider.readFile(joinRelativePath(directory, 'tau.json'));
          const manifest = parseProjectManifestBytes(manifestBytes);
          if (!manifest.success) {
            this._contradicted(input.storageRootKey, directory, (reading) => reading.kind !== 'identified');
            return { status: 'discovery-required' };
          }
          const identityBytes = await input.provider.readFile(joinRelativePath(directory, projectIdentityPath));
          let identity: ProjectIdentityRecord;
          try {
            identity = parseProjectIdentityBytes(identityBytes);
          } catch {
            this._contradicted(input.storageRootKey, directory, (reading) => reading.kind !== 'identified');
            return { status: 'discovery-required' };
          }
          /* What the read found is evidence: an entry it contradicts is read again by the next pass (A2 i). */
          const found = identity.projectId;
          this._contradicted(
            input.storageRootKey,
            directory,
            (reading) =>
              reading.kind === 'identified' &&
              reading.projectId === found &&
              (found !== input.projectId ||
                reading.issue !== undefined ||
                JSON.stringify(reading.manifest) === JSON.stringify(manifest.data)),
          );
          return identity.projectId === input.projectId
            ? {
                status: 'verified',
                project: { projectId: input.projectId, manifest: manifest.data },
                storageRootKey: input.storageRootKey,
                providerBasePath: directory,
              }
            : { status: 'discovery-required' };
        } catch (error) {
          if (!isNotFoundError(error)) {
            return { status: 'unavailable' };
          }
          this._contradicted(input.storageRootKey, directory, (reading) => reading.kind !== 'identified');
          return { status: 'discovery-required' };
        }
      }),
    );
  }

  /**
   * One root's share of the audit.
   *
   * @param root - The root, its scope and its index view.
   * @param share - The share of its directories to re-read; all when omitted.
   * @returns When the root last completed a whole cycle, `-Infinity` while it has not completed one, or undefined when its
   *   audit could not run this time (its provider or its listing failed), which says nothing about its cycle (review N1).
   */
  private async _auditRoot(
    root: Readonly<{
      scope: WorkspaceScope;
      storageRootKey: string;
      view: NonNullable<ReturnType<ProjectDirectoryIndex<ProjectDirectoryReading>['view']>>;
    }>,
    share: number | undefined,
  ): Promise<number | undefined> {
    const { scope, storageRootKey, view } = root;
    {
      let provider: FileSystemProvider;
      try {
        provider = await this._registry.getProvider(scope);
      } catch {
        return undefined;
      }
      const channels = this._rootChannels(storageRootKey);
      const kind =
        provider.capabilities.externallyEdited === true
          ? channels?.native === true
            ? 'observed'
            : 'polled'
          : 'exclusive';
      let mismatched = false;
      if (!this._auditCycles.has(storageRootKey)) {
        this._auditCycles.set(storageRootKey, this._index.now());
        const namesVersion = this._index.namesVersion(storageRootKey);
        const names = await this._listNames(provider);
        if (!Array.isArray(names)) {
          this._auditCycles.delete(storageRootKey);
          return undefined;
        }
        if (view.namesListed && names.join('\0') !== view.names.join('\0')) {
          mismatched = true;
          this._index.countAuditMismatch(kind);
        }
        this._index.installNames(storageRootKey, namesVersion, names);
      }
      const count = share === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.ceil(view.names.length * share));
      const batch = this._index.auditBatch(storageRootKey, count);
      const dirty = new Set(this._index.view(storageRootKey)?.dirty);
      const audited = batch.names.filter((name) => !dirty.has(name));
      workerTimings.count('discovery.auditRead', audited.length);
      for (let offset = 0; offset < audited.length; offset += manifestProbeConcurrency) {
        // oxlint-disable-next-line no-await-in-loop -- One bounded batch of directories at a time.
        const outcomes = await Promise.all(
          audited.slice(offset, offset + manifestProbeConcurrency).map(async (name) => {
            const version = this._index.version(storageRootKey, name);
            const { reading, determined } = await this._readDirectory({
              provider,
              scope,
              storageRootKey,
              directory: assertRootedPath(name),
            });
            return this._index.install(storageRootKey, name, { version, reading, determined });
          }),
        );
        for (const outcome of outcomes) {
          if (outcome.status === 'installed' && outcome.changed) {
            mismatched = true;
            this._index.countAuditMismatch(kind);
          }
        }
      }
      if (batch.wrapped) {
        this._index.validated(storageRootKey, this._auditCycles.get(storageRootKey) ?? this._index.now());
        this._auditCycles.delete(storageRootKey);
        this._auditCompleted.set(storageRootKey, this._index.now());
      }
      if (mismatched) {
        this._onAuditChange(storageRootKey);
      }
      return this._auditCompleted.get(storageRootKey) ?? Number.NEGATIVE_INFINITY;
    }
  }

  /**
   * One root's part of a pass (FW2). A root with no warm index (never read, reset since, past the bounds, or written by
   * other programs with no channel to report them) is read in full. Otherwise a root other programs write is validated
   * first when it is past its freshness window (A3), its child names are listed again when evidence unlisted them, and
   * only the directories with evidence are read. Every read installs under the version rule.
   *
   * @param resolvedRoot - The root.
   * @param provider - Its provider.
   * @returns Each child directory and its reading, sorted; or why the root could not be listed.
   */
  private async _passRoot(
    resolvedRoot: ResolvedDiscoveryRoot,
    provider: FileSystemProvider,
  ): Promise<
    | Readonly<{ status: 'complete'; readings: ReadonlyArray<readonly [string, ProjectDirectoryReading]> }>
    | Readonly<{ status: 'inaccessible'; reason: string }>
  > {
    const { scope, storageRootKey } = resolvedRoot;
    await this._channelsArmed(storageRootKey);
    const channels = this._rootChannels(storageRootKey);
    const externallyEdited = provider.capabilities.externallyEdited === true;
    const authority = { provider, scope, storageRootKey };
    let view = this._index.view(storageRootKey);
    if (view?.currency === 'warm' && externallyEdited && channels !== undefined) {
      if (this._index.now() - view.validatedAt > freshnessWindow(channels) && channels.snapshot) {
        await this._validateRoot(storageRootKey);
        view = this._index.view(storageRootKey);
      }
      if (view !== undefined && this._index.now() - view.validatedAt > freshnessWindow(channels)) {
        /* No snapshot source, or its poll failed: the audit's read, which is a full one. */
        view = undefined;
      }
    }
    if (
      view?.currency !== 'warm' ||
      (externallyEdited && (channels === undefined || (!channels.snapshot && !channels.native)))
    ) {
      const startedAt = this._index.now();
      const namesVersion = this._index.beginColdRead(storageRootKey);
      workerTimings.count('discovery.fullRead');
      const names = await this._listNames(provider);
      if (!Array.isArray(names)) {
        this._index.cold(storageRootKey, 'reset');
        return { status: 'inaccessible', reason: errorMessage(names.error) };
      }
      this._index.installNames(storageRootKey, namesVersion, names);
      const readings = await this._readDirectories(authority, names);
      this._index.warmed(storageRootKey, startedAt);
      return { status: 'complete', readings };
    }
    let { names } = view;
    if (!view.namesListed) {
      const namesVersion = this._index.namesVersion(storageRootKey);
      const listed = await this._listNames(provider);
      if (!Array.isArray(listed)) {
        return { status: 'inaccessible', reason: errorMessage(listed.error) };
      }
      /* A listing that evidence overtook is not installed; this pass lists it with the names own writes added since. */
      names = this._index.installNames(storageRootKey, namesVersion, listed)
        ? listed
        : [...new Set([...listed, ...(this._index.view(storageRootKey)?.names ?? [])])].sort();
    }
    const dirty = new Set(this._index.view(storageRootKey)?.dirty);
    const read = new Map(
      await this._readDirectories(
        authority,
        names.filter((name) => dirty.has(name) || this._index.entry(storageRootKey, name) === undefined),
      ),
    );
    return {
      status: 'complete',
      readings: names.flatMap((name) => {
        const reading = read.get(name) ?? this._index.entry(storageRootKey, name)?.reading;
        return reading === undefined ? [] : [[name, reading] as const];
      }),
    };
  }

  /** The root's child directories, dot-prefixed ones excluded, sorted; or the error the listing threw. */
  private async _listNames(provider: FileSystemProvider): Promise<string[] | Readonly<{ error: unknown }>> {
    workerTimings.count('discovery.listing');
    try {
      /* Entry kinds come from the listing, so files never cost a `stat`, and dotdirs are excluded by name alone. */
      const entries = await readDirectoryEntries(provider, '');
      return entries
        .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      return { error };
    }
  }

  /**
   * Read directories of one root, a bounded number at a time, and install each under the counters it took before its
   * first I/O. One unreadable child does not blank its root: it is reported in place and stays dirty.
   */
  private async _readDirectories(
    authority: Omit<DirectoryAuthority, 'directory'>,
    names: readonly string[],
  ): Promise<Array<readonly [string, ProjectDirectoryReading]>> {
    const read: Array<readonly [string, ProjectDirectoryReading]> = [];
    /* oxlint-disable eslint/no-await-in-loop -- Chunked awaits bound the read concurrency; the input order is kept. */
    for (let offset = 0; offset < names.length; offset += manifestProbeConcurrency) {
      const chunk = await Promise.all(
        names.slice(offset, offset + manifestProbeConcurrency).map(async (name) => {
          const version = this._index.version(authority.storageRootKey, name);
          const { reading, determined } = await this._readDirectory({
            ...authority,
            directory: assertRootedPath(name),
          });
          this._index.install(authority.storageRootKey, name, { version, reading, determined });
          return [name, reading] as const;
        }),
      );
      read.push(...chunk);
    }
    /* oxlint-enable eslint/no-await-in-loop -- End bounded directory reads. */
    return read;
  }

  /** The id a directory carries as the sweep reads it: its record's, or a legacy manifest's; unknown on a failure. */
  private async _sweptIdentity(provider: FileSystemProvider, name: string): Promise<string | undefined> {
    let identityBytes: Uint8Array<ArrayBuffer> | undefined;
    try {
      identityBytes = await provider.readFile(`${name}/${projectIdentityPath}`);
    } catch (error) {
      if (!isNotFoundError(error)) {
        return unknownIdentity;
      }
    }
    if (identityBytes !== undefined) {
      try {
        return parseProjectIdentityBytes(identityBytes).projectId;
      } catch {
        /* Discovery lists an unparseable record as invalid, carrying no id. */
        return undefined;
      }
    }
    let manifestBytes: Uint8Array<ArrayBuffer>;
    try {
      manifestBytes = await provider.readFile(`${name}/tau.json`);
    } catch (error) {
      return isNotFoundError(error) ? undefined : unknownIdentity;
    }
    const legacy = convertLegacyProjectManifestBytes(manifestBytes);
    return legacy.success ? legacy.data.projectId : undefined;
  }

  /**
   * A fresh listing of a root's child directories is evidence: names it differs from the index's on are unlisted.
   *
   * @param storageRootKey - The root.
   * @param names - Its child directories, as listed now.
   */
  private _compareNames(storageRootKey: string, names: readonly string[]): void {
    const indexed = this._index.view(storageRootKey);
    if (indexed?.currency === 'warm' && indexed.namesListed) {
      const listed = new Set(names);
      const differing = [
        ...names.filter((name) => !indexed.names.includes(name)),
        ...indexed.names.filter((name) => !listed.has(name)),
      ];
      if (differing.length > 0) {
        this._index.note(storageRootKey, ['', ...differing]);
      }
    }
  }

  /**
   * Every child name of a configured root, dot-prefixed ones excluded, listed now: the names a new project's directory
   * must not take, files as much as directories. Undefined when the root is not configured, not available or cannot be
   * listed.
   *
   * @param storageRootKey - The root.
   * @returns Its child names, sorted, or undefined.
   */
  private async _rootNames(storageRootKey: string): Promise<string[] | undefined> {
    const root = this._discoveryRoots().find((candidate) => candidate.storageRootKey === storageRootKey);
    const state = this._rootState(storageRootKey);
    if (root === undefined || (state !== undefined && state !== 'available')) {
      return undefined;
    }
    let entries: Awaited<ReturnType<typeof readDirectoryEntries>>;
    try {
      const provider = await this._registry.getProvider(root.scope);
      workerTimings.count('discovery.listing');
      entries = await readDirectoryEntries(provider, '');
    } catch {
      return undefined;
    }
    const visible = entries.filter((entry) => !entry.name.startsWith('.'));
    this._compareNames(
      storageRootKey,
      visible
        .filter((entry) => entry.kind === 'dir')
        .map((entry) => entry.name)
        .sort(),
    );
    return visible.map((entry) => entry.name).sort();
  }

  /**
   * The known locations of an id (fast-path FW3, `K(P)`): the caller's nominations, then, with `known`, every directory
   * the index last read carrying the id (`locationsOf`), each once, `except` left out.
   *
   * @param projectId - The id.
   * @param nominated - The caller's locators, the directories to leave out, and whether to add the index's.
   * @returns The locations to probe.
   */
  private _nominations(
    projectId: string,
    nominated: Readonly<{
      locators: readonly ProjectLocator[];
      except: ReadonlyArray<Readonly<{ storageRootKey: string; relativeDirectory: string }>>;
      known: boolean;
    }>,
  ): ProbeTarget[] {
    const { locators, except, known } = nominated;
    const targets: ProbeTarget[] = [];
    const seen = new Set<string>();
    for (const left of except) {
      seen.add(`${left.storageRootKey}\0${left.relativeDirectory}`);
    }
    const add = (target: ProbeTarget): void => {
      const key = `${target.storageRootKey}\0${target.relativeDirectory}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push(target);
      }
    };
    for (const locator of locators) {
      add({ storageRootKey: locator.storageRootKey, relativeDirectory: locator.relativeDirectory, locator });
    }
    if (known) {
      for (const { storageRootKey, name } of this._index.find(
        (reading) => reading.kind === 'identified' && reading.projectId === projectId,
      )) {
        add({ storageRootKey, relativeDirectory: name });
      }
    }
    return targets;
  }

  /**
   * Read each target under locks the caller holds: `project:<id>`, which every Tau writer of the id holds, so no Tau
   * writer moves a copy of the id while these reads run.
   *
   * @param projectId - The id.
   * @param targets - The locations.
   * @returns Each location's answer.
   */
  private async _probe(projectId: string, targets: readonly ProbeTarget[]): Promise<ProjectProbeLocation[]> {
    const roots = this._discoveryRoots();
    const probed = await Promise.all(
      targets.map(async (target): Promise<ProjectProbeLocation | undefined> => {
        const root = roots.find((candidate) => candidate.storageRootKey === target.storageRootKey);
        const locator =
          target.locator ??
          (root === undefined
            ? undefined
            : projectLocatorFor(root.root, target.storageRootKey, target.relativeDirectory));
        if (locator === undefined) {
          return undefined;
        }
        const state = root === undefined ? undefined : this._rootState(root.storageRootKey);
        if (
          root === undefined ||
          (state !== undefined && state !== 'available') ||
          !isProjectDirectoryPath(target.relativeDirectory) ||
          assertRootedPath(target.relativeDirectory) !== target.relativeDirectory
        ) {
          return { locator, status: 'unknown' };
        }
        let provider: FileSystemProvider;
        try {
          provider = await this._registry.getProvider(root.scope);
        } catch {
          return { locator, status: 'unknown' };
        }
        return {
          locator,
          status: await this._probeOne(provider, projectId, {
            storageRootKey: target.storageRootKey,
            directory: target.relativeDirectory,
          }),
        };
      }),
    );
    return probed.filter((location) => location !== undefined);
  }

  /**
   * Whether one directory holds `projectId`, read now and writing nothing: its manifest and its identity record, two
   * reads, as a route verification reads them. A not-found is a fact; any other failure is `unknown`. The answer is
   * evidence for the index: a held reading is installed under the version rule, and an entry the bytes contradict is
   * marked so the next pass reads it again.
   *
   * @param provider - The directory's root's provider.
   * @param projectId - The id.
   * @param at - The root and the directory under it.
   * @returns `held`, `vacant` or `unknown`.
   */
  private async _probeOne(
    provider: FileSystemProvider,
    projectId: string,
    at: Readonly<{ storageRootKey: string; directory: string }>,
  ): Promise<ProjectProbeLocation['status']> {
    const { storageRootKey, directory } = at;
    workerTimings.count('discovery.probe');
    const version = this._index.version(storageRootKey, directory);
    try {
      await provider.refresh?.([directory]);
    } catch {
      return 'unknown';
    }
    const [manifestResult, identityResult] = await Promise.allSettled([
      provider.readFile(`${directory}/tau.json`),
      provider.readFile(`${directory}/${projectIdentityPath}`),
    ]);
    if (manifestResult.status === 'rejected') {
      if (!isNotFoundError(manifestResult.reason)) {
        return 'unknown';
      }
      /* Gone, not a project, adoptable, or a removal interrupted after its manifest: no copy. */
      this._contradicted(storageRootKey, directory, (reading) => reading.kind !== 'identified');
      return 'vacant';
    }
    const manifest = manifestResult.value;
    const legacy = convertLegacyProjectManifestBytes(manifest);
    const legacyId = legacy.success ? legacy.data.projectId : undefined;
    if (identityResult.status === 'rejected') {
      if (!isNotFoundError(identityResult.reason)) {
        return 'unknown';
      }
      /* No record: a legacy manifest carries its id; a modern one would be minted a new id, never this one. */
      this._contradicted(
        storageRootKey,
        directory,
        (reading) => reading.kind !== 'identified' || reading.projectId === legacyId,
      );
      return legacyId === projectId ? 'held' : 'vacant';
    }
    let found: string;
    try {
      found = parseProjectIdentityBytes(identityResult.value).projectId;
    } catch {
      this._contradicted(storageRootKey, directory, (reading) => reading.kind !== 'identified');
      return 'vacant';
    }
    const read = readProjectManifestBytes(manifest);
    if (found !== projectId || (!read.success && legacyId === undefined)) {
      this._contradicted(
        storageRootKey,
        directory,
        (reading) => reading.kind !== 'identified' || (reading.projectId === found && found !== projectId),
      );
      return 'vacant';
    }
    /* Installed only under a name the root's listing holds exactly: on a volume that folds case, a locator spelled
     * another way reads a listed directory's bytes, and installing them would list it twice (review nit). */
    if (read.success && this._index.hasName(storageRootKey, directory)) {
      this._index.install(storageRootKey, directory, {
        version,
        reading: {
          kind: 'identified',
          projectId,
          manifest: read.data,
          ...(read.issue === undefined ? {} : { issue: read.issue }),
        },
        determined: true,
      });
    } else {
      this._contradicted(storageRootKey, directory, (reading) => reading.kind === 'identified');
    }
    return 'held';
  }

  /**
   * Which other directories still hold the id, read under the hold of `project:<id>` the caller has (fast-path FW3,
   * step 5): the known locations are probed, and only when none holds the id and none was unreadable does the identity
   * sweep decide; what it finds is probed in turn, so a husk is never named (review m1). A location that could not be
   * read, or a sweep that finds the id only in husks, proves nothing either way, so the answer is then `unknown`.
   *
   * @param projectId - The id.
   * @param targets - Its other known locations.
   * @param leftOut - The deleted directory, and the locations under a pending delete.
   * @returns The directories read holding the id, or why none is known to.
   */
  private async _remaining(
    projectId: string,
    targets: readonly ProbeTarget[],
    leftOut: Readonly<{ target: PhysicalDirectory; excluded: ReadonlySet<string> }>,
  ): Promise<Readonly<{ remaining: readonly ProjectLocator[]; absence?: 'absent' | 'unknown' }>> {
    const probed = await this._probe(projectId, targets);
    const held = probed.filter((location) => location.status === 'held').map((location) => location.locator);
    if (held.length > 0) {
      return { remaining: held };
    }
    if (probed.some((location) => location.status === 'unknown')) {
      return { remaining: [], absence: 'unknown' };
    }
    const swept = await this._sweptCopies(projectId, { except: leftOut.target, excluded: leftOut.excluded, probed });
    if (swept.held.length > 0) {
      return { remaining: swept.held.map((location) => location.locator) };
    }
    return { remaining: [], absence: swept.unknown || swept.present ? 'unknown' : 'absent' };
  }

  /**
   * The copies that let a delete waive the Trash, proven now under the hold of `project:<id>` the caller has (fast-path
   * FW3, copy proof held through the journal): the known locations other than the target, probed; and when none holds
   * the id (after a reload the index knows none), the identity sweep's directories other than the target, each probed in
   * turn, since only a directory read whole proves a copy. A held location counts only when a fresh listing of its root
   * names it exactly and it is not the target under another spelling (review M1): on a volume that folds case, a
   * locator spelled differently reads the target's own files. `held` names the copies; otherwise `absent`, or `unknown`
   * with the locations that could not be read, which proves nothing.
   *
   * @param projectId - The id.
   * @param targets - Its other known locations.
   * @param leftOut - The target, which neither the sweep nor a probe counts, and the locations under a pending delete.
   * @returns The copies proven, or why none is.
   */
  private async _survivors(
    projectId: string,
    targets: readonly ProbeTarget[],
    leftOut: Readonly<{ target: PhysicalDirectory; excluded: ReadonlySet<string>; leftOutNominated: boolean }>,
  ): Promise<
    Readonly<
      | { status: 'held'; locators: readonly ProjectLocator[] }
      | { status: 'absent' | 'unknown'; unavailable: readonly ProjectLocator[] }
    >
  > {
    const { target, excluded } = leftOut;
    const probed = await this._probe(projectId, targets);
    const unreadable = probed.filter((location) => location.status === 'unknown').map((location) => location.locator);
    let unknown = unreadable.length > 0 || leftOut.leftOutNominated;
    /* Only a held copy in the target's own root can be the target under another spelling (review M1); one in another
     * root needs no listing (review budget). */
    const listed = await this._listedExactly(
      probed.filter(
        (location) => location.status === 'held' && location.locator.storageRootKey === target.storageRootKey,
      ),
      target,
    );
    unreadable.push(...listed.unreadable);
    unknown ||= listed.unreadable.length > 0;
    const held = [
      ...probed
        .filter((location) => location.status === 'held' && location.locator.storageRootKey !== target.storageRootKey)
        .map((location) => location.locator),
      ...listed.held,
    ];
    if (held.length === 0) {
      /* The sweep listed each root's names in this same hold, so what it finds needs no listing again; a name it
       * found is exact, and the target is left out of it by name. */
      const swept = await this._sweptCopies(projectId, { except: target, excluded, probed });
      held.push(...swept.held.map((location) => location.locator));
      unreadable.push(...swept.unreadable);
      unknown ||= swept.unknown || swept.leftOut;
    }
    if (held.length > 0) {
      return { status: 'held', locators: held };
    }
    return { status: unknown ? 'unknown' : 'absent', unavailable: unreadable };
  }

  /**
   * The directories the identity sweep finds carrying the id, other than `except`, the ones under a pending delete and
   * the ones already probed, each probed in turn: a husk (an identity record with no manifest) is not a copy (m1).
   *
   * @param projectId - The id.
   * @param leftOut - The target, the locations under a pending delete, and what was probed already.
   * @returns The held copies, the unreadable locations, and whether the sweep itself could not answer.
   */
  private async _sweptCopies(
    projectId: string,
    leftOut: Readonly<{
      except: PhysicalDirectory;
      excluded: ReadonlySet<string>;
      probed: readonly ProjectProbeLocation[];
    }>,
  ): Promise<
    Readonly<{
      held: ProjectProbeLocation[];
      unreadable: ProjectLocator[];
      unknown: boolean;
      present: boolean;
      leftOut: boolean;
    }>
  > {
    const { except, excluded, probed } = leftOut;
    const absence = await this.verifyAbsent(projectId, { alreadyLocked: true, except });
    if (absence.status !== 'present') {
      return { held: [], unreadable: [], unknown: absence.status === 'unknown', present: false, leftOut: false };
    }
    const keyOf = (locator: Readonly<{ storageRootKey: string; relativeDirectory: string }>): string =>
      `${locator.storageRootKey}\0${locator.relativeDirectory}`;
    const probedKeys = new Set(probed.map(({ locator }) => keyOf(locator)));
    const swept = await this._probe(
      projectId,
      absence.locators
        .filter((locator) => !probedKeys.has(keyOf(locator)) && !excluded.has(keyOf(locator)))
        .map((locator) => ({
          storageRootKey: locator.storageRootKey,
          relativeDirectory: locator.relativeDirectory,
          locator,
        })),
    );
    return {
      held: swept.filter((location) => location.status === 'held'),
      unreadable: swept.filter((location) => location.status === 'unknown').map((location) => location.locator),
      unknown: false,
      present: true,
      leftOut: absence.locators.some((locator) => excluded.has(keyOf(locator))),
    };
  }

  /**
   * Keep the held locations a fresh listing of their root names exactly, and that are not the target under another
   * spelling (review M1). One listing per root involved; a root that cannot be listed proves none of its locations.
   *
   * @param held - The locations probes read holding the id.
   * @param target - The directory being deleted.
   * @returns The locations that stand, and those whose root could not be listed.
   */
  private async _listedExactly(
    held: readonly ProjectProbeLocation[],
    target: PhysicalDirectory,
  ): Promise<Readonly<{ held: ProjectLocator[]; unreadable: ProjectLocator[] }>> {
    const roots = this._discoveryRoots();
    const byRoot = new Map<string, ProjectLocator[]>();
    for (const { locator } of held) {
      byRoot.set(locator.storageRootKey, [...(byRoot.get(locator.storageRootKey) ?? []), locator]);
    }
    const kept: ProjectLocator[] = [];
    const unreadable: ProjectLocator[] = [];
    /* oxlint-disable eslint/no-await-in-loop -- One listing per root, one after another, as a pass reads them. */
    for (const [storageRootKey, locators] of byRoot) {
      const root = roots.find((candidate) => candidate.storageRootKey === storageRootKey);
      let names: string[] | Readonly<{ error: unknown }> = { error: new Error('The root is not configured.') };
      if (root !== undefined) {
        try {
          names = await this._listNames(await this._registry.getProvider(root.scope));
        } catch (error) {
          names = { error };
        }
      }
      if (!Array.isArray(names)) {
        unreadable.push(...locators);
        continue;
      }
      const listed = new Set(names);
      for (const locator of locators) {
        const isTarget =
          storageRootKey === target.storageRootKey &&
          foldPathSpelling(locator.relativeDirectory) === foldPathSpelling(target.providerBasePath);
        if (listed.has(locator.relativeDirectory) && !isTarget) {
          kept.push(locator);
        }
      }
    }
    /* oxlint-enable eslint/no-await-in-loop -- End of the listings. */
    return { held: kept, unreadable };
  }

  /**
   * What a directory with no manifest is to a removal of `projectId` (fast-path FW3; review M2): the removal takes the
   * manifest first, so a directory whose identity record names the id is one this authority began removing, whatever
   * else it still holds, and the record with the journal row for this exact directory is the proof a replay finishes it
   * on (`finish`). One holding nothing, or nothing but an empty state directory, names no id (`empty`). Anything else,
   * a `.tau` that is a file included, is not provably the id's (`foreign`). Names compare folded, as the removal's own
   * clear does.
   *
   * @param provider - The directory's root's provider.
   * @param path - The directory.
   * @param projectId - The id the removal was for.
   * @returns `finish` with the identity bytes, `empty` or `foreign`.
   */
  private async _interruptedRemoval(
    provider: FileSystemProvider,
    path: string,
    projectId: string,
  ): Promise<Readonly<{ kind: 'finish'; identity: Uint8Array<ArrayBuffer> } | { kind: 'empty' | 'foreign' }>> {
    const fold = (name: string): string => name.toLowerCase();
    const entries = await readDirectoryEntries(provider, path);
    const state = entries.find((entry) => fold(entry.name) === '.tau');
    if (state === undefined) {
      return { kind: entries.length === 0 ? 'empty' : 'foreign' };
    }
    if (state.kind !== 'dir') {
      return { kind: 'foreign' };
    }
    let identity: Uint8Array<ArrayBuffer> | undefined;
    try {
      identity = await provider.readFile(joinRelativePath(path, projectIdentityPath));
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
    if (identity !== undefined) {
      try {
        return parseProjectIdentityBytes(identity).projectId === projectId
          ? { kind: 'finish', identity }
          : { kind: 'foreign' };
      } catch {
        return { kind: 'foreign' };
      }
    }
    const inside = await readDirectoryEntries(provider, joinRelativePath(path, state.name));
    return { kind: entries.length === 1 && inside.length === 0 ? 'empty' : 'foreign' };
  }

  /**
   * Remove a directory that holds nothing, or nothing but an empty state directory.
   *
   * @param provider - The directory's root's provider.
   * @param path - The directory.
   */
  private async _removeHusk(provider: FileSystemProvider, path: string): Promise<void> {
    const entries = await readDirectoryEntries(provider, path);
    await Promise.all(entries.map(async (entry) => provider.rmdir(joinRelativePath(path, entry.name))));
    await provider.rmdir(path);
  }

  /**
   * An authority read of a directory found what `consistent` says the index's entry should be, or not: an entry it
   * contradicts is dirty and the root's names unlisted, so the next pass reads it again (A2 i).
   */
  private _contradicted(
    storageRootKey: string,
    directory: string,
    consistent: (reading: ProjectDirectoryReading) => boolean,
  ): void {
    const name = directory.split('/')[0] ?? directory;
    const entry = this._index.entry(storageRootKey, name);
    if (entry !== undefined && !consistent(entry.reading)) {
      this._index.note(storageRootKey, ['', name]);
    }
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
      this._projectIndexes.invalidate(logicalPath);
      if (input.alreadyLocked !== true) {
        this._pipeline.emitChangeEvent({ type: 'fileWritten', path: logicalPath, backend: input.scope.backend });
        this._crossTabCoordinator.notifyChanges([
          { type: 'directory-change', path: '/', authority: this._scopedPhysicalAuthority(input.scope, '') },
          namedDirectoryFact(input.storageRootKey, input.path),
        ]);
      }
    }
    return result;
  }

  private async _readProjectDirectory(authority: DirectoryAuthority): Promise<ProjectDirectoryReading> {
    const { reading } = await this._readDirectory(authority);
    return reading;
  }

  /**
   * Read what one directory holds, and whether the bytes determined it (A2 g): a read that failed with anything but
   * not-found, a listing that threw, an identity that could not be read or established, or a conversion that raced is
   * uncertainty, and the index keeps the directory dirty so the next pass reads it again.
   */
  private async _readDirectory(authority: DirectoryAuthority): Promise<DirectoryRead> {
    const { provider, directory } = authority;
    workerTimings.count('discovery.directoryRead');
    const [manifestResult, identityResult] = await Promise.allSettled([
      provider.readFile(`${directory}/tau.json`),
      this._readIdentity(authority),
    ]);
    if (manifestResult.status === 'rejected') {
      if (!isNotFoundError(manifestResult.reason)) {
        return {
          reading: {
            kind: 'invalid',
            issue: { code: 'manifest-unreadable', message: errorMessage(manifestResult.reason) },
          },
          determined: false,
        };
      }
      workerTimings.count('discovery.listing');
      let entries: Awaited<ReturnType<typeof readDirectoryEntries>>;
      try {
        entries = await readDirectoryEntries(provider, directory);
      } catch (error) {
        /* Gone is a fact; any other failure of the listing is uncertainty, not a directory with no project. */
        return { reading: { kind: 'not-a-project' }, determined: isNotFoundError(error) };
      }
      if (!entries.some((entry) => entry.kind === 'dir' && entry.name === '.tau')) {
        return { reading: { kind: 'not-a-project' }, determined: true };
      }
      const mainFile = entries
        .filter((entry) => entry.kind === 'file' && /^main\.[^.]+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()[0];
      return {
        determined: true,
        reading: {
          kind: 'adoptable',
          manifest: {
            $schema: projectManifestSchemaUrl,
            name: basenameOf(directory),
            description: '',
            tags: [],
            assets: { main: { entryPath: mainFile ?? 'main.ts' } },
          },
          issue: { code: 'manifest-missing' },
        },
      };
    }
    if (identityResult.status === 'rejected') {
      const error: unknown = identityResult.reason;
      const invalid =
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'IDENTITY_INVALID';
      return {
        reading: {
          kind: 'invalid',
          issue: { code: invalid ? 'identity-invalid' : 'identity-unavailable', message: errorMessage(error) },
        },
        determined: invalid,
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
          return { reading: { kind: 'identified', projectId, manifest }, determined: true };
        }
        if (
          result.status === 'conflict' &&
          identityResult.value !== undefined &&
          identityResult.value.projectId !== projectId
        ) {
          return {
            reading: {
              kind: 'invalid',
              issue: {
                code: 'identity-conflict',
                expectedProjectId: projectId,
                actualProjectId: identityResult.value.projectId,
              },
            },
            determined: true,
          };
        }
        return {
          reading: {
            kind: 'invalid',
            issue: {
              code: 'identity-unavailable',
              message:
                result.status === 'failed'
                  ? result.message
                  : 'Project declaration changed during conversion. Retry discovery.',
            },
          },
          determined: false,
        };
      } finally {
        this._lifetime.signal.removeEventListener('abort', cancel);
        actor.stop();
      }
    }
    if (!read.success) {
      return { reading: { kind: 'invalid', issue: read.issue }, determined: true };
    }
    if (
      identityResult.value === undefined &&
      (read.issue?.code === 'manifest-invalid-json' || read.issue?.code === 'manifest-unknown-schema')
    ) {
      return { reading: { kind: 'invalid', issue: read.issue }, determined: true };
    }
    const identity = await this._resolveIdentity({
      ...authority,
      initialIdentity: { record: identityResult.value },
      manifestBytes: bytes,
    });
    switch (identity.status) {
      case 'resolved': {
        return {
          reading: {
            kind: 'identified',
            projectId: identity.projectId,
            manifest: read.data,
            ...(read.issue === undefined ? {} : { issue: read.issue }),
          },
          determined: true,
        };
      }
      case 'conflict': {
        return {
          reading: {
            kind: 'invalid',
            issue: {
              code: 'identity-conflict',
              expectedProjectId: identity.expectedProjectId,
              actualProjectId: identity.actualProjectId,
            },
          },
          determined: true,
        };
      }
      case 'failed': {
        return {
          reading: { kind: 'invalid', issue: { code: 'identity-unavailable', message: identity.message } },
          determined: false,
        };
      }
      case 'missing': {
        return {
          reading: {
            kind: 'invalid',
            issue: { code: 'identity-unavailable', message: 'Project identity has not been persisted.' },
          },
          determined: false,
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
    staging: { readonly operationId: string } | undefined;
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
      staging: parsedInput.data.staging,
    };
  }

  /**
   * Remove an import's staging once its project is whole. The project does
   * not depend on it, so a removal that fails is left to the next sweep,
   * which finds it owned by nothing (W7).
   */
  private async _removeStaging(provider: FileSystemProvider, operationId: string): Promise<void> {
    const directory = importStagingDirectory(operationId);
    try {
      if (!(await provider.exists(directory))) {
        return;
      }
      const receipts = await this._pipeline.applyUnlocked(provider, [
        { op: 'delete', path: directory, kind: 'dir', recursive: true },
      ]);
      const failure = receipts.find(({ outcome }) => outcome !== 'applied');
      if (failure !== undefined) {
        console.warn(`[ProjectDirectories] The staging ${directory} is left for the sweep.`, failure.error);
      }
    } catch (error) {
      console.warn(`[ProjectDirectories] The staging ${directory} is left for the sweep.`, error);
    }
  }

  /**
   * Put a staged import's files in the project. Staged under `tree/` (where a
   * move is a metadata operation) they move, as bounded changesets: every
   * directory first, then the moves. Written in place (where a move would
   * copy) they are already there, and each is checked by its size, except
   * those under `.tau`, which wait in `tree/` and move in here, so the pending
   * folder never looks adoptable. No byte is written again either way, beyond
   * those few `.tau` files a copying rename writes twice (I2, I3). Replay-safe: an entry no longer in
   * staging was moved by an earlier attempt, and must be at the target with
   * its recorded size.
   *
   * @returns The entries the project now holds from the import, with their facts.
   */
  private async _placeStagedImport(input: {
    readonly provider: FileSystemProvider;
    readonly staged: StagedImport;
    readonly target: string;
    readonly written: ReadonlySet<string>;
  }): Promise<StagedImportEntry[]> {
    const { provider, staged, target, written } = input;
    const entries = staged.entries.filter((entry) => !written.has(entry.path));
    /* The ledger is on disk, so its paths are held to the rules `files` is held to, in every spelling. */
    for (const { path } of entries) {
      if (!isSafeRelativePath(path) || isReservedImportPath(path)) {
        throw new TypeError(`A staged import path is not a project file: ${path}`);
      }
    }
    const isAt = async (entry: StagedImportEntry): Promise<boolean> => {
      const stat = await provider.stat(`${target}/${entry.path}`).catch(() => undefined);
      return stat?.type === 'file' && stat.size === entry.size;
    };
    const missing = (entry: StagedImportEntry): Error => new Error(`A staged import entry is missing: ${entry.path}`);
    /* Written in place, all but `.tau` is already there; `.tau` (and, staged to move, everything) moves from `tree/`. */
    const moves = staged.inPlace === undefined ? entries : entries.filter(({ path }) => isTauControlPath(path));
    const fixed = staged.inPlace === undefined ? [] : entries.filter(({ path }) => !isTauControlPath(path));
    if (moves.length > 0) {
      const tree = `${staged.directory}/tree`;
      const present = await mapConcurrent(moves, directoryConcurrency, async (entry) =>
        provider.exists(`${tree}/${entry.path}`),
      );
      const directories = new Set<string>();
      for (const { path } of moves) {
        const slash = path.lastIndexOf('/');
        if (slash > 0) {
          directories.add(path.slice(0, slash));
        }
      }
      /* Only the deepest folders: a recursive mkdir makes every ancestor. */
      const ancestors = new Set<string>();
      for (const directory of directories) {
        for (let slash = directory.indexOf('/'); slash > 0; slash = directory.indexOf('/', slash + 1)) {
          ancestors.add(directory.slice(0, slash));
        }
      }
      const leaves = [...directories].filter((directory) => !ancestors.has(directory));
      const settle = async (batch: readonly BatchEntry[], what: string): Promise<void> => {
        const receipts = await this._pipeline.applyUnlocked(provider, batch);
        const failure = receipts.find(({ outcome }) => outcome !== 'applied');
        if (failure !== undefined) {
          throw failure.error instanceof Error ? failure.error : new Error(`The staged import's ${what} failed.`);
        }
      };
      await settle(
        leaves.map((directory) => ({ op: 'mkdir', path: `${target}/${directory}`, recursive: true })),
        'folders',
      );
      const moving: StagedImportEntry[] = [];
      const moved: StagedImportEntry[] = [];
      for (const [index, entry] of moves.entries()) {
        (present[index] === true ? moving : moved).push(entry);
      }
      await settle(
        moving.map((entry) => ({
          op: 'move',
          from: `${tree}/${entry.path}`,
          to: `${target}/${entry.path}`,
          replace: true,
        })),
        'moves',
      );
      const arrived = await mapConcurrent(moved, directoryConcurrency, isAt);
      const lost = moved.find((_, index) => arrived[index] !== true);
      if (lost !== undefined) {
        throw missing(lost);
      }
    }
    const inPlace = await mapConcurrent(fixed, directoryConcurrency, isAt);
    const absent = fixed.find((_, index) => inPlace[index] !== true);
    if (absent !== undefined) {
      throw missing(absent);
    }
    const executable = entries.filter((entry) => entry.mode === '100755');
    if (provider.setFileMode !== undefined) {
      await mapConcurrent(executable, directoryConcurrency, async (entry) =>
        provider.setFileMode?.(`${target}/${entry.path}`, '100755'),
      );
    }
    return entries;
  }

  private _scopedPhysicalAuthority(scope: WorkspaceScope, providerBasePath: string): PhysicalAuthority {
    return {
      storageRootKey: this._registry.resolveStorageRootKey(scope),
      providerBasePath: assertRootedPath(providerBasePath),
    };
  }

  private async _clearProjectDirectoryContents(provider: FileSystemProvider, directoryPath: string): Promise<void> {
    const stateDirectory = joinRelativePath(directoryPath, '.tau');
    const removal = async (entries: readonly string[], parent: string, kept: ReadonlySet<string>): Promise<void> => {
      const receipts = await this._pipeline.applyUnlocked(
        provider,
        entries
          .filter((entry) => !kept.has(entry.toLowerCase()))
          .map((entry) => ({ op: 'delete', path: joinRelativePath(parent, entry), recursive: true })),
      );
      const failure = receipts.find(({ outcome }) => outcome !== 'applied');
      if (failure !== undefined) {
        throw failure.error instanceof Error ? failure.error : new Error('Project directory removal failed.');
      }
    };
    /* The identity record stays until every sibling is gone: two batches, the state directory's last. */
    await removal(await provider.readdir(directoryPath), directoryPath, new Set(['tau.json', '.tau']));
    if (await provider.exists(stateDirectory)) {
      await removal(await provider.readdir(stateDirectory), stateDirectory, new Set(['project.json']));
    }
  }

  /**
   * Remove a verified project directory: the manifest first, then every entry but the identity record, then the
   * identity record and the directory (fast-path FW3; review M2). A directory under removal is therefore never listed or
   * held as a copy at any step, and a removal cut short leaves one whose identity record still names the id, which a
   * replay recognises and finishes. A failed step puts the identity record back if it went, never the manifest: a gutted
   * directory must not look whole again.
   *
   * @param input - The provider, the directory, and the identity bytes verified before it, if any.
   */
  private async _deleteProjectDirectory(input: {
    provider: FileSystemProvider;
    directoryPath: string;
    manifest?: Uint8Array<ArrayBuffer>;
    identity?: Uint8Array<ArrayBuffer>;
  }): Promise<void> {
    const { provider, directoryPath, manifest, identity } = input;
    const manifestPath = joinRelativePath(directoryPath, 'tau.json');
    const identityPath = joinRelativePath(directoryPath, projectIdentityPath);
    const stateDirectory = joinRelativePath(directoryPath, '.tau');
    if (manifest !== undefined) {
      await provider.unlink(manifestPath);
    }
    try {
      await this._clearProjectDirectoryContents(provider, directoryPath);
      if (await provider.exists(identityPath)) {
        await provider.unlink(identityPath);
      }
      if (await provider.exists(stateDirectory)) {
        await provider.rmdir(stateDirectory);
      }
      await provider.rmdir(directoryPath);
    } catch (error) {
      try {
        if (
          identity !== undefined &&
          (await provider.exists(directoryPath)) &&
          !(await provider.exists(identityPath))
        ) {
          await provider.writeFile(identityPath, identity);
        }
      } catch {
        // Preserve the original removal failure; durable journal remains for retry.
      }
      throw error;
    }
  }
}
