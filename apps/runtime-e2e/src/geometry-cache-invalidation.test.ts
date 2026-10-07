/**
 * A fresh runtime must not reuse geometry after a transitive local dependency
 * changes, even when the entry source itself is untouched. The compute store
 * lives in host state outside the project tree, as it does for a real client.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { runtime } from '#runtime.definition.js';

const entrySource = `import { makeBaseBox } from 'replicad';\nimport { boxHeight } from '../lib/dims.ts';\nexport default () => makeBaseBox(10, boxHeight, 30);\n`;
const libSource = (height: number): string => `export const boxHeight = ${height};\n`;
const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** Each call opens a new client and durable engine over the same host store. */
const exportGlb = async (root: string, hostState: string): Promise<{ geometry: string; entries: number }> => {
  const workspace = root;
  const engine = createSqliteComputeEngine({ directory: hostState });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromNodeFs(root),
      compute: {
        mode: 'durable',
        store: fromSqlite({ store: engine, workspace }),
      },
    }),
  });
  const document = client.open({ source: { path: 'test-exports/box.ts' }, watch: false });
  try {
    const result = await document.export('glb');
    if (!result.success) {
      throw new Error(`export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    const control = await engine.control({ workspace });
    const { entries } = await control.inspect({});
    return { geometry: digest(result.files[0].bytes), entries };
  } finally {
    try {
      document.close();
      await client.shutdown();
    } finally {
      await engine.dispose();
    }
  }
};

describe('geometry cache invalidation — out-of-project local imports', () => {
  let projectDirectory: string | undefined;

  afterEach(async () => {
    if (projectDirectory) {
      await rm(projectDirectory, { recursive: true, force: true });
      await rm(`${projectDirectory}-compute`, { recursive: true, force: true });
      projectDirectory = undefined;
    }
  });

  it('invalidates cached geometry when an imported ../lib file changes', { timeout: 300_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-cache-inv-'));
    const hostState = `${projectDirectory}-compute`;
    const libFile = join(projectDirectory, 'lib', 'dims.ts');
    const entryDirectory = join(projectDirectory, 'test-exports');
    await mkdir(entryDirectory, { recursive: true });
    await mkdir(join(projectDirectory, 'lib'), { recursive: true });
    await writeFile(join(entryDirectory, 'box.ts'), entrySource, 'utf8');
    await writeFile(libFile, libSource(20), 'utf8');

    const before = await exportGlb(projectDirectory, hostState);
    expect(before.entries).toBeGreaterThan(0);
    const unchanged = await exportGlb(projectDirectory, hostState);
    expect(unchanged).toEqual(before);

    // The entry source is untouched; only its transitive import changes.
    await writeFile(libFile, libSource(25), 'utf8');
    const after = await exportGlb(projectDirectory, hostState);
    expect(after.entries).toBeGreaterThan(before.entries);
    expect(after.geometry).not.toBe(before.geometry);
  });

  it('invalidates cached geometry when a `with { type: "text" }` asset changes', { timeout: 300_000 }, async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'tau-cache-inv-asset-'));
    const hostState = `${projectDirectory}-compute`;
    const entryDirectory = join(projectDirectory, 'test-exports');
    const assetFile = join(entryDirectory, 'assets', 'locknut.step');
    await mkdir(join(entryDirectory, 'assets'), { recursive: true });
    const assetEntrySource = `import { makeBaseBox } from 'replicad';\nimport locknut from './assets/locknut.step' with { type: 'text' };\nexport default () => makeBaseBox(10, 20 + (locknut.length % 5), 30);\n`;
    await writeFile(join(entryDirectory, 'box.ts'), assetEntrySource, 'utf8');
    await writeFile(assetFile, 'ISO-10303-21;\nDATA;\nENDSEC;\n', 'utf8');

    const before = await exportGlb(projectDirectory, hostState);
    expect(before.entries).toBeGreaterThan(0);
    const unchanged = await exportGlb(projectDirectory, hostState);
    expect(unchanged).toEqual(before);

    await writeFile(assetFile, 'ISO-10303-21;\nDATA;\nENDSEC;\n \n', 'utf8');
    const after = await exportGlb(projectDirectory, hostState);
    expect(after.entries).toBeGreaterThan(before.entries);
    expect(after.geometry).not.toBe(before.geometry);
  });
});
