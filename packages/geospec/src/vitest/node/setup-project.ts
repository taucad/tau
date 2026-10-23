/** Vitest wiring for a GeoSpec project on Node: engine, model loader and matchers from one call. @module */

import { afterAll, vi } from 'vitest';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/client.js';
import { loadGeoSpecConfig } from '#config/node/load.js';
import type { GeoSpecConfig } from '#config/types.js';
import { createModelLoader } from '#model/load-model.js';
import type { GeoSpecSubject } from '#model/subject.js';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import type { LoadModelOptions } from '#model/types.js';
import { createNodeGeoSpecEngine } from '#runner/node/engine.js';
import type { GeoSpecEngineBinding } from '#runner/node/engine.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { installGeoSpecVitest } from '#vitest/adapter.js';
import type { GeoSpecVitestAdapter } from '#vitest/adapter.js';

/**
 * Options for {@link setupGeoSpecVitestProject}. The work-unit maximum stays the host default, because the model
 * loader and the matchers must enforce the same one. @public
 */
export type SetupGeoSpecVitestProjectOptions = Omit<
  GeoSpecAssertionClientOptions,
  'engine' | 'maximumWorkUnitLimit'
> & {
  /** Absolute project root: `loadModel({ file })` resolves against it and its `geospec.config.*` is read. */
  readonly projectPath: string;
  /** Explicit config file, resolved relative to the project unless absolute. */
  readonly configPath?: string;
  /** Fields that replace the config's whole, as a CLI flag does: `exporters` and `testTimeout` apply here. */
  readonly overrides?: Pick<GeoSpecConfig, 'exporters' | 'testTimeout'>;
  /**
   * A caller-owned engine, kept open after the file. Omitted creates this process's engine (the native addon, else
   * the WASM build) and closes it after the file.
   */
  readonly engine?: GeoSpecNativeModelEngine;
};

/** The installed matchers plus the project's model loader. @public */
export type GeoSpecVitestProject = GeoSpecVitestAdapter & {
  /** Load a model through the config's exporters; its subjects are released after the file. */
  readonly loadModel: (options: LoadModelOptions) => Promise<GeoSpecSubject>;
  /** The config file that was read, when the project has one. */
  readonly configPath: string | undefined;
  /** The build the created engine runs on; absent for a caller-owned engine. */
  readonly binding: GeoSpecEngineBinding | undefined;
};

/**
 * Configure GeoSpec for the active Vitest file from the project's `geospec.config.*`: the same file the `geospec`
 * CLI and `tau test` read. Its `exporters` load models and its `testTimeout` becomes this file's Vitest test
 * timeout; Vitest's own config owns discovery, so `include`, `exclude`, `testNamePattern` and `bail` do not apply.
 * The config is trusted code and runs in this process, as it does for the CLI.
 *
 * Call it at the top level of a test file or a setup file and await it. Subjects are released, and an engine this
 * call created is closed, after the file's tests.
 *
 * @param options - Project root, config file, overrides and assertion-client options.
 * @returns The installed matchers and a `loadModel` over the config's exporters.
 * @public
 *
 * @example <caption>A Vitest file over a project with a geospec.config.ts</caption>
 * ```typescript
 * import { expect, it } from 'vitest';
 * import { setupGeoSpecVitestProject } from 'geospec/vitest/node';
 *
 * const geo = await setupGeoSpecVitestProject({ projectPath: import.meta.dirname });
 *
 * it('has the intended volume', async () => {
 *   await expect(await geo.loadModel({ file: 'part.step' })).toHaveVolume({ value: 1000, tolerance: 1 });
 * });
 * ```
 */
export const setupGeoSpecVitestProject = async (
  options: SetupGeoSpecVitestProjectOptions,
): Promise<GeoSpecVitestProject> => {
  const { projectPath, configPath, overrides, engine: ownedEngine, ...clientOptions } = options;
  const config = await loadGeoSpecConfig({
    projectPath,
    ...(configPath === undefined ? {} : { configPath }),
    ...(overrides === undefined ? {} : { overrides }),
  });
  const created = ownedEngine === undefined ? await createNodeGeoSpecEngine() : undefined;
  const engine = ownedEngine ?? created!.engine;
  try {
    const filesystem = createNodeVmFileSystem(projectPath);
    const loader = createModelLoader({
      engine,
      projectPath,
      ...(config.options.exporters === undefined ? {} : { exporters: config.options.exporters }),
      readSource: async (source) => {
        if (typeof source !== 'string') {
          throw new TypeError('GeoSpec Vitest file sources must be project-rooted paths.');
        }
        return filesystem.readFile(source);
      },
    });
    const adapter = installGeoSpecVitest(createGeoSpecAssertionClient({ ...clientOptions, engine }));
    if (config.options.testTimeout !== undefined) {
      vi.setConfig({ testTimeout: config.options.testTimeout });
    }
    afterAll(async () => {
      try {
        await loader.dispose();
      } finally {
        created?.engine.close();
      }
    });
    return { ...adapter, loadModel: loader, configPath: config.configPath, binding: created?.binding };
  } catch (error) {
    created?.engine.close();
    throw error;
  }
};
