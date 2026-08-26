/**
 * One-shot SHA-256 (FIPS 180-4 / RFC 6234) in plain JavaScript, for realms
 * where `crypto.subtle` is unavailable (insecure browser origins such as a
 * plain-http LAN page). `hash.utils.ts` prefers WebCrypto and only routes here
 * as a fallback; the digest bytes are identical.
 *
 * Derived from `@noble/hashes` v2.3.0 (`src/sha2.ts`, `src/_md.ts`), reduced
 * to the single-call, non-streaming surface Tau needs.
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2022 Paul Miller (https://paulmillr.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/* oxlint-disable no-bitwise, unicorn/prefer-math-trunc, unicorn/numeric-separators-style -- SHA-256 is defined over 32-bit rotates, xors and masks (FIPS 180-4); the hex constant tables are copied verbatim from the spec */

/**
 * Round constants from RFC 6234 §5.1: the first 32 bits of the fractional
 * parts of the cube roots of the first 64 primes (2..311).
 */
// oxfmt-ignore -- keep the spec's 8-words-per-row table layout
const roundConstants = Uint32Array.from([
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
 * Initial hash state `H(0)` from RFC 6234 §6.1: the first 32 bits of the
 * fractional parts of the square roots of the first eight primes.
 */
// oxfmt-ignore -- keep the spec's single-row table layout
const initialState = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** Reusable message-schedule buffer `W_t` (RFC 6234 §6.2 step 1). Zeroed after each digest. */
const schedule = new Uint32Array(64);

const blockLength = 64;
const outputLength = 32;

const rotr = (word: number, shift: number): number => (word << (32 - shift)) | (word >>> shift);
const chi = (a: number, b: number, c: number): number => (a & b) ^ (~a & c);
const maj = (a: number, b: number, c: number): number => (a & b) ^ (a & c) ^ (b & c);

/**
 * Compress one 64-byte block into `state` (RFC 6234 §6.2). Uses local
 * variables rather than array indexing so the JIT can keep the working
 * variables in registers; `| 0` keeps every intermediate an int32.
 *
 * @param state - Eight-word working hash, updated in place.
 * @param view - View over the message bytes.
 * @param blockOffset - Byte offset of the block inside `view`.
 */
function compress(state: Uint32Array, view: DataView, blockOffset: number): void {
  let offset = blockOffset;
  for (let index = 0; index < 16; index++, offset += 4) {
    schedule[index] = view.getUint32(offset, false);
  }
  for (let index = 16; index < 64; index++) {
    const w15 = schedule[index - 15]!;
    const w2 = schedule[index - 2]!;
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
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
  for (let index = 0; index < 64; index++) {
    const sigma1 = rotr(wordE, 6) ^ rotr(wordE, 11) ^ rotr(wordE, 25);
    const t1 = (wordH + sigma1 + chi(wordE, wordF, wordG) + roundConstants[index]! + schedule[index]!) | 0;
    const sigma0 = rotr(wordA, 2) ^ rotr(wordA, 13) ^ rotr(wordA, 22);
    const t2 = (sigma0 + maj(wordA, wordB, wordC)) | 0;
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

/**
 * Compute the SHA-256 digest of `data` in one call.
 *
 * Byte-identical to `crypto.subtle.digest('SHA-256', data)`; intended as the
 * fallback for realms without WebCrypto. Honours `byteOffset`, so subarrays of
 * a larger buffer hash correctly.
 *
 * @param data - Message bytes.
 * @returns A fresh 32-byte digest.
 * @internal
 */
export function sha256(data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const state = Uint32Array.from(initialState);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const { length } = data;

  // Whole blocks straight from the input.
  let offset = 0;
  for (; offset + blockLength <= length; offset += blockLength) {
    compress(state, view, offset);
  }

  // Padding (FIPS 180-4 §5.1.1): 0x80, zeros, then the 64-bit big-endian bit
  // length. If the length field does not fit after the tail, it spills into
  // one extra all-padding block.
  const tail = new Uint8Array(blockLength);
  const tailView = new DataView(tail.buffer);
  let position = length - offset;
  tail.set(data.subarray(offset), 0);
  tail[position++] = 0x80;
  if (position > blockLength - 8) {
    compress(state, tailView, 0);
    tail.fill(0);
  }
  const bitLength = BigInt(length) * 8n;
  tailView.setBigUint64(blockLength - 8, bitLength, false);
  compress(state, tailView, 0);
  schedule.fill(0);

  const digest = new Uint8Array(outputLength);
  const digestView = new DataView(digest.buffer);
  for (let index = 0; index < 8; index++) {
    digestView.setUint32(index * 4, state[index]!, false);
  }
  return digest;
}

/* oxlint-enable no-bitwise, unicorn/prefer-math-trunc, unicorn/numeric-separators-style */
