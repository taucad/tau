/**
 * Concatenates UTF-8 / binary chunks into a single ArrayBuffer-backed `Uint8Array`.
 */
export const concatUint8Arrays = (parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  let totalLength = 0;
  for (const part of parts) {
    totalLength += part.byteLength;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset);
    offset += part.byteLength;
  }

  return merged;
};
