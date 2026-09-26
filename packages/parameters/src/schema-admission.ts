import { Validator } from '@cfworker/json-schema';
import { canonicalizeCacheValue } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { admitUnit } from '@taucad/units/unit';
import { quantityKinds, quantityReferences } from '@taucad/units/quantity';
import { assertBoundedJson } from '#bounded-json.js';

/** JSON Schema data (Draft-07 or 2020-12) admitted by the configuration and parameter boundaries. @public */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** JSON Schema dialect a document declares with `$schema`; a document without one is Draft-07. @public */
export type JsonSchemaDialect = 'draft-07' | '2020-12';

const dialectUris: Readonly<Record<JsonSchemaDialect, string>> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};
const definitionsKeywords: Readonly<Record<JsonSchemaDialect, string>> = {
  'draft-07': 'definitions',
  '2020-12': '$defs',
};
const validatorDrafts: Readonly<Record<JsonSchemaDialect, '7' | '2020-12'>> = { 'draft-07': '7', '2020-12': '2020-12' };
// OpenAPI numeric widths the parameter carrier represents; 64-bit integers are string-encoded there.
const numericFormats = new Map([
  ['float', 'number'],
  ['double', 'number'],
  ['int32', 'integer'],
  ['uint32', 'integer'],
]);
const kinds = new Set<string>(Object.values(quantityKinds));
const references = new Set<string>(Object.values(quantityReferences));
const primitives = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
const commonKeywords = [
  '$comment',
  '$id',
  '$ref',
  '$schema',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'contains',
  'default',
  'deprecated',
  'description',
  'else',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
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
  'x-tau-quantity-kind',
  'x-tau-reference',
  'x-tau-space',
  'x-tau-symbol',
  'x-tau-symbols',
  'x-tau-unit',
  'x-ogc-definition',
  'x-ogc-unit',
  'x-ogc-unitLang',
];
const semanticClaims = [
  'x-ogc-definition',
  'x-tau-quantity-kind',
  'x-tau-reference',
  'x-tau-space',
  'x-tau-symbol',
  'x-tau-symbols',
] as const;
// Each dialect admits its own spelling of the definitions and dependency keywords.
const allowedKeywords: Readonly<Record<JsonSchemaDialect, ReadonlySet<string>>> = {
  'draft-07': new Set([...commonKeywords, 'additionalItems', 'definitions', 'dependencies']),
  '2020-12': new Set([...commonKeywords, '$defs', 'dependentRequired']),
};
const schemaMapKeywords = new Set(['$defs', 'definitions', 'properties']);
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
const finiteNumberKeywords = new Set(['exclusiveMaximum', 'exclusiveMinimum', 'maximum', 'minimum']);
const nonnegativeIntegerKeywords = new Set([
  'maxItems',
  'maxLength',
  'maxProperties',
  'minItems',
  'minLength',
  'minProperties',
]);
const booleanKeywords = new Set(['deprecated', 'readOnly', 'uniqueItems']);
const stringKeywords = new Set(['$comment', '$id', 'description', 'format', 'title']);

type Role = 'schema' | 'schema-array' | 'schema-map' | 'dependency-map' | 'data';
type Work = Readonly<{
  value: unknown;
  depth: number;
  pointer: string;
  role: Role;
}>;

const fail = (code: string, pointer: string, reason: string): never => {
  throw new TypeError(`${code} at ${pointer || '/'}: ${reason}`);
};

const escapePointer = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const assertUniqueStrings = (value: unknown, pointer: string, label: string): void => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') || new Set(value).size !== value.length) {
    fail('INVALID_SCHEMA', pointer, `${label} must contain unique strings`);
  }
};

const assertSchemaShape = (value: unknown, pointer: string): void => {
  if (typeof value !== 'boolean' && !isRecord(value)) {
    fail('INVALID_SCHEMA', pointer, 'schema must be an object or boolean');
  }
};

const declaredTypes = (schema: JsonSchema): readonly unknown[] => {
  const schemaType = schema['type'];
  return Array.isArray(schemaType) ? schemaType : [schemaType];
};

// Requirement 1 of the OGC schema profile pins 2020-12; Draft-07 remains the dialect of an unlabelled document.
const dialectOf = (schema: JsonSchema): JsonSchemaDialect =>
  schema['$schema'] === dialectUris['2020-12'] ? '2020-12' : 'draft-07';

