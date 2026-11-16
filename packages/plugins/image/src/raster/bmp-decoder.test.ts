import { describe, expect, it } from 'vitest';
import { BmpDecodeError, decodeBmp } from '#raster/bmp-decoder.js';

type Bmp = {
  readonly width: number;
  readonly height: number;
  readonly bitsPerPixel: number;
  readonly topDown?: boolean;
  readonly compression?: number;
  readonly headerSize?: 40 | 56 | 108 | 124;
  readonly masks?: readonly number[];
  readonly palette?: ReadonlyArray<readonly [number, number, number]>;
  /** One callback per pixel writes its value into the row; rows are given top to bottom. */
  readonly pixel: (x: number, y: number) => number;
};

/** Write a BMP the way common encoders do: 14-byte file header, info header, masks, palette, padded rows. */
const writeBmp = ({
  width,
  height,
  bitsPerPixel,
  topDown = false,
  compression = 0,
  headerSize = 40,
  masks = [],
  palette = [],
  pixel,
}: Bmp): Uint8Array<ArrayBuffer> => {
  const maskBytes = headerSize === 40 ? masks.length * 4 : 0;
  const paletteOffset = 14 + headerSize + maskBytes;
  const pixelOffset = paletteOffset + palette.length * 4;
  const stride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const bytes = new Uint8Array(pixelOffset + stride * height);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, pixelOffset, true);
  view.setUint32(14, headerSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, topDown ? -height : height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bitsPerPixel, true);
  view.setUint32(30, compression, true);
  view.setUint32(46, palette.length, true);
  for (const [index, mask] of masks.entries()) {
    view.setUint32(54 + index * 4, mask, true);
  }
  for (const [index, [red, green, blue]] of palette.entries()) {
    bytes.set([blue, green, red, 0], paletteOffset + index * 4);
  }
  for (let y = 0; y < height; y += 1) {
    const rowStart = pixelOffset + (topDown ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      if (bitsPerPixel < 8) {
        const bit = x * bitsPerPixel;
        const byte = rowStart + Math.floor(bit / 8);
        bytes[byte]! += value * 2 ** (8 - bitsPerPixel - (bit % 8));
      } else {
        for (let index = 0; index < bitsPerPixel / 8; index += 1) {
          bytes[rowStart + x * (bitsPerPixel / 8) + index] = Math.floor(value / 256 ** index) % 256;
        }
      }
    }
  }
  return bytes;
};

const rgba = (image: { data: Uint8ClampedArray; width: number }, x: number, y: number): number[] => {
  const offset = (y * image.width + x) * 4;
  return [...image.data.subarray(offset, offset + 4)];
};

/** Quadrants of a 3×2 test card: top row red, green, blue; bottom row white, black, grey. */
const card = [
  [0xff_00_00, 0x00_ff_00, 0x00_00_ff],
  [0xff_ff_ff, 0x00_00_00, 0x80_80_80],
] as const;
const cardRgba = [
  [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ],
  [
    [255, 255, 255, 255],
    [0, 0, 0, 255],
    [128, 128, 128, 255],
  ],
];

const expectCard = (bytes: Uint8Array<ArrayBuffer>) => {
  const image = decodeBmp(bytes, 1000);
  expect({ width: image.width, height: image.height }).toEqual({ width: 3, height: 2 });
  expect([0, 1].map((y) => [0, 1, 2].map((x) => rgba(image, x, y)))).toEqual(cardRgba);
};

