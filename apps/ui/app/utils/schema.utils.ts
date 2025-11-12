import type { JSONSchema7, JSONSchema7Type } from 'json-schema';
import { toJsonSchema } from '@taucad/json-schema';

/**
 * Capitalizes the first letter of a string
 */
function capitalize(string_: string): string {
  if (!string_) {
    return string_;
  }

  return string_.charAt(0).toUpperCase() + string_.slice(1);
}

/**
 * Generates a title from a property name by capitalizing it
 * e.g., "test1" -> "Test1", "deep" -> "Deep"
 */
function getTitleFromPropertyName(propertyName: string): string {
  return capitalize(propertyName);
}

/**
 * Takes a JSON object and returns it's equivalent JSON Schema with default values.
 * @param json - The JSON object to convert to a JSON Schema.
 * @returns The JSON Schema with default values added.
 */
export async function jsonSchemaFromJson(json: Record<string, unknown>): Promise<JSONSchema7> {
  const schema = toJsonSchema(json, {
    arrays: {
      mode: 'all',
    },
    objects: {
      additionalProperties: false,
      postProcessFnc(generatedSchema, object, defaultFunction) {
        const processedSchema = defaultFunction(generatedSchema, object);

        return {
          ...processedSchema,
          required: Object.keys(object).sort(),
        };
      },
    },
    postProcessFnc(type, generatedSchema, value, defaultFunction): JSONSchema7 {
      const processedSchema = defaultFunction(type, generatedSchema, value);

      // Add default values for primitive types
      if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
        return {
          ...processedSchema,
          default: value as JSONSchema7Type,
        };
      }

      // Add titles for nested objects based on their property names
      if (type === 'object' && processedSchema.properties) {
        const properties: Record<string, JSONSchema7> = {};

        for (const [propertyName, propertySchema] of Object.entries(processedSchema.properties)) {
          if (!propertySchema || typeof propertySchema !== 'object') {
            continue;
          }

          // Add title to nested objects
          if (propertySchema.type === 'object') {
            properties[propertyName] = {
              ...propertySchema,
              title: getTitleFromPropertyName(propertyName),
            };
          } else {
            properties[propertyName] = propertySchema;
          }
        }

        return {
          ...processedSchema,
          properties,
        };
      }

      return processedSchema;
    },
  });

  // Add $schema field and root title
  return {
    $schema: 'http://json-schema.org/draft-06/schema#',
    ...schema,
    title: 'Root',
  };
}

/**
 * Helper function to check if a schema or its combinators contain array or object types.
 */
function hasArrayOrObjectInCombinators(schema: JSONSchema7): boolean {
  const combinators = [schema.oneOf, schema.anyOf, schema.allOf].filter(Boolean);

  for (const combinator of combinators) {
    if (!Array.isArray(combinator)) {
      continue;
    }

    for (const subSchema of combinator) {
      if (typeof subSchema !== 'object') {
        continue;
      }

      if (subSchema.type === 'array' || subSchema.type === 'object') {
        return true;
      }

      if (hasJsonSchemaObjectProperties(subSchema)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true if the JSON Schema has any array or object properties at any nesting level.
 * Recursively checks through nested objects, arrays, and schema combinators.
 *
 * @param jsonSchema - The JSON Schema to check.
 * @returns `true` if the JSON Schema has any array or object properties, `false` otherwise.
 */
export const hasJsonSchemaObjectProperties = (jsonSchema: JSONSchema7): boolean => {
  // Check direct properties
  if (jsonSchema.properties) {
    for (const property of Object.values(jsonSchema.properties)) {
      if (!property || typeof property !== 'object') {
        continue;
      }

      // Found an array or object type property
      if (property.type === 'array' || property.type === 'object') {
        return true;
      }

      // Check combinators within this property
      if (hasArrayOrObjectInCombinators(property)) {
        return true;
      }

      // Recursively check this property for nested arrays/objects
      if (hasJsonSchemaObjectProperties(property)) {
        return true;
      }
    }
  }

  // Check array items (arrays can contain objects or nested arrays)
  if (jsonSchema.items) {
    const itemSchemas = Array.isArray(jsonSchema.items) ? jsonSchema.items : [jsonSchema.items];

    for (const itemSchema of itemSchemas) {
      if (typeof itemSchema !== 'object') {
        continue;
      }

      // Array items with object or array type indicate nested complexity
      if (itemSchema.type === 'array' || itemSchema.type === 'object') {
        return true;
      }

      if (hasJsonSchemaObjectProperties(itemSchema)) {
        return true;
      }
    }
  }

  // Check additionalProperties
  if (
    jsonSchema.additionalProperties &&
    typeof jsonSchema.additionalProperties === 'object' &&
    hasJsonSchemaObjectProperties(jsonSchema.additionalProperties)
  ) {
    return true;
  }

  // Check schema combinators at root level
  if (hasArrayOrObjectInCombinators(jsonSchema)) {
    return true;
  }

  return false;
};
