import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { attachmentIntakeMaxBytes, mayHoldAttachment, readAttachmentFile } from '#utils/attachment-intake.js';

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x30, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00,
]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0x01, 0x22, 0x00]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00,
  0x00, 0x2f, 0x2f, 0xc0, 0x07, 0x00,
]);
const pdf = new TextEncoder().encode('%PDF-1.7\n');

/** A 48×32, 24-bit BMP header: a format Tau does not store but the raster transcoder converts. */
const bmp = (() => {
  const bytes = new Uint8Array(58);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, 58, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, 48, true);
  view.setInt32(22, 32, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  return bytes;
})();

/** A 32×48, 8-bit Photoshop header: a format Tau recognises but neither stores nor converts. */
const psd = (() => {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('8BPS'));
  view.setUint16(4, 1);
  view.setUint16(12, 3);
  view.setUint32(14, 32);
  view.setUint32(18, 48);
  view.setUint16(22, 8);
  return bytes;
})();

/** A real 1200×800 HEIC photo, as an iPhone writes it. */
const heic = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, '../../../../../libs/utils/src/image-probe.fixtures/small.heic')),
);

const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

const base64 = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('base64');

/** A `File` whose `arrayBuffer` is spied on, so a test can prove it was never read. */
const fileOf = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string): File => {
  const file = new File([new Uint8Array(bytes)], name, { type });
  return Object.assign(file, { arrayBuffer: vi.fn(async () => new Uint8Array(bytes).buffer) });
};

describe('attachment-intake', () => {
  describe('readAttachmentFile', () => {
    it('should label a WebP named .jpg and typed image/jpeg as image/webp', async () => {
      await expect(readAttachmentFile(fileOf(webp, 'photo.jpg', 'image/jpeg'))).resolves.toEqual({
        outcome: 'admitted',
        kind: 'image',
        mediaType: 'image/webp',
        source: `data:image/webp;base64,${base64(webp)}`,
      });
    });

    it('should label PNG bytes typed image/jpeg as image/png', async () => {
      await expect(readAttachmentFile(fileOf(png, 'actually-png.jpg', 'image/jpeg'))).resolves.toMatchObject({
        mediaType: 'image/png',
        source: `data:image/png;base64,${base64(png)}`,
      });
    });

    it.each(['', 'image/jpg', 'image/pjpeg'])('should admit a JPEG whose declared type is %j', async (type) => {
      await expect(readAttachmentFile(fileOf(jpeg, 'small.jpg', type))).resolves.toEqual({
        outcome: 'admitted',
        kind: 'image',
        mediaType: 'image/jpeg',
        source: `data:image/jpeg;base64,${base64(jpeg)}`,
      });
    });

    it('should admit a PDF as its bytes rather than a data URL', async () => {
      const intake = await readAttachmentFile(fileOf(pdf, 'spec.pdf', 'application/pdf'));

      expect(intake).toMatchObject({ outcome: 'admitted', kind: 'document', mediaType: 'application/pdf' });
      const source = intake.outcome === 'admitted' ? intake.source : undefined;
      expect(typeof source === 'object' ? [source.mediaType, [...source.bytes]] : source).toEqual([
        'application/pdf',
        [...pdf],
      ]);
    });

    it('should refuse a declared type that cannot hold an attachment without reading it', async () => {
      const file = fileOf(png, 'notes.txt', 'text/plain');

      await expect(readAttachmentFile(file)).resolves.toEqual({ outcome: 'refused', reason: 'not-an-image' });
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    });

    it('should refuse a file over the intake limit without reading it', async () => {
      const file = fileOf(jpeg, 'huge.jpg', 'image/jpeg');
      Object.defineProperty(file, 'size', { value: attachmentIntakeMaxBytes + 1 });

      await expect(readAttachmentFile(file)).resolves.toEqual({ outcome: 'refused', reason: 'too-large' });
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    });

    it('should refuse bytes that are not an image, whatever the file claims', async () => {
      await expect(
        readAttachmentFile(fileOf(new TextEncoder().encode('ftyp heic, honest'), 'IMG_0001.jpg', 'image/jpeg')),
      ).resolves.toEqual({ outcome: 'refused', reason: 'not-an-image' });
    });

    it('should admit an image the host converts under the media type its bytes hold', async () => {
      await expect(
        readAttachmentFile(fileOf(bmp, 'scan.jpg', 'image/jpeg'), { transcodeSources: ['jpeg', 'bmp'] }),
      ).resolves.toEqual({
        outcome: 'admitted',
        kind: 'image',
        mediaType: 'image/bmp',
        source: `data:image/bmp;base64,${base64(bmp)}`,
      });
    });

    it('should refuse an image format the host does not convert, naming the format', async () => {
      await expect(readAttachmentFile(fileOf(bmp, 'scan.bmp', 'image/bmp'))).resolves.toEqual({
        outcome: 'refused',
        reason: 'unsupported-format',
        format: 'bmp',
      });
    });

    it('should refuse an image whose header is damaged as unreadable, naming the format', async () => {
      await expect(
        readAttachmentFile(fileOf(bmp.slice(0, 20), 'scan.bmp', 'image/bmp'), { transcodeSources: ['bmp'] }),
      ).resolves.toEqual({ outcome: 'refused', reason: 'unreadable', format: 'bmp' });
    });
  });

  describe('a generic declared type', () => {
    it('should admit a HEIC typed application/octet-stream for conversion, labelled from its bytes', async () => {
      await expect(
        readAttachmentFile(fileOf(heic, 'IMG_0001.HEIC', 'application/octet-stream'), { transcodeSources: ['heic'] }),
      ).resolves.toEqual({
        outcome: 'admitted',
        kind: 'image',
        mediaType: 'image/heic',
        source: `data:image/heic;base64,${base64(heic)}`,
      });
    });

    it('should admit a JPEG typed application/octet-stream under image/jpeg', async () => {
      await expect(readAttachmentFile(fileOf(jpeg, 'small.jpg', 'application/octet-stream'))).resolves.toMatchObject({
        outcome: 'admitted',
        mediaType: 'image/jpeg',
      });
    });

    it('should refuse a PSD typed application/octet-stream by its format, as an untyped one is', async () => {
      const expected = { outcome: 'refused', reason: 'unsupported-format', format: 'psd' };

      await expect(readAttachmentFile(fileOf(psd, 'layout.psd', 'application/octet-stream'))).resolves.toEqual(
        expected,
      );
      await expect(readAttachmentFile(fileOf(psd, 'layout.psd', ''))).resolves.toEqual(expected);
    });

    it.each([
      ['a ZIP', 'models.zip', zip],
      ['text', 'notes.txt', new TextEncoder().encode('just some notes')],
    ])('should read %s typed application/octet-stream and refuse it as not an image', async (_, name, bytes) => {
      const file = fileOf(bytes, name, 'application/octet-stream');

      await expect(readAttachmentFile(file, { transcodeSources: ['heic'] })).resolves.toEqual({
        outcome: 'refused',
        reason: 'not-an-image',
      });
      expect(file.arrayBuffer).toHaveBeenCalledOnce();
    });
  });

  describe('mayHoldAttachment', () => {
    it('should accept stored types, any image type and an unknown or generic type, and nothing else', () => {
      expect(
        [
          'image/jpeg',
          'image/png',
          'application/pdf',
          'image/jpg',
          'image/pjpeg',
          '',
          'application/octet-stream',
          'binary/octet-stream',
          'image/heic',
          'text/plain',
          'application/zip',
        ].map((type) => mayHoldAttachment(type)),
      ).toEqual([true, true, true, true, true, true, true, true, true, false, false]);
    });
  });
});
