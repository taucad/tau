import type { JSONObject, JSONValue } from '@taucad/types';

/**
 * Deep-clone a JSON-compatible value while preserving the public JSON type.
 *
 * @public
 */
export function cloneJson<T extends JSONValue>(value: T): T {
  return structuredClone(value);
}

/**
 * Narrow an unknown value to a JSON object.
 *
 * @public
 */
export function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Decode UTF-8 JSON bytes into a JSON object.
 *
 * @public
 */
export function decodeJsonObject(bytes: Uint8Array<ArrayBuffer>): JSONObject {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!isJsonObject(value)) {
    throw new Error('Expected JSON object payload in glTF extension bufferView.');
  }
  return value;
}

/**
 * Encode a JSON object as UTF-8 bytes for an extension-owned bufferView.
 *
 * @public
 */
export function encodeJsonObject(value: JSONObject): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}
