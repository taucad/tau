import { describe, expect, it } from 'vitest';
import { attachmentAccept } from '#utils/attachment-accept.js';

const raster = ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'];

describe('attachmentAccept', () => {
  it('should offer the stored types, then each converted format by media type and extension', () => {
    expect(attachmentAccept({ images: true, documents: true, transcodeSources: raster, isIos: false })).toBe(
      'image/jpeg,image/png,image/webp,image/gif,application/pdf,image/avif,.avif,image/bmp,.bmp,.dib,image/tiff,.tif,.tiff',
    );
  });

  it('should offer only what the model reads', () => {
    expect(attachmentAccept({ images: false, documents: true, transcodeSources: raster, isIos: false })).toBe(
      'application/pdf',
    );
    expect(attachmentAccept({ images: true, documents: false, transcodeSources: [], isIos: false })).toBe(
      'image/jpeg,image/png,image/webp,image/gif',
    );
  });

  it('should leave HEIC out on iOS WebKit, where the picker hands over a JPEG instead', () => {
    const withHeic = [...raster, 'heic'];

    expect(attachmentAccept({ images: true, documents: false, transcodeSources: withHeic, isIos: false })).toContain(
      'image/heic,.heic,.heif',
    );
    expect(attachmentAccept({ images: true, documents: false, transcodeSources: withHeic, isIos: true })).not.toContain(
      'heic',
    );
  });

  it('should ignore a source that is not an image format', () => {
    expect(attachmentAccept({ images: true, documents: false, transcodeSources: ['glb'], isIos: false })).toBe(
      'image/jpeg,image/png,image/webp,image/gif',
    );
  });
});
