/**
 * Spike S8/S9 helper: read the build123d lock and the central directories of its pinned wheels
 * through PyPI metadata and HTTP range requests. Bytes are parsed as data; nothing is unpacked.
 */

/* oxlint-disable no-restricted-imports -- spike modules sit outside scripts/src, so the #* import map cannot name them. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findEndOfCentralDirectory, parseCentralDirectory } from './read-wheel.ts';
import type { CentralEntry, EndOfCentralDirectory } from './read-wheel.ts';

/** One `name==version` pin with its allowed sha256 digests. */
export type LockedPackage = { name: string; version: string; hashes: Set<string> };
/** One PyPI file record. */
export type PypiFile = {
  filename: string;
  size: number;
  url: string;
  packagetype: string;
  digests: { sha256: string };
};

const lockPath = resolve(import.meta.dirname, '../../../../../packages/plugins/build123d/python/requirements.lock');

/**
 * Reads every pinned package from the uv-generated lock.
 *
 * @returns The pins with their hashes.
 */
export const lockedPackages = (): LockedPackage[] => {
  const lock = readFileSync(lockPath, 'utf8');
  return [
    ...lock.matchAll(/^([A-Za-z0-9_.-]+)==(\S+)(?: ;[^\\\n]*)? \\\n((?:\s+--hash=sha256:[0-9a-f]{64}(?: \\)?\n)+)/gmu),
  ].map((match) => ({
    name: match[1] ?? '',
    version: match[2] ?? '',
    hashes: new Set([...(match[3] ?? '').matchAll(/sha256:([0-9a-f]{64})/gu)].map((hash) => hash[1] ?? '')),
  }));
};

/**
 * Picks the locked wheel for one platform from PyPI's file list.
 *
 * @param item - The pin.
 * @param accepts - Filename filter for the platform.
 * @param preferences - Ordered filename preferences.
 * @returns The chosen file, if any locked wheel matches.
 */
export const selectWheel = async (
  item: LockedPackage,
  accepts: (filename: string) => boolean,
  preferences: readonly RegExp[],
): Promise<PypiFile | undefined> => {
  const response = await fetch(`https://pypi.org/pypi/${item.name}/${item.version}/json`, {
    signal: AbortSignal.timeout(30_000),
  });
  const metadata = (await response.json()) as { urls: PypiFile[] };
  const candidates = metadata.urls.filter(
    (file) => file.packagetype === 'bdist_wheel' && item.hashes.has(file.digests.sha256) && accepts(file.filename),
  );
  for (const preference of preferences) {
    const preferred = candidates.find((file) => preference.test(file.filename));
    if (preferred) {
      return preferred;
    }
  }
  return candidates[0];
};

const range = async (url: string, header: string): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetch(url, { headers: { range: header }, signal: AbortSignal.timeout(60_000) });
  if (response.status !== 206) {
    throw new Error(`Expected 206 for ${url} (${header}), got ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Reads one wheel's central directory with at most two range requests.
 *
 * @param file - The PyPI file.
 * @returns The end record and the central entries.
 */
export const readCentralDirectory = async (
  file: PypiFile,
): Promise<{ end: EndOfCentralDirectory; entries: CentralEntry[] }> => {
  let tail = await range(file.url, `bytes=-${String(Math.min(file.size, 1_048_576))}`);
  let base = file.size - tail.byteLength;
  const end = findEndOfCentralDirectory(tail, base);
  if (end.start < base) {
    tail = await range(file.url, `bytes=${String(end.start)}-${String(file.size - 1)}`);
    base = end.start;
  }
  return { end, entries: parseCentralDirectory(tail, end, base) };
};
