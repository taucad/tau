/* CSpell:enableCompoundWords */
import { expectTypeOf, it, assertType } from 'vitest';
import type { ConstantRecord } from '~/types/constant.types.js';

/**
 * ConstantRecord Valid Tests
 */
it('should accept single word keys and values', () => {
  // Valid - single word keys and values
  const validSingleHeaders = {
    header: 'header',
    content: 'content',
  } as const;

  expectTypeOf<'header'>().toExtend<ConstantRecord<typeof validSingleHeaders>>();
});

it('should accept camelCase keys with kebab-case values', () => {
  // Valid - camelCase keys with kebab-case values
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
  // Valid - complex camelCase to kebab-case
  const validComplexHeaders = {
    httpRequestId: 'http-request-id',
    xmlHttpRequest: 'xml-http-request',
    apiVersionNumber: 'api-version-number',
  } as const;

  expectTypeOf<'http-request-id'>().toExtend<ConstantRecord<typeof validComplexHeaders>>();
});

/**
 * ConstantRecord Invalid Tests - Wrong Value Cases
 */
it('should reject PascalCase values', () => {
  // Invalid - PascalCase values
  const invalidPascalCaseValues = {
    requestId: 'Request-Id',
    contentType: 'Content-Type',
  } as const;

  // @ts-expect-error - Values should be kebab-case, not Pascal-Case
  expectTypeOf<'Request-Id'>().toExtend<ConstantRecord<typeof invalidPascalCaseValues>>();
});

it('should reject camelCase values', () => {
  // Invalid - camelCase values
  const invalidCamelCaseValues = {
    requestId: 'requestId',
    contentType: 'contentType',
  } as const;

  // @ts-expect-error - Values should be kebab-case, not camelCase
  expectTypeOf<'requestId'>().toExtend<ConstantRecord<typeof invalidCamelCaseValues>>();
});

it('should reject snake_case values', () => {
  // Invalid - snake_case values
  const invalidSnakeCaseValues = {
    requestId: 'request_id',
    contentType: 'content_type',
  } as const;

  // @ts-expect-error - Values should be kebab-case, not snake_case
  expectTypeOf<'request_id'>().toExtend<ConstantRecord<typeof invalidSnakeCaseValues>>();
});

it('should reject CONSTANT_CASE values', () => {
  // Invalid - CONSTANT_CASE values
  const invalidConstantCaseValues = {
    requestId: 'REQUEST_ID',
    contentType: 'CONTENT_TYPE',
  } as const;

  // @ts-expect-error - Values should be kebab-case, not CONSTANT_CASE
  expectTypeOf<'REQUEST_ID'>().toExtend<ConstantRecord<typeof invalidConstantCaseValues>>();
});

/**
 * ConstantRecord Invalid Tests - Key-Value Mismatch
 */
it('should reject key-value mismatches', () => {
  // Invalid - key doesn't match camelCase version of value
  const invalidKeyValueMismatch = {
    requestId: 'user-agent', // RequestId should correspond to 'request-id'
    userAgent: 'request-id', // UserAgent should correspond to 'user-agent'
  } as const;

  // @ts-expect-error - Keys must be camelCase version of their values
  expectTypeOf<'user-agent'>().toExtend<ConstantRecord<typeof invalidKeyValueMismatch>>();
});

it('should reject mixed valid and invalid values', () => {
  // Invalid - mixed valid and invalid
  const invalidMixedHeaders = {
    requestId: 'request-id', // ✅ Valid
    contentType: 'Content-Type', // ❌ Invalid value case
    userAgent: 'user-agent', // ✅ Valid
    authToken: 'auth_token', // ❌ Invalid value case
  } as const;

  // @ts-expect-error - Some values are not in kebab-case
  expectTypeOf<'request-id'>().toExtend<ConstantRecord<typeof invalidMixedHeaders>>();
});

/**
 * ConstantRecord Union Type Tests
 */
it('should correctly extract union types', () => {
  const validCamelKebabHeaders = {
    requestId: 'request-id',
    contentType: 'content-type',
    userAgent: 'user-agent',
    authToken: 'auth-token',
  } as const;

  // Test that union type is correctly extracted
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

  // Test that invalid union types are rejected
  // @ts-expect-error - 'invalid-value' is not in the union
  expectTypeOf<'invalid-value'>().toExtend<ConstantRecord<typeof validCamelKebabHeaders>>();
});
