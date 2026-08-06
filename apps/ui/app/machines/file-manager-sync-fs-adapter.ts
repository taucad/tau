import type { WorkspaceFileService } from '@taucad/filesystem';

/** Return only directory names for the TypeScript sync host contract. */
export const listWorkspaceDirectories = async (
  fileService: Pick<WorkspaceFileService, 'readDirectory'>,
  path: string,
): Promise<string[]> => {
  const nodes = await fileService.readDirectory(path);
  return nodes.filter((node) => node.children !== undefined).map((node) => node.name);
};
