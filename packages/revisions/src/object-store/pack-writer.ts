/**
 * Write a pack, and its index, from objects Tau's reader resolved.
 *
 * Undeltified on purpose: a push's pack and a repack's are bounded (the
 * compute worker's 64 MiB ceiling), and every object in them is one inflate
 * away in the reader, so the codec stays the format and nothing more. Objects
 * are deflated as they are added: a pack in progress holds compressed entries,
 * never the raw objects behind them.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- pack and index records are bit fields. */

import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { encodePackIndex } from '#pack-reader/pack-index.js';
import type { PackIndexEntry } from '#pack-reader/pack-index.js';
import type { GitObjectKind } from '#pack-reader/pack-reader.js';

const typeCodes: Readonly<Record<GitObjectKind, number>> = { commit: 1, tree: 2, blob: 3, tag: 4 };

/*
 * CRC-32 tables for eight bytes a step ("slicing by 8"): table `k` holds the
 * CRC of a byte followed by `k` zero bytes, so eight lookups fold eight bytes
 * at once. All eight in one array, 8 KiB, the first of them the classic table.
 */
const crcTables = (() => {
  const tables = new Uint32Array(8 * 256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
    }
    tables[index] = value >>> 0;
  }
  for (let index = 0; index < 256; index += 1) {
    for (let table = 1; table < 8; table += 1) {
      const previous = tables[(table - 1) * 256 + index]!;
      tables[table * 256 + index] = (previous >>> 8) ^ tables[previous & 0xff]!;
    }
  }
  return tables;
})();

/**
 * CRC-32 (the zlib and pack-index polynomial) of a run of byte arrays, as a
 * pack index records it per entry: eight bytes a step, the tail one at a time.
 *
 * @param parts - The entry's bytes, in order.
 * @returns The checksum, unsigned.
 */
export const crc32 = (...parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): number => {
  const t = crcTables;
  let crc = 0xff_ff_ff_ff;
  for (const part of parts) {
    const length = part.byteLength;
    let at = 0;
    for (const end = length - 7; at < end; at += 8) {
      const low = crc ^ (part[at]! | (part[at + 1]! << 8) | (part[at + 2]! << 16) | (part[at + 3]! << 24));
      crc =
        t[7 * 256 + (low & 0xff)]! ^
        t[6 * 256 + ((low >>> 8) & 0xff)]! ^
        t[5 * 256 + ((low >>> 16) & 0xff)]! ^
        t[4 * 256 + (low >>> 24)]! ^
        t[3 * 256 + part[at + 4]!]! ^
        t[2 * 256 + part[at + 5]!]! ^
        t[256 + part[at + 6]!]! ^
        t[part[at + 7]!]!;
    }
    for (; at < length; at += 1) {
      crc = t[(crc ^ part[at]!) & 0xff]! ^ (crc >>> 8);
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

/** A pack being written: each object is deflated as it is added and only its compressed entry kept. */
export type PackBuilder = Readonly<{
  /**
   * Deflate one object into the pack; its raw bytes are not kept.
   *
   * @param object - The object.
   */
  add: (object: PackObject) => Promise<void>;
  /**
   * Add one object whose body is already deflated (a whole entry of another pack), copied verbatim.
   *
   * @param object - The object, its raw size and its deflated body.
   */
  addCompressed: (
    object: Readonly<{ oid: string; type: GitObjectKind; size: number; compressed: Uint8Array<ArrayBuffer> }>,
  ) => void;
  /** Objects added so far. */
  count: () => number;
  /** Forget the objects added after the first `count`: a set that did not fit is dropped whole. */
  truncate: (count: number) => void;
  /**
   * Close the pack: its header, its entries and its SHA-1 trailer.
   *
   * @returns The pack's bytes, trailer and per-entry offsets and CRCs.
   */
  finish: () => Promise<BuiltPack>;
}>;

/**
 * Start one version-2 pack, undeltified.
 *
 * @param compute - Deflate and SHA-1.
 * @returns The builder.
 */
export const createPackBuilder = (compute: ComputeWorker): PackBuilder => {
  const parts: Array<readonly [head: Uint8Array<ArrayBuffer>, body: Uint8Array<ArrayBuffer>, oid: string]> = [];
  const addCompressed: PackBuilder['addCompressed'] = (object) => {
    parts.push([entryHeader(object.type, object.size), object.compressed, object.oid]);
  };
  return Object.freeze({
    add: async (object: PackObject): Promise<void> => {
      const compressed = await compute.deflate(object.data);
      addCompressed({ oid: object.oid, type: object.type, size: object.data.byteLength, compressed });
    },
    addCompressed,
    count: () => parts.length,
    truncate: (count: number) => {
      parts.length = Math.min(parts.length, count);
    },
    finish: async (): Promise<BuiltPack> => {
      const entries: PackIndexEntry[] = [];
      let offset = 12;
      for (const [head, body, oid] of parts) {
        entries.push({ oid, offset, crc32: crc32(head, body) });
        offset += head.byteLength + body.byteLength;
      }
      const pack = new Uint8Array(offset + 20);
      const view = new DataView(pack.buffer);
      pack.set([0x50, 0x41, 0x43, 0x4b]);
      view.setUint32(4, 2);
      view.setUint32(8, parts.length);
      let at = 12;
      for (const [head, body] of parts) {
        pack.set(head, at);
        pack.set(body, at + head.byteLength);
        at += head.byteLength + body.byteLength;
      }
      const checksum = await compute.sha1(pack.subarray(0, offset));
      for (let index = 0; index < 20; index += 1) {
        pack[offset + index] = Number.parseInt(checksum.slice(index * 2, index * 2 + 2), 16);
      }
      return Object.freeze({ pack, checksum, entries });
    },
  });
};

/**
 * Build one version-2 pack, each object deflated in turn.
 *
 * @param objects - The objects, in the order to write them.
 * @param compute - Deflate and SHA-1.
 * @returns The pack's bytes, trailer and per-entry offsets and CRCs.
 */
export const buildPack = async (objects: readonly PackObject[], compute: ComputeWorker): Promise<BuiltPack> => {
  const builder = createPackBuilder(compute);
  for (const object of objects) {
    // oxlint-disable-next-line no-await-in-loop -- one object deflated at a time.
    await builder.add(object);
  }
  return builder.finish();
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
