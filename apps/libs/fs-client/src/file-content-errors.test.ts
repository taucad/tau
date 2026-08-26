import { describe, it, expect } from 'vitest';
import { BinaryFileError, FileTooLargeError, FileNotFoundError } from '#file-content-errors.js';

describe('BinaryFileError', () => {
  it('should preserve message and set name to BinaryFileError', () => {
    const error = new BinaryFileError('cannot decode bytes as text', { path: '/a/b.bin', size: 4096 });
    expect(error.message).toBe('cannot decode bytes as text');
    expect(error.name).toBe('BinaryFileError');
  });

  it('should expose the path and size on the instance', () => {
    const error = new BinaryFileError('binary', { path: '/x', size: 9000 });
    expect(error.path).toBe('/x');
    expect(error.size).toBe(9000);
  });

  it('should be an instance of Error and BinaryFileError', () => {
    const error = new BinaryFileError('msg', { path: '/x', size: 1 });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BinaryFileError);
  });
});

describe('FileTooLargeError', () => {
  it('should preserve message and set name to FileTooLargeError', () => {
    const error = new FileTooLargeError('exceeds open limit', { path: '/big.txt', size: 999, limit: 100 });
    expect(error.message).toBe('exceeds open limit');
    expect(error.name).toBe('FileTooLargeError');
  });

  it('should expose path, size, and limit on the instance', () => {
    const error = new FileTooLargeError('msg', { path: '/big.txt', size: 999, limit: 100 });
    expect(error.path).toBe('/big.txt');
    expect(error.size).toBe(999);
    expect(error.limit).toBe(100);
  });

  it('should be an instance of Error and FileTooLargeError', () => {
    const error = new FileTooLargeError('msg', { path: '/x', size: 1, limit: 0 });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FileTooLargeError);
  });
});

describe('FileNotFoundError', () => {
  it('should preserve message and set name to FileNotFoundError', () => {
    const error = new FileNotFoundError('missing', { path: '/missing.txt' });
    expect(error.message).toBe('missing');
    expect(error.name).toBe('FileNotFoundError');
  });

  it('should expose path on the instance', () => {
    const error = new FileNotFoundError('msg', { path: '/missing.txt' });
    expect(error.path).toBe('/missing.txt');
  });

  it('should be an instance of Error and FileNotFoundError', () => {
    const error = new FileNotFoundError('msg', { path: '/x' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FileNotFoundError);
  });
});
