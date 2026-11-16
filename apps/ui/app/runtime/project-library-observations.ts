/**
 * The library's two filesystem observations, as the discovery machine's callback children (app state orchestration
 * charter D4, D18; plan § 4 A3b; inventory L1, L2).
 *
 * `ProjectManagerProvider` ran both in one effect until A3b: the manifest watch, which moves the discovery epoch and
 * refetches the listing, and the chat-metadata watch, which refetches the chat queries a project's `.tau/chats` rows
 * feed. Each is now a callback actor `libraryDiscovery` invokes. It holds its watches, leases and subscriptions in its
 * closure (D4), reports to the machine with `invalidated` and `observationChanged`, and takes `refreshObservations`.
 * The watches run over the root file facade the app runtime builds and the library follows (A4b; the D15 binding is
 * gone), so each child rebuilds them when the facade it reads changes, as the effect re-ran.
 *
 * `createMetadataReadOwner` moved here unchanged: the chat-record reads wait on the metadata observation's
 * registration, so the two are built together.
 *
 * @module
 */
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { QueryClient } from '@tanstack/react-query';
import { createCallbackLogic } from 'xstate';
import type { WatchEvent } from '@taucad/filesystem';
import type { ChatStorage } from '#types/storage.types.js';
import type { LibraryDiscoveryEvent } from '#machines/library-discovery.machine.js';
import type { ProjectLibraryFileManager, ProjectListing } from '#runtime/project-library-storage.js';

/*
 * Discovery and chat membership watch only their kinds (charter D18): the
 * manifest kind is a configured root's non-dot top-level directories, every
 * `tau.json` outside a dot directory and every `.tau/project.json` (a peer
 * tab's identity change); the chat-metadata kind is a project's
 * directory, its `.tau/chats` rows and their `chat.json`. The authority filters
 * by these globs before delivery, so an agent turn's or a chat log's writes
 * never reach either watch: the two app-lifetime watches of every path under
 * `''` are gone.
 */
/** The manifest-kind watch: what can change the discovered project list. @public */
export const manifestWatchRequest = {
  paths: [''],
  recursive: true,
  includes: ['*', '**/tau.json', '**/.tau/project.json'],
  /* The registry applies excludes first, so they name only what the includes must not admit: a top-level dot
   * entry and a `tau.json` under any dot directory. `.tau/project.json` stays admitted. */
  excludes: ['.*', '**/.*/**/tau.json'],
};
/** The chat-metadata-kind watch: what can change a project's chat membership. @public */
export const chatMetadataWatchRequest = {
  paths: [''],
  recursive: true,
  includes: [
    '*',
    'projects/*',
    'projects/*/.tau',
    'projects/*/.tau/chats',
    'projects/*/.tau/chats/*',
    'projects/*/.tau/chats/*/chat.json',
  ],
};

/** Admits the chat-record reads the metadata observation fences, and settles the ones it holds. */
export type MetadataReadOwner = Readonly<{
  /** The observation's per-project watches serve project-scoped reads; the returned call disconnects them. */
  connect: (project: (id: string) => ObservationService<void>) => () => void;
  /** Hold reads until the observation is ready again. */
  hold: () => void;
  ready: () => void;
  fail: (error: Error) => void;
  read: <Value>(operation: (source: ChatStorage) => Promise<Value>, projectId?: string) => Promise<Value>;
  /** Settles once the reads in flight (for one project, or all) have. */
  settle: (projectId?: string) => Promise<void>;
}>;

