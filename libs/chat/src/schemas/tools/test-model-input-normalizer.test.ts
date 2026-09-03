import { describe, expect, it } from 'vitest';
import { geoSpecRunFilterInputSchema } from '#schemas/tools/test-model.tool.schema.js';
import { normalizeGeoSpecRunFilterInputAliases } from '#schemas/tools/test-model-input-normalizer.js';

describe('normalizeGeoSpecRunFilterInputAliases', () => {
  it('should heal known bracket-array aliases into canonical arrays without mutating the original input', () => {
    const input = {
      'files[1]': 'lib',
      'files[0]': 'main.geospec.ts',
      'include[0]': 'parts/**/*.geospec.ts',
      'exclude[0]': '**/*.slow.geospec.ts',
      testNamePattern: 'watertight',
    };

    const result = normalizeGeoSpecRunFilterInputAliases(input);

    expect(result).toEqual({
      input: {
        files: ['main.geospec.ts', 'lib'],
        include: ['parts/**/*.geospec.ts'],
        exclude: ['**/*.slow.geospec.ts'],
        testNamePattern: 'watertight',
      },
      changed: true,
      healedKeys: ['files[0]', 'files[1]', 'include[0]', 'exclude[0]'],
    });
    expect(input).toEqual({
      'files[1]': 'lib',
      'files[0]': 'main.geospec.ts',
      'include[0]': 'parts/**/*.geospec.ts',
      'exclude[0]': '**/*.slow.geospec.ts',
      testNamePattern: 'watertight',
    });
    expect(geoSpecRunFilterInputSchema.parse(result.input)).toEqual({
      files: ['main.geospec.ts', 'lib'],
      include: ['parts/**/*.geospec.ts'],
      exclude: ['**/*.slow.geospec.ts'],
      testNamePattern: 'watertight',
    });
  });

  it('should keep canonical collisions blocked for strict schema validation', () => {
    const input = {
      files: ['main.geospec.ts'],
      'files[0]': 'other.geospec.ts',
    };

    const result = normalizeGeoSpecRunFilterInputAliases(input);

    expect(result).toEqual({
      input,
      changed: false,
      healedKeys: ['files[0]'],
      blockedReason: 'canonical_collision',
    });
    expect(geoSpecRunFilterInputSchema.safeParse(result.input).success).toBe(false);
  });

  it('should keep non-contiguous indexes blocked for strict schema validation', () => {
    const input = {
      'exclude[0]': '**/*.slow.geospec.ts',
      'exclude[2]': '**/*.flaky.geospec.ts',
    };

    const result = normalizeGeoSpecRunFilterInputAliases(input);

    expect(result).toEqual({
      input,
      changed: false,
      healedKeys: ['exclude[0]', 'exclude[2]'],
      blockedReason: 'non_contiguous_indexes',
    });
    expect(geoSpecRunFilterInputSchema.safeParse(result.input).success).toBe(false);
  });

  it('should leave unknown bracket keys and unsupported unindexed aliases invalid', () => {
    const unknown = normalizeGeoSpecRunFilterInputAliases({ 'targetFile[0]': 'main.ts' });
    const unindexed = normalizeGeoSpecRunFilterInputAliases({ 'files[]': 'main.geospec.ts' });
    const leadingZero = normalizeGeoSpecRunFilterInputAliases({ 'files[00]': 'main.geospec.ts' });

    expect(unknown).toEqual({
      input: { 'targetFile[0]': 'main.ts' },
      changed: false,
      healedKeys: [],
    });
    expect(unindexed).toEqual({
      input: { 'files[]': 'main.geospec.ts' },
      changed: false,
      healedKeys: [],
      blockedReason: 'unsupported_unindexed_array',
    });
    expect(leadingZero).toEqual({
      input: { 'files[00]': 'main.geospec.ts' },
      changed: false,
      healedKeys: [],
    });
    expect(geoSpecRunFilterInputSchema.safeParse(unknown.input).success).toBe(false);
    expect(geoSpecRunFilterInputSchema.safeParse(unindexed.input).success).toBe(false);
    expect(geoSpecRunFilterInputSchema.safeParse(leadingZero.input).success).toBe(false);
  });

  it('should delegate healed value validation to the canonical Zod schema', () => {
    const result = normalizeGeoSpecRunFilterInputAliases({ 'files[0]': 123 });

    expect(result).toEqual({
      input: { files: [123] },
      changed: true,
      healedKeys: ['files[0]'],
    });
    expect(geoSpecRunFilterInputSchema.safeParse(result.input).success).toBe(false);
  });

  it('should leave objects with a custom prototype untouched', () => {
    const input = Object.assign(Object.create({ marker: true }) as Record<string, unknown>, {
      'files[0]': 'main.geospec.ts',
    });

    expect(normalizeGeoSpecRunFilterInputAliases(input)).toEqual({
      input,
      changed: false,
      healedKeys: [],
    });
  });
});
