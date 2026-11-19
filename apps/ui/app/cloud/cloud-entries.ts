import { createCloudLoader } from '#cloud/cloud-loader.js';

/**
 * The Cloud chunk's one loader (adaptive app deployment mode charter D6, I8): the only module that names a Cloud
 * `import()`. Everything funded-only (the bridge that fills the port, and the surfaces as W5 moves them) is reached
 * through it. Part of Core; the chunk it loads is not.
 */
export const cloudSurfaces = createCloudLoader({ importer: async () => import('#cloud/cloud-surfaces.lazy.js') });
