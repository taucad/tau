import { constants } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@taucad/utils/hash';
import { jsonSerializedByteLength } from '#components/geometry/graphics/three/utils/json-serialized-byte-length.js';

describe('assembly descriptor JSON byte inventory', () => {
  it('should match canonical JSON UTF-8 bytes for supported descriptor values', () => {
    const shared = { name: `quote " and slash \\ and 😃 and ${String.fromCodePoint(55_296)}`, value: Number.NaN };
    const array: unknown[] = [shared, undefined, null, -0, Number.POSITIVE_INFINITY];
    array.length = 6; // Sparse array slot: canonical JSON encodes it as null.
    array.push(new Uint8Array([1, 2]));
    const descriptor = {
      array,
      shared,
      omitted: undefined,
      ignored: () => undefined,
      nested: { shared, empty: [], flag: true },
    };
    expect(jsonSerializedByteLength(descriptor)).toBe(new TextEncoder().encode(canonicalJson(descriptor)).byteLength);
    expect(jsonSerializedByteLength(array)).toBe(new TextEncoder().encode(canonicalJson(array)).byteLength);
    const nonJson = {};
    Object.defineProperty(nonJson, 'toJSON', { value: () => 'unsupported', enumerable: true });
    expect(() => jsonSerializedByteLength(nonJson)).toThrow(TypeError);
  });

  it('should count a shared hundred-thousand-occurrence graph without allocating its giant JSON text', () => {
    const occurrence = { name: 'x'.repeat(8192), transform: [1, 0, 0, 1] };
    const count = 100_000;
    const graph = Array.from({ length: count }, () => occurrence);
    const expected = 2 + count * new TextEncoder().encode(canonicalJson(occurrence)).byteLength + count - 1;
    expect(expected).toBeGreaterThan(constants.MAX_STRING_LENGTH);
    expect(jsonSerializedByteLength(graph)).toBe(expected);
  });
});