// OGC Recommendation 1 G–L in 2020-12 documents: float and double on number, int32 and uint32 on integer.
const assertNumericFormat = (schema: JsonSchema, format: string, pointer: string): void => {
  const numericTypes = declaredTypes(schema).filter((type) => type === 'number' || type === 'integer');
  const width = numericFormats.get(format);
  if (numericTypes.length === 0 && width === undefined && format !== 'int64' && format !== 'uint64') {
    return;
  }
  if (format === 'int64' || format === 'uint64') {
    fail('UNSUPPORTED_FORMAT', pointer, `${format} values need string encoding in the parameter carrier`);
  }
  if (numericTypes.length !== 1 || numericTypes[0] !== width) {
    fail(
      'UNSUPPORTED_FORMAT',
      pointer,
      'numeric format must be float or double on number, or int32 or uint32 on integer',
    );
  }
};

// oxlint-disable-next-line complexity -- keyword validation is a bounded flat dispatch.
const assertKeywordValue = (
  input: Readonly<{
    schema: JsonSchema;
    key: string;
    value: unknown;
    pointer: string;
    dialect: JsonSchemaDialect;
  }>,
): void => {
  const { schema, key, value, pointer, dialect } = input;
  if (finiteNumberKeywords.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
    fail('INVALID_SCHEMA', pointer, `${key} must be finite`);
  }
  if (nonnegativeIntegerKeywords.has(key) && (!Number.isSafeInteger(value) || (value as number) < 0)) {
    fail('INVALID_SCHEMA', pointer, `${key} must be a nonnegative integer`);
  }
  if (key === 'multipleOf' && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
    fail('INVALID_SCHEMA', pointer, 'multipleOf must be finite and greater than zero');
  }
  if (booleanKeywords.has(key) && typeof value !== 'boolean') {
    fail('INVALID_SCHEMA', pointer, `${key} must be boolean`);
  }
  if (stringKeywords.has(key) && typeof value !== 'string') {
    fail('INVALID_SCHEMA', pointer, `${key} must be a string`);
  }
  if (key === 'type') {
    const types = Array.isArray(value) ? value : [value];
    if (
      types.length === 0 ||
      types.some((type) => typeof type !== 'string' || !primitives.has(type)) ||
      new Set(types).size !== types.length
    ) {
      fail('INVALID_SCHEMA', pointer, 'type must name unique JSON Schema primitive types');
    }
  }
  // Draft-07 keeps format an inert annotation, as before the 2020-12 profile existed.
  if (key === 'format' && typeof value === 'string' && dialect === '2020-12') {
    assertNumericFormat(schema, value, pointer);
  }
  if (key === 'required') {
    assertUniqueStrings(value, pointer, 'required');
  }
  if (key === 'enum') {
    if (!Array.isArray(value) || value.length === 0) {
      fail('INVALID_SCHEMA', pointer, 'enum must not be empty');
    }
    const enumValues = value as readonly unknown[];
    const entries = enumValues.map((entry) => canonicalizeCacheValue({ value: entry as CacheValue }));
    if (new Set(entries).size !== entries.length) {
      fail('INVALID_SCHEMA', pointer, 'enum values must be unique');
    }
  }
  if (key === 'examples' && !Array.isArray(value)) {
    fail('INVALID_SCHEMA', pointer, 'examples must be an array');
  }
  if (schemaMapKeywords.has(key) && !isRecord(value)) {
    fail('INVALID_SCHEMA', pointer, `${key} must be an object`);
  }
  if (schemaArrayKeywords.has(key) && (!Array.isArray(value) || value.length === 0)) {
    fail('INVALID_SCHEMA', pointer, `${key} must be a non-empty schema array`);
  }
  if (schemaKeywords.has(key)) {
    if (key === 'items' && Array.isArray(value)) {
      if (dialect === '2020-12') {
        fail('INVALID_SCHEMA', pointer, 'items must be one schema in 2020-12; tuple prefixItems are not admitted');
      }
      if (value.length === 0) {
        fail('INVALID_SCHEMA', pointer, 'tuple items must not be empty');
      }
      for (const item of value) {
        assertSchemaShape(item, pointer);
      }
    } else {
      assertSchemaShape(value, pointer);
    }
  }
  if (key === 'dependencies' && !isRecord(value)) {
    fail('INVALID_SCHEMA', pointer, 'dependencies must be an object');
  }
  if (key === 'dependentRequired') {
    if (!isRecord(value)) {
      fail('INVALID_SCHEMA', pointer, 'dependentRequired must be an object');
    }
    for (const [property, required] of Object.entries(value as Record<string, unknown>)) {
      assertUniqueStrings(required, `${pointer}/${escapePointer(property)}`, 'dependentRequired');
    }
  }
  if (key === '$schema' && value !== dialectUris[dialect]) {
    fail(
      'UNSUPPORTED_DIALECT',
      pointer,
      Object.values(dialectUris).includes(value as string)
        ? `every $schema must match the root dialect ${dialectUris[dialect]}`
        : `expected ${dialectUris['draft-07']} or ${dialectUris['2020-12']}`,
    );
  }
  const definitions = `#/${definitionsKeywords[dialect]}/`;
  if (key === '$ref' && (typeof value !== 'string' || !value.startsWith(definitions))) {
    fail('UNSUPPORTED_REFERENCE', pointer, `only bundled ${definitions} references are supported`);
  }
  if (key === 'x-tau-unit') {
    const schemaType = schema['type'];
    const declared = Array.isArray(schemaType) ? schemaType : [schemaType];
    const legalTypes =
      declared.length > 0 && declared.every((type) => type === 'number' || type === 'integer' || type === 'null');
    const numeric = declared.some((type) => type === 'number' || type === 'integer');
    if (typeof value !== 'string' || admitUnit(value).status !== 'success' || !legalTypes || !numeric) {
      fail('INVALID_QUANTITY', pointer, 'unit must be admitted UCUM on a numeric or nullable-numeric schema');
    }
  }
  if (key === 'x-ogc-unit') {
    const schemaType = schema['type'];
    const declared = Array.isArray(schemaType) ? schemaType : [schemaType];
    const numeric = declared.some((type) => type === 'number' || type === 'integer');
    const decimalLexical = declared.includes('string') && typeof schema['pattern'] === 'string';
    if (typeof value !== 'string' || admitUnit(value).status !== 'success' || (!numeric && !decimalLexical)) {
      fail('INVALID_QUANTITY', pointer, 'OGC unit must be admitted UCUM on numeric or decimal-lexical data');
    }
  }
  // OGC Requirement 8 allows any definition URI; Tau reads it as the QUDT quantity kind (ruling P5).
  if (key === 'x-ogc-definition' && (typeof value !== 'string' || !kinds.has(value))) {
    fail('UNSUPPORTED_DEFINITION', pointer, 'x-ogc-definition must name a reviewed QUDT quantity kind');
  }
  if (key === 'x-tau-quantity-kind' && (typeof value !== 'string' || !kinds.has(value))) {
    fail('INVALID_QUANTITY', pointer, 'quantity kind must use the reviewed exact QUDT URI');
  }
  if (key === 'x-tau-space' && !['linear', 'difference', 'point'].includes(value as string)) {
    fail('INVALID_QUANTITY', pointer, 'space must be linear, difference, or point');
  }
  if (key === 'x-tau-reference' && (typeof value !== 'string' || !references.has(value))) {
    fail('INVALID_QUANTITY', pointer, 'reference is outside the supported profile');
  }
  if (key === 'x-tau-symbol' && (typeof value !== 'string' || value.length === 0)) {
    fail('INVALID_QUANTITY', pointer, 'symbol must be a non-empty string');
  }
  if (
    key === 'x-tau-symbols' &&
    (!isRecord(value) ||
      Object.entries(value).some(
        ([tag, symbol]) =>
          (tag !== 'default' && !tag.startsWith('lang:')) || typeof symbol !== 'string' || symbol.length === 0,
      ))
  ) {
    fail('INVALID_QUANTITY', pointer, 'symbols must map default or lang: tags to non-empty strings');
  }
};

