import { Topic } from '@taucad/events';
import { toChangeSet, watchByChangeSets, watchEventsOfChangeSetFor } from '@taucad/filesystem';
import type {
  BridgeWatchHandle,
  ChangeSet,
  ChangeSetChannelEvent,
  ChangeSetWatchRequest,
  WatchRequest,
  WatchEvent,
} from '@taucad/filesystem';
import type { ObservationWatch } from '#observation-service.js';
import type { ChangeEvent, FileSystemBackend, PathChangeEvent } from '@taucad/types';

/**
 * One frame of a connection's event channel, as this channel reads it: the
 * filesystem package's structural form of a rooted proxy's
 * `FileSystemBridgeEvent`, so this package does not depend on the bridge.
 *
 * @public
 */
export type WorkerChannelEvent = ChangeSetChannelEvent;

/**
 * Transport surface required to wire worker push events (typically
 * `proxy.listen` from the file manager worker).
 *
 * @public
 */
export type WorkerChangeChannelTransport = {
  /**
   * The connection's one event channel (charter D14): every change set of the
   * root as the connection's view sees it. When present, every watch this
   * channel registers listens on it and reads its own events off each set, so
   * the authority delivers a changeset to the connection once however many
   * watches the tree and the open documents hold. `ready` rejecting with
   * `ENOTSUP` falls back to `watchChangeSets`, then `watchReady`.
   */
  events?: (handler: (event: WorkerChannelEvent) => void) => BridgeWatchHandle;
  /**
   * Called with each watch this channel registers on `events`, answering the
   * registration to use: an opt-in diagnostic's seam. A transport wraps its
   * own `watchChangeSets` and `watchReady` registrations itself.
   */
  observeWatch?: (request: WatchRequest, watch: BridgeWatchHandle) => BridgeWatchHandle;
  listen: (event: string, handler: (data: unknown) => void) => () => void;
  /** Actual authority registration; omitted only by local synchronous sources. */
  watchReady?: (
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ) => { ready: Promise<void>; closed: Promise<void>; unsubscribe(): void };
  /**
   * The authority's change-set form of a watch (charter D6): one frame per
   * committed changeset. When present, every watch this channel registers uses
   * it, so a fifty-file turn crosses the wire once per watch rather than once
   * per path; `ready` rejecting with `ENOTSUP` falls back to `watchReady`.
   */
  watchChangeSets?: (
    request: ChangeSetWatchRequest,
    handler: (set: ChangeSet) => void,
  ) => { ready: Promise<void>; closed: Promise<void>; unsubscribe(): void };
  closed?: Promise<void>;
};

/**
 * Subscription registered on {@link WorkerChangeChannel} fan-out queues.
 *
 * @public
 */
export type WorkerChangeSubscription<T> = {
  readonly handler: (event: T) => void;
  /** When set, the handler runs only if this returns true for the relative path. */
  readonly interestedIn?: (relativePath: string) => boolean;
  /** When set, unsubscribes the moment the signal aborts. */
  readonly signal?: AbortSignal;
};

/**
 * Rename notification with workspace-relative paths.
 *
 * Both edges arrive on a rooted transport — the bridge degrades a rename with
 * one end outside the root to an arrival or a disappearance — so an absent edge
 * is what a consumer must still tolerate, not what it will be handed.
 *
 * @public
 */
export type WorkerRelativeRenameEvent = {
  readonly type: 'fileRenamed';
  readonly oldPath: string | undefined;
  readonly newPath: string | undefined;
  readonly backend: FileSystemBackend;
};

/**
 * Directory rename notification with workspace-relative paths. Distinct
 * discriminator from {@link WorkerRelativeRenameEvent} so subtree-aware
 * consumers (FileContentService cache subtree migration, FileTreeService
 * subtree re-key, EditorDocumentSession document batch migration) can react to
 * the structural change without conflating it with a single-file rename.
 *
 * @public
 */
export type WorkerRelativeDirectoryRenameEvent = {
  readonly type: 'directoryRenamed';
  readonly oldPath: string | undefined;
  readonly newPath: string | undefined;
  readonly backend: FileSystemBackend;
};

/**
 * Directory creation notification (e.g. from `mkdir`).
 *
 * @public
 */
