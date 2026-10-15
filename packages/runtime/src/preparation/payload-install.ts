import { ArchiveError, gunzip, readTarEntries, readWheel, readZipEntries } from '@taucad/archive-core';
import type { ArchiveEntry, ArchiveLimits, ReadArchiveOptions } from '@taucad/archive-core';
import { writeArchiveEntries } from '@taucad/archive-core/node';

import { PreparationError } from '#preparation/preparation-error.js';
import { wheelDataDestination } from '#preparation/plugin-deployment.js';
import type { DependencyPayload, ReceiptFile } from '#preparation/preparation.types.js';

/** Unpacked bytes assumed for a payload that declares none: four times its compressed size, at least 1 MiB. */
export const defaultUnpackRatio = 4;
const minimumUnpackedBytes = 1024 * 1024;
const maximumEntries = 200_000;
const rawFileMode = 0o644;

/**
 * Bytes a payload may unpack to: its declared `unpackedByteLength`, else four times its size (at least 1 MiB).
 * @internal
 * @param payload - A manifest payload.
 * @returns The cap. Bytes.
 */
export const unpackedBytesOf = (payload: DependencyPayload): number =>
  payload.unpackedByteLength ?? Math.max(payload.byteLength * defaultUnpackRatio, minimumUnpackedBytes);

// A tar stream is its files plus a 512-byte header and up to 511 bytes of padding per entry: allow a quarter more
// than the files themselves, and 1 MiB, before calling the gzip layer a bomb.
const tarStreamBytesOf = (unpacked: number): number => unpacked + Math.ceil(unpacked / 4) + minimumUnpackedBytes;

const refusal = (payload: DependencyPayload, error: unknown): PreparationError => {
  const detail = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof ArchiveError && error.code === 'INTEGRITY_MISMATCH' ? 'INTEGRITY_MISMATCH' : 'EXTRACTION_REFUSED';
  return new PreparationError(
    code,
    `Payload ${payload.name} (${payload.format}) was refused while unpacking: ${detail} Nothing was sealed; the pinned archive is malformed or hostile, report it to the plugin's publisher.`,
    { cause: error },
  );
};

const entriesOf = async (
  payload: DependencyPayload,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ReadonlyArray<{ readonly destination: string; readonly entries: readonly ArchiveEntry[] }>> => {
  const limits: ArchiveLimits = { maximumUnpackedBytes: unpackedBytesOf(payload), maximumEntries };
  const options: ReadArchiveOptions = { ...limits, stripComponents: payload.stripComponents ?? 0, links: 'contained' };
  switch (payload.format) {
    case 'raw': {
      return [{ destination: payload.destination, entries: [{ path: payload.name, bytes, mode: rawFileMode }] }];
    }
    case 'tar.gz': {
      const tar = await gunzip(bytes, {
        ...limits,
        maximumUnpackedBytes: tarStreamBytesOf(limits.maximumUnpackedBytes),
      });
      return [{ destination: payload.destination, entries: readTarEntries(tar, options).entries }];
    }
    case 'zip': {
      const { entries } = await readZipEntries(bytes, options);
      return [{ destination: payload.destination, entries }];
    }
    case 'wheel': {
      const wheel = await readWheel(bytes, limits);
      return [
        { destination: payload.destination, entries: wheel.entries },
        { destination: wheelDataDestination(payload.destination), entries: wheel.data },
      ];
    }
  }
};

/**
 * Unpack verified payload bytes below a staged closure root, hashing every file as it is written. A raw payload is
 * written as `<destination>/<name>`; a wheel's `data` scheme lands under its interpreter prefix. Files are created
 * exclusively, so two payloads naming one path, or a payload naming the closure's `receipt.json`, are refused.
 * @internal
 * @param input - The payload, its verified bytes, the staged root and a signal.
 * @returns The receipt rows of the written files, each naming the payload.
 * @throws {PreparationError} `EXTRACTION_REFUSED` for a hostile, malformed or unsupported archive;
 * `INTEGRITY_MISMATCH` when a wheel member disagrees with its `RECORD`.
 */
export const unpackPayload = async (input: {
  readonly payload: DependencyPayload;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly root: string;
  readonly signal: AbortSignal;
}): Promise<ReceiptFile[]> => {
  const { payload, root, signal } = input;
  try {
    const groups = await entriesOf(payload, input.bytes);
    const rows: ReceiptFile[] = [];
    for (const { destination, entries } of groups) {
      if (entries.length === 0) {
        continue;
      }
      signal.throwIfAborted();
      const prefix = destination === '.' ? '' : `${destination}/`;
      if (entries.some((entry) => `${prefix}${entry.path}` === 'receipt.json')) {
        throw new ArchiveError(
          'EXTRACTION_REFUSED',
          "'receipt.json' at the closure root is the seal; no payload may write it.",
          {
            reason: 'unsafe-path',
            path: 'receipt.json',
          },
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- a wheel's data scheme is written after its site-packages files
      const written = await writeArchiveEntries({ root, destination, entries, signal });
      rows.push(...written.map((row) => ({ ...row, payload: payload.name })));
    }
    return rows;
  } catch (error) {
    signal.throwIfAborted();
    throw refusal(payload, error);
  }
};
