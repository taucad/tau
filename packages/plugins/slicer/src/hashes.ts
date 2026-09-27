/**
 * Synchronous SHA-256 and MD5 for the browser payload.
 *
 * `parseGcode` returns synchronously and the Bambu container carries a legacy
 * MD5 beside the plate, so both digests run in plain JavaScript rather than
 * through the asynchronous WebCrypto surface. Tests compare every output with
 * Node's `crypto` module.
 *
 * @module
 */

/* oxlint-disable no-bitwise, unicorn/prefer-math-trunc, unicorn/numeric-separators-style -- both digests are specified over 32-bit rotates, xors and masks; the constant tables keep the specs' hexadecimal layout */

/**
 * Rotate a 32-bit word left.
 *
 * @param word - The word.
 * @param shift - Bits to rotate by, 1–31.
 * @returns The rotated word.
 */
const rotateLeft = (word: number, shift: number): number => (word << shift) | (word >>> (32 - shift));

/**
 * Rotate a 32-bit word right.
 *
 * @param word - The word.
 * @param shift - Bits to rotate by, 1–31.
 * @returns The rotated word.
 */
const rotateRight = (word: number, shift: number): number => (word >>> shift) | (word << (32 - shift));

const hex = (bytes: Uint8Array<ArrayBuffer>): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Merkle–Damgård padding: 0x80, zeros, then the 64-bit bit length in the requested byte order.
 *
 * @param data - The message.
 * @param littleEndian - Whether the length trailer is little-endian (MD5) or big-endian (SHA-256).
 * @returns The padded message, a whole number of 64-byte blocks.
 */
const pad = (data: Uint8Array<ArrayBuffer>, littleEndian: boolean): Uint8Array<ArrayBuffer> => {
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(padded.length - 8, littleEndian ? low : high, littleEndian);
  view.setUint32(padded.length - 4, littleEndian ? high : low, littleEndian);
  return padded;
};

// FIPS 180-4 §4.2.2: fractional cube roots of the first 64 primes.
// oxfmt-ignore -- keep the spec's eight-words-per-row table layout
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

/**
 * SHA-256 of `data` as lowercase hexadecimal.
 *
 * @param data - Message bytes.
 * @returns Sixty-four hexadecimal characters.
 * @internal
 */
export const sha256Hex = (data: Uint8Array<ArrayBuffer>): string => {
  const padded = pad(data, false);
  const view = new DataView(padded.buffer);
  const state = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const w15 = schedule[index - 15]!;
      const w2 = schedule[index - 2]!;
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      schedule[index] = (s1 + schedule[index - 7]! + s0 + schedule[index - 16]!) | 0;
    }
    let wordA = state[0]!;
    let wordB = state[1]!;
    let wordC = state[2]!;
    let wordD = state[3]!;
    let wordE = state[4]!;
    let wordF = state[5]!;
    let wordG = state[6]!;
    let wordH = state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(wordE, 6) ^ rotateRight(wordE, 11) ^ rotateRight(wordE, 25);
      const choose = (wordE & wordF) ^ (~wordE & wordG);
      const t1 = (wordH + sigma1 + choose + sha256RoundConstants[index]! + schedule[index]!) | 0;
      const sigma0 = rotateRight(wordA, 2) ^ rotateRight(wordA, 13) ^ rotateRight(wordA, 22);
      const majority = (wordA & wordB) ^ (wordA & wordC) ^ (wordB & wordC);
      const t2 = (sigma0 + majority) | 0;
      wordH = wordG;
      wordG = wordF;
      wordF = wordE;
      wordE = (wordD + t1) | 0;
      wordD = wordC;
      wordC = wordB;
      wordB = wordA;
      wordA = (t1 + t2) | 0;
    }
    state[0] = (state[0]! + wordA) | 0;
    state[1] = (state[1]! + wordB) | 0;
    state[2] = (state[2]! + wordC) | 0;
    state[3] = (state[3]! + wordD) | 0;
    state[4] = (state[4]! + wordE) | 0;
    state[5] = (state[5]! + wordF) | 0;
    state[6] = (state[6]! + wordG) | 0;
    state[7] = (state[7]! + wordH) | 0;
  }
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 8; index += 1) {
    digestView.setUint32(index * 4, state[index]!, false);
  }
  return hex(digest);
};

// RFC 1321 §3.4: per-round rotation amounts and the sine-derived constant table.
// oxfmt-ignore -- keep the spec's sixteen-per-round table layout
const md5Shifts = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const md5Constants = Uint32Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000),
);

/**
 * MD5 of `data` as lowercase hexadecimal.
 *
 * MD5 is not collision resistant; it exists here only because the Bambu
 * container format records it beside the plate G-code. Content identity uses
 * {@link sha256Hex}.
 *
 * @param data - Message bytes.
 * @returns Thirty-two hexadecimal characters.
 * @internal
 */
export const md5Hex = (data: Uint8Array<ArrayBuffer>): string => {
  const padded = pad(data, true);
  const view = new DataView(padded.buffer);
  const state = Uint32Array.from([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const block = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      block[index] = view.getUint32(offset + index * 4, true);
    }
    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    for (let index = 0; index < 64; index += 1) {
      let mix: number;
      let source: number;
      if (index < 16) {
        mix = (b & c) | (~b & d);
        source = index;
      } else if (index < 32) {
        mix = (d & b) | (~d & c);
        source = (5 * index + 1) % 16;
      } else if (index < 48) {
        mix = b ^ c ^ d;
        source = (3 * index + 5) % 16;
      } else {
        mix = c ^ (b | ~d);
        source = (7 * index) % 16;
      }
      const sum = (a + mix + md5Constants[index]! + block[source]!) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(sum, md5Shifts[index]!)) | 0;
    }
    state[0] = (state[0]! + a) | 0;
    state[1] = (state[1]! + b) | 0;
    state[2] = (state[2]! + c) | 0;
    state[3] = (state[3]! + d) | 0;
  }
  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 4; index += 1) {
    digestView.setUint32(index * 4, state[index]!, true);
  }
  return hex(digest);
};

/* oxlint-enable no-bitwise, unicorn/prefer-math-trunc, unicorn/numeric-separators-style */
