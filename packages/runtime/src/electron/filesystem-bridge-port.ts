/**
 * Electron utility-process filesystem bridge over an emitter-shaped port.
 *
 * This module imports no `electron` runtime value, so a services utility can
 * serve a main-minted `MessagePortMain` without loading main-process APIs.
 */

import { serveFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgeRuntimeService } from '@taucad/fs-bridge';
import { wrapMessagePortMain } from '@taucad/rpc';
import type { MessagePortMainLike } from '@taucad/rpc';
import type { BridgeServerHandle } from '@taucad/rpc/bridge';

/**
 * Serve one rooted filesystem over an application-minted Electron port.
 *
 * @param handlers - Rooted filesystem capability admitted by the application.
 * @param port - Utility-facing emitter-shaped port leg.
 * @returns Owned bridge handle; disposal also closes the wrapped port.
 * @public
 */
export const serveElectronFileSystemBridgePort = (
  handlers: FileSystemBridgeRuntimeService,
  port: MessagePortMainLike,
): BridgeServerHandle => {
  const wrapped = wrapMessagePortMain<unknown>(port, { label: 'electron:filesystem' });
  const server = serveFileSystemBridgePort(handlers, wrapped);
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
