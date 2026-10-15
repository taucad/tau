import { timingSafeEqual } from 'node:crypto';

import { packageVersion } from '@taucad/runtime/metadata';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
import { createRuntimeWorker } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';

/* The supervised child's other half: its native workers start in the daemon (D37). */
/* oxlint-disable no-barrel-files/no-barrel-files -- this module is the `./runtime-host` package entry */
export { createRuntimeChildWorkerLauncher } from '#runtime-child-workers.js';
export type { RuntimeChildChannel } from '#runtime-child-workers.js';
export type { RuntimeChildWorker, RuntimeChildWorkerLaunch } from '#runtime-child-supervisor.js';
/* oxlint-enable no-barrel-files/no-barrel-files -- end of the re-exports */

/** Handle for a loopback runtime hosted by a host child process. @public */
export type HostRuntimeHandle = {
  readonly url: URL;
  readonly runtimeVersion: string;
  close(): Promise<void>;
};

const tokenMatches = (authorization: string | undefined, expected: string): boolean => {
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(suppliedBytes, expectedBytes);
};

/**
 * Serve a CLI-composed runtime on an authenticated ephemeral loopback socket.
 *
 * @param options - Runtime definition and parent-only loopback authorization token.
 * @returns A ready runtime host handle.
 * @public
 *
 * @example <caption>Serve a runtime inside a supervised child</caption>
 * ```typescript
 * import { serveHostRuntime } from '@taucad/host/runtime-host';
 * import { defineRuntime } from '@taucad/runtime/worker';
 *
 * const host = await serveHostRuntime({
 *   runtime: defineRuntime({}),
 *   authorizationToken: crypto.randomUUID(),
 * });
 * await host.close();
 * ```
 */
export const serveHostRuntime = async (options: {
  readonly runtime: AnyRuntimeDefinition;
  readonly authorizationToken: string;
}): Promise<HostRuntimeHandle> => {
  if (options.authorizationToken.length < 32) {
    throw new TypeError('serveHostRuntime: authorizationToken must contain at least 32 characters');
  }
  const host = webSocketHost({
    host: '127.0.0.1',
    port: 0,
    worker: () => createRuntimeWorker({ runtime: options.runtime }),
    authorize: (request) => tokenMatches(request.headers.authorization, options.authorizationToken),
    allowPrivateComputePairing: true,
  });
  await host.ready;
  const address = host.address();
  return {
    url: new URL(`ws://${address.host}:${String(address.port)}`),
    runtimeVersion: packageVersion,
    async close(): Promise<void> {
      await host.close();
    },
  };
};