/** Retain actual owner I/O, whose lifetime Query cancellation cannot shorten. */
export function createMetadataReadOwner(source: ChatStorage): MetadataReadOwner {
  const pending = new Map<Promise<unknown>, string | undefined>();
  let registration = Promise.withResolvers<Error | undefined>();
  let connection = Promise.withResolvers<{
    readonly signal: AbortSignal;
    project(id: string): ObservationService<void>;
  }>();
  return {
    connect(project: (id: string) => ObservationService<void>): () => void {
      const abort = new AbortController();
      connection.resolve({ project, signal: abort.signal });
      return () => {
        abort.abort(new Error('Chat observation was disposed.'));
        connection = Promise.withResolvers();
      };
    },
    hold(): void {
      const previous = registration;
      registration = Promise.withResolvers<Error | undefined>();
      // A retired admission wakes its readers so they can follow the current registration.
      previous.resolve(undefined);
    },
    ready(): void {
      registration.resolve(undefined);
    },
    fail(error: Error): void {
      const previous = registration;
      registration = Promise.withResolvers<Error | undefined>();
      previous.resolve(undefined);
      registration.resolve(error);
    },
    async read<Value>(operation: (source: ChatStorage) => Promise<Value>, projectId?: string): Promise<Value> {
      const owner = await connection.promise;
      owner.signal.throwIfAborted();
      const observation = projectId === undefined ? undefined : owner.project(projectId);
      const lease = observation?.acquire();
      try {
        if (lease) {
          await new Promise<void>((resolve, reject) => {
            let unsubscribe = (): void => undefined;
            const cleanup = (): void => {
              unsubscribe();
              owner.signal.removeEventListener('abort', aborted);
            };
            const aborted = (): void => {
              cleanup();
              reject(
                owner.signal.reason instanceof Error
                  ? owner.signal.reason
                  : new Error('Chat observation was disposed.'),
              );
            };
            const check = (): void => {
              const snapshot = lease.getSnapshot();
              // Pending starts only after watch.ready; a query refetch must not wait for its own invalidation to finish.
              if (snapshot.status === 'ready' || snapshot.status === 'pending') {
                cleanup();
                resolve();
              } else if (snapshot.status === 'error' || snapshot.status === 'closed') {
                cleanup();
                reject(new Error(snapshot.error ?? 'Chat updates unavailable.'));
              }
            };
            unsubscribe = lease.subscribe(check);
            owner.signal.addEventListener('abort', aborted, { once: true });
            check();
          });
        } else {
          let admitted: typeof registration;
          do {
            admitted = registration;
            // oxlint-disable-next-line eslint/no-await-in-loop -- Follow the current registration after replacement.
            const error = await admitted.promise;
            if (admitted === registration && error) {
              throw error;
            }
          } while (admitted !== registration);
        }
        owner.signal.throwIfAborted();
        const promise = operation(source);
        pending.set(promise, projectId);
        try {
          const value = await promise;
          owner.signal.throwIfAborted();
          return value;
        } finally {
          pending.delete(promise);
        }
      } finally {
        lease?.release();
      }
    },
    async settle(projectId?: string): Promise<void> {
      const relevant = (): Array<Promise<unknown>> => {
        const reads: Array<Promise<unknown>> = [];
        for (const [promise, id] of pending) {
          if (projectId === undefined || id === projectId) {
            reads.push(promise);
          }
        }
        return reads;
      };
      let reads = relevant();
      while (reads.length > 0) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Include reads admitted while a prior non-abortable owner read is settling.
        await Promise.allSettled(reads);
        reads = relevant();
      }
    },
  };
}

/** The chat store over the facade's record client, and the read owner its metadata reads wait on. */
export type LibraryRecords = Readonly<{ chatStore: ChatStorage; readOwner: MetadataReadOwner }>;

/** What the observations read from the library that runs them; host objects, held in their closures only (D4). */
export type LibraryObservationHost = Readonly<{
  queryClient: QueryClient;
  /** The root file facade's current value, once the library follows it. */
  fileManager: () => ProjectLibraryFileManager | undefined;
  /** The records over the facade's record client, if any. */
  records: () => LibraryRecords | undefined;
  /** Called after the facade or its records changed. */
  subscribeBinding: (listener: () => void) => () => void;
  /** Called when the library asks the manifest watch to invalidate (a root moved under the listing). */
  subscribeInvalidate: (listener: () => void) => () => void;
  /** Settles once no discovery pass is in flight: a refetch never overtakes the pass it would join. */
  passSettled: () => Promise<void>;
  /** One project's chat-metadata health; `undefined` is healthy. */
  publishMetadataHealth: (projectId: string, error: string | undefined) => void;
  /** Every project's chat-metadata health is unknown again: the watches were rebuilt. */
  clearMetadataHealth: () => void;
}>;

/** Rebuild a watch whenever the facade parts it reads change; dispose it when the actor stops. */
const rebuilding = <Key extends readonly unknown[]>(
  host: LibraryObservationHost,
  keyOf: () => Key | undefined,
  build: (key: Key) => () => void,
): (() => void) => {
  let key: Key | undefined;
  let dispose: (() => void) | undefined;
  const sync = (): void => {
    const next = keyOf();
    if (next !== undefined && key !== undefined && next.every((part, index) => part === key![index])) {
      return;
    }
    dispose?.();
    dispose = undefined;
    key = next;
    if (next !== undefined) {
      dispose = build(next);
    }
  };
  const unsubscribe = host.subscribeBinding(sync);
  sync();
  return () => {
    unsubscribe();
    dispose?.();
    dispose = undefined;
  };
};

