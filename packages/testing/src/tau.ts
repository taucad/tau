import { analyzeMesh } from 'geospec/mesh';
import { loadStep } from 'geospec/step';
import { runGeoSpecModule } from 'geospec/runner';
import type { AnalyzeMeshResult, GeometryDiagnostic, GeometrySubject, LoadMeshOptions } from 'geospec/mesh';
import type { GeoSpecModelFormat } from 'geospec/model';
import type { GeoSpecTestCase, RunGeoSpecModuleOptions } from 'geospec/runner';
import type { TestFailure, TestModelOutput, TestPass } from '#schemas.js';

/**
 * Tau parameter file entry shape stored at `.tau/parameters/<entry>.json`.
 *
 * @public
 */
export type TauParameterFileEntry = {
  activeGroup: string;
  groups: Record<string, { values: Record<string, unknown> }>;
  order?: string[];
};

/**
 * Parameter group resolved for testing.
 *
 * @public
 */
export type TauParameterGroup = {
  name: string;
  active: boolean;
  values: Record<string, unknown>;
  overrides: Record<string, unknown>;
  provenance: {
    parameterFile?: string;
    activeGroup: string;
    groupName: string;
  };
};

/**
 * Resolved view over a Tau parameter file.
 *
 * @public
 */
export type TauParameters = {
  active: TauParameterGroup;
  groups: TauParameterGroup[];
  defaults: Record<string, unknown>;
};

/**
 * Options for resolving Tau parameter files into concrete test inputs.
 *
 * @public
 */
export type TauParameterOptions = {
  defaults?: Record<string, unknown>;
  parameterFile?: string;
};

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
  kernel?: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
  parameterSource?: TauParameterGroup;
}) => Promise<TauModelRendererOutput>;

/**
 * Options for rendering a Tau model through the active test runner.
 *
 * @public
 */
export type RenderTauModelOptions = {
  file: string;
  kernel?: string;
  format?: GeoSpecModelFormat;
  parameters?: Record<string, unknown>;
  parameterSource?: TauParameterGroup;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneValue = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return structuredClone(value);
};

const mergeParameters = (
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = cloneValue(defaults);
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : cloneValue(value);
  }
  return merged;
};

const parseParameterEntry = (entry: string | TauParameterFileEntry): TauParameterFileEntry => {
  if (typeof entry === 'string' && !entry.trimStart().startsWith('{')) {
    throw new Error('Invalid Tau parameter file input: pass parsed JSON or raw JSON text, not a filesystem path.');
  }

  const parsed: unknown = typeof entry === 'string' ? JSON.parse(entry) : entry;
  if (!isRecord(parsed) || typeof parsed['activeGroup'] !== 'string' || !isRecord(parsed['groups'])) {
    throw new Error('Invalid Tau parameter file: expected activeGroup and groups.');
  }
  for (const [name, group] of Object.entries(parsed['groups'])) {
    if (!isRecord(group) || !isRecord(group['values'])) {
      throw new Error(`Invalid Tau parameter file: group '${name}' must contain a values object.`);
    }
  }
  return parsed as TauParameterFileEntry;
};

const replaceExtension = (path: string, extension: string): string => {
  const lastSlash = path.lastIndexOf('/');
  const lastDot = path.lastIndexOf('.');
  if (lastDot > lastSlash) {
    return `${path.slice(0, lastDot)}.${extension}`;
  }
  return `${path}.${extension}`;
};

const groupNames = (entry: TauParameterFileEntry): string[] => {
  const ordered = entry.order ?? [
    entry.activeGroup,
    ...Object.keys(entry.groups).filter((name) => name !== entry.activeGroup),
  ];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...ordered, ...Object.keys(entry.groups)]) {
    if (seen.has(name) || entry.groups[name] === undefined) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
};

const isGeometrySubject = (value: unknown): value is GeometrySubject => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { kind?: unknown; mesh?: unknown };
  return candidate.kind === 'geometry-subject' && typeof candidate.mesh === 'object';
};

/**
 * Resolve a Tau parameter file into active and named parameter cases.
 *
 * @param entry - Parsed JSON import or raw JSON string from `.tau/parameters/<entry>.json`.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Concrete parameter groups for GeoSpec tests.
 * @public
 */
