/**
 * External-change ingestion: the one consumer of facts about changes this
 * authority did not make (charter D13, D14).
 *
 * Extracted from `WorkspaceFileService` unchanged. Two sources feed it and it
 * treats them the same way: a backend that reports its own changes, and a
 * bounded snapshot poll for one that cannot. Everything after a fact arrives —
 * provider refresh, derivative invalidation, the logical fan-out over every
 * mount projecting the changed physical path, cross-tab notification and the
 * global project-discovery signal — is one serialized sequence per observed
 * root, which is why there is a class here rather than a function per fact.
 *
 * It knows nothing about which backend produced a fact.
 *
 * @module
 */

import type { FileSystemBackend } from '@taucad/types';
import { assertRootedPath, parentDirectory, resolveAuthorityPath } from '@taucad/utils/path';
import type { SharedPool } from '@taucad/memory';
import type { ExternalChangeFact, FileSystemProvider } from '#types.js';
import { isChromiumSwapArtifactName } from '#backend/fs-access-provider.js';
import { mapConcurrent } from '#concurrency.js';
import type { MountResolution, MountTable, StorageRootConfig, WorkspaceScope } from '#mount-table.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { MutationPipeline } from '#mutation-pipeline.js';
import type { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import type { TreeIndexes } from '#tree-index.js';
import { isNotFoundError } from '#workspace-errors.js';

/** Concurrent `getFile()` calls per directory while walking an external snapshot. */
const externalSnapshotConcurrency = 16;

/**
 * Changed-path budget above which a snapshot diff stops being worth scoping:
 * past this many entries the per-path cache sweeps cost more than one full drop.
 */
const maxLocalizedExternalChanges = 64;

/** Snapshot body published when the walked physical root is absent. */
const missingExternalSnapshot = '<missing>';
/** Every fact but `reset`: the ones that name a path the emitters project. */
type PathChangeFact = Exclude<ExternalChangeFact, { kind: 'reset' }>;

type ObservedExternalRoot = {
  readonly storageRootKey: string;
  readonly backend: FileSystemBackend;
  /**
   * The root handle a snapshot poll walks. Present only for a root that can be
   * snapshotted; a root that reports its own changes and carries none is
   * natively observed or nothing.
   */
  readonly directoryHandle?: FileSystemDirectoryHandle;
  readonly provider: FileSystemProvider;
  /** Releases the provider's own observation; absent while it is not armed. */
  unobserve?: () => void;
  nativeActive: boolean;
  readonly pollSnapshots: Map<string, string>;
  tail: Promise<void>;
};

/**
 * The root handle a snapshot poll can walk, when the configured root carries one.
 *
 * Read structurally, not by backend name: a root that hands the authority a
 * directory handle can be snapshotted, whichever backend produced it.
 *
 * @param root - One configured discovery root.
 * @returns The handle, or `undefined` when the root cannot be snapshotted.
 */
const snapshotSource = (root: StorageRootConfig): FileSystemDirectoryHandle | undefined =>
  'directoryHandle' in root ? root.directoryHandle : undefined;

type ExternalLogicalMapping = {
  readonly path: string;
  readonly resolution: MountResolution;
};

/** One admitted fact with everything the emitters need resolved once. */
type PreparedExternalFact = {
  readonly fact: PathChangeFact;
  readonly physicalPath: string;
  readonly oldPhysicalPath: string | undefined;
  readonly mappings: readonly ExternalLogicalMapping[];
  readonly knownKinds: ReadonlyMap<MountResolution['entry'], 'file' | 'dir' | undefined>;
};

/** One discovery root staged by `WorkspaceFileService.configureProjectRoots`. @public */
export type StagedDiscoveryRoot = {
  readonly root: StorageRootConfig;
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
};

/**
 * Workspace app state (`<root>/.tau/**`, `.git/**`, …): never a project, never
 * an input to discovery, and never worth an external-change fan-out.
 *
 * @param physicalPath - Canonical provider-relative path.
 * @returns Whether the path lives under a dot-prefixed root child.
 */
function isWorkspaceStatePath(physicalPath: string): boolean {
  return physicalPath.split('/')[0]?.startsWith('.') === true;
}

/**
 * The authority's external-change arm: observed-root bookkeeping, native record
 * application, snapshot polling and discovery relevance.
 *
 * @public
 */
export class ExternalChangeIngest {
  private readonly _registry: ProviderRegistry;
  private readonly _mountTable: MountTable;
  private readonly _pipeline: MutationPipeline;
  private readonly _crossTabCoordinator: CrossTabCoordinator;
  private readonly _treeIndexes: TreeIndexes;
  /** Read through a function: the writer-side pool arrives after construction. */
  private readonly _filePool: () => SharedPool | undefined;
  /** Drops the registry's provider for a root whose physical identity changed. */
  private readonly _disposeStorageRoot: (storageRootKey: string) => void;
  private readonly _observedExternalRoots = new Map<string, ObservedExternalRoot>();

  /**
   * Create the ingest over the authority's own collaborators.
   *
   * @param options - The registry, mount table, mutation pipeline, cross-tab coordinator, per-root indexes, pool accessor and storage-root disposer the authority owns.
   */
  public constructor(options: {
    registry: ProviderRegistry;
    mountTable: MountTable;
    pipeline: MutationPipeline;
    crossTabCoordinator: CrossTabCoordinator;
    treeIndexes: TreeIndexes;
    filePool: () => SharedPool | undefined;
    disposeStorageRoot: (storageRootKey: string) => void;
  }) {
    this._registry = options.registry;
    this._mountTable = options.mountTable;
    this._pipeline = options.pipeline;
    this._crossTabCoordinator = options.crossTabCoordinator;
    this._treeIndexes = options.treeIndexes;
    this._filePool = options.filePool;
    this._disposeStorageRoot = options.disposeStorageRoot;
  }

  /**
   * Safety-reconcile one routed project, or every observed root when omitted.
   *
   * @param root - Optional routed project root.
   * @returns `true` when every root this call covered is under live native
   *          delivery, which lets the caller poll on a slow safety-net cadence instead.
   */
  public async poll(root?: string): Promise<boolean> {
    if (root === undefined) {
      const states = [...this._observedExternalRoots.values()];
      await Promise.all(states.map(async (state) => this._pollExternalRoot(state)));
      return states.length > 0 && states.every(({ nativeActive }) => nativeActive);
    }
    const resolution = this._mountTable.resolve(root);
    const { entry } = resolution;
    if (entry?.storageRootKey === undefined) {
      return false;
    }
    const state = [...this._observedExternalRoots.values()].find(
      (candidate) => candidate.provider === resolution.provider && candidate.storageRootKey === entry.storageRootKey,
    );
    if (state === undefined) {
      return false;
    }
    await this._pollExternalRoot(state, entry.providerBasePath);
    return state.nativeActive;
  }

  /** Release every observed root's native subscription. */
  public dispose(): void {
    for (const storageRootKey of this._observedExternalRoots.keys()) {
      this.disconnectRoot(storageRootKey);
    }
  }

  /**
   * Release one root's native subscription and forget its poll baselines.
   *
   * @param storageRootKey - Canonical physical storage-root identity.
   */
  public disconnectRoot(storageRootKey: string): void {
    const state = this._observedExternalRoots.get(storageRootKey);
    this._observedExternalRoots.delete(storageRootKey);
    state?.unobserve?.();
    if (state !== undefined) {
      state.pollSnapshots.clear();
    }
  }

  /**
   * Drop a cached webaccess provider whose root the user re-picked, so staging
   * never retains a handle for a different directory entry.
   *
   * @param stagedRoots - Discovery roots this pass staged.
   */
  public async evictReplacedRoots(stagedRoots: readonly StagedDiscoveryRoot[]): Promise<void> {
    for (const staged of stagedRoots) {
      const stagedHandle = snapshotSource(staged.root);
      const observed = this._observedExternalRoots.get(staged.storageRootKey);
      const observedHandle = observed?.directoryHandle;
      if (
        observed === undefined ||
        observedHandle === undefined ||
        stagedHandle === undefined ||
        observedHandle === stagedHandle
      ) {
        continue;
      }
      let sameEntry = false;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Provider staging must not retain a handle for a different entry.
        sameEntry = await observedHandle.isSameEntry(stagedHandle);
      } catch {
        // A failed identity check cannot prove that the cached provider still owns this root.
      }
      if (!sameEntry && this._observedExternalRoots.get(staged.storageRootKey) === observed) {
        this.disconnectRoot(staged.storageRootKey);
        // oxlint-disable-next-line no-await-in-loop -- Do not dispose a provider while an admitted root operation uses it.
        await observed.tail;
        this._disposeStorageRoot(staged.storageRootKey);
      }
    }
  }

  /**
   * Bring observation in line with one staged topology: drop the roots it no
   * longer names and arm the ones it newly names.
   *
   * A root is observed when its provider declares `observe()`, when the root
   * carries a snapshot source, or both. Nothing here names a backend: the two
   * capabilities decide, so a new backend that can watch itself needs no edit
   * here and one that cannot is simply never armed (charter D13).
   *
   * @param roots - Discovery roots this pass staged, in configuration order.
   */
  public async syncRoots(roots: readonly StagedDiscoveryRoot[]): Promise<void> {
    const retainedKeys = new Set(roots.map(({ storageRootKey }) => storageRootKey));
    for (const storageRootKey of this._observedExternalRoots.keys()) {
      if (!retainedKeys.has(storageRootKey)) {
        this.disconnectRoot(storageRootKey);
      }
    }

    const additions = await Promise.all(
      roots
        .filter(({ storageRootKey }) => !this._observedExternalRoots.has(storageRootKey))
        .map(async ({ root, scope, storageRootKey }) => {
          try {
            return { root, storageRootKey, provider: await this._registry.getProvider(scope) };
          } catch {
            return undefined;
          }
        }),
    );
    for (const addition of additions) {
      if (addition === undefined) {
        continue;
      }
      const { root, storageRootKey, provider } = addition;
      const directoryHandle = snapshotSource(root);
      if (provider.observe === undefined && directoryHandle === undefined) {
        continue;
      }
      const state: ObservedExternalRoot = {
        storageRootKey,
        backend: root.backend,
        ...(directoryHandle === undefined ? {} : { directoryHandle }),
        provider,
        nativeActive: false,
        pollSnapshots: new Map(),
        tail: Promise.resolve(),
      };
      this._observedExternalRoots.set(storageRootKey, state);
      this._armObservation(state);
    }
  }

  /**
   * Arm the provider's own observation for one freshly registered root.
   *
   * Facts that arrive before arming settles are buffered and applied with it, so
   * an edit made during setup is never lost. A provider that resolves
   * `undefined` could not arm but has a polling fallback, so nothing is
   * published; a provider that rejects has no fallback, so the root resets.
   *
   * @param state - The observed-root record this call owns.
   */
  private _armObservation(state: ObservedExternalRoot): void {
    const { storageRootKey, provider } = state;
    const { observe } = provider;
    if (observe === undefined) {
      return;
    }
    const pending: PathChangeFact[] = [];
    // async-iife: bootstrap — arming may cross a process boundary; mounting must not block on it.
    void (async () => {
      try {
        const unobserve = await observe.call(provider, (facts) => {
          if (this._observedExternalRoots.get(storageRootKey) !== state) {
            return;
          }
          if (facts.some(({ kind }) => kind === 'reset')) {
            this._disableNativeObservation(state);
            return;
          }
          const pathFacts = facts.filter((fact): fact is PathChangeFact => fact.kind !== 'reset');
          if (!state.nativeActive) {
            pending.push(...pathFacts);
            return;
          }
          if (state.unobserve === undefined) {
            return;
          }
          // async-iife: An observer callback cannot await its own serialization.
          void this._handleExternalFacts(state, pathFacts);
        });
        if (unobserve === undefined) {
          return;
        }
        if (this._observedExternalRoots.get(storageRootKey) !== state) {
          unobserve();
          return;
        }
        state.unobserve = unobserve;
        await this._queueExternalRootOperation(state, async () => {
          if (this._observedExternalRoots.get(storageRootKey) !== state) {
            unobserve();
            return;
          }
          state.nativeActive = true;
          if (pending.length > 0) {
            await this._applyExternalFacts(state, pending.splice(0));
          }
        });
        await this._pollExternalRoot(state);
      } catch {
        this._disableNativeObservation(state);
      }
    })();
  }

  private async _handleExternalFacts(state: ObservedExternalRoot, facts: readonly PathChangeFact[]): Promise<void> {
    try {
      await this._queueExternalRootOperation(state, async () => {
        if (state.unobserve === undefined || !state.nativeActive) {
          return;
        }
        await this._applyExternalFacts(state, facts);
      });
    } catch {
      this._disableNativeObservation(state);
    }
  }

  private async _queueExternalRootOperation(
    state: ObservedExternalRoot,
    operation: () => Promise<void>,
  ): Promise<void> {
    const predecessor = state.tail;
    let release: () => void;
    state.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      try {
        await predecessor;
      } catch {
        // A rejected record must not strand later native or polling facts.
      }
      if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
        return;
      }
      await operation();
    } finally {
      release!();
    }
  }

  private async _pollExternalRoot(state: ObservedExternalRoot, providerBasePath?: string): Promise<void> {
    if (state.directoryHandle === undefined) {
      /* Polling is the fallback for a root that cannot report its own changes.
       * A root with no snapshot source is observed or nothing, so a safety poll
       * of it is a no-op rather than a failure. */
      return;
    }
    const scope = providerBasePath ?? '*';
    const snapshot = await this._createExternalSnapshot(state, providerBasePath);
    await this._queueExternalRootOperation(state, async () => {
      await this._applyExternalSnapshot(state, scope, snapshot);
    });
  }

  /**
   * Apply one batch of path-bearing facts to this root.
   *
   * @param state - The observed root the facts belong to.
   * @param facts - Facts as the provider reported them, unfiltered.
   */
  private async _applyExternalFacts(state: ObservedExternalRoot, facts: readonly PathChangeFact[]): Promise<void> {
    const admitted = facts.filter(
      (fact) => !this._isChromiumSwapOnlyFact(fact) && !isWorkspaceStatePath(this._physicalPath(fact.path)),
    );
    if (admitted.length === 0) {
      return;
    }
    if (admitted.some(({ kind }) => kind === 'unknown')) {
      await this._reconcileUnknownExternalFacts(state, admitted);
      return;
    }

    const prepared = admitted.map((fact) => {
      const physicalPath = this._physicalPath(fact.path);
      const oldPhysicalPath = fact.from === undefined ? undefined : this._physicalPath(fact.from);
      const mappings = this._logicalMappingsForPhysicalPath(state, physicalPath);
      const knownKinds = new Map(
        mappings.map(({ path, resolution }) => [resolution.entry, this._treeIndexes.statType(path)] as const),
      );
      return { fact, physicalPath, oldPhysicalPath, mappings, knownKinds };
    });

    const physicalPaths = prepared.flatMap(({ physicalPath, oldPhysicalPath }) =>
      oldPhysicalPath === undefined ? [physicalPath] : [physicalPath, oldPhysicalPath],
    );
    await state.provider.refresh?.(physicalPaths);
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    this._invalidateExternalDerivatives({ state, physicalPaths });
    let discoveryChanged = false;
    for (const change of prepared) {
      discoveryChanged ||= this._touchesDiscovery(change);
      this._emitExternalFact(state, change);
    }
    if (discoveryChanged) {
      this._emitGlobalDiscoveryChange(state);
    }
  }

  /**
   * Whether one prepared fact can have changed what project discovery reports.
   *
   * @param change - One prepared fact with its logical mappings.
   * @returns Whether discovery must be republished for this root.
   */
  private _touchesDiscovery(change: PreparedExternalFact): boolean {
    const { fact, physicalPath, oldPhysicalPath, mappings } = change;
    return (
      mappings.length === 0 ||
      this._isDiscoveryRelevantPhysicalPath(physicalPath) ||
      (fact.kind === 'moved' && oldPhysicalPath !== undefined && this._isDiscoveryRelevantPhysicalPath(oldPhysicalPath))
    );
  }

  /**
   * Publish one prepared fact on every mount projecting its physical path, or a
   * root summary when no mount projects it.
   *
   * @param state - The observed root the fact belongs to.
   * @param change - One prepared fact with its logical mappings.
   */
  private _emitExternalFact(state: ObservedExternalRoot, change: PreparedExternalFact): void {
    const { fact, physicalPath, mappings, knownKinds } = change;
    switch (fact.kind) {
      case 'created': {
        if (mappings.length === 0 && !this._isDiscoveryRelevantPhysicalPath(physicalPath)) {
          this._emitExternalRootSummaries(state);
        }
        for (const mapping of mappings) {
          this._emitExternalCreation(mapping, fact.entry);
        }
        return;
      }
      case 'modified': {
        if (mappings.length === 0 && !this._isDiscoveryRelevantPhysicalPath(physicalPath)) {
          this._emitExternalRootSummaries(state);
        }
        for (const mapping of mappings) {
          if (fact.entry === 'file') {
            this._emitExternalFileWrite(mapping);
          } else {
            this._emitExternalDirectorySummary(mapping, mapping.path);
          }
        }
        return;
      }
      case 'deleted': {
        if (mappings.length === 0) {
          this._emitExternalRootSummaries(state);
        }
        for (const mapping of mappings) {
          const kind = knownKinds.get(mapping.resolution.entry);
          if (kind === 'file' || kind === 'dir') {
            this._emitExternalDeletion(mapping, kind);
          } else {
            this._emitExternalDirectorySummary(mapping, parentDirectory(mapping.path));
          }
        }
        return;
      }
      case 'moved': {
        // A rename is two facts the observer cannot correlate; resummarize instead of guessing.
        this._emitExternalRootSummaries(state);
        return;
      }
      default: {
        throw new Error(`Unexpected admitted external fact: ${fact.kind}`);
      }
    }
  }

  private _physicalPath(path: string): string {
    return assertRootedPath(path);
  }

  private _isChromiumSwapOnlyFact(fact: PathChangeFact): boolean {
    if (fact.kind === 'unknown') {
      return false;
    }
    const current = fact.path.split('/').at(-1);
    if (current === undefined || !isChromiumSwapArtifactName(current)) {
      return false;
    }
    if (fact.kind !== 'moved' || fact.from === undefined) {
      return true;
    }
    const previous = fact.from.split('/').at(-1);
    return previous !== undefined && isChromiumSwapArtifactName(previous);
  }

  private _logicalMappingsForPhysicalPath(state: ObservedExternalRoot, physicalPath: string): ExternalLogicalMapping[] {
    const mappings: ExternalLogicalMapping[] = [];
    for (const entry of this._mountTable.listMounts()) {
      if (entry.provider !== state.provider || entry.storageRootKey !== state.storageRootKey) {
        continue;
      }
      const base = entry.providerBasePath;
      if (physicalPath !== base && !(base === '' ? physicalPath !== '' : physicalPath.startsWith(`${base}/`))) {
        continue;
      }
      const suffix = base === '' ? physicalPath : physicalPath === base ? '' : physicalPath.slice(base.length + 1);
      const path =
        suffix === ''
          ? entry.prefix
          : entry.prefix === '/'
            ? resolveAuthorityPath(`/${suffix}`)
            : resolveAuthorityPath(`${entry.prefix}/${suffix}`);
      mappings.push({
        path,
        resolution: { provider: state.provider, path: physicalPath, backend: entry.backend, entry },
      });
    }
    return mappings;
  }

  private _emitExternalCreation(mapping: ExternalLogicalMapping, kind: 'file' | 'dir' | undefined): void {
    if (kind === 'file') {
      this._emitExternalFileWrite(mapping);
      return;
    }
    if (kind === 'dir') {
      this._pipeline.emitChangeEvent(
        { type: 'directoryCreated', path: mapping.path, backend: mapping.resolution.backend },
        undefined,
        { operations: [mapping] },
      );
      this._crossTabCoordinator.notifyMutation({
        type: 'mkdir',
        path: mapping.path,
        authority: this._pipeline.physicalAuthority(mapping.resolution),
      });
      return;
    }
    this._emitExternalDirectorySummary(mapping, parentDirectory(mapping.path));
  }

  private _emitExternalFileWrite(mapping: ExternalLogicalMapping): void {
    this._pipeline.emitChangeEvent(
      { type: 'fileWritten', path: mapping.path, backend: mapping.resolution.backend },
      undefined,
      {
        operations: [mapping],
      },
    );
    this._crossTabCoordinator.notifyMutation({
      type: 'write',
      path: mapping.path,
      authority: this._pipeline.physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDeletion(mapping: ExternalLogicalMapping, kind: 'file' | 'dir'): void {
    this._pipeline.emitChangeEvent(
      kind === 'file'
        ? { type: 'fileDeleted', path: mapping.path, backend: mapping.resolution.backend }
        : { type: 'directoryDeleted', path: mapping.path, backend: mapping.resolution.backend },
      undefined,
      { operations: [mapping] },
    );
    this._crossTabCoordinator.notifyMutation({
      type: kind === 'file' ? 'delete' : 'rmdir',
      path: mapping.path,
      authority: this._pipeline.physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDirectorySummary(mapping: ExternalLogicalMapping, logicalPath: string): void {
    const separator = mapping.resolution.path.lastIndexOf('/');
    const physicalPath =
      logicalPath === mapping.path
        ? mapping.resolution.path
        : separator === -1
          ? ''
          : mapping.resolution.path.slice(0, separator);
    const resolution = { ...mapping.resolution, path: physicalPath };
    this._pipeline.emitChangeEvent(
      { type: 'directoryChanged', path: logicalPath, backend: mapping.resolution.backend },
      undefined,
      { operations: [{ path: logicalPath, resolution }] },
    );
    this._crossTabCoordinator.notifyDirectoryChange(logicalPath, this._pipeline.physicalAuthority(mapping.resolution));
  }

  private _emitExternalRootSummaries(state: ObservedExternalRoot, providerBasePath?: string): void {
    for (const entry of this._mountTable.listMounts()) {
      if (
        entry.provider !== state.provider ||
        entry.storageRootKey !== state.storageRootKey ||
        (providerBasePath !== undefined && entry.providerBasePath !== providerBasePath)
      ) {
        continue;
      }
      this._emitExternalDirectorySummary(
        {
          path: entry.prefix,
          resolution: {
            provider: state.provider,
            path: entry.providerBasePath,
            backend: entry.backend,
            entry,
          },
        },
        entry.prefix,
      );
    }
  }

  private _disableNativeObservation(state: ObservedExternalRoot): void {
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    state.unobserve?.();
    state.unobserve = undefined;
    state.nativeActive = false;
    // async-iife: bootstrap — observer callbacks cannot await recovery, but reset facts
    // must remain serialized behind any native/poll operation already in flight.
    void (async (): Promise<void> => {
      try {
        await this._queueExternalRootOperation(state, async () => {
          await state.provider.refresh?.();
          if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
            return;
          }
          this._invalidateExternalDerivatives();
          this._emitExternalRootSummaries(state);
          this._emitGlobalDiscoveryChange(state);
        });
      } catch {
        // Polling remains active and can retry after a provider refresh failure.
      }
    })();
  }

  /**
   * Drop the derivatives an external change invalidated.
   *
   * @param scoped - Root and provider-physical paths whose subtrees changed. Omit
   *                 for a full drop when the change cannot be localized.
   */
  private _invalidateExternalDerivatives(scoped?: {
    state: ObservedExternalRoot;
    physicalPaths: readonly string[];
  }): void {
    if (scoped === undefined) {
      this._filePool()?.clear();
    } else {
      for (const physicalPath of scoped.physicalPaths) {
        for (const { path } of this._logicalMappingsForPhysicalPath(scoped.state, physicalPath)) {
          this._filePool()?.invalidate(path);
        }
      }
    }
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: the tree is dropped whole even for a localized change — TreeIndex
    // cannot express "this subtree is unknown", and a scoped removal would publish a
    // stale absence. Give it a subtree-invalidation state if the rebuild scan shows up hot.
    this._treeIndexes.clear();
  }

  /**
   * Provider-physical paths whose subtrees differ between two snapshots.
   *
   * @param previous - Snapshot captured on the last pass.
   * @param next - Snapshot captured on this pass.
   * @returns Changed paths, or `undefined` when the diff cannot be localized.
   */
  private _diffExternalSnapshot(previous: string, next: string): string[] | undefined {
    if (previous === missingExternalSnapshot || next === missingExternalSnapshot) {
      return undefined;
    }
    const rowsByPath = (snapshot: string): Map<string, string> =>
      new Map(snapshot === '' ? [] : snapshot.split('\n').map((row) => [row.slice(0, row.indexOf('\0')), row]));
    const previousRows = rowsByPath(previous);
    const nextRows = rowsByPath(next);
    // Every snapshot row is relative to the workspace root, rooted or discovery-wide.
    const changed: string[] = [];
    for (const [relative, row] of previousRows) {
      if (nextRows.get(relative) !== row) {
        changed.push(relative);
      }
    }
    for (const relative of nextRows.keys()) {
      if (!previousRows.has(relative)) {
        changed.push(relative);
      }
    }
    return changed.length > maxLocalizedExternalChanges ? undefined : changed;
  }

  private _emitGlobalDiscoveryChange(state: ObservedExternalRoot): void {
    this._pipeline.emitChangeEvent({ type: 'directoryChanged', path: '/', backend: state.backend });
    this._crossTabCoordinator.notifyDirectoryChange('/', {
      storageRootKey: state.storageRootKey,
      providerBasePath: '',
    });
  }

  private _isDiscoveryRelevantPhysicalPath(path: string): boolean {
    if (isWorkspaceStatePath(path)) {
      return false;
    }
    const [, child, ...deeper] = path.split('/').filter(Boolean);
    return child === undefined || (deeper.length === 0 && child === 'tau.json');
  }

  private async _createExternalSnapshot(state: ObservedExternalRoot, providerBasePath?: string): Promise<string> {
    const rows: string[] = [];
    type EntryHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
    type IterableDirectoryHandle = FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, EntryHandle]>;
    };
    const admittedEntries = async (handle: FileSystemDirectoryHandle): Promise<Array<[string, EntryHandle]>> => {
      const entries: Array<[string, EntryHandle]> = [];
      for await (const entry of (handle as IterableDirectoryHandle).entries()) {
        if (!isChromiumSwapArtifactName(entry[0])) {
          entries.push(entry);
        }
      }
      return entries.toSorted(([left], [right]) => left.localeCompare(right));
    };
    // Resolve one row per name in chunks, so metadata reads overlap without unbounded handle pressure.
    const resolveRows = async <T>(
      names: readonly T[],
      toRow: (item: T) => Promise<[name: string, row: string | undefined]>,
    ): Promise<Map<string, string>> => {
      const rows = await mapConcurrent(names, externalSnapshotConcurrency, toRow);
      return new Map(rows.filter((row): row is [name: string, row: string] => row[1] !== undefined));
    };
    const fileRow = async (name: string, relative: string, handle: FileSystemFileHandle): Promise<[string, string]> => {
      const file = await handle.getFile();
      return [name, `${relative}\0file\0${file.size}\0${file.lastModified}`];
    };
    const walk = async (handle: FileSystemDirectoryHandle, relative: string): Promise<void> => {
      const entries = await admittedEntries(handle);
      const childRelative = (name: string): string => (relative === '' ? name : `${relative}/${name}`);
      const fileRows = await resolveRows(
        entries.filter((entry): entry is [string, FileSystemFileHandle] => entry[1].kind === 'file'),
        async ([name, child]) => fileRow(name, childRelative(name), child),
      );
      for (const [name, child] of entries) {
        if (child.kind === 'directory') {
          rows.push([childRelative(name), 'dir', 0, 0].join('\0'));
          // oxlint-disable-next-line no-await-in-loop -- Recursive fallback polling is intentionally sequential.
          await walk(child, childRelative(name));
        } else {
          rows.push(fileRows.get(name)!);
        }
      }
    };
    const rootHandle = state.directoryHandle;
    if (rootHandle === undefined) {
      // Reconciling a fact the observer could not describe needs a snapshot; a
      // root without one can only reset, which is what this rejection triggers.
      throw new Error(`Snapshot reconciliation is unavailable for the ${state.storageRootKey} root.`);
    }
    try {
      if (providerBasePath !== undefined) {
        const parts = providerBasePath.split('/').filter(Boolean);
        let handle = rootHandle;
        for (const part of parts) {
          // oxlint-disable-next-line no-await-in-loop -- Directory-handle traversal is necessarily ordered.
          handle = await handle.getDirectoryHandle(part);
        }
        await walk(handle, parts.join('/'));
        return rows.join('\n');
      }
      // App state under a dot-prefixed root child never feeds discovery (F1).
      const rootEntries = await admittedEntries(rootHandle);
      const entries = rootEntries.filter(([name]) => !name.startsWith('.'));
      const topLevelRows = await resolveRows(entries, async ([name, child]) => {
        if (child.kind === 'file') {
          return fileRow(name, name, child);
        }
        try {
          // Project discovery only depends on the immediate directory and its manifest.
          const manifestHandle = await child.getFileHandle('tau.json');
          const manifest = await manifestHandle.getFile();
          return [name, `${name}/tau.json\0file\0${manifest.size}\0${manifest.lastModified}`];
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          return [name, undefined];
        }
      });
      for (const [name, child] of entries) {
        if (child.kind === 'file') {
          rows.push(topLevelRows.get(name)!);
          continue;
        }
        rows.push([name, 'dir', 0, 0].join('\0'));
        const manifestRow = topLevelRows.get(name);
        if (manifestRow !== undefined) {
          rows.push(manifestRow);
        }
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        return missingExternalSnapshot;
      }
      throw error;
    }
    return rows.join('\n');
  }

  private async _reconcileUnknownExternalFacts(
    state: ObservedExternalRoot,
    facts: readonly PathChangeFact[],
  ): Promise<void> {
    const providerBasePaths = new Set<string>();
    for (const fact of facts) {
      const mappings = this._logicalMappingsForPhysicalPath(state, this._physicalPath(fact.path));
      for (const { resolution } of mappings) {
        const providerBasePath = resolution.entry?.providerBasePath;
        if (providerBasePath) {
          providerBasePaths.add(providerBasePath);
        }
      }
    }
    if (providerBasePaths.size !== 1) {
      const next = await this._createExternalSnapshot(state);
      await this._applyExternalSnapshot(state, '*', next);
      return;
    }
    const providerBasePath = [...providerBasePaths][0]!;
    const next = await this._createExternalSnapshot(state, providerBasePath);
    await this._applyExternalSnapshot(state, providerBasePath, next);
  }

  private async _applyExternalSnapshot(state: ObservedExternalRoot, scope: string, next: string): Promise<void> {
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    const previous = state.pollSnapshots.get(scope);
    if (previous === undefined) {
      if (state.nativeActive) {
        await state.provider.refresh?.();
        if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
          return;
        }
        this._invalidateExternalDerivatives();
        this._emitExternalRootSummaries(state, scope === '*' ? undefined : scope);
        this._emitGlobalDiscoveryChange(state);
      }
      state.pollSnapshots.set(scope, next);
      return;
    }
    if (previous === next) {
      return;
    }
    const physicalPaths = this._diffExternalSnapshot(previous, next);
    await state.provider.refresh?.(physicalPaths);
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    this._invalidateExternalDerivatives(physicalPaths === undefined ? undefined : { state, physicalPaths });
    this._emitExternalRootSummaries(state, scope === '*' ? undefined : scope);
    this._emitGlobalDiscoveryChange(state);
    state.pollSnapshots.set(scope, next);
  }
}
