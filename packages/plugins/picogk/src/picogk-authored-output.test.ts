import { describe, expect, it } from 'vitest';
import { picogkAuthoredOutputSchema } from '#picogk.protocol.js';

const receipt = {
  artifactPath: `/artifacts/authored/${'a'.repeat(32)}/files/nested/part.stl`,
  name: 'nested/part.stl',
  byteLength: 0,
  sha256: 'b'.repeat(64),
  mimeType: 'model/stl',
};

describe('authored geometry receipts', () => {
  it('should preserve confined original names and exact empty-file receipts', () => {
    expect(picogkAuthoredOutputSchema.parse(receipt)).toEqual(receipt);
  });

  it.each([
    '../part.stl',
    '/part.stl',
    'nested//part.stl',
    'nested/./part.stl',
    String.raw`nested\part.stl`,
    'part\0.stl',
  ])('should reject noncanonical authored paths: %s', (name) => {
    expect(picogkAuthoredOutputSchema.safeParse({ ...receipt, name }).success).toBe(false);
  });

  it('should reject mismatched content descriptions and artifact roots', () => {
    for (const change of [
      { artifactPath: '/project/nested/part.stl' },
      { artifactPath: receipt.artifactPath.replace('/files/', '/files/../files/') },
      { mimeType: 'application/vnd.openvdb' },
      { byteLength: -1 },
      { byteLength: Number.MAX_SAFE_INTEGER + 1 },
      { sha256: 'unverified' },
    ]) {
      expect(picogkAuthoredOutputSchema.safeParse({ ...receipt, ...change }).success).toBe(false);
    }
  });
});
