import { resolve } from 'node:path';

import { loadPicogkKernelOptions } from '@taucad/picogk';

/** Resolve the prepared PicoGK/CoreCLR payload owned by the desktop app. */
export const picogkKernelOptions = (): ReturnType<typeof loadPicogkKernelOptions> => {
  const resourceRoot = process.env['TAU_PICOGK_RESOURCE_ROOT'];
  if (!resourceRoot) {
    throw new Error('The desktop shell did not supply PicoGK resources.');
  }
  return loadPicogkKernelOptions({ resourceRoot: resolve(resourceRoot) });
};
