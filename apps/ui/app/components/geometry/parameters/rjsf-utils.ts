/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */
import type { Experimental_DefaultFormStateBehavior, RJSFSchema } from '@rjsf/utils';
import { formatDisplayLabel } from '#utils/string.utils.js';
import { deleteValueAtPath, setValueAtPath } from '#utils/object.utils.js';
import type { RjsfFieldResetInput } from '#components/geometry/parameters/rjsf-context.js';

/** Reset a field without creating holes or relying on deep merging inside replacement arrays. */
export const resetRjsfField = ({
  formData,
  fieldPath,
  defaultValue,
}: RjsfFieldResetInput & {
  readonly formData: Record<string, unknown>;
}): Record<string, unknown> | undefined => {
  if (fieldPath.length === 0) {
    return undefined;
  }
  let parent: unknown = formData;
  let crossesArray = false;
  for (const segment of fieldPath.slice(0, -1)) {
    crossesArray ||= Array.isArray(parent);
    if (typeof parent !== 'object' || parent === null || !Object.hasOwn(parent, segment)) {
      return undefined;
    }
    parent = (parent as Record<string, unknown>)[segment];
  }
  const isArrayItem = Array.isArray(parent);
  if (isArrayItem && defaultValue === undefined) {
    return undefined;
  }
  return (crossesArray || isArrayItem) && defaultValue !== undefined
    ? setValueAtPath(formData, fieldPath, defaultValue)
    : deleteValueAtPath(formData, fieldPath);
};

/**
 * The prefix used in RJSF renderer IDs. Reset paths come from rendered ancestry, not these IDs.
 *
 * @see https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/form-props/#idprefix
 */
export const rjsfIdPrefix = '///root';

/**
 * The separator used in RJSF renderer IDs. It is not an encoding of reset paths.
 *
 * @see https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/form-props/#idseparator
 */
export const rjsfIdSeparator = '///';

/** Keep optional object and minItems branches absent until the user creates them. */
export const rjsfDefaultFormStateBehavior = {
  emptyObjectFields: 'populateRequiredDefaults',
  arrayMinItems: { populate: 'requiredOnly' },
} as const satisfies Experimental_DefaultFormStateBehavior;

export type DiscriminatedUnionInfo = {
  readonly discriminator: string;
  readonly branches: readonly RJSFSchema[];
  readonly values: ReadonlyArray<string | number | boolean>;
};

const isRjsfSchema = (value: unknown): value is RJSFSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getLiteralValue = (schema: RJSFSchema | undefined): string | number | boolean | undefined => {
  if (!schema) {
    return undefined;
  }
  const constant = schema.const;
  if (typeof constant === 'string' || typeof constant === 'number' || typeof constant === 'boolean') {
    return constant;
  }
  const value = schema.enum?.length === 1 ? schema.enum[0] : undefined;
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
};

export const getDiscriminatedUnionInfo = (schema: RJSFSchema): DiscriminatedUnionInfo | undefined => {
  const definitions = schema.oneOf ?? schema.anyOf;
  if (!definitions || definitions.length < 2) {
    return undefined;
  }
  const branches = definitions.filter((definition) => isRjsfSchema(definition));
  if (branches.length !== definitions.length) {
    return undefined;
  }

  const firstProperties = (branches[0]?.properties ?? {}) as Record<string, unknown>;
  for (const discriminator of Object.keys(firstProperties)) {
    if (!branches.every((branch) => branch.required?.includes(discriminator) === true)) {
      continue;
    }
    const values = branches.map((branch) => {
      const properties = (branch.properties ?? {}) as Record<string, unknown>;
      const property = properties[discriminator];
      return isRjsfSchema(property) ? getLiteralValue(property) : undefined;
    });
    if (values.every((value) => value !== undefined) && new Set(values).size === values.length) {
      return { discriminator, branches, values };
    }
  }

  return undefined;
};

const objectValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const selectedUnionBranch = (union: DiscriminatedUnionInfo, value: Record<string, unknown>): RJSFSchema | undefined => {
  if (!Object.hasOwn(value, union.discriminator)) {
    return undefined;
  }
  const selected = value[union.discriminator];
  const index = union.values.findIndex((candidate) => Object.is(candidate, selected));
  return index === -1 ? undefined : union.branches[index];
};

const mergedObjectSchema = (schema: RJSFSchema, branch?: RJSFSchema): RJSFSchema =>
  branch === undefined
    ? schema
    : {
        ...schema,
        ...branch,
        properties: { ...schema.properties, ...branch.properties },
        required: [...new Set([...(schema.required ?? []), ...(branch.required ?? [])])],
        oneOf: undefined,
        anyOf: undefined,
      };

const directDefaults = (schema: RJSFSchema): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(schema.properties ?? {}).flatMap(([key, property]) =>
      isRjsfSchema(property) && Object.hasOwn(property, 'default') ? [[key, property.default]] : [],
    ),
  );

