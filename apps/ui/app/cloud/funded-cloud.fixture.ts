import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import type { CloudLoader } from '#cloud/cloud-loader.js';
import type { CloudSurfacesModule } from '#cloud/cloud-entries.js';

/**
 * A funded deployment for unit tests (adaptive app deployment mode W12): the one build shows the Cloud surfaces from
 * the API's answer, so a test of a funded surface sets the mode and hands `CloudSurface` the Cloud chunk already
 * loaded, as the build's lazy load leaves it.
 *
 *     vi.mock('#cloud/use-deployment-mode.js', async () => {
 *       const fixture = await import('#cloud/funded-cloud.fixture.js');
 *       return fixture.fundedModeModule();
 *     });
 */

/** The funded mode a test renders under. */
export const fundedTestMode: DeploymentModeSnapshot = {
  state: 'funded',
  basis: 'confirmed',
  environment: 'development',
};

/** A `#cloud/use-deployment-mode.js` stand-in that reads funded. */
export const fundedModeModule = (): Readonly<{
  useDeploymentMode: () => DeploymentModeSnapshot;
  useRetryDeploymentMode: () => () => void;
}> => ({
  useDeploymentMode: () => fundedTestMode,
  useRetryDeploymentMode: () => () => undefined,
});

/** A `#cloud/cloud-entries.js` stand-in whose loader holds the real Cloud chunk, loaded. */
export const loadedCloudEntries = async (): Promise<Readonly<{ cloudSurfaces: CloudLoader<CloudSurfacesModule> }>> => {
  // oxlint-disable-next-line tau-lint/no-cloud-import-outside-loader -- a test fixture stands in for the one loader.
  const module = await import('#cloud/cloud-surfaces.lazy.js');
  const state = { status: 'loaded', module } as const;
  return {
    cloudSurfaces: {
      state: () => state,
      load: () => undefined,
      preload: async () => undefined,
      retry: () => undefined,
      subscribe: () => () => undefined,
    },
  };
};
