/**
 * Filesystem Backend Constants
 *
 * Defines available filesystem backends and their metadata.
 */

/**
 * Available filesystem backend names.
 *
 * @public
 */
export const filesystemBackends = ['indexeddb', 'opfs', 'webaccess', 'memory', 'node'] as const;

/**
 * Filesystem backend metadata.
 * Product-level location vocabulary. The two browser engines intentionally
 * share one label because they implement the same Home workspace.
 *
 * @public
 */
export const filesystemBackendMeta = {
  indexeddb: {
    label: 'Home',
    description: 'In this browser.',
  },
  opfs: {
    label: 'Home',
    description: 'In this browser.',
  },
  webaccess: {
    label: 'Connected workspace',
    description: 'On your disk.',
  },
  memory: {
    label: 'Memory',
    description: 'Temporary in-memory storage. Data is cleared on page reload.',
  },
  node: {
    label: 'This computer',
    description: 'On your disk.',
  },
} as const satisfies Record<(typeof filesystemBackends)[number], { label: string; description: string }>;
