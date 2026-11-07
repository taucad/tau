// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
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
import { importFactsPath, importStagingDirectory, stageImport } from '#importer/staging.js';
import type { ImportFactsRecord } from '#importer/staging.js';
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

/* Every way a provider can put bytes down — a write, an append, a stream, and a rename that copies — counted by path. */
const countBytes = (provider: FileSystemProvider) => {
  const written = new Map<string, number>();
  const order: string[] = [];
  const add = (path: string, bytes: number): void => {
    order.push(path);
    written.set(path, (written.get(path) ?? 0) + bytes);
  };
  const sizeOf = (data: unknown): number =>
    typeof data === 'string' ? encoder.encode(data).byteLength : (data as Uint8Array<ArrayBuffer>).byteLength;
  const writeFile = provider.writeFile.bind(provider);
  vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
    add(path, sizeOf(data));
    await writeFile(path, data);
  });
  const appendFile = provider.appendFile?.bind(provider);
  if (appendFile !== undefined) {
    vi.spyOn(provider, 'appendFile').mockImplementation(async (path, data) => {
      add(path, sizeOf(data));
      await appendFile(path, data);
    });
  }
  /* A stream is gathered into a `writeFile` where the provider does not stream, so it is seen there; none is expected. */
  const streams = provider.writeFileStream === undefined ? undefined : vi.spyOn(provider, 'writeFileStream');
  const rename = provider.rename.bind(provider);
  const renames: string[] = [];
  vi.spyOn(provider, 'rename').mockImplementation(async (from, to) => {
    renames.push(to);
    /* A rename that copies writes the file again; one that moves in place writes nothing. */
    if (provider.capabilities.movesInPlace !== true) {
      const stat = await provider.stat(from);
      add(to, stat.type === 'file' ? stat.size : 0);
    }
    await rename(from, to);
  });
  return {
    content: (prefix: string): number =>
      [...written].filter(([path]) => path.includes(prefix)).reduce((sum, [, bytes]) => sum + bytes, 0),
    renames,
    last: (): string | undefined => order.at(-1),
    streams: (): number => streams?.mock.calls.length ?? 0,
  };
};

const contentBytes = Object.values(files).reduce((sum, content) => sum + encoder.encode(content).byteLength, 0) + 4;

describe('commitPendingProjectDirectory from a staged import', () => {
  let service: WorkspaceFileService;
  let provider: FileSystemProvider;

  const stage = async (target?: string): Promise<void> => {
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
      ...(target === undefined ? {} : { target }),
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

  /* As OPFS and Node declare: a rename is a metadata operation. */
  const movingInPlace = (): void => {
    Object.defineProperty(provider, 'capabilities', { value: { ...provider.capabilities, movesInPlace: true } });
  };

  beforeEach(async () => {
    const harness = await createWorkspaceFileService();
    ({ service } = harness);
    provider = await harness.providerRegistry.getProvider(scope);
  });

  afterEach(() => {
    service.dispose();
  });

  it('should write each file once where a rename copies: straight into the project, the manifest last', async () => {
    expect(provider.capabilities.movesInPlace).not.toBe(true);
    const counted = countBytes(provider);

    await stage(directory);

    /* Staged in place: the project folder holds the files, with no manifest, so no discovery sees a project. */
    expect(await provider.exists(`${directory}/src/part-7.ts`)).toBe(true);
    expect(await provider.exists(`${directory}/tau.json`)).toBe(false);
    const discovered = await service.listProjectManifests();
    expect(discovered.entries).toEqual([]);

    await expect(commit()).resolves.toEqual({ status: 'committed' });

    expect(decoder.decode(await provider.readFile(`${directory}/src/main.ts`))).toBe('main');
    /* Every content byte was put down exactly once, and nothing was renamed into the project. */
    expect(counted.content(`${directory}/src/`)).toBe(contentBytes);
    expect(counted.renames.filter((path) => path.startsWith(`${directory}/`))).toEqual([]);
    expect(counted.streams()).toBe(0);
    expect(counted.last()).toBe(`${directory}/tau.json`);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
    await expect(commit()).resolves.toEqual({ status: 'already-committed' });
  });

  it('should move every staged file into the project where a move is free, never writing its bytes again', async () => {
    movingInPlace();
    await stage(directory);
    const counted = countBytes(provider);

    await expect(commit()).resolves.toEqual({ status: 'committed' });

    expect(decoder.decode(await provider.readFile(`${directory}/src/part-7.ts`))).toBe('export const p = 7;');
    expect(counted.content(`${directory}/src/`)).toBe(0);
    expect(counted.renames.filter((path) => path.startsWith(`${directory}/src/`))).toHaveLength(301);
    expect(counted.last()).toBe(`${directory}/tau.json`);
    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should keep the facts the decode measured beside the project, for its first revision', async () => {
    await stage(directory);

    await commit();

    const record = JSON.parse(
      decoder.decode(await provider.readFile(`${directory}/${importFactsPath}`)),
    ) as ImportFactsRecord;
    const main = record.entries.find(({ path }) => path === 'src/main.ts');

    expect(record.entries).toHaveLength(301);
    expect(main?.facts.blobOid).toBe(gitBlobOid('main'));
    expect(main?.facts.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(tauPathPolicy.classify(importFactsPath).versioned).toBe(false);
  });

  it('should remove a staging a commit left after its manifest, when the replay finds the project whole', async () => {
    movingInPlace();
    await stage(directory);
    await expect(commit()).resolves.toEqual({ status: 'committed' });
    /* A tab that closed between the manifest and the staging's removal left it behind. */
    await provider.writeFile(`${importStagingDirectory(operationId)}/intent.json`, '{}');

    await expect(commit()).resolves.toEqual({ status: 'already-committed' });

    expect(await provider.exists(importStagingDirectory(operationId))).toBe(false);
  });

  it('should resume a commit that stopped mid-move from what is still staged', async () => {
    movingInPlace();
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

  it('should refuse a commit whose in-place staging lost a file', async () => {
    await stage(directory);
    await provider.unlink(`${directory}/src/part-3.ts`);

    await expect(commit()).rejects.toThrow('A staged import entry is missing: src/part-3.ts');
    expect(await provider.exists(`${directory}/tau.json`)).toBe(false);
  });

  it('should refuse to commit when the staged import is gone', async () => {
    await expect(commit()).rejects.toThrow(`The staged import ${operationId} is gone.`);
    expect(await provider.exists(`${directory}/tau.json`)).toBe(false);
  });
});

const gitBlobOid = (content: string): string => {
  const bytes = encoder.encode(content);
  return createHash('sha1')
    .update(`blob ${String(bytes.byteLength)}\0`)
    .update(bytes)
    .digest('hex');
};
