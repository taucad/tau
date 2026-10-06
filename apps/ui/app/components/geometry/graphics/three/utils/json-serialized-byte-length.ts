/** Count the UTF-8 bytes of a JSON-compatible descriptor without constructing its full JSON string. */
export function jsonSerializedByteLength(value: unknown): number {
  const encoder = new TextEncoder();
  // Prepared assembly descriptors are immutable throughout this synchronous inventory.
  // Count a shared object at every occurrence, but traverse it only once per inventory.
  const measured = new WeakMap<WeakKey, number>();
  const add = (left: number, right: number): number => {
    const total = left + right;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('Assembly descriptor JSON byte length exceeds the safe integer range');
    }
    return total;
  };
  const bytes = (input: unknown): number => {
    if (input === null || typeof input !== 'object') {
      if (input === undefined || typeof input === 'function' || typeof input === 'symbol') {
        throw new TypeError('Assembly descriptor contains a non-JSON value');
      }
      const json = JSON.stringify(input);
      return encoder.encode(json).byteLength;
    }
    const cached = measured.get(input);
    if (cached !== undefined) {
      return cached;
    }
    let length = 2; // The enclosing brackets or braces.
    if (Array.isArray(input)) {
      const items: readonly unknown[] = input;
      for (const [index, item] of items.entries()) {
        length = add(length, index > 0 ? 1 : 0);
        length = add(
          length,
          item === undefined || typeof item === 'function' || typeof item === 'symbol' ? 4 : bytes(item),
        );
      }
    } else {
      let first = true;
      for (const [key, entry] of Object.entries(input)) {
        if (key === 'toJSON' && typeof entry === 'function') {
          throw new TypeError('Assembly descriptor has an unsupported toJSON method');
        }
        if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') {
          continue;
        }
        length = add(length, first ? 0 : 1);
        length = add(length, encoder.encode(JSON.stringify(key)).byteLength + 1);
        length = add(length, bytes(entry));
        first = false;
      }
    }
    measured.set(input, length);
    return length;
  };
  return bytes(value);
}
