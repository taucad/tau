/**
 * A bounded BMP reader that runs unchanged in every host.
 *
 * `bmp-ts` was the planned reader, but it reads Node's global `Buffer` (`Buffer.alloc` for its output and
 * `readUInt16LE`/`toString` on its input), so it fails in a browser or Electron renderer worker. This reader
 * covers the uncompressed variants that cameras, scanners and paint programs write: 1, 4 and 8 bits per pixel with
 * a palette, 16, 24 and 32 bits per pixel, `BI_BITFIELDS` masks, top-down and bottom-up rows. Run-length, JPEG and
 * PNG payloads are refused by name. Every offset and length is checked against the buffer before it is read, and
 * the pixel count is checked before the output is allocated.
 */

/* oxlint-disable no-bitwise -- BMP pixels are packed bit fields; masks, shifts and nibbles are their definition. */

import type { RasterImage } from '#raster/raster-image.js';

const fileHeaderSize = 14;
const coreHeaderSize = 12;
const infoHeaderSize = 40;

const compressionNames: Readonly<Record<number, string>> = {
  1: 'RLE8',
  2: 'RLE4',
  4: 'JPEG',
  5: 'PNG',
};

/** A BMP the reader cannot or will not decode, with a message that names the reason. */
export class BmpDecodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BmpDecodeError';
  }
}

type ChannelMask = { readonly mask: number; readonly shift: number; readonly max: number };

const channelMask = (mask: number): ChannelMask | undefined => {
  const unsigned = mask >>> 0;
  if (unsigned === 0) {
    return undefined;
  }
  let shift = 0;
  while (((unsigned >>> shift) & 1) === 0) {
    shift += 1;
  }
  return { mask: unsigned, shift, max: unsigned >>> shift };
};

const scaleChannel = (pixel: number, channel: ChannelMask | undefined, fallback: number): number =>
  channel === undefined ? fallback : Math.round((((pixel & channel.mask) >>> channel.shift) * 255) / channel.max);

type Header = {
  readonly width: number;
  readonly height: number;
  readonly topDown: boolean;
  readonly bitsPerPixel: number;
  readonly compression: number;
  readonly headerSize: number;
  readonly colorsUsed: number;
  readonly pixelOffset: number;
};

const readHeader = (view: DataView): Header => {
  if (view.byteLength < fileHeaderSize + 4 || view.getUint8(0) !== 0x42 || view.getUint8(1) !== 0x4d) {
    throw new BmpDecodeError('Not a BMP file');
  }
  const pixelOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize === coreHeaderSize) {
    if (view.byteLength < fileHeaderSize + coreHeaderSize) {
      throw new BmpDecodeError('BMP header is truncated');
    }
    return {
      width: view.getUint16(18, true),
      height: view.getUint16(20, true),
      topDown: false,
      bitsPerPixel: view.getUint16(24, true),
      compression: 0,
      headerSize,
      colorsUsed: 0,
      pixelOffset,
    };
  }
  if (headerSize < infoHeaderSize || view.byteLength < fileHeaderSize + infoHeaderSize) {
    throw new BmpDecodeError('BMP header is truncated or of an unknown kind');
  }
  const signedHeight = view.getInt32(22, true);
  return {
    width: view.getInt32(18, true),
    height: Math.abs(signedHeight),
    topDown: signedHeight < 0,
    bitsPerPixel: view.getUint16(28, true),
    compression: view.getUint32(30, true),
    headerSize,
    colorsUsed: view.getUint32(46, true),
    pixelOffset,
  };
};

type Masks = {
  readonly red: ChannelMask | undefined;
  readonly green: ChannelMask | undefined;
  readonly blue: ChannelMask | undefined;
  readonly alpha: ChannelMask | undefined;
};

const readMasks = (view: DataView, header: Header): Masks => {
  if (header.compression === 0) {
    return header.bitsPerPixel === 16
      ? { red: channelMask(0x7c_00), green: channelMask(0x03_e0), blue: channelMask(0x00_1f), alpha: undefined }
      : {
          red: channelMask(0xff_00_00),
          green: channelMask(0xff_00),
          blue: channelMask(0xff),
          alpha: channelMask(0xff_00_00_00),
        };
  }
  // BI_BITFIELDS (3) or BI_ALPHABITFIELDS (6): the masks follow a 40-byte header, or sit inside a larger one.
  const hasAlphaMask = header.compression === 6 || header.headerSize >= 56;
  const end = fileHeaderSize + infoHeaderSize + (hasAlphaMask ? 16 : 12);
  if (view.byteLength < end) {
    throw new BmpDecodeError('BMP colour masks are truncated');
  }
  const base = fileHeaderSize + infoHeaderSize;
  return {
    red: channelMask(view.getUint32(base, true)),
    green: channelMask(view.getUint32(base + 4, true)),
    blue: channelMask(view.getUint32(base + 8, true)),
    alpha: hasAlphaMask ? channelMask(view.getUint32(base + 12, true)) : undefined,
  };
};

