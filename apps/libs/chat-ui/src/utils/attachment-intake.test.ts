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

      await expect(readAttachmentFile(file)).resolves.toEqual({ outcome: 'refused', reason: 'unsupported' });
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    });

    it('should refuse a file over the intake limit without reading it', async () => {
      const file = fileOf(jpeg, 'huge.jpg', 'image/jpeg');
      Object.defineProperty(file, 'size', { value: attachmentIntakeMaxBytes + 1 });

      await expect(readAttachmentFile(file)).resolves.toEqual({ outcome: 'refused', reason: 'too-large' });
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    });

    it('should refuse bytes that are not a stored type, whatever the file claims', async () => {
      await expect(
        readAttachmentFile(fileOf(new TextEncoder().encode('ftyp heic, honest'), 'IMG_0001.jpg', 'image/jpeg')),
      ).resolves.toEqual({ outcome: 'refused', reason: 'unsupported' });
    });
  });

  describe('mayHoldAttachment', () => {
    it('should accept stored types, JPEG aliases and an unknown type, and nothing else', () => {
      expect(
        ['image/jpeg', 'image/png', 'application/pdf', 'image/jpg', 'image/pjpeg', '', 'image/heic', 'text/plain'].map(
          (type) => mayHoldAttachment(type),
        ),
      ).toEqual([true, true, true, true, true, true, false, false]);
    });
  });
});
