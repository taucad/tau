/**
 * Git's delta format, applied: pure CPU work, so it runs where the compute
 * worker runs (charter D7) and is imported by nothing that touches storage.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- delta instructions are bit fields. */

/**
 * Apply one git delta to its base, every instruction checked against the
 * base, the delta and the target size it declares.
 *
 * @param delta - The inflated delta instructions.
 * @param base - The base object's body.
 * @returns The target body.
 * @throws TypeError when the delta is malformed or reaches outside its base or itself.
 */
export const applyDelta = (delta: Uint8Array<ArrayBuffer>, base: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  let at = 0;
  const next = (): number => {
    if (at >= delta.byteLength) {
      throw new TypeError('A delta is truncated.');
    }
    const byte = delta[at]!;
    at += 1;
    return byte;
  };
  const size = (): number => {
    let value = 0;
    let shift = 1;
    let byte: number;
    do {
      byte = next();
      value += (byte & 0x7f) * shift;
      shift *= 128;
    } while ((byte & 0x80) !== 0 && shift <= 2 ** 49);
    if ((byte & 0x80) !== 0) {
      throw new TypeError('A delta declares a size too large to hold.');
    }
    return value;
  };
  if (size() !== base.byteLength) {
    throw new TypeError('A delta does not match the size of its base.');
  }
  const target = new Uint8Array(size());
  let written = 0;
  while (at < delta.byteLength) {
    const op = next();
    if ((op & 0x80) !== 0) {
      let offset = 0;
      let length = 0;
      for (let bit = 0; bit < 4; bit += 1) {
        if ((op & (1 << bit)) !== 0) {
          offset += next() * 2 ** (8 * bit);
        }
      }
      for (let bit = 0; bit < 3; bit += 1) {
        if ((op & (0x10 << bit)) !== 0) {
          length += next() * 2 ** (8 * bit);
        }
      }
      if (length === 0) {
        length = 0x1_00_00;
      }
      if (offset + length > base.byteLength || written + length > target.byteLength) {
        throw new TypeError('A delta copies from outside its base or past its target.');
      }
      target.set(base.subarray(offset, offset + length), written);
      written += length;
    } else if (op > 0) {
      if (at + op > delta.byteLength || written + op > target.byteLength) {
        throw new TypeError('A delta inserts past its own end or past its target.');
      }
      target.set(delta.subarray(at, at + op), written);
      at += op;
      written += op;
    } else {
      throw new TypeError('A delta holds a reserved instruction.');
    }
  }
  if (written !== target.byteLength) {
    throw new TypeError('A delta did not produce the size it declared.');
  }
  return target;
};
