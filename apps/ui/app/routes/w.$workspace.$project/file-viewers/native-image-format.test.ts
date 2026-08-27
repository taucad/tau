import { describe, expect, it } from 'vitest';
import { sniffNativeImageFormat } from '#routes/w.$workspace.$project/file-viewers/native-image-format.js';

const ascii = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('sniffNativeImageFormat', () => {
  it.each([
    ['png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xdb])],
    ['gif', ascii('GIF89a')],
    ['webp', ascii('RIFF\x10\x00\x00\x00WEBP')],
    ['bmp', ascii('BM')],
    ['ico', new Uint8Array([0x00, 0x00, 0x01, 0x00])],
    [
      'avif',
      new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0, 0x61, 0x76, 0x69, 0x66]),
    ],
  ])('detects %s from its signature', (id, bytes) => {
    expect(sniffNativeImageFormat(bytes, { allowSvg: false })?.id).toBe(id);
  });

  it('detects AVIF from its compatible brand', () => {
    const bytes = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0, 0, 0, 0, 0x61, 0x76, 0x69, 0x73,
    ]);
    expect(sniffNativeImageFormat(bytes, { allowSvg: false })?.id).toBe('avif');
  });

  it('detects an SVG after BOM, XML declaration, comments, and whitespace only for text content', () => {
    const bytes = ascii('\uFEFF  <?xml version="1.0"?>\n<!-- preview -->\n<svg viewBox="0 0 1 1"></svg>');

    expect(sniffNativeImageFormat(bytes, { allowSvg: true })?.id).toBe('svg');
    expect(sniffNativeImageFormat(bytes, { allowSvg: false })).toBeUndefined();
  });

  it.each([
    ['truncated png', new Uint8Array([0x89, 0x50, 0x4e])],
    ['non-WebP RIFF', ascii('RIFF\x10\x00\x00\x00WAVE')],
    ['HTML containing SVG', ascii('<html><svg></svg></html>')],
    ['arbitrary binary', new Uint8Array([0x00, 0x12, 0x34, 0x56])],
  ])('rejects %s', (_name, bytes) => {
    expect(sniffNativeImageFormat(bytes, { allowSvg: true })).toBeUndefined();
  });
});
