/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */

/**
 * The prefix used in RJSF IDs.
 *
 * It's important that this prefix is not used in the field names, otherwise
 * the JSON path used for field resets will be incorrect.
 *
 * @see https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/form-props/#idprefix
 */
export const rjsfIdPrefix = '///root';

/**
 * The separator used in RJSF IDs. It's important that this separator
 * is not used in the field names, otherwise the JSON path used for
 * field resets will be incorrect.
 *
 * Therefore, we use a separator that is unlikely to be used in field names.
 *
 * @see https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/form-props/#idseparator
 */
export const rjsfIdSeparator = '///';

/**
 * Converts RJSF ID to JSON path array. Handles underscores in field names.
 *
 * @param rjsfId - The RJSF field ID (e.g., "root_config_database_host")
 * @returns Array of path segments (e.g., ["config", "database", "host"])
 */
export function rjsfIdToJsonPath(rjsfId: string): string[] {
  // Remove 'root///' prefix and split by idSeparator
  const pathString = rjsfId.replace(new RegExp(`^${rjsfIdPrefix}${rjsfIdSeparator}`), '');

  // Handle empty case (root level)
  if (!pathString) {
    return [];
  }

  // Split by underscore - this handles most cases correctly
  // For more complex cases with actual underscores in field names,
  // you might need more sophisticated parsing
  const pathParts = pathString.split(rjsfIdSeparator);

  return pathParts;
}

/**
 * Gets a value from a nested object using a path array
 * @param object - The object to traverse
 * @param path - Array of property keys to follow
 * @returns The value at the specified path, or undefined if not found
 */
export function getNestedValue(object: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = object;

  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Sets a value in a nested object using a path array
 * @param object - The object to modify
 * @param path - Array of property keys to follow
 * @param value - The value to set
 * @returns A new object with the value set at the specified path
 */
export function setNestedValue(
  object: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    return object;
  }

  const result = { ...object };
  let current = result;

  // Navigate to parent of target, creating objects as needed
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    current[key] =
      !current[key] || typeof current[key] !== 'object' ? {} : { ...(current[key] as Record<string, unknown>) };
    current = current[key] as Record<string, unknown>;
  }

  // Set the final value
  const finalKey = path.at(-1);
  if (finalKey !== undefined) {
    current[finalKey] = value;
  }

  return result;
}

/**
 * Deletes a value from a nested object using a path array
 * @param object - The object to modify
 * @param path - Array of property keys to follow
 * @returns A new object with the value deleted at the specified path
 */
export function deleteNestedValue(object: Record<string, unknown>, path: string[]): Record<string, unknown> {
  if (path.length === 0) {
    return object;
  }

  const result = { ...object };

  // If it's a top-level property, delete directly
  if (path.length === 1) {
    const key = path[0];
    if (key !== undefined) {
      // Create a new object without the specified key
      const { [key]: _, ...rest } = result;
      return rest;
    }

    return result;
  }

  let current = result;

  // Navigate to parent of target
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (current[key] && typeof current[key] === 'object') {
      current[key] = { ...(current[key] as Record<string, unknown>) };
      current = current[key] as Record<string, unknown>;
    } else {
      // Path doesn't exist, nothing to delete
      return result;
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

  return result;
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

/**
 * Handles array-specific reset operations
 * @param object - The object containing the array
 * @param path - Path to the array item
 * @returns Updated object with array item removed or reset
 */
export function resetArrayItem(object: Record<string, unknown>, path: string[]): Record<string, unknown> {
  if (path.length < 2) {
    return deleteNestedValue(object, path);
  }

  // Check if the last path segment is a numeric index
  const lastSegment = path.at(-1);
  if (lastSegment === undefined) {
    return object;
  }

  const index = Number.parseInt(lastSegment, 10);

  if (Number.isNaN(index)) {
    // Not an array index, treat as normal property
    return deleteNestedValue(object, path);
  }

  // Get the array path (everything except the index)
  const arrayPath = path.slice(0, -1);
  const arrayValue = getNestedValue(object, arrayPath);

  if (Array.isArray(arrayValue) && index >= 0 && index < arrayValue.length) {
    // Remove the specific array item
    const newArray = arrayValue.filter((_, i) => i !== index);
    return setNestedValue(object, arrayPath, newArray);
  }

  // Fallback to normal deletion
  return deleteNestedValue(object, path);
}
