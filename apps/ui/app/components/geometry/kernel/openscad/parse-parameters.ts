/**
 * API extracted from OpenSCAD User Manual
 * @see https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer
 */
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

export type ParameterOption = {
  name: string;
  value: number | string;
};

export type BaseParameter = {
  caption?: string;
  group: string;
  name: string;
};

export type NumberParameter = BaseParameter & {
  type: 'number';
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  options?: ParameterOption[];
};

export type StringParameter = BaseParameter & {
  type: 'string';
  initial: string;
  options?: ParameterOption[];
};

export type BooleanParameter = BaseParameter & {
  type: 'boolean';
  initial: boolean;
};

export type VectorParameter = BaseParameter & {
  type: 'number';
  initial: number[];
  min?: number;
  max?: number;
  step?: number;
};

export type Parameter = NumberParameter | StringParameter | BooleanParameter | VectorParameter;

export type ParameterSet = {
  parameters: Parameter[];
  title: string;
};

export type OpenScadParameter = {
  group: string;
  initial: string | number | boolean | number[];
  name: string;
  type: 'string' | 'number' | 'boolean';
  caption?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ name: string; value: string | number }>;
};

export type OpenScadParameterExport = {
  parameters: OpenScadParameter[];
  title: string;
};

/**
 * Convert OpenSCAD parameter export to JSON schema with proper grouping
 * Based on OpenSCAD Customizer specification: https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer
 */
export function processOpenScadParameters(exportData: OpenScadParameterExport): JSONSchema7 {
  const properties: Record<string, JSONSchema7Definition> = {};
  const groups: Record<string, Record<string, JSONSchema7Definition>> = {};

  // Process each parameter
  for (const parameter of exportData.parameters) {
    // Skip internal OpenSCAD parameters
    if (parameter.name.startsWith('$')) {
      continue;
    }

    const schemaProperty = createSchemaProperty(parameter);

    // Handle grouping - only group if there's an explicit non-default group
    if (
      parameter.group &&
      parameter.group !== 'Global' &&
      parameter.group !== '' &&
      parameter.group !== 'Parameters' &&
      parameter.group.trim() !== ''
    ) {
      // Group parameters under their group name
      groups[parameter.group] ??= {};
      groups[parameter.group]![parameter.name] = schemaProperty;
    } else {
      // Global or ungrouped parameters go to root level
      properties[parameter.name] = schemaProperty;
    }
  }

  // Add grouped properties as nested objects
  for (const [groupName, groupProperties] of Object.entries(groups)) {
    // Skip Hidden group as it shouldn't be exposed in UI
    if (groupName === 'Hidden') {
      continue;
    }

    properties[groupName] = {
      type: 'object',
      properties: groupProperties,
      title: groupName,
      additionalProperties: false,
    };
  }

  const jsonSchema: JSONSchema7 = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  return jsonSchema;
}

/**
 * Create a JSON schema property from an OpenSCAD parameter
 */
function createSchemaProperty(parameter: OpenScadParameter): JSONSchema7 {
  const baseProperty: JSONSchema7 = {
    title: parameter.name,
    default: parameter.initial as JSONSchema7['default'],
    ...(parameter.caption && { description: parameter.caption }),
  };

  switch (parameter.type) {
    case 'boolean': {
      return {
        ...baseProperty,
        type: 'boolean',
      };
    }

    case 'string': {
      if (parameter.options && parameter.options.length > 0) {
        // Use oneOf for labeled options to display custom names properly
        return {
          ...baseProperty,
          type: 'string',
          oneOf: parameter.options.map((opt) => ({
            const: opt.value,
            title: opt.name,
          })),
        };
      }

      return {
        ...baseProperty,
        type: 'string',
      };
    }

    case 'number': {
      // Check if this is actually a vector (array initial value)
      if (Array.isArray(parameter.initial)) {
        return {
          ...baseProperty,
          type: 'array',
          items: {
            type: 'number',
            ...(parameter.min !== undefined && { minimum: parameter.min }),
            ...(parameter.max !== undefined && { maximum: parameter.max }),
            ...(parameter.step !== undefined && { multipleOf: parameter.step }),
          },
          minItems: parameter.initial.length,
          maxItems: parameter.initial.length,
          default: parameter.initial,
        };
      }

      if (parameter.options && parameter.options.length > 0) {
        // Use oneOf for labeled options to display custom names properly
        return {
          ...baseProperty,
          type: 'number',
          oneOf: parameter.options.map((opt) => ({
            const: opt.value,
            title: opt.name,
          })),
        };
      }

      return {
        ...baseProperty,
        type: 'number',
        ...(parameter.min !== undefined && { minimum: parameter.min }),
        ...(parameter.max !== undefined && { maximum: parameter.max }),
        ...(parameter.step !== undefined && { multipleOf: parameter.step }),
      };
    }
  }
}

/**
 * Flatten grouped parameters for injection into OpenSCAD
 * Converts nested group objects back to flat parameter names
 */
export function flattenParametersForInjection(parameters: Record<string, unknown>): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parameters)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // This is likely a group object, flatten its properties
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        flattened[subKey] = subValue;
      }
    } else {
      // Regular parameter
      flattened[key] = value;
    }
  }

  return flattened;
}
