import type { GeometryDiagnostic } from '#mesh/types.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { GeoSpecRuntimeClient, GeoSpecRuntimeClientFactory, GeoSpecRuntimeSourceAdapter } from '#model/types.js';
import { createNodeClient } from '@taucad/runtime/node';

/**
 * Runtime pool key used by the Node CLI invocation context.
 *
 * @internal
 */
export type GeoSpecRuntimeKey = 'default' | `source-adapter:${string}`;

type ModelRuntimeFailure = {
  success: false;
  diagnostics: GeometryDiagnostic[];
};

type ModelRuntimeClientSuccess = {
  success: true;
  runtime: GeoSpecRuntimeClient;
};

type ModelRuntimeResolutionSuccess = ModelRuntimeClientSuccess & {
  ownsRuntime: boolean;
};

export type ModelRuntimeClientResult = ModelRuntimeClientSuccess | ModelRuntimeFailure;

export type ModelRuntimeResolution = ModelRuntimeResolutionSuccess | ModelRuntimeFailure;

const defaultRuntimeExtensions = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx']);

export const getFileExtension = (file: string | undefined): string | undefined => {
  const match = file?.toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1];
};

const normaliseExtension = (extension: string): string => extension.replace(/^\./u, '').toLowerCase();

export const sourceAdapterForModelLoad = (options: {
  file?: string;
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
}): GeoSpecRuntimeSourceAdapter | undefined => {
  const extension = getFileExtension(options.file);
  if (!extension) {
    return undefined;
  }

  return options.sourceAdapters?.find((adapter) =>
    adapter.extensions.some((adapterExtension) => normaliseExtension(adapterExtension) === extension),
  );
};

export const requiresRuntimeSourceAdapter = (file: string | undefined): boolean => {
  const extension = getFileExtension(file);
  return extension !== undefined && !defaultRuntimeExtensions.has(extension);
};

/**
 * Select the Node invocation runtime pool key for a runtime-backed load.
 *
 * @internal
 */
export const runtimeKeyForModelLoad = (options: {
  file?: string;
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
}): GeoSpecRuntimeKey => {
  const adapter = sourceAdapterForModelLoad(options);
  return adapter ? `source-adapter:${adapter.id}` : 'default';
};

const runtimeUnavailableFailure = (options: { error: unknown; explicitRuntime: boolean }): ModelRuntimeFailure => ({
  success: false,
  diagnostics: [
    {
      code: 'RUNTIME_UNAVAILABLE',
      severity: 'error',
      message: options.error instanceof Error ? options.error.message : String(options.error),
      suggestion: options.explicitRuntime
        ? 'Check the runtime factory passed to geospec/model and retry with a working runtime client.'
        : 'Check the Tau runtime dependency and runtime factory configuration for this GeoSpec invocation.',
      details: options.error,
    },
  ],
});

const sourceAdapterUnavailableFailure = (options: { file?: string }): ModelRuntimeFailure => {
  const extension = getFileExtension(options.file);
  return {
    success: false,
    diagnostics: [
      {
        code: 'GEOSPEC_RUNTIME_SOURCE_ADAPTER_UNAVAILABLE',
        severity: 'error',
        message: extension
          ? `GeoSpec model loading has no runtime source adapter for .${extension} files.`
          : 'GeoSpec model loading could not infer a runtime source adapter for this file.',
        suggestion:
          'Provide a Tau runtime client or a source adapter configured for this source format so GeoSpec can export geometry evidence.',
        details: {
          file: options.file,
          extension,
        },
      },
    ],
  };
};

/**
 * Create a default Tau Node runtime client for one CLI invocation.
 *
 * @internal
 */
export const createDefaultNodeRuntimeClient = async (
  projectPath: string | undefined,
): Promise<ModelRuntimeClientResult> => {
  try {
    return {
      success: true,
      runtime: (await createNodeClient(projectPath)) as GeoSpecRuntimeClient,
    };
  } catch (error) {
    return runtimeUnavailableFailure({ error, explicitRuntime: false });
  }
};

const resolveExplicitRuntime = async (options: {
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
}): Promise<ModelRuntimeResolution | undefined> => {
  try {
    if (typeof options.runtime === 'function') {
      return { success: true, runtime: await options.runtime(), ownsRuntime: false };
    }
    if (options.runtime) {
      return { success: true, runtime: options.runtime, ownsRuntime: false };
    }
    return undefined;
  } catch (error) {
    if (error instanceof GeoSpecModelLoadError) {
      return {
        success: false,
        diagnostics: [...error.diagnostics],
      };
    }
    return runtimeUnavailableFailure({ error, explicitRuntime: true });
  }
};

/**
 * Resolve the runtime used by standalone `loadModel()` calls.
 *
 * @internal
 */
export const resolveRuntimeForModelLoad = async (options: {
  runtime?: GeoSpecRuntimeClient | GeoSpecRuntimeClientFactory;
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
  projectPath?: string;
  file?: string;
}): Promise<ModelRuntimeResolution> => {
  const explicit = await resolveExplicitRuntime({ runtime: options.runtime });
  if (explicit) {
    return explicit;
  }

  const adapter = sourceAdapterForModelLoad(options);
  if (adapter) {
    try {
      return {
        success: true,
        runtime: await adapter.createRuntime({ projectPath: options.projectPath, file: options.file }),
        ownsRuntime: true,
      };
    } catch (error) {
      if (error instanceof GeoSpecModelLoadError) {
        return {
          success: false,
          diagnostics: [...error.diagnostics],
        };
      }
      return runtimeUnavailableFailure({ error, explicitRuntime: true });
    }
  }

  if (requiresRuntimeSourceAdapter(options.file)) {
    return sourceAdapterUnavailableFailure({ file: options.file });
  }

  const created = await createDefaultNodeRuntimeClient(options.projectPath);
  return created.success ? { ...created, ownsRuntime: true } : created;
};
