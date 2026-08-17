/* CSpell:enableCompoundWords */
import { expectTypeOf, it, assertType, describe } from 'vitest';
import type { ConstantRecord } from '@taucad/types';

describe('ConstantRecord', () => {
  // =========================================================================
  // Valid mappings
  // =========================================================================

  describe('valid mappings', () => {
    it('should accept single word keys and values', () => {
      const validSingleHeaders = {
        header: 'header',
        content: 'content',
      } as const;

      expectTypeOf<'header'>().toExtend<ConstantRecord<typeof validSingleHeaders>>();
    });

    it('should accept camelCase keys with kebab-case values', () => {
      const validCamelKebabHeaders = {
        requestId: 'request-id',
        contentType: 'content-type',
        userAgent: 'user-agent',
        authToken: 'auth-token',
      } as const;

      expectTypeOf<'request-id'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
      expectTypeOf<'content-type'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
      expectTypeOf<'user-agent'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
      expectTypeOf<'auth-token'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
    });

    it('should reject invalid values not in the union', () => {
      const validCamelKebabHeaders = {
        requestId: 'request-id',
        contentType: 'content-type',
        userAgent: 'user-agent',
        authToken: 'auth-token',
      } as const;

      // @ts-expect-error - 'user-agen' is not a valid value in the ConstantRecord union
      assertType<ConstantRecord<typeof validCamelKebabHeaders>>('user-agen');

      // @ts-expect-error - 'invalid-header' is not a valid value in the ConstantRecord union
      assertType<ConstantRecord<typeof validCamelKebabHeaders>>('invalid-header');
    });

    it('should accept complex camelCase to kebab-case transformations', () => {
      const validComplexHeaders = {
        httpRequestId: 'http-request-id',
        xmlHttpRequest: 'xml-http-request',
        apiVersionNumber: 'api-version-number',
      } as const;

      expectTypeOf<'http-request-id'>().toExtend<ConstantRecord<typeof validComplexHeaders>>();
    });
  });

  // =========================================================================
  // Invalid value cases
  // =========================================================================

  describe('invalid value cases', () => {
    it('should reject PascalCase values', () => {
      const invalidPascalCaseValues = {
        requestId: 'Request-Id',
        contentType: 'Content-Type',
      } as const;

      // @ts-expect-error - Values should be kebab-case, not Pascal-Case
      expectTypeOf<'Request-Id'>().toExtend<ConstantRecord<typeof invalidPascalCaseValues>>();
    });

    it('should reject camelCase values', () => {
      const invalidCamelCaseValues = {
        requestId: 'requestId',
        contentType: 'contentType',
      } as const;

      // @ts-expect-error - Values should be kebab-case, not camelCase
      expectTypeOf<'requestId'>().toExtend<ConstantRecord<typeof invalidCamelCaseValues>>();
    });

    it('should reject snake_case values', () => {
      const invalidSnakeCaseValues = {
        requestId: 'request_id',
        contentType: 'content_type',
      } as const;

      // @ts-expect-error - Values should be kebab-case, not snake_case
      expectTypeOf<'request_id'>().toExtend<ConstantRecord<typeof invalidSnakeCaseValues>>();
    });

    it('should reject CONSTANT_CASE values', () => {
      const invalidConstantCaseValues = {
        requestId: 'REQUEST_ID',
        contentType: 'CONTENT_TYPE',
      } as const;

      // @ts-expect-error - Values should be kebab-case, not CONSTANT_CASE
      expectTypeOf<'REQUEST_ID'>().toExtend<ConstantRecord<typeof invalidConstantCaseValues>>();
    });
  });

  // =========================================================================
  // Key-value mismatch
  // =========================================================================

  describe('key-value mismatch', () => {
    it('should reject key-value mismatches', () => {
      const invalidKeyValueMismatch = {
        requestId: 'user-agent',
        userAgent: 'request-id',
      } as const;

      // @ts-expect-error - Keys must be camelCase version of their values
      expectTypeOf<'user-agent'>().toExtend<ConstantRecord<typeof invalidKeyValueMismatch>>();
    });

    it('should reject mixed valid and invalid values', () => {
      const invalidMixedHeaders = {
        requestId: 'request-id',
        contentType: 'Content-Type',
        userAgent: 'user-agent',
        authToken: 'auth_token',
      } as const;

      // @ts-expect-error - Some values are not in kebab-case
      expectTypeOf<'request-id'>().toExtend<ConstantRecord<typeof invalidMixedHeaders>>();
    });
  });

  // =========================================================================
  // Union type extraction
  // =========================================================================

  describe('union type extraction', () => {
    it('should correctly extract union types', () => {
      const validCamelKebabHeaders = {
        requestId: 'request-id',
        contentType: 'content-type',
        userAgent: 'user-agent',
        authToken: 'auth-token',
      } as const;

      type ExpectedUnionType = 'request-id' | 'content-type' | 'user-agent' | 'auth-token';
      expectTypeOf<'request-id'>().toExtend<ExpectedUnionType>();
      expectTypeOf<ConstantRecord<typeof validCamelKebabHeaders>>().toEqualTypeOf<ExpectedUnionType>();
    });

    it('should reject invalid union values', () => {
      const validCamelKebabHeaders = {
        requestId: 'request-id',
        contentType: 'content-type',
        userAgent: 'user-agent',
        authToken: 'auth-token',
      } as const;

      // @ts-expect-error - 'invalid-value' is not in the union
      expectTypeOf<'invalid-value'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
    });
  });
});
