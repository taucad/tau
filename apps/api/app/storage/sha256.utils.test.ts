import { describe, it, expect } from 'vitest';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';

describe('sha256.utils', () => {
  it('should produce deterministic sha256 hex for known bytes', () => {
    const bytes = new TextEncoder().encode('tau-sharing-mvp');
    expect(sha256HexFromBytes(bytes)).toMatch(/^[0-9a-f]{64}$/u);
    expect(sha256HexFromBytes(bytes)).toBe(sha256HexFromBytes(bytes));
  });

  it('should produce sharded keys of shape <2>/<62> (namespace-relative)', () => {
    const hex = 'a'.repeat(64);
    expect(blobKeyFromSha256Hex(hex)).toBe(`aa/${'a'.repeat(62)}`);
  });

  it('should normalize uppercase hex to lowercase shards', () => {
    expect(blobKeyFromSha256Hex(`${'B'.repeat(2)}${'b'.repeat(62)}`.toUpperCase())).toBe(`bb/${'b'.repeat(62)}`);
  });

  it('should throw when sha256 hex is malformed', () => {
    expect(() => blobKeyFromSha256Hex('not-hex')).toThrow(TypeError);
    expect(() => blobKeyFromSha256Hex(`${'f'.repeat(63)}x`)).toThrow(TypeError);
  });
});
