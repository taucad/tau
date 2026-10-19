import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeVmFileSystem } from 'geospec/runner/node';
import { Engine } from 'geospec-engine/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { createNativeGeoSpecRunner } from 'geospec/runner/native';
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
const selectedModels = examplePattern
  ? models.filter(({ kernel, name }) => new RegExp(examplePattern).test(`${kernel}.${name}`))
  : models;
const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

describe('Tau example model health', () => {
  it('passes the manifest-complete GeoSpec suite', { timeout: 1_500_000 }, async () => {
    const consoleDiagnostics: string[] = [];
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation((...values) => consoleDiagnostics.push(`warning: ${values.map(String).join(' ')}`));
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation((...values) => consoleDiagnostics.push(`error: ${values.map(String).join(' ')}`));
    const engine = new Engine();
    /* One caller-owned runtime for every run. A factory gives each run its own in-process runtime, and a terminated
     * in-process runtime keeps its kernel threads and memory, so the corpus would exhaust the host part-way through. */
    const runtime = await createExampleGeoSpecRuntimeClient(examplesRoot);
    const runner = createNativeGeoSpecRunner({
      filesystem: createNodeVmFileSystem(examplesRoot),
      nativeAssertions: { engine },
      model: { projectPath: examplesSource, runtime },
    });
    try {
      /* One run per model, so each model's admitted evidence is released before the next loads. A single run keeps
       * every model's retained input live until the module ends, and the corpus outgrows the host's retained input
       * byte limit part-way through (F-B1); per-model runs check the same rows without raising that limit. */
      const results: Array<Awaited<ReturnType<typeof runner.run>>> = [];
      for (const { kernel, name } of selectedModels) {
        // oxlint-disable-next-line no-await-in-loop -- Runs are serial so each releases its evidence first.
        const result = await runner.run({
          files: ['example-health.geospec.ts'],
          testNamePattern: `(^|\\s)${escapeRegExp(`${kernel}.${name}`)}$`,
          testTimeout: 300_000,
        });
        results.push(result);
      }
      type Failure = { file: string; name: string; status: string; diagnostics: unknown };
      const failures = results.flatMap((result) =>
        result.files.flatMap(({ file, result: fileResult }): Failure[] =>
          fileResult.success
            ? fileResult.tests
                .filter(({ status }) => status !== 'passed')
                .map(({ name, status, diagnostics }) => ({ file, name, status, diagnostics }))
            : [{ file, name: 'module execution', status: 'failed', diagnostics: fileResult.issues }],
        ),
      );
      const total = (count: (result: (typeof results)[number]) => number): number =>
        results.reduce((sum, result) => sum + count(result), 0);

      expect(
        total(({ selectedTests }) => selectedTests),
        JSON.stringify(failures, null, 2),
      ).toBe(selectedModels.length);
      expect(consoleDiagnostics, consoleDiagnostics.join('\n')).toEqual([]);
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
      expect(total(({ passed }) => passed)).toBe(selectedModels.length);
      expect(results.every(({ success }) => success)).toBe(true);
    } finally {
      await runner.close();
      engine.close();
      runtime.terminate();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