// Rules that relate several quantity keywords of one schema; they run before any single keyword is checked, so a
// QUDT unit is refused for its language rather than for failing UCUM admission.
const assertQuantityClaims = (schema: JsonSchema, pointer: string): void => {
  const at = (keyword: string): string => `${pointer}/${keyword}`;
  const unitLanguage = schema['x-ogc-unitLang'];
  if (unitLanguage !== undefined) {
    // OGC Requirement 7: QUDT unit URIs have no mapping in the Tau unit profile.
    if (unitLanguage === 'QUDT') {
      fail('UNSUPPORTED_UNIT_LANGUAGE', at('x-ogc-unitLang'), 'QUDT unit URIs have no UCUM mapping; declare UCUM');
    }
    if (unitLanguage !== 'UCUM') {
      fail('INVALID_QUANTITY', at('x-ogc-unitLang'), 'OGC unit language must be UCUM or QUDT');
    }
    if (schema['x-ogc-unit'] === undefined) {
      fail('INVALID_QUANTITY', at('x-ogc-unitLang'), 'OGC unit language requires an OGC unit');
    }
  }
  const tauUnit = schema['x-tau-unit'];
  const ogcUnit = schema['x-ogc-unit'];
  if (tauUnit !== undefined && ogcUnit !== undefined && tauUnit !== ogcUnit) {
    fail('METADATA_CONFLICT', at('x-ogc-unit'), 'conflicting Tau and OGC unit annotations');
  }
  const definition = schema['x-ogc-definition'];
  const kind = schema['x-tau-quantity-kind'];
  if (definition !== undefined && kind !== undefined && definition !== kind) {
    fail('METADATA_CONFLICT', at('x-ogc-definition'), 'x-ogc-definition and its x-tau-quantity-kind alias disagree');
  }
  const claim = semanticClaims.find((keyword) => schema[keyword] !== undefined);
  if (claim !== undefined && tauUnit === undefined && ogcUnit === undefined) {
    fail('INVALID_QUANTITY', at(claim), 'semantic quantity fields require an admitted unit');
  }
  if ((schema['x-tau-space'] === 'point') !== (schema['x-tau-reference'] !== undefined)) {
    fail(
      'INVALID_QUANTITY',
      at(schema['x-tau-space'] === 'point' ? 'x-tau-space' : 'x-tau-reference'),
      'point space requires a supported reference and other spaces forbid one',
    );
  }
};