const mergeFormValue = (schema: RJSFSchema, defaults: unknown, values: unknown): unknown => {
  if (!objectValue(defaults) || !objectValue(values)) {
    return values;
  }

  const union = getDiscriminatedUnionInfo(schema);
  const defaultBranch = union === undefined ? undefined : selectedUnionBranch(union, defaults);
  const valueBranch = union === undefined ? undefined : selectedUnionBranch(union, values);
  const hasExplicitDiscriminator = union !== undefined && Object.hasOwn(values, union.discriminator);
  const changesBranch = hasExplicitDiscriminator && valueBranch !== defaultBranch;
  const activeBranch = hasExplicitDiscriminator ? valueBranch : (valueBranch ?? defaultBranch);
  const activeSchema = mergedObjectSchema(schema, activeBranch);
  const retainedProperties = new Set([
    ...Object.keys(schema.properties ?? {}),
    ...Object.keys(valueBranch?.properties ?? {}),
  ]);
  const oldExclusiveProperties = new Set(
    Object.keys(defaultBranch?.properties ?? {}).filter((key) => !retainedProperties.has(key)),
  );
  const inherited = Object.fromEntries(
    Object.entries(defaults).filter(([key]) => !changesBranch || !oldExclusiveProperties.has(key)),
  );
  const selectedDefaults = valueBranch !== undefined && changesBranch ? directDefaults(valueBranch) : {};
  const result: Record<string, unknown> = { ...inherited, ...selectedDefaults };

  for (const [key, value] of Object.entries(values)) {
    const propertySchema = activeSchema.properties?.[key];
    result[key] = isRjsfSchema(propertySchema) ? mergeFormValue(propertySchema, result[key], value) : value;
  }
  return result;
};

/** Merge schema defaults with explicit values without concatenating JSON arrays or retaining inactive branch defaults. */
export const mergeFormDefaults = (
  schema: RJSFSchema,
  defaults: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> => mergeFormValue(schema, defaults, values) as Record<string, unknown>;

export const isObjectLikeSchema = (schema: RJSFSchema): boolean =>
  schema.type === 'object' || getDiscriminatedUnionInfo(schema) !== undefined;

const activeObjectSchema = (schema: RJSFSchema, value: unknown): RJSFSchema => {
  const union = getDiscriminatedUnionInfo(schema);
  if (!union || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return schema;
  }

  const selectedValue = (value as Record<string, unknown>)[union.discriminator];
  const selectedIndex = union.values.findIndex((candidate) => Object.is(candidate, selectedValue));
  const selectedBranch = selectedIndex === -1 ? undefined : union.branches[selectedIndex];
  return mergedObjectSchema(schema, selectedBranch);
};

/** Remove RJSF's transient undefined fields and invalid empty optional objects after a multi-schema branch change. */
export const normalizeRjsfFormData = (schema: RJSFSchema, value: unknown): unknown => {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item, index) => {
      const itemSchema: unknown = Array.isArray(schema.items) ? schema.items[index] : schema.items;
      return isRjsfSchema(itemSchema) ? normalizeRjsfFormData(itemSchema, item) : item;
    });
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const objectSchema = activeObjectSchema(schema, value);
  const required = new Set(objectSchema.required ?? []);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, fieldValue]) => {
      if (fieldValue === undefined) {
        return [];
      }

      const propertySchema = objectSchema.properties?.[key];
      if (typeof propertySchema !== 'object') {
        return [[key, fieldValue]];
      }

      const normalized = normalizeRjsfFormData(propertySchema, fieldValue);
      const normalizedSchema = activeObjectSchema(propertySchema, normalized);
      const isInvalidEmptyOptionalObject =
        !required.has(key) &&
        isObjectLikeSchema(normalizedSchema) &&
        typeof normalized === 'object' &&
        normalized !== null &&
        !Array.isArray(normalized) &&
        Object.keys(normalized).length === 0 &&
        (normalizedSchema.required?.length ?? 0) > 0;
      return isInvalidEmptyOptionalObject ? [] : [[key, normalized]];
    }),
  );
};

/**
 * Helper to recursively check if a schema or its nested properties match the search term
 * @param schema - The schema to check
 * @param searchTerm - The search term to check
 * @param propertyName - The name of the property to check
 * @returns true if the schema or its nested properties match the search term
 */
// oxlint-disable-next-line complexity -- consider refactoring.
export function isSchemaMatchingSearch(schema: RJSFSchema, searchTerm: string, propertyName?: string): boolean {
  if (!searchTerm) {
    return true;
  }

  const lowerSearch = searchTerm.toLowerCase();

  // Check if the property name matches
  if (
    propertyName &&
    (propertyName.toLowerCase().includes(lowerSearch) ||
      formatDisplayLabel(propertyName).toLowerCase().includes(lowerSearch))
  ) {
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

  for (const branches of [schema.oneOf, schema.anyOf]) {
    if (branches?.some((branch) => typeof branch === 'object' && isSchemaMatchingSearch(branch, searchTerm))) {
      return true;
    }
  }

  return false;
}

/**
 * Gets the appropriate default value for a field, handling array items specially.
 * For array items, extracts the default value from the parent array at the item's index.
 *
 * @param root0 - The field default value parameters
 * @param root0.fieldPath - The JSON path to the field (e.g., ['strings', '0'] for first array item)
 * @param root0.formData - The current form data value for this field
 * @param root0.schemaDefault - The default value from the schema
 * @param root0.defaultParameters - The default parameters object containing all default values
 * @returns The default value to use for comparison (schema default or array item default)
 */
export function getFieldDefaultValue({
  fieldPath,
  formData: _formData,
  schemaDefault,
  defaultParameters,
}: {
  fieldPath: readonly string[];
  formData: unknown;
  schemaDefault: unknown;
  defaultParameters: Record<string, unknown>;
}): unknown {
  let value: unknown = defaultParameters;
  for (const segment of fieldPath) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, segment)) {
      return schemaDefault;
    }
    value = (value as Record<string, unknown>)[segment];
  }

  return value;
}
