import { describe, expect, it } from 'vitest';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { toolMode, toolName } from '#constants/tool.constants.js';
import {
  filterProviderFacingToolNamesByModelSupport,
  getProviderFacingToolInputSchemas,
} from '#schemas/provider-tool-schemas.js';

const vertexBreakingKeywords = ['const', 'propertyNames', 'prefixItems'] as const;

type KeywordPathMap = Record<(typeof vertexBreakingKeywords)[number], string[]>;

const emptyKeywordPaths = (): KeywordPathMap => ({
  const: [],
  propertyNames: [],
  prefixItems: [],
});

const collectKeywordPaths = (
  value: unknown,
  path = '$',
  paths: KeywordPathMap = emptyKeywordPaths(),
): KeywordPathMap => {
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
    if (vertexBreakingKeywords.includes(key as (typeof vertexBreakingKeywords)[number])) {
      paths[key as (typeof vertexBreakingKeywords)[number]].push(`${path}.${key}`);
    }
    collectKeywordPaths(child, `${path}.${key}`, paths);
  }

  return paths;
};

const serializeProviderFacingSchemas = (testingEnabled = true) =>
  getProviderFacingToolInputSchemas({ toolChoice: toolMode.auto, testingEnabled }).map((entry) => ({
    ...entry,
    jsonSchema: toJsonSchema(entry.schema),
  }));

const providerSchemaFor = (name: string): { properties?: Record<string, { type?: string; description?: string }> } => {
  const schema = serializeProviderFacingSchemas().find((entry) => entry.toolName === name)?.jsonSchema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`missing JSON Schema for ${name}`);
  }
  return schema as { properties?: Record<string, { type?: string; description?: string }> };
};

describe('provider-facing tool schema compatibility', () => {
  it('should resolve the active CAD toolbelt without internal transfer tools', () => {
    const entries = serializeProviderFacingSchemas();

    expect(entries.map((entry) => entry.toolName)).toEqual([
      toolName.testModel,
      toolName.getKernelResult,
      toolName.exportGeometry,
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

  it('should emit no Vertex-breaking JSON Schema keywords for active provider-facing inputs', () => {
    const failures = serializeProviderFacingSchemas().flatMap((entry) => {
      const paths = collectKeywordPaths(entry.jsonSchema);
      return vertexBreakingKeywords.flatMap((keyword) => paths[keyword].map((path) => `${entry.toolName}: ${path}`));
    });

    expect(failures).toEqual([]);
  });

  it('should keep screenshot and use_skill provider inputs pruned to implemented fields', () => {
    const entries = serializeProviderFacingSchemas();
    const screenshot = entries.find((entry) => entry.toolName === toolName.screenshot)?.jsonSchema as
      | { properties?: Record<string, unknown> }
      | undefined;
    const useSkill = entries.find((entry) => entry.toolName === toolName.useSkill)?.jsonSchema as
      | { properties?: Record<string, unknown> }
      | undefined;

    expect(Object.keys(screenshot?.properties ?? {}).sort()).toEqual(['mode', 'targetFile']);
    expect(Object.keys(useSkill?.properties ?? {}).sort()).toEqual(['reason', 'skillName']);
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
