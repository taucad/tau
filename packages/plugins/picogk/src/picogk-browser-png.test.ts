import { crc32, deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { validatePicogkPng } from '#picogk-browser-png.js';

const integer = (value: number): Uint8Array<ArrayBuffer> => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};
const chunk = (type: string, bytes: Uint8Array<ArrayBuffer> = new Uint8Array()): Uint8Array<ArrayBuffer> => {
  const content = Buffer.concat([Buffer.from(type), bytes]);
  return Buffer.concat([integer(bytes.length), content, integer(crc32(content))]);
};
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const header = (
  options: { width?: number; height?: number; depth?: number; color?: number; interlace?: number } = {},
) =>
  chunk(
    'IHDR',
    Buffer.concat([
      integer(options.width ?? 2),
      integer(options.height ?? 2),
      Buffer.from([options.depth ?? 8, options.color ?? 6, 0, 0, options.interlace ?? 0]),
    ]),
  );
const png = (...chunks: Array<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> =>
  Buffer.concat([signature, ...chunks]);
const raster = (bytes = Buffer.alloc(18)) => chunk('IDAT', new Uint8Array(deflateSync(bytes)));
const end = chunk('IEND');
const frame = (sequence: number, width = 2, height = 2) =>
  chunk(
    'fcTL',
    Buffer.concat([
      integer(sequence),
      integer(width),
      integer(height),
      integer(0),
      integer(0),
      Buffer.from([0, 1, 0, 10, 0, 0]),
    ]),
  );

describe('PicoGK PNG raster admission', () => {
  it('should validate complete static and Adam7 rasters', async () => {
    await expect(validatePicogkPng(png(header(), raster(), end))).resolves.toBe(1);
    // The 2x2 Adam7 image has three nonempty passes: 1px, 1px, then 2px.
    await expect(validatePicogkPng(png(header({ interlace: 1 }), raster(Buffer.alloc(19)), end))).resolves.toBe(1);
  });

  it('should decode every APNG frame, including a separate default poster', async () => {
    const animation = chunk('acTL', Buffer.concat([integer(2), integer(0)]));
    const second = chunk('fdAT', Buffer.concat([integer(2), deflateSync(Buffer.alloc(18))]));
    await expect(validatePicogkPng(png(header(), animation, frame(0), raster(), frame(1), second, end))).resolves.toBe(
      2,
    );
    const poster = chunk('acTL', Buffer.concat([integer(1), integer(0)]));
    const afterPoster = chunk('fdAT', Buffer.concat([integer(1), deflateSync(Buffer.alloc(18))]));
    await expect(validatePicogkPng(png(header(), poster, raster(), frame(0), afterPoster, end))).resolves.toBe(1);
  });

  it('should reject a damaged later frame even with valid chunk CRCs', async () => {
    const animation = chunk('acTL', Buffer.concat([integer(2), integer(0)]));
    const damaged = chunk('fdAT', Buffer.concat([integer(2), Buffer.from([0, 1, 2, 3])]));
    await expect(
      validatePicogkPng(png(header(), animation, frame(0), raster(), frame(1), damaged, end)),
    ).rejects.toThrow();
  });

  it.each([17, 19])('should reject a raster with %i bytes instead of 18', async (length) => {
    await expect(validatePicogkPng(png(header(), raster(Buffer.alloc(length)), end))).rejects.toThrow();
  });

  it('should reject invalid scanline filters and CRCs', async () => {
    const badFilter = Buffer.alloc(18);
    badFilter[9] = 5;
    await expect(validatePicogkPng(png(header(), raster(badFilter), end))).rejects.toThrow();
    const invalid = png(header(), raster(), end);
    invalid[invalid.length - 1] = invalid.at(-1)! + 1;
    await expect(validatePicogkPng(invalid)).rejects.toThrow();
  });

  it.each([
    { width: 0 },
    { height: 0 },
    { width: 100_000, height: 100_000 },
    { color: 1 },
    { depth: 3 },
    { color: 3, depth: 16 },
    { color: 6, depth: 4 },
    { interlace: 2 },
  ])('should reject invalid or oversized image metadata %j', async (options) => {
    await expect(validatePicogkPng(png(header(options), raster(), end))).rejects.toThrow();
  });

  it('should reject missing data, missing trailers and truncated chunk lengths', async () => {
    await expect(validatePicogkPng(new Uint8Array())).rejects.toThrow();
    await expect(validatePicogkPng(png(header(), end))).rejects.toThrow();
    await expect(validatePicogkPng(png(header(), raster()))).rejects.toThrow();
    await expect(validatePicogkPng(png(header(), raster(), new Uint8Array([0])))).rejects.toThrow();
    await expect(validatePicogkPng(png(header(), integer(100), Buffer.from('IDAT'), end))).rejects.toThrow();
    await expect(validatePicogkPng(png(header(), raster(), end, new Uint8Array([0])))).rejects.toThrow();
  });
  it.each([
    ['animation after pixels', [header(), raster(), chunk('acTL', Buffer.concat([integer(1), integer(0)])), end]],
    ['zero animation frames', [header(), chunk('acTL', Buffer.alloc(8)), raster(), end]],
    ['frame without animation', [header(), frame(0), raster(), end]],
    [
      'frame beyond canvas',
      [header(), chunk('acTL', Buffer.concat([integer(1), integer(0)])), frame(0, 3), raster(), end],
    ],
    [
      'partial default frame',
      [header(), chunk('acTL', Buffer.concat([integer(1), integer(0)])), frame(0, 1), raster(), end],
    ],
    [
      'IDAT in later frame',
      [header(), chunk('acTL', Buffer.concat([integer(1), integer(0)])), raster(), frame(0), raster(), end],
    ],
    ['fdAT without frame', [header(), chunk('fdAT', integer(0)), raster(), end]],
    [
      'empty animation raster',
      [header(), chunk('acTL', Buffer.concat([integer(1), integer(0)])), raster(), frame(0), end],
    ],
  ] as const)('should reject %s', async (_name, chunks) => {
    await expect(validatePicogkPng(png(...chunks))).rejects.toThrow();
  });

  it('should reject a wrong first chunk even when its fields and checksum look valid', async () => {
    const payload = Buffer.concat([integer(2), integer(2), Buffer.from([8, 6, 0, 0, 0])]);
    await expect(validatePicogkPng(png(chunk('fake', payload), raster(), end))).rejects.toThrow();
  });
});
