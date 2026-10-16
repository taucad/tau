// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { assetReceiptFileName, createAssetIntegrity } from './asset-integrity.vite-plugin.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import type { AssetReceipt } from './asset-integrity.vite-plugin.js';

/* Two distinct, valid empty modules: one custom section each. */
const mainWasm = Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 3, 1, 0x6d, 0x61]);
const workerWasm = Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 3, 1, 0x77, 0x6b]);
const integrityOf = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

describe('UI asset integrity', () => {
  let root: string;
  let output: string;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'tau-asset-integrity-'));
    output = path.join(root, 'dist');
    writeFileSync(path.join(root, 'main.wasm'), mainWasm);
    writeFileSync(path.join(root, 'worker.wasm'), workerWasm);
    writeFileSync(path.join(root, 'worker.js'), "self.postMessage(new URL('./worker.wasm', import.meta.url).href);\n");
    writeFileSync(
      path.join(root, 'main.js'),
      [
        "export const wasmUrl = new URL('./main.wasm', import.meta.url).href;",
        "export const worker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });",
        '',
      ].join('\n'),
    );
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [createAssetIntegrity({ receipt: true })],
      worker: { format: 'es', plugins: () => [createAssetIntegrity({ receipt: false })] },
      build: {
        outDir: output,
        assetsInlineLimit: 0,
        sourcemap: 'hidden',
        minify: false,
        rollupOptions: { input: path.join(root, 'main.js'), preserveEntrySignatures: 'strict' },
      },
    });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const files = (): string[] =>
    readdirSync(output, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(output, path.join(entry.parentPath, entry.name)));
  const read = (file: string): string => readFileSync(path.join(output, file), 'utf8');
  const chunkNaming = (needle: string): string => {
    const file = files().find((name) => name.endsWith('.js') && read(name).includes(needle));
    if (file === undefined) {
      throw new Error(`No chunk references ${needle}`);
    }
    return file;
  };

  it('registers each referenced WASM file first in the chunk that names it, in its own realm', () => {
    const wasmFiles = files().filter((name) => name.endsWith('.wasm'));
    const mainFile = wasmFiles.find((name) => readFileSync(path.join(output, name)).equals(mainWasm));
    const workerFile = wasmFiles.find((name) => readFileSync(path.join(output, name)).equals(workerWasm));
    expect(mainFile).toBeDefined();
    expect(workerFile).toBeDefined();

    const mainChunk = read(chunkNaming(path.basename(mainFile!)));
    expect(mainChunk.split('\n')[0]).toContain(integrityOf(mainWasm));
    expect(mainChunk.split('\n')[0]).toContain('globalThis[Symbol.for("taucad.assetIntegrity")]??=new Map()');
    expect(mainChunk).not.toContain(integrityOf(workerWasm));

    const workerChunk = read(chunkNaming('self.postMessage'));
    expect(workerChunk.split('\n')[0]).toContain(integrityOf(workerWasm));
  });

  it('resolves the registered URL to where the chunk loads the asset from', () => {
    const chunkFile = chunkNaming('wasmUrl');
    const chunkUrl = new URL(`https://ui.example/${chunkFile}`);
    const [firstLine = ''] = read(chunkFile).split('\n');
    const registered = [
      ...firstLine.matchAll(/r\.set\(new URL\(("[^"]+"),import\.meta\.url\)\.href,("[^"]+")\)/gu),
    ].map(([, specifier = '""', integrity = '""']) => [
      new URL(JSON.parse(specifier) as string, chunkUrl).href,
      JSON.parse(integrity) as string,
    ]);

    const wasmFile = files().find((name) => name.endsWith('.wasm') && read(chunkFile).includes(path.basename(name)));
    expect(registered).toEqual([[new URL(`/${wasmFile!}`, chunkUrl).href, integrityOf(mainWasm)]]);
  });

  it('shifts the hidden source map by the registration line', () => {
    const chunkFile = chunkNaming('wasmUrl');
    const map = JSON.parse(read(`${chunkFile}.map`)) as { mappings: string };
    expect(map.mappings.startsWith(';')).toBe(true);
  });

  it('writes a receipt of every emitted file with the integrity of the bytes on disk', () => {
    const receipt = JSON.parse(read(assetReceiptFileName)) as AssetReceipt;
    expect(receipt.schema).toBe('tau-ui-asset-receipt-v1');
    const listed = receipt.assets.map((asset) => asset.path).toSorted();
    const emitted = files()
      .filter((name) => !name.endsWith('.map') && name !== assetReceiptFileName)
      .toSorted();
    expect(listed).toEqual(emitted);
    for (const asset of receipt.assets) {
      const bytes = Uint8Array.from(readFileSync(path.join(output, asset.path)));
      expect(asset).toEqual({ path: asset.path, bytes: bytes.byteLength, integrity: integrityOf(bytes) });
    }
  });
});
