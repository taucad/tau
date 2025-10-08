/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */
import type { RJSFSchema } from "@rjsf/utils";

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
export function isSchemaMatchingSearch(schema: RJSFSchema, searchTerm: string, propertyName?: string): boolean {
  if (!searchTerm) {
    return true;
  }

  const lowerSearch = searchTerm.toLowerCase();

  // Check if the property name matches
  if (propertyName) {
    if (propertyName.toLowerCase().includes(lowerSearch)) {
      return true;
    }
  }

  // Check if the title matches
  if (schema.title && typeof schema.title === 'string') {
    if (schema.title.toLowerCase().includes(lowerSearch)) {
      return true;
    }
  }

  // Check if the description matches
  if (schema.description && typeof schema.description === 'string') {
    if (schema.description.toLowerCase().includes(lowerSearch)) {
      return true;
    }
  }

  // If this schema has nested properties (is a group), check them recursively
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [nestedName, nestedSchema] of Object.entries(schema.properties)) {
      if (nestedSchema && typeof nestedSchema === 'object' && !Array.isArray(nestedSchema)) {
        if (isSchemaMatchingSearch(nestedSchema as RJSFSchema, searchTerm, nestedName)) {
          return true;
        }
      }
    }
  }

  // If this schema is an array, check its items schema recursively
  if (schema.type === 'array' && schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    if (isSchemaMatchingSearch(schema.items as RJSFSchema, searchTerm)) {
      return true;
    }
  }

  return false;
}
