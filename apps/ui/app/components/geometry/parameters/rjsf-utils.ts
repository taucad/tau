/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */
import type { RJSFSchema } from '@rjsf/utils';

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
 * Helper to recursively check if a schema or its nested properties match the search term
 * @param schema - The schema to check
 * @param searchTerm - The search term to check
 * @param propertyName - The name of the property to check
 * @returns true if the schema or its nested properties match the search term
 */
// eslint-disable-next-line complexity -- consider refactoring.
export function isSchemaMatchingSearch(schema: RJSFSchema, searchTerm: string, propertyName?: string): boolean {
  if (!searchTerm) {
    return true;
  }

  const lowerSearch = searchTerm.toLowerCase();

  // Check if the property name matches
  if (propertyName?.toLowerCase().includes(lowerSearch)) {
    return true;
  }

  // Check if the title matches
  if (schema.title && typeof schema.title === 'string' && schema.title.toLowerCase().includes(lowerSearch)) {
    return true;
  }

  // Check if the description matches
  if (
    schema.description &&
    typeof schema.description === 'string' &&
    schema.description.toLowerCase().includes(lowerSearch)
  ) {
    return true;
  }

  // If this schema has nested properties (is a group), check them recursively
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [nestedName, nestedSchema] of Object.entries(schema.properties)) {
      if (
        nestedSchema &&
        typeof nestedSchema === 'object' &&
        !Array.isArray(nestedSchema) &&
        isSchemaMatchingSearch(nestedSchema as RJSFSchema, searchTerm, nestedName)
      ) {
        return true;
      }
    }
  }

  // If this schema is an array, check its items schema recursively
  if (
    schema.type === 'array' &&
    schema.items &&
    typeof schema.items === 'object' &&
    !Array.isArray(schema.items) &&
    isSchemaMatchingSearch(schema.items as RJSFSchema, searchTerm)
  ) {
    return true;
  }

  return false;
}

/**
 * Gets the appropriate default value for a field, handling array items specially.
 * For array items, extracts the default value from the parent array at the item's index.
 *
 * @param fieldPath - The JSON path to the field (e.g., ['strings', '0'] for first array item)
 * @param formData - The current form data value for this field
 * @param schemaDefault - The default value from the schema
 * @param defaultParameters - The default parameters object containing all default values
 * @returns The default value to use for comparison (schema default or array item default)
 */
export function getFieldDefaultValue(
  fieldPath: readonly string[],
  formData: unknown,
  schemaDefault: unknown,
  defaultParameters: Record<string, unknown>,
): unknown {
  // For array items, we need to compare against the default array item at this index
  if (fieldPath.length > 1 && typeof formData !== 'object') {
    // Check if the last segment is numeric (array index)
    const lastSegment = fieldPath.at(-1);
    if (lastSegment !== undefined) {
      const arrayIndex = Number.parseInt(lastSegment, 10);
      if (!Number.isNaN(arrayIndex) && arrayIndex >= 0) {
        // Get the parent array path (everything except the last segment)
        const parentPath = fieldPath.slice(0, -1);
        // Navigate to the parent array in defaultParameters
        let parentArray: unknown = defaultParameters;
        for (const segment of parentPath) {
          // eslint-disable-next-line max-depth -- this is easier to read.
          if (typeof parentArray === 'object' && parentArray !== null && segment in parentArray) {
            parentArray = (parentArray as Record<string, unknown>)[segment];
          } else {
            parentArray = undefined;
            break;
          }
        }

        // If parent is an array and index is valid, use the default array item
        if (Array.isArray(parentArray) && arrayIndex < parentArray.length) {
          return parentArray[arrayIndex];
        }
      }
    }
  }

  return schemaDefault;
}
