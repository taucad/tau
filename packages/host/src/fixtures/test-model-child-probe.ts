/**
 * One-shot `test_model` probe on the daemon's own vertical: the supervised
 * runtime child, the real tool registry with no GeoSpec runner supplied, and
 * the native engine the registry's default borrows that child for.
 *
 * Driven by `agent-tools.integration.test.ts` as a child process, like
 * `render-child-probe.ts`, so the kernel and engine load outside the vitest
 * worker pool. Prints one `PROBE <json>` line and exits.
 */

import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostRuntimeClient } from '#agent-tools.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';

const [workspaceRoot, testNamePattern] = process.argv.slice(2);
if (!workspaceRoot || !testNamePattern) {
  throw new Error('test-model-child-probe: expected <workspaceRoot> <testNamePattern>');
}

const modulePath = fileURLToPath(new URL('../../../cli/src/host-runtime-child.ts', import.meta.url));
const child = await startRuntimeChild({ modulePath });

try {
  let client: HostRuntimeClient | undefined;
  const registry = createHostToolRegistry({
    workspaceRoot,
    runtimeClient: async () => {
      client ??=
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the daemon casts the same way (host-daemon.ts).
        createRuntimeClient({
          transport: webSocketTransport({
            url: child.url,
            fileSystem: fromNodeFs(workspaceRoot),
            createSocket: (url) =>
              new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
          }),
        }) as unknown as HostRuntimeClient;
      return client;
    },
  });

  const offered = registry.list().some((tool) => tool.name === 'test_model');
  const outcome = offered
    ? await registry.invoke({
        toolCallId: 'test-model-child-probe',
        toolName: 'test_model',
        input: { files: ['main.geospec.ts'], testNamePattern },
        signal: new AbortController().signal,
      })
    : { isError: true, content: 'test_model is not offered' };
  process.stdout.write(`PROBE ${JSON.stringify({ offered, isError: outcome.isError, content: outcome.content })}\n`);
} finally {
  await child.close();
}

/* The runtime client holds loopback sockets open past its last answer, so a
 * probe that returned normally would idle until the test's timeout. */
// oxlint-disable-next-line unicorn/no-process-exit -- a one-shot probe must terminate the moment it has its answer.
process.exit(0);
