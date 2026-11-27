/**
 * Byte encoding/decoding utilities for LSP message handling.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBytes(input: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(input);
}

export function decodeBytes(input: Uint8Array<ArrayBuffer>): string {
  return decoder.decode(input);
}

export function appendBytes<T extends { length: number; set(array: T, offset: number): void }>(
  constructor: new (length: number) => T,
  ...arrays: T[]
): T {
  let totalLength = 0;
  for (const array of arrays) {
    totalLength += array.length;
  }

  // oxlint-disable-next-line new-cap -- constructor is a runtime-resolved typed array class
  const result = new constructor(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}
