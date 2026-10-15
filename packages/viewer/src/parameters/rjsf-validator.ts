import { Validator } from '@cfworker/json-schema';
import type { OutputUnit, Schema } from '@cfworker/json-schema';
import {
  createErrorHandler,
  ErrorSchemaBuilder,
  getDefaultFormState,
  toPath,
  unwrapErrorHandler,
  validationDataMerge,
} from '@rjsf/utils';
import type { ErrorSchema, RJSFSchema, RJSFValidationError, ValidatorType } from '@rjsf/utils';
import type { RJSFContext } from '#parameters/rjsf-context.js';

type FormData = Record<string, unknown>;
type RjsfValidator = ValidatorType<FormData, RJSFSchema, RJSFContext>;

const cloneSchema = (schema: RJSFSchema): Schema => structuredClone(schema) as Schema;

const pointerToProperty = (pointer: string): string => {
  if (pointer === '#') {
    return '.';
  }

  return pointer
    .slice(2)
    .split('/')
    .map((segment) => decodeURI(segment).replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => `[${JSON.stringify(segment)}]`)
    .join('');
};

const quotedProperty = /^(?:\[(?:"(?:[^"\\]|\\.)*")\])+$/u;
const quotedSegment = /\[("(?:[^"\\]|\\.)*")\]/gu;

/* RJSF 6's `toPath` treats every `.`, `[` and `]` as a separator, so it cannot read back the JSON-quoted segments
 * `pointerToProperty` writes for keys such as `a.b` or `""`. Parse those here and leave any other property, such as
 * one a `transformErrors` callback rewrote, to RJSF. */
const propertyToPath = (property: string | undefined): string[] => {
  if (property === undefined || property === '.') {
    return [];
  }

  if (quotedProperty.test(property)) {
    return [...property.matchAll(quotedSegment)].map(([, segment]) => JSON.parse(segment ?? '""') as string);
  }

  return toPath(property);
};

const toErrorSchema = (errors: readonly RJSFValidationError[]): ErrorSchema<FormData> => {
  const builder = new ErrorSchemaBuilder<FormData>();
  for (const { property, message } of errors) {
    if (message) {
      builder.addErrors(message, propertyToPath(property));
    }
  }
  return builder.ErrorSchema;
};

const toRjsfError = ({ error, instanceLocation, keyword, keywordLocation }: OutputUnit): RJSFValidationError => {
  const property = pointerToProperty(instanceLocation);
  return {
    name: keyword,
    property,
    message: error,
    params: {},
    schemaPath: keywordLocation,
    stack: property === '.' ? error : `${property} ${error}`,
  };
};

const rawValidation = <Result = unknown>(
  schema: RJSFSchema,
  formData?: unknown,
): { errors?: Result[]; validationError?: Error } => {
  try {
    const result = new Validator(cloneSchema(schema), '7', false).validate(formData ?? null);
    const errors = result.errors.filter(({ keyword }) => keyword !== 'properties').map((error) => toRjsfError(error));
    return { errors: result.valid ? undefined : (errors as Result[]) };
  } catch (error) {
    return { validationError: error instanceof Error ? error : new Error(String(error)) };
  }
};

/**
 * Check form data against a JSON Schema, resolving references through the root schema's definitions.
 *
 * @param schema - The schema to validate against.
 * @param formData - The data to validate.
 * @param rootSchema - The root schema whose `definitions` and `$defs` resolve references.
 * @returns `true` when the data is valid and the schema compiles.
 * @public
 */
export const isJsonSchemaValid = (schema: RJSFSchema, formData: unknown, rootSchema: RJSFSchema): boolean => {
  const resolvedSchema = {
    definitions: rootSchema.definitions,
    $defs: rootSchema.$defs,
    ...schema,
  };
  const result = rawValidation(resolvedSchema, formData);
  return result.validationError === undefined && result.errors === undefined;
};

/**
 * RJSF validator backed by `@cfworker/json-schema`, used in place of the default AJV validator.
 *
 * @public
 */
export const rjsfValidator: RjsfValidator = {
  rawValidation,
  isValid(schema, formData, rootSchema) {
    return isJsonSchemaValid(schema, formData, rootSchema);
  },
  validateFormData(
    ...[formData, schema, customValidate, transformErrors, uiSchema]: Parameters<RjsfValidator['validateFormData']>
  ) {
    const { errors: rawErrors = [], validationError } = rawValidation<RJSFValidationError>(schema, formData);
    let errors =
      validationError === undefined
        ? rawErrors
        : [...rawErrors, { message: validationError.message, property: '.', stack: validationError.message }];
    if (transformErrors) {
      errors = transformErrors(errors, uiSchema);
    }

    const errorSchema = toErrorSchema(errors);
    const validationData = { errors, errorSchema };
    if (!customValidate) {
      return validationData;
    }

    const dataWithDefaults = (getDefaultFormState(rjsfValidator, schema, formData, schema, true) ?? {}) as FormData;
    const errorHandler = customValidate(dataWithDefaults, createErrorHandler(dataWithDefaults), uiSchema, errorSchema);
    return validationDataMerge(validationData, unwrapErrorHandler(errorHandler));
  },
};
