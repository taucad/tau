import { joinRelativePath } from '@taucad/utils/path';

/** Return only directory names for the TypeScript sync host contract. */
export const listWorkspaceDirectories = async (
  fileSystem: { readdir(path: string): Promise<string[]>; stat(path: string): Promise<{ type: 'file' | 'dir' }> },
  path: string,
): Promise<string[]> => {
  const names = await fileSystem.readdir(path);
  const entries = await Promise.all(
    names.map(async (name) => ({ name, stat: await fileSystem.stat(joinRelativePath(path, name)) })),
  );
  return entries.filter(({ stat }) => stat.type === 'dir').map(({ name }) => name);
};
