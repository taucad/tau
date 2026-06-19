/**
 * Resolve a consumer-supplied {@link RuntimeFileSystem} into a
 * `MessagePort` suitable for the dispatcher's filesystem bridge.
 *
 * - `kind: 'inline'`  → wrap in a fresh `BridgePort` so the worker can
 *                       consume it via the same proxy plumbing.
 * - `kind: 'channel'` → forward the supplied port verbatim.
 *
 * Returns `undefined` when no filesystem was supplied (`fileSystem ===
 * undefined`); transports degrade to whatever default FS the worker
 * brings up internally.
 *
 * @internal
 */

import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { resolveRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { createBridgePort } from '@taucad/rpc/bridge';

/**
 * Resolved filesystem bridge materialized for one runtime initialize call.
 *
 * @internal
 */
export type ResolvedFileSystemBridge = {
  readonly port: MessagePort;
  readonly kind: 'inline' | 'channel';
  readonly dispose: () => void;
};

/**
 * Error raised when retrying initialize with a channel-backed filesystem whose
 * transferable port was already consumed by a failed initialize call.
 *
 * @internal
 */
export class RuntimeFileSystemBridgeConsumedError extends Error {
  /**
   * Stable diagnostic code for retry attempts that reuse a consumed bridge port.
   *
   * @returns Stable runtime diagnostic code.
   */
  public get code(): 'RUNTIME_FILESYSTEM_BRIDGE_CONSUMED' {
    return 'RUNTIME_FILESYSTEM_BRIDGE_CONSUMED';
  }

  public constructor(transportName: string) {
    super(
      `${transportName}: filesystem bridge port was consumed by a failed initialize call. Recreate the RuntimeClient before retrying this transport.`,
    );
    this.name = 'RuntimeFileSystemBridgeConsumedError';
  }
}

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
    const bridge = createBridgePort(handle.create());
    return {
      port: bridge.port,
      kind: 'inline',
      dispose: () => {
        bridge.dispose();
      },
    };
  }
  return {
    port: handle.port,
    kind: 'channel',
    dispose: () => {
      handle.dispose?.();
    },
  };
};
