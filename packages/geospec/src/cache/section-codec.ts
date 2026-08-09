/**
 * Binary evidence-payload layout shared by typed-array-heavy families
 * (`mesh-record` R3, `occurrence-mesh` R4): a JSON header plus 8-byte-aligned
 * binary sections, so multi-hundred-MB geometry never round-trips through
 * JSON number parsing.
 *
 * Layout (all little-endian):
 * `u32 headerByteLength | u32 sectionCount | u32 sectionByteLength × count |
 *  header utf8 | pad→8 | section₀ | pad→8 | section₁ | …`
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const align8 = (offset: number): number => Math.ceil(offset / 8) * 8;

/** Encode a JSON header plus binary sections into one payload. */
export const encodeSectionedPayload = (
  header: unknown,
  sections: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Uint8Array<ArrayBuffer> => {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const prefixLength = 4 + 4 + 4 * sections.length;
  let total = align8(prefixLength + headerBytes.byteLength);
  for (const section of sections) {
    total = align8(total + section.byteLength);
  }
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, headerBytes.byteLength, true);
  view.setUint32(4, sections.length, true);
  for (const [index, section] of sections.entries()) {
    view.setUint32(8 + 4 * index, section.byteLength, true);
  }
  out.set(headerBytes, prefixLength);
  let offset = align8(prefixLength + headerBytes.byteLength);
  for (const section of sections) {
    out.set(section, offset);
    offset = align8(offset + section.byteLength);
  }
  return out;
};

/** Decoded sectioned payload: parsed header + 8-aligned section views. */
export type SectionedPayload = {
  header: unknown;
  sections: Array<Uint8Array<ArrayBuffer>>;
};

/**
 * Decode a sectioned payload. Sections are views into the input when it is
 * 8-aligned (the store returns fresh zero-offset buffers) and copies
 * otherwise, so typed-array views over them are always constructible.
 */
export const decodeSectionedPayload = (bytes: Uint8Array<ArrayBuffer>): SectionedPayload => {
  const aligned = bytes.byteOffset % 8 === 0 ? bytes : new Uint8Array(bytes);
  const view = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength);
  const headerByteLength = view.getUint32(0, true);
  const sectionCount = view.getUint32(4, true);
  const prefixLength = 4 + 4 + 4 * sectionCount;
  const header: unknown = JSON.parse(
    textDecoder.decode(aligned.subarray(prefixLength, prefixLength + headerByteLength)),
  );
  const sections: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = align8(prefixLength + headerByteLength);
  for (let index = 0; index < sectionCount; index += 1) {
    const byteLength = view.getUint32(8 + 4 * index, true);
    sections.push(aligned.subarray(offset, offset + byteLength));
    offset = align8(offset + byteLength);
  }
  return { header, sections };
};

/** Float64Array over a decoded section (copying only if misaligned). */
export const sectionToFloat64 = (section: Uint8Array<ArrayBuffer>): Float64Array<ArrayBuffer> => {
  const aligned = section.byteOffset % 8 === 0 ? section : new Uint8Array(section);
  return new Float64Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 8));
};

/** Uint32Array over a decoded section (copying only if misaligned). */
export const sectionToUint32 = (section: Uint8Array<ArrayBuffer>): Uint32Array<ArrayBuffer> => {
  const aligned = section.byteOffset % 4 === 0 ? section : new Uint8Array(section);
  return new Uint32Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 4));
};

/** Raw bytes of a typed array, without copying. */
export const typedArrayBytes = (array: Float64Array<ArrayBuffer> | Uint32Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
