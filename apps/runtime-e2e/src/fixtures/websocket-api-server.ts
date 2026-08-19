/**
 * "API server" entry for the two-process WebSocket suite.
 *
 * Launched as `node --import tsx <this file>` with an IPC channel; mirrors
 * `examples/electron/src/tau/kernel-host.ts` but serves the runtime over
 * `webSocketHost` and reports its ephemeral port back to the parent.
 *
 * Environment:
 *   - `TAU_WS_MODE`         — `host-local` (W1, this process owns the fs) or
 *                             `bridged` (W2, the UI serves its own fs over `/fs`);
 *   - `TAU_SERVER_ROOT`     — project root for `host-local`;
 *   - `TAU_ALLOWED_ORIGINS` — comma-separated origin allowlist;
 *   - `PORT`                — `0` for an ephemeral port.
 */

import process from 'node:process';

import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';
import { createRuntimeWorker } from '@taucad/runtime/worker';

import { webSocketRuntime } from '#fixtures/websocket-runtime.js';

const serverRoot = process.env['TAU_SERVER_ROOT'] ?? process.cwd();
const allowedOrigins = (process.env['TAU_ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean);

const host = webSocketHost({
  worker: () => createRuntimeWorker({ runtime: webSocketRuntime }),
  fileSystem: process.env['TAU_WS_MODE'] === 'bridged' ? undefined : fromNodeFs(serverRoot),
  allowedOrigins,
  host: '127.0.0.1',
  port: Number(process.env['PORT'] ?? '0'),
});

await host.ready;
// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
/* ponytail: no SIGTERM handler — the parent's teardown is a process-group
 * SIGTERM then SIGKILL, and Node's default SIGTERM disposition is exactly the
 * "server dies" shape E5 is about. */
process.send?.({ port: host.address().port });
// The child is detached in its own process group; if the vitest worker
// dies without running its teardown, the IPC channel closing is the only
// signal left — exit rather than outlive the parent as an orphan.
process.on('disconnect', () => {
  process.exit(0);
});
