import type { RootedFileSystem } from '@taucad/filesystem';

import type { PackageManifestCommit } from '#package-manifest.js';

/** Host-owned checked-write capability for manifest publication. @public */
export type PackageManifestAuthority = Pick<RootedFileSystem, 'writeFileChecked'>;

/**
 * Bind manifest publication to the existing filesystem authority's checked write.
 * Preserves authority errors, including potentially-applied failures; never emulates CAS with read/write.
 * @param input - The admitted rooted authority and operation cancellation signal.
 * @returns Atomic manifest commit callback for updatePackageManifest.
 * @public
 */
export const createPackageManifestCommit =
  (input: { readonly authority: PackageManifestAuthority; readonly signal: AbortSignal }): PackageManifestCommit =>
  async ({ expected, content }) => {
    input.signal.throwIfAborted();
    const result = await input.authority.writeFileChecked({
      path: 'package.json',
      data: content,
      preconditions: [{ path: 'package.json', expected: expected ?? null }],
      signal: input.signal,
    });
    return result.status !== 'conflict';
  };
