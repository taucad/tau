import { GeoSpecModelLoadError, loadModel } from '#model/index.js';
import {
  createDefaultNodeRuntimeClient,
  requiresRuntimeSourceAdapter,
  runtimeKeyForModelLoad,
  sourceAdapterForModelLoad,
} from '#model/runtime.js';
import type { GeoSpecRuntimeKey, ModelRuntimeClientResult } from '#model/runtime.js';
import type {
  GeoSpecModelLoader,
  GeoSpecRuntimeClient,
  GeoSpecRuntimeSourceAdapter,
  LoadModelOptions,
} from '#model/types.js';

type RuntimeFactoryOptions = {
  key: GeoSpecRuntimeKey;
  projectPath: string;
  file?: string;
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
};

/**
 * Runtime creation counters used by tests and opt-in benchmark tooling.
 *
 * @internal
 */
export type GeoSpecNodeInvocationContextStats = {
  runtimeCreations: Record<string, number>;
};

/**
 * Options accepted by the internal Node CLI invocation context.
 *
 * @internal
 */
export type CreateGeoSpecNodeInvocationContextOptions = {
  projectPath: string;
  sourceAdapters?: readonly GeoSpecRuntimeSourceAdapter[];
  createRuntimeClient?: (options: RuntimeFactoryOptions) => Promise<ModelRuntimeClientResult>;
  stats?: GeoSpecNodeInvocationContextStats;
};

/**
 * Node CLI invocation context. This is intentionally scoped to one command
 * invocation, not a daemon or process-global cache.
 *
 * @internal
 */
export type GeoSpecNodeInvocationContext = {
  readonly modelLoader: GeoSpecModelLoader;
  dispose(): Promise<void>;
};

export const createGeoSpecNodeInvocationContextStats = (): GeoSpecNodeInvocationContextStats => ({
  runtimeCreations: {
    default: 0,
  },
});

const createRuntimeClientForKey = async (options: RuntimeFactoryOptions): Promise<ModelRuntimeClientResult> => {
  if (options.key === 'default') {
    return createDefaultNodeRuntimeClient(options.projectPath);
  }

  const adapter = sourceAdapterForModelLoad({
    file: options.file,
    sourceAdapters: options.sourceAdapters,
  });
  if (adapter && `source-adapter:${adapter.id}` === options.key) {
    try {
      return {
        success: true,
        runtime: await adapter.createRuntime({
          projectPath: options.projectPath,
          file: options.file,
        }),
      };
    } catch (error) {
      if (error instanceof GeoSpecModelLoadError) {
        return {
          success: false,
          diagnostics: [...error.diagnostics],
        };
      }
      return {
        success: false,
        diagnostics: [
          {
            code: 'RUNTIME_UNAVAILABLE',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
            suggestion: 'Check the source adapter runtime factory configured for this GeoSpec invocation.',
            details: error,
          },
        ],
      };
    }
  }

  return {
    success: false,
    diagnostics: [
      {
        code: 'GEOSPEC_RUNTIME_SOURCE_ADAPTER_UNAVAILABLE',
        severity: 'error',
        message: `GeoSpec model loading has no runtime source adapter for key ${options.key}.`,
        suggestion:
          'Provide a source adapter configured for this source format so GeoSpec can export geometry evidence.',
        details: {
          key: options.key,
          file: options.file,
        },
      },
    ],
  };
};

/**
 * Create an invocation-scoped Node runtime pool and bound model loader.
 *
 * @internal
 */
export const createGeoSpecNodeInvocationContext = (
  options: CreateGeoSpecNodeInvocationContextOptions,
): GeoSpecNodeInvocationContext => {
  const { createRuntimeClient, projectPath, sourceAdapters, stats } = options;
  const factory = createRuntimeClient ?? createRuntimeClientForKey;
  const runtimes = new Map<GeoSpecRuntimeKey, Promise<GeoSpecRuntimeClient>>();

  const runtimeForKey = async (key: GeoSpecRuntimeKey, file: string | undefined): Promise<GeoSpecRuntimeClient> => {
    const existing = runtimes.get(key);
    if (existing) {
      return existing;
    }

    if (stats) {
      stats.runtimeCreations[key] = (stats.runtimeCreations[key] ?? 0) + 1;
    }
    const promise = (async () => {
      const result = await factory({
        key,
        projectPath,
        file,
        sourceAdapters,
      });
      if (!result.success) {
        throw new GeoSpecModelLoadError(result.diagnostics);
      }
      return result.runtime;
    })();
    runtimes.set(key, promise);
    return promise;
  };

  const modelLoader: GeoSpecModelLoader = async (input: LoadModelOptions) => {
    if ('source' in input) {
      return loadModel(input);
    }
    const resolvedSourceAdapters = input.sourceAdapters ?? sourceAdapters;
    const sourceAdapter = sourceAdapterForModelLoad({ file: input.file, sourceAdapters: resolvedSourceAdapters });
    if (!sourceAdapter && requiresRuntimeSourceAdapter(input.file)) {
      return loadModel({
        projectPath,
        ...input,
        ...(resolvedSourceAdapters ? { sourceAdapters: resolvedSourceAdapters } : {}),
      } as LoadModelOptions);
    }
    const key = runtimeKeyForModelLoad({ file: input.file, sourceAdapters: resolvedSourceAdapters });
    return loadModel({
      projectPath,
      ...input,
      ...(resolvedSourceAdapters ? { sourceAdapters: resolvedSourceAdapters } : {}),
      runtime: async () => runtimeForKey(key, input.file),
    } as LoadModelOptions);
  };

  return {
    modelLoader,

    async dispose(): Promise<void> {
      const settled = await Promise.allSettled(runtimes.values());
      for (const result of settled) {
        if (result.status === 'fulfilled') {
          result.value.terminate();
        }
      }
      runtimes.clear();
    },
  };
};
