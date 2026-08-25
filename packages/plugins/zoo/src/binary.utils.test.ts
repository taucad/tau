import { describe, it, expect, vi, afterEach } from 'vitest';
import { binaryToUuid } from '#binary.utils.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('binaryToUuid', () => {
  it('should convert 16-byte Uint8Array to UUID string', () => {
    const bytes = new Uint8Array([
      0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66, 0x55, 0x44, 0x00, 0x00,
    ]);

    const result = binaryToUuid(bytes);

    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should convert BSON Binary object to UUID string', () => {
    const bytes = new Uint8Array([
      0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4, 0xa7, 0x16, 0x44, 0x66, 0x55, 0x44, 0x00, 0x00,
    ]);
    const bsonBinary = { _bsontype: 'Binary', buffer: bytes };

    const result = binaryToUuid(bsonBinary);

    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should pass through valid UUID string unchanged', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(binaryToUuid(uuid)).toBe(uuid);
  });

  it('should return empty string for wrong-length Uint8Array', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    const bytes = new Uint8Array([0x55, 0x0e, 0x84]);

    const result = binaryToUuid(bytes);

    expect(result).toBe('');
    expect(consoleSpy).toHaveBeenCalledWith('UUID must be exactly 16 bytes');
  });

  it('should return empty string when BSON buffer has wrong length', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockReturnValue();
    const bsonBinary = { _bsontype: 'Binary', buffer: new Uint8Array([1, 2, 3]) };

    const result = binaryToUuid(bsonBinary);

    expect(result).toBe('');
    expect(consoleSpy).toHaveBeenCalledWith('UUID must be exactly 16 bytes');
  });

  it('should produce correct hex formatting with zero-padded bytes', () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    ]);

    const result = binaryToUuid(bytes);

    expect(result).toBe('00000000-0000-0000-0000-000000000001');
  });
});