describe('decodeBmp', () => {
  describe('row order', () => {
    it('should read bottom-up rows, the default, top to bottom', () => {
      expectCard(writeBmp({ width: 3, height: 2, bitsPerPixel: 24, pixel: (x, y) => card[y]![x]! }));
    });

    it('should read top-down rows from a negative height', () => {
      expectCard(writeBmp({ width: 3, height: 2, bitsPerPixel: 24, topDown: true, pixel: (x, y) => card[y]![x]! }));
    });
  });

  describe('bit depths', () => {
    const palette = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
      [128, 128, 128],
    ] as const;

    it.each([4, 8])('should map %i-bit palette indices through the palette', (bitsPerPixel) => {
      expectCard(writeBmp({ width: 3, height: 2, bitsPerPixel, palette, pixel: (x, y) => y * 3 + x }));
    });

    it('should read a 1-bit palette image', () => {
      const image = decodeBmp(
        writeBmp({
          width: 10,
          height: 1,
          bitsPerPixel: 1,
          palette: [
            [0, 0, 0],
            [255, 255, 0],
          ],
          pixel: (x) => x % 2,
        }),
        1000,
      );
      expect([0, 1, 9].map((x) => rgba(image, x, 0))).toEqual([
        [0, 0, 0, 255],
        [255, 255, 0, 255],
        [255, 255, 0, 255],
      ]);
    });

    it('should read black for an index past the end of a short palette', () => {
      const image = decodeBmp(
        writeBmp({ width: 1, height: 1, bitsPerPixel: 8, palette: [[9, 9, 9]], pixel: () => 200 }),
        1000,
      );
      expect(rgba(image, 0, 0)).toEqual([0, 0, 0, 255]);
    });

    it('should read 16-bit pixels as 5-5-5 by default', () => {
      const toRgb555 = (rgb: number): number =>
        Math.round(Math.floor(rgb / 65_536) / 8.226) * 1024 +
        Math.round((Math.floor(rgb / 256) % 256) / 8.226) * 32 +
        Math.round((rgb % 256) / 8.226);
      const image = decodeBmp(
        writeBmp({ width: 3, height: 2, bitsPerPixel: 16, pixel: (x, y) => toRgb555(card[y]![x]!) }),
        1000,
      );
      expect(rgba(image, 0, 0)).toEqual([255, 0, 0, 255]);
      expect(rgba(image, 2, 1)).toEqual([132, 132, 132, 255]);
    });

    it('should read 32-bit pixels with their alpha byte', () => {
      const image = decodeBmp(
        writeBmp({ width: 2, height: 1, bitsPerPixel: 32, pixel: (x) => (x === 0 ? 0x80_ff_00_00 : 0xff_00_00_ff) }),
        1000,
      );
      expect([rgba(image, 0, 0), rgba(image, 1, 0)]).toEqual([
        [255, 0, 0, 128],
        [0, 0, 255, 255],
      ]);
    });

    it('should read a 32-bit image whose alpha bytes are all zero as opaque', () => {
      expectCard(writeBmp({ width: 3, height: 2, bitsPerPixel: 32, pixel: (x, y) => card[y]![x]! }));
    });
  });

  describe('BI_BITFIELDS', () => {
    it('should read 16-bit 5-6-5 masks after a 40-byte header', () => {
      const image = decodeBmp(
        writeBmp({
          width: 2,
          height: 1,
          bitsPerPixel: 16,
          compression: 3,
          masks: [0xf8_00, 0x07_e0, 0x00_1f],
          pixel: (x) => (x === 0 ? 0xf8_00 : 0x07_e0),
        }),
        1000,
      );
      expect([rgba(image, 0, 0), rgba(image, 1, 0)]).toEqual([
        [255, 0, 0, 255],
        [0, 255, 0, 255],
      ]);
    });

    it('should read 32-bit masks and an alpha mask inside a V5 header', () => {
      const bytes = writeBmp({
        width: 1,
        height: 1,
        bitsPerPixel: 32,
        compression: 3,
        headerSize: 124,
        pixel: () => 0x11_22_33_44,
      });
      const view = new DataView(bytes.buffer);
      // R in the low byte, G, B, then A in the high byte.
      for (const [index, mask] of [0x00_00_00_ff, 0x00_00_ff_00, 0x00_ff_00_00, 0xff_00_00_00].entries()) {
        view.setUint32(54 + index * 4, mask, true);
      }
      expect(rgba(decodeBmp(bytes, 1000), 0, 0)).toEqual([0x44, 0x33, 0x22, 0x11]);
    });
  });

  describe('refusals', () => {
    it.each([
      [1, 'RLE8-compressed BMP is not supported'],
      [2, 'RLE4-compressed BMP is not supported'],
      [4, 'JPEG-compressed BMP is not supported'],
      [5, 'PNG-compressed BMP is not supported'],
    ])('should refuse compression %i by name', (compression, message) => {
      const bytes = writeBmp({
        width: 1,
        height: 1,
        bitsPerPixel: 8,
        compression,
        palette: [[0, 0, 0]],
        pixel: () => 0,
      });
      expect(() => decodeBmp(bytes, 1000)).toThrow(new BmpDecodeError(message));
    });

    it('should refuse a truncated file without reading past its end', () => {
      const bytes = writeBmp({ width: 3, height: 2, bitsPerPixel: 24, pixel: (x, y) => card[y]![x]! });
      expect(() => decodeBmp(bytes.slice(0, -1), 1000)).toThrow('BMP pixel data is truncated');
      expect(() => decodeBmp(bytes.slice(0, 30), 1000)).toThrow('BMP header is truncated or of an unknown kind');
      expect(() => decodeBmp(bytes.slice(0, 10), 1000)).toThrow('Not a BMP file');
    });

    it('should fail every prefix and corrupted header with a BmpDecodeError, never a read past the end', () => {
      const sources = [
        writeBmp({ width: 3, height: 2, bitsPerPixel: 24, pixel: (x, y) => card[y]![x]! }),
        writeBmp({ width: 3, height: 2, bitsPerPixel: 4, palette: [[1, 2, 3]], pixel: () => 0 }),
        writeBmp({
          width: 2,
          height: 1,
          bitsPerPixel: 16,
          compression: 3,
          masks: [0xf8_00, 0x07_e0, 0x1f],
          pixel: () => 1,
        }),
      ];
      const outcomes = new Set<string>();
      for (const source of sources) {
        for (let length = 0; length < source.length; length += 1) {
          try {
            decodeBmp(source.slice(0, length), 1000);
            outcomes.add('decoded');
          } catch (error) {
            outcomes.add(error instanceof BmpDecodeError ? 'refused' : String(error));
          }
        }
        // Overwrite each header byte with 0xff in turn: offsets, sizes and counts become hostile.
        for (let index = 2; index < 54; index += 1) {
          const corrupted = new Uint8Array(source);
          corrupted[index] = 0xff;
          try {
            decodeBmp(corrupted, 1000);
            outcomes.add('decoded');
          } catch (error) {
            outcomes.add(error instanceof BmpDecodeError ? 'refused' : String(error));
          }
        }
      }
      expect([...outcomes].toSorted()).toEqual(['decoded', 'refused']);
    });

    it('should refuse a truncated palette or mask table', () => {
      const paletted = writeBmp({ width: 1, height: 1, bitsPerPixel: 8, palette: [[1, 2, 3]], pixel: () => 0 });
      new DataView(paletted.buffer).setUint32(46, 200, true);
      expect(() => decodeBmp(paletted, 1000)).toThrow('BMP palette is truncated');

      const masked = writeBmp({
        width: 1,
        height: 1,
        bitsPerPixel: 32,
        compression: 6,
        masks: [1, 2, 3, 4],
        pixel: () => 0,
      });
      expect(() => decodeBmp(masked.slice(0, 66), 1000)).toThrow('BMP colour masks are truncated');
    });

    it('should refuse an image over the pixel limit before allocating it', () => {
      const header = writeBmp({ width: 1, height: 1, bitsPerPixel: 24, pixel: () => 0 });
      const view = new DataView(header.buffer);
      view.setInt32(18, 100_000, true);
      view.setInt32(22, 100_000, true);
      expect(() => decodeBmp(header, 50_000_000)).toThrow('BMP of 100000×100000 exceeds 50000000 pixels');
    });

    it('should refuse unsupported depths, masks without 16 or 32 bits, and empty images', () => {
      const withDepth = (bitsPerPixel: number) => {
        const bytes = writeBmp({ width: 1, height: 1, bitsPerPixel: 24, pixel: () => 0 });
        new DataView(bytes.buffer).setUint16(28, bitsPerPixel, true);
        return bytes;
      };
      expect(() => decodeBmp(withDepth(2), 1000)).toThrow('BMP with 2 bits per pixel is not supported');
      const masked24 = writeBmp({
        width: 1,
        height: 1,
        bitsPerPixel: 24,
        compression: 3,
        masks: [1, 2, 3],
        pixel: () => 0,
      });
      expect(() => decodeBmp(masked24, 1000)).toThrow('BMP colour masks require 16 or 32 bits per pixel, not 24');
      const unknown = writeBmp({ width: 1, height: 1, bitsPerPixel: 24, compression: 9, pixel: () => 0 });
      expect(() => decodeBmp(unknown, 1000)).toThrow('BMP compression 9 is not supported');
      const empty = writeBmp({ width: 1, height: 1, bitsPerPixel: 24, pixel: () => 0 });
      new DataView(empty.buffer).setInt32(18, 0, true);
      expect(() => decodeBmp(empty, 1000)).toThrow('BMP has no pixels');
    });
  });

  it('should read an OS/2 core header with a three-byte palette', () => {
    const bytes = new Uint8Array(14 + 12 + 2 * 3 + 4);
    const view = new DataView(bytes.buffer);
    bytes.set([0x42, 0x4d]);
    view.setUint32(10, 14 + 12 + 6, true);
    view.setUint32(14, 12, true);
    view.setUint16(18, 1, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint16(24, 1, true);
    bytes.set([0, 0, 0, 255, 0, 0], 26);
    bytes[32] = 0x80;
    expect(rgba(decodeBmp(bytes, 1000), 0, 0)).toEqual([0, 0, 255, 255]);
  });
});
