import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectImageFormat, imageFormats, probeImage } from '@taucad/utils/image-probe';
import type { ImageProbe } from '@taucad/utils/image-probe';

/* The fixtures are 48×32 renders of the program's "TAU 42" card (sharp, from the
 * fixture seed's lossless TIFF), plus the seed's own AVIF and HEIC files. */
const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(new URL(`image-probe.fixtures/${name}`, import.meta.url)));

const card = { width: 48, height: 32, animated: false } as const;

const expected: Readonly<Record<string, ImageProbe>> = {
  'card.jpg': { format: 'jpeg', ...card, components: 3 },
  'progressive.jpg': { format: 'jpeg', ...card, components: 3 },
  'exif-rotated.jpg': { format: 'jpeg', ...card, components: 3 },
  'cmyk.jpg': { format: 'jpeg', ...card, components: 4 },
  'card.png': { format: 'png', ...card, components: 3 },
  'alpha.png': { format: 'png', ...card, components: 4 },
  'lossy.webp': { format: 'webp', ...card, components: 3 },
  'lossless.webp': { format: 'webp', ...card, components: 3 },
  'alpha.webp': { format: 'webp', ...card, components: 4 },
  'anim.webp': { format: 'webp', ...card, components: 4, animated: true },
  'card.gif': { format: 'gif', ...card, components: 4 },
  'anim.gif': { format: 'gif', ...card, components: 4, animated: true },
  'card.tiff': { format: 'tiff', ...card, components: 4 },
  'small.avif': { format: 'avif', width: 1200, height: 800, animated: false, components: 3 },
  'small-avifenc.avif': { format: 'avif', width: 1200, height: 800, animated: false, components: 3 },
  'small.heic': { format: 'heic', width: 1200, height: 800, animated: false, components: 3 },
  // The coded size: the container's 90° rotation is not applied.
  'heic-rot6.heic': { format: 'heic', width: 1200, height: 800, animated: false, components: 3 },
};

const bytesOf = (...parts: ReadonlyArray<number | string | readonly number[]>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'number' ? [part] : typeof part === 'string' ? [...part].map((c) => c.codePointAt(0) ?? 0) : part,
    ),
  );

/** Little-endian bytes of an integer; a negative value is written as its two's complement. */
const littleEndian = (value: number, width: number): number[] => {
  const unsigned = value < 0 ? value + 2 ** (8 * width) : value;
  return Array.from({ length: width }, (_, index) => Math.floor(unsigned / 256 ** index) % 256);
};
const le16 = (value: number): number[] => littleEndian(value, 2);
const le32 = (value: number): number[] => littleEndian(value, 4);
const be16 = (value: number): number[] => le16(value).toReversed();
const be32 = (value: number): number[] => le32(value).toReversed();

