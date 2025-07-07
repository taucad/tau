/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */

import type { RJSFSchema } from '@rjsf/utils';

/**
 * Converts RJSF ID to JSON path array using schema-aware parsing
 * @param rjsfId - The RJSF field ID (e.g., "root_config_user_name")
 * @param schema - Optional root schema to guide parsing
 * @param formData - Optional form data to help with array indices
 * @returns Array of path segments (e.g., ["config", "user_name"])
 */
export function rjsfIdToJsonPath(rjsfId: string, schema?: RJSFSchema, formData?: Record<string, unknown>): string[] {
  // Remove 'root_' prefix
  const pathString = rjsfId.replace(/^root_?/, '');

  // Handle empty case (root level)
  if (!pathString) {
    return [];
  }

  // If we have schema, use schema-aware parsing
  if (schema) {
    return parsePathWithSchema(pathString, schema, formData);
  }

  throw new Error(`Unable to parse RJSF ID ${rjsfId} to JSON path`);
}

/**
 * Parses a path string using the schema structure to handle field names with underscores
 * @param pathString - The path string without 'root_' prefix
 * @param schema - The root schema
 * @param formData - Optional form data to help with array indices
 * @returns Array of path segments
 */
function parsePathWithSchema(pathString: string, schema: RJSFSchema, formData?: Record<string, unknown>): string[] {
  const segments = pathString.split('_');
  const result: string[] = [];
  let currentSchema: RJSFSchema | undefined = schema;
  let currentData: Record<string, unknown> | unknown[] | undefined = formData;
  let i = 0;

  while (i < segments.length && currentSchema) {
    // Handle array indices (numeric segments)
    if (/^\d+$/.test(segments[i])) {
      result.push(segments[i]);

      // Move to array items schema
      if (currentSchema.type === 'array' && currentSchema.items && typeof currentSchema.items === 'object') {
        currentSchema = currentSchema.items as RJSFSchema;
        if (Array.isArray(currentData)) {
          const index = Number.parseInt(segments[i], 10);
          currentData = currentData[index] as Record<string, unknown> | unknown[] | undefined;
        }
      }

      i++;
      continue;
    }

    // Find the exact property match
    const propertyMatch = findExactPropertyMatch(segments.slice(i), currentSchema);

    if (propertyMatch) {
      result.push(propertyMatch.propertyName);

      // Update schema and data context for next iteration
      if (currentSchema.properties?.[propertyMatch.propertyName]) {
        currentSchema = currentSchema.properties[propertyMatch.propertyName] as RJSFSchema;
        if (currentData && typeof currentData === 'object' && !Array.isArray(currentData)) {
          currentData = currentData[propertyMatch.propertyName] as Record<string, unknown> | unknown[] | undefined;
        }
      }

      i += propertyMatch.segmentsUsed;
    } else {
      // No exact match found - this shouldn't happen with a properly formed RJSF ID
      throw new Error(`No property found in schema for path segments: ${segments.slice(i).join('_')}`);
    }
  }

  return result;
}

/**
 * Finds the exact property name match from the current schema properties
 * @param segments - Remaining path segments
 * @param schema - Current schema context
 * @returns Exact match with property name and segments used, or undefined if no match
 */
function findExactPropertyMatch(
  segments: string[],
  schema: RJSFSchema,
): { propertyName: string; segmentsUsed: number } | undefined {
  if (!schema.properties || typeof schema.properties !== 'object') {
    return undefined;
  }

  const properties = Object.keys(schema.properties);

  // Find the longest exact match by checking each property against the segments
  for (const propertyName of properties) {
    const propertySegments = propertyName.split('_');

    // Check if this property name exactly matches the beginning of our segments
    if (propertySegments.length <= segments.length) {
      const segmentsToCheck = segments.slice(0, propertySegments.length);

      if (segmentsToCheck.join('_') === propertyName) {
        return {
          propertyName,
          segmentsUsed: propertySegments.length,
        };
      }
    }
  }

  return undefined;
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
    const key = path[i];
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
    const key = path[i];
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

  if (formData && typeof formData === 'object') {
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
