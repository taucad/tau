import type { GeoSpecRuntimeClient } from 'geospec/model';

/**
 * Refuse the Node-only default when a browser caller omits runtime injection.
 *
 * @param _projectPath - The project root, unused because no default browser runtime exists.
 * @returns A rejection directing the caller to provide a runtime or source adapter.
 */
export const createDefaultRuntimeClient = async (_projectPath: string | undefined): Promise<GeoSpecRuntimeClient> => {
  throw new Error('GeoSpec cannot create a default runtime in a browser. Provide a runtime or source adapter.');
};
