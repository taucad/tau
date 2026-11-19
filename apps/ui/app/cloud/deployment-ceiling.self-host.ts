import type { DeploymentCeiling } from '#cloud/deployment-mode.types.js';

/** The build's ceiling (adaptive app deployment mode charter D1, I12): selected by the alias rule like every boundary. */
export const deploymentCeiling: DeploymentCeiling = 'self-host';
