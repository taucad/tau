import { describe, expect, it } from 'vitest';
import { toolName } from '#constants/tool.constants.js';
import {
  normalizeProjectPathToolInputAliases,
  normalizeProjectPathToolOutputAliases,
} from '#schemas/tools/project-path-input-normalizer.js';
import { readFileInputSchema } from '#schemas/tools/read-file.tool.schema.js';
import { listDirectoryInputSchema } from '#schemas/tools/list-directory.tool.schema.js';
import { testModelInputSchema } from '#schemas/tools/test-model.tool.schema.js';

describe('normalizeProjectPathToolInputAliases', () => {
  it.each([
    [toolName.readFile, 'targetFile'],
    [toolName.editFile, 'targetFile'],
    [toolName.createFile, 'targetFile'],
    [toolName.deleteFile, 'targetFile'],
    [toolName.getKernelResult, 'targetFile'],
    [toolName.exportGeometry, 'targetFile'],
    [toolName.screenshot, 'targetFile'],
    [toolName.listDirectory, 'path'],
    [toolName.grep, 'path'],
    [toolName.globSearch, 'path'],
  ] as const)('repairs the model-only leading slash for %s.%s', (name, field) => {
    const input = { [field]: '/lib/main.ts', untouched: 1 };
    expect(normalizeProjectPathToolInputAliases(name, input)).toEqual({
      input: { [field]: 'lib/main.ts', untouched: 1 },
      changed: true,
      healedKeys: [field],
    });
    expect(input[field]).toBe('/lib/main.ts');
  });

  it('repairs test_model file paths without changing include/exclude globs', () => {
    expect(
      normalizeProjectPathToolInputAliases(toolName.testModel, {
        files: ['/main.geospec.ts', 'checks/../slow.geospec.ts'],
        include: ['/**/*.geospec.ts'],
      }),
    ).toEqual({
      input: {
        files: ['main.geospec.ts', 'slow.geospec.ts'],
        include: ['/**/*.geospec.ts'],
      },
      changed: true,
      healedKeys: ['files'],
    });
  });

  it('leaves unsafe aliases untouched for strict schema validation', () => {
    for (const targetFile of ['//main.ts', '/../main.ts', 'C:\\main.ts', 'file:///main.ts']) {
      const result = normalizeProjectPathToolInputAliases(toolName.readFile, { targetFile });
      expect(result.changed).toBe(false);
      expect(readFileInputSchema.safeParse(result.input).success).toBe(false);
    }
  });

  it('keeps direct schemas strict while permitting the canonical root for directory tools', () => {
    expect(readFileInputSchema.safeParse({ targetFile: '/main.ts' }).success).toBe(false);
    expect(readFileInputSchema.safeParse({ targetFile: 'main.ts' }).success).toBe(true);
    expect(listDirectoryInputSchema.safeParse({ path: '' }).success).toBe(true);
    expect(listDirectoryInputSchema.safeParse({ path: '/' }).success).toBe(false);
    expect(testModelInputSchema.safeParse({ files: ['/main.geospec.ts'] }).success).toBe(false);
  });

  it('repairs historical output paths without changing unrelated output fields', () => {
    expect(
      normalizeProjectPathToolOutputAliases(toolName.testModel, {
        failures: [{ id: 'one', targetFile: '/main.ts' }],
        passes: [{ id: 'two', targetFile: 'lib/part.ts' }],
        total: 2,
      }),
    ).toEqual({
      input: {
        failures: [{ id: 'one', targetFile: 'main.ts' }],
        passes: [{ id: 'two', targetFile: 'lib/part.ts' }],
        total: 2,
      },
      changed: true,
      healedKeys: ['failures'],
    });

    expect(
      normalizeProjectPathToolOutputAliases(toolName.getKernelResult, {
        status: 'error',
        kernelIssues: [{ message: 'broken', location: { fileName: '/main.ts', startLineNumber: 1 } }],
      }).input,
    ).toMatchObject({ kernelIssues: [{ location: { fileName: 'main.ts' } }] });
  });
});
