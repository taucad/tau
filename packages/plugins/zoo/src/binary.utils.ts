/**
 * Converts a binary buffer to a UUID string.
 *
 * @param binaryData - UUID data as Uint8Array, BSON Binary, or already-formatted string.
 * @returns A string representation of the UUID in the format 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.
 */
export function binaryToUuid(
  binaryData: Uint8Array<ArrayBuffer> | { _bsontype: string; buffer: Uint8Array<ArrayBuffer> } | string,
): string {
  if (typeof binaryData === 'string') {
    return binaryData;
  }

  let buffer: Uint8Array<ArrayBuffer>;

  if ('_bsontype' in binaryData) {
    buffer = binaryData.buffer;
  } else if (binaryData.buffer instanceof Uint8Array) {
    buffer = binaryData.buffer;
  } else if (binaryData instanceof Uint8Array) {
    buffer = binaryData;
  } else {
    console.error('Invalid input type: expected BSON Binary, Buffer, or Uint8Array');
    return '';
  }

  if (buffer.length !== 16) {
    console.error('UUID must be exactly 16 bytes');
    return '';
  }

  const hexValues = [...buffer].map((byte) => byte.toString(16).padStart(2, '0'));

  return [
    hexValues.slice(0, 4).join(''),
    hexValues.slice(4, 6).join(''),
    hexValues.slice(6, 8).join(''),
    hexValues.slice(8, 10).join(''),
    hexValues.slice(10, 16).join(''),
  ].join('-');
}

/**
 * A v4 UUID from `crypto.getRandomValues`, which (unlike `crypto.randomUUID`) also exists outside secure contexts.
 *
 * @returns a random UUID string
 * @public
 */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = 0x40 + (bytes[6]! % 16);
  bytes[8] = 0x80 + (bytes[8]! % 64);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
