/**
 * Electron utility-process filesystem bridge over an emitter-shaped port.
 *
 * This module imports no `electron` runtime value, so a services utility can
 * serve a main-minted `MessagePortMain` without loading main-process APIs.
 */

import { serveFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgeHostOptions, FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import { wrapMessagePortMain } from '@taucad/rpc';
import type { MessagePortMainLike } from '@taucad/rpc';
import type { BridgeServerHandle } from '@taucad/rpc/bridge';
import { nodeGrepMatcherWorker } from '#filesystem/node-grep-matcher-worker.js';

/**
 * Serve one rooted filesystem over an application-minted Electron port.
 *
 * @param handlers - Rooted filesystem capability admitted by the application.
 * @param port - Utility-facing emitter-shaped port leg.
 * @param options - What the utility tells the bridge about itself. A regex
 * `grep` runs on a `worker_threads` matcher unless `grepMatcherWorker` says
 * otherwise, since a utility process has no web `Worker`.
 * @returns Owned bridge handle; disposal also closes the wrapped port.
 * @public
 */
export const serveElectronFileSystemBridgePort = (
  handlers: FileSystemBridgeRuntimeService,
  port: MessagePortMainLike,
  options?: FileSystemBridgeHostOptions,
): BridgeServerHandle => {
  const wrapped = wrapMessagePortMain<unknown>(port, { label: 'electron:filesystem' });
  const server = serveFileSystemBridgePort(handlers, wrapped, { grepMatcherWorker: nodeGrepMatcherWorker, ...options });
  let disposed = false;
  return {
    emit: server.emit,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      server.dispose();
      wrapped.close();
    },
  };
};
