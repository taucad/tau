/**
 * Public API of `@taucad/api-object-storage`: the S3 driver. The Nest module, signed file links,
 * namespace constants, storage accounting and the test-bucket guard have their own subpaths
 * (see package.json), so a process entry reaches only what it imports.
 */
export * from '#object-storage.service.js';
