import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { initialDeploymentMode } from '#cloud/deployment-mode.js';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { selectDeploymentMode } from '#runtime/app-runtime.js';
import type { AppRuntime } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';

/** Outside an `AppRuntimeProvider` the mode is the build's initial one, for the page's life. */
const noRuntime = {
  getSnapshot: () => undefined,
  subscribe: () => ({ unsubscribe: () => undefined }),
} as unknown as AppRuntime;

/**
 * The display mode of the page's API origin (adaptive app deployment mode charter D2): the pinned constant of a
 * `cloud` or `self-host` build, else what the runtime's `deployment` child last reported, `unknown` on the server and
 * in the first client render (I13). Never throws: outside an `AppRuntimeProvider` it is the build's initial mode.
 *
 * @returns The mode.
 * @public
 */
export const useDeploymentMode = (): DeploymentModeSnapshot => {
  const runtime = useOptionalAppRuntime();
  return useSelector(runtime ?? noRuntime, (snapshot) =>
    runtime === undefined ? initialDeploymentMode : selectDeploymentMode(snapshot),
  );
};

/**
 * Ask the page's API for its deployment answer again now (the Retry of a "can't check" state, I15). A no-op in a
 * pinned build and outside an `AppRuntimeProvider`.
 *
 * @returns The retry.
 * @public
 */
export const useRetryDeploymentMode = (): (() => void) => {
  const runtime = useOptionalAppRuntime();
  return useCallback(() => {
    runtime?.send({ type: 'deploymentRetried' });
  }, [runtime]);
};
