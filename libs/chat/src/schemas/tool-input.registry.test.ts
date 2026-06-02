import { describe, it, expect } from 'vitest';
import { toolName, toolNames } from '#constants/tool.constants.js';
import { toolInputSchemas, getToolInputSchema } from '#schemas/tool-input.registry.js';
import { geoSpecRunFilterInputSchema } from '#schemas/tools/test-model.tool.schema.js';

const requireSchema = (key: `tool-${string}`) => {
  const schema = getToolInputSchema(key);
  if (!schema) {
    throw new Error(`registry missing schema for ${key}`);
  }
  return schema;
};

describe('toolInputSchemas registry', () => {
  it('should expose a Zod schema for every static tool name', () => {
    for (const name of toolNames) {
      expect(getToolInputSchema(`tool-${name}`), `missing schema for tool-${name}`).toBeDefined();
    }
  });

  it('should validate a well-formed read_file input as the strict per-tool schema', () => {
    const result = requireSchema(`tool-${toolName.readFile}`).safeParse({
      targetFile: 'main.ts',
      limit: 15,
    });

    expect(result.success).toBe(true);
  });

  it('should reject a partial read_file input that lacks required targetFile', () => {
    const result = requireSchema(`tool-${toolName.readFile}`).safeParse({ limit: 15 });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.issues.some((issue) => issue.path.includes('targetFile'))).toBe(true);
  });

  it('should validate a well-formed test_model filter input as the strict per-tool schema', () => {
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse({
      files: ['main.geospec.ts'],
      testNamePattern: 'watertight',
      testTimeout: 5000,
    });

    expect(result.success).toBe(true);
  });

  it('should reject bracket-key test_model file filters', () => {
    const input = Object.fromEntries([['files[0]', 'main.geospec.ts']]);
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse(input);

    expect(result.success).toBe(false);
  });

  it('should describe test_model files as a JSON array rather than bracket keys', () => {
    expect(geoSpecRunFilterInputSchema.shape.files.description).toContain('["main.geospec.ts"]');
    expect(geoSpecRunFilterInputSchema.shape.files.description).toContain('files[0]');
    expect(geoSpecRunFilterInputSchema.shape.testNamePattern.description).toContain('"watertight"');
  });

  it('should reject unknown test_model input fields', () => {
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse({ stray: 'value' });

    expect(result.success).toBe(false);
  });

  it('should accept the literal empty object for empty-input tools', () => {
    const result = requireSchema(`tool-${toolName.transferToCadExpert}`).safeParse({});

    expect(result.success).toBe(true);
  });
});

describe('getToolInputSchema', () => {
  it('should return the schema for a known static tool part type', () => {
    expect(getToolInputSchema(`tool-${toolName.readFile}`)).toBe(toolInputSchemas[`tool-${toolName.readFile}`]);
  });

  it('should return undefined for the dynamic-tool part type', () => {
    expect(getToolInputSchema('dynamic-tool')).toBeUndefined();
  });

  it('should return undefined for an unknown tool part type', () => {
    expect(getToolInputSchema('tool-not_a_real_tool')).toBeUndefined();
  });
});
