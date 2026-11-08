/* oxlint-disable no-bitwise -- a zip entry's flags are a bit field. */
/**
 * Decoding a zip entry's stored name (APPNOTE 4.4.4 bit 11, appendix D).
 *
 * A name is UTF-8 when its entry sets the language-encoding flag. Without
 * the flag the format says IBM code page 437, which is what DOS and Windows
 * tools wrote. Many tools that leave the flag unset still write UTF-8 (the
 * macOS archiver among them), and a valid multi-byte UTF-8 sequence almost
 * never occurs in real CP437 text, so an unflagged name that decodes as
 * strict UTF-8 is taken as UTF-8 and anything else as CP437. An Info-ZIP
 * Unicode Path extra field (0x7075) whose CRC matches the stored name wins
 * over both.
 *
 * @module
 */

import { crc32 } from '#importer/crc32.js';

/** The language-encoding flag: the name and comment are UTF-8. */
const utf8Flag = 0x08_00;
const unicodePathExtraId = 0x70_75;

/* Code page 437's upper half, 0x80 to 0xff. The lower half is ASCII. */
const cp437High =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00A0';

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const utf8 = new TextDecoder();

/**
 * Decode CP437 bytes. Control bytes below 0x20 stay as their code points, so
 * the path policy still refuses them.
 *
 * @param bytes - The stored name.
 * @returns The decoded name.
 */
const decodeCp437 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let name = '';
  for (const byte of bytes) {
    name += byte < 0x80 ? String.fromCodePoint(byte) : cp437High[byte - 0x80]!;
  }
  return name;
};

/* The Info-ZIP Unicode Path field, when its CRC names exactly these stored bytes. */
const unicodePath = (extra: DataView, stored: Uint8Array<ArrayBuffer>): string | undefined => {
  let at = 0;
  while (at + 4 <= extra.byteLength) {
    const id = extra.getUint16(at, true);
    const length = extra.getUint16(at + 2, true);
    const end = at + 4 + length;
    if (end > extra.byteLength) {
      return undefined;
    }
    if (id === unicodePathExtraId && length >= 5 && extra.getUint8(at + 4) === 1) {
      if (extra.getUint32(at + 5, true) !== crc32(stored)) {
        return undefined;
      }
      try {
        return strictUtf8.decode(new Uint8Array(extra.buffer, extra.byteOffset + at + 9, length - 5));
      } catch {
        return undefined;
      }
    }
    at = end;
  }
  return undefined;
};

/**
 * Decode an entry's stored name by its flags and extra field.
 *
 * @param stored - The name's bytes.
 * @param flags - The entry's general-purpose flags.
 * @param extra - The entry's extra field.
 * @returns The name.
 * @public
 */
export const decodeZipName = (stored: Uint8Array<ArrayBuffer>, flags: number, extra: DataView): string => {
  if ((flags & utf8Flag) !== 0) {
    return utf8.decode(stored);
  }
  const fromField = unicodePath(extra, stored);
  if (fromField !== undefined) {
    return fromField;
  }
  try {
    return strictUtf8.decode(stored);
  } catch {
    return decodeCp437(stored);
  }
};
