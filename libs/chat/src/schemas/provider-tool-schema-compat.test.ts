import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolMode, toolName } from '#constants/tool.constants.js';
import { toolDescriptions } from '#constants/tool-description.constants.js';
import { arrangeWorkbenchDescription } from '#schemas/tools/arrange-workbench.tool.schema.js';
import {
  filterProviderFacingToolNamesByModelSupport,
  getProviderFacingToolInputSchemas,
  toProviderToolJsonSchema,
} from '#schemas/provider-tool-schemas.js';
import { getPrintProfilesInputSchema, requestPrintInputSchema } from '#schemas/tools/print.tool.schema.js';
import { installPackagesInputSchema } from '#schemas/tools/install-packages.tool.schema.js';

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

const arrayItemsPaths = (value: unknown, path = '$'): string[] => {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => arrayItemsPaths(entry, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'items' && Array.isArray(child) ? [`${path}.items`] : arrayItemsPaths(child, `${path}.${key}`),
  );
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
      toolName.evaluateModel,
      toolName.exportModel,
      toolName.getParameters,
      toolName.applyParameterOperation,
      toolName.screenshot,
      toolName.editFile,
      toolName.arrangeWorkbench,
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
      toolName.updateTodos,
      toolName.askQuestions,
      toolName.installPackages,
      toolName.getMachine,
      toolName.getPrintProfiles,
      toolName.requestPrint,
      toolName.getPrintRequest,
      toolName.listPrintRequests,
      toolName.cancelPrint,
    ]);
    expect(toolDescriptions[toolName.arrangeWorkbench]).toBe(arrangeWorkbenchDescription);
    expect(toolDescriptions[toolName.arrangeWorkbench].length).toBeGreaterThan(0);
  });

  it('keeps arrange_workbench provider-safe and within the approved 14 KiB ceiling', () => {
    const schema = providerSchemaFor(toolName.arrangeWorkbench);
    expect(Object.keys(schema.properties ?? {})).toEqual([
      'open',
      'close',
      'views',
      'entries',
      'viewer',
      'workbench',
      'lanes',
      'basedOn',
    ]);
    expect(collectKeywordPaths(schema)).toEqual(emptyKeywordPaths());
    expect(arrayItemsPaths(schema)).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(schema), 'utf8')).toBeLessThanOrEqual(14_336);
  });

  it('keeps install_packages provider-safe with a typeless add record', () => {
    const schema = providerSchemaFor(toolName.installPackages);
    expect(Object.keys(schema.properties ?? {})).toEqual(['add', 'remove', 'upgrade']);
    expect(schema.required ?? []).toEqual([]);
    expect(collectKeywordPaths(schema)).toEqual(emptyKeywordPaths());
    expect(toolDescriptions[toolName.installPackages]).toContain('package-not-locked');
    expect(installPackagesInputSchema.parse({})).toEqual({});
    expect(installPackagesInputSchema.parse({ add: { 'simplex-noise': '^4.0.3' } })).toEqual({
      add: { 'simplex-noise': '^4.0.3' },
    });
    expect(installPackagesInputSchema.safeParse({ add: ['simplex-noise@^4.0.3'] }).success).toBe(false);
    expect(installPackagesInputSchema.safeParse({ add: { 'simplex-noise': '' } }).success).toBe(false);
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
    expect(names).toContain(toolName.evaluateModel);
    expect(names).toContain(toolName.exportModel);
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

  it('should emit no Draft 7 tuple items rejected by Draft 2020-12 providers', () => {
    const failures = serializeProviderFacingSchemas().flatMap((entry) =>
      arrayItemsPaths(entry.jsonSchema).map((path) => `${entry.toolName}: ${path}`),
    );
    expect(failures).toEqual([]);
  });

  it('should preserve fixed coordinate length and numeric validation in provider JSON Schema', () => {
    const coordinates = z.object({ direction: z.tuple([z.number(), z.number(), z.number()]) });
    const serialized = toProviderToolJsonSchema(coordinates);
    const providerInput = z.fromJSONSchema(serialized);

    expect(serialized).toMatchObject({
      properties: { direction: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } },
    });
    for (const direction of [[0, -1, 0], [], [0, 1], [0, 1, 2, 3], [0, 'north', 0]]) {
      expect(providerInput.safeParse({ direction }).success).toBe(coordinates.safeParse({ direction }).success);
    }
  });

  it('should refuse tuples that cannot preserve their constraints as homogeneous fixed arrays', () => {
    for (const schema of [z.tuple([z.number(), z.string()]), z.tuple([z.number()]).rest(z.number())]) {
      expect(() => toProviderToolJsonSchema(schema)).toThrow(
        'Provider tool schema has a tuple that cannot use one items schema',
      );
    }
  });

  it('should survive the Anthropic codec projection with its parameters intact', () => {
    // Every CAD tool takes at least one input; an empty projection means Claude was offered a tool it cannot call.
    const failures = serializeProviderFacingSchemas().flatMap((entry) => {
      const projected = anthropicProjection(entry.jsonSchema);
      return Object.keys(projected.properties).length > 0 ? [] : [entry.toolName];
    });

    expect(failures).toEqual([]);
  });

  it('should offer request_print its slicer options as a plain described object slot', () => {
    const schema = providerSchemaFor(toolName.requestPrint);

    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
      'machineId',
      'options',
      'plate',
      'preset',
      'profileId',
      'profiles',
      'settings',
      'targetFile',
    ]);
    expect(schema.required).toEqual(['targetFile']);
    expect(schema.properties?.['options']).toEqual({
      description: 'Slicer options: a JSON object mapping option names to JSON values.',
    });
    expect(schema.properties?.['settings']).toEqual({
      description: 'Bambu Studio settings: a JSON object mapping setting keys from get_print_profiles to values.',
    });
  });

  it('should bound request_print Bambu Studio settings at runtime', () => {
    const schema = requestPrintInputSchema;
    /* Bambu Studio's own setting keys. */
    const settings = (key: string, value: unknown) => ({ targetFile: 'main.ts', settings: { [key]: value } });

    expect(schema.safeParse(settings('sparse_infill_density', '20%')).success).toBe(true);
    expect(schema.safeParse(settings('wall_loops', { nested: 1 })).success).toBe(false);
    expect(schema.safeParse({ targetFile: 'main.ts', profiles: { filaments: [] } }).success).toBe(false);
  });

  it('should offer get_print_profiles a machine, profiles and a bounded key filter', () => {
    const schema = providerSchemaFor(toolName.getPrintProfiles);

    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['keys', 'machineId', 'profileId', 'profiles']);
    expect(schema.required ?? []).toEqual([]);
    expect(getPrintProfilesInputSchema.safeParse({ keys: Array.from({ length: 65 }, (_, i) => `k${i}`) }).success).toBe(
      false,
    );
  });

  it('should keep screenshot and use_skill provider inputs pruned to implemented fields', () => {
    expect(Object.keys(providerSchemaFor(toolName.screenshot).properties ?? {}).sort()).toEqual([
      'instance',
      'mode',
      'options',
      'targetFile',
      'view',
    ]);
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
