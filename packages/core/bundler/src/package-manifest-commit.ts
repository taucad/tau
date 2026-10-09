import type { RootedFileSystem } from '@taucad/filesystem';

/** Host-owned checked-write capability for package file publication. @public */
export type PackageManifestAuthority = Pick<RootedFileSystem, 'writeFileChecked'>;

/** One whole-file replacement and the bytes it, and any other file, must still hold. @public */
export type PackageManifestCommitInput = {
  readonly path: string;
  /** Current contents of `path`; undefined requires the file to be absent. */
  readonly expected: string | undefined;
  readonly content: string;
  /** Further files whose contents must be unchanged, for example the package.json a lock was resolved from. */
  readonly preconditions?: ReadonlyArray<{ readonly path: string; readonly expected: string | undefined }>;
};

/** Atomic host commit. A false result means a precondition no longer holds and nothing was written. @public */
export type PackageManifestCommit = (input: PackageManifestCommitInput) => Promise<boolean>;

/**
 * Bind package file publication to the existing filesystem authority's checked write.
 * Preserves authority errors, including potentially-applied failures; never emulates CAS with read/write.
 * @param input - The admitted rooted authority and operation cancellation signal.
 * @returns Atomic commit callback for installPackages.
 * @public
 */
export const createPackageManifestCommit =
  (input: { readonly authority: PackageManifestAuthority; readonly signal: AbortSignal }): PackageManifestCommit =>
  async ({ path, expected, content, preconditions = [] }) => {
    input.signal.throwIfAborted();
    const result = await input.authority.writeFileChecked({
      path,
      data: content,
      preconditions: [{ path, expected }, ...preconditions].map((condition) => ({
        path: condition.path,
        expected: condition.expected ?? null,
      })),
      signal: input.signal,
    });
    return result.status !== 'conflict';
  };
