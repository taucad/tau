/** Lossless JSON conversion of engine values for the CLI report. @module */

import type { JSONValue } from '@taucad/runtime/types';

type NumberTypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Uint8ClampedArray<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>
  | Float64Array<ArrayBuffer>;

const isNumberTypedArray = (value: unknown): value is NumberTypedArray =>
  value instanceof Int8Array ||
  value instanceof Uint8Array ||
  value instanceof Uint8ClampedArray ||
  value instanceof Int16Array ||
  value instanceof Uint16Array ||
  value instanceof Int32Array ||
  value instanceof Uint32Array ||
  value instanceof Float32Array ||
  value instanceof Float64Array;

/**
 * Convert an engine value to JSON for the CLI `--json` report.
 *
 * Unlike `toGeoSpecProtocolJson`, this keeps `Error`, `RegExp` and numeric typed arrays as readable JSON.
 *
 * @internal
 * @param value - Value to convert.
 * @param ancestors - Objects on the current path, used to reject cycles.
 * @returns The JSON value.
 */
export function protocolWireValue(value: unknown, ancestors = new WeakSet()): JSONValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('GeoSpec engine emitted a non-finite number.');
    }
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof RegExp) {
    return { type: 'regexp', pattern: value.source, flags: value.flags };
  }
  if (isNumberTypedArray(value)) {
    return [...value];
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new TypeError('GeoSpec engine emitted a non-wire value.');
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => protocolWireValue(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('GeoSpec engine emitted a non-plain object.');
  }
  const result: Record<string, JSONValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = protocolWireValue(entry, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
}
