import { Topic } from '@taucad/events';
import type { ChangeEvent, FileSystemBackend } from '@taucad/types';

/**
 * Transport surface required to wire worker push events (typically
 * `proxy.listen` from the file manager worker).
 *
 * @public
 */
export type WorkerChangeChannelTransport = {
  listen: (event: string, handler: (data: unknown) => void) => () => void;
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
 * subtree re-key, MonacoModelService model batch migrate) can react to
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

  public constructor(deps: { transport: WorkerChangeChannelTransport }) {
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
  public dispose(): void {
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
  }

  #dispatch(data: unknown): void {
    if (!isChangeEvent(data)) {
      return;
    }
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
