import type { Binary as BSONBinary } from 'bson';

/**
 * Converts a binary buffer to a UUID string.
 *
 * @param buffer - The binary buffer containing the UUID bytes.
 * @returns A string representation of the UUID in the format 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'.
 */
export function binaryToUuid(binaryData: Uint8Array | BSONBinary | string): string {
  if (typeof binaryData === 'string') {
    return binaryData;
  }

  let buffer: Uint8Array;

  // Handle MongoDB BSON Binary object
  if ('_bsontype' in binaryData) {
    // Extract the buffer from the BSON Binary object
    buffer = binaryData.buffer;
  }
  // Handle case where buffer property exists (some MongoDB drivers structure)
  else if (binaryData.buffer instanceof Uint8Array) {
    buffer = binaryData.buffer;
  }
  // Handle direct Buffer or Uint8Array
  else if (binaryData instanceof Uint8Array) {
    buffer = binaryData;
  } else {
    console.error('Invalid input type: expected MongoDB BSON Binary, Buffer, or Uint8Array');
    return '';
  }

  // Ensure we have exactly 16 bytes (128 bits) for a UUID
  if (buffer.length !== 16) {
    // For debugging
    console.log('Buffer length:', buffer.length);
    console.log('Buffer content:', [...buffer]);
    console.error('UUID must be exactly 16 bytes');
    return '';
  }

  // Convert each byte to a hex string and pad with zeros if needed
  const hexValues = [...buffer].map((byte) => byte.toString(16).padStart(2, '0'));

  // Format into UUID structure (8-4-4-4-12 characters)
  return [
    hexValues.slice(0, 4).join(''),
    hexValues.slice(4, 6).join(''),
    hexValues.slice(6, 8).join(''),
    hexValues.slice(8, 10).join(''),
    hexValues.slice(10, 16).join(''),
  ].join('-');
}
