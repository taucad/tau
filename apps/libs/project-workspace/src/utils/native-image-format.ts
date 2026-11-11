export type NativeImageFormatId = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'bmp' | 'ico' | 'svg';

export type NativeImageFormat = {
  readonly id: NativeImageFormatId;
  readonly mimeType: string;
};

export const nativeImageFormats = {
  png: { id: 'png', mimeType: 'image/png' },
  jpeg: { id: 'jpeg', mimeType: 'image/jpeg' },
  gif: { id: 'gif', mimeType: 'image/gif' },
  webp: { id: 'webp', mimeType: 'image/webp' },
  avif: { id: 'avif', mimeType: 'image/avif' },
  bmp: { id: 'bmp', mimeType: 'image/bmp' },
  ico: { id: 'ico', mimeType: 'image/x-icon' },
  svg: { id: 'svg', mimeType: 'image/svg+xml' },
} as const satisfies Record<NativeImageFormatId, NativeImageFormat>;

const hasBytes = (bytes: Uint8Array<ArrayBuffer>, expected: readonly number[], offset = 0): boolean =>
  expected.every((byte, index) => bytes[offset + index] === byte);

const hasAscii = (bytes: Uint8Array<ArrayBuffer>, expected: string, offset = 0): boolean =>
  [...expected].every((character, index) => bytes[offset + index] === character.codePointAt(0));

const isAvif = (bytes: Uint8Array<ArrayBuffer>): boolean => {
  if (bytes.byteLength < 16 || !hasAscii(bytes, 'ftyp', 4)) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxSize = view.getUint32(0);
  const end = Math.min(boxSize, bytes.byteLength);
  if (boxSize < 16) {
    return false;
  }
  if (hasAscii(bytes, 'avif', 8) || hasAscii(bytes, 'avis', 8)) {
    return true;
  }
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (hasAscii(bytes, 'avif', offset) || hasAscii(bytes, 'avis', offset)) {
      return true;
    }
  }
  return false;
};

const isSvg = (bytes: Uint8Array<ArrayBuffer>): boolean => {
  const prefix = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, '')
    .trimStart();
  let cursor = prefix;
  while (cursor.startsWith('<?xml') || cursor.startsWith('<!--')) {
    const end = cursor.indexOf(cursor.startsWith('<?xml') ? '?>' : '-->');
    if (end === -1) {
      return false;
    }
    cursor = cursor.slice(end + (cursor.startsWith('<?xml') ? 2 : 3)).trimStart();
  }
  return /^<svg(?:\s|>|\/)/u.test(cursor);
};

/** Detect browser-native image content from a bounded byte prefix. */
export const sniffNativeImageFormat = (
  bytes: Uint8Array<ArrayBuffer>,
  options: { readonly allowSvg: boolean },
): NativeImageFormat | undefined => {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return nativeImageFormats.png;
  }
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return nativeImageFormats.jpeg;
  }
  if (hasAscii(bytes, 'GIF87a') || hasAscii(bytes, 'GIF89a')) {
    return nativeImageFormats.gif;
  }
  if (hasAscii(bytes, 'RIFF') && hasAscii(bytes, 'WEBP', 8)) {
    return nativeImageFormats.webp;
  }
  if (isAvif(bytes)) {
    return nativeImageFormats.avif;
  }
  if (hasAscii(bytes, 'BM')) {
    return nativeImageFormats.bmp;
  }
  if (hasBytes(bytes, [0x00, 0x00, 0x01, 0x00])) {
    return nativeImageFormats.ico;
  }
  if (options.allowSvg && isSvg(bytes)) {
    return nativeImageFormats.svg;
  }
  return undefined;
};
