import { describe, it, expect } from 'vitest';
import { hashCode, hashCodeSecure, generateSecureId, constantTimeEqual } from '#utils/crypto.js';

describe('hashCode', () => {
  it('should return a consistent hash for the same input', () => {
    const input = 'test string';
    const hash1 = hashCode(input);
    const hash2 = hashCode(input);
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', () => {
    const hash1 = hashCode('test1');
    const hash2 = hashCode('test2');
    expect(hash1).not.toBe(hash2);
  });

  it('should return a hex string of consistent length', () => {
    const hash = hashCode('test');
    expect(hash).toMatch(/^[\da-f]{8}$/);
  });

  it('should handle empty string', () => {
    const hash = hashCode('');
    expect(hash).toMatch(/^[\da-f]{8}$/);
  });

  it('should handle unicode characters', () => {
    const hash = hashCode('🚀 test 你好');
    expect(hash).toMatch(/^[\da-f]{8}$/);
  });

  it('should handle very long strings', () => {
    const longString = 'a'.repeat(10_000);
    const hash = hashCode(longString);
    expect(hash).toMatch(/^[\da-f]{8}$/);
  });

  it('should be case sensitive', () => {
    const hash1 = hashCode('Test');
    const hash2 = hashCode('test');
    expect(hash1).not.toBe(hash2);
  });
});

describe('hashCodeSecure', () => {
  it('should return a SHA-256 hash', async () => {
    const hash = await hashCodeSecure('test');
    // SHA-256 hash should be 64 characters of hex
    expect(hash).toMatch(/^[\da-f]{64}$/);
    // Known SHA-256 hash of "test"
    expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('should return consistent hashes for the same input', async () => {
    const input = 'test string';
    const hash1 = await hashCodeSecure(input);
    const hash2 = await hashCodeSecure(input);
    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different inputs', async () => {
    const hash1 = await hashCodeSecure('test1');
    const hash2 = await hashCodeSecure('test2');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', async () => {
    const hash = await hashCodeSecure('');
    expect(hash).toMatch(/^[\da-f]{64}$/);
    // Known SHA-256 hash of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should handle unicode characters', async () => {
    const hash = await hashCodeSecure('🚀 test 你好');
    expect(hash).toMatch(/^[\da-f]{64}$/);
  });
});

describe('generateSecureId', () => {
  it('should generate an ID of default length (32 characters)', () => {
    const id = generateSecureId();
    expect(id).toMatch(/^[\da-f]{32}$/);
  });

  it('should generate an ID of specified length', () => {
    const id = generateSecureId(8);
    expect(id).toMatch(/^[\da-f]{16}$/); // 8 bytes = 16 hex characters
  });

  it('should generate different IDs on each call', () => {
    const id1 = generateSecureId();
    const id2 = generateSecureId();
    expect(id1).not.toBe(id2);
  });

  it('should handle edge case of length 0', () => {
    const id = generateSecureId(0);
    expect(id).toBe('');
  });

  it('should generate IDs with good randomness', () => {
    const ids = new Set();
    for (let index = 0; index < 100; index++) {
      ids.add(generateSecureId(8));
    }

    // Should have 100 unique IDs (very high probability with crypto random)
    expect(ids.size).toBe(100);
  });
});

describe('constantTimeEqual', () => {
  it('should return true for identical strings', () => {
    expect(constantTimeEqual('test', 'test')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('longer string test', 'longer string test')).toBe(true);
  });

  it('should return false for different strings of same length', () => {
    expect(constantTimeEqual('test', 'best')).toBe(false);
    expect(constantTimeEqual('abcd', 'abce')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(constantTimeEqual('test', 'testing')).toBe(false);
    expect(constantTimeEqual('longer', 'short')).toBe(false);
    expect(constantTimeEqual('', 'nonempty')).toBe(false);
  });

  it('should handle unicode characters', () => {
    expect(constantTimeEqual('🚀', '🚀')).toBe(true);
    expect(constantTimeEqual('🚀', '🎯')).toBe(false);
    expect(constantTimeEqual('test你好', 'test你好')).toBe(true);
    expect(constantTimeEqual('test你好', 'test你坏')).toBe(false);
  });

  it('should be timing-attack resistant (same execution time)', () => {
    // Note: This is more of a conceptual test - actual timing attacks
    // would require much more sophisticated testing
    const string1 = 'a'.repeat(1000);
    const string2 = 'b'.repeat(1000);
    const string3 = 'a'.repeat(999) + 'b';

    // All these should execute in similar time
    expect(constantTimeEqual(string1, string2)).toBe(false);
    expect(constantTimeEqual(string1, string3)).toBe(false);
  });
});

describe('crypto utilities integration', () => {
  it('should work well together for common use cases', async () => {
    const data = 'sensitive data';

    // Generate a quick cache key
    const cacheKey = hashCode(data);
    expect(cacheKey).toMatch(/^[\da-f]{8}$/);

    // Generate a secure hash for verification
    const secureHash = await hashCodeSecure(data);
    expect(secureHash).toMatch(/^[\da-f]{64}$/);

    // Generate a unique ID
    const id = generateSecureId();
    expect(id).toMatch(/^[\da-f]{32}$/);

    // Verify secure comparison
    expect(constantTimeEqual(secureHash, secureHash)).toBe(true);
    expect(constantTimeEqual(secureHash, id)).toBe(false);
  });
});
