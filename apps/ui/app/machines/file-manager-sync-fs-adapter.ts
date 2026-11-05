import { joinRelativePath } from '@taucad/utils/path';

/** The listing calls a sync host asks of a rooted filesystem; the kind-carrying ones are optional. */
type DirectoryListingSource = {
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ type: 'file' | 'dir' }>;
  readdirEntries?: ((path: string) => Promise<ReadonlyArray<{ name: string; kind: 'file' | 'dir' }>>) | undefined;
};

/**
 * Return only directory names for the TypeScript sync host contract: one
 * kind-carrying listing where the filesystem has one, never a stat per child
 * or a content read (I3).
 */
export const listWorkspaceDirectories = async (fileSystem: DirectoryListingSource, path: string): Promise<string[]> => {
  if (fileSystem.readdirEntries !== undefined) {
    const entries = await fileSystem.readdirEntries(path);
    return entries.filter((entry) => entry.kind === 'dir').map((entry) => entry.name);
  }
  const names = await fileSystem.readdir(path);
  const entries = await Promise.all(
    names.map(async (name) => ({ name, stat: await fileSystem.stat(joinRelativePath(path, name)) })),
  );
  return entries.filter(({ stat }) => stat.type === 'dir').map(({ name }) => name);
};
