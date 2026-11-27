import { selectRuntimeSafeMode } from '#runtime/app-runtime.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';

/**
 * Whether this page load started in safe mode (D0), as the app runtime recorded it. Outside an `AppRuntimeProvider`
 * it is not.
 *
 * @returns Whether this page load is in safe mode.
 * @public
 */
export const useRuntimeSafeMode = (): boolean => {
  const runtime = useOptionalAppRuntime();
  return runtime !== undefined && selectRuntimeSafeMode(runtime);
};
