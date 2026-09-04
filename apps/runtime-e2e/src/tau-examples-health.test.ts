import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@taucad/geospec-engine/register/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { createModelLoader } from 'geospec/model';
import { createGeoSpecNodeRunner, createNodeVmFileSystem } from 'geospec/runner/node';
import { describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const examplesRoot = resolve(repoRoot, 'libs/tau-examples');
const examplesSource = resolve(examplesRoot, 'src');
const inventory = JSON.parse(readFileSync(resolve(examplesSource, 'manifest.json'), 'utf8')) as Array<{
  kind: string;
  kernel: string;
  name: string;
}>;
const models = inventory.filter(({ kind }) => kind === 'model');
const examplePattern = process.env['TAU_EXAMPLE_PATTERN'];
const cache = process.env['TAU_GEOSPEC_CACHE'] !== '0';
const expectedModels = examplePattern
  ? models.filter(({ kernel, name }) => new RegExp(examplePattern).test(`${kernel}.${name}`)).length
  : models.length;

describe('Tau example model health', () => {
  it('passes the manifest-complete GeoSpec suite', { timeout: 1_500_000 }, async () => {
    const consoleDiagnostics: string[] = [];
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation((...values) => consoleDiagnostics.push(`warning: ${values.map(String).join(' ')}`));
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation((...values) => consoleDiagnostics.push(`error: ${values.map(String).join(' ')}`));
    const runner = createGeoSpecNodeRunner({
      filesystem: createNodeVmFileSystem(examplesRoot),
      projectPath: examplesRoot,
      cache,
      modelLoader: createModelLoader({
        projectPath: examplesSource,
        runtime: async () => createExampleGeoSpecRuntimeClient(examplesRoot),
      }),
    });
    try {
      const result = await runner.run({
        files: ['example-health.geospec.ts'],
        forensic: true,
        ...(examplePattern ? { testNamePattern: examplePattern } : {}),
        testTimeout: 300_000,
      });
      const failures = result.files.flatMap(({ file, result: fileResult }) =>
        fileResult.success
          ? fileResult.tests
              .filter(({ status }) => status === 'failed')
              .map(({ name, diagnostics }) => ({ file, name, diagnostics }))
          : [{ file, name: 'module execution', diagnostics: fileResult.issues }],
      );

      expect(result.selectedTests, JSON.stringify(failures, null, 2)).toBe(expectedModels);
      expect(consoleDiagnostics, consoleDiagnostics.join('\n')).toEqual([]);
      expect(result.failed, JSON.stringify(failures, null, 2)).toBe(0);
      expect(result.passed).toBe(expectedModels);
      expect(result.success).toBe(true);
    } finally {
      await runner.close();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
