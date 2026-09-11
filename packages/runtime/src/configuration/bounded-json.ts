import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';

type JsonLimits = Readonly<{
  code: string;
  maximumDepth: number;
  maximumNodes: number;
  maximumCharacters: number;
}>;

/**
 * Check structural budgets without invoking accessors or recursively serializing.
 * @param value - Candidate graph.
 * @param limits - Structural ceilings and diagnostic prefix.
 */
export const assertBoundedJson = (value: unknown, limits: JsonLimits): void => {
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [{ value, depth: 0 }];
  let nodes = 0;
  let characters = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > limits.maximumNodes || current.depth > limits.maximumDepth) {
      throw new TypeError(`${limits.code}_LIMIT`);
    }
    if (typeof current.value === 'string') {
      characters += current.value.length;
    }
    if (current.value !== null && typeof current.value === 'object') {
      for (const key of Reflect.ownKeys(current.value)) {
        if (typeof key === 'string') {
          characters += key.length;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
        if (descriptor !== undefined && 'value' in descriptor) {
          pending.push({
            value: descriptor.value,
            depth: current.depth + 1,
          });
        }
      }
    }
    if (characters > limits.maximumCharacters) {
      throw new TypeError(`${limits.code}_STRING_LIMIT`);
    }
  }
};

/**
 * Bound, strictly canonicalize, and clone untrusted JSON-compatible data.
 * @param value - Candidate graph.
 * @param limits - Structural ceilings and diagnostic prefix.
 * @returns Detached strict cache data.
 */
export const cloneBoundedJson = (value: unknown, limits: JsonLimits): CacheValue => {
  assertBoundedJson(value, limits);
  const canonical = canonicalizeCacheValue({ value: value as CacheValue });
  return JSON.parse(canonical) as CacheValue;
};
