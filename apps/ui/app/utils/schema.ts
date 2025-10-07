import { InputData, quicktype, jsonInputForTargetLanguage } from 'quicktype-core';

const targetLanguage: Parameters<typeof quicktype>[0]['lang'] = 'json-schema';

type JsonSchemaProperty = {
  type?: string;
  $ref?: string;
  default?: unknown;
  properties?: Record<string, JsonSchemaProperty>;
  items?: JsonSchemaProperty;
};

type JsonSchema = {
  [key: string]: unknown;
  $schema?: string;
  $ref?: string;
  definitions?: Record<string, JsonSchemaProperty>;
};

/**
 * Recursively adds default values to a JSON schema based on the original JSON object
 * @param schema - The schema object or property to process
 * @param jsonValue - The corresponding value from the original JSON
 * @param definitions - The definitions object from the root schema for resolving $ref
 * @returns The schema with default values added
 */
function addDefaultValues(
  schema: JsonSchemaProperty,
  jsonValue: unknown,
  definitions: Record<string, JsonSchemaProperty> = {},
): JsonSchemaProperty {
  // Handle $ref by looking up the definition
  if (schema.$ref) {
    const refName = schema.$ref.replace('#/definitions/', '');
    const referencedSchema = definitions[refName];
    if (referencedSchema && typeof jsonValue === 'object' && jsonValue !== null) {
      const updatedReferencedSchema = addDefaultValues(referencedSchema, jsonValue, definitions);
      // Update the definition in place
      definitions[refName] = updatedReferencedSchema;
    }

    return schema;
  }

  // Handle primitive types - add default values
  if (schema.type && ['string', 'number', 'integer', 'boolean'].includes(schema.type)) {
    return {
      ...schema,
      default: jsonValue,
    };
  }

  // Handle objects with properties
  if (schema.type === 'object' && schema.properties && typeof jsonValue === 'object' && jsonValue !== null) {
    const jsonObject = jsonValue as Record<string, unknown>;
    const updatedProperties: Record<string, JsonSchemaProperty> = {};

    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      const propertyValue = jsonObject[propertyName];
      updatedProperties[propertyName] = addDefaultValues(propertySchema, propertyValue, definitions);
    }

    return {
      ...schema,
      properties: updatedProperties,
    };
  }

  // Handle arrays
  if (schema.type === 'array' && schema.items && Array.isArray(jsonValue) && jsonValue.length > 0) {
    const updatedItems = addDefaultValues(schema.items, jsonValue[0], definitions);
    return {
      ...schema,
      items: updatedItems,
    };
  }

  return schema;
}

/**
 * Takes a JSON object and returns it's equivalent JSON Schema with default values.
 * @param json - The JSON object to convert to a JSON Schema.
 * @returns The JSON Schema with default values added.
 */
export async function jsonSchemaFromJson(json: Record<string, unknown>): Promise<JsonSchema> {
  const jsonInput = jsonInputForTargetLanguage('json-schema');
  await jsonInput.addSource({
    name: 'root',
    samples: [JSON.stringify(json)],
  });

  const inputData = new InputData();
  inputData.addInput(jsonInput);

  const serializedData = await quicktype({
    inputData,
    lang: targetLanguage,

    // This flag should prevent quicktype from combining objects with the same type into a
    // single ref, but currently it doesn't work. This failure results in schemas that
    // share types but have different property names to share the same title.
    // See: https://github.com/glideapps/quicktype/issues/1678
    combineClasses: false,
  });

  const joinedSchema = serializedData.lines.join('');
  const parsedSchema = JSON.parse(joinedSchema) as JsonSchema;

  // Add default values to the schema
  const schemaWithDefaults = addDefaultValuesToSchema(parsedSchema, json);

  return schemaWithDefaults;
}

/**
 * Adds default values to the entire schema structure
 * @param schema - The complete JSON schema
 * @param originalJson - The original JSON object
 * @returns The schema with default values added
 */
function addDefaultValuesToSchema(schema: JsonSchema, originalJson: Record<string, unknown>): JsonSchema {
  const updatedSchema = { ...schema };

  // Process definitions if they exist
  if (updatedSchema.definitions) {
    const updatedDefinitions = { ...updatedSchema.definitions };

    // Find the root definition (usually referenced by $ref)
    let rootDefinitionName = '';
    if (updatedSchema.$ref) {
      rootDefinitionName = updatedSchema.$ref.replace('#/definitions/', '');
    }

    // Process the root definition with the original JSON
    if (rootDefinitionName && updatedDefinitions[rootDefinitionName]) {
      updatedDefinitions[rootDefinitionName] = addDefaultValues(
        updatedDefinitions[rootDefinitionName]!,
        originalJson,
        updatedDefinitions,
      );
    }

    updatedSchema.definitions = updatedDefinitions;
  }

  return updatedSchema;
}
