/**
 * Git object hashing for both object formats, in plain TypeScript so the
 * browser adapter computes the same commit ids as a native engine in every
 * realm, including insecure origins where `crypto.subtle` is unavailable and
 * realms with no `node:crypto`.
 *
 * The implementations are the ones qualified byte-for-byte against the pinned
 * Jujutsu binary by the dual-target revision-algebra spike (S2 object gate).
 *
 * ponytail: `@taucad/utils/hash` already has a synchronous SHA-256. It is not
 * reused here because it has no SHA-1 — the only format a Jujutsu Git backend
 * writes — and because this package stays dependency-light for publication. If
 * a SHA-1 lands in `@taucad/utils`, delete both functions and depend on it.
 */

/* oxlint-disable no-bitwise -- SHA-1 and SHA-256 are defined over 32-bit rotates, xors and masks (FIPS 180-4). */
/* oxlint-disable unicorn-js/prevent-abbreviations, unicorn/numeric-separators-style -- the working variables a..h are the spec's own names and the constant tables are copied verbatim (FIPS 180-4). */

/** Git object hash algorithm recorded on every receipt and descriptor. @public */
export type ObjectFormat = 'sha1' | 'sha256';

// oxfmt-ignore -- keep the spec's 8-words-per-row round-constant table
const sha256RoundConstants = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

const rotateLeft = (value: number, bits: number): number => ((value << bits) | (value >>> (32 - bits))) >>> 0;

const rotateRight = (value: number, bits: number): number => ((value >>> bits) | (value << (32 - bits))) >>> 0;

/**
 * Merkle–Damgård padding shared by both algorithms: `0x80`, zeroes, then the
 * big-endian bit length.
 *
 * @param input - Message bytes.
 * @returns The padded message, a whole number of 64-byte blocks.
 */
const padded = (input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const length = Math.ceil((input.length + 9) / 64) * 64;
  const output = new Uint8Array(new ArrayBuffer(length));
  output.set(input);
  output[input.length] = 0x80;
  const bitLength = BigInt(input.length) * 8n;
  const view = new DataView(output.buffer);
  view.setUint32(length - 8, Number(bitLength >> 32n), false);
  view.setUint32(length - 4, Number(bitLength & 0xffff_ffffn), false);
  return output;
};

const wordsToBytes = (words: readonly number[]): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(new ArrayBuffer(words.length * 4));
  const view = new DataView(output.buffer);
  for (const [index, word] of words.entries()) {
    view.setUint32(index * 4, word, false);
  }
  return output;
};

/**
 * One-shot SHA-1 (FIPS 180-4).
 *
 * @param input - Message bytes.
 * @returns The 20 digest bytes.
 */
const sha1 = (input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const bytes = padded(input);
  const schedule = new Uint32Array(80);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      schedule[index] = rotateLeft(
        schedule[index - 3]! ^ schedule[index - 8]! ^ schedule[index - 14]! ^ schedule[index - 16]!,
        1,
      );
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      const f =
        index < 20 ? (b & c) | (~b & d) : index < 40 ? b ^ c ^ d : index < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = index < 20 ? 0x5a827999 : index < 40 ? 0x6ed9eba1 : index < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const next = (rotateLeft(a, 5) + f + e + k + schedule[index]!) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return wordsToBytes([h0, h1, h2, h3, h4]);
};

/**
 * One-shot SHA-256 (FIPS 180-4).
 *
 * @param input - Message bytes.
 * @returns The 32 digest bytes.
 */
const sha256 = (input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const bytes = padded(input);
  const schedule = new Uint32Array(64);
  const hash = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 64);
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = schedule[index - 15]!;
      const y = schedule[index - 2]!;
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      schedule[index] = (schedule[index - 16]! + s0 + schedule[index - 7]! + s1) >>> 0;
    }
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + sigma1 + choice + sha256RoundConstants[index]! + schedule[index]!) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return wordsToBytes([...hash]);
};

/**
 * Validate an externally supplied object-format string.
 *
 * The hash is a recorded repository property, so it arrives as data from a
 * manifest, a receipt or an engine, and is checked here rather than assumed.
 *
 * @param value - Format reported by a repository or a caller.
 * @returns The validated format.
 * @public
 */
export const assertObjectFormat = (value: string): ObjectFormat => {
  if (value !== 'sha1' && value !== 'sha256') {
    throw new TypeError('Unsupported Git object format.');
  }
  return value;
};

/**
 * Digest byte length for one object format.
 *
 * @param format - Recorded repository object format.
 * @returns 20 for SHA-1, 32 for SHA-256.
 * @public
 */
export const objectIdByteLength = (format: ObjectFormat): number => (assertObjectFormat(format) === 'sha1' ? 20 : 32);

/**
 * Hash bytes with the repository's recorded object format.
 *
 * @param format - Recorded repository object format.
 * @param input - Message bytes.
 * @returns The digest bytes.
 * @public
 */
export const digest = (format: ObjectFormat, input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  assertObjectFormat(format) === 'sha1' ? sha1(input) : sha256(input);

/**
 * Render digest bytes as lowercase hexadecimal.
 *
 * @param input - Digest bytes.
 * @returns The hexadecimal rendering.
 * @public
 */
export const bytesToHex = (input: Uint8Array<ArrayBuffer>): string =>
  Array.from(input, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Parse hexadecimal into bytes.
 *
 * @param input - Hexadecimal, in either case.
 * @returns The parsed bytes.
 * @public
 */
export const hexToBytes = (input: string): Uint8Array<ArrayBuffer> => {
  if (input.length % 2 !== 0 || !/^[\dA-Fa-f]*$/u.test(input)) {
    throw new TypeError('Invalid hexadecimal bytes.');
  }
  const output = new Uint8Array(new ArrayBuffer(input.length / 2));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(input.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
};

/**
 * Hash bytes and render the digest as hexadecimal.
 *
 * @param format - Recorded repository object format.
 * @param input - Message bytes.
 * @returns The hexadecimal digest.
 * @public
 */
export const digestHex = (format: ObjectFormat, input: Uint8Array<ArrayBuffer>): string =>
  bytesToHex(digest(format, input));

/**
 * Concatenate byte runs into one owned buffer.
 *
 * @param parts - Byte runs, in order.
 * @returns One owned buffer.
 * @public
 */
export const concatBytes = (...parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> => {
  const output = new Uint8Array(new ArrayBuffer(parts.reduce((sum, part) => sum + part.length, 0)));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

/**
 * Compare two byte runs.
 *
 * @param left - First run.
 * @param right - Second run.
 * @returns Whether the runs are identical.
 * @public
 */
export const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);
