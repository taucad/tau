/* oxlint-disable no-bitwise -- image headers pack dimensions and feature flags into bit fields */

/**
 * Image signature and header reader.
 *
 * Reads only container and frame headers, never pixel data, so it is cheap and
 * safe on untrusted bytes: it answers what an image is and how large it would
 * be when decoded before any decoder runs. Every host, the browser included,
 * labels attachments with it.
 */

/**
 * What Tau knows about an image format: its canonical media type and its file extensions, canonical first.
 *
 * @public
 */
export type ImageFormatInfo = {
  readonly mediaType: string;
  readonly extensions: readonly [string, ...string[]];
};

/**
 * Every image format {@link probeImage} recognises, with its media type and
 * extensions. Admission lists (`accept`, refusal copy) are built from these
 * names; there is no second table.
 *
 * @public
 */
export const imageFormats = {
  jpeg: { mediaType: 'image/jpeg', extensions: ['jpg', 'jpeg', 'jfif', 'jpe'] },
  png: { mediaType: 'image/png', extensions: ['png'] },
  webp: { mediaType: 'image/webp', extensions: ['webp'] },
  gif: { mediaType: 'image/gif', extensions: ['gif'] },
  avif: { mediaType: 'image/avif', extensions: ['avif'] },
  heic: { mediaType: 'image/heic', extensions: ['heic', 'heif'] },
  bmp: { mediaType: 'image/bmp', extensions: ['bmp', 'dib'] },
  tiff: { mediaType: 'image/tiff', extensions: ['tif', 'tiff'] },
  psd: { mediaType: 'image/vnd.adobe.photoshop', extensions: ['psd'] },
} as const satisfies Record<string, ImageFormatInfo>;

/**
 * An image format {@link probeImage} recognises.
 *
 * @public
 */
export type ImageFormat = keyof typeof imageFormats;

/**
 * What an image's headers say about it.
 *
 * `width` and `height` are the coded size, before any EXIF or container
 * rotation. `components` is the channel count of the primary image: 1 grey,
 * 2 grey with alpha, 3 colour, 4 colour with alpha (or CMYK for JPEG, PSD and
 * TIFF). `animated` is `true` when the file holds more than one frame meant
 * to be played: an animated GIF, PNG or WebP, or an AVIF or HEIF sequence.
 *
 * @public
 */
export type ImageProbe = {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly animated: boolean;
  readonly components: number;
};

type Header = Omit<ImageProbe, 'format'>;

type Reader = {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly view: DataView;
};

const has = (reader: Reader, offset: number, length: number): boolean =>
  offset >= 0 && length >= 0 && offset + length <= reader.bytes.length;

const matches = (bytes: Uint8Array<ArrayBuffer>, signature: readonly number[], offset = 0): boolean =>
  offset + signature.length <= bytes.length && signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (bytes: Uint8Array<ArrayBuffer>, offset: number, length: number): string | undefined =>
  offset + length <= bytes.length ? String.fromCodePoint(...bytes.subarray(offset, offset + length)) : undefined;

const u8 = (reader: Reader, offset: number): number | undefined =>
  has(reader, offset, 1) ? reader.view.getUint8(offset) : undefined;

const u16 = (reader: Reader, offset: number, littleEndian = false): number | undefined =>
  has(reader, offset, 2) ? reader.view.getUint16(offset, littleEndian) : undefined;

const u24le = (reader: Reader, offset: number): number | undefined =>
  has(reader, offset, 3)
    ? reader.view.getUint16(offset, true) + reader.view.getUint8(offset + 2) * 0x1_00_00
    : undefined;

const u32 = (reader: Reader, offset: number, littleEndian = false): number | undefined =>
  has(reader, offset, 4) ? reader.view.getUint32(offset, littleEndian) : undefined;

/** A header from its fields, or `undefined` when any is missing or not positive. */
const header = (
  [width, height]: readonly [number | undefined, number | undefined],
  components: number | undefined,
  animated = false,
): Header | undefined =>
  width !== undefined && height !== undefined && components !== undefined && width > 0 && height > 0 && components > 0
    ? { width, height, components, animated }
    : undefined;

/* ---------------------------------------------------------------- JPEG */

/** Start-of-frame markers: C0–CF except DHT (C4), JPG (C8) and DAC (CC). */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

const probeJpeg = (reader: Reader): Header | undefined => {
  let offset = 2;
  while (has(reader, offset, 2)) {
    if (reader.bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = reader.bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      // A fill byte before the marker.
      offset += 1;
      continue;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      // End of image, or scan data with no frame header before it.
      return undefined;
    }
    const length = u16(reader, offset + 2);
    if (length === undefined || length < 2) {
      return undefined;
    }
    if (isStartOfFrame(marker)) {
      return header([u16(reader, offset + 7), u16(reader, offset + 5)], u8(reader, offset + 9));
    }
    offset += 2 + length;
  }
  return undefined;
};

