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
    const withHeic = [...raster, 'heic', 'heif'];
    const accept = (isIos: boolean) =>
      attachmentAccept({ images: true, documents: false, transcodeSources: withHeic, isIos }).split(',');

    expect(accept(false)).toEqual(expect.arrayContaining(['image/heic', 'image/heif', '.heic', '.heif']));
    expect(accept(true).filter((entry) => /hei[cf]/u.test(entry))).toEqual([]);
  });

  it('should offer image/heif only where the runtime converts HEIF', () => {
    expect(
      attachmentAccept({ images: true, documents: false, transcodeSources: [...raster, 'heic'], isIos: false }),
    ).not.toContain('image/heif');
  });

  it('should ignore a source that is not an image format', () => {
    expect(attachmentAccept({ images: true, documents: false, transcodeSources: ['glb'], isIos: false })).toBe(
      'image/jpeg,image/png,image/webp,image/gif',
    );
  });
});
