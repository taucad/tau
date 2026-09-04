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
import '@taucad/geospec-engine/register';
import { runnerResultToTestModelOutput } from '@taucad/agent-tools/geospec';
import { runGeoSpecModule } from 'geospec/runner';
import { getGeoSpecEngineProtocol } from 'geospec/engine';
import type { GeometrySubject } from 'geospec/mesh';
import type { GeoSpecModelFormat, LoadModelSourceOptions } from 'geospec/model';
import type { RunGeoSpecModuleOptions } from 'geospec/runner';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
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

type RenderTauModelOptions = {
  file: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
  renderer?: TauModelRenderer;
};

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
 * Render a Tau model using the renderer supplied by the active Tau test runner.
 *
 * @param options - File, parameters, provenance, and renderer.
 * @returns The rendered geometry as a GeoSpec subject.
 */
async function renderTauModel(options: RenderTauModelOptions): Promise<GeometrySubject> {
  if (!options.renderer) {
    throw new Error(
      'renderTauModel() requires a Tau test renderer. Run through the Tau GeoSpec runner or pass renderer explicitly.',
    );
  }

  const { parameters } = options;
  const format = options.format ?? 'glb';
  const rendered = await options.renderer({
    file: options.file,
    format,
    ...(parameters === undefined ? {} : { parameters }),
  });

  if (!isRendererOutput(rendered)) {
    throw new Error(`Tau test renderer must return a geometry source for ${options.file}.`);
  }

  const { loadModel } = await import('geospec/model');
  return loadModel({
    ...rendered,
    format: rendered.format ?? format,
    path: rendered.path ?? options.file,
    ...(parameters === undefined ? {} : { parameters }),
  });
}

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
  const aggregate: GeoSpecRunnerResult = { success: true, passed: 0, failed: 0, selectedTests: 0, files: [] };
  const protocol = getGeoSpecEngineProtocol();
  const subjects = new Set<string>();
  let closed = false;
  const releaseSubject = async (subjectId: string) =>
    protocol?.releaseSubject({ requestId: `api-harness-release:${subjectId}`, subjectId });
  const track = async (subject: GeometrySubject): Promise<GeometrySubject> => {
    if (closed) {
      await Promise.allSettled([releaseSubject(subject.subjectId)]);
    } else {
      subjects.add(subject.subjectId);
    }
    return subject;
  };
  try {
    for (const entry of [...options.entryPaths].sort()) {
      const entryPath = entry;
      // oxlint-disable-next-line no-await-in-loop -- tests must run deterministically in filename order
      const result = await runGeoSpecModule({
        filesystem: options.filesystem,
        entryPath,
        testNamePattern: options.testNamePattern,
        testTimeout: options.testTimeout,
        modelLoader: async (input) => {
          if ('source' in input) {
            const { loadModel } = await import('geospec/model');
            return loadModel(input).then(track);
          }

          if ('code' in input) {
            throw new Error('Inline code model loading is not supported by the Tau browser test runner.');
          }

          return renderTauModel({
            file: input.file,
            format: input.format,
            parameters: input.parameters,
            renderer: options.renderer,
          }).then(track);
        },
      });

      aggregate.files.push({ file: entry, result });
      aggregate.passed += result.success ? result.tests.filter((test) => test.status === 'passed').length : 0;
      aggregate.failed += result.success ? result.tests.filter((test) => test.status === 'failed').length : 1;
      aggregate.selectedTests += result.success ? result.tests.length : 0;
    }
    aggregate.success = aggregate.failed === 0 && aggregate.passed > 0;
    return runnerResultToTestModelOutput(aggregate, options.entryPaths, {
      filtersApplied: options.testNamePattern !== undefined,
    });
  } finally {
    closed = true;
    await Promise.allSettled([...subjects].map(async (subjectId) => releaseSubject(subjectId)));
  }
}
