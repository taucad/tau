import { createHash } from 'node:crypto';

/** Private codec v2 persisted framing; body fields remain their existing codec owner's shape. @internal */
export const storedHeaderBytes = 64;
const magic = new TextEncoder().encode('PKC00001');
const bodyHash = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(createHash('sha256').update(bytes).digest());
/**
 * Hints survive normal ComputeStoreEntry publication; caller charges input/output overlap.
 * @internal
 * @param input - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const encodeStoredEnvelope = (input: {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly family: 'vdb' | 'mesh' | 'bool' | 'layout';
  readonly nativeAllowance: number;
  readonly maximumEncoded: number;
}): Uint8Array<ArrayBuffer> => {
  if (
    !Number.isSafeInteger(input.nativeAllowance) ||
    input.nativeAllowance < 0 ||
    !Number.isSafeInteger(input.maximumEncoded) ||
    input.maximumEncoded < 0 ||
    input.body.length > input.maximumEncoded - storedHeaderBytes
  ) {
    throw new TypeError('Private stored envelope budget.');
  }
  const bytes = new Uint8Array(storedHeaderBytes + input.body.length),
    view = new DataView(bytes.buffer);
  bytes.set(magic);
  view.setUint32(8, input.family === 'vdb' ? 0 : input.family === 'mesh' ? 1 : input.family === 'bool' ? 2 : 3, true);
  view.setBigUint64(16, BigInt(input.body.length), true);
  view.setBigUint64(24, BigInt(input.nativeAllowance), true);
  bytes.set(bodyHash(input.body), 32);
  bytes.set(input.body, storedHeaderBytes);
  return bytes;
};
/**
 * Validate lengths/version/flags/body SHA before decode. Returned body is a view, never another full copy.
 * @internal
 * @param input - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 */
export const decodeStoredEnvelope = (input: {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly family: 'vdb' | 'mesh' | 'bool' | 'layout';
  readonly maximumEncoded: number;
  readonly maximumNative: number;
}): {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly nativeAllowance: number;
  readonly semanticBodyDigest: string;
} => {
  for (const limit of [input.maximumEncoded, input.maximumNative]) {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new TypeError('Private stored envelope limit.');
    }
  }
  if (
    input.bytes.length < storedHeaderBytes ||
    input.bytes.length > input.maximumEncoded ||
    !magic.every((byte, index) => byte === input.bytes[index])
  ) {
    throw new TypeError('Private stored envelope version/length.');
  }
  const view = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const family = input.family === 'vdb' ? 0 : input.family === 'mesh' ? 1 : input.family === 'bool' ? 2 : 3;
  const size = view.getBigUint64(16, true),
    native = view.getBigUint64(24, true);
  if (
    view.getUint32(8, true) !== family ||
    view.getUint32(12, true) !== 0 ||
    size !== BigInt(input.bytes.length - storedHeaderBytes) ||
    native > BigInt(input.maximumNative) ||
    ((family === 2 || family === 3) && native !== 0n)
  ) {
    throw new TypeError('Private stored envelope flags/allowance.');
  }
  const body = input.bytes.subarray(storedHeaderBytes),
    hash = bodyHash(body);
  if (!hash.every((byte, index) => byte === input.bytes[index + 32])) {
    throw new TypeError('Private stored envelope semantic SHA.');
  }
  return {
    body,
    nativeAllowance: Number(native),
    semanticBodyDigest: `sha256:${Buffer.from(hash).toString('hex')}`,
  };
};
