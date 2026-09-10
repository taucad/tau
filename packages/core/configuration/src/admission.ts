import { Validator } from '@cfworker/json-schema';
import { quantityIds } from '@taucad/units/constants';

/** Draft-7 schema data admitted by configuration-core. @public */
export type JsonSchema = Readonly<Record<string, unknown>>;

const draft7Uri = 'http://json-schema.org/draft-07/schema#';
const quantityIdSet = new Set<string>(quantityIds);
const allowedKeywords = new Set([
  '$comment',
  '$id',
  '$ref',
  '$schema',
  'additionalItems',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'contains',
  'default',
  'definitions',
  'dependencies',
  'deprecated',
  'description',
  'else',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'if',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'multipleOf',
  'not',
  'oneOf',
  'properties',
  'propertyNames',
  'readOnly',
  'required',
  'then',
  'title',
  'type',
  'uniqueItems',
  'x-tau-quantity',
]);
const schemaMapKeywords = new Set(['definitions', 'properties']);
const schemaArrayKeywords = new Set(['allOf', 'anyOf', 'oneOf']);
const schemaKeywords = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
]);
const numericKeywords = new Set([
  'exclusiveMaximum',
  'exclusiveMinimum',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'multipleOf',
]);
const booleanKeywords = new Set(['deprecated', 'readOnly', 'uniqueItems']);
const primitiveTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

type Role = 'schema' | 'schema-array' | 'schema-map' | 'data';
type Work = {
  readonly value: unknown;
  readonly depth: number;
  readonly pointer: string;
  readonly role: Role;
};

const fail = (code: string, pointer: string, reason: string): never => {
  throw new TypeError(`${code} at ${pointer || '/'}: ${reason}`);
};

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

// oxlint-disable-next-line complexity -- Draft-7 keyword validation is a bounded flat dispatch.
const assertKeywordValue = (input: {
  readonly schema: JsonSchema;
  readonly key: string;
  readonly value: unknown;
  readonly pointer: string;
}): void => {
  const { schema, key, value, pointer } = input;
  if (numericKeywords.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
    fail('INVALID_SCHEMA', pointer, `${key} must be finite`);
  }
  if (booleanKeywords.has(key) && typeof value !== 'boolean') {
    fail('INVALID_SCHEMA', pointer, `${key} must be boolean`);
  }
  if (key === 'type') {
    const types = Array.isArray(value) ? value : [value];
    if (types.length === 0 || types.some((type) => typeof type !== 'string' || !primitiveTypes.has(type))) {
      fail('INVALID_SCHEMA', pointer, 'type must name Draft-7 primitive types');
    }
  }
  if (key === 'required' && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
    fail('INVALID_SCHEMA', pointer, 'required must contain property names');
  }
  if (key === 'enum' && (!Array.isArray(value) || value.length === 0)) {
    fail('INVALID_SCHEMA', pointer, 'enum must not be empty');
  }
  if (key === '$schema' && value !== draft7Uri) {
    fail('UNSUPPORTED_DIALECT', pointer, `expected ${draft7Uri}`);
  }
  if (key === '$ref' && (typeof value !== 'string' || !value.startsWith('#/definitions/'))) {
    fail('UNSUPPORTED_REFERENCE', pointer, 'only bundled definitions are supported');
  }
  if (key === 'x-tau-quantity') {
    const schemaType = schema['type'];
    const types = Array.isArray(schemaType) ? schemaType : [schemaType];
    if (
      typeof value !== 'string' ||
      !quantityIdSet.has(value) ||
      !types.some((type) => type === 'number' || type === 'integer')
    ) {
      fail('INVALID_QUANTITY', pointer, 'quantity must be a registry ID on a numeric schema');
    }
  }
};

const childRole = (role: Role, key: string, value: unknown): Role => {
  if (role === 'schema-map' || role === 'schema-array') {
    return 'schema';
  }
  if (role !== 'schema') {
    return 'data';
  }
  if (schemaMapKeywords.has(key)) {
    return 'schema-map';
  }
  if (schemaArrayKeywords.has(key)) {
    return 'schema-array';
  }
  if (key === 'items' && Array.isArray(value)) {
    return 'schema-array';
  }
  if (schemaKeywords.has(key)) {
    return 'schema';
  }
  if (key === 'dependencies') {
    return 'schema-map';
  }
  return 'data';
};