/**
 * The manifest watch (row L1): a configured root's manifests changed, so the listing is no longer current. It moves the
 * epoch at once (`invalidated`) and cancels the listing query, then refetches it once no pass is in flight.
 *
 * @param host - The library's facade, query client and pass.
 * @returns The callback logic `libraryDiscovery` invokes as `discoveryObservation`.
 */
/** A filesystem observation `libraryDiscovery` invokes as a child. */
export type LibraryObservationLogic = ReturnType<typeof createCallbackLogic<LibraryDiscoveryEvent>>;

export const createDiscoveryObservation = (host: LibraryObservationHost): LibraryObservationLogic =>
  createCallbackLogic<LibraryDiscoveryEvent>(({ sendBack, receive }) => {
    const { queryClient } = host;
    let current: ObservationService<void> | undefined;
    receive((event) => {
      if (event.type === 'refreshObservations' && event.resourceId === undefined) {
        current?.refresh();
      }
    });
    const unsubscribeInvalidate = host.subscribeInvalidate(() => {
      current?.invalidate();
    });
    const dispose = rebuilding(
      host,
      () => {
        const channel = host.fileManager()?.workerChangeChannel;
        return channel === undefined ? undefined : ([channel] as const);
      },
      ([channel]) => {
        const isManifestPath = (path: string): boolean => {
          const segments = path.split('/').filter(Boolean);
          if (segments.length === 0) {
            return true;
          }
          if (path.endsWith('/.tau/project.json') || path === '.tau/project.json') {
            return true;
          }
          if (segments.some((segment) => segment.startsWith('.'))) {
            return false;
          }
          return segments.length === 1 || segments.at(-1) === 'tau.json';
        };
        let discoveryDirty = false;
        const discovery = new ObservationService<void>({
          resource: 'workspace/project-discovery',
          refresh: () => {
            discoveryDirty = true;
          },
          watch: (invalidate, reset) =>
            channel.watchReady(manifestWatchRequest, (event) => {
              if (event.type === 'reset') {
                reset();
                return;
              }
              const paths = event.type === 'rename' ? [event.oldPath, event.newPath] : [event.path];
              if (paths.some((path) => isManifestPath(path))) {
                invalidate();
              }
            }),
          invalidate: () => {
            discoveryDirty = true;
            sendBack({ type: 'invalidated' });
            void queryClient.cancelQueries({ queryKey: ['projects'] });
          },
          read: async ({ isCurrent }) => {
            if (!isCurrent() || !discoveryDirty) {
              return;
            }
            discoveryDirty = false;
            await host.passSettled();
            if (isCurrent()) {
              await queryClient.invalidateQueries({ queryKey: ['projects'] }, { cancelRefetch: false });
            }
          },
        });
        current = discovery;
        const updateHealth = (): void => {
          const snapshot = discovery.getSnapshot();
          if (snapshot.status === 'ready') {
            sendBack({ type: 'observationChanged', observation: 'discovery' });
          } else if (snapshot.status === 'error' || snapshot.status === 'closed') {
            sendBack({
              type: 'observationChanged',
              observation: 'discovery',
              ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
            });
          }
        };
        const unsubscribe = discovery.subscribe(updateHealth);
        const lease = discovery.acquire();
        updateHealth();
        return () => {
          unsubscribe();
          if (current === discovery) {
            current = undefined;
          }
          lease.release();
        };
      },
    );
    return () => {
      unsubscribeInvalidate();
      dispose();
    };
  });

/**
 * The chat-metadata watch (rows L1, L2): which projects hold which chats, and each project's `.tau/chats` rows. It
 * cancels and refetches the chat queries those rows feed, and admits the record reads that wait on it.
 *
 * @param host - The library's facade, records and query client.
 * @returns The callback logic `libraryDiscovery` invokes as `metadataObservation`.
 */
