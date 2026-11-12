import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the package's # source alias.
import { ensureWasiSdk, ensureWasiSdkArchive, wasiSdkPins, wasiSdkUrl } from './wasi-sdk.mjs';
// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the package's # source alias.
import type { Download, WasiSdkPin, WasiSdkPins } from './wasi-sdk.mjs';

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

describe('wasi-sdk', () => {
  let work: string;
  let cacheRoot: string;
  let bytes: Uint8Array<ArrayBuffer>;
  let pin: WasiSdkPin;
  let pins: WasiSdkPins;

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'tau-wasi-sdk-'));
    cacheRoot = join(work, 'cache');
    // A stand-in release archive: one top-level directory, stripped on extraction like the real one.
    const tree = join(work, 'tree', 'wasi-sdk-0.0-test');
    await mkdir(join(tree, 'bin'), { recursive: true });
    await writeFile(join(tree, 'bin', 'clang'), 'clang\n');
    execFileSync('tar', ['-czf', join(work, 'sdk.tar.gz'), '-C', join(work, 'tree'), 'wasi-sdk-0.0-test']);
    bytes = new Uint8Array(await readFile(join(work, 'sdk.tar.gz')));
    pin = { archive: 'wasi-sdk-0.0-test.tar.gz', sha256: sha256(bytes) };
    pins = { version: '0', archives: { test: pin } };
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('should pin every host archive by a full SHA-256 under one release', () => {
    expect(Object.keys(wasiSdkPins.archives).toSorted()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64',
    ]);
    for (const archive of Object.values(wasiSdkPins.archives)) {
      expect(archive?.sha256).toMatch(/^[\da-f]{64}$/u);
      expect(archive?.archive).toMatch(new RegExp(`^wasi-sdk-${wasiSdkPins.version}\\.0-[\\w-]+\\.tar\\.gz$`, 'u'));
    }
  });

  it('should download, verify and keep the archive when none is present', async () => {
    const download = vi.fn<Download>(async () => bytes);
    expect(sha256(await ensureWasiSdkArchive({ cacheRoot, pins, pin, download }))).toBe(pin.sha256);
    expect(download).toHaveBeenCalledWith(wasiSdkUrl(pins, pin));
    expect(sha256(new Uint8Array(await readFile(join(cacheRoot, pin.archive))))).toBe(pin.sha256);
  });

  it('should reuse a kept archive whose bytes match the pin without a download', async () => {
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(join(cacheRoot, pin.archive), bytes);
    const download = vi.fn<Download>(async () => {
      throw new Error('no network');
    });
    const root = await ensureWasiSdk({ cacheRoot, pins, pin, download });
    expect(download).not.toHaveBeenCalled();
    expect(await readFile(join(root, 'bin', 'clang'), 'utf8')).toBe('clang\n');
    expect(await readFile(join(root, '.tau-wasi-sdk-sha256'), 'utf8')).toBe(`${pin.sha256}\n`);
  });

  it('should replace a kept archive that does not match the pin with a verified download', async () => {
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(join(cacheRoot, pin.archive), 'tampered');
    const download = vi.fn<Download>(async () => bytes);
    const root = await ensureWasiSdk({ cacheRoot, pins, pin, download });
    expect(download).toHaveBeenCalledOnce();
    expect(sha256(new Uint8Array(await readFile(join(cacheRoot, pin.archive))))).toBe(pin.sha256);
    expect(existsSync(join(root, 'bin', 'clang'))).toBe(true);
  });

  it('should refuse a download that does not match the pin and write nothing', async () => {
    const download = vi.fn<Download>(async () => new Uint8Array(new TextEncoder().encode('not the sdk')));
    await expect(ensureWasiSdk({ cacheRoot, pins, pin, download })).rejects.toThrow('wasi-sdk integrity mismatch');
    expect(existsSync(join(cacheRoot, pin.archive))).toBe(false);
  });

  it('should reuse an extracted tree whose marker records the pin', async () => {
    const download = vi.fn<Download>(async () => bytes);
    const root = await ensureWasiSdk({ cacheRoot, pins, pin, download });
    await rm(join(cacheRoot, pin.archive));
    expect(await ensureWasiSdk({ cacheRoot, pins, pin, download })).toBe(root);
    expect(download).toHaveBeenCalledOnce();
  });
});
