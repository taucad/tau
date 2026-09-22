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
 * Usage: `tsx render-child-probe.ts <workspaceRoot> <targetFile> [repairedSource]`
 * Prints `PROBE <json>`, and, when a repaired source is given, writes it over
 * the target between two invocations of the same registry and runtime and
 * prints `PROBE2 <json>` for the second answer. Two invocations across an edit
 * are the reported stale-verdict sequence
 * (`docs/research/agent-stale-kernel-result-elimination-blueprint.md`).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket } from 'ws';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostRuntimeClient } from '#agent-tools.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';

const [workspaceRoot, targetFile, repairedSource] = process.argv.slice(2);
if (!workspaceRoot || !targetFile) {
  throw new Error('render-child-probe: expected <workspaceRoot> <targetFile>');
}

const modulePath = fileURLToPath(new URL('../../../cli/src/host-runtime-child.ts', import.meta.url));
const child = await startRuntimeChild({ modulePath });

try {
  /* One client for the life of the probe, as `ensureAgentRuntime` keeps one per workspace root
   * (`host-daemon.ts`): the registry asks for a client on every invocation, and a probe that
   * minted a fresh one per call would answer from a fresh kernel and prove nothing about the
   * kernel a real session keeps. */
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
    geospecRunner: false,
  });

  const invoke = async (toolCallId: string): Promise<{ isError: boolean; content: unknown }> => {
    const outcome = await registry.invoke({
      toolCallId,
      toolName: 'get_kernel_result',
      input: { targetFile },
      signal: new AbortController().signal,
    });
    return { isError: outcome.isError, content: outcome.content };
  };

  process.stdout.write(`PROBE ${JSON.stringify(await invoke('render-child-probe'))}\n`);

  if (repairedSource !== undefined) {
    await writeFile(join(workspaceRoot, targetFile), repairedSource, 'utf8');
    process.stdout.write(`PROBE2 ${JSON.stringify(await invoke('render-child-probe-2'))}\n`);
  }
} finally {
  await child.close();
}

/* The runtime client holds loopback sockets open past its last answer, so a
 * probe that returned normally would idle until the test's timeout. */
// oxlint-disable-next-line unicorn/no-process-exit -- a one-shot probe must terminate the moment it has its answer.
process.exit(0);
