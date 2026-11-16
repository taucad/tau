import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  attachmentExtensions,
  attachmentImageLimits,
  attachmentImageMediaTypes,
  attachmentMedia,
  isAttachmentMediaType,
  normalizeImageAttachment,
  sniffAttachmentMediaType,
} from '#wire/index.js';
import type { AttachmentTranscodeInput, NormalizedImageAttachment } from '#wire/index.js';
import { imageFormats } from '@taucad/utils/image-probe';
import { imageBytes } from '#wire/attachment-media.fixture.js';

const mebibyte = 1024 * 1024;

/** A JPEG frame header of the given size. */
const jpegOf = (width: number, height: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(imageBytes.jpeg);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
};

/** A PNG header of the given size. */
const pngOf = (width: number, height: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(imageBytes.png);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

/** `bytes` followed by zeros up to `length`; the headers still parse. */
const padded = (bytes: Uint8Array<ArrayBuffer>, length: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
};

/** An extended (VP8X) WebP header with the animation flag set. */
const animatedWebp = (): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
  bytes[16] = 10;
  bytes[20] = 0x02;
  bytes[24] = 47;
  bytes[27] = 31;
  return bytes;
};

/** A transcode port that resolves to `output` and records its calls. */
const fakePort = (output: Uint8Array<ArrayBuffer> = imageBytes.jpeg) =>
  vi.fn(async (_input: AttachmentTranscodeInput): Promise<Uint8Array<ArrayBuffer>> => output);

const allSources = ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'];