export function params(entry: TauParameterFileEntry | string, options: TauParameterOptions = {}): TauParameters {
  const parsed = parseParameterEntry(entry);
  const defaults = cloneValue(options.defaults ?? {});
  const groups = groupNames(parsed).map<TauParameterGroup>((name) => {
    const overrides = cloneValue(parsed.groups[name]?.values ?? {});
    return {
      name,
      active: name === parsed.activeGroup,
      values: mergeParameters(defaults, overrides),
      overrides,
      provenance: {
        ...(options.parameterFile ? { parameterFile: options.parameterFile } : {}),
        activeGroup: parsed.activeGroup,
        groupName: name,
      },
    };
  });

  const active = groups.find((group) => group.active);
  if (!active) {
    throw new Error(`Invalid Tau parameter file: active group '${parsed.activeGroup}' is missing.`);
  }

  return { active, groups, defaults: cloneValue(defaults) };
}

/**
 * Return merged values for the active Tau parameter group.
 *
 * @param entry - Parsed JSON import or raw JSON string from `.tau/parameters/<entry>.json`.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Merged active parameter values.
 * @public
 */
export function activeParams(
  entry: TauParameterFileEntry | string,
  options: TauParameterOptions = {},
): Record<string, unknown> {
  return params(entry, options).active.values;
}

/**
 * Return all resolved Tau parameter groups in stored order.
 *
 * @param entry - Parsed JSON import or raw JSON string from `.tau/parameters/<entry>.json`.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Concrete parameter groups for repeatable tests.
 * @public
 */
