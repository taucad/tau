import { resolve } from 'node:path';

import { loadPicogkKernelOptions } from '@taucad/picogk';

/** Resolve the prepared PicoGK/CoreCLR payload owned by the desktop app. */
export const picogkKernelOptions = (
  trustFile = process.env['TAU_NATIVE_CODE_TRUST_FILE'],
): ReturnType<typeof loadPicogkKernelOptions> => {
  const resourceRoot = process.env['TAU_PICOGK_RESOURCE_ROOT'];
  if (!resourceRoot || !trustFile) {
    throw new Error('The desktop shell did not supply PicoGK resources and project trust.');
  }
  return loadPicogkKernelOptions({ resourceRoot: resolve(resourceRoot), trustFile: resolve(trustFile) });
};
