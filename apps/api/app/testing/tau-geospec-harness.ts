/**
 * Node GeoSpec harness for the API's own integration tests.
 *
 * Discovers nothing and owns no policy: it runs the GeoSpec entries it is
 * handed, one file at a time in sorted order, and maps the runner result into
 * the compact `test_model` wire shape through the shared agent-tools projection;
 * the live product path uses that same projection. This exists
 * so the API can exercise the `test_model` tool headlessly.
 *
 * @module
 */

// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import -- installs the GeoSpec engine implementation
import '@taucad/geospec-engine/register/node';
import { Engine } from '@taucad/geospec-engine-native/node';
import { runnerResultToTestModelOutput } from '@taucad/agent-tools/geospec';
import { createGeoSpecNodeRunner } from 'geospec/runner/node';
import { createModelLoader } from 'geospec/model';
import type { GeoSpecModelFormat, LoadModelSourceOptions } from 'geospec/model';
import type { RunGeoSpecModuleOptions } from 'geospec/runner';
import type { TestModelOutput } from '@taucad/chat/schemas/tools/test-model';

/**
 * Renderer contract used by Tau-aware GeoSpec tests.
 *
 * Renderers hand back a geometry source. The engine, not the harness, owns
 * ingestion and analysis; callers cannot fabricate live subject methods.
 */
export type TauModelRendererOutput = Omit<LoadModelSourceOptions, 'parameters'>;

type TauModelRenderer = (input: {
  file: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
}) => Promise<TauModelRendererOutput>;

type RunTauGeoSpecTestsOptions = {
  filesystem: RunGeoSpecModuleOptions['filesystem'];
  projectPath: string;
  entryPaths: readonly string[];
  renderer: TauModelRenderer;
  testNamePattern?: string | RegExp;
  testTimeout?: number;
};

const isRendererOutput = (value: unknown): value is TauModelRendererOutput => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'source' in value;
};

/**
 * Run Tau-aware GeoSpec tests against locally rendered geometry.
 *
 * Geometry bytes are consumed by GeoSpec in-process and only compact pass/fail
 * results leave the runner.
 *
 * @param options - VM filesystem, GeoSpec entries, and Tau renderer.
 * @returns Compact test_model-compatible results.
 */
export async function runTauGeoSpecTests(options: RunTauGeoSpecTestsOptions): Promise<TestModelOutput> {
  const engine = new Engine();
  try {
    const managed = createModelLoader({
      engine,
      readSource: async (source) => {
        if (typeof source !== 'string') {
          throw new TypeError('The Tau test source reader requires a filesystem path.');
        }
        return options.filesystem.readFile(source);
      },
    });
    const modelLoader: NonNullable<RunGeoSpecModuleOptions['modelLoader']> = Object.assign(
      async (input: Parameters<typeof managed>[0]) => {
        if ('source' in input) {
          return managed(input);
        }

        if ('code' in input) {
          throw new Error('Inline code model loading is not supported by the Tau browser test runner.');
        }

        const format = input.format ?? 'glb';
        const rendered = await options.renderer({
          file: input.file,
          format,
          ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
        });
        if (!isRendererOutput(rendered)) {
          throw new Error(`Tau test renderer must return a geometry source for ${input.file}.`);
        }
        return managed({
          ...rendered,
          format: rendered.format ?? format,
          path: rendered.path ?? input.file,
          ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
        });
      },
      { dispose: async () => managed.dispose() },
    );
    const runner = createGeoSpecNodeRunner({
      filesystem: options.filesystem,
      projectPath: options.projectPath,
      cache: false,
      modelLoader,
      nativeAssertions: { engine },
    });
    try {
      const aggregate = await runner.run({
        files: [...options.entryPaths].sort(),
        ...(options.testNamePattern === undefined ? {} : { testNamePattern: options.testNamePattern }),
        ...(options.testTimeout === undefined ? {} : { testTimeout: options.testTimeout }),
      });
      return runnerResultToTestModelOutput(aggregate, options.entryPaths, {
        filtersApplied: options.testNamePattern !== undefined,
      });
    } finally {
      await runner.close();
    }
  } finally {
    engine.close();
  }
}
