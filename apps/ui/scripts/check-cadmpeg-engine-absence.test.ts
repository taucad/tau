// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  checkEngineAbsence,
  findEngineFiles,
  indexEngineDigests,
  loadInstalledDigests,
} from '#scripts/check-cadmpeg-engine-absence.mts';
import type { EngineDigests } from '#scripts/check-cadmpeg-engine-absence.mts';
// oxlint-disable-next-line eslint/no-restricted-imports -- Build plugin helpers live outside app aliases.
import { resolveCadmpegEngineDirectory } from '../cadmpeg-engines.vite-plugin.js';

const scriptPath = fileURLToPath(new URL('check-cadmpeg-engine-absence.mts', import.meta.url));
const uiRoot = fileURLToPath(new URL('..', import.meta.url));

const digestOf = (bytes: Uint8Array<ArrayBuffer>) => ({
  sha256: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.byteLength,
});

const engine = new TextEncoder().encode('\0asm stand-in engine for sldprt');
const gzipped = new Uint8Array(gzipSync(engine, { level: 9 }));
const digests: EngineDigests = { sldprt: { wasm: digestOf(engine), gzip: digestOf(gzipped) } };

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

const writeBuild = async (files: Readonly<Record<string, Uint8Array<ArrayBuffer> | string>>): Promise<string> => {
  root = await mkdtemp(join(tmpdir(), 'tau-engine-absence-'));
  const directory = root;
  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      await mkdir(dirname(join(directory, file)), { recursive: true });
      await writeFile(join(directory, file), contents);
    }),
  );
  return directory;
};

describe('cadmpeg engine-absence check', () => {
  it('should index both the raw and the gzip digest of every module', () => {
    const index = indexEngineDigests(digests);
    expect(index.get(engine.byteLength)?.get(digests['sldprt']!.wasm.sha256)).toBe('sldprt_bg.wasm');
    expect(index.get(gzipped.byteLength)?.get(digests['sldprt']!.gzip.sha256)).toBe('sldprt_bg.wasm.gz');
  });

  it('should find an engine by content under any name, raw or gzip', async () => {
    const directory = await writeBuild({
      'client/assets/sldprt_bg-Ab12Cd34.wasm': engine,
      'client/assets/renamed.bin': gzipped,
      'client/assets/runtime.worker-Ab12Cd34.js': 'export {};',
    });
    expect(await findEngineFiles(directory, indexEngineDigests(digests))).toEqual([
      { file: 'client/assets/renamed.bin', engine: 'sldprt_bg.wasm.gz' },
      { file: 'client/assets/sldprt_bg-Ab12Cd34.wasm', engine: 'sldprt_bg.wasm' },
    ]);
  });

  it('should pass a same-length file with other bytes', async () => {
    const other = new Uint8Array(engine);
    other[0] = 1;
    const directory = await writeBuild({ 'client/assets/other.wasm': other });
    expect(await findEngineFiles(directory, indexEngineDigests(digests))).toEqual([]);
  });

  it('should fail a missing build directory', async () => {
    const directory = await writeBuild({ 'client/index.html': '<!doctype html>' });
    expect(await checkEngineAbsence([directory, join(directory, 'absent')], indexEngineDigests(digests))).toEqual([
      `${join(directory, 'absent')}: build output is missing; run its build first`,
    ]);
  });

  it('should load the 13 modules of the installed cadmpeg-ts', async () => {
    const installed = await loadInstalledDigests(uiRoot);
    expect(Object.keys(installed)).toHaveLength(13);
    expect(installed['sldprt']?.gzip.sha256).toMatch(/^[\da-f]{64}$/u);
  });

  it('should exit 0 on a clean build and 1 naming an installed engine copied into a build', async () => {
    const directory = await writeBuild({ 'client/index.html': '<!doctype html>' });
    const clean = spawnSync(process.execPath, [scriptPath, directory], { encoding: 'utf8' });
    expect(clean.status).toBe(0);
    expect(clean.stdout).toContain('hold none of the 13 installed engines');

    // The smallest real engine (`step`, about 12.8 MB), as a bundler would emit it.
    await mkdir(join(directory, 'client/assets'), { recursive: true });
    await copyFile(
      join(resolveCadmpegEngineDirectory(uiRoot), 'step_bg.wasm'),
      join(directory, 'client/assets/step_bg-X1.wasm'),
    );
    const dirty = spawnSync(process.execPath, [scriptPath, directory], { encoding: 'utf8' });
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain(
      `${join(directory, 'client/assets/step_bg-X1.wasm')}: is the cadmpeg engine step_bg.wasm`,
    );

    const missing = spawnSync(process.execPath, [scriptPath, join(directory, 'absent')], { encoding: 'utf8' });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('build output is missing');
  });
});
