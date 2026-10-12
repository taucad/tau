/**
 * Canonical JSON for the compiled GeoSpec engine boundary.
 *
 * Claims and plans cross to the native core as canonical JSON bytes. These
 * helpers validate wire values, encode them with sorted keys and convert
 * authored matcher arguments; live TypeScript objects never cross.
 *
 * @module
 */

import type { JSONValue } from '@taucad/runtime/types';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Runtime JSON-value guard used at every protocol trust boundary. @public */
export const isGeoSpecJsonValue = (value: unknown, ancestors = new Set<WeakKey>()): value is JSONValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isGeoSpecJsonValue(entry, ancestors))
    : isPlainObject(value) && Object.values(value).every((entry) => isGeoSpecJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
};

/** Reject a non-wire value rather than letting JSON.stringify erase it. @public */
export const assertGeoSpecJsonValue: (value: unknown) => asserts value is JSONValue = (value) => {
  if (!isGeoSpecJsonValue(value)) {
    throw new TypeError('GeoSpec protocol values must contain only finite JSON data.');
  }
};

const canonicalizeJson = (value: JSONValue): JSONValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
};

/** Encode client-owned canonical claim bytes. @public */
export const encodeGeoSpecCanonicalJson = (value: JSONValue): Uint8Array<ArrayBuffer> => {
  assertGeoSpecJsonValue(value);
  return new TextEncoder().encode(JSON.stringify(canonicalizeJson(value)));
};

/** Parse and validate canonical bytes without re-canonicalizing them. @public */
export const decodeGeoSpecCanonicalJson = (bytes: Uint8Array<ArrayBuffer>): JSONValue => {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  assertGeoSpecJsonValue(value);
  return value;
};

/**
 * Convert an authoring value to protocol JSON, including the two explicit
 * bindings the TypeScript client needs: regex data and opaque subject refs.
 * Unsupported live objects fail before a request reaches the engine.
 *
 * @public
 */
export const toGeoSpecProtocolJson = (value: unknown, ancestors = new Set<WeakKey>()): JSONValue => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('GeoSpec claims cannot contain non-finite numbers.');
    }
    return value;
  }
  if (value instanceof RegExp) {
    return { type: 'regexp', pattern: value.source, flags: value.flags };
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new TypeError('GeoSpec claims cannot contain functions, symbols, bigint values, or cycles.');
  }
  const subjectId: unknown = Reflect.get(value, 'subjectId');
  if (typeof subjectId === 'string') {
    return { type: 'subject-reference', subjectId };
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => toGeoSpecProtocolJson(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (!isPlainObject(value)) {
    throw new TypeError('GeoSpec claims cannot contain class instances.');
  }
  const result: Record<string, JSONValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = toGeoSpecProtocolJson(entry, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
};
