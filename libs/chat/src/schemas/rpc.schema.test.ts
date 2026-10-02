import { describe, expect, it } from 'vitest';
import { rpcClientErrorCode, rpcClientErrorCodeSchema, rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';

describe('rpcClientErrorCodeSchema', () => {
  it('should parse FILE_NOT_FOUND', () => {
    expect(rpcClientErrorCodeSchema.parse('FILE_NOT_FOUND')).toBe('FILE_NOT_FOUND');
  });

  it('should parse NO_TOP_LEVEL_GEOMETRY', () => {
    expect(rpcClientErrorCodeSchema.parse('NO_TOP_LEVEL_GEOMETRY')).toBe('NO_TOP_LEVEL_GEOMETRY');
  });

  it('should parse RENDER_TIMEOUT for runtime render-timeout failures', () => {
    expect(rpcClientErrorCodeSchema.parse('RENDER_TIMEOUT')).toBe('RENDER_TIMEOUT');
  });

  it('should parse VALIDATION_ERROR for handler-level input rejections', () => {
    expect(rpcClientErrorCodeSchema.parse('VALIDATION_ERROR')).toBe('VALIDATION_ERROR');
  });

  it('should parse RESULT_TOO_LARGE for directive overflow errors', () => {
    expect(rpcClientErrorCodeSchema.parse('RESULT_TOO_LARGE')).toBe('RESULT_TOO_LARGE');
  });

  it('should still expose UNKNOWN as a generic catch-all', () => {
    expect(rpcClientErrorCodeSchema.parse('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('rpcClientErrorCode', () => {
  it('should enumerate every schema enum member exactly once', () => {
    const fromObject = new Set(Object.values(rpcClientErrorCode));
    expect(fromObject.size).toBe(rpcClientErrorCodeSchema.options.length);
    for (const code of rpcClientErrorCodeSchema.options) {
      expect(fromObject.has(code)).toBe(true);
    }
  });

  it('should expose the new validationError and resultTooLarge keys', () => {
    expect(rpcClientErrorCode.validationError).toBe('VALIDATION_ERROR');
    expect(rpcClientErrorCode.resultTooLarge).toBe('RESULT_TOO_LARGE');
  });
});

describe('grep RPC schema — additive envelope fields', () => {
  const grep = rpcSchemasRegistry[rpcName.grep];

  it('should accept the existing success shape extended with appliedHeadLimit + appliedOffset', () => {
    expect(
      grep.resultSchema.parse({
        success: true,
        matches: [],
        totalMatches: 0,
        truncated: false,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      }),
    ).toMatchObject({ success: true, appliedHeadLimit: 50, appliedOffset: 0 });
  });

  it('should reject a success payload missing appliedHeadLimit', () => {
    const parsed = grep.resultSchema.safeParse({
      success: true,
      matches: [],
      totalMatches: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it('should accept the new headLimit/offset input fields', () => {
    expect(grep.inputSchema.safeParse({ pattern: 'foo', headLimit: 50, offset: 0 }).success).toBe(true);
    expect(grep.inputSchema.safeParse({ pattern: 'foo' }).success).toBe(true);
  });

  it('should reject headLimit greater than 1000 at the schema layer', () => {
    expect(grep.inputSchema.safeParse({ pattern: 'foo', headLimit: 1001 }).success).toBe(false);
  });
});

describe('read_file RPC schema — additive envelope fields', () => {
  const readFile = rpcSchemasRegistry[rpcName.readFile];

  it('should accept the existing success shape extended with optional truncated flag', () => {
    expect(
      readFile.resultSchema.parse({
        success: true,
        content: 'hi',
        totalLines: 1,
        startLine: 1,
        truncated: true,
      }),
    ).toMatchObject({ success: true, truncated: true });
  });

  it('should still accept success payloads that omit truncated (additive contract)', () => {
    expect(
      readFile.resultSchema.parse({
        success: true,
        content: 'hi',
        totalLines: 1,
        startLine: 1,
      }).success,
    ).toBe(true);
  });

  it('should reject limit greater than 2000 at the schema layer', () => {
    expect(readFile.inputSchema.safeParse({ targetFile: 'a.ts', limit: 2001 }).success).toBe(false);
  });

  it('should reject offset less than 1 at the schema layer', () => {
    expect(readFile.inputSchema.safeParse({ targetFile: 'a.ts', offset: 0 }).success).toBe(false);
  });
});
