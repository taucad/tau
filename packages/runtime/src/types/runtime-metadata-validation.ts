import type { JSONSchema7 } from '@taucad/json-schema';

/** Admit only lossless plain JSON metadata, including nested defaults. @internal */
export const isWireJson = (value: unknown, ancestors = new Set<unknown>(), depth = 0): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 64 || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) return false;
  if (ownKeys.length - (Array.isArray(value) ? 1 : 0) !== Object.keys(value).length) return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length) return false;
  ancestors.add(value);
  try {
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => 'value' in descriptor && isWireJson(descriptor.value, ancestors, depth + 1),
    );
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
};

/** Check the JSON Schema fields used by runtime option admission. @internal */
export const isJsonSchema = (value: unknown): value is JSONSchema7 => {
  if (!isWireJson(value) || typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  if (schema['type'] !== undefined) {
    const types = Array.isArray(schema['type']) ? schema['type'] : [schema['type']];
    if (!types.every((type) => typeof type === 'string' && jsonSchemaTypes.has(type))) return false;
  }
  if (schema['properties'] !== undefined) {
    if (
      typeof schema['properties'] !== 'object' ||
      schema['properties'] === null ||
      Array.isArray(schema['properties'])
    ) {
      return false;
    }
    if (
      !Object.values(schema['properties']).every((property) => typeof property === 'boolean' || isJsonSchema(property))
    ) {
      return false;
    }
  }
  if (
    schema['required'] !== undefined &&
    (!Array.isArray(schema['required']) || !schema['required'].every((key) => typeof key === 'string'))
  ) {
    return false;
  }
  return true;
};

const jsonSchemaTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