const childRole = (role: Role, key: string, value: unknown): Role => {
  if (role === 'schema-map' || role === 'schema-array') {
    return 'schema';
  }
  if (role === 'dependency-map') {
    return Array.isArray(value) ? 'data' : 'schema';
  }
  if (role !== 'schema') {
    return 'data';
  }
  if (schemaMapKeywords.has(key)) {
    return 'schema-map';
  }
  if (schemaArrayKeywords.has(key) || (key === 'items' && Array.isArray(value))) {
    return 'schema-array';
  }
  if (schemaKeywords.has(key)) {
    return 'schema';
  }
  if (key === 'dependencies') {
    return 'dependency-map';
  }
  return 'data';
};

const resolveReference = (root: JsonSchema, reference: string): unknown => {
  let target: unknown = root;
  let decoded = '';
  try {
    decoded = decodeURIComponent(reference.slice(2));
  } catch {
    fail('INVALID_REFERENCE', reference, 'invalid percent encoding');
  }
  for (const encoded of decoded.split('/')) {
    if (/~(?![01])/u.test(encoded)) {
      fail('INVALID_REFERENCE', reference, 'invalid JSON Pointer escape');
    }
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isRecord(target)) {
      fail('UNRESOLVED_REFERENCE', reference, 'target does not exist');
    }
    const targetRecord = target as Record<string, unknown>;
    if (!Object.hasOwn(targetRecord, key)) {
      fail('UNRESOLVED_REFERENCE', reference, 'target does not exist');
    }
    target = targetRecord[key];
  }
  return target;
};

/**
 * Resolve a chain of admitted local references for schema-aware UI admission.
 * @param root - Root schema containing bundled definitions.
 * @param input - Schema node to resolve.
 * @returns The terminal object schema.
 * @public
 */
export const resolveLocalSchema = (root: JsonSchema, input: JsonSchema): JsonSchema => {
  let schema = input;
  const seen = new Set<JsonSchema>();
  let reference = schema['$ref'];
  while (typeof reference === 'string') {
    if (seen.has(schema)) {
      fail('CYCLIC_REFERENCE', reference, 'local reference cycle');
    }
    seen.add(schema);
    const target = resolveReference(root, reference);
    if (!isRecord(target)) {
      fail('NON_SCHEMA_REFERENCE', reference, 'target is not an object schema');
    }
    schema = target as JsonSchema;
    reference = schema['$ref'];
  }
  return schema;
};

/** Admit one bounded Draft-07 or 2020-12 object schema, as its `$schema` declares, or throw a pointer-addressed error.
 * @param schema - Untrusted schema data.
 * @public
 */