const resolveReference = (root: JsonSchema, reference: string): unknown => {
  let target: unknown = root;
  for (const encoded of decodeURIComponent(reference.slice(2)).split('/')) {
    if (/~(?![01])/u.test(encoded)) {
      fail('INVALID_REFERENCE', reference, 'invalid JSON Pointer escape');
    }
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (target === null || typeof target !== 'object' || !Object.hasOwn(target, key)) {
      fail('UNRESOLVED_REFERENCE', reference, 'target does not exist');
    }
    target = (target as Record<string, unknown>)[key];
  }
  return target;
};

/**
 * Admit one bounded Draft-7 schema or throw a pointer-addressed error.
 * @param schema - Materialized JSON Schema data.
 * @public
 */
export const admitJsonSchema = (schema: JsonSchema): void => {
  const stack: Work[] = [{ value: schema, depth: 0, pointer: '', role: 'schema' }];
  const seen = new Set<Record<string, unknown>>();
  const schemaNodes = new Set<Record<string, unknown>>();
  let nodes = 0;
  let stringCharacters = 0;

  while (stack.length > 0) {
    const item = stack.pop()!;
    nodes += 1;
    if (nodes > 2048 || item.depth > 20) {
      fail('SCHEMA_LIMIT', item.pointer, 'depth or node budget exceeded');
    }
    if (typeof item.value === 'string') {
      stringCharacters += item.value.length;
      if (stringCharacters > 65_536) {
        fail('SCHEMA_STRING_LIMIT', item.pointer, 'string budget exceeded');
      }
    }
    if (item.value === null || typeof item.value !== 'object') {
      continue;
    }
    if (seen.has(item.value)) {
      fail('CYCLIC_SCHEMA', item.pointer, 'object graph is cyclic or aliased');
    }
    seen.add(item.value);
    if (item.role === 'schema') {
      schemaNodes.add(item.value);
    }

    for (const [key, value] of Object.entries(item.value)) {
      const pointer = `${item.pointer}/${escapePointer(key)}`;
      if (item.role === 'schema') {
        if (key === 'pattern' || key === 'patternProperties') {
          fail('UNSUPPORTED_KEYWORD', pointer, 'regular expressions are excluded');
        }
        if (!allowedKeywords.has(key)) {
          fail('UNSUPPORTED_KEYWORD', pointer, key);
        }
        assertKeywordValue({
          schema: item.value as JsonSchema,
          key,
          value,
          pointer,
        });
      }
      stack.push({
        value,
        depth: item.depth + 1,
        pointer,
        role: childRole(item.role, key, value),
      });
    }
  }

  const complete = new Set<Record<string, unknown>>();
  const ancestors = new Set<Record<string, unknown>>();
  const visitReferences = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || complete.has(value)) {
      return;
    }
    if (ancestors.has(value)) {
      fail('CYCLIC_REFERENCE', '', 'local reference cycle');
    }
    ancestors.add(value);
    if (schemaNodes.has(value)) {
      const reference = (value as { readonly $ref?: unknown }).$ref;
      if (typeof reference === 'string') {
        const target = resolveReference(schema, reference);
        if (target === null || typeof target !== 'object' || !schemaNodes.has(target)) {
          fail('NON_SCHEMA_REFERENCE', reference, 'target is not a schema node');
        }
        visitReferences(target);
      }
    }
    for (const child of Object.values(value)) {
      visitReferences(child);
    }
    ancestors.delete(value);
    complete.add(value);
  };
  visitReferences(schema);

  try {
    const validator = new Validator(schema, '7', false);
    void validator;
  } catch (error) {
    fail('INVALID_SCHEMA', '', error instanceof Error ? error.message : 'validator setup failed');
  }
};

export const validateJsonSchemaValue = (schema: JsonSchema, value: unknown): boolean => {
  try {
    return new Validator(schema, '7', false).validate(value).valid;
  } catch {
    return false;
  }
};
