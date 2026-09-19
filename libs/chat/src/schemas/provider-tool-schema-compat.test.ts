import { describe, expect, it } from 'vitest';
import { toolMode, toolName } from '#constants/tool.constants.js';
import {
  filterProviderFacingToolNamesByModelSupport,
  getProviderFacingToolInputSchemas,
  toProviderToolJsonSchema,
} from '#schemas/provider-tool-schemas.js';

/**
 * Keywords no provider accepts today: Vertex rejects `const`/`propertyNames`/`prefixItems`, and
 * `$ref`/`definitions`/`$defs` reach Vertex as ref loops it refuses outright.
 */
const bannedKeywords = ['const', 'propertyNames', 'prefixItems', '$ref', 'definitions', '$defs'] as const;

type BannedKeyword = (typeof bannedKeywords)[number];

const emptyKeywordPaths = (): Record<BannedKeyword, string[]> => ({
  const: [],
  propertyNames: [],
  prefixItems: [],
  $ref: [],
  definitions: [],
  $defs: [],
});

const collectKeywordPaths = (
  value: unknown,
  path = '$',
  paths: Record<BannedKeyword, string[]> = emptyKeywordPaths(),
): Record<BannedKeyword, string[]> => {
  if (value === null || typeof value !== 'object') {
    return paths;
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      collectKeywordPaths(entry, `${path}[${index}]`, paths);
    }
    return paths;
  }
  for (const [key, child] of Object.entries(value)) {
    if ((bannedKeywords as readonly string[]).includes(key)) {
      paths[key as BannedKeyword].push(`${path}.${key}`);
    }
    collectKeywordPaths(child, `${path}.${key}`, paths);
  }
  return paths;
};

type ProviderToolSchema = {
  type?: unknown;
  anyOf?: unknown;
  oneOf?: unknown;
  allOf?: unknown;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: unknown;
};

const serializeProviderFacingSchemas = (testingEnabled = true) =>
  getProviderFacingToolInputSchemas({
    toolChoice: toolMode.auto,
    testingEnabled,
  }).map((entry) => ({
    ...entry,
    jsonSchema: toProviderToolJsonSchema(entry.schema) as ProviderToolSchema,
  }));

const providerSchemaFor = (name: string): ProviderToolSchema => {
  const schema = serializeProviderFacingSchemas().find((entry) => entry.toolName === name)?.jsonSchema;
  if (!schema) {
    throw new Error(`missing JSON Schema for ${name}`);
  }
  return schema;
};

/**
 * The Anthropic codec forwards only `{type, properties, required}`, so anything a tool expresses
 * above that level is silently dropped before Claude ever sees it.
 */
const anthropicProjection = (schema: ProviderToolSchema) => ({
  type: 'object',
  properties: schema.properties ?? {},
  required: schema.required ?? [],
});

describe('provider-facing tool schema compatibility', () => {
  it('should resolve the complete active CAD toolbelt', () => {
    const entries = serializeProviderFacingSchemas();

    expect(entries.map((entry) => entry.toolName)).toEqual([
      toolName.testModel,
      toolName.getKernelResult,
      toolName.exportGeometry,
      toolName.getParameters,
      toolName.applyParameterOperation,
      toolName.screenshot,
      toolName.editFile,
      toolName.useSkill,
      toolName.readFile,
      toolName.listDirectory,
      toolName.createFile,
      toolName.deleteFile,
      toolName.grep,
      toolName.globSearch,
      toolName.webSearch,
      toolName.webBrowser,
      toolName.revisions,
    ]);
  });

  it('should omit test_model when testing is disabled', () => {
    const entries = serializeProviderFacingSchemas(false);

    expect(entries.map((entry) => entry.toolName)).not.toContain(toolName.testModel);
    expect(entries.map((entry) => entry.toolName)).toContain(toolName.screenshot);
  });

  it('should omit image-input tools for text-only models while keeping GeoSpec and file tools', () => {
    const entries = getProviderFacingToolInputSchemas({
      toolChoice: toolMode.auto,
      testingEnabled: true,
      modelSupport: {
        tools: true,
        toolChoice: false,
        modalities: { input: ['text'], output: ['text'] },
      },
    });
    const names = entries.map((entry) => entry.toolName);

    expect(names).not.toContain(toolName.screenshot);
    expect(names).toContain(toolName.testModel);
    expect(names).toContain(toolName.getKernelResult);
    expect(names).toContain(toolName.exportGeometry);
    expect(names).toContain(toolName.editFile);
  });

  it('should return no provider-facing tools when the model does not support tools', () => {
    expect(
      filterProviderFacingToolNamesByModelSupport({
        toolNames: [toolName.testModel, toolName.screenshot],
        modelSupport: {
          tools: false,
          toolChoice: false,
          modalities: { input: ['text', 'image'], output: ['text'] },
        },
      }),
    ).toEqual([]);
  });

  it.each([true, false])(
    'should declare every provider-facing input as a plain top-level object (testing enabled: %s)',
    (testingEnabled) => {
      const failures = serializeProviderFacingSchemas(testingEnabled).flatMap((entry) => {
        const { jsonSchema } = entry;
        return [
          jsonSchema.type === 'object' ? undefined : `${entry.toolName}: top-level type is ${String(jsonSchema.type)}`,
          jsonSchema.anyOf === undefined ? undefined : `${entry.toolName}: top-level anyOf`,
          jsonSchema.oneOf === undefined ? undefined : `${entry.toolName}: top-level oneOf`,
          jsonSchema.allOf === undefined ? undefined : `${entry.toolName}: top-level allOf`,
        ].filter((failure) => failure !== undefined);
      });

      expect(failures).toEqual([]);
    },
  );

  it.each([true, false])(
    'should emit no provider-breaking JSON Schema keywords (testing enabled: %s)',
    (testingEnabled) => {
      const failures = serializeProviderFacingSchemas(testingEnabled).flatMap((entry) => {
        const paths = collectKeywordPaths(entry.jsonSchema);
        return bannedKeywords.flatMap((keyword) => paths[keyword].map((path) => `${entry.toolName}: ${path}`));
      });

      expect(failures).toEqual([]);
    },
  );

  it('should survive the Anthropic codec projection with its parameters intact', () => {
    // Every CAD tool takes at least one input; an empty projection means Claude was offered a tool it cannot call.
    const failures = serializeProviderFacingSchemas().flatMap((entry) => {
      const projected = anthropicProjection(entry.jsonSchema);
      return Object.keys(projected.properties).length > 0 ? [] : [entry.toolName];
    });

    expect(failures).toEqual([]);
  });

  it('should keep screenshot and use_skill provider inputs pruned to implemented fields', () => {
    expect(Object.keys(providerSchemaFor(toolName.screenshot).properties ?? {}).sort()).toEqual(['mode', 'targetFile']);
    expect(Object.keys(providerSchemaFor(toolName.useSkill).properties ?? {}).sort()).toEqual(['reason', 'skillName']);
  });

  it('should keep test_model provider filters as JSON arrays without bracket-key compatibility syntax', () => {
    const schema = providerSchemaFor(toolName.testModel);
    const properties = schema.properties ?? {};

    expect(properties['files']?.type).toBe('array');
    expect(properties['include']?.type).toBe('array');
    expect(properties['exclude']?.type).toBe('array');

    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('files[0]');
    expect(serialized).not.toContain('include[0]');
    expect(serialized).not.toContain('exclude[0]');
    expect(serialized).not.toContain('files[]');
    expect(serialized).not.toContain('Do not use bracket-key syntax');
  });
});
