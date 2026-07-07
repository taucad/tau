import { loadMesh } from '#mesh/load-mesh.js';
import type {
  GeometryCapability,
  GeoSpecUnit,
  GeometryDiagnostic,
  GeometryExportIntent,
  GeometrySubject,
  MeshFileFormat,
  Vec3,
} from '#mesh/types.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import type { RuntimeBackedModelFormat } from '#model/export-intent.js';
import { resolveRuntimeForModelLoad } from '#model/runtime.js';
import { loadStep } from '#step/load-step.js';
import { forensicAsync } from '#runner/forensic.js';
import type { StepSource } from '#step/types.js';
import type {
  CreateModelLoaderOptions,
  GeoSpecModelFormat,
  GeoSpecModelLoader,
  GeoSpecRuntimeClient,
  LoadModelCodeOptions,
  LoadModelFileOptions,
  LoadModelOptions,
  LoadModelSourceOptions,
} from '#model/types.js';
import type { KernelIssue } from '@taucad/runtime/types';

type ModelLoadSuccess = {
  success: true;
  subject: GeometrySubject;
  format: GeoSpecModelFormat;
};

type ModelLoadFailure = {
  success: false;
  diagnostics: GeometryDiagnostic[];
};

type ModelLoadResult = ModelLoadSuccess | ModelLoadFailure;

type RuntimeBackedLoadOptions = LoadModelCodeOptions | LoadModelFileOptions;

type RuntimeExportSuccess = {
  success: true;
  bytes: Uint8Array<ArrayBuffer>;
  name?: string;
  sourceUnit: GeoSpecUnit;
  exportIntent: GeometryExportIntent;
  diagnostics: GeometryDiagnostic[];
};

type RuntimeExportBundle = RuntimeExportSuccess & {
  meshSupplement?: RuntimeExportSuccess;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isSourceOptions = (options: LoadModelOptions): options is LoadModelSourceOptions => 'source' in options;

const isCodeOptions = (options: LoadModelOptions): options is LoadModelCodeOptions => 'code' in options;

const meshFormats = new Set<GeoSpecModelFormat>(['glb', 'gltf', 'mesh-buffer']);
const stepFormats = new Set<GeoSpecModelFormat>(['step', 'stp']);

const unsupportedFormat = (format: GeoSpecModelFormat): ModelLoadFailure => ({
  success: false,
  diagnostics: [
    {
      code: 'UNSUPPORTED_MODEL_FORMAT',
      severity: 'error',
      message: `GeoSpec model loading does not yet support ${format} evidence in this slice.`,
      suggestion: 'Use GLB/glTF mesh output or STEP/BRep evidence supported by geospec/step.',
    },
  ],
});

const stepLoadFailure = (error: unknown): ModelLoadFailure => ({
  success: false,
  diagnostics: [
    {
      code: 'STEP_LOAD_FAILED',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      suggestion: 'Check that the STEP bytes are valid and that the configured STEP loader can parse this source.',
    },
  ],
});

const getParameters = (options: LoadModelOptions): Record<string, unknown> | undefined =>
  options.parameters ?? ('parameterSource' in options ? options.parameterSource?.values : undefined);

const forbiddenRuntimeBackedOptionKeys = ['unit', 'sourceUnit', 'scale', 'coordinateSystem'] as const;

const validateRuntimeBackedOptions = (
  options: LoadModelCodeOptions | LoadModelFileOptions,
): ModelLoadFailure | undefined => {
  const optionRecord = options as Record<string, unknown>;
  const forbidden = forbiddenRuntimeBackedOptionKeys.filter((key) => key in optionRecord);
  if (forbidden.length === 0) {
    return undefined;
  }

  return {
    success: false,
    diagnostics: [
      {
        code: 'GEOSPEC_INVALID_LOAD_MODEL_OPTIONS',
        severity: 'error',
        message:
          'Runtime-backed GeoSpec model loads do not accept unit, sourceUnit, scale, or coordinateSystem options.',
        suggestion:
          'Use loadModel({ file }) for CAD project tests. Use loadModel({ source }) or geospec/mesh for raw geometry files that need explicit unit metadata.',
        details: {
          forbidden,
        },
      },
    ],
  };
};

const runtimeExportFailureSuggestion =
  'Inspect the runtime export diagnostics, kernel import/export support, and model code identified by those diagnostics.';

const errorDetails = (error: unknown): unknown =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
      }
    : error;

const vec3FromUnknown = (value: unknown): Vec3 | undefined => {
  if (
    !Array.isArray(value) ||
    value.length < 3 ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number' ||
    typeof value[2] !== 'number'
  ) {
    return undefined;
  }
  return [value[0], value[1], value[2]];
};

