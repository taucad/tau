import type { CamelCase, KebabCase } from 'type-fest';

/**
 * Validates that object has correct camelCase key to kebab-case value mapping
 * Returns descriptive error messages for invalid pairs.
 */
type ValidatedConstants<T extends Record<string, string>> = {
  [K in keyof T]: K extends string
    ? T[K] extends string
      ? CamelCase<T[K]> extends K
        ? T[K] extends KebabCase<T[K]>
          ? T[K]
          : `❌ Value '${T[K]}' must be in kebab-case`
        : `❌ Key '${K}' must be camelCase version of '${T[K]}'`
      : '❌ Value must be a string'
    : '❌ Key must be a string';
};

/**
 * Generic type for constants that validates camelCase keys match kebab-case values
 * and returns the union of all values. Shows compile-time errors at declaration site.
 *
 * This utility ensures constants are consistent and predictable.
 *
 * The record MUST be declared as `as const`.
 *
 * @returns The union of all values.
 *
 * @example
 * // ✅ Valid - compiles successfully
 * const headers = {
 *   requestId: 'request-id',
 *   userAgent: 'user-agent',
 * } as const;
 *
 * type HeaderValues = ConstantRecord<typeof headers>; // 'request-id' | 'user-agent'
 *
 * @example
 * // ❌ Invalid - shows red squiggly at declaration
 * const badHeaders = {
 *   requestId: 'request-id',
 *   userAgent: 'User-Agent', // Will cause compile error
 * } as const;
 *
 * type BadHeaderValues = ConstantRecord<typeof badHeaders>; // Compile error
 */
export type ConstantRecord<T extends ValidatedConstants<T> & Record<string, string>> = T[keyof T];
