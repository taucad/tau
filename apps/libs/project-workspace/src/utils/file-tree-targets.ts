export const fileTreeRootId = '';

export type FileTreeTargetData = {
  readonly isFolder: boolean;
};

export type FileTreeMoveEdit = {
  readonly source: string;
  readonly target: string;
};

export function joinFileTreePath(parentPath: string, childPath: string): string {
  const normalizedChild = childPath.replace(/^\/+/u, '');
  if (!parentPath) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return parentPath;
  }
  return `${parentPath}/${normalizedChild}`;
}

export function getFileTreeParentDirectory(path: string): string {
  const lastSlashIndex = path.lastIndexOf('/');
  return lastSlashIndex > 0 ? path.slice(0, lastSlashIndex) : '';
}

export function resolveFileTreeTargetDirectory(options: {
  readonly targetPath: string | undefined;
  readonly getTargetData: (path: string) => FileTreeTargetData | undefined;
  readonly rootId?: string;
}): string {
  const { targetPath } = options;
  const rootId = options.rootId ?? fileTreeRootId;
  if (!targetPath || targetPath === rootId) {
    return '';
  }

  const targetData = options.getTargetData(targetPath);
  if (targetData?.isFolder === true) {
    return targetPath;
  }

  return getFileTreeParentDirectory(targetPath);
}

export function createFileTreeMoveEdits(options: {
  readonly sourcePaths: readonly string[];
  readonly targetDirectory: string;
  readonly isReadOnlyPath: (path: string) => boolean;
}): FileTreeMoveEdit[] {
  const edits: FileTreeMoveEdit[] = [];
  for (const sourcePath of options.sourcePaths) {
    if (!sourcePath || options.isReadOnlyPath(sourcePath)) {
      continue;
    }

    const fileName = sourcePath.split('/').pop() ?? sourcePath;
    const targetPath = joinFileTreePath(options.targetDirectory, fileName);
    if (sourcePath === targetPath) {
      continue;
    }

    edits.push({ source: sourcePath, target: targetPath });
  }

  return edits;
}

export function areAllPathsAlreadyInDirectory(paths: readonly string[], targetDirectory: string): boolean {
  if (paths.length === 0) {
    return true;
  }

  return paths.every((path) => getFileTreeParentDirectory(path) === targetDirectory);
}
