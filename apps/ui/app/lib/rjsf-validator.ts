import { Validator } from '@cfworker/json-schema';
import type { OutputUnit, Schema } from '@cfworker/json-schema';
import {
  createErrorHandler,
  getDefaultFormState,
  toErrorList,
  toErrorSchema,
  unwrapErrorHandler,
  validationDataMerge,
} from '@rjsf/utils';
import type { RJSFSchema, RJSFValidationError, ValidatorType } from '@rjsf/utils';
import type { RJSFContext } from '#components/geometry/parameters/rjsf-context.js';

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

export const isJsonSchemaValid = (schema: RJSFSchema, formData: unknown, rootSchema: RJSFSchema): boolean => {
  const resolvedSchema = {
    definitions: rootSchema.definitions,
    $defs: rootSchema.$defs,
    ...schema,
  };
  return rawValidation(resolvedSchema, formData).errors === undefined;
};

export const rjsfValidator: RjsfValidator = {
  rawValidation,
  toErrorList,
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

    const validationData = { errors, errorSchema: toErrorSchema(errors) };
    if (!customValidate) {
      return validationData;
    }

    const dataWithDefaults = (getDefaultFormState(rjsfValidator, schema, formData, schema, true) ?? {}) as FormData;
    const errorHandler = customValidate(dataWithDefaults, createErrorHandler(dataWithDefaults), uiSchema);
    return validationDataMerge(validationData, unwrapErrorHandler(errorHandler));
  },
};
