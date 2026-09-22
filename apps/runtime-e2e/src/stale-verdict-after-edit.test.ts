/**
 * The corpus miner's signature, encoded as a check (blueprint R11).
 *
 * `mining/mine_stale.py` flags a chat when an identical kernel error verdict
 * follows an edit to the same file: the agent repaired the model, asked again,
 * and was told the same thing about bytes that no longer existed. That is the
 * sequence here, over the real node-worker transport and one live client, so
 * the retained volatile caches are the ones the reported hosts kept.
 *
 * It also closes the transport axis R6's conformance matrix left open: that
 * matrix runs the adapters in process, while this one crosses a worker
 * boundary and asserts the provenance (R4) that crossed it.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';

import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';

const entryPath = 'model.ts';

/* Imports replicad so kernel detection attributes the model, then fails the way
 * the reported chat failed — inside the model, after the closure is resolved. */
const brokenSource = `import { makeBaseBox } from 'replicad';\nexport default () => {\n  void makeBaseBox;\n  throw new Error('You need a previous curve to sketch a tangent arc');\n};\n`;
const repairedSource = `import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n`;

/** The digest a write tool reports for the bytes it just wrote (R4 vocabulary). */
const digestOf = (source: string): string => `sha256:${createHash('sha256').update(source).digest('hex')}`;

/**
 * The application-owned worker entry is TypeScript in this workspace, so the
 * worker thread needs tsx's loader — the same seam
 * `node-worker-explicit-entry.test.ts` uses.
 */
class TsxWorker extends NodeWorker {
  public constructor(url: string | URL) {
    super(url, { execArgv: ['--import', 'tsx'] });
  }
}

describe('a repaired model is never answered with the verdict it replaced', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('answers the second evaluation for the bytes written before it', { timeout: 300_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-stale-verdict-'));
    const entryFile = join(projectDirectory, entryPath);
    await writeFile(entryFile, brokenSource, 'utf8');

    /* One client across both evaluations: a fresh client per call would prove
     * nothing, because the caches this test exists for are per worker. */
    const client = createRuntimeClient({
      transport: nodeWorkerTransport({
        url: new URL('fixtures/node-runtime.ts', import.meta.url),
        fileSystem: fromNodeFs(projectDirectory),
        workerCtor: TsxWorker,
      }),
    });

    try {
      const broken = await client.evaluate({ source: { path: entryPath }, parameters: {} });

      expect(broken.success).toBe(false);
      // The failure is the model's own, so the closure was resolved and hashed before it.
      expect(JSON.stringify(broken.issues)).toContain('tangent arc');
      expect(broken.sourceRevision?.files[entryPath]).toBe(digestOf(brokenSource));

      await writeFile(entryFile, repairedSource, 'utf8');
      const repaired = await client.evaluate({ source: { path: entryPath }, parameters: {} });

      // The verdict differs, and it differs by succeeding — the mined signature is an
      // identical error verdict after the edit.
      expect(repaired.success).toBe(true);
      expect(JSON.stringify(repaired.issues)).not.toContain('tangent arc');
      // …and it says so: the revision it names is the one the edit left behind.
      expect(repaired.sourceRevision?.files[entryPath]).toBe(digestOf(repairedSource));
    } finally {
      client.terminate();
    }
  });
});
