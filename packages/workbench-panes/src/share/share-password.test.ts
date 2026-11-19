import { describe, expect, it } from 'vitest';
import { generateSharePassword } from '#share/share-password.js';

describe('generateSharePassword', () => {
  it('should be 24 long when the bounds allow it', () => {
    expect(generateSharePassword({ minBytes: 8, maxBytes: 128 })).toHaveLength(24);
  });

  it('should meet the minimum and keep within the maximum, one byte per character', () => {
    const password = generateSharePassword({ minBytes: 32, maxBytes: 128 });
    expect(password).toHaveLength(32);
    expect(new TextEncoder().encode(password).byteLength).toBe(32);
    expect(generateSharePassword({ minBytes: 4, maxBytes: 8 })).toHaveLength(8);
  });

  it('should use only letters and digits that cannot be mistaken for one another', () => {
    const passwords = Array.from({ length: 50 }, () => generateSharePassword({ minBytes: 32, maxBytes: 128 }));
    for (const password of passwords) {
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/u);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
