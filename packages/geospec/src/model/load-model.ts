import { loadMesh } from '#mesh/load-mesh.js';
import type {
  GeoSpecUnit,
  GeometryDiagnostic,
  GeometryExportIntent,
  GeometrySubject,
  MeshFileFormat,
} from '#mesh/types.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import { loadStep } from '#step/load-step.js';
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
import type { KernelPlugin } from '@taucad/runtime';

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

const isSourceOptions = (options: LoadModelOptions): options is LoadModelSourceOptions => 'source' in options;

const isCodeOptions = (options: LoadModelOptions): options is LoadModelCodeOptions => 'code' in options;

const meshFormats = new Set<GeoSpecModelFormat>(['glb', 'gltf', 'mesh-buffer']);
const stepFormats = new Set<GeoSpecModelFormat>(['step', 'stp']);
const openscadExtensions = new Set(['scad']);
const optionalOpenScadPackage = '@taucad/openscad';

const getFileExtension = (file: string | undefined): string | undefined => {
  const match = file?.toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1];
};

const requiresOpenScadRuntime = (options: { file?: string; kernel?: LoadModelCodeOptions['kernel'] }): boolean =>
  options.kernel === 'openscad' || openscadExtensions.has(getFileExtension(options.file) ?? '');

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

type OpenScadModule = {
  openscad?: unknown;
};

function resolveOpenScadFactory(module: OpenScadModule): () => KernelPlugin {
  if (typeof module.openscad !== 'function') {
    throw new TypeError('Expected @taucad/openscad to export an openscad() kernel factory.');
  }

  return module.openscad as () => KernelPlugin;
}

const resolveRuntime = async (options: {
  runtime?: GeoSpecRuntimeClient | (() => Promise<GeoSpecRuntimeClient>);
  projectPath?: string;
  file?: string;
  kernel?: LoadModelCodeOptions['kernel'];
}): Promise<{ runtime: GeoSpecRuntimeClient; ownsRuntime: boolean } | ModelLoadFailure> => {
  try {
    if (typeof options.runtime === 'function') {
      return { runtime: await options.runtime(), ownsRuntime: false };
    }
    if (options.runtime) {
      return { runtime: options.runtime, ownsRuntime: false };
    }

    const runtimeModule = await import('@taucad/runtime/node');
    if (requiresOpenScadRuntime({ file: options.file, kernel: options.kernel })) {
      try {
        const [{ presets }, { defineRuntime }, openScadModule] = await Promise.all([
          import('@taucad/runtime/presets'),
          import('@taucad/runtime/worker'),
          import(optionalOpenScadPackage) as Promise<OpenScadModule>,
        ]);
        const baseRuntime = presets.all();
        const openscad = resolveOpenScadFactory(openScadModule);
        const runtime = defineRuntime({
          ...baseRuntime,
          kernels: [openscad(), ...baseRuntime.kernels],
        });
        return {
          runtime: await runtimeModule.createNodeClient(options.projectPath, { runtime }),
          ownsRuntime: true,
        };
      } catch (error) {
        return {
          success: false,
          diagnostics: [
            {
              code: 'OPENSCAD_KERNEL_UNAVAILABLE',
              severity: 'error',
              message:
                'GeoSpec cannot load OpenSCAD models because the optional @taucad/openscad kernel is unavailable.',
              suggestion:
                'Install @taucad/openscad or pass a Tau runtime client configured with openscad() when testing .scad files.',
              details: error,
            },
          ],
        };
      }
    }

    return {
      runtime: await runtimeModule.createNodeClient(options.projectPath),
      ownsRuntime: true,
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'RUNTIME_UNAVAILABLE',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: options.runtime
            ? 'Check the runtime factory passed to geospec/model and retry with a working runtime client.'
            : 'Install @taucad/runtime or pass an explicit runtime client when using geospec/model outside the Tau Node runner.',
          details: error,
        },
      ],
    };
  }
};

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

const exportWithRuntime = async (
  options: LoadModelCodeOptions | LoadModelFileOptions,
): Promise<
  | {
      success: true;
      bytes: Uint8Array<ArrayBuffer>;
      name?: string;
      sourceUnit: GeoSpecUnit;
      exportIntent: GeometryExportIntent;
    }
  | ModelLoadFailure
> => {
  const runtimeResult = await resolveRuntime({
    runtime: options.runtime,
    projectPath: options.projectPath,
    file: options.file,
    kernel: isCodeOptions(options) ? options.kernel : undefined,
  });
  if ('success' in runtimeResult) {
    return runtimeResult;
  }

  const format = options.format ?? 'glb';
  try {
    await runtimeResult.runtime.connect?.();
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

  const exportIntent = resolveRuntimeExportIntent({
    runtime: runtimeResult.runtime,
    format,
    kernel: isCodeOptions(options) ? options.kernel : undefined,
  });
  if ('success' in exportIntent) {
    return exportIntent;
  }

  const parameters = getParameters(options);
  const exportOptions = exportIntent.options;
  const input = isCodeOptions(options)
    ? { code: options.code, file: options.file, parameters, ...exportOptions }
    : { file: options.file, parameters, ...exportOptions };

  try {
    const exported = await runtimeResult.runtime.export(format, input);
    if (!exported.success || !exported.data) {
      return {
        success: false,
        diagnostics: [
          {
            code: 'MODEL_EXPORT_FAILED',
            severity: 'error',
            message: 'Tau runtime did not produce geometry bytes for this model.',
            suggestion:
              'Check that the selected file exports top-level geometry and that the requested export format is supported.',
            details: exported.issues,
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
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'MODEL_EXPORT_FAILED',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          suggestion: 'Check model code, parameters, kernel availability, and runtime export support.',
        },
      ],
    };
  } finally {
    if (runtimeResult.ownsRuntime) {
      runtimeResult.runtime.terminate?.();
    }
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
    if (stepFormats.has(format)) {
      try {
        const subject = await loadStep({
          source: options.source as StepSource,
          unit: options.unit,
          parameters,
          path: options.path,
          name: options.name,
          openCascade: options.openCascade,
          streaming: options.stepStreaming,
          mesh: options.mesh,
          meshLinearTolerance: options.meshLinearTolerance,
          meshAngularToleranceDegrees: options.meshAngularToleranceDegrees,
        });
        return { success: true, subject, format };
      } catch (error) {
        return stepLoadFailure(error);
      }
    }
    const loaded = await loadMesh({
      source: options.source as Parameters<typeof loadMesh>[0]['source'],
      format: format as MeshFileFormat,
      path: options.path,
      name: options.name,
      unit: options.unit,
      parameters,
    });
    return loaded.success ? { success: true, subject: loaded.subject, format } : loaded;
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
    try {
      const subject = await loadStep({
        source: exported.bytes,
        unit: 'mm',
        parameters,
        name: exported.name ?? options.file,
        openCascade: options.openCascade,
        streaming: options.stepStreaming,
        mesh: options.mesh,
        meshLinearTolerance: options.meshLinearTolerance,
        meshAngularToleranceDegrees: options.meshAngularToleranceDegrees,
      });
      return {
        success: true,
        subject: {
          ...subject,
          provenance: {
            ...subject.provenance,
            exportIntent: exported.exportIntent,
          },
        },
        format,
      };
    } catch (error) {
      return stepLoadFailure(error);
    }
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
 * exported through the optional `@taucad/runtime` integration on this subpath.
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
      projectPath: 'projectPath' in options ? options.projectPath : defaults.projectPath,
    } as LoadModelOptions<Code>);
