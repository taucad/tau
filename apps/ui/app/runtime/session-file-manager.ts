/**
 * A project session's file manager, with no React (app state orchestration charter D4, D6, I5, I23; plan § 4 A6c;
 * rows S17 to S19).
 *
 * The session's `fileManager` child opens one of these once `rootFiles` holds the shared worker, closes it and opens a
 * fresh one when that worker is lost or replaced, and closes the last one when the child stops. It
 * builds the file manager through the file-manager host for `/projects/<id>`, starts it, and owns what a lease owned
 * before A6c: the actor, the host's release of its resources, the record connections and a signal that a wait on the
 * file manager listens to. The session subtree's provider is a view of it ({@link sessionFileManagerOf}); it creates,
 * starts and stops nothing.
 *
 * It also feeds A6a's observable `parameterFiles` port from the session child (ruling R-b): the working-copy client of
 * the file manager's record connections, replaced, and announced, when the file manager publishes a new bridge opener
 * (a new worker). A6b fed it from the provider's scope; the provider now reads this one.
 *
 * Every object here is a host object, so it lives in the child's closure and in a map keyed by the file manager's ref,
 * never in a machine's context (D4).
 */
import type { RootedContentClient } from '@taucad/fs-client/rooted-content-client';
import { Topic } from '@taucad/events';
import { FileManagerNotReadyError } from '@taucad/ui-core/filesystem/workspace-errors';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { FileManagerActor, FileManagerSpec } from '#runtime/file-manager-host.js';
import { recordConnectionsOf } from '#runtime/file-manager-record-connections.js';
import type { RecordBridgeOpener } from '#runtime/file-manager-record-connections.js';

type FileManagerSnapshot = ReturnType<FileManagerRef['getSnapshot']>;