/** A refusal's message, or `undefined` for stored bytes. */
const messageOf = (outcome: NormalizedImageAttachment): string | undefined =>
  outcome.status === 'refused' ? outcome.message : undefined;

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

  describe('derived lists', () => {
    it('should name each stored type by its canonical extension', () => {
      expect(attachmentExtensions).toEqual(['jpg', 'png', 'webp', 'gif', 'pdf']);
    });

    it('should list the stored image types, GIF included', () => {
      expect(attachmentImageMediaTypes).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    });
  });

  describe('normalizeImageAttachment', () => {
    it.each([
      { name: 'a small JPEG', bytes: imageBytes.jpeg, mediaType: 'image/jpeg', format: 'jpeg' },
      { name: 'PNG bytes declared image/jpeg', bytes: imageBytes.png, mediaType: 'image/png', format: 'png' },
      { name: 'a small static WebP', bytes: imageBytes.webp, mediaType: 'image/webp', format: 'webp' },
      {
        name: 'a JPEG of exactly 1568 px and 1 MiB',
        bytes: padded(jpegOf(1568, 1568), mebibyte),
        mediaType: 'image/jpeg',
        format: 'jpeg',
      },
    ])(
      'should store $name unchanged, labelled from its bytes, without calling the port',
      async ({ bytes, mediaType, format }) => {
        const transcode = fakePort();

        const outcome = await normalizeImageAttachment({ bytes, transcode, transcodeSources: allSources });

        expect(outcome).toEqual({ status: 'stored', mediaType, bytes, format, converted: false });
        expect(outcome.status === 'stored' && outcome.bytes).toBe(bytes);
        expect(transcode).not.toHaveBeenCalled();
      },
    );

    it('should store a PDF unchanged as a document', async () => {
      const bytes = new TextEncoder().encode('%PDF-1.7\n');
      const transcode = fakePort();

      const outcome = await normalizeImageAttachment({ bytes, transcode, transcodeSources: allSources });

      expect(outcome).toEqual({
        status: 'stored',
        mediaType: 'application/pdf',
        bytes,
        format: 'pdf',
        converted: false,
      });
      expect(transcode).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'a JPEG wider than 1568 px', bytes: jpegOf(4032, 3024), format: 'jpeg', file: 'attachment.jpg' },
      { name: 'a PNG taller than 1568 px', bytes: pngOf(800, 1569), format: 'png', file: 'attachment.png' },
      {
        name: 'a JPEG over 1 MiB',
        bytes: padded(imageBytes.jpeg, mebibyte + 1),
        format: 'jpeg',
        file: 'attachment.jpg',
      },
      { name: 'a GIF, which new chats store as JPEG', bytes: imageBytes.gif, format: 'gif', file: 'attachment.gif' },
      { name: 'a BMP', bytes: imageBytes.bmp, format: 'bmp', file: 'attachment.bmp' },
    ] as const)('should convert $name to JPEG through the port', async ({ bytes, format, file }) => {
      const transcode = fakePort();

      const outcome = await normalizeImageAttachment({ bytes, transcode, transcodeSources: allSources });

      expect(transcode).toHaveBeenCalledExactlyOnceWith({
        from: format,
        to: 'jpeg',
        files: [{ name: file, mimeType: imageFormats[format].mediaType, bytes }],
        options: { maxEdge: 1568, maxBytes: mebibyte, background: '#FFFFFF' },
      });
      expect(outcome).toEqual({
        status: 'stored',
        mediaType: 'image/jpeg',
        bytes: imageBytes.jpeg,
        format,
        converted: true,
      });
    });

    it('should label the port output from its bytes', async () => {
      const outcome = await normalizeImageAttachment({
        bytes: imageBytes.gif,
        transcode: fakePort(imageBytes.png),
        transcodeSources: ['gif'],
      });

      expect(outcome).toMatchObject({ status: 'stored', mediaType: 'image/png', converted: true });
    });

    it.each([
      {
        name: 'a BMP with no edge on this host',
        bytes: imageBytes.bmp,
        sources: ['jpeg', 'png'],
        reason: 'unsupported-format',
        format: 'bmp',
        named: /BMP/u,
      },
      {
        name: 'a GIF with no edge on this host',
        bytes: imageBytes.gif,
        sources: [],
        reason: 'unsupported-format',
        format: 'gif',
        named: /GIF/u,
      },
      {
        name: 'an oversized PNG with no edge on this host',
        bytes: pngOf(4000, 3000),
        sources: ['gif'],
        reason: 'too-large',
        format: 'png',
        named: /PNG/u,
      },
    ])('should refuse $name by name', async ({ bytes, sources, reason, format, named }) => {
      const transcode = fakePort();

      const outcome = await normalizeImageAttachment({ bytes, transcode, transcodeSources: sources });

      expect(outcome).toMatchObject({ status: 'refused', reason, format });
      expect(messageOf(outcome)).toMatch(named);
      expect(transcode).not.toHaveBeenCalled();
    });

    it('should refuse a convertible format when no port is given', async () => {
      const outcome = await normalizeImageAttachment({ bytes: imageBytes.bmp, transcodeSources: allSources });

      expect(outcome).toMatchObject({ status: 'refused', reason: 'unsupported-format', format: 'bmp' });
    });

    it.each([
      {
        name: 'bytes that are not an image',
        bytes: new TextEncoder().encode('PK\u0003\u0004 archive'),
        reason: 'not-an-image',
      },
      { name: 'empty bytes', bytes: new Uint8Array(), reason: 'not-an-image' },
      {
        name: 'a JPEG cut off before its frame header',
        bytes: imageBytes.jpeg.subarray(0, 4),
        reason: 'unreadable',
        format: 'jpeg',
      },
      { name: 'an animated WebP', bytes: animatedWebp(), reason: 'animated', format: 'webp' },
      { name: 'a header over 50 megapixels', bytes: jpegOf(8000, 8000), reason: 'too-many-pixels', format: 'jpeg' },
      {
        name: 'an image over 64 MiB',
        bytes: padded(imageBytes.jpeg, attachmentImageLimits.maxInputBytes + 1),
        reason: 'too-large',
        format: 'jpeg',
      },
      {
        name: 'a PDF over 16 MiB',
        bytes: padded(new TextEncoder().encode('%PDF-1.7\n'), 16 * mebibyte + 1),
        reason: 'too-large',
        format: 'pdf',
      },
    ])('should refuse $name before calling the port', async ({ bytes, reason, format }) => {
      const transcode = fakePort();

      const outcome = await normalizeImageAttachment({ bytes, transcode, transcodeSources: allSources });

      expect(outcome).toMatchObject({ status: 'refused', reason });
      expect(outcome.status === 'refused' ? outcome.format : 'stored').toBe(format);
      expect(messageOf(outcome)).toMatch(/\S/u);
      expect(transcode).not.toHaveBeenCalled();
    });

    it('should surface a port rejection as a typed transcode-failed refusal carrying the cause', async () => {
      const cause = new Error('worker terminated');

      const outcome = await normalizeImageAttachment({
        bytes: jpegOf(4032, 3024),
        transcode: vi.fn(async () => {
          throw cause;
        }),
        transcodeSources: allSources,
      });

      expect(outcome).toMatchObject({ status: 'refused', reason: 'transcode-failed', format: 'jpeg', cause });
      expect(messageOf(outcome)).toMatch(/JPEG/u);
    });

    it.each([
      { name: 'bytes that are not an image', output: new TextEncoder().encode('garbage') },
      { name: 'an image still larger than 1568 px', output: jpegOf(3000, 2000) },
      { name: 'an animated WebP', output: animatedWebp() },
    ])('should refuse a port result that is $name', async ({ output }) => {
      const outcome = await normalizeImageAttachment({
        bytes: imageBytes.gif,
        transcode: fakePort(output),
        transcodeSources: ['gif'],
      });

      expect(outcome).toMatchObject({ status: 'refused', reason: 'transcode-failed', format: 'gif' });
    });
  });

  describe('one allow-list (I2)', () => {
    it('should leave no second literal table of stored media types in source', () => {
      const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: dirname(fileURLToPath(import.meta.url)),
        encoding: 'utf8',
      }).trim();
      const subtype = '(jpe?g|png|webp|gif|pdf)';
      const patterns = [
        // An alternation of three or more stored extensions or subtypes: `jpg|png|webp`, `jpeg|png|gif|webp`.
        `${subtype}\\|${subtype}\\|${subtype}`,
        // A media type mapped to its extension: `'image/jpeg': 'jpg'`.
        `['"]image/(jpeg|png|webp|gif)['"]: *['"](jpe?g|png|webp|gif)['"]`,
        // A list of image types that carries GIF, which only the stored set does: `['image/jpeg', 'image/png', 'image/gif'`.
        `['"]image/gif['"], *['"]image/|['"]image/(jpeg|png|webp)['"], *['"]image/gif['"]`,
      ];
      const found = patterns.flatMap((pattern) => {
        try {
          return execFileSync(
            'git',
            [
              'grep',
              '-lE',
              pattern,
              '--',
              '*.ts',
              '*.tsx',
              '*.mts',
              ':!**/*.test.ts',
              ':!**/*.test.tsx',
              ':!**/*.spec.ts',
            ],
            { cwd: root, encoding: 'utf8' },
          )
            .split('\n')
            .filter(Boolean);
        } catch (error) {
          // `git grep` exits 1 when nothing matches; any other failure must fail the test, not pass it.
          if ((error as { readonly status?: unknown }).status === 1) {
            return [];
          }
          throw error;
        }
      });

      expect([...new Set(found)]).toEqual([]);
    });
  });

  it('should keep the stored set as the one table', () => {
    expect(Object.keys(attachmentMedia)).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ]);
  });
});
