import type { JSONSchema7 } from 'json-schema';
import { isEqual, keys, xor } from '#to-json-schema/to-json-schema.utils.js';
import { formatRegexps, types } from '#to-json-schema/json-schema-helpers.js';

export const stringFormats = Object.keys(formatRegexps);

export const typeNames = [
  'integer',
  'number', // Make sure number is after integer (for proper type detection)
  'string',
  'array',
  'object',
  'boolean',
  'null',
  'date',
] as const;

export function getType(value: unknown): string | undefined {
  return typeNames.find((typeName) => types[typeName]!(value));
}

function getCommonTypeFromArrayOfTypes(arrayOfTypes: string[]): string | undefined {
  let lastValue: string | undefined;
  for (let i = 0, { length } = arrayOfTypes; i < length; i++) {
    const currentType = arrayOfTypes[i];
    if (currentType === undefined) {
      continue;
    }

    if (i > 0) {
      if (currentType === 'integer' && lastValue === 'number') {
        // CurrentType is already set, continue
      } else if (currentType === 'number' && lastValue === 'integer') {
        lastValue = 'number';
      } else if (lastValue !== currentType) {
        return undefined;
      }
    }

    lastValue = currentType;
  }

  return lastValue;
}

export function getCommonArrayItemsType(array: unknown[]): string | undefined {
  return getCommonTypeFromArrayOfTypes(array.map((item) => getType(item) ?? ''));
}

/**
 * Tries to find the least common schema from two supplied JSON schemas. If it is unable to find
 * such a schema, it returns null. Incompatibility in structure/types leads to returning null,
 * except when the difference is only integer/number. Than the 'number' is used instead 'int'.
 * Types/Structure incompatibility in array items only leads to schema that doesn't specify
 * items structure/type.
 * @param schema1 - JSON schema
 * @param schema2 - JSON schema
 * @returns JSON schema or null
 */
// eslint-disable-next-line complexity -- taken from source code.
export function mergeSchemaObjs(schema1: JSONSchema7, schema2: JSONSchema7): JSONSchema7 | undefined {
  const schema1Keys = keys(schema1 as Record<string, unknown>);
  const schema2Keys = keys(schema2 as Record<string, unknown>);

  if (!isEqual(schema1Keys, schema2Keys)) {
    if (schema1.type === 'array' && schema2.type === 'array' && isEqual(xor(schema1Keys, schema2Keys), ['items'])) {
      const schemaWithoutItems = schema1Keys.length > schema2Keys.length ? schema2 : schema1;
      const schemaWithItems = schema1Keys.length > schema2Keys.length ? schema1 : schema2;
      const keysWithoutItems = keys(schemaWithoutItems as Record<string, unknown>);
      let isSame = true;

      for (const current of keysWithoutItems) {
        const withoutItemsValue = (schemaWithoutItems as Record<string, unknown>)[current];
        const withItemsValue = (schemaWithItems as Record<string, unknown>)[current];
        if (!isEqual(withoutItemsValue, withItemsValue)) {
          isSame = false;
          break;
        }
      }

      if (isSame) {
        return schemaWithoutItems;
      }
    }

    if (schema1.type !== 'object' || schema2.type !== 'object') {
      return undefined;
    }
  }

  const returnValueObject: Record<string, unknown> = {};
  for (let i = 0, { length } = schema1Keys; i < length; i++) {
    const key = schema1Keys[i];
    if (key === undefined) {
      continue;
    }

    const schema1Value = (schema1 as Record<string, unknown>)[key];
    const schema2Value = (schema2 as Record<string, unknown>)[key];

    if (getType(schema1Value) === 'object') {
      const merged = mergeSchemaObjs(schema1Value as JSONSchema7, schema2Value as JSONSchema7);
      if (merged === undefined) {
        if (schema1.type === 'object' || schema2.type === 'object') {
          return { type: 'object' };
        }

        // Special treatment for array items. If not mergeable, we can do without them
        if (key !== 'items' || schema1.type !== 'array' || schema2.type !== 'array') {
          return undefined;
        }
      } else {
        returnValueObject[key] = merged;
      }
    } else if (key === 'type') {
      if (schema1Value === schema2Value) {
        returnValueObject[key] = schema1Value;
      } else if (
        (schema1Value === 'integer' && schema2Value === 'number') ||
        (schema1Value === 'number' && schema2Value === 'integer')
      ) {
        returnValueObject[key] = 'number';
      } else {
        return undefined;
      }
    } else {
      if (!isEqual(schema1Value, schema2Value)) {
        // TODO Is it even possible to take this path?
        return undefined;
      }

      returnValueObject[key] = schema1Value;
    }
  }

  return returnValueObject as JSONSchema7;
}