export function parameterGroups(
  entry: TauParameterFileEntry | string,
  options: TauParameterOptions = {},
): TauParameterGroup[] {
  return params(entry, options).groups;
}

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

  const parameters = options.parameters ?? options.parameterSource?.values;
  const format = options.format ?? 'glb';
  const rendered = await options.renderer({
    file: options.file,
    ...(options.kernel === undefined ? {} : { kernel: options.kernel }),
    format,
    ...(parameters === undefined ? {} : { parameters }),
    ...(options.parameterSource ? { parameterSource: options.parameterSource } : {}),
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
  const parameters = options.parameters ?? options.parameterSource?.values;
  const subject = await renderTauModel({ ...options, parameters });
  return {
    success: true,
    stats: subject.mesh.stats,
    subject,
  };
}

const tauGeoSpecBindingsGlobalKey = '__TAUCAD_GEOSPEC_BINDINGS__';
const tauTestingModuleSpecifier = '@taucad/testing/tau';

type TauGeoSpecBinding = {
  renderer: TauModelRenderer;
};

const tauGeoSpecBindingsGlobal = globalThis as typeof globalThis & {
  [tauGeoSpecBindingsGlobalKey]?: Map<string, TauGeoSpecBinding>;
};

const createTauGeoSpecRunToken = (): string =>
  `taucad-geospec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const ensureTauGeoSpecBindings = (): Map<string, TauGeoSpecBinding> => {
  const existing = tauGeoSpecBindingsGlobal[tauGeoSpecBindingsGlobalKey];
  if (existing) {
    return existing;
  }
  const bindings = new Map<string, TauGeoSpecBinding>();
  tauGeoSpecBindingsGlobal[tauGeoSpecBindingsGlobalKey] = bindings;
  return bindings;
};

const createTauTestingBuiltinCode = (runToken: string): string => `
const getTauGeoSpecBinding = () => {
  const binding = globalThis.${tauGeoSpecBindingsGlobalKey}?.get(${JSON.stringify(runToken)});
  if (!binding) {
    throw new Error('Tau GeoSpec renderer is not active for this runner.');
  }
  return binding;
};
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const cloneValue = (value) => value === undefined || value === null ? value : structuredClone(value);
const mergeParameters = (defaults, overrides) => {
  const merged = cloneValue(defaults);
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : cloneValue(value);
  }
  return merged;
};
const parseParameterEntry = (entry) => {
  if (typeof entry === 'string' && !entry.trimStart().startsWith('{')) {
    throw new Error('Invalid Tau parameter file input: pass parsed JSON or raw JSON text, not a filesystem path.');
  }
  const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
  if (!isRecord(parsed) || typeof parsed.activeGroup !== 'string' || !isRecord(parsed.groups)) {
    throw new Error('Invalid Tau parameter file: expected activeGroup and groups.');
  }
  for (const [name, group] of Object.entries(parsed.groups)) {
    if (!isRecord(group) || !isRecord(group.values)) {
      throw new Error(\`Invalid Tau parameter file: group '\${name}' must contain a values object.\`);
    }
  }
  return parsed;
};
const groupNames = (entry) => {
  const ordered = entry.order ?? [entry.activeGroup, ...Object.keys(entry.groups).filter((name) => name !== entry.activeGroup)];
  const seen = new Set();
  const names = [];
  for (const name of [...ordered, ...Object.keys(entry.groups)]) {
    if (seen.has(name) || entry.groups[name] === undefined) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
};
export const params = (entry, options = {}) => {
  const parsed = parseParameterEntry(entry);
  const defaults = cloneValue(options.defaults ?? {});
  const groups = groupNames(parsed).map((name) => {
    const overrides = cloneValue(parsed.groups[name]?.values ?? {});
    return {
      name,
      active: name === parsed.activeGroup,
      values: mergeParameters(defaults, overrides),
      overrides,
      provenance: {
        ...(options.parameterFile ? { parameterFile: options.parameterFile } : {}),
        activeGroup: parsed.activeGroup,
        groupName: name,
      },
    };
  });
  const active = groups.find((group) => group.active);
  if (!active) {
    throw new Error(\`Invalid Tau parameter file: active group '\${parsed.activeGroup}' is missing.\`);
  }
  return { active, groups, defaults: cloneValue(defaults) };
};
export const activeParams = (entry, options = {}) => params(entry, options).active.values;
export const parameterGroups = (entry, options = {}) => params(entry, options).groups;
export const renderTauModel = async (options) => {
  const renderer = getTauGeoSpecBinding().renderer;
  if (typeof renderer !== 'function') {
    throw new Error('renderTauModel() requires a Tau test renderer.');
  }
  const parameters = options.parameters ?? options.parameterSource?.values;
  return renderer({
    file: options.file,
    ...(options.kernel === undefined ? {} : { kernel: options.kernel }),
    ...(options.format === undefined ? {} : { format: options.format }),
    ...(parameters === undefined ? {} : { parameters }),
    ...(options.parameterSource === undefined ? {} : { parameterSource: options.parameterSource }),
  });
};
export const analyzeTauModel = async (options) => {
  const subject = await renderTauModel(options);
  return { success: true, subject, stats: subject.mesh.stats };
};
`;

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
  const runToken = createTauGeoSpecRunToken();
  const bindings = ensureTauGeoSpecBindings();
  bindings.set(runToken, {
    renderer: async (input) =>
      renderTauModel({
        file: input.file,
        kernel: input.kernel,
        format: input.format,
        parameters: input.parameters,
        parameterSource: input.parameterSource,
        renderer: options.renderer,
      }),
  });

  try {
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
            kernel: 'kernel' in input && typeof input.kernel === 'string' ? input.kernel : undefined,
            format: input.format,
            parameters: input.parameters,
            parameterSource: input.parameterSource,
            renderer: options.renderer,
          });
        },
        builtinModules: {
          [tauTestingModuleSpecifier]: {
            version: '0.0.0-tau-runner',
            code: createTauTestingBuiltinCode(runToken),
          },
        },
      });

      if (!result.success) {
        failures.push(
          geospecFailure({
            id: `${entry}:bundle`,
            requirement: `GeoSpec module ${entry} must bundle and execute`,
            targetFile: entry,
            reason: result.issues.map((issue) => issue.message).join('\n'),
            suggestion: 'Fix the GeoSpec syntax, imports, package imports mapping, or referenced project files.',
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
  } finally {
    bindings.delete(runToken);
    if (bindings.size === 0) {
      Reflect.deleteProperty(tauGeoSpecBindingsGlobal, tauGeoSpecBindingsGlobalKey);
    }
  }

  if (passes.length === 0 && failures.length === 0) {
    return {
      failures: [
        {
          id: 'no_matching_geospec_tests',
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
