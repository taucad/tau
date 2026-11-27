/**
 * A durable build handle that keeps its program (Manifold, JSCAD) is restored by another kernel
 * worker and re-run at a non-default tessellation. The program is bundle code whose built-in
 * imports read a per-worker module-registry scope, so the stored form names no worker and the
 * restoring worker binds it to its own registry.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { manifoldKernel } from '@taucad/manifold';
import { geometryCache } from '@taucad/middleware';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';

const source = "import { Manifold } from 'manifold-3d/manifoldCAD';\nexport default () => Manifold.sphere(5);\n";

let directory: string | undefined;
afterEach(async () => {
  if (directory !== undefined) {
    await rm(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

/** One kernel worker over the shared store: export once, then shut the worker down. */
const exportIn = async (store: string, segments?: number) => {
  const engine = createSqliteComputeEngine({ directory: store });
  const reuse: string[] = [];
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({
        kernels: [manifoldKernel()],
        bundlers: [esbuildBundler()],
        middleware: [geometryCache()],
      }),
      fileSystem: fromMemoryFs({ 'main.ts': source }),
      compute: { mode: 'durable', store: fromSqlite({ store: engine, workspace: 'program-restore' }) },
    }),
  });
  client.on('log', (entry) => {
    const match = /^Geometry build cache (\w+)/u.exec(String(entry.message));
    if (match?.[1] !== undefined) {
      reuse.push(match[1]);
    }
  });
  try {
    const document = client.open({ source: { path: 'main.ts' }, parameters: {}, watch: false });
    try {
      const result = await document.export(
        'glb',
        segments === undefined ? {} : { options: { tessellation: { segments } } },
      );
      return { result, reuse };
    } finally {
      document.close();
      await client.shutdown();
    }
  } finally {
    await engine.dispose();
  }
};

describe('a durable Manifold build restored by another worker', () => {
  it('re-meshes its program at a non-default segment count after the storing worker is gone', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-program-restore-'));
    const stored = await exportIn(directory);
    expect(stored.result.success).toBe(true);

    const restored = await exportIn(directory, 24);
    expect(restored.reuse).toEqual(['cache']);
    expect(restored.result.success ? [] : restored.result.issues).toEqual([]);
  });
});