/** A value that can change: the current value, and a listener called after each change. @public */
export type SessionFilesPort<T> = Readonly<{
  get: () => T;
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * What a file manager's provider reads from the owner of its actor: a lease (D6), or a session's file-manager child.
 *
 * @public
 */
export type FileManagerOwner = Readonly<{
  /** Run `dispose` when the owner ends. Attaching the same function twice runs it once. */
  attach: (dispose: () => void) => void;
  /** Aborted when the owner ends: a wait on the file manager listens to it. */
  dropped: AbortSignal;
  /**
   * The owner's working-copy client, when the owner holds the record connections itself. A session child does; a
   * lease leaves them to the provider's scope.
   */
  workingCopyFiles?: SessionFilesPort<RootedContentClient>;
}>;

/** A session's file manager, open. @public */
export type SessionFileManager = Readonly<{
  /** This opening's identity, for a provider that keys its scope by it. */
  key: string;
  /** The file manager, started. */
  fileManagerRef: FileManagerRef;
  owner: FileManagerOwner & { workingCopyFiles: SessionFilesPort<RootedContentClient> };
  /** Stop the file manager and release everything it holds. Calling it twice closes once. */
  close: () => void;
}>;

/** What a session file manager is built with: the host's builder and the wait on the runtime's clock. @public */
export type SessionFileManagerPorts = Readonly<{
  /** Build the unstarted file manager for `spec` through the file-manager host. */
  build: (spec: FileManagerSpec) => Readonly<{ actor: FileManagerActor; dispose: () => void }>;
  /** Wait for the file manager's content and tree services, up to the ready bound; ends when `gone` aborts. */
  awaitServices: (fileManagerRef: FileManagerRef, gone: AbortSignal) => Promise<FileManagerSnapshot>;
}>;

/* Each session file manager a session's child holds, by its ref: the provider over the child reads its owner here. */
const openFileManagers = new WeakMap<FileManagerRef, SessionFileManager>();
let openings = 0;

/**
 * The file manager a session's project is rooted at: Home's engine, which the host resolves once (row S37).
 *
 * @param projectId - The session's project.
 * @returns The spec the session child builds.
 * @public
 */
export const sessionFileManagerSpec = (projectId: string): FileManagerSpec => ({
  backend: 'home',
  rootDirectory: `/projects/${projectId}`,
  projectId,
});

const releaseFailed = (projectId: string, error: unknown): void => {
  console.error(`[sessions] releasing project ${projectId}'s file manager failed`, error);
};

/**
 * Open a project session's file manager: build it through the host, start it, and own its connections.
 *
 * @param projectId - The session's project.
 * @param ports - The host's builder and the services wait.
 * @returns The open file manager, and its close.
 * @public
 */
export function openSessionFileManager(projectId: string, ports: SessionFileManagerPorts): SessionFileManager {
  const built = ports.build(sessionFileManagerSpec(projectId));
  const fileManagerRef: FileManagerRef = built.actor;
  const drop = new AbortController();
  /* What the scope attached to the owner: each is released once, as the file manager closes, and one failing release
   * does not keep the rest from releasing what they hold. */
  const attached = new WeakSet<() => void>();
  const releases = new Topic<void>({
    name: `sessions.${projectId}.fileManager.releases`,
    onError: (error) => {
      releaseFailed(projectId, error);
    },
  });

  /* The scope's fallback, without React: read the opener when a connection opens, after the services wait. */
  const fallback: RecordBridgeOpener = (root, consumer) => {
    const opener = fileManagerRef.getSnapshot().context.openFileSystemBridge;
    if (!opener) {
      throw new FileManagerNotReadyError('proxy-timeout', {
        cause: new Error('File Manager filesystem bridge is not ready.'),
      });
    }
    return opener(root, consumer);
  };
  /* As the scope's `whenServicesReady`: services already bound serve at once; otherwise a wait that settles on a file
   * manager in `error`, or without its services, refuses, so a record read fails fast rather than opening a bridge the
   * file manager has given up on. */
  const connections = recordConnectionsOf(fileManagerRef, fallback, async () => {
    /* Services already bound serve, even in `error`: a failed workspace reload keeps them and the bridge alive. */
    const bound = fileManagerRef.getSnapshot().context;
    if (bound.contentService && bound.treeService) {
      return;
    }
    const settled = await ports.awaitServices(fileManagerRef, drop.signal);
    if (settled.matches('error')) {
      throw new FileManagerNotReadyError('machine-error', { cause: settled.context.error });
    }
    if (!settled.context.contentService || !settled.context.treeService) {
      throw new FileManagerNotReadyError('services-timeout');
    }
  });

  let current = connections.ownerFor(fileManagerRef.getSnapshot().context.openFileSystemBridge);
  connections.install(current);
  const changes = new Topic<void>({ name: `sessions.${projectId}.fileManager.workingCopyFiles` });
  const workingCopyFiles: SessionFilesPort<RootedContentClient> = {
    get: () => current.files('working-copy'),
    subscribe: (listener) => changes.subscribe(listener),
  };

  /* A new worker publishes a new opener: the replacement owner is installed, which releases the replaced one, and
   * every reader of the port hears it (the runtime's parameter service among them, through the provider). */
  const subscription = fileManagerRef.subscribe((snapshot) => {
    const next = connections.ownerFor(snapshot.context.openFileSystemBridge);
    if (next === current) {
      return;
    }
    current = next;
    connections.install(next);
    changes.emit(undefined);
  });
  built.actor.start();

  let closed = false;
  openings += 1;
  const opened: SessionFileManager = {
    key: `${projectId}:${openings}`,
    fileManagerRef,
    owner: {
      attach: (dispose) => {
        if (closed) {
          dispose();
          return;
        }
        if (attached.has(dispose)) {
          return;
        }
        attached.add(dispose);
        releases.subscribe(dispose);
      },
      dropped: drop.signal,
      workingCopyFiles,
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      changes.dispose();
      /* As a dropped lease: stop the actor, end the waits, release what its context holds, then what was attached. */
      built.actor.stop();
      drop.abort();
      for (const release of [built.dispose, connections.dispose]) {
        try {
          release();
        } catch (error) {
          releaseFailed(projectId, error);
        }
      }
      releases.emit(undefined);
      releases.dispose();
    },
  };
  return opened;
}

/**
 * Record a session file manager under its ref for the provider over the session child, whichever opener built it.
 *
 * @param opened - The file manager a session's child opened.
 * @returns The removal, which the child runs before it closes the file manager.
 * @public
 */
export const trackSessionFileManager = (opened: SessionFileManager): (() => void) => {
  openFileManagers.set(opened.fileManagerRef, opened);
  return () => {
    if (openFileManagers.get(opened.fileManagerRef) === opened) {
      openFileManagers.delete(opened.fileManagerRef);
    }
  };
};

/**
 * The open session file manager behind a ref, for the provider over the session child.
 *
 * @param fileManagerRef - A file manager a session child opened.
 * @returns It, or `undefined` for a file manager no session opened.
 * @public
 */
export const sessionFileManagerOf = (fileManagerRef: FileManagerRef): SessionFileManager | undefined =>
  openFileManagers.get(fileManagerRef);
