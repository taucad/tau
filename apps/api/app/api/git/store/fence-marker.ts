import type { Manifest } from '#api/git/store/manifest.js';

/**
 * The `committedBy` of a fence commit (Hosted Remote Storage DW1, W10 R3).
 * The manifest decoder already accepts any string here, so a fence adds no
 * manifest format: it is a successor with the same refs and packs that only a
 * migration or a restore writes, and it appears only while one runs.
 */
export const migrationFenceCommitter = 'migration-fence';

/**
 * Whether `manifest` is the one a fence wrote. A writer that hydrated a fence
 * is one a migration has already frozen out, unless the freeze is gone; the
 * route guard reads the route past its cache for exactly these.
 *
 * @param manifest - The manifest a lease was hydrated from.
 * @returns True when the latest commit is a fence.
 */
export const isFenceManifest = (manifest: Manifest | undefined): boolean =>
  manifest?.committedBy === migrationFenceCommitter;
