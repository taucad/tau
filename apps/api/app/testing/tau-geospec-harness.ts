/**
 * Node GeoSpec harness for the API's own integration tests.
 *
 * Discovers nothing and owns no policy: it runs the GeoSpec entries it is
 * handed, one file at a time in sorted order, and maps the runner result into
 * the compact `test_model` wire shape. The browser owns the same mapping for
 * the live product path (`apps/ui/app/lib/geospec-rpc-result.ts`); this exists
 * so the API can exercise the `test_model` tool headlessly.
 *
 * @module
 */

// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import -- installs the GeoSpec engine implementation
import '@taucad/geospec-engine/register';
import { runGeoSpecModule } from 'geospec/runner';
import type { GeometryDiagnostic, GeometrySubject } from 'geospec/mesh';
import type { GeoSpecModelFormat, LoadModelSourceOptions } from 'geospec/model';
import type { GeoSpecTestCase, RunGeoSpecModuleOptions } from 'geospec/runner';
import type { TestFailure, TestModelOutput, TestPass } from '@taucad/chat/schemas/tools/test-model';

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

const fullTestName = (test: Pick<GeoSpecTestCase, 'suite' | 'name'>): string => [...test.suite, test.name].join(' > ');

const diagnosticText = (diagnostics: readonly GeometryDiagnostic[] | undefined): string | undefined =>
  diagnostics?.map((diagnostic) => diagnostic.message).join('\n');

type TransportDiagnostic = NonNullable<TestFailure['diagnostics']>[number];
type TransportVec3 = [number, number, number];

const cloneVec3 = (value: readonly [number, number, number] | undefined): TransportVec3 | undefined =>
  value === undefined ? undefined : [value[0], value[1], value[2]];

const transportDiagnostics = (
  diagnostics: readonly GeometryDiagnostic[] | undefined,
): TransportDiagnostic[] | undefined =>
  diagnostics?.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    ...(diagnostic.spatial === undefined
      ? {}
      : {
          spatial: {
            ...(diagnostic.spatial.min === undefined ? {} : { min: cloneVec3(diagnostic.spatial.min) }),
            ...(diagnostic.spatial.max === undefined ? {} : { max: cloneVec3(diagnostic.spatial.max) }),
            ...(diagnostic.spatial.center === undefined ? {} : { center: cloneVec3(diagnostic.spatial.center) }),
          },
        }),
    ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
  }));

const geospecFailure = (options: {
  id: string;
  requirement: string;
  targetFile: string;
  diagnostics?: readonly GeometryDiagnostic[];
  reason?: string;
  suggestion?: string;
}): TestFailure => ({
  id: options.id,
  requirement: options.requirement,
  targetFile: options.targetFile,
  reason: options.reason ?? diagnosticText(options.diagnostics) ?? 'GeoSpec test failed.',
  suggestion:
    options.suggestion ??
    options.diagnostics?.find((diagnostic) => diagnostic.suggestion)?.suggestion ??
    'Inspect the GeoSpec diagnostics and update the model or expected geometry assertion.',
  diagnostics: transportDiagnostics(options.diagnostics),
});

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
  if (options.entryPaths.length === 0) {
    return {
      failures: [
        {
          id: 'missing_geospec_file',
          requirement: 'At least one GeoSpec test file must exist',
          reason: 'No *.geospec.ts or *.geospec.js files found in the project.',
          suggestion:
            'Create a *.geospec.ts test file. Import describe, it, and expectGeo from geospec, and load models through geospec/model.',
          targetFile: '*.geospec.ts',
        },
      ],
      passes: [],
      passed: 0,
      total: 0,
    };
  }

  const failures: TestFailure[] = [];
  const passes: TestPass[] = [];
  for (const entry of [...options.entryPaths].sort()) {
    const entryPath = entry.startsWith('/') ? entry : `${options.projectPath}/${entry}`;
    // oxlint-disable-next-line no-await-in-loop -- tests must run deterministically in filename order
    const result = await runGeoSpecModule({
      filesystem: options.filesystem,
      projectPath: options.projectPath,
      entryPath,
      testNamePattern: options.testNamePattern,
      testTimeout: options.testTimeout,
      modelLoader: async (input) => {
        if ('source' in input) {
          const { loadModel } = await import('geospec/model');
          return loadModel(input);
        }

        if ('code' in input) {
          throw new Error('Inline code model loading is not supported by the Tau browser test runner.');
        }

        return renderTauModel({
          file: input.file,
          format: input.format,
          parameters: input.parameters,
          renderer: options.renderer,
        });
      },
    });

    if (!result.success) {
      failures.push(
        geospecFailure({
          id: `${entry}:bundle`,
          requirement: `GeoSpec module ${entry} must bundle and execute`,
          targetFile: entry,
          reason: result.issues.map((issue) => issue.message).join('\n'),
          suggestion: 'Fix the GeoSpec syntax, imports, or referenced project files.',
        }),
      );
      continue;
    }

    for (const test of result.tests) {
      if (test.status === 'skipped') {
        continue;
      }

      const requirement = fullTestName(test);
      const targetFile = entry;
      if (test.status === 'failed') {
        const assertionDiagnostic = test.assertions.flatMap((assertion) => assertion.diagnostics ?? []).at(0);
        failures.push(
          geospecFailure({
            id: `${entry}:${requirement}`,
            requirement,
            targetFile,
            diagnostics: assertionDiagnostic ? [assertionDiagnostic] : test.diagnostics,
          }),
        );
        continue;
      }

      passes.push({
        id: `${entry}:${requirement}`,
        requirement,
        targetFile,
      });
    }
  }

  if (passes.length === 0 && failures.length === 0) {
    return {
      failures: [
        {
          id: 'NO_MATCHING_GEOSPEC_TESTS',
          requirement: 'At least one selected GeoSpec test must run',
          reason: 'GeoSpec files were found, but the supplied filters did not select any tests.',
          suggestion: 'Run without filters or use a matching Vitest-style testNamePattern.',
          targetFile: options.entryPaths.join(', '),
        },
      ],
      passes: [],
      passed: 0,
      total: 1,
    };
  }

  return {
    failures,
    passes,
    passed: passes.length,
    total: failures.length + passes.length,
  };
}
