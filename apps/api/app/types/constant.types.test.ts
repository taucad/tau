/* CSpell:enableCompoundWords */
import { expect, describe, it } from 'vitest';
import type { ConstantRecord } from '~/types/constant.types.js';

describe('ConstantRecord', () => {
  /**
   * This describe block resolves the Jest error of a test suite not having any tests.
   * It has no other purpose.
   */
  it('tests the Typescript compiler errors below', () => {
    expect(true).toEqual(true);
  });
});

/**
 * ConstantRecord Valid Tests
 */

// Valid - single word keys and values
const validSingleHeaders = {
  header: 'header',
  content: 'content',
} as const;
export const validSingleValue = 'header' satisfies ConstantRecord<typeof validSingleHeaders>;

// Valid - camelCase keys with kebab-case values
const validCamelKebabHeaders = {
  requestId: 'request-id',
  contentType: 'content-type',
  userAgent: 'user-agent',
  authToken: 'auth-token',
} as const;
export const validCamelValue1 = 'request-id' satisfies ConstantRecord<typeof validCamelKebabHeaders>;
export const validCamelValue2 = 'content-type' satisfies ConstantRecord<typeof validCamelKebabHeaders>;
export const validCamelValue3 = 'user-agent' satisfies ConstantRecord<typeof validCamelKebabHeaders>;
export const validCamelValue4 = 'auth-token' satisfies ConstantRecord<typeof validCamelKebabHeaders>;

// Valid - complex camelCase to kebab-case
const validComplexHeaders = {
  httpRequestId: 'http-request-id',
  xmlHttpRequest: 'xml-http-request',
  apiVersionNumber: 'api-version-number',
} as const;
export const validComplexValue = 'http-request-id' satisfies ConstantRecord<typeof validComplexHeaders>;

/**
 * ConstantRecord Invalid Tests - Wrong Value Cases
 */

// Invalid - PascalCase values
const invalidPascalCaseValues = {
  requestId: 'Request-Id',
  contentType: 'Content-Type',
} as const;
// @ts-expect-error - Values should be kebab-case, not Pascal-Case
export const invalidPascalValue = 'Request-Id' satisfies ConstantRecord<typeof invalidPascalCaseValues>;

// Invalid - camelCase values
const invalidCamelCaseValues = {
  requestId: 'requestId',
  contentType: 'contentType',
} as const;
// @ts-expect-error - Values should be kebab-case, not camelCase
export const invalidCamelValue = 'requestId' satisfies ConstantRecord<typeof invalidCamelCaseValues>;

// Invalid - snake_case values
const invalidSnakeCaseValues = {
  requestId: 'request_id',
  contentType: 'content_type',
} as const;
// @ts-expect-error - Values should be kebab-case, not snake_case
export const invalidSnakeValue = 'request_id' satisfies ConstantRecord<typeof invalidSnakeCaseValues>;

// Invalid - CONSTANT_CASE values
const invalidConstantCaseValues = {
  requestId: 'REQUEST_ID',
  contentType: 'CONTENT_TYPE',
} as const;
// @ts-expect-error - Values should be kebab-case, not CONSTANT_CASE
export const invalidConstantValue = 'REQUEST_ID' satisfies ConstantRecord<typeof invalidConstantCaseValues>;

/**
 * ConstantRecord Invalid Tests - Key-Value Mismatch
 */

// Invalid - key doesn't match camelCase version of value
const invalidKeyValueMismatch = {
  requestId: 'user-agent', // RequestId should correspond to 'request-id'
  userAgent: 'request-id', // UserAgent should correspond to 'user-agent'
} as const;
// @ts-expect-error - Keys must be camelCase version of their values
export const invalidMismatchValue = 'user-agent' satisfies ConstantRecord<typeof invalidKeyValueMismatch>;

// Invalid - mixed valid and invalid
const invalidMixedHeaders = {
  requestId: 'request-id', // ✅ Valid
  contentType: 'Content-Type', // ❌ Invalid value case
  userAgent: 'user-agent', // ✅ Valid
  authToken: 'auth_token', // ❌ Invalid value case
} as const;
// @ts-expect-error - Some values are not in kebab-case
export const invalidMixedValue = 'request-id' satisfies ConstantRecord<typeof invalidMixedHeaders>;

/**
 * ConstantRecord Union Type Tests
 */

// Test that union type is correctly extracted
type ExpectedUnionType = 'request-id' | 'content-type' | 'user-agent' | 'auth-token';
export const testUnionExtraction = 'request-id' satisfies ExpectedUnionType;

// Test that invalid union types are rejected
// @ts-expect-error - 'invalid-value' is not in the union
export const invalidUnionValue = 'invalid-value' satisfies ConstantRecord<typeof validCamelKebabHeaders>;