/* ----------------------------------------------------------------- PNG */

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const pngComponents: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 3, 4: 2, 6: 4 };

const probePng = (reader: Reader): Header | undefined => {
  if (ascii(reader.bytes, 12, 4) !== 'IHDR') {
    return undefined;
  }
  const colourType = u8(reader, 25);
  let components = colourType === undefined ? undefined : pngComponents[colourType];
  let animated = false;
  // Walk the chunks before the image data: `acTL` marks APNG, `tRNS` adds alpha.
  let offset = 8;
  while (has(reader, offset, 8)) {
    const length = u32(reader, offset) ?? 0;
    const type = ascii(reader.bytes, offset + 4, 4);
    if (type === 'IDAT' || type === 'IEND') {
      break;
    }
    if (type === 'acTL') {
      animated = true;
    } else if (type === 'tRNS' && components !== undefined && components !== 2 && components !== 4) {
      components += 1;
    }
    offset += 12 + length;
  }
  return header([u32(reader, 16), u32(reader, 20)], components, animated);
};

/* ---------------------------------------------------------------- WebP */

const probeWebp = (reader: Reader): Header | undefined => {
  const chunk = ascii(reader.bytes, 12, 4);
  if (chunk === 'VP8 ') {
    // Lossy key frame: a start code, then 14-bit width and height.
    if (!matches(reader.bytes, [0x9d, 0x01, 0x2a], 23)) {
      return undefined;
    }
    const width = u16(reader, 26, true);
    const height = u16(reader, 28, true);
    return header(
      [width === undefined ? undefined : width & 0x3f_ff, height === undefined ? undefined : height & 0x3f_ff],
      3,
    );
  }
  if (chunk === 'VP8L') {
    // Lossless: a signature byte, then 14-bit width-1 and height-1 and an alpha hint.
    const bits = u32(reader, 21, true);
    if (reader.bytes[20] !== 0x2f || bits === undefined) {
      return undefined;
    }
    return header([(bits & 0x3f_ff) + 1, ((bits >>> 14) & 0x3f_ff) + 1], (bits >>> 28) & 1 ? 4 : 3);
  }
  if (chunk === 'VP8X') {
    // Extended: feature flags, then 24-bit canvas width-1 and height-1.
    const flags = u8(reader, 20);
    const width = u24le(reader, 24);
    const height = u24le(reader, 27);
    if (flags === undefined || width === undefined || height === undefined) {
      return undefined;
    }
    return header([width + 1, height + 1], flags & 0x10 ? 4 : 3, (flags & 0x02) !== 0);
  }
  return undefined;
};

/* ----------------------------------------------------------------- GIF */

const colourTableBytes = (flags: number): number => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);

/** The offset after a run of data sub-blocks, which ends with a zero-length block. */
const skipSubBlocks = (reader: Reader, start: number): number => {
  let offset = start;
  while (offset < reader.bytes.length) {
    const size = reader.bytes[offset] ?? 0;
    offset += 1 + size;
    if (size === 0) {
      return offset;
    }
  }
  return offset;
};

const probeGif = (reader: Reader): Header | undefined => {
  const flags = u8(reader, 10);
  if (flags === undefined) {
    return undefined;
  }
  let offset = 13 + colourTableBytes(flags);
  let frames = 0;
  let transparent = false;
  // Count image descriptors up to the second one; a graphic control extension may declare transparency.
  while (offset < reader.bytes.length && frames < 2) {
    const block = reader.bytes[offset];
    if (block === 0x2c) {
      frames += 1;
      const localFlags = u8(reader, offset + 9);
      if (localFlags === undefined) {
        break;
      }
      offset = skipSubBlocks(reader, offset + 10 + colourTableBytes(localFlags) + 1);
    } else if (block === 0x21) {
      if (reader.bytes[offset + 1] === 0xf9 && ((reader.bytes[offset + 3] ?? 0) & 0x01) === 1) {
        transparent = true;
      }
      offset = skipSubBlocks(reader, offset + 2);
    } else {
      break;
    }
  }
  return header([u16(reader, 6, true), u16(reader, 8, true)], transparent ? 4 : 3, frames > 1);
};

/* ----------------------------------------------------------------- BMP */

const bmpBitDepths = new Set([1, 2, 4, 8, 16, 24, 32]);

