import { analyzeMesh } from 'geospec/mesh';
import { loadStep } from 'geospec/step';
import { runGeoSpecModule } from 'geospec/runner';
import type { AnalyzeMeshResult, GeometryDiagnostic, GeometrySubject, LoadMeshOptions } from 'geospec/mesh';
import type { GeoSpecModelFormat } from 'geospec/model';
import type { GeoSpecTestCase, RunGeoSpecModuleOptions } from 'geospec/runner';
import type { TestFailure, TestModelOutput, TestPass } from '#schemas.js';

/**
 * Renderer contract used by Tau-aware GeoSpec tests.
 *
 * @public
 */
export type TauModelRendererOutput = Uint8Array<ArrayBuffer> | GeometrySubject;

/**
 * Renderer callback supplied by Tau runners.
 *
 * @public
 */
export type TauModelRenderer = (input: {
  file: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
}) => Promise<TauModelRendererOutput>;

/**
 * Options for rendering a Tau model through the active test runner.
 *
 * @public
 */
export type RenderTauModelOptions = {
  file: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
  renderer?: TauModelRenderer;
};

/**
 * Options for rendering and analyzing a Tau model as GeoSpec mesh evidence.
 *
 * @public
 */
export type AnalyzeTauModelOptions = RenderTauModelOptions & {
  mesh?: Omit<LoadMeshOptions, 'source' | 'path' | 'parameters'>;
};

/**
 * Options for running Tau-aware GeoSpec test files.
 *
 * @public
 */
export type RunTauGeoSpecTestsOptions = {
  filesystem: RunGeoSpecModuleOptions['filesystem'];
  projectPath: string;
  entryPaths: readonly string[];
  renderer: TauModelRenderer;
  testNamePattern?: string | RegExp;
  testTimeout?: number;
};

const replaceExtension = (path: string, extension: string): string => {
  const lastSlash = path.lastIndexOf('/');
  const lastDot = path.lastIndexOf('.');
  if (lastDot > lastSlash) {
    return `${path.slice(0, lastDot)}.${extension}`;
  }
  return `${path}.${extension}`;
};

const isGeometrySubject = (value: unknown): value is GeometrySubject => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { kind?: unknown; mesh?: unknown };
  return candidate.kind === 'geometry-subject' && typeof candidate.mesh === 'object';
};

/**
 * Render a Tau model using the renderer supplied by the active Tau test runner.
 *
 * @param options - File, parameters, provenance, and renderer.
 * @returns Runtime-produced GLB/glTF bytes.
 * @public
 */
export async function renderTauModel(options: RenderTauModelOptions): Promise<GeometrySubject> {
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

  if (isGeometrySubject(rendered)) {
    return rendered;
  }

  if (format === 'step' || format === 'stp') {
    return loadStep({
      source: rendered,
      name: options.file,
      parameters: parameters ?? {},
    });
  }

  const result = await analyzeMesh({
    source: rendered,
    path: replaceExtension(options.file, format),
    format: format === 'gltf' ? 'gltf' : 'glb',
    sourceUnit: 'mm',
    unit: 'mm',
    parameters: parameters ?? {},
  });
  if (!result.success) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
  }
  return result.subject;
}

/**
 * Render a Tau model and analyze the resulting mesh with GeoSpec.
 *
 * @param options - File, parameters, renderer, and optional mesh metadata.
 * @returns GeoSpec mesh analysis result.
 * @public
 */
export async function analyzeTauModel(options: AnalyzeTauModelOptions): Promise<AnalyzeMeshResult> {
  const subject = await renderTauModel(options);
  return {
    success: true,
    stats: subject.mesh.stats,
    subject,
  };
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
 * This helper is intended for browser and Node Tau runners. Geometry bytes are
 * consumed by GeoSpec in-process and only compact pass/fail results leave the
 * runner.
 *
 * @param options - VM filesystem, GeoSpec entries, and Tau renderer.
 * @returns Compact test_model-compatible results.
 * @public
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
