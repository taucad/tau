import { useDeploymentMode } from '#cloud/use-deployment-mode.js';

/**
 * Whether the display mode allows the Cloud renderings: `funded` (adaptive app deployment mode charter, the surface
 * table). Part of Core.
 *
 * @returns Whether the mode is `funded`.
 * @public
 */
export const useCloudFunded = (): boolean => useDeploymentMode().state === 'funded';