const runtimeIssueGeometryDetails = (issue: KernelIssue): Record<string, unknown> | undefined => {
  if (!isRecord(issue.details)) {
    return undefined;
  }
  return isRecord(issue.details['geometry']) ? issue.details['geometry'] : undefined;
};

const runtimeIssueSpatial = (issue: KernelIssue): GeometryDiagnostic['spatial'] | undefined => {
  const geometry = runtimeIssueGeometryDetails(issue);
  if (!geometry || !isRecord(geometry['topology'])) {
    return undefined;
  }
  const { topology } = geometry;
  if (!isRecord(topology['aabb'])) {
    return undefined;
  }
  const { min, max, center } = topology['aabb'];
  const minVector = vec3FromUnknown(min);
  const maxVector = vec3FromUnknown(max);
  const centerVector = vec3FromUnknown(center);
  if (minVector && maxVector && centerVector) {
    return {
      min: minVector,
      max: maxVector,
      center: centerVector,
    };
  }
  return undefined;
};

const runtimeIssueFacet = (issue: KernelIssue): Record<string, unknown> | undefined => {
  const geometry = runtimeIssueGeometryDetails(issue);
  if (issue.code === 'GEOMETRY_INVALID') {
    return {
      kind: 'source-validity',
      valid: false,
      partName: typeof geometry?.['partName'] === 'string' ? geometry['partName'] : undefined,
      partIndex: typeof geometry?.['partIndex'] === 'number' ? geometry['partIndex'] : undefined,
      topology: geometry?.['topology'],
      hints: geometry?.['hints'],
    };
  }
  return undefined;
};

const runtimeIssueDiagnostics = (options: {
  issues: readonly KernelIssue[] | undefined;
  file?: string;
  format: GeoSpecModelFormat;
}): GeometryDiagnostic[] =>
  (options.issues ?? []).map((issue, issueIndex) => {
    const spatial = runtimeIssueSpatial(issue);
    const facet = runtimeIssueFacet(issue);
    return {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      suggestion: runtimeExportFailureSuggestion,
      ...(spatial ? { spatial } : {}),
      details: {
        file: options.file,
        format: options.format,
        issueIndex,
        ...(facet ? { facet } : {}),
        issue,
      },
    };
  });

const buildRuntimeExportInput = (options: {
  loadOptions: RuntimeBackedLoadOptions;
  parameters: Record<string, unknown> | undefined;
  exportOptions: Record<string, unknown>;
}) =>
  isCodeOptions(options.loadOptions)
    ? {
        source: { files: options.loadOptions.code, entry: options.loadOptions.file },
        parameters: options.parameters,
        exportOptions: options.exportOptions,
      }
    : {
        source: { path: options.loadOptions.file },
        parameters: options.parameters,
        exportOptions: options.exportOptions,
      };

const exportRuntimeFormat = async (options: {
  runtime: GeoSpecRuntimeClient;
  loadOptions: RuntimeBackedLoadOptions;
  format: RuntimeBackedModelFormat;
}): Promise<RuntimeExportSuccess | ModelLoadFailure> => {
  const exportIntent = resolveRuntimeExportIntent({
    runtime: options.runtime,
    format: options.format,
  });
  if ('success' in exportIntent) {
    return exportIntent;
  }

  const parameters = getParameters(options.loadOptions);
  const input = buildRuntimeExportInput({
    loadOptions: options.loadOptions,
    parameters,
    exportOptions: exportIntent.options,
  });

  try {
    const exported = await forensicAsync('load.kernel.export', async () =>
      options.runtime.export(options.format, input),
    );
    if (!exported.success) {
      return {
        success: false,
        diagnostics: [
          {
            code: 'MODEL_EXPORT_FAILED',
            severity: 'error',
            message: 'Tau runtime did not produce geometry bytes for this model.',
            suggestion: runtimeExportFailureSuggestion,
            details: {
              file: options.loadOptions.file,
              format: options.format,
              issues: exported.issues,
            },
          },
        ],
      };
    }
    return {
      success: true,
      bytes: exported.data.bytes,
      name: exported.data.name,
      sourceUnit: exportIntent.sourceUnit,
      exportIntent: exportIntent.provenance,
      diagnostics: runtimeIssueDiagnostics({
        issues: exported.issues,
        file: options.loadOptions.file,
        format: options.format,
      }),
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'MODEL_EXPORT_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: runtimeExportFailureSuggestion,
          details: {
            file: options.loadOptions.file,
            format: options.format,
            error: errorDetails(error),
          },
        },
      ],
    };
  }
};