// oxlint-disable-next-line eslint/complexity -- One bounded walk enforces the closed subset of each dialect.
export const admitJsonSchema = (schema: JsonSchema): void => {
  if (!isRecord(schema)) {
    fail('INVALID_SCHEMA', '', 'root schema must be an object');
  }
  const dialect = dialectOf(schema);
  assertBoundedJson(schema, {
    code: 'SCHEMA',
    maximumDepth: 20,
    maximumNodes: 2048,
    maximumCharacters: 65_536,
  });
  try {
    canonicalizeCacheValue({ value: schema as CacheValue });
  } catch (error) {
    fail(
      'INVALID_SCHEMA',
      '',
      `schema must be canonical JSON data (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  const stack: Work[] = [{ value: schema, depth: 0, pointer: '', role: 'schema' }];
  const seen = new Set<Record<string, unknown>>();
  const schemaNodes = new Set<unknown>();
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
    if (item.role === 'schema' && typeof item.value === 'boolean') {
      schemaNodes.add(item.value);
    }
    if (
      item.role === 'schema' &&
      typeof item.value !== 'boolean' &&
      (item.value === null || typeof item.value !== 'object')
    ) {
      fail('INVALID_SCHEMA', item.pointer, 'schema must be an object or boolean');
    }
    if (item.value === null || typeof item.value !== 'object') {
      continue;
    }
    if (seen.has(item.value as Record<string, unknown>)) {
      fail('CYCLIC_SCHEMA', item.pointer, 'object graph is cyclic or aliased');
    }
    seen.add(item.value as Record<string, unknown>);
    if (item.role === 'schema') {
      if (Array.isArray(item.value)) {
        fail('INVALID_SCHEMA', item.pointer, 'schema must be an object or boolean');
      }
      schemaNodes.add(item.value as Record<string, unknown>);
      assertQuantityClaims(item.value as JsonSchema, item.pointer);
    }
    if (item.role === 'schema-array' && !Array.isArray(item.value)) {
      fail('INVALID_SCHEMA', item.pointer, 'schema array expected');
    }
    if ((item.role === 'schema-map' || item.role === 'dependency-map') && !isRecord(item.value)) {
      fail('INVALID_SCHEMA', item.pointer, 'schema map expected');
    }
    if (item.role === 'dependency-map' && isRecord(item.value)) {
      for (const [key, value] of Object.entries(item.value)) {
        if (Array.isArray(value)) {
          assertUniqueStrings(value, `${item.pointer}/${escapePointer(key)}`, 'property dependency');
        } else {
          assertSchemaShape(value, `${item.pointer}/${escapePointer(key)}`);
        }
      }
    }
    for (const [key, value] of Object.entries(item.value)) {
      const pointer = `${item.pointer}/${escapePointer(key)}`;
      if (item.role === 'schema') {
        if (key === 'pattern' || key === 'patternProperties') {
          fail('UNSUPPORTED_KEYWORD', pointer, 'regular expressions are excluded');
        }
        if (!allowedKeywords[dialect].has(key)) {
          fail('UNSUPPORTED_KEYWORD', pointer, key);
        }
        assertKeywordValue({
          schema: item.value as JsonSchema,
          key,
          value,
          pointer,
          dialect,
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
    if (!isRecord(value) || complete.has(value)) {
      return;
    }
    if (ancestors.has(value)) {
      fail('CYCLIC_REFERENCE', '', 'local reference cycle');
    }
    ancestors.add(value);
    const reference = value['$ref'];
    if (schemaNodes.has(value) && typeof reference === 'string') {
      const target = resolveReference(schema, reference);
      if (!schemaNodes.has(target)) {
        fail('NON_SCHEMA_REFERENCE', reference, 'target is not a schema node');
      }
      visitReferences(target);
    }
    for (const child of Object.values(value)) {
      visitReferences(child);
    }
    ancestors.delete(value);
    complete.add(value);
  };
  visitReferences(schema);

  try {
    void new Validator(structuredClone(schema), validatorDrafts[dialect], false);
  } catch (error) {
    fail('INVALID_SCHEMA', '', error instanceof Error ? error.message : 'validator setup failed');
  }
};

/**
 * Validate a value against an admitted schema in the dialect its `$schema` declares.
 * @param schema - Admitted schema.
 * @param value - Candidate data.
 * @returns Whether the candidate validates.
 * @public
 */
export const validateJsonSchemaValue = (schema: JsonSchema, value: unknown): boolean => {
  try {
    return new Validator(structuredClone(schema), validatorDrafts[dialectOf(schema)], false).validate(value).valid;
  } catch {
    return false;
  }
};

/**
 * Return pointer-addressed user issues from an admitted schema, validated in the dialect its `$schema` declares.
 * @param schema - Admitted schema.
 * @param value - Candidate value.
 * @returns Stable pointer-addressed issues.
 * @public
 */
export const validateJsonSchemaIssues = (
  schema: JsonSchema,
  value: unknown,
): ReadonlyArray<Readonly<{ pointer: string; message: string }>> => {
  const result = new Validator(structuredClone(schema), validatorDrafts[dialectOf(schema)], false).validate(value);
  return result.errors.map((error) => ({
    pointer: error.instanceLocation.startsWith('#') ? error.instanceLocation.slice(1) : error.instanceLocation,
    message: error.error,
  }));
};
