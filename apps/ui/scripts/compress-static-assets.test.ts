// @vitest-environment node
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { compressStaticAssets } from '#scripts/compress-static-assets.mts';

const directories: string[] = [];
const fixtureRoot = resolve(import.meta.dirname, '../node_modules/.cache');
afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
}, 60_000);

it('precompresses the large hashed KCL asset and leaves other files for streaming fallback', async () => {
  await mkdir(fixtureRoot, { recursive: true });
  const directory = await mkdtemp(join(fixtureRoot, 'tau-static-compress-'));
  directories.push(directory);
  const content = Buffer.alloc(8 * 1024 * 1024, 97);
  await writeFile(join(directory, 'kcl_wasm_lib_bg-a1b2c3d4.wasm'), content);
  await writeFile(join(directory, 'kcl_wasm_lib_bg-b1c2d3e4.wasm'), Buffer.alloc(8 * 1024 * 1024 - 1, 97));
  await writeFile(join(directory, 'other-a1b2c3d4.wasm'), content);
  await writeFile(join(directory, 'unhashed.wasm'), content);
  await writeFile(join(directory, 'small-a1b2c3d4.js'), 'small');

  await compressStaticAssets(directory);

  const entries = await readdir(directory);
  expect(entries.toSorted()).toEqual([
    'kcl_wasm_lib_bg-a1b2c3d4.wasm',
    'kcl_wasm_lib_bg-a1b2c3d4.wasm.br',
    'kcl_wasm_lib_bg-a1b2c3d4.wasm.gz',
    'kcl_wasm_lib_bg-b1c2d3e4.wasm',
    'other-a1b2c3d4.wasm',
    'small-a1b2c3d4.js',
    'unhashed.wasm',
  ]);
  expect(
    brotliDecompressSync(await readFile(join(directory, 'kcl_wasm_lib_bg-a1b2c3d4.wasm.br'))).equals(content),
  ).toBe(true);
  expect(gunzipSync(await readFile(join(directory, 'kcl_wasm_lib_bg-a1b2c3d4.wasm.gz'))).equals(content)).toBe(true);
}, 180_000);