const probeBmp = (reader: Reader): Header | undefined => {
  const dibSize = u32(reader, 14, true);
  if (dibSize === 12) {
    // OS/2 BITMAPCOREHEADER: 16-bit dimensions.
    const bits = u16(reader, 24, true);
    return bits !== undefined && bmpBitDepths.has(bits)
      ? header([u16(reader, 18, true), u16(reader, 20, true)], bits === 32 ? 4 : 3)
      : undefined;
  }
  if (dibSize === undefined || dibSize < 40 || !has(reader, 14, 16)) {
    return undefined;
  }
  // BITMAPINFOHEADER and later: signed 32-bit dimensions; a negative height is a top-down image.
  const bits = u16(reader, 28, true);
  const height = reader.view.getInt32(22, true);
  return bits !== undefined && bmpBitDepths.has(bits)
    ? header([reader.view.getInt32(18, true), Math.abs(height)], bits === 32 ? 4 : 3)
    : undefined;
};

/* ---------------------------------------------------------------- TIFF */

const tiffTag = { width: 256, height: 257, samplesPerPixel: 277 } as const;

const probeTiff = (reader: Reader): Header | undefined => {
  const littleEndian = reader.bytes[0] === 0x49;
  const directory = u32(reader, 4, littleEndian);
  const count = directory === undefined ? undefined : u16(reader, directory, littleEndian);
  if (directory === undefined || count === undefined) {
    return undefined;
  }
  const values = new Map<number, number>();
  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    const tag = u16(reader, entry, littleEndian);
    const type = u16(reader, entry + 2, littleEndian);
    if (tag === undefined || type === undefined) {
      return undefined;
    }
    // SHORT (3) and LONG (4) values of count 1 sit inline in the entry.
    const value =
      type === 3 ? u16(reader, entry + 8, littleEndian) : type === 4 ? u32(reader, entry + 8, littleEndian) : undefined;
    if (value !== undefined) {
      values.set(tag, value);
    }
  }
  return header([values.get(tiffTag.width), values.get(tiffTag.height)], values.get(tiffTag.samplesPerPixel) ?? 1);
};

/* ----------------------------------------------------------------- PSD */

const probePsd = (reader: Reader): Header | undefined => {
  const version = u16(reader, 4);
  return version === 1 || version === 2 ? header([u32(reader, 18), u32(reader, 14)], u16(reader, 12)) : undefined;
};

/* ------------------------------------------------------ AVIF and HEIF */

const avifBrands = new Set(['avif', 'avis']);
const heifBrands = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);
const sequenceBrands = new Set(['avis', 'hevc', 'hevx', 'hevm', 'hevs', 'msf1']);

type Box = { readonly type: string; readonly start: number; readonly end: number; readonly body: number };

/** The ISO-BMFF boxes between `start` and `end`; stops at the first box that does not fit. */
const boxes = (reader: Reader, start: number, end: number): Box[] => {
  const found: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = u32(reader, offset) ?? 0;
    const type = ascii(reader.bytes, offset + 4, 4) ?? '';
    let body = offset + 8;
    let size = size32;
    if (size32 === 1) {
      if (!has(reader, offset + 8, 8)) {
        break;
      }
      size = Number(reader.view.getBigUint64(offset + 8));
      body += 8;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < body - offset || offset + size > end) {
      break;
    }
    found.push({ type, start: offset, end: offset + size, body });
    offset += size;
  }
  return found;
};

const brandsOf = (reader: Reader): { readonly major: string; readonly all: ReadonlySet<string> } | undefined => {
  const [ftyp] = boxes(reader, 0, Math.min(reader.bytes.length, 4096));
  if (ftyp?.type !== 'ftyp' || ftyp.start !== 0) {
    return undefined;
  }
  const major = ascii(reader.bytes, ftyp.body, 4);
  if (major === undefined) {
    return undefined;
  }
  const all = new Set([major]);
  for (let offset = ftyp.body + 8; offset + 4 <= ftyp.end; offset += 4) {
    all.add(ascii(reader.bytes, offset, 4) ?? '');
  }
  return { major, all };
};

const isoFormat = (reader: Reader): 'avif' | 'heic' | undefined => {
  const brands = brandsOf(reader);
  if (brands === undefined) {
    return undefined;
  }
  if ([...brands.all].some((brand) => avifBrands.has(brand))) {
    return 'avif';
  }
  return [...brands.all].some((brand) => heifBrands.has(brand)) ? 'heic' : undefined;
};

/** The property indices (1-based) associated with one item, from an `ipma` box. */
const associationsOf = (reader: Reader, ipma: Box, itemId: number): number[] | undefined => {
  const version = u8(reader, ipma.body);
  const flags = u24le(reader, ipma.body + 1);
  const entries = u32(reader, ipma.body + 4);
  if (version === undefined || flags === undefined || entries === undefined) {
    return undefined;
  }
  const wideIndex = (flags & 0x01) === 1;
  let offset = ipma.body + 8;
  for (let entry = 0; entry < entries; entry += 1) {
    const id = version < 1 ? u16(reader, offset) : u32(reader, offset);
    offset += version < 1 ? 2 : 4;
    const count = u8(reader, offset);
    if (id === undefined || count === undefined) {
      return undefined;
    }
    offset += 1;
    const indices: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const value = wideIndex ? u16(reader, offset) : u8(reader, offset);
      if (value === undefined) {
        return undefined;
      }
      indices.push(wideIndex ? value & 0x7f_ff : value & 0x7f);
      offset += wideIndex ? 2 : 1;
    }
    if (id === itemId) {
      return indices;
    }
  }
  return undefined;
};

