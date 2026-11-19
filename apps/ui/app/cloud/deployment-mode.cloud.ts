import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import type { DeploymentOwnerFactory } from '#cloud/deployment-mode.adaptive.js';

/**
 * The `cloud` ceiling's display mode (adaptive app deployment mode charter D1, I10): pinned funded for the page's
 * life. No owner, no request; the billing environment stays the build's own configuration.
 */
export const initialDeploymentMode: DeploymentModeSnapshot = {
  state: 'funded',
  basis: 'pinned',
  environment: undefined,
};

/** A pinned build has no owner: the runtime keeps its no-op `deployment` child. */
export const createDeploymentOwner: DeploymentOwnerFactory | undefined = undefined;
