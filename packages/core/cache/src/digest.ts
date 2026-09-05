import { canonicalizeCacheValue, encodeCacheValue } from '#cache-value.js';
import type { ActionDigest, CacheValue, ComputeAction, ContentDigest, SceneDigest } from '#types.js';

const digestPattern = /^sha256:[0-9a-f]{64}$/u;

const parseDigest = (value: string, name: string): `sha256:${string}` => {
  if (!digestPattern.test(value)) {
    throw new TypeError(`${name} must be a lowercase sha256: digest.`);
  }
  return value as `sha256:${string}`;
};

const validateIdentityPart = (value: string, path: string): void => {
  if (value.length === 0) {
    throw new TypeError(`${path} must not be empty.`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${path} must be well-formed Unicode.`);
  }
};

const actionValue = (action: ComputeAction): CacheValue => {
  const schemaVersion: unknown = action.schemaVersion;
  if (schemaVersion !== 1) {
    throw new TypeError('action.schemaVersion must be 1.');
  }
  validateIdentityPart(action.namespace, 'action.namespace');
  validateIdentityPart(action.producer.id, 'action.producer.id');
  validateIdentityPart(action.producer.version, 'action.producer.version');
  validateIdentityPart(action.operation, 'action.operation');
  validateIdentityPart(action.codec.id, 'action.codec.id');
  validateIdentityPart(action.codec.version, 'action.codec.version');
  for (const [index, asset] of action.producer.implementationAssets.entries()) {
    contentDigest({ value: asset, name: `action.producer.implementationAssets[${index}]` });
  }
  for (const [index, item] of action.inputs.entries()) {
    validateIdentityPart(item.role, `action.inputs[${index}].role`);
    const kind: unknown = item.kind;
    switch (kind) {
      case 'content': {
        contentDigest({ value: item.digest });
        break;
      }
      case 'action': {
        actionDigest({ value: item.digest });
        break;
      }
      case 'scene': {
        sceneDigest({ value: item.digest });
        break;
      }
      default: {
        throw new TypeError(`action.inputs[${index}].kind is invalid.`);
      }
    }
  }
  return {
    schemaVersion: action.schemaVersion,
    namespace: action.namespace,
    producer: {
      id: action.producer.id,
      version: action.producer.version,
      implementationAssets: action.producer.implementationAssets,
    },
    operation: action.operation,
    inputs: action.inputs.map((item) => ({ kind: item.kind, role: item.role, digest: item.digest })),
    arguments: action.arguments,
    environment: action.environment,
    codec: { id: action.codec.id, version: action.codec.version },
  };
};

/**
 * Validate and synchronously canonicalize a compute action for local identity maps.
 * @param action - Action descriptor to canonicalize.
 * @returns Canonical JSON text; use {@link digestAction} for a durable identity.
 * @public
 */
export const canonicalizeComputeAction = (action: ComputeAction): string =>
  canonicalizeCacheValue({ value: actionValue(action) });

const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<`sha256:${string}`> => {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const hexadecimal = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `sha256:${hexadecimal}`;
};

/**
 * Validate and brand an externally supplied content digest.
 * @param input - Digest text and optional diagnostic name.
 * @returns A branded content digest.
 * @public
 */
export const contentDigest = (input: { readonly value: string; readonly name?: string }): ContentDigest =>
  parseDigest(input.value, input.name ?? 'ContentDigest') as ContentDigest;

/**
 * Validate and brand an externally supplied action digest.
 * @param input - Digest text and optional diagnostic name.
 * @returns A branded action digest.
 * @public
 */
export const actionDigest = (input: { readonly value: string; readonly name?: string }): ActionDigest =>
  parseDigest(input.value, input.name ?? 'ActionDigest') as ActionDigest;

/**
 * Validate and brand an externally supplied scene digest.
 * @param input - Digest text and optional diagnostic name.
 * @returns A branded scene digest.
 * @public
 */
export const sceneDigest = (input: { readonly value: string; readonly name?: string }): SceneDigest =>
  parseDigest(input.value, input.name ?? 'SceneDigest') as SceneDigest;

/**
 * Hash immutable bytes into a content digest.
 * @param input - Bytes to hash.
 * @returns Their SHA-256 digest.
 * @public
 */
export const digestContent = async (input: { readonly bytes: Uint8Array<ArrayBuffer> }): Promise<ContentDigest> =>
  (await sha256(input.bytes)) as ContentDigest;

/**
 * Validate, canonicalize, and hash a compute action.
 * @param input - Action descriptor.
 * @returns Its SHA-256 digest.
 * @public
 */
export const digestAction = async (input: { readonly action: ComputeAction }): Promise<ActionDigest> =>
  (await sha256(new TextEncoder().encode(canonicalizeComputeAction(input.action)))) as ActionDigest;

/**
 * Canonicalize and hash a scene identity value.
 * @param input - Scene manifest value.
 * @returns Its SHA-256 digest.
 * @public
 */
export const digestScene = async (input: { readonly value: CacheValue }): Promise<SceneDigest> =>
  (await sha256(encodeCacheValue(input))) as SceneDigest;
