import type { GeoSpecRuntimeClient } from 'geospec/model';

/**
 * Create the default Node runtime client for a runtime-backed model load.
 *
 * @param projectPath - The project root for the Node runtime.
 * @returns The client owned by the model loader.
 */
export const createDefaultRuntimeClient = async (projectPath: string | undefined): Promise<GeoSpecRuntimeClient> => {
  const [{ createNodeClient }, { defaultRuntime }] = await Promise.all([
    import('@taucad/runtime/node'),
    import('#model/default-runtime.js'),
  ]);
  return createNodeClient({ runtime: defaultRuntime, projectPath });
};
