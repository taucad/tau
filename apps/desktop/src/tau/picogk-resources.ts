import { resolve } from 'node:path';

import { loadPicogkKernelOptions } from '@taucad/picogk';

/** Resolve the prepared PicoGK/CoreCLR payload owned by the desktop app. */
export const picogkKernelOptions = () => {
  const resourceRoot = process.env['TAU_PICOGK_RESOURCE_ROOT'];
  const trustFile = process.env['TAU_NATIVE_CODE_TRUST_FILE'];
  if (!resourceRoot || !trustFile) {
    throw new Error('The desktop shell did not supply PicoGK resources and project trust.');
  }
  return loadPicogkKernelOptions({ resourceRoot: resolve(resourceRoot), trustFile: resolve(trustFile) });
};
