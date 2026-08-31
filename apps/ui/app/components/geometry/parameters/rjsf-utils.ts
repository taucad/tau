/**
 * Utility functions for React JSON Schema Form (RJSF) operations
 */
import type { Experimental_DefaultFormStateBehavior, RJSFSchema } from '@rjsf/utils';
import deepmerge from 'deepmerge';
import { formatDisplayLabel } from '#utils/string.utils.js';

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

/** Keep optional object and minItems branches absent until the user creates them. */
export const rjsfDefaultFormStateBehavior = {
  emptyObjectFields: 'populateRequiredDefaults',
  arrayMinItems: { populate: 'requiredOnly' },
} as const satisfies Experimental_DefaultFormStateBehavior;

/** Merge schema defaults with edits without concatenating JSON-array values. */
const formDefaultsMergeOptions: deepmerge.Options = {
  arrayMerge: (_target: unknown[], source: unknown[]) => source,
  customMerge:
    () =>
    (target: unknown, source: unknown): unknown => {
      if (
        typeof target === 'object' &&
        target !== null &&
        !Array.isArray(target) &&
        typeof source === 'object' &&
        source !== null &&
        !Array.isArray(source) &&
        ['mode', 'framing', 'kind'].some(
          (key) =>
            key in target &&
            key in source &&
            (target as Record<string, unknown>)[key] !== (source as Record<string, unknown>)[key],
        )
      ) {
        return source;
      }
      return deepmerge<Record<string, unknown>>(
        target as Record<string, unknown>,
        source as Record<string, unknown>,
        formDefaultsMergeOptions,
      );
    },
};

export const mergeFormDefaults = (
  defaults: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> => deepmerge<Record<string, unknown>>(defaults, values, formDefaultsMergeOptions);

export type DiscriminatedUnionInfo = {
  readonly discriminator: string;
  readonly branches: readonly RJSFSchema[];
  readonly values: readonly unknown[];
};

const isRjsfSchema = (value: unknown): value is RJSFSchema =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getLiteralValue = (schema: RJSFSchema | undefined): unknown => {
  if (!schema) {
    return undefined;
  }
  if (schema.const !== undefined) {
    return schema.const as unknown;
  }
  return schema.enum?.length === 1 ? (schema.enum[0] as unknown) : undefined;
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

export const isObjectLikeSchema = (schema: RJSFSchema): boolean =>
  schema.type === 'object' || getDiscriminatedUnionInfo(schema) !== undefined;

const activeObjectSchema = (schema: RJSFSchema, value: unknown): RJSFSchema => {
  const union = getDiscriminatedUnionInfo(schema);
  if (!union || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return schema;
  }

  const selectedValue = (value as Record<string, unknown>)[union.discriminator];
  const selectedIndex = union.values.findIndex((candidate) => Object.is(candidate, selectedValue));
  const selectedBranch = union.branches[Math.max(0, selectedIndex)];
  return selectedBranch
    ? {
        ...schema,
        ...selectedBranch,
        properties: { ...schema.properties, ...selectedBranch.properties },
        required: [...new Set([...(schema.required ?? []), ...(selectedBranch.required ?? [])])],
        oneOf: undefined,
        anyOf: undefined,
      }
    : schema;
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
 * Converts RJSF ID to JSON path array. Handles underscores in field names.
 *
 * @param rjsfId - The RJSF field ID
 * @param idPrefix - The exact root prefix configured on the owning RJSF form
 * @returns Array of path segments (e.g., ["config", "database", "host"])
 */
export function rjsfIdToJsonPath(rjsfId: string, idPrefix: string): string[] {
  if (rjsfId === idPrefix) {
    return [];
  }

  const pathPrefix = `${idPrefix}${rjsfIdSeparator}`;
  if (!rjsfId.startsWith(pathPrefix)) {
    throw new Error(`RJSF ID "${rjsfId}" does not belong to root "${idPrefix}"`);
  }

  const pathString = rjsfId.slice(pathPrefix.length);
  return pathString ? pathString.split(rjsfIdSeparator) : [];
}

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
