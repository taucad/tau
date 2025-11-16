import type { JSONSchema7 } from 'json-schema';

/**
 * JSCAD Parameter Definition
 *
 * Format used by JSCAD's getParameterDefinitions() function
 *
 * @see https://openjscad.xyz/docs/tutorial-10_parameters.html
 */
export type JscadParameterDefinition = {
  name: string;
  caption?: string; // Human-readable label
  type?: 'int' | 'float' | 'number' | 'text' | 'choice' | 'checkbox' | 'slider' | 'group';
  initial?: unknown; // Default value
  default?: unknown; // Alternative default value field
  min?: number; // Minimum value (for numeric types)
  max?: number; // Maximum value (for numeric types)
  step?: number; // Step increment (for numeric types)
  values?: unknown[]; // Available values (for choice type)
  captions?: string[]; // Labels for values (for choice type)
  checked?: boolean; // Initial checked state (for checkbox)
};

/**
 * Convert JSCAD parameter definitions to default parameters object
 *
 * Extracts the initial/default values from JSCAD parameter definitions
 * and converts them to a simple key-value object. This is essential for
 * establishing baseline parameters when executing JSCAD scripts.
 *
 * JSCAD parameter definitions follow a specific structure where each parameter
 * can have an `initial` or `default` field specifying its default value.
 * This function prioritizes `initial` over `default` if both are present.
 *
 * @param definitions - Array of JSCAD parameter definitions from getParameterDefinitions()
 * @returns Object mapping parameter names to their default values
 *
 * @example
 * ```typescript
 * const definitions = [
 *   { name: 'width', caption: 'Width:', type: 'float', initial: 10 },
 *   { name: 'height', caption: 'Height:', type: 'int', initial: 20 },
 *   { name: 'color', caption: 'Color:', type: 'text', default: 'red' }
 * ];
 *
 * const defaults = convertParameterDefinitionsToDefaults(definitions);
 * // Returns:
 * // {
 * //   width: 10,
 * //   height: 20,
 * //   color: 'red'
 * // }
 * ```
 *
 * @see https://openjscad.xyz/docs/tutorial-10_parameters.html
 */
export function convertParameterDefinitionsToDefaults(
  definitions: JscadParameterDefinition[],
): Record<string, unknown> {
  const defaultParameters: Record<string, unknown> = {};

  for (const parameterDefinition of definitions) {
    const value = parameterDefinition.initial ?? parameterDefinition.default;
    if (value !== undefined) {
      defaultParameters[parameterDefinition.name] = value;
    }
  }

  return defaultParameters;
}

/**
 * Convert a single JSCAD parameter definition to JSON Schema property
 *
 * Maps JSCAD parameter types to JSON Schema equivalents, handling type conversions
 * and constraint mapping (min, max, step). Supports all JSCAD parameter types:
 * - Numeric types: int, float, number, slider
 * - Text types: text
 * - Choice types: choice, checkbox
 * - Organizational types: group (skipped)
 *
 * For choice parameters, this uses the `enum` keyword which is standard JSON Schema.
 * The `captions` field (for choice labels) is not included as it's not part of
 * standard JSON Schema, but would be handled by schema-aware UI libraries.
 *
 * @param definition - Single JSCAD parameter definition
 * @returns JSON Schema7 property object for the parameter
 *
 * @internal This is a helper function used by convertParameterDefinitionsToJsonSchema.
 *           Type inference is used as a fallback when no explicit type is specified.
 */
// eslint-disable-next-line complexity -- JSCAD has many parameter types to handle
function convertParameterDefinitionToJsonSchemaProperty(definition: JscadParameterDefinition): JSONSchema7 {
  const schema: JSONSchema7 = {};

  // Add description from caption
  if (definition.caption) {
    schema.description = definition.caption;
  }

  // Add default value
  const defaultValue = definition.initial ?? definition.default;
  if (defaultValue !== undefined && defaultValue !== null) {
    schema.default = defaultValue as JSONSchema7['default'];
  }

  // Map JSCAD type to JSON Schema type
  switch (definition.type) {
    case 'int': {
      schema.type = 'integer';
      if (definition.min !== undefined) {
        schema.minimum = definition.min;
      }

      if (definition.max !== undefined) {
        schema.maximum = definition.max;
      }

      break;
    }

    case 'float':
    case 'number':
    case 'slider': {
      schema.type = 'number';
      if (definition.min !== undefined) {
        schema.minimum = definition.min;
      }

      if (definition.max !== undefined) {
        schema.maximum = definition.max;
      }

      if (definition.step !== undefined) {
        schema.multipleOf = definition.step;
      }

      break;
    }

    case 'text': {
      schema.type = 'string';
      break;
    }

    case 'checkbox': {
      schema.type = 'boolean';
      if (definition.checked !== undefined) {
        schema.default = definition.checked;
      }

      break;
    }

    case 'choice': {
      if (definition.values && definition.values.length > 0) {
        schema.enum = definition.values as JSONSchema7['enum'];
        // Note: enumNames is not part of standard JSON Schema but is supported by react-jsonschema-form
      }

      break;
    }

    case 'group': {
      // Groups are organizational, skip type definition
      break;
    }

    default: {
      // If no type specified, infer from default value
      if (defaultValue !== undefined) {
        if (typeof defaultValue === 'number') {
          schema.type = Number.isInteger(defaultValue) ? 'integer' : 'number';
        } else if (typeof defaultValue === 'string') {
          schema.type = 'string';
        } else if (typeof defaultValue === 'boolean') {
          schema.type = 'boolean';
        }
      }
    }
  }

  return schema;
}

/**
 * Convert JSCAD parameter definitions to JSON Schema
 *
 * Converts the array format used by JSCAD's getParameterDefinitions()
 * into a proper JSON Schema object that can be used for validation
 * and UI generation.
 *
 * @param definitions - Array of JSCAD parameter definitions
 * @returns JSON Schema object
 *
 * @example
 * ```typescript
 * const definitions = [
 *   { name: 'width', caption: 'Width:', type: 'float', initial: 10, min: 1, max: 100 },
 *   { name: 'height', caption: 'Height:', type: 'int', initial: 20, min: 1 }
 * ];
 *
 * const schema = convertParameterDefinitionsToJsonSchema(definitions);
 * // Returns:
 * // {
 * //   type: 'object',
 * //   properties: {
 * //     width: { type: 'number', description: 'Width:', default: 10, minimum: 1, maximum: 100 },
 * //     height: { type: 'integer', description: 'Height:', default: 20, minimum: 1 }
 * //   }
 * // }
 * ```
 */
export function convertParameterDefinitionsToJsonSchema(definitions: JscadParameterDefinition[]): JSONSchema7 {
  const properties: Record<string, JSONSchema7> = {};

  for (const definition of definitions) {
    // Skip group entries (they're organizational, not actual parameters)
    if (definition.type === 'group') {
      continue;
    }

    properties[definition.name] = convertParameterDefinitionToJsonSchemaProperty(definition);
  }

  return {
    type: 'object',
    properties,
  };
}