export type WorkerRelativeDirectoryCreateEvent = {
  readonly type: 'directoryCreated';
  readonly path: string;
  readonly backend: FileSystemBackend;
};

/**
 * Directory deletion notification (e.g. from recursive `rmdir`).
 *
 * @public
 */
export type WorkerRelativeDirectoryDeleteEvent = {
  readonly type: 'directoryDeleted';
  readonly path: string;
  readonly backend: FileSystemBackend;
};

/**
 * File copy notification, distinct from `fileWritten` so participants can
 * react to deliberate duplication without conflating it with content edits.
 *
 * @public
 */
export type WorkerRelativeFileCopyEvent = {
  readonly type: 'fileCopied';
  readonly sourcePath: string | undefined;
  readonly targetPath: string;
  readonly backend: FileSystemBackend;
};

/**
 * Directory copy notification, distinct from a flurry of `fileWritten`
 * events so participants treat the subtree as a single logical operation.
 *
 * @public
 */
export type WorkerRelativeDirectoryCopyEvent = {
  readonly type: 'directoryCopied';
  readonly sourcePath: string | undefined;
  readonly targetPath: string;
  readonly backend: FileSystemBackend;
};

function isChangeEvent(value: unknown): value is ChangeEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  const { type } = value as { type: unknown };
  if (type === 'changeSet') {
    const { entries } = value as { entries?: unknown };
    return Array.isArray(entries) && entries.every((entry) => isChangeEvent(entry) && entry.type !== 'changeSet');
  }
  return (
    type === 'fileWritten' ||
    type === 'fileDeleted' ||
    type === 'fileRenamed' ||
    type === 'fileCopied' ||
    type === 'directoryCreated' ||
    type === 'directoryDeleted' ||
    type === 'directoryRenamed' ||
    type === 'directoryCopied' ||
    type === 'directoryChanged' ||
    type === 'backendChanged'
  );
}

const isUnsupported = (error: unknown): boolean =>
  error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOTSUP';

/** The authority's root spelling (`/`) is this namespace's `''`. */
const relativeDirectory = (directory: string): string => (directory === '/' ? '' : directory);

/**
 * One delivery's facts as one change set in the workspace-relative namespace (charter D6).
 *
 * @param facts - Every fact of one delivery, in order.
 * @param generation - This channel's delivery count.
 * @returns The change set, or `undefined` for none.
 */
const relativeChangeSet = (facts: readonly PathChangeEvent[], generation: number): ChangeSet | undefined => {
  const set = toChangeSet(facts, generation);
  if (set === undefined) {
    return undefined;
  }
  return {
    ...set,
    touchedDirectories: [...new Set(set.touchedDirectories.map(relativeDirectory))],
    ...(set.reset === undefined ? {} : { reset: { ...set.reset, prefix: relativeDirectory(set.reset.prefix) } }),
  };
};

/**
 * Owns a single `fileChanged` subscription and fans out typed, workspace-relative
 * events to facades. Does not suppress self-writes — the runtime bridge already
 * skips the originator.
 *
 * The transport is the project's own rooted connection (charter D12), so events
 * arrive in the workspace-relative namespace the facades speak and this channel
 * translates nothing: `scopeEventToRoot` in the bridge has already re-spelled
 * every path and withheld everything outside the root. Re-applying a resolver
 * here would drop the very events it was meant to deliver.
 *
 * @public
 * @example <caption>Subscribe to file writes with a path filter</caption>
 * ```typescript
 * import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
 * import type { WorkerChangeChannelTransport } from '@taucad/fs-client/worker-change-channel';
 * export function exampleWorkerChannel(listen: WorkerChangeChannelTransport['listen']): WorkerChangeChannel {
 *   const channel = new WorkerChangeChannel({ transport: { listen } });
 *   const openPaths = new Set<string>(['a.ts']);
 *   channel.onFileWritten({
 *     interestedIn: (relativePath: string) => openPaths.has(relativePath),
 *     handler: () => undefined,
 *   });
 *   return channel;
 * }
 * ```
 */