const readPalette = (view: DataView, header: Header): Uint8Array<ArrayBuffer> => {
  const maxColors = 2 ** header.bitsPerPixel;
  const count = header.colorsUsed === 0 ? maxColors : Math.min(header.colorsUsed, maxColors);
  const entrySize = header.headerSize === coreHeaderSize ? 3 : 4;
  const start =
    fileHeaderSize + header.headerSize + (header.compression === 3 && header.headerSize === infoHeaderSize ? 12 : 0);
  if (start + count * entrySize > Math.min(view.byteLength, header.pixelOffset)) {
    throw new BmpDecodeError('BMP palette is truncated');
  }
  const palette = new Uint8Array(maxColors * 3);
  for (let index = 0; index < count; index += 1) {
    const entry = start + index * entrySize;
    palette[index * 3] = view.getUint8(entry + 2);
    palette[index * 3 + 1] = view.getUint8(entry + 1);
    palette[index * 3 + 2] = view.getUint8(entry);
  }
  return palette;
};

const validate = (header: Header, maxPixels: number): void => {
  const name = compressionNames[header.compression];
  if (name !== undefined) {
    throw new BmpDecodeError(`${name}-compressed BMP is not supported`);
  }
  if (header.compression !== 0 && header.compression !== 3 && header.compression !== 6) {
    throw new BmpDecodeError(`BMP compression ${header.compression} is not supported`);
  }
  if (![1, 4, 8, 16, 24, 32].includes(header.bitsPerPixel)) {
    throw new BmpDecodeError(`BMP with ${header.bitsPerPixel} bits per pixel is not supported`);
  }
  if (header.compression !== 0 && header.bitsPerPixel !== 16 && header.bitsPerPixel !== 32) {
    throw new BmpDecodeError(`BMP colour masks require 16 or 32 bits per pixel, not ${header.bitsPerPixel}`);
  }
  if (header.width <= 0 || header.height <= 0) {
    throw new BmpDecodeError('BMP has no pixels');
  }
  if (header.width * header.height > maxPixels) {
    throw new BmpDecodeError(`BMP of ${header.width}×${header.height} exceeds ${maxPixels} pixels`);
  }
};

const readPixel = (view: DataView, offset: number, bitsPerPixel: number): number => {
  if (bitsPerPixel === 32) {
    return view.getUint32(offset, true);
  }
  if (bitsPerPixel === 24) {
    return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
  }
  return view.getUint16(offset, true);
};

const paletteIndex = (
  view: DataView,
  rowStart: number,
  { column, bitsPerPixel }: { readonly column: number; readonly bitsPerPixel: number },
): number => {
  const bitOffset = column * bitsPerPixel;
  const byte = view.getUint8(rowStart + (bitOffset >>> 3));
  return (byte >>> (8 - bitsPerPixel - (bitOffset & 7))) & ((1 << bitsPerPixel) - 1);
};

/**
 * Decode an uncompressed BMP to RGBA.
 *
 * @param bytes - The complete file.
 * @param maxPixels - Largest pixel count to allocate for; checked against the header before allocating.
 * @returns The decoded image, rows top to bottom.
 * @throws {BmpDecodeError} When the file is truncated, malformed, compressed or larger than `maxPixels`.
 */
export const decodeBmp = (bytes: Uint8Array<ArrayBuffer>, maxPixels: number): RasterImage => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = readHeader(view);
  validate(header, maxPixels);
  const { width, height, bitsPerPixel } = header;
  const palette = bitsPerPixel <= 8 ? readPalette(view, header) : undefined;
  const masks = palette === undefined ? readMasks(view, header) : undefined;
  const stride = Math.ceil((width * bitsPerPixel) / 32) * 4;
  if (
    header.pixelOffset < fileHeaderSize + header.headerSize ||
    header.pixelOffset + stride * height > bytes.byteLength
  ) {
    throw new BmpDecodeError('BMP pixel data is truncated');
  }

  const data = new Uint8ClampedArray(width * height * 4);
  let anyAlpha = false;
  for (let row = 0; row < height; row += 1) {
    const rowStart = header.pixelOffset + (header.topDown ? row : height - 1 - row) * stride;
    for (let column = 0; column < width; column += 1) {
      const out = (row * width + column) * 4;
      if (palette !== undefined) {
        const index = paletteIndex(view, rowStart, { column, bitsPerPixel }) * 3;
        data[out] = palette[index]!;
        data[out + 1] = palette[index + 1]!;
        data[out + 2] = palette[index + 2]!;
        data[out + 3] = 255;
        continue;
      }
      const pixel = readPixel(view, rowStart + column * (bitsPerPixel / 8), bitsPerPixel);
      data[out] = scaleChannel(pixel, masks!.red, 0);
      data[out + 1] = scaleChannel(pixel, masks!.green, 0);
      data[out + 2] = scaleChannel(pixel, masks!.blue, 0);
      const alpha = scaleChannel(pixel, masks!.alpha, 255);
      data[out + 3] = alpha;
      anyAlpha ||= alpha !== 0;
    }
  }
  // An uncompressed 32-bit BMP often leaves its fourth byte zero; read that as opaque, as browsers do.
  if (masks?.alpha !== undefined && !anyAlpha) {
    for (let index = 3; index < data.length; index += 4) {
      data[index] = 255;
    }
  }
  return { data, width, height };
};
