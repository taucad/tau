/**
 * A file manager's record connections, with no React (app state orchestration charter D6, D12; W6; plan § 4 A6c).
 *
 * One owner of rooted connections per file manager, keyed by its ref, so every reader of one file manager shares one
 * set: the provider's scope and, for a project session, the session's file-manager child, which owns the connections
 * and releases them when it stops. A replaced owner is released when its successor is installed, and the last one
 * when the file manager's owner (its lease, or its session child) ends.
 */
import type { FileSystemBridgeConnection, RootedBridgeConsumer } from '@taucad/fs-bridge';
import { createRootedContentClient } from '@taucad/fs-client/rooted-content-client';
import type { RootedContentOwner } from '@taucad/fs-client/rooted-content-client';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';

/** How a record connection is opened: the file manager's bridge opener, or the scope's fallback. @public */
export type RecordBridgeOpener = (root: string, consumer: RootedBridgeConsumer) => FileSystemBridgeConnection;

/** One file manager's record connections. @public */
export type RecordConnections = Readonly<{
  /** The owner for this opener: the current one, or a fresh one once a known opener was replaced. */
  ownerFor: (opener: RecordBridgeOpener | undefined) => RootedContentOwner<RootedBridgeConsumer>;
  /** Commit `owner` as the one in use, and release the one it replaced. */
  install: (owner: RootedContentOwner<RootedBridgeConsumer>) => void;
  /** Release the owner in use: the file manager's owner ended. */
  dispose: () => void;
}>;

function recordConnectionsForIncarnation(
  fallback: RecordBridgeOpener,
  ready: () => Promise<unknown>,
): RecordConnections {
  let owner: RootedContentOwner<RootedBridgeConsumer> | undefined;
  let previous: RecordBridgeOpener | undefined;
  let installed: RootedContentOwner<RootedBridgeConsumer> | undefined;
  const ownerFor = (opener: RecordBridgeOpener | undefined): RootedContentOwner<RootedBridgeConsumer> => {
    if (!owner || (previous !== undefined && opener !== previous)) {
      owner = createRootedContentClient({
        open: async (root, consumer: RootedBridgeConsumer) => {
          await ready();
          const { createFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
          const proxy = createFileSystemBridgeProxy((opener ?? fallback)(root, consumer));
          try {
            await proxy.ready;
          } catch (error) {
            // A failed handshake must not become this root's cached connection.
            proxy.dispose();
            throw error;
          }
          return {
            files: proxy,
            dispose: () => {
              proxy.dispose();
            },
          };
        },
      });
    }
    previous = opener;
    return owner;
  };
  return {
    ownerFor,
    install: (current) => {
      if (installed !== undefined && installed !== current) {
        installed.dispose();
      }
      installed = current;
    },
    dispose: () => {
      installed?.dispose();
      installed = undefined;
    },
  };
}

/*
 * One record-connection owner per file manager (charter D6, D12, W6). It outlives a remount of its scope, as the file
 * manager does, so a remount never opens a second set; a replaced owner is released when its successor is installed,
 * and the last one when the file manager's owner ends. This replaces the mount count and its microtask dispose.
 */
const recordConnections = new WeakMap<FileManagerRef, RecordConnections>();

/**
 * The record connections of one file manager, built by the first reader.
 *
 * @param fileManagerRef - The file manager.
 * @param fallback - The opener used while the file manager has published none.
 * @param ready - Waits for the file manager's services before a connection opens.
 * @returns The file manager's one set of record connections.
 * @public
 */
export function recordConnectionsOf(
  fileManagerRef: FileManagerRef,
  fallback: RecordBridgeOpener,
  ready: () => Promise<unknown>,
): RecordConnections {
  const known = recordConnections.get(fileManagerRef);
  if (known !== undefined) {
    return known;
  }
  const connections = recordConnectionsForIncarnation(fallback, ready);
  recordConnections.set(fileManagerRef, connections);
  return connections;
}