const exportWithRuntime = async (
  options: LoadModelCodeOptions | LoadModelFileOptions,
): Promise<RuntimeExportBundle | ModelLoadFailure> => {
  const runtimeResult = await resolveRuntimeForModelLoad({
    runtime: options.runtime,
    sourceAdapters: options.sourceAdapters,
    projectPath: options.projectPath,
    file: options.file,
  });
  if (!runtimeResult.success) {
    return runtimeResult;
  }

  const format = options.format ?? 'glb';
  if (format === 'mesh-buffer') {
    return unsupportedFormat(format);
  }
  const runtimeFormat = format satisfies RuntimeBackedModelFormat;
  try {
    await runtimeResult.runtime.connect();
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'RUNTIME_UNAVAILABLE',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: 'Check that the Tau runtime client can connect before GeoSpec requests export route metadata.',
          details: error,
        },
      ],
    };
  }

  const exported = await exportRuntimeFormat({
    runtime: runtimeResult.runtime,
    loadOptions: options,
    format: runtimeFormat,
  });
  if (!exported.success) {
    if (runtimeResult.ownsRuntime) {
      runtimeResult.runtime.terminate();
    }
    return exported;
  }

  try {
    if (!stepFormats.has(runtimeFormat) || options.mesh === false) {
      return exported;
    }

    const meshSupplement = await exportRuntimeFormat({
      runtime: runtimeResult.runtime,
      loadOptions: options,
      format: 'glb',
    });
    if (!meshSupplement.success) {
      return meshSupplement;
    }

    return {
      ...exported,
      meshSupplement,
    };
  } finally {
    if (runtimeResult.ownsRuntime) {
      runtimeResult.runtime.terminate();
    }
  }
};

const capabilityKey = (capability: GeometryCapability): string => `${capability.kind}:${capability.feature}`;

const mergeCapabilities = (
  left: readonly GeometryCapability[],
  right: readonly GeometryCapability[],
): GeometryCapability[] => {
  const merged = new Map<string, GeometryCapability>();
  for (const capability of [...left, ...right]) {
    merged.set(capabilityKey(capability), capability);
  }
  return [...merged.values()];
};

const loadRuntimeStepMeshSupplement = async (options: {
  exported: RuntimeExportBundle;
  parameters: Record<string, unknown> | undefined;
  fallbackName: string;
}): Promise<GeometrySubject | ModelLoadFailure> => {
  const { meshSupplement } = options.exported;
  if (!meshSupplement) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_RUNTIME_STEP_MESH_SUPPLEMENT_MISSING',
          severity: 'error',
          message: 'Runtime-backed STEP model loading did not produce the required named mesh evidence.',
          suggestion:
            'Use loadModel({ format: "step", mesh: false }) for BRep-only checks, or use a runtime that supports canonical GLB mesh export for overlap diagnostics.',
        },
      ],
    };
  }

  const loaded = await loadMesh({
    source: meshSupplement.bytes,
    format: 'glb',
    name: meshSupplement.name ?? options.fallbackName,
    unit: 'mm',
    sourceUnit: meshSupplement.sourceUnit,
    parameters: options.parameters,
  });
  return loaded.success ? loaded.subject : loaded;
};

const loadSourceModelResult = async (options: {
  loadOptions: LoadModelSourceOptions;
  format: GeoSpecModelFormat;
  parameters: Record<string, unknown> | undefined;
}): Promise<ModelLoadResult> => {
  if (stepFormats.has(options.format)) {
    try {
      const subject = await loadStep({
        source: options.loadOptions.source as StepSource,
        unit: options.loadOptions.unit,
        parameters: options.parameters,
        path: options.loadOptions.path,
        name: options.loadOptions.name,
        nativeStepBackend: options.loadOptions.nativeStepBackend,
        openCascade: options.loadOptions.openCascade,
        streaming: options.loadOptions.stepStreaming,
        mesh: options.loadOptions.mesh,
        meshLinearTolerance: options.loadOptions.meshLinearTolerance,
        meshAngularToleranceDegrees: options.loadOptions.meshAngularToleranceDegrees,
      });
      return { success: true, subject, format: options.format };
    } catch (error) {
      return stepLoadFailure(error);
    }
  }

  const loaded = await loadMesh({
    source: options.loadOptions.source as Parameters<typeof loadMesh>[0]['source'],
    format: options.format as MeshFileFormat,
    path: options.loadOptions.path,
    name: options.loadOptions.name,
    unit: options.loadOptions.unit,
    parameters: options.parameters,
  });
  return loaded.success ? { success: true, subject: loaded.subject, format: options.format } : loaded;
};

