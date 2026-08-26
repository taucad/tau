/**
 * Deep merge two objects, similar to lodash.merge
 * @param target - The target object to merge into
 * @param source - The source object to merge from
 * @returns A new object with merged properties
 */
export function merge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.hasOwn(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue !== undefined &&
        targetValue !== undefined &&
        typeof sourceValue === 'object' &&
        typeof targetValue === 'object' &&
        !Array.isArray(sourceValue) &&
        !Array.isArray(targetValue) &&
        sourceValue !== null &&
        targetValue !== null
      ) {
        // Deep merge nested objects
        result[key] = merge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
        ) as T[Extract<keyof T, string>];
      } else {
        // Overwrite with source value
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * Deep equality check, similar to lodash.isEqual
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if values are deeply equal
 */
export function isEqual(a: unknown, b: unknown): boolean {
  // Primitive comparison
  if (a === b) {
    return true;
  }

  // Handle null/undefined
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }

  // Type check
  if (typeof a !== typeof b) {
    return false;
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (const [index, item] of a.entries()) {
      if (!isEqual(item, b[index])) {
        return false;
      }
    }

    return true;
  }

  // Object comparison
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (const key of aKeys) {
      if (!Object.hasOwn(b, key)) {
        return false;
      }

      if (!isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Symmetric difference of arrays, similar to lodash.xor
 * Returns an array of values that are in either array but not in both
 * @param array1 - First array
 * @param array2 - Second array
 * @returns Array of values that are in either array but not both
 */
export function xor<T>(array1: readonly T[], array2: readonly T[]): T[] {
  const result: T[] = [];

  // Add items from array1 that are not in array2
  for (const item of array1) {
    if (!array2.includes(item)) {
      result.push(item);
    }
  }

  // Add items from array2 that are not in array1
  for (const item of array2) {
    if (!array1.includes(item)) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Get object keys, similar to lodash.keys
 * Just a wrapper around Object.keys for consistency
 * @param object - Object to get keys from
 * @returns Array of keys
 */
export function keys<T extends Record<string, unknown>>(object: T): Array<keyof T> {
  return Object.keys(object) as Array<keyof T>;
}
