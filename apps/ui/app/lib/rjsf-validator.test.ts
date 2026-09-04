import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RJSFSchema } from '@rjsf/utils';
import { isJsonSchemaValid, rjsfValidator } from './rjsf-validator.js';

const schema: RJSFSchema = {
  type: 'object',
  required: ['width'],
  properties: {
    width: { type: 'number', minimum: 1 },
    mode: { type: 'string', enum: ['fast', 'precise'] },
  },
};

describe('rjsfValidator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates dynamic schemas without evaluating JavaScript', () => {
    vi.stubGlobal(
      'Function',
      vi.fn(() => {
        throw new Error('unsafe-eval blocked');
      }),
    );

    expect(rjsfValidator.rawValidation(schema, { width: 12, mode: 'precise' })).toEqual({ errors: undefined });
    expect(rjsfValidator.isValid(schema, { width: 12, mode: 'precise' }, schema)).toBe(true);
  });

  it('returns field-addressed RJSF errors', () => {
    const result = rjsfValidator.validateFormData({ width: 0, mode: 'invalid' }, schema);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enum', property: '["mode"]' }),
        expect.objectContaining({ name: 'minimum', property: '["width"]' }),
      ]),
    );
    expect(result.errorSchema).toEqual({
      mode: { __errors: [expect.any(String)] },
      width: { __errors: [expect.any(String)] },
    });
  });

  it('resolves root definitions and preserves escaped field paths', () => {
    const rootSchema: RJSFSchema = {
      definitions: { positive: { type: 'number', minimum: 1 } },
    };
    const reference: RJSFSchema = { $ref: '#/definitions/positive' };
    const escapedSchema: RJSFSchema = {
      type: 'object',
      properties: { 'a/b~c': { type: 'number', minimum: 1 } },
    };

    expect(isJsonSchemaValid(reference, 2, rootSchema)).toBe(true);
    expect(isJsonSchemaValid(reference, 0, rootSchema)).toBe(false);
    expect(rjsfValidator.validateFormData({ 'a/b~c': 0 }, escapedSchema).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: '["a/b~c"]' })]),
    );
    expect(rjsfValidator.validateFormData({}, schema).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'required', property: '.' })]),
    );
  });

  it('adapts schema and custom validation failures', () => {
    vi.stubGlobal(
      'structuredClone',
      vi.fn(() => {
        throw new TypeError('invalid schema');
      }),
    );
    expect(rjsfValidator.rawValidation(schema, {})).toEqual({ validationError: new TypeError('invalid schema') });

    vi.stubGlobal(
      'structuredClone',
      vi.fn(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- Exercises normalization of non-Error throws from third-party schema code.
        throw 'non-Error schema failure';
      }),
    );
    expect(rjsfValidator.validateFormData({}, schema)).toEqual({
      errors: [expect.objectContaining({ message: 'non-Error schema failure', property: '.' })],
      errorSchema: { __errors: ['non-Error schema failure'] },
    });

    vi.unstubAllGlobals();
    const result = rjsfValidator.validateFormData(
      undefined,
      {},
      (data, errors) => {
        expect(data).toEqual({});
        errors.addError('custom failure');
        return errors;
      },
      (errors) => errors.map((error) => ({ ...error, stack: `transformed: ${error.stack}` })),
    );
    expect(result.errorSchema).toEqual({ __errors: ['custom failure'] });
  });
});
