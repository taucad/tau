import { describe, expect, it } from 'vitest';
import { attachmentMedia, isAttachmentMediaType, sniffAttachmentMediaType } from '#wire/index.js';
import { imageBytes } from '#wire/attachment-media.fixture.js';

describe('attachment-media', () => {
  describe('attachmentMedia', () => {
    it('should store JPEG, PNG, WebP, GIF and PDF, each under its canonical extension', () => {
      expect(
        Object.fromEntries(Object.entries(attachmentMedia).map(([type, media]) => [type, media.extensions[0]])),
      ).toEqual({
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'application/pdf': 'pdf',
      });
    });

    it('should admit only the stored media types', () => {
      expect(isAttachmentMediaType('image/png')).toBe(true);
      expect(isAttachmentMediaType('image/jpg')).toBe(false);
      expect(isAttachmentMediaType('image/heic')).toBe(false);
      expect(isAttachmentMediaType('toString')).toBe(false);
    });
  });

  describe('sniffAttachmentMediaType', () => {
    it.each([
      ['JPEG', imageBytes.jpeg, 'image/jpeg'],
      ['PNG', imageBytes.png, 'image/png'],
      ['WebP', imageBytes.webp, 'image/webp'],
      ['GIF', imageBytes.gif, 'image/gif'],
      ['PDF', new TextEncoder().encode('%PDF-1.7\n'), 'application/pdf'],
    ])('should label %s bytes from the bytes', (_name, bytes, mediaType) => {
      expect(sniffAttachmentMediaType(bytes)).toBe(mediaType);
    });

    it.each([
      ['a format Tau does not store', imageBytes.bmp],
      ['bytes with no signature', new TextEncoder().encode('not an image')],
      ['a JPEG cut off before its frame header', imageBytes.jpeg.subarray(0, 4)],
      ['empty bytes', new Uint8Array()],
    ])('should return undefined for %s', (_name, bytes) => {
      expect(sniffAttachmentMediaType(bytes)).toBeUndefined();
    });
  });
});
