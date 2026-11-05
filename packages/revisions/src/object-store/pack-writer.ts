/**
 * Write a pack, and its index, from objects Tau's reader resolved.
 *
 * Undeltified on purpose: a push's pack and a repack's are bounded (the
 * compute worker's 64 MiB ceiling), and every object in them is one inflate
 * away in the reader, so the codec stays the format and nothing more.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- pack and index records are bit fields. */

import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { encodePackIndex } from '#pack-reader/pack-index.js';
import type { PackIndexEntry } from '#pack-reader/pack-index.js';
import type { GitObjectKind } from '#pack-reader/pack-reader.js';

const typeCodes: Readonly<Record<GitObjectKind, number>> = { commit: 1, tree: 2, blob: 3, tag: 4 };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

/**
 * CRC-32 of a run of byte arrays, as a pack index records it per entry.
 *
 * @param parts - The entry's bytes, in order.
 * @returns The checksum, unsigned.
 */
const crc32 = (...parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): number => {
  let crc = 0xff_ff_ff_ff;
  for (const part of parts) {
    for (const byte of part) {
      crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
};

/* An entry's type-and-size header. */
const entryHeader = (type: GitObjectKind, size: number): Uint8Array<ArrayBuffer> => {
  const bytes: number[] = [];
  let rest = Math.floor(size / 16);
  let byte = (typeCodes[type] << 4) | (size & 0x0f);
  while (rest > 0) {
    bytes.push(byte | 0x80);
    byte = rest & 0x7f;
    rest = Math.floor(rest / 128);
  }
  bytes.push(byte);
  return Uint8Array.from(bytes);
};

/** One object for a pack. */
export type PackObject = Readonly<{ oid: string; type: GitObjectKind; data: Uint8Array<ArrayBuffer> }>;

/** A written pack, with what its index needs. */
export type BuiltPack = Readonly<{
  pack: Uint8Array<ArrayBuffer>;
  /** The pack's trailer, hex: its name. */
  checksum: string;
  entries: readonly PackIndexEntry[];
}>;

/**
 * Build one version-2 pack.
 *
 * @param objects - The objects, in the order to write them.
 * @param compute - Deflate and SHA-1.
 * @returns The pack's bytes, trailer and per-entry offsets and CRCs.
 */
export const buildPack = async (objects: readonly PackObject[], compute: ComputeWorker): Promise<BuiltPack> => {
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  header.set([0x50, 0x41, 0x43, 0x4b]);
  view.setUint32(4, 2);
  view.setUint32(8, objects.length);
  const parts: Array<Uint8Array<ArrayBuffer>> = [header];
  const entries: PackIndexEntry[] = [];
  let offset = header.byteLength;
  const compressed = await Promise.all(objects.map(async (object) => compute.deflate(object.data)));
  for (const [index, object] of objects.entries()) {
    const head = entryHeader(object.type, object.data.byteLength);
    const body = compressed[index]!;
    entries.push({ oid: object.oid, offset, crc32: crc32(head, body) });
    parts.push(head, body);
    offset += head.byteLength + body.byteLength;
  }
  const pack = new Uint8Array(offset + 20);
  let at = 0;
  for (const part of parts) {
    pack.set(part, at);
    at += part.byteLength;
  }
  const checksum = await compute.sha1(pack.subarray(0, offset));
  for (let index = 0; index < 20; index += 1) {
    pack[offset + index] = Number.parseInt(checksum.slice(index * 2, index * 2 + 2), 16);
  }
  return Object.freeze({ pack, checksum, entries });
};

/**
 * The index for a pack {@link buildPack} wrote.
 *
 * @param built - The pack, its trailer and its entries.
 * @param compute - SHA-1 for the index trailer.
 * @returns The `.idx` bytes.
 */
export const indexBuiltPack = async (built: BuiltPack, compute: ComputeWorker): Promise<Uint8Array<ArrayBuffer>> =>
  encodePackIndex(built.entries, built.checksum, compute.sha1);
