/**
 * The daemon's shipped runtime child, built and sandboxed.
 *
 * `runtime-child-render.integration.test.ts` drives the TypeScript child, and a
 * TypeScript child runs without `--permission` (`permissionArguments` in
 * `runtime-child-supervisor.ts`). The distributed daemon forks the built
 * `host-runtime-child.mjs` under Node's permission model with no
 * `--allow-addons` and no `--allow-worker`, so a dependency that loads a native
 * addon at import, or a kernel that starts worker threads, passes from source
 * and fails only once shipped. These cases start the built child through
 * `startRuntimeChild` and render through the WebSocket client, as the daemon
 * does (`host-daemon.ts`, `agentRuntimes`).
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { WebSocket } from 'ws';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

import { startRuntimeChild } from '#runtime-child-supervisor.js';
import type { RuntimeChildHandle } from '#runtime-child-supervisor.js';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const builtChildPath = resolve(repoRoot, 'packages/cli/dist/bin/host-runtime-child.mjs');

const replicadBox = "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n";

let workspaceRoot: string;
let child: RuntimeChildHandle | undefined;
const originalDirectory = process.cwd();

beforeAll(async () => {
  /* The cli package resolves this package's source, so its bin needs only its own build. */
  await execFileAsync('pnpm', ['nx', 'build', 'cli', '--excludeTaskDependencies'], { cwd: repoRoot });
  workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-built-child-'));
  await writeFile(join(workspaceRoot, 'main.ts'), replicadBox, 'utf8');
  /* The child reads only the daemon's working directory and its own, and in this workspace its dependencies are the
   * repository's sources. */
  process.chdir(repoRoot);
}, 180_000);

afterEach(async () => {
  await child?.close();
  child = undefined;
});

afterAll(async () => {
  process.chdir(originalDirectory);
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('runtime child render (built, sandboxed)', () => {
  it('becomes ready under the permission model', { timeout: 60_000 }, async () => {
    child = await startRuntimeChild({ modulePath: builtChildPath });

    expect(child.url.protocol).toBe('ws:');
  });

  it('renders a replicad model without worker threads', { timeout: 120_000 }, async () => {
    const started = await startRuntimeChild({ modulePath: builtChildPath });
    child = started;
    const client = createRuntimeClient({
      transport: webSocketTransport({
        url: started.url,
        fileSystem: fromNodeFs(workspaceRoot),
        createSocket: (url) =>
          new WebSocket(url, { headers: { authorization: `Bearer ${started.authorizationToken}` } }),
      }),
    });
    const document = client.open({ source: { path: 'main.ts' }, watch: false });
    try {
      const outcome = await document.view().rendering();

      expect(outcome.superseded).toBe(false);
      if (outcome.superseded) {
        throw new Error('The only render in this test must not be superseded.');
      }
      expect(outcome.rendering.success, JSON.stringify(outcome.rendering.issues)).toBe(true);
    } finally {
      document.close();
      await client.shutdown();
    }
  });
});
