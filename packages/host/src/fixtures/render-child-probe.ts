/**
 * Driver for `runtime-child-render.integration.test.ts`.
 *
 * A separate process because the TypeScript runtime child can only be forked
 * by a parent that already carries the tsx loader
 * (`runtime-child-supervisor.ts`, `developmentLoaderArguments`) — exactly the
 * shape `tau serve` runs in from source. Everything else here is the daemon's
 * own code path: `startRuntimeChild` with the CLI's child module,
 * `ensureAgentRuntime`'s runtime client (`host-daemon.ts`), and the real tool
 * registry, so the answer printed on stdout is the one a model would receive.
 *
 * Usage: `node --import tsx render-child-probe.ts <workspaceRoot> <targetFile>`
 * Prints one line: `PROBE <json>`.
 */

import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostRuntimeClient } from '#agent-tools.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';

const [workspaceRoot, targetFile] = process.argv.slice(2);
if (!workspaceRoot || !targetFile) {
  throw new Error('render-child-probe: expected <workspaceRoot> <targetFile>');
}

const modulePath = fileURLToPath(new URL('../../../cli/src/host-runtime-child.ts', import.meta.url));
const child = await startRuntimeChild({ modulePath });

try {
  const registry = createHostToolRegistry({
    workspaceRoot,
    runtimeClient: async () =>
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the daemon casts the same way (host-daemon.ts).
      createRuntimeClient({
        transport: webSocketTransport({
          url: child.url,
          fileSystem: fromNodeFs(workspaceRoot),
          createSocket: (url) =>
            new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
        }),
      }) as unknown as HostRuntimeClient,
    geospecRunner: false,
  });

  const outcome = await registry.invoke({
    toolCallId: 'render-child-probe',
    toolName: 'get_kernel_result',
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the tool's own JSON input shape.
    input: { targetFile } as never,
    signal: new AbortController().signal,
  });

  process.stdout.write(`PROBE ${JSON.stringify({ isError: outcome.isError, content: outcome.content })}\n`);
} finally {
  await child.close();
}

/* The runtime client holds loopback sockets open past its last answer, so a
 * probe that returned normally would idle until the test's timeout. */
// oxlint-disable-next-line unicorn/no-process-exit -- a one-shot probe must terminate the moment it has its answer.
process.exit(0);
