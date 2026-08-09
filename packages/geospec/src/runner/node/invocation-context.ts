import { withGeoSpecBuildLock } from '#cache/build-lock.js';
import { GeoSpecModelLoadError, loadModel } from '#model/index.js';
import {
  createDefaultNodeRuntimeClient,
  requiresRuntimeSourceAdapter,
  runtimeKeyForModelLoad,
  sourceAdapterForModelLoad,
} from '#model/runtime.js';
import { createModelLoadCacheKey, readThreadedModelLoadCacheKey } from '#runner/model-load-cache.js';
import type { GeoSpecRuntimeKey, ModelRuntimeClientResult } from '#model/runtime.js';
import type {
  GeoSpecModelLoader,
  GeoSpecRuntimeClient,
  GeoSpecRuntimeSourceAdapter,
  LoadModelOptions,
} from '#model/types.js';
import type { GeometrySubject } from '#mesh/types.js';
import { forensicAsync } from '#runner/forensic.js';

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
 * Resolve the wall-clock budget for a single model load. A non-terminating
 * native geometry build or serialization (e.g. STEP export of an invalid or
 * oversized solid) runs in a worker thread that the cooperative abort channel
 * cannot interrupt, so without a bound it hangs the whole run. Override with
 * `GEOSPEC_MODEL_LOAD_TIMEOUT_MS`.
 *
 * @returns Budget in milliseconds.
 */
const resolveModelLoadBudget = (): number => {
  const raw = Number(process.env['GEOSPEC_MODEL_LOAD_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
};

/**
 * Build the error thrown when a model load exceeds its budget.
 *
 * @param file - Model file that timed out, when known.
 * @param budget - Elapsed budget in milliseconds.
 * @returns A load error carrying a `MODEL_LOAD_TIMEOUT` diagnostic.
 */
const modelLoadTimeoutError = (file: string | undefined, budget: number): GeoSpecModelLoadError =>
  new GeoSpecModelLoadError([
    {
      code: 'MODEL_LOAD_TIMEOUT',
      severity: 'error',
      message: `GeoSpec model load${file ? ` for ${file}` : ''} exceeded the ${budget} ms budget; the geometry worker was terminated (non-terminating native build or serialization).`,
      suggestion:
        'Bound or simplify the model geometry, or raise GEOSPEC_MODEL_LOAD_TIMEOUT_MS if a healthy heavy model legitimately needs longer.',
      details: { file, budget },
    },
  ]);

/**
 * Await a promise only to consume its settlement, ignoring any rejection. Keeps
 * a load that outlived the budget race from surfacing as an unhandled rejection
 * once its worker is terminated.
 *
 * @param promise - Promise whose rejection should be swallowed.
 */
const swallowRejection = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    // Intentionally ignored: the load lost the budget race and was abandoned.
  }
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
      // R2: runtime client creation was an unspanned part of the boot floor.
      const result = await forensicAsync(`load.runtime.create.${key}`, async () =>
        factory({
          key,
          projectPath,
          file,
          sourceAdapters,
        }),
      );
      if (!result.success) {
        throw new GeoSpecModelLoadError(result.diagnostics);
      }
      return result.runtime;
    })();
    runtimes.set(key, promise);
    return promise;
  };

  /**
   * Evict a runtime from the pool and terminate its worker thread. Termination
   * is thread-level, so it stops even a synchronous WASM call the cooperative
   * abort channel cannot reach. Safe when the runtime never finished connecting.
   *
   * @param key - Pool key of the runtime to drop.
   */
  const evictAndTerminate = async (key: GeoSpecRuntimeKey): Promise<void> => {
    const poisoned = runtimes.get(key);
    runtimes.delete(key);
    if (!poisoned) {
      return;
    }
    try {
      const runtime = await poisoned;
      runtime.terminate();
    } catch {
      // The pooled runtime never came up; there is nothing to terminate.
    }
  };

  /**
   * Race a pooled model load against the load budget. On timeout, evict and
   * terminate the poisoned runtime so the next load spins up a fresh one, then
   * throw so the offending test fails with a diagnostic instead of the run
   * hanging on a non-terminating native operation.
   *
   * @param key - Pool key of the runtime backing this load.
   * @param file - Model file being loaded, when known.
   * @param load - In-flight model load to bound.
   * @returns The loaded geometry subject.
   */
  const loadWithBudget = async (
    key: GeoSpecRuntimeKey,
    file: string | undefined,
    load: Promise<GeometrySubject>,
  ): Promise<GeometrySubject> => {
    void swallowRejection(load);
    const budget = resolveModelLoadBudget();
    const budgetError = modelLoadTimeoutError(file, budget);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loadTimeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(budgetError);
      }, budget);
    });
    try {
      return await Promise.race([load, loadTimeout]);
    } catch (error) {
      if (error === budgetError) {
        // Only the budget fired (not a load error): kill the hung worker and
        // drop it from the pool so the next load starts fresh.
        await evictAndTerminate(key);
      }
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
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
    const budgetedLoad = async (): Promise<GeometrySubject> =>
      loadWithBudget(
        key,
        input.file,
        loadModel({
          projectPath,
          ...input,
          ...(resolvedSourceAdapters ? { sourceAdapters: resolvedSourceAdapters } : {}),
          runtime: async () => runtimeForKey(key, input.file),
        } as LoadModelOptions),
      );
    // R14: serialize same-key builds across processes and pool workers so a
    // cold start pays one kernel build, not N. Lock-wait happens BEFORE the
    // budgeted load starts, so waiting can never trip MODEL_LOAD_TIMEOUT;
    // waiters then complete against the winner's warm geometry cache.
    // R10: the cached wrapper already canonicalized this load's key — reuse it
    // instead of re-serializing the include set.
    const buildLockKey = readThreadedModelLoadCacheKey(input) ?? createModelLoadCacheKey(input);
    return buildLockKey === undefined
      ? budgetedLoad()
      : withGeoSpecBuildLock({ projectPath, key: buildLockKey, run: budgetedLoad });
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
