/**
 * The CLI's runtime worker entry hosts the CLI runtime in its own thread
 * (kernel-realm-shared-state blueprint, WP-B3, component B4).
 *
 * `runtime.worker.ts` reads `{ projectRoot, plugin, config }` from `workerData`,
 * composes the CLI runtime with `loadCliRuntime`, and hosts it, so the coming
 * `tau mcp` worker client gives each project its own realm (invariant I8). The
 * source entry is TypeScript, so the thread runs under tsx through the
 * transport's `workerCtor` seam (precedent:
 * `apps/runtime-e2e/src/node-worker-explicit-entry.test.ts`).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';

import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import type { RuntimeWorkerData } from '#runtime.worker.js';

const boxSource = "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n";

class TsxWorker extends NodeWorker {
  public constructor(url: string | URL, options?: WorkerOptions) {
    super(url, { ...options, execArgv: ['--import', 'tsx'] });
  }
}

describe('CLI runtime worker entry (source)', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('hosts the CLI runtime from workerData and renders a replicad model', { timeout: 120_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-cli-runtime-worker-'));
    await writeFile(join(projectDirectory, 'main.ts'), boxSource, 'utf8');
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('runtime.worker.ts', import.meta.url),
        workerData: { projectRoot: projectDirectory, plugin: [] } satisfies RuntimeWorkerData,
        fileSystem: fromNodeFs(projectDirectory),
        workerCtor: TsxWorker,
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
