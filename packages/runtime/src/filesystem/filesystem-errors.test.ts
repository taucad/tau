import { describe, expect, it } from 'vitest';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';

describe('isNotFoundError', () => {
  it.each(['ENOENT', 'ENOTDIR'])('recognizes %s as path absence', (code) => {
    expect(isNotFoundError(Object.assign(new Error(code), { code }))).toBe(true);
  });

  it.each(['EACCES', 'ESTALE', 'EIO', undefined])('does not reinterpret %s as path absence', (code) => {
    expect(isNotFoundError(Object.assign(new Error(String(code)), { code }))).toBe(false);
  });
});
