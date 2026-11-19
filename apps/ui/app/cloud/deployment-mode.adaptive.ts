import { ENV } from '#environment.config.js';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { createDeploymentOwner as createOwner } from '#runtime/deployment.js';
import type { DeploymentOwnerLogic } from '#runtime/deployment.js';

/**
 * The `adaptive` ceiling's display mode (adaptive app deployment mode charter D2, I13): `unknown` on the server and
 * in the first client render, then whatever the runtime's `deployment` child reports for the origin of
 * `TAU_API_URL`. This is the only module that reaches the owner, so neither pinned build contains it (I10).
 */
export const initialDeploymentMode: DeploymentModeSnapshot = { state: 'unknown', problem: 'pending' };

/** What the composition hands the owner. @public */
export type DeploymentOwnerOptions = Readonly<{
  /** The runtime's clock, epoch milliseconds; `Date.now` by default. */
  now?: () => number;
}>;

/** Build the owner the runtime invokes as `deployment`. @public */
export type DeploymentOwnerFactory = (options: DeploymentOwnerOptions) => DeploymentOwnerLogic;

/** The adaptive owner over the page's API URL, fetch, `localStorage` and `online` event. */
export const createDeploymentOwner: DeploymentOwnerFactory | undefined = ({ now }) =>
  createOwner({ apiUrl: ENV.TAU_API_URL, ...(now === undefined ? {} : { now }) });
