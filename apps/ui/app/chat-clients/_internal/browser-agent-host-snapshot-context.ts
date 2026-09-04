import type { ChatSnapshot } from '@taucad/chat';

type FileTreeEntry = NonNullable<ChatSnapshot['fileTree']>[number];

type DirectoryNode = {
  readonly type: 'dir';
  readonly children: Map<string, DirectoryNode | { readonly type: 'file' }>;
};

const renderFileTree = (entries: readonly FileTreeEntry[]): string => {
  const root: DirectoryNode = { type: 'dir', children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let current = root;
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(
          part,
          last && entry.type === 'file' ? { type: 'file' } : { type: 'dir', children: new Map() },
        );
      }
      const child = current.children.get(part);
      if (child?.type === 'dir') {
        current = child;
      }
    }
  }
  const render = (node: DirectoryNode, indent = ''): string =>
    [...node.children.entries()]
      .sort(([leftName, left], [rightName, right]) => {
        if (left.type !== right.type) {
          return left.type === 'dir' ? -1 : 1;
        }
        return leftName.localeCompare(rightName);
      })
      .flatMap(([name, child]) =>
        child.type === 'dir' ? [`${indent}- ${name}/`, render(child, `${indent}  `)] : [`${indent}- ${name}`],
      )
      .filter(Boolean)
      .join('\n');
  return `/project/\n${entries.length === 0 ? '  (empty)' : render(root)}`;
};

/** Format the browser host's ephemeral editor snapshot like the API execution path. */
export const buildBrowserAgentHostSnapshotContext = (snapshot: ChatSnapshot): string | undefined => {
  const parts: string[] = [];
  if (snapshot.activeFile) {
    parts.push(`<active_file>
The file currently being rendered by the CAD engine: ${snapshot.activeFile.path}
</active_file>`);
  }
  if (snapshot.openFiles && snapshot.openFiles.length > 0) {
    parts.push(`<open_files>
Files currently open in the editor tabs: ${snapshot.openFiles.map((file) => file.path).join(', ')}
</open_files>`);
  }
  if (snapshot.fileTree && snapshot.fileTree.length > 0) {
    parts.push(`<project_layout>
Below is a cached/partial snapshot of the current project's file structure. Runner tools such as test_model perform their own recursive project discovery and are not limited to this visible tree:

${renderFileTree(snapshot.fileTree)}
</project_layout>`);
  }
  return parts.length === 0
    ? undefined
    : `<system-reminder>
${parts.join('\n\n')}
</system-reminder>

`;
};
