/* oxlint-disable no-bitwise -- the zip CRC is bit arithmetic. */
/**
 * The zip CRC-32, whole or folded a chunk at a time.
 *
 * @module
 */

let crcTable: Uint32Array | undefined;
const table = (): Uint32Array => {
  if (crcTable === undefined) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) === 0 ? value >>> 1 : 0xed_b8_83_20 ^ (value >>> 1);
      }
      crcTable[index] = value >>> 0;
    }
  }
  return crcTable;
};

/**
 * Fold more bytes into a running CRC-32. Start from `0`; the result of each
 * call is the CRC of every byte folded so far.
 *
 * @param crc - The CRC of the bytes before these (`0` for none).
 * @param bytes - The next bytes.
 * @returns The CRC of all of them.
 * @public
 */
export const crc32Update = (crc: number, bytes: Uint8Array<ArrayBuffer>): number => {
  const lookup = table();
  let running = (crc ^ 0xff_ff_ff_ff) >>> 0;
  for (const byte of bytes) {
    running = lookup[(running ^ byte) & 0xff]! ^ (running >>> 8);
  }
  return (running ^ 0xff_ff_ff_ff) >>> 0;
};

/**
 * The zip CRC-32 of some bytes.
 *
 * @param bytes - The bytes.
 * @returns The unsigned CRC.
 * @public
 */
export const crc32 = (bytes: Uint8Array<ArrayBuffer>): number => crc32Update(0, bytes);
