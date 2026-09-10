/** Desktop runtime definitions served by one project-scoped kernel utility. */

import { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';

const nativeTrustFile = process.env['TAU_NATIVE_CODE_TRUST_FILE'];
if (!nativeTrustFile) {
  throw new Error('The desktop shell did not supply the native-code trust marker.');
}

export const runtime = createDesktopRuntime({ nativeTrustFile });
export const debugRuntime = createDesktopRuntime({ nativeTrustFile, withSourceMapping: true });
