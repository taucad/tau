import type { JobDefinition } from '#job.types.js';

const canonicalize = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('digestJobDefinition: definitions must not contain non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('digestJobDefinition: definitions must contain only plain JSON data.');
  }
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort();
  return `{${fields.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
};

const toHex = (bytes: Uint8Array<ArrayBuffer>): string => {
  let result = '';
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
};

/**
 * Compute the canonical SHA-256 identity of a serializable job definition.
 * Object keys are sorted recursively so equivalent provider options hash identically across processes.
 *
 * @param definition - Immutable job definition to canonicalize and hash.
 * @returns Lowercase SHA-256 content identity for idempotent submission.
 * @public
 */
export const digestJobDefinition = async (definition: JobDefinition): Promise<`sha256:${string}`> => {
  const bytes = new TextEncoder().encode(canonicalize(definition));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
};
