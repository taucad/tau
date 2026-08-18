import { describe, it, expect } from 'vitest';
import { seemsBinary, headSniffByteLength } from '#seems-binary.js';

describe('seemsBinary', () => {
  it('should return false for an empty buffer', () => {
    expect(seemsBinary(new Uint8Array())).toBe(false);
  });

  it('should return false for pure ASCII text', () => {
    const text = new TextEncoder().encode('hello world\nthis is a text file');
    expect(seemsBinary(text)).toBe(false);
  });

  it('should return false when buffer starts with UTF-8 BOM even if NUL follows', () => {
    const buffer = new Uint8Array([0xef, 0xbb, 0xbf, 0x00, 0x00, 0x00]);
    expect(seemsBinary(buffer)).toBe(false);
  });

  it('should return false when buffer starts with UTF-16 LE BOM', () => {
    const buffer = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(seemsBinary(buffer)).toBe(false);
  });

  it('should return false when buffer starts with UTF-16 BE BOM', () => {
    const buffer = new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
    expect(seemsBinary(buffer)).toBe(false);
  });

  it('should return true when NUL byte is at index 0', () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(seemsBinary(buffer)).toBe(true);
  });

  it('should return true when NUL byte appears within the sniff window', () => {
    const buffer = new Uint8Array(headSniffByteLength);
    buffer.fill(0x41);
    buffer[headSniffByteLength - 1] = 0x00;
    expect(seemsBinary(buffer)).toBe(true);
  });

  it('should return false when NUL byte appears outside the sniff window', () => {
    const buffer = new Uint8Array(800);
    buffer.fill(0x41);
    buffer[700] = 0x00;
    expect(seemsBinary(buffer)).toBe(false);
  });

  it('should return false for a fully ASCII buffer of exactly the sniff window size', () => {
    const buffer = new Uint8Array(headSniffByteLength);
    buffer.fill(0x41);
    expect(seemsBinary(buffer)).toBe(false);
  });

  it('should expose headSniffByteLength of 512', () => {
    expect(headSniffByteLength).toBe(512);
  });
});
