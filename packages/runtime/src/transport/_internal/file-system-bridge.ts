/**
 * Resolve a consumer-supplied {@link RuntimeFileSystem} into a
 * `MessagePortLike` suitable for the dispatcher's filesystem bridge. A
 * transport that posts the handle across a real structured-clone boundary
 * must still supply a genuinely transferable `MessagePort`; in-process and
 * `node:worker_threads` hosts may supply any structural port.
 *
 * - `kind: 'inline'`  → wrap in a fresh `BridgePort` so the worker can
 *                       consume it via the same proxy plumbing.
 * - `kind: 'channel'` → open a fresh remote connection for this binding.
 *
 * Returns `undefined` when no filesystem was supplied (`fileSystem ===
 * undefined`); transports degrade to whatever default FS the worker
 * brings up internally.
 *
 * @internal
 */

import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import type { WorkerFileSystemProxy } from '#transport/_internal/worker-filesystem-proxy.js';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgePort } from '@taucad/fs-bridge';

/**
 * Resolved filesystem bridge materialized for one runtime initialize call.
 *
 * @internal
 */
export type ResolvedFileSystemBridge = {
  readonly port: FileSystemBridgePort;
  readonly kind: 'inline' | 'channel';
  readonly dispose: () => void;
};

export const buildFileSystemBridge = (fs: RuntimeFileSystem | undefined): ResolvedFileSystemBridge | undefined => {
  if (!fs) {
    return undefined;
  }
  const handle = resolveRuntimeFileSystem(fs);
  if (handle.kind === 'inline') {
    /* Mint a fresh `RuntimeFileSystemBase` per bridge build. Each
     * `web-worker-client` / `node-worker-client` materialise() invocation
     * calls this once, so each `RuntimeClient` owns an isolated inline
     * filesystem instance — no shared mutable state across clients
     * built from the same `inProcessTransport({ runtime, fileSystem })` plugin. */
    const fileSystem = handle.create();
    const { watchReady } = fileSystem as Partial<WorkerFileSystemProxy>;
    // eslint-disable-next-line tau-lint/no-handrolled-fanout -- Tracks disposal of pending watch admissions, not event subscribers.
    const pendingWatches = new Set<() => void>();
    let disposed = false;
    const bridge = createFileSystemBridgePort(
      watchReady === undefined || fileSystem.watch === undefined
        ? fileSystem
        : {
            ...fileSystem,
            watch: async (request, handler) => {
              const registration = watchReady.call(fileSystem, request, handler);
              const unsubscribe = (): void => {
                pendingWatches.delete(unsubscribe);
                registration.unsubscribe();
              };
              pendingWatches.add(unsubscribe);
              try {
                await registration.ready;
                if (disposed) {
                  throw new Error('Filesystem bridge closed before watch admission.');
                }
                return unsubscribe;
              } catch (error) {
                unsubscribe();
                throw error;
              }
            },
          },
    );
    return {
      port: bridge.port,
      kind: 'inline',
      dispose: () => {
        disposed = true;
        for (const unsubscribe of pendingWatches) {
          unsubscribe();
        }
        bridge.dispose();
      },
    };
  }
  const connection = handle.create();
  return {
    port: connection.port,
    kind: 'channel',
    dispose: () => {
      connection.dispose();
    },
  };
};
