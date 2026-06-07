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
      include: ['**/*.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts'],
      testNamePattern: '^(?!.*known failing check).*',
      testTimeout: 5000,
    });

    expect(result.success).toBe(true);
  });

  it('should validate a directory-root test_model filter input', () => {
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse({
      files: ['lib'],
    });

    expect(result.success).toBe(true);
  });

  it('should reject bracket-key test_model filters', () => {
    const input = Object.fromEntries([['exclude[0]', '**/*.slow.geospec.ts']]);
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse(input);

    expect(result.success).toBe(false);
  });

  it('should describe test_model files as a JSON array rather than bracket keys', () => {
    expect(geoSpecRunFilterInputSchema.shape.files.description).toContain('["main.geospec.ts"]');
    expect(geoSpecRunFilterInputSchema.shape.files.description).toContain('["lib"]');
    expect(geoSpecRunFilterInputSchema.shape.files.description).toContain('files or directory roots');
    expect(geoSpecRunFilterInputSchema.shape.files.description).not.toContain('files[0]');
    expect(geoSpecRunFilterInputSchema.shape.include.description).toContain('["parts/**/*.geospec.ts"]');
    expect(geoSpecRunFilterInputSchema.shape.exclude.description).toContain('["**/*.slow.geospec.ts"]');
    expect(geoSpecRunFilterInputSchema.shape.testNamePattern.description).toContain('"^(?!.*known failing check).*"');
  });

  it('should reject stale custom GeoSpec filter fields', () => {
    for (const field of ['pattern', 'excludeFiles', 'excludePattern', 'excludeTestNamePattern']) {
      const result = requireSchema(`tool-${toolName.testModel}`).safeParse({ [field]: 'value' });
      expect(result.success, `${field} should not parse`).toBe(false);
    }
  });

  it('should reject unknown test_model input fields', () => {
    const result = requireSchema(`tool-${toolName.testModel}`).safeParse({ stray: 'value' });

    expect(result.success).toBe(false);
  });

  it('should expose only mode and targetFile for screenshot input', () => {
    const schema = requireSchema(`tool-${toolName.screenshot}`);

    expect(schema.safeParse({ mode: 'single', targetFile: 'main.ts' }).success).toBe(true);

    for (const field of ['target', 'camera', 'display']) {
      const result = schema.safeParse({
        mode: 'single',
        targetFile: 'main.ts',
        [field]: {},
      });

      expect(result.success, `${field} should not parse`).toBe(false);
    }
  });

  it('should reject stale tau-cad scheme payloads in screenshot input', () => {
    const result = requireSchema(`tool-${toolName.screenshot}`).safeParse({
      mode: 'single',
      targetFile: 'main.ts',
      target: {
        component: {
          scheme: 'tau-cad',
          filePath: 'main.ts',
          componentId: 'component:ring',
          selector: 'model/ring',
          label: 'Ring',
          kind: 'part',
        },
      },
    });

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
