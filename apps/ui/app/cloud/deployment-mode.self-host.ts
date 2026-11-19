import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import type { DeploymentOwnerFactory } from '#cloud/deployment-mode.adaptive.js';

/**
 * The `self-host` ceiling's display mode (adaptive app deployment mode charter D1, I10): pinned unfunded for the
 * page's life. No owner, no request.
 */
export const initialDeploymentMode: DeploymentModeSnapshot = { state: 'unfunded', basis: 'pinned' };

/** A pinned build has no owner: the runtime keeps its no-op `deployment` child. */
export const createDeploymentOwner: DeploymentOwnerFactory | undefined = undefined;
