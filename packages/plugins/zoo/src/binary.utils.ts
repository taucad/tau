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