describe('image-probe', () => {
  describe('probeImage', () => {
    it.each(Object.entries(expected))('should read the header of %s', (name, probe) => {
      expect(probeImage(fixture(name))).toEqual(probe);
    });

    it('should read a bottom-up 24-bit BMP with a BITMAPINFOHEADER', () => {
      const bmp = bytesOf('BM', le32(54), le32(0), le32(54), le32(40), le32(640), le32(480), le16(1), le16(24));

      expect(probeImage(bmp)).toEqual({ format: 'bmp', width: 640, height: 480, animated: false, components: 3 });
    });

    it('should read a top-down 32-bit BMP as four components', () => {
      const bmp = bytesOf('BM', le32(0), le32(0), le32(54), le32(124), le32(20), le32(-10), le16(1), le16(32));

      expect(probeImage(bmp)).toEqual({ format: 'bmp', width: 20, height: 10, animated: false, components: 4 });
    });

    it('should read an OS/2 BMP core header', () => {
      const bmp = bytesOf('BM', le32(0), le32(0), le32(26), le32(12), le16(7), le16(5), le16(1), le16(8));

      expect(probeImage(bmp)).toEqual({ format: 'bmp', width: 7, height: 5, animated: false, components: 3 });
    });

    it('should read a big-endian TIFF whose dimensions are LONG values', () => {
      const entry = (tag: number, type: number, value: number): number[] => [
        ...be16(tag),
        ...be16(type),
        ...be32(1),
        ...(type === 3 ? [...be16(value), 0, 0] : be32(value)),
      ];
      const tiff = bytesOf(
        'MM',
        be16(42),
        be32(8),
        be16(3),
        entry(256, 4, 70_000),
        entry(257, 3, 300),
        entry(277, 3, 3),
        be32(0),
      );

      expect(probeImage(tiff)).toEqual({ format: 'tiff', width: 70_000, height: 300, animated: false, components: 3 });
    });

    it('should read a Photoshop header so a refusal can name the format', () => {
      const psd = bytesOf('8BPS', be16(1), [0, 0, 0, 0, 0, 0], be16(3), be32(600), be32(800));

      expect(probeImage(psd)).toEqual({ format: 'psd', width: 800, height: 600, animated: false, components: 3 });
    });

    it('should describe a 16384×16384 PNG from its header without decoding it', () => {
      const png = bytesOf(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        be32(13),
        'IHDR',
        be32(16_384),
        be32(16_384),
        8,
        6,
      );

      expect(probeImage(png)).toEqual({ format: 'png', width: 16_384, height: 16_384, animated: false, components: 4 });
    });

    it('should mark a PNG with an acTL chunk as animated and count tRNS as alpha', () => {
      const ihdr = bytesOf(be32(13), 'IHDR', be32(4), be32(4), 8, 2, 0, 0, 0, be32(0));
      const actl = bytesOf(be32(8), 'acTL', be32(2), be32(0), be32(0));
      const trns = bytesOf(be32(6), 'tRNS', [0, 0, 0, 0, 0, 0], be32(0));
      const idat = bytesOf(be32(0), 'IDAT', be32(0));
      const apng = bytesOf(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        [...ihdr],
        [...actl],
        [...trns],
        [...idat],
      );

      expect(probeImage(apng)).toEqual({ format: 'png', width: 4, height: 4, animated: true, components: 4 });
    });

    it('should skip JPEG fill bytes and metadata segments before the frame header', () => {
      const jpeg = bytesOf(
        [0xff, 0xd8, 0xff, 0xff, 0xe1],
        be16(6),
        'Exif',
        [0xff, 0xc2],
        be16(17),
        8,
        be16(3024),
        be16(4032),
        3,
      );

      expect(probeImage(jpeg)).toEqual({ format: 'jpeg', width: 4032, height: 3024, animated: false, components: 3 });
    });

    it('should return undefined for a JPEG whose scan starts before any frame header', () => {
      expect(probeImage(bytesOf([0xff, 0xd8, 0xff, 0xda], be16(8), [0, 0, 0, 0, 0, 0]))).toBeUndefined();
    });

    it('should return undefined for an image that declares a zero dimension', () => {
      const png = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(0), be32(10), 8, 2);

      expect(probeImage(png)).toBeUndefined();
    });

    it.each([
      ['empty input', new Uint8Array()],
      ['text', new TextEncoder().encode('hello, this is not an image at all')],
      ['a PDF', new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n')],
      ['an MP4 container', bytesOf(be32(24), 'ftyp', 'isom', be32(0), 'isom', 'mp41')],
      ['an SVG document', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ])('should return undefined for %s', (_name, bytes) => {
      expect(probeImage(bytes)).toBeUndefined();
    });

    it.each(Object.keys(expected))('should never throw or misreport the size of a truncated %s', (name) => {
      const bytes = fixture(name);
      const full = probeImage(bytes);
      for (let length = 0; length < Math.min(bytes.length, 2048); length += 1) {
        const prefix = probeImage(bytes.subarray(0, length));
        if (prefix !== undefined) {
          expect(prefix).toMatchObject({ format: full?.format, width: full?.width, height: full?.height });
        }
      }
    });

    it('should return undefined for every prefix of a JPEG that stops before its frame header', () => {
      const bytes = fixture('exif-rotated.jpg');
      const frame = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === 0xc0);

      expect(frame).toBeGreaterThan(100);
      expect(probeImage(bytes.subarray(0, frame + 9))).toBeUndefined();
      expect(probeImage(bytes.subarray(0, frame + 10))).toEqual(expected['exif-rotated.jpg']);
    });

    it('should read a view into a larger buffer at its own offset', () => {
      const png = fixture('card.png');
      const padded = new Uint8Array(png.length + 16);
      padded.set(png, 7);

      expect(probeImage(padded.subarray(7, 7 + png.length))).toEqual(expected['card.png']);
    });
  });

  describe('detectImageFormat', () => {
    it('should name the format from the first bytes alone', () => {
      expect(detectImageFormat(fixture('card.jpg').subarray(0, 3))).toBe('jpeg');
      expect(detectImageFormat(fixture('lossy.webp').subarray(0, 12))).toBe('webp');
      expect(detectImageFormat(fixture('small.heic').subarray(0, 64))).toBe('heic');
      expect(detectImageFormat(fixture('small.avif').subarray(0, 64))).toBe('avif');
    });

    it('should return undefined for bytes with no image signature', () => {
      expect(detectImageFormat(new TextEncoder().encode('%PDF-1.4'))).toBeUndefined();
    });
  });

  describe('imageFormats', () => {
    it('should give every format a media type and its canonical extension first', () => {
      expect(
        Object.fromEntries(
          Object.entries(imageFormats).map(([format, info]) => [format, [info.mediaType, info.extensions[0]]]),
        ),
      ).toEqual({
        jpeg: ['image/jpeg', 'jpg'],
        png: ['image/png', 'png'],
        webp: ['image/webp', 'webp'],
        gif: ['image/gif', 'gif'],
        avif: ['image/avif', 'avif'],
        heic: ['image/heic', 'heic'],
        bmp: ['image/bmp', 'bmp'],
        tiff: ['image/tiff', 'tif'],
        psd: ['image/vnd.adobe.photoshop', 'psd'],
      });
    });
  });
});
