/**
 * A pack's `.idx` (version 2), held in memory as its fanout and offset tables.
 *
 * What Tau keeps per object is the id (20 bytes) and the offset (8): the
 * stored index's own tables, read once, never the pack. A lookup is a binary
 * search inside one fanout bucket; the end of an object's entry is the next
 * larger offset, so one object is one range of the pack (charter D7).
 *
 * @module
 */
/* oxlint-disable no-bitwise -- pack and index records are bit fields. */

import { bytesToHex, digest } from '#object-hash.js';

const indexMagic = 0xff_74_4f_63;
const indexVersion = 2;
const oidBytes = 20;
const fanoutBytes = 256 * 4;
const headerBytes = 8;
const largeOffsetFlag = 0x80_00_00_00;
const trailerBytes = 20;

/** One pack's index tables. */
export type PackIndex = Readonly<{
  /** Objects in the pack. */
  count: number;
  /** The pack's own SHA-1 trailer, lowercase hex: its name. */
  packChecksum: string;
  /** The smallest and the largest entry offset; both 0 for an empty pack. */
  offsetRange: readonly [smallest: number, largest: number];
  /**
   * Where one object's entry starts in the pack, or `undefined` when this pack lacks it.
   *
   * @param oid - Lowercase hex object id.
   */
  offsetOf: (oid: string) => number | undefined;
  /**
   * Where the entry starting at `offset` ends: the next entry's offset, or the
   * trailer's.
   *
   * @param offset - An entry's start, from {@link PackIndex.offsetOf}.
   * @param packSize - The pack's size in bytes.
   */
  endOf: (offset: number, packSize: number) => number;
  /** Every object id with its offset, in id order. */
  entries: () => Iterable<readonly [oid: string, offset: number]>;
}>;

const hexOf = (bytes: Uint8Array<ArrayBuffer>, start: number, length: number): string => {
  let hex = '';
  for (let index = start; index < start + length; index += 1) {
    hex += bytes[index]!.toString(16).padStart(2, '0');
  }
  return hex;
};

const bytesOfHex = (hex: string): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

