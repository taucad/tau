import type { ChatSnapshot } from '@taucad/chat';
import type { FileContentMetadata, FileTreeEntry } from '@taucad/types';

type DirectoryTreeNode = {
  name: string;
  type: 'dir';
  size: number;
  children: Map<string, TreeNode>;
};

type FileTreeNode = {
  name: string;
  type: 'file';
  size: number;
} & FileContentMetadata;

type TreeNode = DirectoryTreeNode | FileTreeNode;

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function buildTree(entries: FileTreeEntry[]): DirectoryTreeNode {
  const root: DirectoryTreeNode = {
    name: '',
    type: 'dir',
    size: 0,
    children: new Map(),
  };

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part) {
        continue;
      }

      const isLast = index === parts.length - 1;

      if (!current.children.has(part)) {
        if (isLast && entry.type === 'file') {
          current.children.set(
            part,
            entry.contentKind === 'text'
              ? {
                  name: part,
                  type: 'file',
                  size: entry.size,
                  contentKind: 'text',
                  lineCount: entry.lineCount,
                }
              : {
                  name: part,
                  type: 'file',
                  size: entry.size,
                  contentKind: 'binary',
                },
          );
        } else {
          current.children.set(part, {
            name: part,
            type: 'dir',
            size: isLast ? entry.size : 0,
            children: new Map(),
          });
        }
      }

      const child = current.children.get(part);
      if (child?.type === 'dir') {
        current = child;
      }
    }
  }

  return root;
}

function formatLineCount(lineCount: number): string {
  return lineCount === 1 ? '1 line' : `${lineCount} lines`;
}

function formatFileMetadata(node: FileTreeNode): string {
  if (node.contentKind === 'binary') {
    return `binary, ${formatSize(node.size)}`;
  }
  return `${formatLineCount(node.lineCount)}, ${formatSize(node.size)}`;
}

function renderTree(node: DirectoryTreeNode, indent = ''): string {
  const lines: string[] = [];

  const sortedChildren = [...node.children.entries()].sort((a, b) => {
    const aIsDirectory = a[1].type === 'dir';
    const bIsDirectory = b[1].type === 'dir';
    if (aIsDirectory !== bIsDirectory) {
      return aIsDirectory ? -1 : 1;
    }

    return a[0].localeCompare(b[0]);
  });

  for (const [, child] of sortedChildren) {
    if (child.type === 'dir') {
      lines.push(`${indent}- ${child.name}/`, renderTree(child, indent + '  '));
    } else {
      lines.push(`${indent}- ${child.name} (${formatFileMetadata(child)})`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

function generateFileSystemSnapshot(entries: FileTreeEntry[], rootPath = '/project/'): string {
  if (entries.length === 0) {
    return `${rootPath}\n  (empty)`;
  }

  const tree = buildTree(entries);
  const treeContent = renderTree(tree);

  return `${rootPath}\n${treeContent}`;
}

export function buildSnapshotContextText(snapshot: ChatSnapshot): string | undefined {
  const contextParts: string[] = [];

  if (snapshot.activeFile) {
    contextParts.push(`<active_file>
The file currently being rendered by the CAD engine: ${snapshot.activeFile.path}
</active_file>`);
  }

  if (snapshot.openFiles && snapshot.openFiles.length > 0) {
    const fileList = snapshot.openFiles.map((file) => file.path).join(', ');
    contextParts.push(`<open_files>
Files currently open in the editor tabs: ${fileList}
</open_files>`);
  }

  if (snapshot.fileTree && snapshot.fileTree.length > 0) {
    const filesystemSnapshot = generateFileSystemSnapshot(snapshot.fileTree);
    contextParts.push(`<project_layout>
Below is a cached/partial snapshot of the current project's file structure. Runner tools such as test_model perform their own recursive project discovery and are not limited to this visible tree:

${filesystemSnapshot}
</project_layout>`);
  }

  if (contextParts.length === 0) {
    return undefined;
  }

  return `<system-reminder>
${contextParts.join('\n\n')}
</system-reminder>

`;
}
