// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyBatchWithPrimitives } from '#backend/batch.js';
import type { StorageRootConfig } from '#mount-table.js';
import { tauPathPolicy } from '#path-registry.js';
import { createWorkspaceFileService, decoder, encoder } from '#testing/workspace-service-harness.js';
import type { FileSystemProvider } from '#types.js';
import type { WorkspaceFileService } from '#workspace-file-service.js';
import { createInlineImportDecoder } from '#importer/decode.js';
import { planImport, zipImportSource } from '#importer/sources.js';
import { importStagingDirectory, stageImport } from '#importer/staging.js';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';

const projectId = 'proj_iiiiiiiiiiiiiiiiiiiii';
const operationId = 'req_import';
const directory = 'imported-project';
const scope: StorageRootConfig = { backend: 'indexeddb' };
const manifest = serializeProjectManifest(
  projectToManifest({ name: 'Imported', description: '', tags: [], assets: { main: { entryPath: 'src/main.ts' } } }),
);

const files = Object.fromEntries(
  Array.from({ length: 300 }, (_, index) => [
    `repo/src/part-${String(index)}.ts`,
    `export const p = ${String(index)};`,
  ]),
);

describe('commitPendingProjectDirectory from a staged import', () => {
  let service: WorkspaceFileService;
  let provider: FileSystemProvider;

  const stage = async (): Promise<void> => {
    const zip = new JSZip();
    for (const [name, content] of Object.entries({ ...files, 'repo/src/main.ts': 'main', 'repo/tau.json': '{}' })) {
      zip.file(name, content);
    }
    const blob = new Blob([(await zip.generateAsync({ type: 'uint8array' })) as Uint8Array<ArrayBuffer>]);
    const plan = await planImport(zipImportSource(blob), { policy: tauPathPolicy });
    await stageImport({
      port: { provider, apply: async (entries) => applyBatchWithPrimitives(provider, entries) },
      operationId,
      plan,
      decode: createInlineImportDecoder(),
    });
  };

  const commit = async () =>
    service.commitPendingProjectDirectory({
      projectId,
      providerBasePath: directory,
      scope,
      files: { '.tau/workbench/views/v-abcd1234.json': { content: encoder.encode('{}') } },
      manifest,
      staging: { operationId },
    });

  beforeEach(async () => {
    const harness = await createWorkspaceFileService();
    ({ service } = harness);
    provider = await harness.providerRegistry.getProvider(scope);
  });

  afterEach(() => {
    service.dispose();
  });

  it('should move every staged file into the project without writing its bytes again, then the manifest last', async () => {
    await stage();
    const writes: string[] = [];
    const write = provider.writeFile.bind(provider);
    vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
      writes.push(path);
      await write(path, data);
    });

    await expect(commit()).resolves.toEqual({ status: 'committed' });

    expect(decoder.decode(await provider.readFile(`${directory}/src/part-7.ts`))).toBe('export const p = 7;');
    expect(decoder.decode(await provider.readFile(`${directory}/src/main.ts`))).toBe('main');
    /* The staged content was moved, never written: only what the create adds, the identity and the manifest. */
    expect(writes.filter((path) => path.includes('/src/'))).toEqual([]);
    expect(writes.at(-1)).toBe(`${directory}/tau.json`);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
    await expect(commit()).resolves.toEqual({ status: 'already-committed' });
  });

  it('should resume a commit that stopped mid-move from what is still staged', async () => {
    await stage();
    const rename = provider.rename.bind(provider);
    let moves = 0;
    const spy = vi.spyOn(provider, 'rename').mockImplementation(async (from, to) => {
      moves += 1;
      if (moves === 120) {
        throw new Error('tab closed');
      }
      await rename(from, to);
    });

    await expect(commit()).rejects.toThrow();
    expect(await provider.exists(`${directory}/tau.json`)).toBe(false);

    spy.mockRestore();

    await expect(commit()).resolves.toEqual({ status: 'committed' });

    for (let index = 0; index < 300; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- every file is checked after the resumed commit.
      expect(await provider.exists(`${directory}/src/part-${String(index)}.ts`)).toBe(true);
    }
  });

  it('should refuse to commit when the staged import is gone', async () => {
    await expect(commit()).rejects.toThrow(`The staged import ${operationId} is gone.`);
    expect(await provider.exists(`${directory}/tau.json`)).toBe(false);
  });
});