const loadRuntimeStepModelResult = async (options: {
  loadOptions: RuntimeBackedLoadOptions;
  exported: RuntimeExportBundle;
  parameters: Record<string, unknown> | undefined;
  format: GeoSpecModelFormat;
}): Promise<ModelLoadResult> => {
  try {
    const meshSupplementSubject =
      options.exported.meshSupplement && options.loadOptions.mesh !== false
        ? await loadRuntimeStepMeshSupplement({
            exported: options.exported,
            parameters: options.parameters,
            fallbackName: options.exported.name ?? options.loadOptions.file,
          })
        : undefined;
    if (meshSupplementSubject && 'success' in meshSupplementSubject) {
      return meshSupplementSubject;
    }
    const subject = await loadStep({
      source: options.exported.bytes,
      unit: 'mm',
      parameters: options.parameters,
      name: options.exported.name ?? options.loadOptions.file,
      nativeStepBackend: options.loadOptions.nativeStepBackend,
      openCascade: options.loadOptions.openCascade,
      streaming: options.loadOptions.stepStreaming,
      mesh: meshSupplementSubject ? false : options.loadOptions.mesh,
      meshLinearTolerance: options.loadOptions.meshLinearTolerance,
      meshAngularToleranceDegrees: options.loadOptions.meshAngularToleranceDegrees,
    });
    return {
      success: true,
      subject: {
        ...subject,
        ...(meshSupplementSubject
          ? {
              mesh: meshSupplementSubject.mesh,
              capabilities: mergeCapabilities(subject.capabilities, meshSupplementSubject.capabilities),
            }
          : {}),
        diagnostics: [
          ...subject.diagnostics,
          ...options.exported.diagnostics,
          ...(options.exported.meshSupplement?.diagnostics ?? []),
        ],
        provenance: {
          ...subject.provenance,
          exportIntent: options.exported.exportIntent,
        },
      },
      format: options.format,
    };
  } catch (error) {
    return stepLoadFailure(error);
  }
};

const loadModelResult = async <Code extends Record<string, string> = Record<string, string>>(
  options: LoadModelOptions<Code>,
): Promise<ModelLoadResult> => {
  const format = options.format ?? 'glb';
  if (!meshFormats.has(format) && !stepFormats.has(format)) {
    return unsupportedFormat(format);
  }

  const parameters = getParameters(options);
  if (isSourceOptions(options)) {
    return loadSourceModelResult({
      loadOptions: options,
      format,
      parameters,
    });
  }

  const invalidOptions = validateRuntimeBackedOptions(options);
  if (invalidOptions) {
    return invalidOptions;
  }

  const exported = await exportWithRuntime(options);
  if (!exported.success) {
    return exported;
  }

  if (stepFormats.has(format)) {
    return loadRuntimeStepModelResult({
      loadOptions: options,
      exported,
      parameters,
      format,
    });
  }

  const loaded = await loadMesh({
    source: exported.bytes,
    format: format as MeshFileFormat,
    name: exported.name ?? options.file,
    unit: 'mm',
    sourceUnit: exported.sourceUnit,
    parameters,
  });
  return loaded.success
    ? {
        success: true,
        subject: {
          ...loaded.subject,
          diagnostics: [...loaded.subject.diagnostics, ...exported.diagnostics],
          provenance: {
            ...loaded.subject.provenance,
            exportIntent: exported.exportIntent,
          },
        },
        format,
      }
    : loaded;
};

/**
 * Load a CAD model into GeoSpec evidence.
 *
 * Direct geometry sources are parsed immediately. Code and project files are
 * exported through the required `@taucad/runtime` integration on this subpath.
 *
 * @param options - Source, code, or file model load options.
 * @returns A GeoSpec geometry subject ready for `expectGeo`.
 * @throws {@link GeoSpecModelLoadError} when the model cannot be exported or parsed.
 * @public
 */
export async function loadModel<Code extends Record<string, string> = Record<string, string>>(
  options: LoadModelOptions<Code>,
): Promise<GeometrySubject> {
  const result = await loadModelResult(options);
  if (!result.success) {
    throw new GeoSpecModelLoadError(result.diagnostics);
  }
  return result.subject;
}

/**
 * Create a {@link loadModel} function with shared defaults.
 *
 * @param defaults - Model loading defaults.
 * @returns A configured model loader.
 * @public
 */
export const createModelLoader =
  (defaults: CreateModelLoaderOptions = {}): GeoSpecModelLoader =>
  async <Code extends Record<string, string> = Record<string, string>>(
    options: LoadModelOptions<Code>,
  ): Promise<GeometrySubject> =>
    loadModel({
      ...defaults,
      ...options,
      runtime: 'runtime' in options ? options.runtime : defaults.runtime,
      sourceAdapters: 'sourceAdapters' in options ? options.sourceAdapters : defaults.sourceAdapters,
      projectPath: 'projectPath' in options ? options.projectPath : defaults.projectPath,
      nativeStepBackend: 'nativeStepBackend' in options ? options.nativeStepBackend : defaults.nativeStepBackend,
    } as LoadModelOptions<Code>);
