import type { CacheValue } from '#types.js';

const invalid = (path: string, reason: string): never => {
  throw new TypeError(`Invalid CacheValue at ${path}: ${reason}.`);
};

const assertWellFormed = (value: string, path: string): void => {
  if (!value.isWellFormed()) {
    invalid(path, 'strings must not contain lone surrogate code points');
  }
};

type CacheContainer = Record<PropertyKey, unknown> | readonly unknown[];

const serialize = (value: unknown, path: string, ancestors: Set<CacheContainer>): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    assertWellFormed(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      invalid(path, 'numbers must be finite');
    }
    if (Object.is(value, -0)) {
      invalid(path, 'negative zero is not canonical');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    invalid(path, `${typeof value} values are not supported`);
  }
  const objectValue = value as CacheContainer;
  if (ancestors.has(objectValue)) {
    invalid(path, 'cycles are not supported');
  }

  ancestors.add(objectValue);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some(
          (key) =>
            key !== 'length' &&
            (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length),
        )
      ) {
        invalid(path, 'arrays must not have symbol or non-index properties');
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          invalid(`${path}[${index}]`, 'sparse arrays are not supported');
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) {
          invalid(`${path}[${index}]`, 'array elements must be enumerable data properties');
        }
        const dataDescriptor = descriptor as PropertyDescriptor & { readonly value: unknown };
        items.push(serialize(dataDescriptor.value, `${path}[${index}]`, ancestors));
      }
      return `[${items.join(',')}]`;
    }

    const prototype: unknown = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(path, 'only plain records and arrays are supported');
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (Reflect.ownKeys(record).length !== keys.length) {
      invalid(path, 'records must contain only enumerable string properties');
    }
    const properties = keys.map((key) => {
      assertWellFormed(key, path);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        invalid(`${path}.${key}`, 'accessor properties are not supported');
      }
      const dataDescriptor = descriptor as PropertyDescriptor & { readonly value: unknown };
      return `${JSON.stringify(key)}:${serialize(dataDescriptor.value, `${path}.${key}`, ancestors)}`;
    });
    return `{${properties.join(',')}}`;
  } finally {
    ancestors.delete(objectValue);
  }
};

/**
 * Convert a strict cache value to its canonical JSON representation.
 *
 * Objects are ordered by UTF-16 code units. Non-finite numbers, negative zero,
 * sparse arrays, exotic objects, lone surrogates, and cycles are rejected.
 * @param input - Value to validate and canonicalize.
 * @returns Canonical JSON text.
 * @public
 */
export const canonicalizeCacheValue = (input: { readonly value: CacheValue }): string =>
  serialize(input.value, '$', new Set());

/**
 * Encode a strict cache value as cross-runtime-stable canonical UTF-8 bytes.
 * @param input - Value to validate and encode.
 * @returns Canonical UTF-8 bytes.
 * @public
 */
export const encodeCacheValue = (input: { readonly value: CacheValue }): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(canonicalizeCacheValue(input));
