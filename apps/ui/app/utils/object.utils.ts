import type { MergeDeep, OmitDeep, Get } from 'type-fest';

/**
 * Checks if a string is a numeric string (e.g., "0", "1", "42")
 */
type IsNumericString<S extends string> = S extends `${number}` ? true : false;
/**
 * Recursively builds a nested object type from a path array
 * Handles numeric strings as array indices
 * @example BuildNested<['a', 'b', 'c'], number> = { a: { b: { c: number } } }
 * @example BuildNested<['users', '0', 'name'], string> = { users: Array<{ name: string }> }
 */
type BuildNested<Path extends readonly string[], Value> = Path extends readonly [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? // eslint-disable-next-line @typescript-eslint/no-restricted-types -- we only want to match an empty array here.
    Rest extends []
    ? IsNumericString<First> extends true
      ? Value[]
      : Record<First, Value>
    : IsNumericString<First> extends true
      ? Array<BuildNested<Rest, Value>>
      : Record<First, BuildNested<Rest, Value>>
  : Record<string, never>;
/**
 * Deep merges a nested value into an object type at the specified path
 * @example SetNestedValue<{ x: string }, ['a', 'b'], number> = { x: string; a: { b: number } }
 */

type SetNestedValue<T extends Record<string, unknown>, Path extends readonly string[], Value> = MergeDeep<
  T,
  BuildNested<Path, Value>
>;
/**
 * Converts a path array to a dot-notation string
 * @example PathArrayToString<['a', 'b', 'c']> = 'a.b.c'
 */
type PathArrayToString<Path extends readonly string[]> = Path extends readonly [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? // eslint-disable-next-line @typescript-eslint/no-restricted-types -- we only want to match an empty array here.
    Rest extends []
    ? First
    : `${First}.${PathArrayToString<Rest>}`
  : '';
/**
 * Removes a nested property from an object type using a path array
 * @example DeleteNestedValue<{ x: string; a: { b: { c: number } } }, ['a', 'b', 'c']> = { x: string; a: { b: {} } }
 */
type DeleteNestedValue<T extends Record<string, unknown>, Path extends readonly string[]> = OmitDeep<
  T,
  PathArrayToString<Path>
>;

/**
 * Sets a value in a nested object using a path array
 * @param object - The object to modify
 * @param path - Array of property keys to follow
 * @param value - The value to set
 * @returns A new object with the value set at the specified path
 */
export function setValueAtPath<T extends Record<string, unknown>, const Path extends readonly string[], Value>(
  object: T,
  path: Path,
  value: Value,
): SetNestedValue<T, Path, Value> {
  if (path.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
    return object as any;
  }

  // Work with mutable version for internal mutations
  const result: Record<string, unknown> = { ...object };
  let current: Record<string, unknown> = result;

  // Navigate to parent of target, creating objects as needed
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;

    if (!current[key] || typeof current[key] !== 'object') {
      // Create new object if key doesn't exist or isn't an object
      current[key] = {};
    } else if (Array.isArray(current[key])) {
      // Preserve arrays by creating a shallow copy
      current[key] = [...(current[key] as unknown[])];
    } else {
      // Create shallow copy of object
      current[key] = { ...(current[key] as Record<string, unknown>) };
    }

    current = current[key] as Record<string, unknown>;
  }

  // Set the final value
  const finalKey = path.at(-1);
  if (finalKey !== undefined) {
    current[finalKey] = value;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
  return result as any;
}

/**
 * Gets a value from a nested object using a path array
 * @param object - The object to traverse
 * @param path - Array of property keys to follow
 * @returns The value at the specified path, or undefined if not found
 */
export function getValueAtPath<T extends Record<string, unknown>, Path extends readonly string[]>(
  object: T,
  path: Path,
): Get<T, Path> | undefined {
  let current: unknown = object;

  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current as Get<T, Path>;
}

/**
 * Deletes a value from a nested object using a path array
 * @param object - The object to modify
 * @param path - Array of property keys to follow
 * @returns A new object with the value deleted at the specified path
 */
export function deleteValueAtPath<T extends Record<string, unknown>, const Path extends readonly string[]>(
  object: T,
  path: Path,
): DeleteNestedValue<T, Path> {
  if (path.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
    return object as any;
  }

  // Work with mutable version for internal mutations
  const result: Record<string, unknown> = { ...object };

  // If it's a top-level property, delete directly
  if (path.length === 1) {
    const key = path[0];
    if (key !== undefined) {
      // Create a new object without the specified key
      const { [key]: _, ...rest } = result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
      return rest as any;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
    return result as any;
  }

  let current: Record<string, unknown> = result;

  // Navigate to parent of target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (current[key] && typeof current[key] === 'object') {
      // Preserve arrays when creating shallow copies
      current[key] = Array.isArray(current[key])
        ? [...(current[key] as unknown[])]
        : { ...(current[key] as Record<string, unknown>) };
      current = current[key] as Record<string, unknown>;
    } else {
      // Path doesn't exist, nothing to delete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
      return result as any;
    }
  }

  // Delete the final key
  const finalKey = path.at(-1);
  if (finalKey !== undefined) {
    // Create a new object without the specified key
    const { [finalKey]: _, ...rest } = current;
    Object.assign(current, rest);
    // Clear all properties first
    for (const key of Object.keys(current)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- this is a valid use case
      delete current[key];
    }

    // Then assign the remaining properties
    Object.assign(current, rest);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
  return result as any;
}

/**
 * Checks if a field has a custom value (different from its default)
 * @param formData - The current form data for this field
 * @param defaultValue - The default value from the schema
 * @returns true if the field has been modified from its default
 */
export function hasCustomValue(formData: unknown, defaultValue: unknown): boolean {
  // Handle undefined/null cases
  if (formData === undefined || formData === null) {
    return false;
  }

  // For primitive types, compare directly
  if (typeof formData !== 'object') {
    return formData !== defaultValue;
  }

  // For objects and arrays, check if they're not empty
  if (Array.isArray(formData)) {
    return formData.length > 0;
  }

  if (typeof formData === 'object') {
    return Object.keys(formData).length > 0;
  }

  return formData !== defaultValue;
}