const probeIso = (reader: Reader): Header | undefined => {
  const brands = brandsOf(reader);
  const meta = boxes(reader, 0, reader.bytes.length).find((box) => box.type === 'meta');
  if (brands === undefined || meta === undefined) {
    return undefined;
  }
  // `meta` is a full box: four bytes of version and flags precede its children.
  const children = boxes(reader, meta.body + 4, meta.end);
  const pitm = children.find((box) => box.type === 'pitm');
  const iprp = children.find((box) => box.type === 'iprp');
  const iprpChildren = iprp === undefined ? [] : boxes(reader, iprp.body, iprp.end);
  const ipco = iprpChildren.find((box) => box.type === 'ipco');
  if (ipco === undefined) {
    return undefined;
  }
  const properties = boxes(reader, ipco.body, ipco.end);
  const pitmVersion = pitm === undefined ? undefined : u8(reader, pitm.body);
  const primary =
    pitm === undefined ? undefined : pitmVersion === 0 ? u16(reader, pitm.body + 4) : u32(reader, pitm.body + 4);
  const ipma = iprpChildren.find((box) => box.type === 'ipma');
  const associated =
    primary === undefined || ipma === undefined
      ? undefined
      : associationsOf(reader, ipma, primary)?.flatMap((index) => properties[index - 1] ?? []);
  // Without an association for the primary item, the largest declared extent is the full image.
  const area = (box: Box): number => (u32(reader, box.body + 4) ?? 0) * (u32(reader, box.body + 8) ?? 0);
  const ispe =
    associated?.find((box) => box.type === 'ispe') ??
    properties.filter((box) => box.type === 'ispe').toSorted((a, b) => area(b) - area(a))[0];
  if (ispe === undefined) {
    return undefined;
  }
  const pixi = (associated ?? properties).find((box) => box.type === 'pixi');
  const components = pixi === undefined ? 3 : u8(reader, pixi.body + 4);
  return header([u32(reader, ispe.body + 4), u32(reader, ispe.body + 8)], components, sequenceBrands.has(brands.major));
};

/* ---------------------------------------------------------------- API */

/**
 * The image format named by a file's leading bytes, from its signature alone.
 *
 * Needs at most the first few dozen bytes (AVIF and HEIF: the `ftyp` box), and
 * says nothing about whether the rest is well formed. Use {@link probeImage}
 * to read the size.
 *
 * @param bytes - The file's leading bytes, or all of them.
 * @returns The format, or `undefined` when the signature is not an image Tau recognises.
 * @public
 */
export const detectImageFormat = (bytes: Uint8Array<ArrayBuffer>): ImageFormat | undefined => {
  if (matches(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (matches(bytes, pngSignature)) {
    return 'png';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  const six = ascii(bytes, 0, 6);
  if (six === 'GIF87a' || six === 'GIF89a') {
    return 'gif';
  }
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length >= 18) {
    return 'bmp';
  }
  if (matches(bytes, [0x49, 0x49, 0x2a, 0x00]) || matches(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'tiff';
  }
  if (ascii(bytes, 0, 4) === '8BPS') {
    return 'psd';
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    return isoFormat({ bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
  }
  return undefined;
};

const probes: Readonly<Record<ImageFormat, (reader: Reader) => Header | undefined>> = {
  jpeg: probeJpeg,
  png: probePng,
  webp: probeWebp,
  gif: probeGif,
  avif: probeIso,
  heic: probeIso,
  bmp: probeBmp,
  tiff: probeTiff,
  psd: probePsd,
};

/**
 * Read an image's format, size, channel count and animation flag from its headers.
 *
 * Never decodes pixels: the work is bounded by the header layout, so a
 * 16384×16384 image is described as cheaply as a thumbnail. JPEG needs the
 * bytes up to its frame header (after any EXIF block); AVIF and HEIF need the
 * `meta` box; the others need a few dozen bytes. An animated GIF is recognised
 * once its second frame is present.
 *
 * @param bytes - The file's bytes, or a prefix long enough to hold its headers.
 * @returns The probe, or `undefined` for bytes that are not a recognised image
 *   or whose headers are truncated or malformed.
 * @public
 */
export const probeImage = (bytes: Uint8Array<ArrayBuffer>): ImageProbe | undefined => {
  const format = detectImageFormat(bytes);
  if (format === undefined) {
    return undefined;
  }
  const result = probes[format]({ bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
  return result === undefined ? undefined : { format, ...result };
};
