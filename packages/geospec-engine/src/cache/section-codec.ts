/**
 * Binary section codec for evidence payloads.
 *
 * Evidence entries carry a small JSON header plus arbitrarily large binary
 * blobs (triangle soups, occurrence meshes, and topological shells). Round-tripping
 * those through JSON would cost multi-hundred-MB string allocations, so the
 * codec frames them: a little-endian `u32` header, then 8-byte-aligned
 * sections. The alignment is what lets a reader hand a section straight to a
 * `Float64Array` view without copying.
 *
 * Layout (all integers little-endian `u32`):
 *
 * ```text
 * magic 'GSEC' | version | headerByteLength | sectionCount
 * sectionByteLength[0..sectionCount)        (u32 each)
 * <pad to 8>   header JSON utf8   <pad to 8>
 * <section bytes> <pad to 8>                (per section)
 * ```
 *
 * @module
 */

/** Frame magic: `GSEC`, little-endian. */
const magic = 0x43_45_53_47;

/** Codec version. A layout change is a version change, never a silent reread. */
const codecVersion = 1;

const align8 = (value: number): number => Math.ceil(value / 8) * 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * A decoded section payload: the JSON header plus its binary sections.
 *
 * @public
 */
export type DecodedSections = {
  header: unknown;
  sections: Array<Uint8Array<ArrayBuffer>>;
};

/**
 * Frame a JSON header and its binary sections into one payload.
 *
 * @param header - JSON-serializable header.
 * @param sections - Binary sections, in a fixed order the reader knows.
 * @returns The framed payload.
 * @public
 */
export const encodeSections = (
  header: unknown,
  sections: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Uint8Array<ArrayBuffer> => {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const prefixLength = align8(16 + sections.length * 4);
  const headerEnd = prefixLength + align8(headerBytes.byteLength);
  let total = headerEnd;
  for (const section of sections) {
    total += align8(section.byteLength);
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, codecVersion, true);
  view.setUint32(8, headerBytes.byteLength, true);
  view.setUint32(12, sections.length, true);
  for (const [index, section] of sections.entries()) {
    view.setUint32(16 + index * 4, section.byteLength, true);
  }
  out.set(headerBytes, prefixLength);
  let offset = headerEnd;
  for (const section of sections) {
    out.set(section, offset);
    offset += align8(section.byteLength);
  }
  return out;
};

/**
 * Decode a framed payload.
 *
 * A payload that is not a well-formed frame decodes to `undefined` rather than
 * throwing: a corrupt or foreign cache entry is a miss, never a crash.
 *
 * @param bytes - The framed payload.
 * @returns The header and its sections, or `undefined` when the frame is not
 * readable.
 * @public
 */
export const decodeSections = (bytes: Uint8Array<ArrayBuffer>): DecodedSections | undefined => {
  if (bytes.byteLength < 16) {
    return undefined;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== magic || view.getUint32(4, true) !== codecVersion) {
    return undefined;
  }
  const headerByteLength = view.getUint32(8, true);
  const sectionCount = view.getUint32(12, true);
  const prefixLength = align8(16 + sectionCount * 4);
  const headerEnd = prefixLength + align8(headerByteLength);
  if (bytes.byteLength < headerEnd) {
    return undefined;
  }
  const lengths: number[] = [];
  for (let index = 0; index < sectionCount; index++) {
    lengths.push(view.getUint32(16 + index * 4, true));
  }

  let header: unknown;
  try {
    header = JSON.parse(textDecoder.decode(bytes.subarray(prefixLength, prefixLength + headerByteLength)));
  } catch {
    return undefined;
  }

  const sections: Array<Uint8Array<ArrayBuffer>> = [];
  let offset = headerEnd;
  for (const length of lengths) {
    if (offset + length > bytes.byteLength) {
      return undefined;
    }
    // Copy rather than view: the caller owns the result, and a retained view
    // would pin the whole frame in memory.
    sections.push(bytes.slice(offset, offset + length));
    offset += align8(length);
  }
  return { header, sections };
};

/**
 * Read a section as `Float32Array` coordinates.
 *
 * @param section - Section bytes.
 * @returns A copy of the section reinterpreted as float32.
 * @public
 */
export const sectionToFloat32 = (section: Uint8Array<ArrayBuffer>): Float32Array<ArrayBuffer> =>
  new Float32Array(section.buffer, section.byteOffset, section.byteLength / 4);

/**
 * Frame a `Float32Array` as section bytes.
 *
 * @param values - Coordinates.
 * @returns The section view over the same memory.
 * @public
 */
export const float32ToSection = (values: Float32Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
