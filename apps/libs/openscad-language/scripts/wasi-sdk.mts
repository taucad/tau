/**
 * Purpose: Acquire the pinned wasi-sdk the OpenSCAD language server's parser is compiled with, from a verified local
 *   archive when one is present and from its GitHub release otherwise.
 * Why: CI restores the archive from the Actions cache, so a run asks GitHub Releases for it only when the pin changes
 *   (Brain research/ci-flake-classes.md, class 1). Every use re-hashes the archive against its pin, so a restored or
 *   stale archive is never extracted unverified.
 * Environment: Node 24+, `tar`, and network access to github.com when the archive is absent.
 * Usage: imported by prepare-openscad-language-server.mts; the pins live in wasi-sdk.json beside this file.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { fetchVerified, integrityFromHex, unattendedFetchRetry } from '@taucad/archive-core';

/** One host's pinned wasi-sdk release archive. */
export type WasiSdkPin = { readonly archive: string; readonly sha256: string };

/** The pins: one wasi-sdk release, one archive per host (`<platform>-<arch>`). */
export type WasiSdkPins = {
  readonly version: string;
  readonly archives: Readonly<Partial<Record<string, WasiSdkPin>>>;
};

export const wasiSdkPins = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'wasi-sdk.json'), 'utf8'),
) as WasiSdkPins;

/** Download a URL's bytes that must match an SRI pin; the default is {@link downloadWithRetry}. */
export type Download = (url: string, integrity: string) => Promise<Uint8Array<ArrayBuffer>>;

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Fetch a release asset through Tau's shared verified download, on its unattended retry schedule: a transport error
 * (a failed name resolution included), a 429 or a 5xx is retried for about two minutes; a 4xx is final.
 */
export const downloadWithRetry: Download = async (url, integrity) =>
  fetchVerified({ url, integrity, retry: unattendedFetchRetry, signal: AbortSignal.timeout(30 * 60 * 1000) });

/** The GitHub release URL of a pinned archive. */
export const wasiSdkUrl = (pins: WasiSdkPins, pin: WasiSdkPin): string =>
  `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${pins.version}/${pin.archive}`;

/**
 * The verified bytes of the pinned archive, kept at `cacheRoot/<archive>`: an archive already there is used when its
 * bytes hash to the pin, and is otherwise replaced by a download that must hash to the pin before it is written.
 */
export const ensureWasiSdkArchive = async (options: {
  readonly cacheRoot: string;
  readonly pins: WasiSdkPins;
  readonly pin: WasiSdkPin;
  readonly download?: Download;
}): Promise<Uint8Array<ArrayBuffer>> => {
  const { cacheRoot, pins, pin, download = downloadWithRetry } = options;
  const archive = resolve(cacheRoot, pin.archive);
  if (await exists(archive)) {
    const kept = new Uint8Array(await readFile(archive));
    if (sha256(kept) === pin.sha256) {
      return kept;
    }
    console.log(`Replacing ${pin.archive}: its bytes do not match the pin`);
  }
  console.log(`Downloading ${pin.archive}`);
  const bytes = await download(wasiSdkUrl(pins, pin), integrityFromHex('sha256', pin.sha256));
  if (sha256(bytes) !== pin.sha256) {
    throw new Error('wasi-sdk integrity mismatch');
  }
  await mkdir(cacheRoot, { recursive: true });
  const temporary = `${archive}.${String(process.pid)}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, archive);
  return bytes;
};

/**
 * The root of the extracted pinned wasi-sdk under `cacheRoot`. A tree whose marker records the pin is reused;
 * otherwise the verified archive bytes ({@link ensureWasiSdkArchive}) are extracted, the archive kept beside the tree so
 * the next extraction (or a CI cache of the archive alone) needs no download. `tar` reads the bytes that were hashed,
 * not the file again.
 */
export const ensureWasiSdk = async (options: {
  readonly cacheRoot: string;
  readonly pins: WasiSdkPins;
  readonly pin: WasiSdkPin;
  readonly download?: Download;
}): Promise<string> => {
  const { cacheRoot, pin } = options;
  const root = resolve(cacheRoot, pin.archive.replace(/\.tar\.gz$/u, ''));
  const marker = resolve(root, '.tau-wasi-sdk-sha256');
  const recorded = (await exists(marker)) ? await readFile(marker, 'utf8') : undefined;
  if (recorded?.trim() === pin.sha256) {
    return root;
  }
  const bytes = await ensureWasiSdkArchive(options);
  const temporary = `${root}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', '-', '-C', temporary, '--strip-components=1'], {
    input: bytes,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  await writeFile(resolve(temporary, '.tau-wasi-sdk-sha256'), `${pin.sha256}\n`);
  await rm(root, { recursive: true, force: true });
  await rename(temporary, root);
  return root;
};