/* Compare the 20-byte id at `at` in `table` with `oid`. */
const compareAt = (table: Uint8Array<ArrayBuffer>, at: number, oid: Uint8Array<ArrayBuffer>): number => {
  for (let index = 0; index < oidBytes; index += 1) {
    const difference = table[at + index]! - oid[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/**
 * Check an `.idx` against its own SHA-1 trailer, hashed by the caller's
 * compute (a worker, off the main thread) rather than here.
 *
 * @param stored - The whole index file.
 * @param sha1 - The hash to check it with.
 * @throws TypeError when the index does not match its own checksum.
 */
export const checkPackIndexChecksum = async (
  stored: Uint8Array<ArrayBuffer>,
  sha1: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>,
): Promise<void> => {
  const ownTrailer = stored.byteLength - trailerBytes;
  if (ownTrailer < 0 || (await sha1(stored.subarray(0, ownTrailer))) !== hexOf(stored, ownTrailer, trailerBytes)) {
    throw new TypeError('A pack index does not match its own checksum.');
  }
};

/** How {@link readPackIndex} reads. */
export type PackIndexReading = Readonly<{
  /** The caller already checked the SHA-1 trailer ({@link checkPackIndexChecksum}): it is not hashed again. */
  checksumChecked?: boolean;
}>;

/**
 * Read a version-2 `.idx` into its lookup tables, checking it whole first: its
 * SHA-1 trailer (unless the caller checked it), its size against its own
 * object count, a fanout that never decreases, ids in strictly ascending order
 * and every large offset in range.
 *
 * @param stored - The whole index file.
 * @param reading - Whether the checksum is already checked.
 * @returns The tables.
 * @throws TypeError when the bytes are not a whole, consistent version-2 index.
 */
export const readPackIndex = (stored: Uint8Array<ArrayBuffer>, reading: PackIndexReading = {}): PackIndex => {
  const view = new DataView(stored.buffer, stored.byteOffset, stored.byteLength);
  if (stored.byteLength < headerBytes + fanoutBytes + 2 * trailerBytes || view.getUint32(0) !== indexMagic) {
    throw new TypeError('Not a version 2 pack index.');
  }
  if (view.getUint32(4) !== indexVersion) {
    throw new TypeError('Only version 2 pack indexes are read.');
  }
  const ownTrailer = stored.byteLength - trailerBytes;
  if (
    reading.checksumChecked !== true &&
    bytesToHex(digest('sha1', stored.subarray(0, ownTrailer))) !== hexOf(stored, ownTrailer, trailerBytes)
  ) {
    throw new TypeError('A pack index does not match its own checksum.');
  }
  const fanout = new Uint32Array(256);
  for (let bucket = 0; bucket < 256; bucket += 1) {
    fanout[bucket] = view.getUint32(headerBytes + bucket * 4);
    if (bucket > 0 && fanout[bucket]! < fanout[bucket - 1]!) {
      throw new TypeError('A pack index has a fanout table that decreases.');
    }
  }
  const count = fanout[255]!;
  const oidsStart = headerBytes + fanoutBytes;
  const crcStart = oidsStart + count * oidBytes;
  const offsetsStart = crcStart + count * 4;
  const largeStart = offsetsStart + count * 4;
  /* Whatever lies between the offsets and the trailers is the large-offset table, eight bytes an entry. */
  const largeBytes = stored.byteLength - 2 * trailerBytes - largeStart;
  if (largeBytes < 0 || largeBytes % 8 !== 0 || largeBytes / 8 > Math.max(count - 1, 0)) {
    throw new TypeError('A pack index is not the size its object count gives.');
  }
  for (let index = 1; index < count; index += 1) {
    if (compareAt(stored, oidsStart + index * oidBytes, stored.subarray(oidsStart + (index - 1) * oidBytes)) <= 0) {
      throw new TypeError('A pack index lists its object ids out of order.');
    }
  }
  /* Copies, so the file's buffer is not kept alive past the tables. */
  const oids = stored.slice(oidsStart, crcStart);
  const offsets = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const small = view.getUint32(offsetsStart + index * 4);
    if ((small & largeOffsetFlag) === 0) {
      offsets[index] = small;
    } else {
      const large = small & ~largeOffsetFlag;
      if (large >= largeBytes / 8) {
        throw new TypeError('A pack index names a large offset it does not hold.');
      }
      offsets[index] = Number(view.getBigUint64(largeStart + large * 8));
    }
  }
  const sorted = Float64Array.from(offsets).sort();
  const packChecksum = hexOf(stored, stored.byteLength - 2 * trailerBytes, trailerBytes);
  return Object.freeze({
    count,
    packChecksum,
    offsetRange: count === 0 ? ([0, 0] as const) : ([sorted[0]!, sorted[count - 1]!] as const),
    offsetOf: (oid: string): number | undefined => {
      const wanted = bytesOfHex(oid);
      const bucket = wanted[0]!;
      let low = bucket === 0 ? 0 : fanout[bucket - 1]!;
      let high = fanout[bucket]! - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const order = compareAt(oids, middle * oidBytes, wanted);
        if (order === 0) {
          return offsets[middle]!;
        }
        if (order < 0) {
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      return undefined;
    },
    endOf: (offset: number, packSize: number): number => {
      let low = 0;
      let high = sorted.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (sorted[middle]! <= offset) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      return low < sorted.length ? sorted[low]! : packSize - trailerBytes;
    },
    *entries(): Iterable<readonly [string, number]> {
      for (let index = 0; index < count; index += 1) {
        yield [hexOf(oids, index * oidBytes, oidBytes), offsets[index]!] as const;
      }
    },
  });
};

/** One entry of a pack being indexed. */
export type PackIndexEntry = Readonly<{ oid: string; offset: number; crc32: number }>;

/**
 * Encode a version-2 `.idx` for a pack Tau wrote.
 *
 * @param entries - Every object of the pack, any order.
 * @param packChecksum - The pack's SHA-1 trailer, hex.
 * @param sha1 - The hasher for the index's own trailer.
 * @returns The index file's bytes.
 */
export const encodePackIndex = async (
  entries: readonly PackIndexEntry[],
  packChecksum: string,
  sha1: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const ordered = entries.toSorted((left, right) => (left.oid < right.oid ? -1 : left.oid > right.oid ? 1 : 0));
  const large = ordered.filter((entry) => entry.offset >= largeOffsetFlag);
  const count = ordered.length;
  const size = headerBytes + fanoutBytes + count * (oidBytes + 8) + large.length * 8 + 2 * trailerBytes;
  const encoded = new Uint8Array(size);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, indexMagic);
  view.setUint32(4, indexVersion);
  const counts = new Uint32Array(256);
  for (const entry of ordered) {
    counts[Number.parseInt(entry.oid.slice(0, 2), 16)]! += 1;
  }
  let running = 0;
  for (let bucket = 0; bucket < 256; bucket += 1) {
    running += counts[bucket]!;
    view.setUint32(headerBytes + bucket * 4, running);
  }
  const oidsStart = headerBytes + fanoutBytes;
  const crcStart = oidsStart + count * oidBytes;
  const offsetsStart = crcStart + count * 4;
  const largeStart = offsetsStart + count * 4;
  let largeIndex = 0;
  for (const [index, entry] of ordered.entries()) {
    encoded.set(bytesOfHex(entry.oid), oidsStart + index * oidBytes);
    view.setUint32(crcStart + index * 4, entry.crc32 >>> 0);
    if (entry.offset >= largeOffsetFlag) {
      view.setUint32(offsetsStart + index * 4, (largeOffsetFlag | largeIndex) >>> 0);
      view.setBigUint64(largeStart + largeIndex * 8, BigInt(entry.offset));
      largeIndex += 1;
    } else {
      view.setUint32(offsetsStart + index * 4, entry.offset);
    }
  }
  const trailerStart = size - 2 * trailerBytes;
  encoded.set(bytesOfHex(packChecksum), trailerStart);
  encoded.set(bytesOfHex(await sha1(encoded.subarray(0, trailerStart + trailerBytes))), trailerStart + trailerBytes);
  return encoded;
};