export class WorkerChangeChannel {
  private readonly unlisten: () => void;
  private readonly transport: WorkerChangeChannelTransport;
  private readonly closedSignal = Promise.withResolvers<void>();
  readonly #fileWritten = new Topic<{ type: 'fileWritten'; path: string; backend: FileSystemBackend }>({
    name: 'WorkerChangeChannel.fileWritten',
  });
  readonly #fileDeleted = new Topic<{ type: 'fileDeleted'; path: string; backend: FileSystemBackend }>({
    name: 'WorkerChangeChannel.fileDeleted',
  });
  readonly #fileRenamed = new Topic<WorkerRelativeRenameEvent>({ name: 'WorkerChangeChannel.fileRenamed' });
  readonly #fileCopied = new Topic<WorkerRelativeFileCopyEvent>({ name: 'WorkerChangeChannel.fileCopied' });
  readonly #directoryCreated = new Topic<WorkerRelativeDirectoryCreateEvent>({
    name: 'WorkerChangeChannel.directoryCreated',
  });
  readonly #directoryDeleted = new Topic<WorkerRelativeDirectoryDeleteEvent>({
    name: 'WorkerChangeChannel.directoryDeleted',
  });
  readonly #directoryRenamed = new Topic<WorkerRelativeDirectoryRenameEvent>({
    name: 'WorkerChangeChannel.directoryRenamed',
  });
  readonly #directoryCopied = new Topic<WorkerRelativeDirectoryCopyEvent>({
    name: 'WorkerChangeChannel.directoryCopied',
  });
  readonly #directoryChanged = new Topic<{ type: 'directoryChanged'; path: string; backend: FileSystemBackend }>({
    name: 'WorkerChangeChannel.directoryChanged',
  });
  readonly #backendChanged = new Topic<Extract<ChangeEvent, { type: 'backendChanged' }>>({
    name: 'WorkerChangeChannel.backendChanged',
  });
  readonly #changeSets = new Topic<ChangeSet>({ name: 'WorkerChangeChannel.changeSets' });
  #deliveries = 0;
  /** The connection answered `ENOTSUP` for its event channel: later watches skip it. */
  #eventsUnsupported = false;

  /** Whether exact authority watches own observation invalidation. @returns True for a real watch transport. */
  public get hasAuthorityWatch(): boolean {
    return this.transport.watchReady !== undefined || this.transport.events !== undefined;
  }

  public constructor(deps: { transport: WorkerChangeChannelTransport }) {
    this.transport = deps.transport;
    if (deps.transport.closed) {
      void this.forwardClosure(deps.transport.closed);
    }
    this.unlisten = deps.transport.listen('fileChanged', (data: unknown) => {
      this.#dispatch(data);
    });
  }

  /**
   * Subscribe to normalized `fileWritten` events for this project.
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onFileWritten(
    sub: WorkerChangeSubscription<{ type: 'fileWritten'; path: string; backend: FileSystemBackend }>,
  ): () => void {
    return this.#fileWritten.subscribe(
      {
        handler: sub.handler,
        interestedIn: sub.interestedIn === undefined ? undefined : (event) => sub.interestedIn!(event.path),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to normalized `fileDeleted` events for this project.
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onFileDeleted(
    sub: WorkerChangeSubscription<{ type: 'fileDeleted'; path: string; backend: FileSystemBackend }>,
  ): () => void {
    return this.#fileDeleted.subscribe(
      {
        handler: sub.handler,
        interestedIn: sub.interestedIn === undefined ? undefined : (event) => sub.interestedIn!(event.path),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to rename notifications with workspace-relative path edges.
   * @param sub - Handler plus optional path filter covering either edge.
   * @returns Unsubscribe function removing `sub`.
   */
  public onFileRenamed(sub: WorkerChangeSubscription<WorkerRelativeRenameEvent>): () => void {
    return this.#fileRenamed.subscribe(
      {
        handler: sub.handler,
        interestedIn:
          sub.interestedIn === undefined
            ? undefined
            : (event) =>
                (event.oldPath !== undefined && sub.interestedIn!(event.oldPath)) ||
                (event.newPath !== undefined && sub.interestedIn!(event.newPath)),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to directory mutation summaries coalesced by the worker.
   * @param sub - Handler plus optional prefix filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onDirectoryChanged(
    sub: WorkerChangeSubscription<{ type: 'directoryChanged'; path: string; backend: FileSystemBackend }>,
  ): () => void {
    return this.#directoryChanged.subscribe(
      {
        handler: sub.handler,
        interestedIn: sub.interestedIn === undefined ? undefined : (event) => sub.interestedIn!(event.path),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to directory creation events from `mkdir`.
   *
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onDirectoryCreated(sub: WorkerChangeSubscription<WorkerRelativeDirectoryCreateEvent>): () => void {
    return this.#directoryCreated.subscribe(
      {
        handler: sub.handler,
        interestedIn: sub.interestedIn === undefined ? undefined : (event) => sub.interestedIn!(event.path),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to directory deletion events from recursive `rmdir`.
   *
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onDirectoryDeleted(sub: WorkerChangeSubscription<WorkerRelativeDirectoryDeleteEvent>): () => void {
    return this.#directoryDeleted.subscribe(
      {
        handler: sub.handler,
        interestedIn: sub.interestedIn === undefined ? undefined : (event) => sub.interestedIn!(event.path),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to directory rename events. Distinct from {@link onFileRenamed}
   * because subtree-aware consumers must migrate every cached descendant.
   *
   * @param sub - Handler plus optional path filter covering either edge.
   * @returns Unsubscribe function removing `sub`.
   */
  public onDirectoryRenamed(sub: WorkerChangeSubscription<WorkerRelativeDirectoryRenameEvent>): () => void {
    return this.#directoryRenamed.subscribe(
      {
        handler: sub.handler,
        interestedIn:
          sub.interestedIn === undefined
            ? undefined
            : (event) =>
                (event.oldPath !== undefined && sub.interestedIn!(event.oldPath)) ||
                (event.newPath !== undefined && sub.interestedIn!(event.newPath)),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to file copy events.
   *
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onFileCopied(sub: WorkerChangeSubscription<WorkerRelativeFileCopyEvent>): () => void {
    return this.#fileCopied.subscribe(
      {
        handler: sub.handler,
        interestedIn:
          sub.interestedIn === undefined
            ? undefined
            : (event) =>
                (event.sourcePath !== undefined && sub.interestedIn!(event.sourcePath)) ||
                sub.interestedIn!(event.targetPath),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to directory copy events.
   *
   * @param sub - Handler plus optional path filter.
   * @returns Unsubscribe function removing `sub`.
   */
  public onDirectoryCopied(sub: WorkerChangeSubscription<WorkerRelativeDirectoryCopyEvent>): () => void {
    return this.#directoryCopied.subscribe(
      {
        handler: sub.handler,
        interestedIn:
          sub.interestedIn === undefined
            ? undefined
            : (event) =>
                (event.sourcePath !== undefined && sub.interestedIn!(event.sourcePath)) ||
                sub.interestedIn!(event.targetPath),
      },
      { signal: sub.signal },
    );
  }

  /**
   * Subscribe to one {@link ChangeSet} per delivery (charter D6): every fact
   * one changeset (or one bridge coalescing window) carried, with the
   * directories it touched, after the per-kind topics have heard each fact.
   *
   * @param handler - Receives each change set.
   * @param options - Optional AbortSignal lifecycle binding.
   * @returns Unsubscribe function removing `handler`.
   */
  public onChangeSet(handler: (set: ChangeSet) => void, options?: { signal?: AbortSignal }): () => void {
    return this.#changeSets.subscribe(handler, options);
  }

  /**
   * Subscribe to backend swap events (IndexedDB ↔ OPFS, etc.).
   * @param handler - Invoked whenever the worker reports a backend transition.
   * @param options - Optional AbortSignal lifecycle binding.
   * @returns Unsubscribe function removing `handler`.
   */
  public onBackendChanged(
    handler: (event: Extract<ChangeEvent, { type: 'backendChanged' }>) => void,
    options?: { signal?: AbortSignal },
  ): () => void {
    return this.#backendChanged.subscribe(handler, options);
  }

  /**
   * Detach the underlying `fileChanged` listener and drop subscriber lists.
   */
  /** Captured observation source lifetime. */
  public get closed(): Promise<void> {
    return this.closedSignal.promise;
  }

  public dispose(): void {
    this.closedSignal.resolve();
    this.unlisten();
    this.#fileWritten.dispose();
    this.#fileDeleted.dispose();
    this.#fileRenamed.dispose();
    this.#fileCopied.dispose();
    this.#directoryCreated.dispose();
    this.#directoryDeleted.dispose();
    this.#directoryRenamed.dispose();
    this.#directoryCopied.dispose();
    this.#directoryChanged.dispose();
    this.#backendChanged.dispose();
    this.#changeSets.dispose();
  }

  /**
   * Register a captured resource watch before its authoritative read.
   * @param request - Root-relative paths and matching scope.
   * @param handler - Exact changes, both rename edges, or explicit reset.
   * @returns Actual registration acknowledgement and closure.
   */
  public watchReady(request: WatchRequest, handler: (event: WatchEvent) => void): ObservationWatch {
    const { events } = this.transport;
    if (events !== undefined && !this.#eventsUnsupported) {
      const watch = this.#watchOnEvents(events, request, handler);
      return { ready: watch.ready, closed: watch.closed, dispose: watch.unsubscribe };
    }
    const watch = this.#authorityWatch(request, handler);
    if (watch !== undefined) {
      return { ready: watch.ready, closed: watch.closed, dispose: watch.unsubscribe };
    }
    /* Local Topic sources are registered synchronously; this fallback is not
     * used to acknowledge a remote watch registration. */
    const matches = (path: string): boolean =>
      request.paths.some(
        (root) =>
          path === '' ||
          path === root ||
          root.startsWith(`${path}/`) ||
          (request.recursive !== true && (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '') === root) ||
          (request.recursive === true && (root === '' || path.startsWith(`${root}/`))),
      );
    const unsubscriptions = [
      this.onFileWritten({
        interestedIn: matches,
        handler: ({ path }) => {
          handler({ type: 'change', path });
        },
      }),
      this.onFileDeleted({
        interestedIn: matches,
        handler: ({ path }) => {
          handler({ type: 'delete', path });
        },
      }),
      this.onFileCopied({
        handler: ({ targetPath }) => {
          if (matches(targetPath)) {
            handler({ type: 'change', path: targetPath });
          }
        },
      }),
      this.onFileRenamed({
        interestedIn: matches,
        handler: ({ oldPath, newPath }) => {
          if (oldPath !== undefined && newPath !== undefined) {
            handler({ type: 'rename', oldPath, newPath });
          } else if (oldPath !== undefined) {
            handler({ type: 'delete', path: oldPath });
          } else if (newPath !== undefined) {
            handler({ type: 'change', path: newPath });
          }
        },
      }),
      this.onDirectoryCreated({
        interestedIn: matches,
        handler: ({ path }) => {
          handler({ type: 'change', path });
        },
      }),
      this.onDirectoryDeleted({
        interestedIn: matches,
        handler: ({ path }) => {
          handler({ type: 'delete', path });
        },
      }),
      this.onDirectoryChanged({
        interestedIn: matches,
        handler: ({ path }) => {
          handler({ type: 'change', path });
        },
      }),
      this.onDirectoryCopied({
        handler: ({ targetPath }) => {
          if (matches(targetPath)) {
            handler({ type: 'change', path: targetPath });
          }
        },
      }),
      this.onDirectoryRenamed({
        interestedIn: matches,
        handler: () => {
          handler({ type: 'reset' });
        },
      }),
      this.onBackendChanged(() => {
        handler({ type: 'reset' });
      }),
    ];
    return {
      ready: Promise.resolve(),
      closed: this.closed,
      dispose: () => {
        for (const unsubscribe of unsubscriptions) {
          unsubscribe();
        }
      },
    };
  }

  private async forwardClosure(closed: Promise<void>): Promise<void> {
    try {
      await closed;
    } catch {
      /* A failed transport also closes this captured source. */
    }
    this.closedSignal.resolve();
  }

  /**
   * One watch on the connection's event channel: its events read off each
   * change set of the root. A connection that answers `ENOTSUP` gets the
   * registration of the older forms instead, and so do later watches.
   *
   * @param events - The connection's event channel.
   * @param request - The watch's paths and scope.
   * @param handler - Its events.
   * @returns The registration.
   */
  #watchOnEvents(
    events: NonNullable<WorkerChangeChannelTransport['events']>,
    request: WatchRequest,
    handler: (event: WatchEvent) => void,
  ): BridgeWatchHandle {
    /* Only the channel registration is handed to the diagnostic seam here: a
     * fallback comes from the transport's own forms, which hand themselves. */
    const initial = this.#observed(
      request,
      events((event) => {
        /* A lost connection may have dropped frames: the watch re-reads (D6). */
        if (event.kind === 'authority-lost') {
          handler({ type: 'reset' });
          return;
        }
        /* `compute-restarted` has no consumer here yet: a watch reads files,
         * and a compute restart changes none. */
        if (event.kind !== 'changeSet') {
          return;
        }
        for (const watchEvent of watchEventsOfChangeSetFor(event.set, request)) {
          handler(watchEvent);
        }
      }),
    );
    let current: BridgeWatchHandle = initial;
    let unsubscribed = false;
    const register = async (): Promise<void> => {
      try {
        await initial.ready;
      } catch (error) {
        const fallback = isUnsupported(error) && !unsubscribed ? this.#authorityWatch(request, handler) : undefined;
        if (fallback === undefined) {
          throw error;
        }
        /* The refused registration may still hold a subscriber on the channel. */
        initial.unsubscribe();
        this.#eventsUnsupported = true;
        current = fallback;
        await current.ready;
      }
    };
    const ready = register();
    const follow = async (): Promise<void> => {
      await ready;
      await current.closed;
    };
    const closed = follow();
    const observeClosed = async (): Promise<void> => {
      try {
        await closed;
      } catch {
        /* A caller observes a failure through `ready`; `closed` must not also surface it unobserved. */
      }
    };
    // async-iife: bootstrap
    void observeClosed();
    return {
      ready,
      closed,
      unsubscribe: () => {
        unsubscribed = true;
        current.unsubscribe();
      },
    };
  }

  /**
   * A registration on the authority in the older forms: change sets scoped by
   * the authority when it offers them, per-path events otherwise.
   *
   * @param request - The watch's paths and scope.
   * @param handler - Its events.
   * @returns The registration, or `undefined` for a transport with neither.
   */
  #authorityWatch(request: WatchRequest, handler: (event: WatchEvent) => void): BridgeWatchHandle | undefined {
    const { watchChangeSets, watchReady } = this.transport;
    if (watchChangeSets) {
      /* Only the older forms: this channel has already tried, or has no, event channel. */
      return watchByChangeSets({ watchChangeSets, watchReady }, request, handler);
    }
    return this.transport.watchReady?.(request, handler);
  }

  /**
   * Hand a registration to the transport's diagnostic seam, disposing it if the seam refuses it.
   *
   * @param request - The watch's paths and scope.
   * @param watch - The registration.
   * @returns The registration to use.
   */
  #observed(request: WatchRequest, watch: BridgeWatchHandle): BridgeWatchHandle {
    const { observeWatch } = this.transport;
    if (observeWatch === undefined) {
      return watch;
    }
    try {
      return observeWatch(request, watch);
    } catch (error) {
      watch.unsubscribe();
      throw error;
    }
  }

  #dispatch(data: unknown): void {
    if (!isChangeEvent(data)) {
      return;
    }
    const facts = data.type === 'changeSet' ? data.entries : [data];
    for (const fact of facts) {
      this.#dispatchFact(fact);
    }
    this.#deliveries += 1;
    if (this.#changeSets.size > 0) {
      const set = relativeChangeSet(facts, this.#deliveries);
      if (set !== undefined) {
        this.#changeSets.emit(set);
      }
    }
  }

  #dispatchFact(data: PathChangeEvent): void {
    switch (data.type) {
      case 'fileWritten': {
        this.#fileWritten.emit(data);
        return;
      }
      case 'fileDeleted': {
        this.#fileDeleted.emit(data);
        return;
      }
      case 'fileRenamed': {
        this.#fileRenamed.emit(data);
        return;
      }
      case 'fileCopied': {
        this.#fileCopied.emit(data);
        return;
      }
      case 'directoryCreated': {
        this.#directoryCreated.emit(data);
        return;
      }
      case 'directoryDeleted': {
        this.#directoryDeleted.emit(data);
        return;
      }
      case 'directoryRenamed': {
        this.#directoryRenamed.emit(data);
        return;
      }
      case 'directoryCopied': {
        this.#directoryCopied.emit(data);
        return;
      }
      case 'directoryChanged': {
        this.#directoryChanged.emit(data);
        return;
      }
      case 'backendChanged': {
        this.#backendChanged.emit(data);
      }
    }
  }
}
