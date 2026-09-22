/**
 * The model loader a project-relative host hands to its GeoSpec runner.
 *
 * Two things make it more than a call to `loadModel`. Paths arriving from an
 * authored test are agent-shaped, so they are normalized before the runtime
 * sees them; and a runtime that failed to boot fails *every* subsequent load,
 * so the first `RUNTIME_UNAVAILABLE` is latched and replayed instead of paying
 * a full boot timeout per test.
 *
 * A host whose runtime is discovered rather than supplied — the GeoSpec CLI and
 * the Tau daemon both let the engine create its own Node runtime — wants
 * `createModelLoader` from `geospec/model` instead.
 *
 * @module
 */

import { GeoSpecModelLoadError, loadModel } from 'geospec/model';
import type { GeoSpecModelLoader, GeoSpecRuntimeClient } from 'geospec/model';
import type { SourceRevision } from '@taucad/runtime';
import { assertRootedPath } from '@taucad/utils/path';

const isFatalRuntimeBootError = (error: unknown): boolean =>
  error instanceof GeoSpecModelLoadError &&
  error.diagnostics.some((diagnostic) => diagnostic.code === 'RUNTIME_UNAVAILABLE');

/** What {@link createProjectModelLoader} hands a host: one loader plus the per-run state it owns. @public */
export type ProjectModelLoader = {
  /** The loader to give the GeoSpec runner. */
  readonly modelLoader: GeoSpecModelLoader;
  /**
   * The source revision of every model loaded through the runtime since the last reset (R4).
   *
   * Pass it to `runGeoSpecTests` so the verdict names the sources it was computed from; a run
   * whose models all came from direct geometry reports none.
   */
  readonly sourceRevisions: () => readonly SourceRevision[];
  /** Drop the latched boot failure and the recorded revisions at a run boundary. */
  readonly resetFatalError: () => void;
};

/** Options for {@link createProjectModelLoader}. @public */
export type ProjectModelLoaderOptions = {
  /** The runtime every code and file load is exported through. */
  readonly runtime: GeoSpecRuntimeClient;
};

/**
 * Build a model loader bound to one runtime, rooted at the project.
 *
 * @param options - The runtime backing code and file loads.
 * @returns A loader plus the latch reset one run boundary needs.
 * @public
 *
 * @example <caption>Wiring a browser runner</caption>
 * ```typescript
 * import { createProjectModelLoader } from '@taucad/agent-tools/geospec';
 * import type { GeoSpecRuntimeClient } from 'geospec/model';
 * import { createGeoSpecWebRunner } from 'geospec/runner/web';
 * import type { GeoSpecWebRunnerOptions } from 'geospec/runner/web';
 *
 * declare const runtime: GeoSpecRuntimeClient;
 * declare const filesystem: GeoSpecWebRunnerOptions['filesystem'];
 *
 * const { modelLoader } = createProjectModelLoader({ runtime });
 * const runner = createGeoSpecWebRunner({ filesystem, modelLoader });
 * ```
 */
export const createProjectModelLoader = (options: ProjectModelLoaderOptions): ProjectModelLoader => {
  let fatalModelLoadError: Error | undefined;
  const revisions = new Map<string, SourceRevision>();

  /* R4/I5: every model this loader produces came out of one `runtime.export`, and that result
   * names the source it was computed from. Recording it here — rather than threading provenance
   * through GeoSpec's subject vocabulary — keeps the digests in the layer that owns the runtime.
   * A proxy, not a rebuilt object: `export` is generic, and the rest of the client is the host's. */
  const runtime = new Proxy(options.runtime, {
    get(target, property, receiver: unknown): unknown {
      if (property !== 'export') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return async (...args: Parameters<GeoSpecRuntimeClient['export']>) => {
        const result = await target.export(...args);
        if (result.sourceRevision) {
          revisions.set(result.sourceRevision.entry, result.sourceRevision);
        }
        return result;
      };
    },
  });

  const modelLoader: GeoSpecModelLoader = async (input) => {
    if (fatalModelLoadError) {
      throw fatalModelLoadError;
    }
    const load = async () => {
      if ('source' in input) {
        return loadModel(input);
      }
      if ('code' in input) {
        const code = Object.fromEntries(
          Object.entries(input.code).map(([file, content]) => [assertRootedPath(file), content]),
        );
        return loadModel({
          ...input,
          code,
          file: assertRootedPath(input.file),
          projectPath: '',
          runtime,
        });
      }
      return loadModel({ ...input, file: assertRootedPath(input.file), projectPath: '', runtime });
    };

    // A direct geometry source never touches the runtime, so it cannot latch.
    if ('source' in input) {
      return load();
    }
    try {
      return await load();
    } catch (error) {
      if (isFatalRuntimeBootError(error)) {
        fatalModelLoadError = error instanceof Error ? error : new Error(String(error));
      }
      throw error;
    }
  };

  return {
    modelLoader,
    sourceRevisions: () => [...revisions.values()],
    resetFatalError: () => {
      fatalModelLoadError = undefined;
      revisions.clear();
    },
  };
};
