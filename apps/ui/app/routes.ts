import { flatRoutes } from '@react-router/fs-routes';
// oxlint-disable-next-line eslint/no-restricted-imports -- Route/build configuration runs before app aliases are installed.
import { isObservabilityHarnessBuild } from './lib/observability-harness-gate.js';
// oxlint-disable-next-line eslint/no-restricted-imports -- build configuration lives one directory above the app alias root.
import { resolveTauDeploymentCeiling } from '../build-environment.js';

export default flatRoutes({
  // Co-located route tests (e.g. `health.live.test.ts`) live next to the
  // route module they exercise. Without explicit ignore globs, flatRoutes
  // would treat `<segment>.test.ts(x)` as a real route, react-router's type
  // generator would emit a matching `+types/<segment>.test.ts(x)` file under
  // `.react-router/types/`, and vitest would then discover those generated
  // .test.ts files and fail with "No test suite found in file ...".
  ignoredRouteFiles: [
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    ...(isObservabilityHarnessBuild(process.env) ? [] : ['**/[[]__debug].observability/**']),
    // oxlint-disable-next-line eslint/dot-notation -- ProcessEnv is index-signature-only with noPropertyAccessFromIndexSignature.
    /* `/usage` is a `cloud` web route only: the adaptive web build omits it (adaptive app deployment mode D8). */
    ...(resolveTauDeploymentCeiling(process.env['TAU_CLOUD_ENABLED']) === 'cloud' ? [] : ['**/usage/**']),
  ],
});
