/* eslint-disable @typescript-eslint/naming-convention -- FNV-1a constants use conventional UPPER_SNAKE names */

/** FNV-1a 64-bit offset basis (0xcbf29ce484222325). */
const FNV1A_64_OFFSET = 0xcb_f2_9c_e4_84_22_23_25n;
/** FNV-1a 64-bit prime (0x100000001b3). */
const FNV1A_64_PRIME = 0x00_00_01_00_00_00_01_b3n;
/** 64-bit wrap-around mask — FNV-1a is defined mod 2^64. */
const FNV1A_64_MASK = 0xff_ff_ff_ff_ff_ff_ff_ffn;
/** Lower-32-bit lane mask. */
const LANE_MASK = 0xff_ff_ff_ffn;

const textEncoder = new TextEncoder();

/**
 * FNV-1a 64-bit hash of `input`, split into two unsigned 32-bit lanes for
 * {@link Atomics}-backed storage in the shared arena index.
 *
 * Hashes the UTF-8 byte encoding of `input`, matching the canonical FNV-1a
 * specification and its published reference vectors
 * (http://www.isthe.com/chongo/tech/comp/fnv/). Writer and reader threads
 * compute this independently and must agree bit-for-bit, so it is fully
 * deterministic.
 *
 * @internal
 * @param input - String key to hash (typically a file path).
 * @returns `[hi, lo]` — the upper and lower 32 bits as unsigned integers.
 */
export function fnv1a64(input: string): [hi: number, lo: number] {
  // oxlint-disable no-bitwise -- FNV-1a is defined in terms of XOR, multiply, and masking
  let hash = FNV1A_64_OFFSET;
  for (const byte of textEncoder.encode(input)) {
    hash = ((hash ^ BigInt(byte)) * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  const lanes: [hi: number, lo: number] = [Number(hash >> 32n), Number(hash & LANE_MASK)];
  // oxlint-enable no-bitwise
  return lanes;
}
