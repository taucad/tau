import type { MergeDeep, OmitDeep, Get, PartialDeep } from 'type-fest';

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
 * Deletes a value from a nested object using a path array without mutating the original object.
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

    // If the parent object is now empty and we're not at the root level, remove it too
    if (path.length > 1 && Object.keys(current).length === 0) {
      const parentPath = path.slice(0, -1);
      const parentKey = parentPath.at(-1);
      if (parentKey !== undefined && parentPath.length === 1) {
        // Parent is at root level, delete it
        const { [parentKey]: _, ...rootRest } = result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
        return rootRest as any;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- Generic type constraint requires cast
  return result as any;
}

/**
 * Checks if a field has a custom value (different from its default)
 * Performs deep comparison for objects and arrays.
 * @param formData - The current form data for this field
 * @param defaultValue - The default value from the schema (for array items, this is the default item value)
 * @param fieldPath - Optional field path array (used for debugging/logging)
 * @returns true if the field has been modified from its default
 */
export function hasCustomValue(formData: unknown, defaultValue: unknown, _fieldPath?: readonly string[]): boolean {
  // Handle top-level undefined/null: if formData is undefined/null, no custom value was provided
  // This is the original behavior for the form use case
  if (formData === undefined || formData === null) {
    return false;
  }

  // For primitive types, compare directly
  if (typeof formData !== 'object') {
    return formData !== defaultValue;
  }

  // For arrays, compare the entire array deeply
  if (Array.isArray(formData)) {
    if (!Array.isArray(defaultValue)) {
      return true; // Array vs non-array means it's custom
    }

    // Deep comparison of arrays
    if (formData.length !== defaultValue.length) {
      return true;
    }

    // For nested values, we need to compare undefined/null normally
    return formData.some((item, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- array index access
      const defaultItem = defaultValue[index];

      // Handle nested undefined/null comparison
      if ((item === undefined || item === null) && (defaultItem === undefined || defaultItem === null)) {
        return false; // Both undefined/null means same
      }

      if (item === undefined || item === null || defaultItem === undefined || defaultItem === null) {
        return item !== defaultItem; // One is undefined/null, other isn't
      }

      return hasCustomValue(item, defaultItem);
    });
  }

  // For objects, compare keys and values deeply
  if (typeof formData === 'object' && typeof defaultValue === 'object' && defaultValue !== null) {
    const formKeys = Object.keys(formData);
    const defaultKeys = Object.keys(defaultValue);

    // If keys differ, it's custom
    if (formKeys.length !== defaultKeys.length) {
      return true;
    }

    // Check if any values differ (deep comparison)
    return formKeys.some((key) => {
      const formValue = (formData as Record<string, unknown>)[key];
      const defaultValueForKey = (defaultValue as Record<string, unknown>)[key];

      // Handle nested undefined/null comparison
      if (
        (formValue === undefined || formValue === null) &&
        (defaultValueForKey === undefined || defaultValueForKey === null)
      ) {
        return false; // Both undefined/null means same
      }

      if (
        formValue === undefined ||
        formValue === null ||
        defaultValueForKey === undefined ||
        defaultValueForKey === null
      ) {
        return formValue !== defaultValueForKey; // One is undefined/null, other isn't
      }

      return hasCustomValue(formValue, defaultValueForKey);
    });
  }

  return formData !== defaultValue;
}

/**
 * Extracts only modified properties (those that differ from defaults) from form data.
 * Recursively handles nested objects to filter out unchanged properties at all levels.
 *
 * @param formData - The complete form data
 * @param defaultProperties - The default properties to compare against
 * @returns An object containing only the properties that differ from their defaults
 */
export function extractModifiedProperties<T extends Record<string, unknown>>(
  formData: PartialDeep<T>,
  defaultProperties: T,
): PartialDeep<T> {
  const modifiedProperties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(formData)) {
    const defaultValue = defaultProperties[key];

    // Handle nested objects recursively
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      !Array.isArray(defaultValue)
    ) {
      const modifiedNested = extractModifiedProperties(
        value as Record<string, unknown>,
        defaultValue as Record<string, unknown>,
      );
      // Only include nested object if it has modified properties
      if (Object.keys(modifiedNested).length > 0) {
        modifiedProperties[key] = modifiedNested;
      }
    } else if (JSON.stringify(value) !== JSON.stringify(defaultValue)) {
      // Compare primitive values or arrays
      modifiedProperties[key] = value;
    }
  }

  return modifiedProperties as PartialDeep<T>;
}