export const createMetadataObservation = (host: LibraryObservationHost): LibraryObservationLogic =>
  createCallbackLogic<LibraryDiscoveryEvent>(({ sendBack, receive }) => {
    const { queryClient } = host;
    let refreshProject: ((resourceId: string) => void) | undefined;
    let refreshAll: (() => void) | undefined;
    receive((event) => {
      if (event.type !== 'refreshObservations') {
        return;
      }
      if (event.resourceId === undefined) {
        refreshAll?.();
      } else {
        refreshProject?.(event.resourceId);
      }
    });
    return rebuilding(
      host,
      () => {
        const fileManager = host.fileManager();
        const records = host.records();
        const channel = fileManager?.workerChangeChannel;
        return fileManager === undefined || records === undefined || channel === undefined
          ? undefined
          : ([channel, fileManager.watchRecordFile, records] as const);
      },
      ([channel, watchRecordFile, { readOwner }]) => {
        const resources = new Map<string, Set<string>>();
        const projectMetadata = new Map<string, ObservationService<void>>();
        const refreshProjectMetadata = (resourceId: string): void => {
          projectMetadata.get(resourceId)?.refresh();
        };
        refreshProject = refreshProjectMetadata;
        const projectSource = (id: string): ObservationService<void> => {
          let source = projectMetadata.get(id);
          if (!source) {
            let unsubscribeHealth = (): void => undefined;
            source = new ObservationService<void>({
              resource: `/projects/${id}/.tau/chats`,
              watch: (invalidate, reset) => {
                const watch = watchRecordFile(
                  `/projects/${id}/.tau/chats`,
                  (event) => {
                    if (projectMetadata.get(id) !== source || source?.activeLeaseCount === 0) {
                      return;
                    }
                    if (event.type === 'reset') {
                      resources.set(id, new Set());
                      reset();
                      return;
                    }
                    const paths = event.type === 'rename' ? [event.oldPath, event.newPath] : [event.path];
                    const chats = resources.get(id) ?? new Set<string>();
                    let changed = false;
                    for (const path of paths) {
                      const segments = path.split('/');
                      if (
                        segments[0] === '.tau' &&
                        segments[1] === 'chats' &&
                        (segments.length <= 3 || (segments.length === 4 && segments[3] === 'chat.json'))
                      ) {
                        if (segments[2]) {
                          chats.add(segments[2]);
                        }
                        changed = true;
                      }
                    }
                    if (changed) {
                      resources.set(id, chats);
                      invalidate();
                    }
                  },
                  { recursive: true },
                );
                return {
                  ready: watch.ready,
                  closed: watch.closed,
                  dispose: () => {
                    watch.dispose();
                    if (source?.activeLeaseCount === 0) {
                      unsubscribeHealth();
                      if (projectMetadata.get(id) === source) {
                        projectMetadata.delete(id);
                        host.publishMetadataHealth(id, undefined);
                      }
                    }
                  },
                };
              },
              refresh: () => {
                if (source?.getSnapshot().status !== 'registering') {
                  resources.set(id, new Set());
                }
              },
              invalidate: () => {
                if (
                  source?.activeLeaseCount === 0 ||
                  (!resources.has(id) && source?.getSnapshot().status === 'registering')
                ) {
                  return;
                }
                void queryClient.cancelQueries({ queryKey: ['all-chats'] });
                void queryClient.cancelQueries({ queryKey: ['chats', id] });
                for (const chatId of resources.get(id) ?? []) {
                  void queryClient.cancelQueries({ queryKey: ['chat', chatId] });
                }
              },
              read: async ({ isCurrent }) => {
                const chats = resources.get(id);
                if (!chats) {
                  return;
                }
                await readOwner.settle(id);
                if (!isCurrent()) {
                  return;
                }
                resources.delete(id);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ['chats', id] }, { cancelRefetch: false }),
                  ...[...chats].map(async (chatId) =>
                    queryClient.invalidateQueries({ queryKey: ['chat', chatId] }, { cancelRefetch: false }),
                  ),
                ]);
                await readOwner.settle(id);
              },
            });
            projectMetadata.set(id, source);
            unsubscribeHealth = source.subscribe(() => {
              if (!source || projectMetadata.get(id) !== source) {
                return;
              }
              const snapshot = source.getSnapshot();
              if (snapshot.status === 'ready') {
                host.publishMetadataHealth(id, undefined);
              } else if (snapshot.status === 'error' || snapshot.status === 'closed') {
                host.publishMetadataHealth(id, snapshot.error ?? 'Chat updates unavailable.');
              }
            });
          }
          return source;
        };
        const disconnect = readOwner.connect(projectSource);
        let membership = false;
        const metadata = new ObservationService<void>({
          resource: 'workspace/chat-metadata',
          refresh: () => {
            membership = true;
          },
          watch: (invalidate, reset) => {
            const onEvent = (event: WatchEvent): void => {
              if (event.type === 'reset') {
                membership = true;
                reset();
                return;
              }
              const paths = event.type === 'rename' ? [event.oldPath, event.newPath] : [event.path];
              let changed = false;
              for (const path of paths) {
                const segments = path.split('/').filter(Boolean);
                if (segments.length <= 1) {
                  membership = true;
                  changed = true;
                  continue;
                }
                if (segments[0] !== 'projects') {
                  continue;
                }
                const projectId = segments[1]!;
                if (segments.length === 2 || (segments[2] === '.tau' && segments.length === 3)) {
                  membership = true;
                  changed = true;
                } else if (
                  segments[2] === '.tau' &&
                  segments[3] === 'chats' &&
                  (segments.length <= 5 || (segments[5] === 'chat.json' && segments.length === 6))
                ) {
                  const chats = resources.get(projectId) ?? new Set<string>();
                  if (segments[4]) {
                    chats.add(segments[4]);
                  }
                  resources.set(projectId, chats);
                  changed = true;
                }
              }
              if (changed) {
                for (const id of resources.keys()) {
                  projectMetadata.get(id)?.invalidate();
                }
                invalidate();
              }
            };
            const home = channel.watchReady(chatMetadataWatchRequest, onEvent);
            let listing = queryClient.getQueryData<ProjectListing>(['projects']);
            const synchronize = (): void => {
              const next = queryClient.getQueryData<ProjectListing>(['projects']);
              if (next === listing) {
                return;
              }
              listing = next;
              membership = true;
              invalidate();
            };
            const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
              if (event.query.queryKey.length === 1 && event.query.queryKey[0] === 'projects') {
                synchronize();
              }
            });
            return {
              ready: home.ready,
              closed: home.closed,
              dispose: () => {
                unsubscribe();
                home.dispose();
              },
            };
          },
          invalidate: () => {
            readOwner.hold();
            void queryClient.cancelQueries({ queryKey: ['all-chats'] });
            if (membership) {
              void queryClient.cancelQueries({ queryKey: ['chats'] });
              void queryClient.cancelQueries({ queryKey: ['chat'] });
            } else {
              for (const [resourceId, chatIds] of resources) {
                void queryClient.cancelQueries({ queryKey: ['chats', resourceId] });
                for (const chatId of chatIds) {
                  void queryClient.cancelQueries({ queryKey: ['chat', chatId] });
                }
              }
            }
          },
          read: async (read) => {
            const { isCurrent } = read;
            const listing = queryClient.getQueryData<ProjectListing>(['projects']);
            const ids = new Set(listing ? listing.projects.map(({ projectId }) => projectId) : resources.keys());
            for (const id of resources.keys()) {
              if (!ids.has(id)) {
                resources.delete(id);
              }
            }
            for (const [id, source] of projectMetadata) {
              if (!ids.has(id) && source.activeLeaseCount === 0) {
                projectMetadata.delete(id);
              }
            }
            const changed = membership || resources.size > 0;
            const results = await Promise.allSettled([...ids].map(async (id) => read.observe(projectSource(id))));
            if (!isCurrent()) {
              return;
            }
            const failure = results.find((result) => result.status === 'rejected');
            if (failure?.status === 'rejected') {
              readOwner.fail(new Error(String(failure.reason)));
            } else {
              readOwner.ready();
            }
            if (!changed) {
              return;
            }
            await readOwner.settle();
            if (!isCurrent()) {
              return;
            }
            const pending: Array<Promise<void>> = [];
            if (membership) {
              membership = false;
              pending.push(queryClient.invalidateQueries({ queryKey: ['chats'] }, { cancelRefetch: false }));
              pending.push(queryClient.invalidateQueries({ queryKey: ['chat'] }, { cancelRefetch: false }));
            }
            pending.push(queryClient.invalidateQueries({ queryKey: ['all-chats'] }, { cancelRefetch: false }));
            await Promise.all(pending);
            await readOwner.settle();
          },
        });
        refreshAll = () => {
          metadata.refresh();
        };
        const updateHealth = (): void => {
          const snapshot = metadata.getSnapshot();
          if (snapshot.status === 'ready') {
            sendBack({ type: 'observationChanged', observation: 'metadata' });
          } else if (snapshot.status === 'error' || snapshot.status === 'closed') {
            readOwner.fail(new Error(snapshot.error ?? 'Chat updates unavailable.'));
            sendBack({
              type: 'observationChanged',
              observation: 'metadata',
              ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
            });
          }
        };
        const unsubscribe = metadata.subscribe(updateHealth);
        readOwner.hold();
        const lease = metadata.acquire();
        updateHealth();
        return () => {
          unsubscribe();
          if (refreshProject === refreshProjectMetadata) {
            refreshProject = undefined;
          }
          refreshAll = undefined;
          lease.release();
          disconnect();
          projectMetadata.clear();
          host.clearMetadataHealth();
          readOwner.fail(new Error('Chat observation was disposed.'));
        };
      },
    );
  });
