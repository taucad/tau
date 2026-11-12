/**
 * DP18 exact export pins (`kernels/<kernel>/exact-pins.json`), shared by the Node leg
 * (apps/runtime-e2e) and the browser leg (apps/ui-e2e) so both hash the same bytes.
 *
 * The geometry-core GLB writer stamps its own package version into `asset.generator`, so a
 * release of the package group moves the GLB hash although no exported byte means anything new.
 * A GLB pin therefore hashes the file with only that version replaced by a fixed token. Every
 * other byte is kept: the JSON chunk must already be in `JSON.stringify` form, so re-serializing
 * it changes nothing else, and the BIN chunk is copied verbatim. Materials, accessors, buffers,
 * the writer's name and anything else in the file still move the pin.
 */

/** The sha256 and length of the bytes a pin covers. @public */
export type ExactPin = { readonly sha256: string; readonly bytes: number };

const glbMagic = 0x46_54_6c_67; // 'glTF'
const glbVersion = 2;
const jsonChunkType = 0x4e_4f_53_4a; // 'JSON'
const glbHeaderSize = 12;
const chunkHeaderSize = 8;
/** `@taucad/geometry-core@<semver>`, the only generator the exact lane writes. */
const generatorPattern = /^@taucad\/geometry-core@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
/** What a version-stamped generator is pinned as. @public */
export const pinnedGlbGenerator = '@taucad/geometry-core@<version>';

/**
 * Return a copy of `glb` whose `asset.generator` version is the fixed `<version>` token, with the
 * JSON chunk re-padded and the header lengths updated. Everything else is byte-for-byte the input.
 *
 * @throws {TypeError} If the bytes are not a GLB 2.0 file, its JSON chunk is not in canonical
 * `JSON.stringify` form, or its generator is not a versioned `@taucad/geometry-core` stamp.
 *
 * @public
 */
export function normalizeGlbGenerator(glb: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (
    glb.byteLength < glbHeaderSize + chunkHeaderSize ||
    view.getUint32(0, true) !== glbMagic ||
    view.getUint32(4, true) !== glbVersion ||
    view.getUint32(8, true) !== glb.byteLength
  ) {
    throw new TypeError('Not a GLB 2.0 file whose header length matches its size.');
  }
  const jsonLength = view.getUint32(glbHeaderSize, true);
  const jsonStart = glbHeaderSize + chunkHeaderSize;
  const jsonEnd = jsonStart + jsonLength;
  if (view.getUint32(glbHeaderSize + 4, true) !== jsonChunkType || jsonLength % 4 !== 0 || jsonEnd > glb.byteLength) {
    throw new TypeError('The GLB does not start with a 4-byte aligned JSON chunk.');
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(glb.subarray(jsonStart, jsonEnd)).replace(/ +$/u, '');
  const json = JSON.parse(text) as { asset?: { generator?: unknown } };
  if (JSON.stringify(json) !== text) {
    throw new TypeError(
      'The GLB JSON chunk is not in JSON.stringify form, so normalizing it would change other bytes.',
    );
  }
  const generator = json.asset?.generator;
  if (typeof generator !== 'string' || !generatorPattern.test(generator) || !json.asset) {
    throw new TypeError(
      `The GLB generator ${JSON.stringify(generator)} is not a versioned @taucad/geometry-core stamp.`,
    );
  }
  json.asset.generator = pinnedGlbGenerator;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const rest = glb.subarray(jsonEnd);
  const out = new Uint8Array(jsonStart + paddedLength + rest.byteLength);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, glbMagic, true);
  outView.setUint32(4, glbVersion, true);
  outView.setUint32(8, out.byteLength, true);
  outView.setUint32(glbHeaderSize, paddedLength, true);
  outView.setUint32(glbHeaderSize + 4, jsonChunkType, true);
  out.set(jsonBytes, jsonStart);
  out.fill(0x20, jsonStart + jsonBytes.byteLength, jsonStart + paddedLength);
  out.set(rest, jsonStart + paddedLength);
  return out;
}

/** The sha256 and length of `bytes`, in Node and in browsers. */
async function pinOf(bytes: Uint8Array<ArrayBuffer>): Promise<ExactPin> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return {
    sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    bytes: bytes.byteLength,
  };
}

/** The pin of an exported file: GLBs are hashed with their generator version normalized, other formats as they are. @public */
export async function exactPinOf(format: 'stl' | 'glb', bytes: Uint8Array<ArrayBuffer>): Promise<ExactPin> {
  return pinOf(format === 'glb' ? normalizeGlbGenerator(bytes) : bytes);
}
