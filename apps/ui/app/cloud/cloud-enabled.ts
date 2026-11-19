import { deploymentCeiling } from '#cloud/deployment-ceiling.js';

/**
 * Whether this build is pinned to Tau Cloud (the `cloud` ceiling, adaptive app deployment mode D1). An adaptive build
 * reads `false` here until its readers move to the display mode (W4, W5), so it behaves as `self-host` meanwhile.
 */
export const tauCloudEnabled = deploymentCeiling === 'cloud';
